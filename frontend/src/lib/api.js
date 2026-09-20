// Centralizes the API base URL so the app works both in local dev (proxied
// through Vite to localhost:3001, see vite.config.js) and in production,
// where the frontend (Vercel) and backend (Render/Railway) are on different
// origins and there's no dev proxy. Set VITE_API_URL to the deployed
// backend's URL (e.g. https://nyc-transit-api.onrender.com) at build time.
export const API_BASE = import.meta.env.VITE_API_URL || '/api'
