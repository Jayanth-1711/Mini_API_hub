'use strict';

/**
 * Mini API Hub
 *
 * Flow: Frontend -> Express API -> OpenWeather (external) -> PostgreSQL (Supabase)
 *
 * Endpoints
 *   GET    /api/weather        List saved records (newest first)
 *   POST   /api/weather/fetch  Fetch live weather for a city and save it
 *   DELETE /api/weather/:id    Delete a record
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const PORT = process.env.PORT || 3000;
const OPENWEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const EXTERNAL_TIMEOUT_MS = 8000;
const MAX_CITY_LENGTH = 100;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const app = express();

/* ---------- Helpers ---------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Forwards rejected promises to the error middleware.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Database bootstrap ---------- */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather (
      id          SERIAL PRIMARY KEY,
      city        VARCHAR(100) NOT NULL,
      country     VARCHAR(10),
      temp_c      NUMERIC(5,2),
      feels_like  NUMERIC(5,2),
      humidity    INTEGER,
      description VARCHAR(255),
      fetched_at  TIMESTAMP DEFAULT NOW()
    );
  `);
}

// Serverless has no "server start" hook, so the schema is created lazily
// on the first API request of each cold start. A failure is not cached,
// so the next request retries.
let dbReady = null;
function ensureDB() {
  if (!dbReady) {
    dbReady = initDB().catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

/* ---------- Middleware ---------- */

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  '/api',
  asyncHandler(async (req, res, next) => {
    try {
      await ensureDB();
    } catch (err) {
      console.error('DB init failed:', err.message);
      throw new HttpError(503, 'Database is unavailable. Please try again later.');
    }
    next();
  })
);

/* ---------- External API ---------- */

async function fetchWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new HttpError(503, 'Weather service is not configured.');
  }

  const query = new URLSearchParams({ q: city, units: 'metric', appid: apiKey });

  let response;
  try {
    response = await fetch(`${OPENWEATHER_URL}?${query}`, {
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(502, 'Weather service is unreachable.');
  }

  if (response.status === 404) {
    throw new HttpError(404, `City "${city}" was not found.`);
  }
  if (!response.ok) {
    throw new HttpError(502, 'Weather service returned an error.');
  }

  const raw = await response.json();

  // Keep only the fields we store (the raw payload has ~30).
  return {
    city: raw.name,
    country: raw.sys?.country ?? null,
    temp_c: raw.main.temp,
    feels_like: raw.main.feels_like,
    humidity: raw.main.humidity,
    description: raw.weather?.[0]?.description ?? null,
  };
}

/* ---------- Routes ---------- */

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const requested = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { rows } = await pool.query(
      'SELECT * FROM weather ORDER BY fetched_at DESC LIMIT $1',
      [limit]
    );

    res.json({ success: true, count: rows.length, data: rows });
  })
);

router.post(
  '/fetch',
  asyncHandler(async (req, res) => {
    const city = typeof req.body?.city === 'string' ? req.body.city.trim() : '';

    if (!city || city.length > MAX_CITY_LENGTH) {
      throw new HttpError(
        400,
        `"city" is required and must be 1-${MAX_CITY_LENGTH} characters.`
      );
    }

    const w = await fetchWeather(city);

    const { rows } = await pool.query(
      `INSERT INTO weather (city, country, temp_c, feels_like, humidity, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [w.city, w.country, w.temp_c, w.feels_like, w.humidity, w.description]
    );

    res.status(201).json({
      success: true,
      message: `Weather for ${w.city} saved.`,
      data: rows[0],
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(id)) {
      throw new HttpError(400, 'Invalid ID. Must be a positive integer.');
    }

    const { rowCount } = await pool.query('DELETE FROM weather WHERE id = $1', [id]);

    if (rowCount === 0) {
      throw new HttpError(404, `No record found with id ${id}.`);
    }

    res.json({ success: true, message: `Record ${id} deleted.` });
  })
);

app.use('/api/weather', router);

/* ---------- Health check ---------- */

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

/* ---------- Error handling ---------- */

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found.' });
});

// Central handler: known errors keep their message, unknown ones are
// logged in full and returned as a generic 500 (no internals leaked).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Malformed JSON body.' });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }

  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

/* ---------- Start ---------- */

// Local dev only (`node server.js`). On Vercel the exported app is invoked
// per request, so it must not call listen().
if (require.main === module) {
  app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
}

module.exports = app;