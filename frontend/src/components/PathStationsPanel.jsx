// Standalone "PATH Trains" section: a station picker plus live arrivals.
// This is separate from the route-search results because PATH isn't part
// of this app's route graph/DB yet (only subway is ingested — see
// backend/src/services/gtfsLoader.js), so there's no PATH route segment to
// attach an arrivals widget to per path-realtime-feature-brief.md's
// original wiring plan. The station list itself is a hardcoded 13-station
// list from the backend (see backend/src/data/pathStations.js), not a
// search-as-you-type lookup, since there are only 13 PATH stations.
import { useEffect, useState } from 'react'

import { API_BASE } from '../lib/api'
import PathArrivalsWidget from './PathArrivalsWidget'

function useStations() {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/path/stations`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setState({ status: 'error', error: data.error || `HTTP ${res.status}` })
        } else {
          setState({ status: 'ok', stations: data.stations })
        }
      } catch {
        if (!cancelled) setState({ status: 'error', error: 'Could not reach the server.' })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

function PathStationsPanel() {
  const stationsState = useStations()
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (stationsState.status === 'ok' && selectedId === null && stationsState.stations.length > 0) {
      setSelectedId(stationsState.stations[0].stationId)
    }
  }, [stationsState, selectedId])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 sm:text-base">PATH trains</h3>

        {stationsState.status === 'ok' && (
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700"
          >
            {stationsState.stations.map((station) => (
              <option key={station.stationId} value={station.stationId}>
                {station.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {stationsState.status === 'loading' && <p className="mt-2 text-sm text-slate-400">Loading stations…</p>}
      {stationsState.status === 'error' && <p className="mt-2 text-sm text-red-600">{stationsState.error}</p>}
      {stationsState.status === 'ok' && selectedId && <PathArrivalsWidget stationId={selectedId} />}
    </div>
  )
}

export default PathStationsPanel
