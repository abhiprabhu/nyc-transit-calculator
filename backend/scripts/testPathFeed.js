// Standalone smoke test for the PATH GTFS-Realtime feed (build order step 1
// in path-realtime-feature-brief.md). Fetches the raw protobuf, decodes it
// with gtfs-realtime-bindings, and logs the next few arrivals for one
// hardcoded station stop_id — just to prove the parsing works before any
// service/API/frontend code gets built on top of it.
//
// Known feed quirks (see brief): each entity is a dummy trip with exactly
// one stopTimeUpdate (no continuity across stations, no platform detail),
// and there's no scheduled time to diff against, so a real delaySeconds
// isn't derivable here — that needs the static GTFS join, done in a later step.
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const PATH_FEED_URL = "https://path.transitdata.nyc/gtfsrt";

// "26733" is a real PATH stop_id observed live in the feed (found by logging
// distinct stopTimeUpdate.stopId values from a sample response). Swap this
// once the PATH static GTFS stops.txt is ingested and station names/ids are
// available to pick from directly.
const STATION_STOP_ID = "26733";

const MAX_ARRIVALS = 5;
const FETCH_TIMEOUT_MS = 8_000;

function formatArrival(arrival, nowSeconds) {
  const secondsAway = arrival.arrivalTimestamp - nowSeconds;
  const minutesAway = Math.round(secondsAway / 60);
  const arrivalTime = new Date(arrival.arrivalTimestamp * 1000).toLocaleTimeString();
  return `  route ${arrival.routeId}  ->  ${arrivalTime}  (${minutesAway} min)`;
}

async function main() {
  const res = await fetch(PATH_FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`PATH feed returned HTTP ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
  console.log(`Fetched ${message.entity.length} entities from PATH feed\n`);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const arrivals = [];

  for (const entity of message.entity) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate) continue;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate || []) {
      if (stopTimeUpdate.stopId !== STATION_STOP_ID) continue;
      const arrivalTime = stopTimeUpdate.arrival?.time;
      if (arrivalTime == null) continue;

      const arrivalTimestamp = Number(arrivalTime);
      if (arrivalTimestamp < nowSeconds) continue;

      arrivals.push({
        routeId: tripUpdate.trip?.routeId ?? "unknown",
        arrivalTimestamp,
      });
    }
  }

  arrivals.sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp);

  console.log(`Next arrivals at stop_id ${STATION_STOP_ID}:`);
  if (arrivals.length === 0) {
    console.log("  (none in the current feed snapshot)");
  } else {
    for (const arrival of arrivals.slice(0, MAX_ARRIVALS)) {
      console.log(formatArrival(arrival, nowSeconds));
    }
  }
}

main().catch((err) => {
  console.error("Failed to fetch/parse PATH feed:", err.message);
  process.exit(1);
});
