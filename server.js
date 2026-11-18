// ─────────────────────────────────────────────────────────
// server.js  –  The heart of Mini API Hub
// ─────────────────────────────────────────────────────────
//
// INTEGRATION MAP (read this first!):
//
//   ┌──────────────┐  fetch   ┌──────────────────┐
//   │  OpenWeather  │ ──────► │  This Server     │
//   │  (public API) │         │  (Express + Node) │
//   └──────────────┘         └───────┬───────────┘
//                                    │ pg pool
//                              ┌─────▼─────┐
//                              │ PostgreSQL │
//                              └─────┬─────┘
//                                    │
//                              ┌─────▼─────┐
//                              │  Frontend  │
//                              │ (HTML/JS)  │
//                              └───────────┘
//
// 3 own endpoints:
//   GET    /api/weather          → list saved weather records
//   POST   /api/weather/fetch    → fetch from OpenWeather, clean, save
//   DELETE /api/weather/:id      → delete a record by id
// ─────────────────────────────────────────────────────────

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const pool    = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors());                        // allow cross-origin (useful later)
app.use(express.json());                // parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));  // serve frontend

// ── Bootstrap: create table if it doesn't exist ──────────
// This runs once when the server starts. It's a simple migration.
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather (
      id          SERIAL PRIMARY KEY,
      city        VARCHAR(100)  NOT NULL,
      country     VARCHAR(10),
      temp_c      NUMERIC(5,2),
      feels_like  NUMERIC(5,2),
      humidity    INTEGER,
      description VARCHAR(255),
      fetched_at  TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅  DB table "weather" is ready');
}

// ─────────────────────────────────────────────────────────
// ENDPOINT 1  –  GET /api/weather
// Returns all saved weather records.
// ─────────────────────────────────────────────────────────
app.get('/api/weather', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM weather ORDER BY fetched_at DESC'
    );
    // Good practice: always tell the client what shape the data is in.
    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('GET /api/weather error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Could not retrieve weather data. Try again later.',
    });
  }
});

// ─────────────────────────────────────────────────────────
// ENDPOINT 2  –  POST /api/weather/fetch
// Fetches LIVE data from OpenWeatherMap, cleans it, saves to DB.
//
// Body: { "city": "London" }
//
// THIS is the integration point you should study carefully:
//   1. We receive a request from OUR frontend.
//   2. We call an EXTERNAL API (OpenWeather).
//   3. We CLEAN the JSON (pick only the fields we need).
//   4. We INSERT the cleaned data into PostgreSQL.
//   5. We respond to our frontend with the saved record.
// ─────────────────────────────────────────────────────────
app.post('/api/weather/fetch', async (req, res) => {
  const { city } = req.body;

  // ── Validation ──
  if (!city || typeof city !== 'string' || city.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid "city" in the request body.',
    });
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey || apiKey === 'YOUR_KEY_HERE') {
    return res.status(503).json({
      success: false,
      error: 'Weather API key not configured on the server.',
    });
  }

  try {
    // ── Step 1: Fetch from public API ──
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city.trim())}&units=metric&appid=${apiKey}`;
    const response = await fetch(url);         // Node 18+ has global fetch
    const raw = await response.json();

    if (raw.cod !== 200) {
      return res.status(404).json({
        success: false,
        error: `City "${city}" not found on OpenWeatherMap.`,
      });
    }

    // ── Step 2: Clean the JSON ──
    // The raw response has ~30 fields. We only keep what matters.
    const cleaned = {
      city:        raw.name,
      country:     raw.sys.country,
      temp_c:      raw.main.temp,
      feels_like:  raw.main.feels_like,
      humidity:    raw.main.humidity,
      description: raw.weather[0].description,
    };

    // ── Step 3: Save to PostgreSQL ──
    const { rows } = await pool.query(
      `INSERT INTO weather (city, country, temp_c, feels_like, humidity, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [cleaned.city, cleaned.country, cleaned.temp_c,
       cleaned.feels_like, cleaned.humidity, cleaned.description]
    );

    // ── Step 4: Respond ──
    return res.status(201).json({
      success: true,
      message: `Weather for ${cleaned.city} saved!`,
      data: rows[0],
    });

  } catch (err) {
    console.error('POST /api/weather/fetch error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch or save weather data.',
    });
  }
});

// ─────────────────────────────────────────────────────────
// ENDPOINT 3  –  DELETE /api/weather/:id
// Deletes a weather record by its ID.
// ─────────────────────────────────────────────────────────
app.delete('/api/weather/:id', async (req, res) => {
  const { id } = req.params;

  // Validate that id is a number
  if (isNaN(id) || Number(id) < 1) {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID. Must be a positive integer.',
    });
  }

  try {
    const { rowCount } = await pool.query(
      'DELETE FROM weather WHERE id = $1', [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: `No weather record found with id ${id}.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Record ${id} deleted.`,
    });

  } catch (err) {
    console.error('DELETE /api/weather/:id error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Could not delete the record. Try again later.',
    });
  }
});

// ── Start ────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀  Mini API Hub running → https://mini-api-hub-v1.vercel.app`);
    });
  })
  .catch((err) => {
    console.error('❌  DB init failed:', err.message);
    process.exit(1);
  });

module.exports =  app 