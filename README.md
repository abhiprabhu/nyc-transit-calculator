# NYC Transit Cost Calculator

Find the cheapest/fastest NYC transit route(s) between two points, using MTA GTFS data and OMNY fare rules.

## Status

**Phase 8 (polish + deploy prep) complete.** Stations and edges are loaded into Postgres from the live MTA subway GTFS static feed (phase 2). `backend/src/services/graph.js` builds an in-memory graph from that data and finds shortest-time paths with Dijkstra, including transfers between lines (phase 3). `backend/src/services/fareRules.js` computes fare, free transfers, and the weekly OMNY cap as a pure, unit-tested function (phase 4). `GET /route?from=&to=` (phase 5) wires the two together. `GET /stations?q=` (phase 6) backs debounced autocomplete in the React frontend (phase 7), which shows ranked route cards with fare/transfer breakdowns.

Phase 8 added loading skeletons, a retryable error state, mobile-responsive layout, and the config needed to deploy the frontend to Vercel and the backend + Postgres to Render/Railway (see Deploy below).

**Phase 9 (stretch) in progress.** Weekly OMNY cap tracking is wired up end to end: `frontend/src/lib/riderHistory.js` keeps a session-scoped rider history in `sessionStorage`, sent as `riderHistory` on every `/route` call; a status bar shows rides remaining this week and a "Reset week" control, and each route card has an "I took this route" button that logs its paid legs (`fare.breakdown` entries with `capApplied: false`) toward the cap. Map visualization and real-time arrivals are still not started — see `nyc-transit-calculator-brief.md` for the full build order.

Run `npm run test:graph` (from `backend/`) to sanity-check the graph engine against a few hardcoded station id pairs without going through the API. Run `npm test` (from `backend/`) for the fare rules unit tests.

### `/route` API

```
GET /route?from=<stationId>&to=<stationId>&riderHistory=<json array, optional>
```

- `from` / `to` are GTFS station ids (see `stations` table — autocomplete to look these up by name isn't built yet, phase 6).
- `riderHistory` is an optional JSON-encoded array of `{ timestampSeconds }` for prior paid rides this week, used to evaluate the OMNY weekly cap. Per the brief, this is tracked client-side rather than persisted server-side in v1 — the frontend sends its `sessionStorage`-backed history (see `frontend/src/lib/riderHistory.js`) on every request; omitting it assumes a single, uncapped trip.
- The graph only optimizes for travel time (no fare-aware path search yet), so the response currently has one computed route labeled with both `"fastest"` and `"cheapest"` — see the comment in `backend/src/routes/route.js`.

```bash
curl "http://localhost:3001/route?from=127&to=635"
```

Known simplifications from this phase (see comments in `backend/src/services/gtfsLoader.js` for detail):
- Subway only — the MTA bus GTFS feed is not ingested yet.
- A "station" is a GTFS parent station; directional platform stops are collapsed into it.
- Edge travel time is the average scheduled time across all trips in the static feed, not live/historical run data.
- Borough is derived from lat/lon bounding boxes and may be wrong for a handful of stations near borough borders. It's informational only.

## Stack

- Frontend: React + Vite + Tailwind
- Backend: Node.js + Express
- Database: Postgres (`stations`, `edges` — see `backend/src/db/schema.sql`)
- Cache: Redis / in-process (not wired up yet)

## Running locally

Requires Node.js (LTS) and npm.

### Backend

```bash
cd backend
npm install   # already run during scaffold
npm run dev   # http://localhost:3001
```

Health check: `curl http://localhost:3001/health`

### Database (GTFS ingestion)

Requires a local Postgres instance and a database created for this project (e.g. `createdb nyc_transit`). Set `DATABASE_URL` in `backend/.env` (see `backend/.env.example`).

```bash
cd backend
npm run db:migrate   # creates stations + edges tables
npm run ingest        # downloads the MTA subway GTFS feed and loads it in (~1-2 min)
```

### Frontend

```bash
cd frontend
npm install   # already run during scaffold
npm run dev   # http://localhost:5173
```

The frontend dev server proxies `/api/*` to the backend at `http://localhost:3001` (see `vite.config.js`), so requests reach the Express server without CORS issues in dev.

## Deploy

The frontend and backend deploy separately and talk over CORS (no shared dev proxy in production).

### Backend — Render or Railway

Both auto-detect this as a Node app (`backend/package.json` has `start`/`build`-equivalent scripts). `render.yaml` at the repo root is a ready-to-use [Render Blueprint](https://render.com/docs/blueprint-spec) that provisions a free Postgres instance and web service together:

1. On Render, "New +" → "Blueprint", point it at this repo. It creates the `nyc-transit-api` web service and `nyc-transit-db` database from `render.yaml`.
2. Once the DB is up, run the migration and GTFS ingest once against it (e.g. from your machine with `DATABASE_URL` set to the Render DB's external connection string): `npm run db:migrate && npm run ingest` from `backend/`.
3. Set `CORS_ORIGIN` on the web service to your deployed frontend's URL (Render prompts for this since `render.yaml` marks it `sync: false`).
4. Note the web service's URL (e.g. `https://nyc-transit-api.onrender.com`) — the frontend needs it as `VITE_API_URL`.

Railway works the same way without a blueprint: create a Postgres plugin + a service from this repo with root directory `backend`, set `DATABASE_URL` (Railway injects this automatically for linked Postgres), `PGSSL=true`, and `CORS_ORIGIN`, then run the same migrate/ingest commands via `railway run`.

### Frontend — Vercel

1. Import this repo into Vercel with root directory `frontend` (Vercel auto-detects the Vite framework preset).
2. Set the `VITE_API_URL` environment variable to the deployed backend URL from above (see `frontend/.env.example`).
3. Deploy. The build (`vite build`) bakes `VITE_API_URL` into the client bundle, so `frontend/src/lib/api.js` calls the backend directly instead of the dev-only `/api` proxy.

## Folder structure

See `nyc-transit-calculator-brief.md` for the full target structure. Files not yet implemented contain a `TODO` comment noting which build phase they belong to.
