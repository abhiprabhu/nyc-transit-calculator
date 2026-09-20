-- Stations + edges graph, populated by the GTFS ingestion script
-- (src/services/gtfsLoader.js). See that file for what "station" and
-- "edge" mean here relative to the raw GTFS feed.

CREATE TABLE IF NOT EXISTS stations (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  lat     DOUBLE PRECISION NOT NULL,
  lon     DOUBLE PRECISION NOT NULL,
  borough TEXT
);

CREATE INDEX IF NOT EXISTS idx_stations_name ON stations (name);

CREATE TABLE IF NOT EXISTS edges (
  id                  SERIAL PRIMARY KEY,
  from_station_id     TEXT NOT NULL REFERENCES stations (id),
  to_station_id       TEXT NOT NULL REFERENCES stations (id),
  mode                TEXT NOT NULL, -- 'subway' | 'transfer'
  line                TEXT,          -- GTFS route_id; null for transfer edges
  travel_time_seconds INTEGER NOT NULL,
  headsign            TEXT,          -- GTFS trip_headsign riders see on the train/platform; null for transfer edges
  UNIQUE (from_station_id, to_station_id, mode, line)
);

-- Added after the initial release — ADD COLUMN IF NOT EXISTS so re-running
-- this migration against an already-ingested database still picks it up.
ALTER TABLE edges ADD COLUMN IF NOT EXISTS headsign TEXT;

CREATE INDEX IF NOT EXISTS idx_edges_from ON edges (from_station_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges (to_station_id);

-- Directional platform stop ids (e.g. "127N"/"127S") collapsed out of the
-- `stations` table (see gtfsLoader.js#parseStops). Kept separately because
-- GTFS-realtime trip updates key stop_time_update.stop_id by platform, not
-- by parent station, so real-time arrivals (phase 9) needs this mapping to
-- filter a feed down to one station.
CREATE TABLE IF NOT EXISTS station_platforms (
  stop_id    TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations (id),
  direction  TEXT -- 'N' | 'S' | null, taken from the stop_id's GTFS suffix
);

CREATE INDEX IF NOT EXISTS idx_station_platforms_station ON station_platforms (station_id);
