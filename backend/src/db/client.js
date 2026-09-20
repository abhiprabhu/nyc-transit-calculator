import pg from "pg";

const { Pool } = pg;

// Hosted Postgres (Render, Railway) requires SSL for external connections
// but typically self-signed, hence rejectUnauthorized: false. Local dev
// Postgres has no SSL, so this only kicks in when the connection string
// asks for it or PGSSL is set explicitly.
const useSSL = process.env.PGSSL === "true" || /sslmode=require/.test(process.env.DATABASE_URL ?? "");

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});
