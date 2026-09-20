// Search form with debounced address/landmark autocomplete for origin/destination.
// Each selection is a geocoded {label, lat, lon}, not a station — the backend
// snaps it to the nearest subway station before routing (see backend/src/routes/route.js).
import { useId, useState } from 'react'

import { useDebouncedGeocode } from '../hooks/useDebouncedGeocode'

function LocationField({ label, placeholder, value, onChange }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const { suggestions, loading, error } = useDebouncedGeocode(query)
  const listId = useId()

  function handleSelect(location) {
    onChange(location)
    setQuery(location.label)
    setIsOpen(false)
  }

  function handleInputChange(event) {
    setQuery(event.target.value)
    setIsOpen(true)
    if (value) onChange(null)
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 100)}
      />
      {isOpen && query.trim() && (
        <ul
          id={listId}
          className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {loading && <li className="px-3 py-2 text-sm text-slate-400">Searching…</li>}
          {!loading && error && (
            <li className="px-3 py-2 text-sm text-red-500">Couldn't look up that location. Try again.</li>
          )}
          {!loading && !error && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">No locations found</li>
          )}
          {!loading &&
            !error &&
            suggestions.map((location, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-slate-800 hover:bg-indigo-50"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(location)}
                >
                  {location.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function SearchForm({ onSearch, isSearching }) {
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [validationError, setValidationError] = useState(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (!from || !to) {
      setValidationError('Choose an origin and destination from the suggestions.')
      return
    }
    if (from.lat === to.lat && from.lon === to.lon) {
      setValidationError('Origin and destination must be different locations.')
      return
    }
    setValidationError(null)
    onSearch({ from, to })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <LocationField label="From" placeholder="Origin location" value={from} onChange={setFrom} />
      <LocationField label="To" placeholder="Destination location" value={to} onChange={setTo} />
      {validationError && <p className="text-sm text-red-600">{validationError}</p>}
      <button
        type="submit"
        disabled={isSearching}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {isSearching ? 'Finding routes…' : 'Find route'}
      </button>
    </form>
  )
}

export default SearchForm
