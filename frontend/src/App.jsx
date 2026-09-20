import { useState } from 'react'

import ArrivalsPanel from './components/ArrivalsPanel'
import PathStationsPanel from './components/PathStationsPanel'
import RouteResults from './components/RouteResults'
import RouteResultsSkeleton from './components/RouteResultsSkeleton'
import SearchForm from './components/SearchForm'
import { API_BASE } from './lib/api'
import { WEEKLY_CAP_RIDES, clearRiderHistory, getRiderHistory, logRide, ridesRemaining } from './lib/riderHistory'

async function fetchRoute({ from, to }) {
  const params = new URLSearchParams({
    originLat: String(from.lat),
    originLon: String(from.lon),
    originLabel: from.label,
    destLat: String(to.lat),
    destLon: String(to.lon),
    destLabel: to.label,
    riderHistory: JSON.stringify(getRiderHistory()),
  })
  let res
  try {
    res = await fetch(`${API_BASE}/route?${params}`)
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.')
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`Unexpected response from server (HTTP ${res.status}).`)
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

function App() {
  const [search, setSearch] = useState(null)
  const [result, setResult] = useState({ state: 'idle' })
  const [remaining, setRemaining] = useState(() => ridesRemaining())

  async function runSearch(locations) {
    setSearch(locations)
    setResult({ state: 'loading' })
    try {
      const data = await fetchRoute(locations)
      setResult({ state: 'ok', data })
    } catch (err) {
      setResult({ state: 'error', error: err.message })
    }
  }

  function handleLogRide(option) {
    const paidLegs = option.fare.breakdown.filter((leg) => !leg.capApplied)
    logRide(paidLegs)
    setRemaining(ridesRemaining())
  }

  function handleResetWeek() {
    clearRiderHistory()
    setRemaining(WEEKLY_CAP_RIDES)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">NYC Transit Cost Calculator</h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Find the cheapest route between two locations.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500 sm:text-sm">
          <span>
            {remaining > 0
              ? `${remaining} of ${WEEKLY_CAP_RIDES} rides left this week before the OMNY cap`
              : 'Weekly OMNY cap reached — remaining rides this week are free'}
          </span>
          <button type="button" onClick={handleResetWeek} className="font-medium text-indigo-600 hover:underline">
            Reset week
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <SearchForm onSearch={runSearch} isSearching={result.state === 'loading'} />
        </div>

        <PathStationsPanel />

        {result.state === 'loading' && <RouteResultsSkeleton />}

        {result.state === 'error' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center sm:p-6">
            <p className="text-sm font-medium text-red-700 sm:text-base">{result.error}</p>
            {search && (
              <button
                type="button"
                onClick={() => runSearch(search)}
                className="mt-3 rounded-lg border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {result.state === 'ok' && search && (
          <>
            <ArrivalsPanel
              stationId={result.data.origin.station.id}
              stationName={result.data.origin.station.name}
            />
            <RouteResults data={result.data} onLogRide={handleLogRide} />
          </>
        )}
      </div>
    </main>
  )
}

export default App
