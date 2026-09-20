// Live arrivals for the search's origin station (phase 9, stretch). Polls
// backend/src/routes/stations.js's GET /stations/:id/arrivals, which in
// turn caches MTA's GTFS-realtime feeds — see
// backend/src/services/realtimeArrivals.js for the polling cadence this is
// matched to and the known simplifications (e.g. "N"/"S" being the raw
// GTFS direction code, not a literal compass direction).
import { useEffect, useState } from 'react'

import { API_BASE } from '../lib/api'

const POLL_INTERVAL_MS = 30_000

function formatMinutesAway(secondsAway) {
  const minutes = Math.round(secondsAway / 60)
  return minutes <= 0 ? 'Due' : `${minutes} min`
}

function useArrivals(stationId) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let timer

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/stations/${stationId}/arrivals`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setState({ status: 'error', error: data.error || `HTTP ${res.status}` })
        } else {
          setState({ status: 'ok', data })
        }
      } catch {
        if (!cancelled) setState({ status: 'error', error: 'Could not reach the server.' })
      } finally {
        if (!cancelled) timer = setTimeout(load, POLL_INTERVAL_MS)
      }
    }

    setState({ status: 'loading' })
    load()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [stationId])

  return state
}

function ArrivalsPanel({ stationId, stationName }) {
  const state = useArrivals(stationId)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="text-sm font-semibold text-slate-900 sm:text-base">Live arrivals at {stationName}</h3>

      {state.status === 'loading' && <p className="mt-2 text-sm text-slate-400">Loading live arrivals…</p>}

      {state.status === 'error' && <p className="mt-2 text-sm text-red-600">{state.error}</p>}

      {state.status === 'ok' && state.data.arrivals.length === 0 && (
        <p className="mt-2 text-sm text-slate-400">No upcoming arrivals from the live feed right now.</p>
      )}

      {state.status === 'ok' && state.data.arrivals.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {state.data.arrivals.map((arrival, i) => (
            <li key={i} className="flex items-center justify-between py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  {arrival.routeId}
                </span>
                {arrival.direction && <span className="text-slate-400">{arrival.direction}</span>}
              </span>
              <span className="font-medium text-slate-700">{formatMinutesAway(arrival.secondsAway)}</span>
            </li>
          ))}
        </ul>
      )}

      {state.status === 'ok' && state.data.failedFeeds.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          Some live data is temporarily unavailable, so results may be incomplete.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Directions are MTA's own "N"/"S" designation, which don't always mean literal north/south.
      </p>
    </div>
  )
}

export default ArrivalsPanel
