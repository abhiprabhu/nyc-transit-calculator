// Fare calculation: base fare, free transfers, weekly OMNY cap.
//
// calculateFare is a pure function (no DB/network access) so it's cheap
// to unit test — see fareRules.test.js. Wiring it up to a real clock and
// a persisted rider history happens in the /route handler (phase 5); the
// brief allows riderHistory to start out sourced client-side (session
// storage) or stubbed to [] ("assume single trip" mode) for v1.

// Base subway / local-bus fare (OMNY or MetroCard). MTA fares change
// periodically — confirm against https://new.mta.info/fares before
// relying on this in production.
export const BASE_FARE_CENTS = 300;

// A transfer between subway/bus is free if the next swipe happens within
// this many seconds of the first swipe in the fare leg.
export const FREE_TRANSFER_WINDOW_SECONDS = 2 * 60 * 60;

// OMNY weekly fare cap: once a rider has this many paid rides inside a
// rolling window, remaining rides in that window are free.
export const WEEKLY_CAP_RIDES = 12;
export const WEEKLY_CAP_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * Splits one planned journey's segments into fare "legs" — runs of
 * segments covered by a single swipe. A new leg starts whenever:
 *  - continuing the current leg would cross the 2-hour free-transfer
 *    window, or
 *  - the next segment would land back on the leg's own starting
 *    station (MTA disallows a free transfer that loops back through
 *    the same entry point).
 *
 * Segment timing comes only from travelTimeSeconds (no wall-clock data
 * from the graph engine), so this is an approximation of swipe times,
 * not a record of them.
 */
function splitIntoFareLegs(rideSegments) {
  const legs = [];
  let currentLeg = [];
  let legStartStationId = null;
  let legElapsedSeconds = 0;

  for (const segment of rideSegments) {
    const startingNewLeg =
      currentLeg.length === 0 ||
      legElapsedSeconds + segment.travelTimeSeconds > FREE_TRANSFER_WINDOW_SECONDS ||
      segment.toStationId === legStartStationId;

    if (startingNewLeg && currentLeg.length > 0) {
      legs.push(currentLeg);
      currentLeg = [];
    }

    if (currentLeg.length === 0) {
      legStartStationId = segment.fromStationId;
      legElapsedSeconds = 0;
    }

    currentLeg.push(segment);
    legElapsedSeconds += segment.travelTimeSeconds;
  }

  if (currentLeg.length > 0) legs.push(currentLeg);
  return legs;
}

function countRidesInWindow(events, referenceTimestampSeconds) {
  const windowStart = referenceTimestampSeconds - WEEKLY_CAP_WINDOW_SECONDS;
  return events.filter(
    (e) =>
      e.timestampSeconds > windowStart &&
      e.timestampSeconds <= referenceTimestampSeconds,
  ).length;
}

/**
 * @param {Array<{fromStationId: string, toStationId: string, mode: string, line: string, travelTimeSeconds: number}>} rideSegments
 *   Segments of ONE planned journey, in order, as returned by
 *   services/graph.js#shortestPath.
 * @param {Array<{timestampSeconds: number}>} [riderHistory]
 *   Prior PAID fare events for this rider (free-transfer legs should
 *   not be included) — used to evaluate the weekly cap.
 * @param {Object} [options]
 * @param {number} [options.tripStartTimestamp] - unix seconds the rider
 *   taps in for the first segment. Defaults to now.
 * @returns {{ fare: number, fareCents: number, breakdown: object[], capApplied: boolean }}
 */
export function calculateFare(rideSegments, riderHistory = [], options = {}) {
  if (!Array.isArray(rideSegments) || rideSegments.length === 0) {
    throw new Error("calculateFare requires at least one ride segment");
  }

  const tripStartTimestamp =
    options.tripStartTimestamp ?? Math.floor(Date.now() / 1000);

  const legs = splitIntoFareLegs(rideSegments);

  const breakdown = [];
  const paidEventsThisTrip = [];
  let fareCents = 0;
  let capApplied = false;
  let elapsedFromTripStart = 0;

  for (const leg of legs) {
    const legTimestamp = tripStartTimestamp + elapsedFromTripStart;
    const legTravelSeconds = leg.reduce((sum, s) => sum + s.travelTimeSeconds, 0);

    const ridesInWindow = countRidesInWindow(
      [...riderHistory, ...paidEventsThisTrip],
      legTimestamp,
    );
    const isCapped = ridesInWindow >= WEEKLY_CAP_RIDES;
    const legFareCents = isCapped ? 0 : BASE_FARE_CENTS;

    if (isCapped) {
      capApplied = true;
    } else {
      paidEventsThisTrip.push({ timestampSeconds: legTimestamp });
    }

    fareCents += legFareCents;
    breakdown.push({
      fromStationId: leg[0].fromStationId,
      toStationId: leg[leg.length - 1].toStationId,
      segments: leg,
      timestampSeconds: legTimestamp,
      fareCents: legFareCents,
      capApplied: isCapped,
    });

    elapsedFromTripStart += legTravelSeconds;
  }

  return {
    fare: fareCents / 100,
    fareCents,
    breakdown,
    capApplied,
  };
}
