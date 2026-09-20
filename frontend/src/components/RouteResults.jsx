// Results view: route cards showing transfers, time, cost.
import { useState } from 'react'

import RouteMap from './RouteMap'

// The /route response's `stations` map covers every station id in the
// path (see backend/src/routes/route.js), including transfer stops the
// rider never typed in — so this only falls back to the raw id if the
// backend ever omits one.
function resolveStationName(id, stations) {
  return stations[id]?.name ?? id
}

function formatWalkDistance(meters) {
  const miles = meters / 1609.34
  return miles < 0.1 ? 'a short walk' : `${miles.toFixed(1)} mi walk`
}

function formatDuration(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  return remainderMinutes ? `${hours} hr ${remainderMinutes} min` : `${hours} hr`
}

function formatFare(fare) {
  return `$${fare.toFixed(2)}`
}

function RouteLeg({ leg, index, stations }) {
  return (
    <li className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between text-sm font-medium text-slate-800">
        <span>
          Leg {index + 1}: {resolveStationName(leg.fromStationId, stations)} →{' '}
          {resolveStationName(leg.toStationId, stations)}
        </span>
        <span className={leg.capApplied ? 'text-emerald-600' : 'text-slate-700'}>
          {leg.capApplied ? 'Free (cap reached)' : formatFare(leg.fareCents / 100)}
        </span>
      </div>
      <ol className="mt-2 space-y-1 text-sm text-slate-500">
        {leg.segments.map((segment, i) => (
          <li key={i}>
            {segment.mode === 'transfer' ? (
              <span>
                ↳ Transfer to {resolveStationName(segment.toStationId, stations)}{' '}
                <span className="text-emerald-600">(no fee, within 2 hrs)</span>
              </span>
            ) : (
              <span>
                {segment.line ? `${segment.line} train` : 'Ride'}
                {segment.headsign ? ` toward ${segment.headsign}` : ''} to{' '}
                {resolveStationName(segment.toStationId, stations)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </li>
  )
}

function RouteOption({ option, origin, destination, stations, onLogRide }) {
  const transferCount = option.segments.filter((s) => s.mode === 'transfer').length
  const [logged, setLogged] = useState(false)
  const [showMap, setShowMap] = useState(false)

  function handleLogRide() {
    onLogRide(option)
    setLogged(true)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
      <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
          {origin.label} → {destination.label}
        </h2>
        <span className="text-base font-semibold text-slate-900 sm:text-lg">{formatFare(option.fare.fare)}</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Nearest stations: {origin.station.name} ({formatWalkDistance(origin.station.distanceMeters)}) →{' '}
        {destination.station.name} ({formatWalkDistance(destination.station.distanceMeters)})
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>{formatDuration(option.totalTimeSeconds)}</span>
        <span>·</span>
        <span>
          {transferCount === 0 ? 'No transfers' : `${transferCount} transfer${transferCount > 1 ? 's' : ''}`}
        </span>
        {option.fare.capApplied && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Weekly cap applied
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {option.ranks.map((rank) => (
            <span
              key={rank}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium capitalize text-indigo-700"
            >
              {rank}
            </span>
          ))}
        </span>
      </div>
      <ol className="space-y-3">
        {option.fare.breakdown.map((leg, i) => (
          <RouteLeg key={i} leg={leg} index={i} stations={stations} />
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-400">Log this ride to count it toward your weekly OMNY cap.</p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setShowMap((prev) => !prev)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {showMap ? 'Hide map' : 'Show map'}
          </button>
          <button
            type="button"
            onClick={handleLogRide}
            disabled={logged}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"
          >
            {logged ? 'Logged ✓' : 'I took this route'}
          </button>
        </div>
      </div>
      {showMap && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
          <RouteMap segments={option.segments} stations={stations} />
        </div>
      )}
    </div>
  )
}

function RouteResults({ data, onLogRide }) {
  if (!data.options || data.options.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        No routes found between these locations.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.options.map((option, i) => (
        <RouteOption
          key={i}
          option={option}
          origin={data.origin}
          destination={data.destination}
          stations={data.stations || {}}
          onLogRide={onLogRide}
        />
      ))}
    </div>
  )
}

export default RouteResults
