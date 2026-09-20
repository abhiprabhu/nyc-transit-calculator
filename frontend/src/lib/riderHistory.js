// Weekly OMNY cap tracking (phase 9, stretch). backend/src/services/fareRules.js
// is a pure function that takes riderHistory as an argument rather than
// persisting it server-side per rider — the brief allows this to live
// client-side for v1. We keep it in sessionStorage (not localStorage) since
// it models "this week's rides for the current browsing session," not a
// durable account history tied to a real person.
const STORAGE_KEY = 'nyc-transit-rider-history'

// Mirrors backend/src/services/fareRules.js — must stay in sync so the
// "rides remaining" display agrees with what the server will actually cap.
export const WEEKLY_CAP_RIDES = 12
const WEEKLY_CAP_WINDOW_SECONDS = 7 * 24 * 60 * 60

function readRaw() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Private browsing, storage disabled, or corrupted JSON — degrade to
    // "assume single trip" mode, same as omitting riderHistory entirely.
    return []
  }
}

function writeRaw(events) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Storage unavailable/full — cap tracking silently no-ops.
  }
}

function pruneToWindow(events, nowSeconds = Math.floor(Date.now() / 1000)) {
  const windowStart = nowSeconds - WEEKLY_CAP_WINDOW_SECONDS
  return events.filter((e) => e.timestampSeconds > windowStart)
}

// Prior paid fare events for this session, as { timestampSeconds }[] — the
// shape the /route API's riderHistory param expects.
export function getRiderHistory() {
  const pruned = pruneToWindow(readRaw())
  writeRaw(pruned)
  return pruned
}

// Records a set of paid legs (from a route option's fare.breakdown, with
// capApplied legs excluded) as rides actually taken this week.
export function logRide(paidLegs) {
  const events = [...getRiderHistory(), ...paidLegs.map((leg) => ({ timestampSeconds: leg.timestampSeconds }))]
  writeRaw(events)
  return events
}

export function clearRiderHistory() {
  writeRaw([])
}

export function ridesRemaining(riderHistory = getRiderHistory()) {
  return Math.max(0, WEEKLY_CAP_RIDES - riderHistory.length)
}
