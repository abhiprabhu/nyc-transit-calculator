import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateFare,
  BASE_FARE_CENTS,
  FREE_TRANSFER_WINDOW_SECONDS,
  WEEKLY_CAP_RIDES,
  WEEKLY_CAP_WINDOW_SECONDS,
} from "./fareRules.js";

const TRIP_START = 1_700_000_000; // arbitrary fixed unix timestamp

function segment(from, to, seconds, overrides = {}) {
  return {
    fromStationId: from,
    toStationId: to,
    mode: "subway",
    line: "1",
    travelTimeSeconds: seconds,
    ...overrides,
  };
}

test("throws on empty ride segments", () => {
  assert.throws(() => calculateFare([], []));
  assert.throws(() => calculateFare(null, []));
});

test("single segment trip charges exactly one base fare", () => {
  const result = calculateFare(
    [segment("127", "128", 120)],
    [],
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.fareCents, BASE_FARE_CENTS);
  assert.equal(result.fare, BASE_FARE_CENTS / 100);
  assert.equal(result.capApplied, false);
  assert.equal(result.breakdown.length, 1);
});

test("transfer within the 2-hour window is free (one fare for the whole trip)", () => {
  const result = calculateFare(
    [
      segment("127", "635", 600, { line: "1" }),
      segment("635", "636", 300, { mode: "transfer", line: null }),
      segment("636", "640", 900, { line: "L" }),
    ],
    [],
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.fareCents, BASE_FARE_CENTS);
  assert.equal(result.breakdown.length, 1);
  assert.equal(result.breakdown[0].segments.length, 3);
});

test("a gap over 2 hours between segments starts a new paid leg", () => {
  const result = calculateFare(
    [
      segment("127", "128", 300),
      segment("128", "129", FREE_TRANSFER_WINDOW_SECONDS + 1),
    ],
    [],
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.breakdown.length, 2);
  assert.equal(result.fareCents, BASE_FARE_CENTS * 2);
});

test("a transfer that loops back to the leg's starting station is not free", () => {
  const result = calculateFare(
    [
      segment("127", "128", 300),
      segment("128", "127", 300), // round trip back through the entry point
    ],
    [],
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.breakdown.length, 2);
  assert.equal(result.fareCents, BASE_FARE_CENTS * 2);
});

test("weekly cap: 12th+ paid ride in the rolling window is free", () => {
  const riderHistory = Array.from({ length: WEEKLY_CAP_RIDES }, (_, i) => ({
    timestampSeconds: TRIP_START - i * 3600, // 12 rides earlier this week
  }));

  const result = calculateFare(
    [segment("127", "128", 300)],
    riderHistory,
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.capApplied, true);
  assert.equal(result.fareCents, 0);
  assert.equal(result.breakdown[0].capApplied, true);
});

test("weekly cap: rides outside the 7-day window don't count", () => {
  const riderHistory = Array.from({ length: WEEKLY_CAP_RIDES }, (_, i) => ({
    timestampSeconds: TRIP_START - WEEKLY_CAP_WINDOW_SECONDS - i * 3600 - 1,
  }));

  const result = calculateFare(
    [segment("127", "128", 300)],
    riderHistory,
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.capApplied, false);
  assert.equal(result.fareCents, BASE_FARE_CENTS);
});

test("weekly cap can trip mid-trip: first leg paid, second leg free", () => {
  // 11 prior rides this week; this trip has two paid legs (round-trip
  // re-entry forces a second swipe) — the 12th ride should be free.
  const riderHistory = Array.from({ length: WEEKLY_CAP_RIDES - 1 }, (_, i) => ({
    timestampSeconds: TRIP_START - i * 3600,
  }));

  const result = calculateFare(
    [
      segment("127", "128", 300),
      segment("128", "127", 300), // starts a second fare leg
    ],
    riderHistory,
    { tripStartTimestamp: TRIP_START },
  );

  assert.equal(result.breakdown.length, 2);
  assert.equal(result.breakdown[0].capApplied, false);
  assert.equal(result.breakdown[1].capApplied, true);
  assert.equal(result.fareCents, BASE_FARE_CENTS);
  assert.equal(result.capApplied, true);
});
