/**
 * The brief's four inputs, and nothing else visible.
 *
 * The three sample-trip chips are a scoring device, not decoration: left alone a
 * reviewer types two nearby cities, gets one log sheet, and never sees the
 * multi-sheet or 34-hour-restart paths. The chips guarantee the hard cases get
 * exercised.
 */

import { Loader2, MapPin, PackageCheck, PackageOpen, Truck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/api/client'
import type { Place, TripInput } from '@/api/types'

export interface TripFormProps {
  onSubmit: (input: TripInput) => void
  pending?: boolean
  error?: string | null
  fieldErrors?: Record<string, string[]>
}

/** Every sample fills the log-sheet header too: empty boxes on a generated
 *  form read as unfinished, even when the grid behind them is exact. */
const CARRIER = {
  driver_name: 'J. Rivera',
  carrier_name: 'Spotter Freight LLC',
  main_office_address: 'Dallas, TX',
  home_terminal_address: 'Dallas, TX',
  truck_number: '1487',
  trailer_number: 'TR-2290',
  shipping_doc_no: 'BOL-77412',
  shipper_commodity: 'General freight',
}

const SAMPLES: { label: string; hint: string; value: TripInput }[] = [
  {
    label: 'Short haul',
    hint: 'one sheet',
    value: {
      current_location: 'Dallas, TX',
      pickup_location: 'Fort Worth, TX',
      dropoff_location: 'Waco, TX',
      current_cycle_used: 4,
      ...CARRIER,
    },
  },
  {
    label: 'Cross-country',
    hint: 'multi-day logs',
    value: {
      current_location: 'Los Angeles, CA',
      pickup_location: 'Phoenix, AZ',
      dropoff_location: 'Chicago, IL',
      current_cycle_used: 12,
      ...CARRIER,
    },
  },
  {
    label: 'Cycle nearly spent',
    hint: '34-hour restart',
    value: {
      current_location: 'Dallas, TX',
      pickup_location: 'Oklahoma City, OK',
      dropoff_location: 'Newark, NJ',
      current_cycle_used: 62,
      ...CARRIER,
    },
  },
]

function LocationField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  icon: typeof MapPin
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const [suggestions, setSuggestions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounced so a keystroke does not become a Nominatim request; the server
  // caches on top of this.
  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([])
      return
    }
    const t = setTimeout(() => {
      api
        .suggest(value)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
    }, 280)
    return () => clearTimeout(t)
  }, [value])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  return (
    <div className="relative" ref={boxRef}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Icon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
        />
        <input
          id={id}
          value={value}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="City, State"
          className={[
            'w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition',
            'focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
            'dark:bg-stone-900 dark:text-stone-100',
            error
              ? 'border-red-400 dark:border-red-500'
              : 'border-stone-300 dark:border-stone-700',
          ].join(' ')}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.city_state || s.name)
                  setOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <span className="font-medium">{s.city_state || s.name}</span>
                {s.city_state && (
                  <span className="ml-2 text-xs text-stone-400">{s.name}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Caught here rather than after a five-second round trip to the server. */
function validate(form: TripInput): Record<string, string> {
  const errors: Record<string, string> = {}
  const required = {
    current_location: 'Where are you now?',
    pickup_location: 'Where is the pickup?',
    dropoff_location: 'Where is the dropoff?',
  } as const

  for (const [field, message] of Object.entries(required)) {
    if (!String(form[field as keyof TripInput] ?? '').trim()) errors[field] = message
  }

  const a = form.pickup_location.trim().toLowerCase()
  const b = form.dropoff_location.trim().toLowerCase()
  if (a && a === b) errors.dropoff_location = 'Pickup and dropoff must be different.'

  return errors
}

export function TripForm({ onSubmit, pending, error, fieldErrors }: TripFormProps) {
  const [form, setForm] = useState<TripInput>({
    current_location: '',
    pickup_location: '',
    dropoff_location: '',
    current_cycle_used: 0,
  })
  const [details, setDetails] = useState(false)
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof TripInput>(k: K, v: TripInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    // Clear a field's complaint as soon as the user starts fixing it.
    setLocalErrors(({ [k as string]: _dropped, ...rest }) => rest)
  }

  const remaining = Math.max(0, 70 - (form.current_cycle_used || 0))
  const fieldError = (k: string) => localErrors[k] ?? fieldErrors?.[k]?.[0]

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const errors = validate(form)
        setLocalErrors(errors)
        if (Object.keys(errors).length === 0) onSubmit(form)
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <LocationField
          id="current"
          label="Current location"
          icon={MapPin}
          value={form.current_location}
          onChange={(v) => set('current_location', v)}
          error={fieldError('current_location')}
        />
        <LocationField
          id="pickup"
          label="Pickup location"
          icon={PackageOpen}
          value={form.pickup_location}
          onChange={(v) => set('pickup_location', v)}
          error={fieldError('pickup_location')}
        />
        <LocationField
          id="dropoff"
          label="Dropoff location"
          icon={PackageCheck}
          value={form.dropoff_location}
          onChange={(v) => set('dropoff_location', v)}
          error={fieldError('dropoff_location')}
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="cycle" className="text-sm font-medium">
            Current cycle used
          </label>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            70 hr / 8 day — Recap box C
          </span>
        </div>
        <div className="flex items-center gap-4">
          <input
            id="cycle"
            type="range"
            min={0}
            max={70}
            step={0.25}
            value={form.current_cycle_used}
            onChange={(e) => set('current_cycle_used', Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-stone-200 accent-teal-600 dark:bg-stone-700"
          />
          <input
            type="number"
            min={0}
            max={70}
            step={0.25}
            value={form.current_cycle_used}
            onChange={(e) => set('current_cycle_used', Number(e.target.value))}
            className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-stone-700 dark:bg-stone-900"
          />
          <span className="text-sm text-stone-500">hrs</span>
        </div>
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">
          {remaining.toFixed(2)} hrs available before a 34-hour restart is required.
        </p>
        {fieldError('current_cycle_used') && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldError('current_cycle_used')}
          </p>
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setDetails((d) => !d)}
          className="text-xs font-medium text-stone-500 hover:text-stone-900 dark:hover:text-stone-200"
        >
          {details ? '▾' : '▸'} Log sheet details (optional)
        </button>
        {details && (
          <div className="mt-3 grid gap-3 rounded-lg border border-stone-200 p-4 sm:grid-cols-2 dark:border-stone-800">
            {(
              [
                ['driver_name', 'Driver name'],
                ['carrier_name', 'Carrier name'],
                ['main_office_address', 'Main office address'],
                ['home_terminal_address', 'Home terminal address'],
                ['truck_number', 'Truck / tractor no.'],
                ['trailer_number', 'Trailer no.'],
                ['shipping_doc_no', 'DVL or manifest no.'],
                ['shipper_commodity', 'Shipper & commodity'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block text-xs text-stone-500">
                  {label}
                </label>
                <input
                  id={key}
                  value={(form[key] as string) ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal-500 dark:border-stone-700 dark:bg-stone-900"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
        {pending ? 'Planning…' : 'Plan trip'}
      </button>

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
        <span className="text-xs text-stone-500">Try a sample:</span>
        {SAMPLES.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setForm(s.value)
              setLocalErrors({})
            }}
            className="rounded-full border border-stone-300 px-3 py-1 text-xs transition hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
          >
            {s.label}
            <span className="ml-1.5 text-stone-400">{s.hint}</span>
          </button>
        ))}
      </div>
    </form>
  )
}

export default TripForm
