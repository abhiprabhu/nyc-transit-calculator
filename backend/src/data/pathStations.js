// Station and route id mappings for the PATH GTFS-Realtime feed at
// https://path.transitdata.nyc/gtfsrt.
//
// This feed (github.com/jamespfennell/path-train-gtfs-realtime) is built
// directly from the Port Authority's internal real-time API, not from an
// official PATH GTFS static feed — despite what path-realtime-feature-brief.md
// assumes, its stop_id/route_id values do NOT join against any published
// static GTFS download, and PATH has no stations/edges in this app's own
// Postgres graph (see gtfsLoader.js, which only ingests subway). So there's
// nothing to look these ids up against at request time; they're hardcoded
// here as a snapshot of that project's gtfsmapping.go, verified against a
// live sample of the feed on 2026-09-19.
export const PATH_STATIONS = [
  { stopId: "26733", name: "Newark" },
  { stopId: "26729", name: "Harrison" },
  { stopId: "26731", name: "Journal Square" },
  { stopId: "26728", name: "Grove Street" },
  { stopId: "26727", name: "Exchange Place" },
  { stopId: "26734", name: "World Trade Center" },
  { stopId: "26730", name: "Hoboken" },
  { stopId: "26726", name: "Christopher Street" },
  { stopId: "26725", name: "9th Street" },
  { stopId: "26722", name: "14th Street" },
  { stopId: "26723", name: "23rd Street" },
  { stopId: "26724", name: "33rd Street" },
  { stopId: "26732", name: "Newport" },
];

export const PATH_ROUTE_NAMES = {
  859: "Hoboken – 33rd St",
  860: "Hoboken – World Trade Center",
  861: "Journal Square – 33rd St",
  862: "Newark – World Trade Center",
  1024: "Journal Square – 33rd St (via Hoboken)",
};

export const PATH_STOP_IDS = new Set(PATH_STATIONS.map((s) => s.stopId));
