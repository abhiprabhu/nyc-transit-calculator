// Live PATH arrivals for one station (path-realtime-feature-brief.md,
// build order step 3). Polls GET /path/arrivals?stationId=X, which in turn
// reads backend/src/services/pathRealtime.js's in-memory map — see that
// file for the feed's known simplifications (no delay figure, no platform
// detail, no trip continuity across stations).
import { useEffect, useState } from 'react'

import { API_BASE } from '../lib/api'

const POLL_INTERVAL_MS = 18_000

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
        const res = await fetch(`${API_BASE}/path/arrivals?stationId=${stationId}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setState({ status: 'error', error: data.error || `HTTP ${res.status}` })
        } else {
          setState({ status: 'ok', data })
        }
      } catch {
        if (!cancelled) setState({ status: 'error', error: 'live times unavailable' })
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

function PathArrivalsWidget({ stationId }) {
  const state = useArrivals(stationId)

  if (state.status === 'loading') {
    return <p className="mt-2 text-sm text-slate-400">Loading live arrivals…</p>
  }

  if (state.status === 'error') {
    return <p className="mt-2 text-sm text-slate-400">Live times unavailable right now.</p>
  }

  if (state.data.arrivals.length === 0) {
    return <p className="mt-2 text-sm text-slate-400">No upcoming PATH arrivals in the current feed.</p>
  }

  return (
    <>
      <ul className="mt-2 divide-y divide-slate-100">
        {state.data.arrivals.map((arrival, i) => (
          <li key={i} className="flex items-center justify-between py-1.5 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-slate-700">{arrival.routeName}</span>
              {arrival.direction && <span className="text-slate-400">{arrival.direction}</span>}
            </span>
            <span className="font-medium text-slate-900">{formatMinutesAway(arrival.secondsAway)}</span>
          </li>
        ))}
      </ul>
      {state.data.stale && (
        <p className="mt-2 text-xs text-amber-600">Live data may be temporarily out of date.</p>
      )}
    </>
  )
}

export default PathArrivalsWidget
