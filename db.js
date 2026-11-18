// ─────────────────────────────────────────────────────────
// db.js  –  PostgreSQL connection pool (works with Supabase)
// ─────────────────────────────────────────────────────────
// WHY a pool?  Opening a fresh DB connection for every request is slow.
// A pool keeps a handful of connections alive and reuses them.
// Think of it like a carpool lane — shared rides, less traffic.
//
// WHY does Supabase "just work" with the pg library?
// Because Supabase IS PostgreSQL. It exposes a standard Postgres
// connection string. Any tool that speaks the Postgres wire protocol
// connects seamlessly — that's the power of building on standards.
// ─────────────────────────────────────────────────────────

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase (and Render) require SSL for remote connections.
  // Locally you'd set this to false, but Supabase always needs it.
  ssl: { rejectUnauthorized: false },
});

module.exports = pool;
