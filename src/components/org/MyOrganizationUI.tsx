import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { PROVINCES, SECTORS } from '../../app/org/OrgSignup'
import '../AdPipelineUI.css'

export interface MyOrganizationUIProps {
  /** Bump to refetch organization (same pattern as Post Generator). */
  organizationRefreshKey?: number
  /** Increment after a successful save so other views (e.g. Post Generator) can refetch. */
  onSaved?: () => void
}

/** Match Post Generator: accept object, or a single-element array from older clients. */
function normalizeOrgRow(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  if (typeof data === 'object') return data as Record<string, unknown>
  return null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Skip scanning these keys for embedded UUIDs (long text fields). */
const UUID_SCAN_SKIP = new Set([
  'mission', 'legal_name', 'account_name', 'address1', 'address2',
  'city', 'province', 'postal_code', 'country', 'sector', 'website', 'email',
])

/** DB column + value for `.eq()` — prefers real PK columns, then any UUID-shaped value, then `bn`. */
function resolveRowFilter(row: Record<string, unknown>): { column: string; value: string } | null {
  const candidates = ['id', 'organization_id', 'org_id', 'uuid']
  for (const key of candidates) {
    const v = row[key]
    if (v != null && String(v).trim() !== '') return { column: key, value: String(v).trim() }
  }
  for (const [k, v] of Object.entries(row)) {
    if (UUID_SCAN_SKIP.has(k)) continue
    if (typeof v === 'string' && UUID_RE.test(v.trim())) return { column: k, value: v.trim() }
  }
  const bn = row.bn
  if (bn != null && String(bn).trim() !== '') return { column: 'bn', value: String(bn).trim() }
  return null
}

interface OrgForm {
  bn: string
  legal_name: string
  account_name: string
  mission: string
  address1: string
  address2: string
  city: string
  province: string
  postal_code: string
  country: string
  sector: string
  website: string
  email: string
}

const EMPTY: OrgForm = {
  bn: '',
  legal_name: '',
  account_name: '',
  mission: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Canada',
  sector: '',
  website: '',
  email: '',
}

function rowToForm(row: Record<string, unknown>): OrgForm {
  const s = (v: unknown) => (v == null ? '' : String(v))
  return {
    bn:           s(row.bn),
    legal_name:   s(row.legal_name),
    account_name: s(row.account_name),
    mission:      s(row.mission),
    address1:     s(row.address1),
    address2:     s(row.address2),
    city:         s(row.city),
    province:     s(row.province),
    postal_code:  s(row.postal_code),
    country:      s(row.country) || 'Canada',
    sector:       s(row.sector),
    website:      s(row.website),
    email:        s(row.email),
  }
}

export default function MyOrganizationUI({
  organizationRefreshKey = 0,
  onSaved,
}: MyOrganizationUIProps) {
  /** Column + value passed to `.eq()` so updates work when PK is not named `id`. */
  const [rowFilter, setRowFilter] = useState<{ column: string; value: string } | null>(null)
  const [form, setForm] = useState<OrgForm>(EMPTY)
  /** Only send website/email on update if the table row included those columns (avoids DB errors). */
  const [cols, setCols] = useState<{ website: boolean; email: boolean }>({ website: false, email: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  /** Initial / refetch errors — same copy as Post Generator (`AdPipelineUI`). */
  const [orgFetchError, setOrgFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  /**
   * After the first load (or a successful save), refetch by this filter so we always
   * reload the same row. `limit(1)` without ORDER BY returns an arbitrary row when
   * multiple organizations exist, which looked like "a different org every save."
   */
  const stableFetchRef = useRef<{ column: string; value: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!supabase) {
        setOrgFetchError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.')
        setRowFilter(null)
        setLoading(false)
        return
      }
      setOrgFetchError(null)
      setLoading(true)

      const pin = stableFetchRef.current
      let q = supabase.from('organizations').select('*')
      if (pin) {
        q = q.eq(pin.column, pin.value)
      } else {
        // Same table may omit `id`; `bn` is required in-app and sorts deterministically.
        q = q.order('bn', { ascending: true }).limit(1)
      }
      const { data, error: dbErr } = await q.maybeSingle()

      if (cancelled) return
      if (dbErr) {
        setOrgFetchError(`Database error: ${dbErr.message} (code: ${dbErr.code})`)
        setRowFilter(null)
        setLoading(false)
        return
      }

      const row = normalizeOrgRow(data)
      if (!row) {
        setOrgFetchError('No organization found. Please register your organization first.')
        setRowFilter(null)
        stableFetchRef.current = null
        setLoading(false)
        return
      }

      const filter = resolveRowFilter(row)
      setRowFilter(filter)
      stableFetchRef.current = filter
      setForm(rowToForm(row))
      setCols({
        website: Object.prototype.hasOwnProperty.call(row, 'website'),
        email:   Object.prototype.hasOwnProperty.call(row, 'email'),
      })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [organizationRefreshKey])

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !rowFilter) {
      setSaveError('Cannot save: no row identifier returned from the database. Check that your organizations table exposes a primary key (e.g. id).')
      return
    }
    setSaveError(null)
    setSavedFlash(false)

    if (
      !form.legal_name.trim() ||
      !form.account_name.trim() ||
      !form.bn.trim() ||
      !form.address1.trim() ||
      !form.city.trim() ||
      !form.province ||
      !form.postal_code.trim() ||
      !form.country.trim() ||
      !form.sector
    ) {
      setSaveError('Please fill in legal name, operating name, BN, address, city, province, postal code, country, and sector.')
      return
    }

    setSaving(true)

    const payload: Record<string, unknown> = {
      bn:           form.bn.trim(),
      legal_name:   form.legal_name.trim(),
      account_name: form.account_name.trim(),
      mission:      form.mission.trim() || null,
      address1:     form.address1.trim(),
      address2:     form.address2.trim() || null,
      city:         form.city.trim(),
      province:     form.province,
      postal_code:  form.postal_code.trim(),
      country:      form.country.trim(),
      sector:       form.sector,
    }
    if (cols.website) payload.website = form.website.trim() || null
    if (cols.email)   payload.email   = form.email.trim() || null

    let serverMessage: string | null = null
    try {
      const res = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: rowFilter, updates: payload }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        organization?: Record<string, unknown>
      }
      if (res.ok) {
        const savedRow = normalizeOrgRow(json.organization ?? null)
        const nextPin = savedRow ? resolveRowFilter(savedRow) : null
        if (nextPin) stableFetchRef.current = nextPin
        setSaving(false)
        setSavedFlash(true)
        onSaved?.()
        window.setTimeout(() => setSavedFlash(false), 3500)
        return
      }
      serverMessage = json.error ?? `Server responded with ${res.status}`
    } catch (e) {
      serverMessage =
        e instanceof Error
          ? `${e.message} (is the API server running on port 3001?)`
          : 'Could not reach the API server.'
    }

    const { data: updatedRows, error: upErr } = await supabase
      .from('organizations')
      .update(payload)
      .eq(rowFilter.column, rowFilter.value)
      .select()

    setSaving(false)
    if (!upErr && updatedRows && updatedRows.length > 0) {
      const savedRow = normalizeOrgRow(updatedRows[0])
      const nextPin = savedRow ? resolveRowFilter(savedRow) : null
      if (nextPin) stableFetchRef.current = nextPin
      setSavedFlash(true)
      onSaved?.()
      window.setTimeout(() => setSavedFlash(false), 3500)
      return
    }

    const directHint = upErr?.message ?? (updatedRows?.length === 0 ? 'No rows updated (often blocked by Row Level Security for anonymous clients).' : 'Unknown error')
    setSaveError(
      `${serverMessage ?? 'Save failed'}. Browser fallback: ${directHint}`,
    )
  }

  if (loading) {
    return (
      <div className="ad-pipeline flex-1 w-full min-h-0">
        <main className="pipeline-body">
          <div className="org-loading">
            <div className="org-loading-spinner" />
            <p>Loading organization data…</p>
          </div>
        </main>
      </div>
    )
  }

  if (orgFetchError) {
    return (
      <div className="ad-pipeline flex-1 w-full min-h-0">
        <main className="pipeline-body">
          <div className="error-view">
            <div className="error-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>Organization not found</h3>
            <p className="error-message" role="alert">{orgFetchError}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">My Organization</h1>
          <p className="text-sm text-[#8B9DB5] mt-1">
            Details here are used across outreach and the post generator. Save changes when you are done editing.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] shadow-sm overflow-hidden"
          aria-label="Edit organization profile"
        >
          <div className="px-5 py-5 space-y-5 border-b border-[#4A7BA7]">
            <fieldset className="space-y-4">
              <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-2">
                Organization identity
              </legend>
              <Field id="mo-legal_name" name="legal_name" label="Legal name" value={form.legal_name} onChange={handleChange} autoComplete="organization" required />
              <Field id="mo-account_name" name="account_name" label="Account / operating name" value={form.account_name} onChange={handleChange} required />
              <Field id="mo-bn" name="bn" label="Business Number (BN)" value={form.bn} onChange={handleChange} required />
              <TextArea id="mo-mission" name="mission" label="Mission statement" value={form.mission} onChange={handleChange} />
            </fieldset>

            <hr className="border-[#4A7BA7]" />

            {(cols.email || cols.website) && (
              <>
                <fieldset>
                  <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-2">Contact &amp; web</legend>
                  <div className="space-y-4">
                    {cols.email && (
                      <Field id="mo-email" name="email" label="Public contact email" value={form.email} onChange={handleChange} type="email" autoComplete="email" />
                    )}
                    {cols.website && (
                      <Field id="mo-website" name="website" label="Website" value={form.website} onChange={handleChange} type="text" autoComplete="url" placeholder="https://…" />
                    )}
                  </div>
                </fieldset>
                <hr className="border-[#4A7BA7]" />
              </>
            )}

            <fieldset>
              <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-2">Sector</legend>
              <Select id="mo-sector" name="sector" label="Sector" value={form.sector} onChange={handleChange} required>
                <option value="">Select a sector</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </fieldset>

            <hr className="border-[#4A7BA7]" />

            <fieldset className="space-y-4">
              <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-2">Address</legend>
              <Field id="mo-address1" name="address1" label="Address line 1" value={form.address1} onChange={handleChange} autoComplete="address-line1" required />
              <Field id="mo-address2" name="address2" label="Address line 2 (optional)" value={form.address2} onChange={handleChange} autoComplete="address-line2" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="mo-city" name="city" label="City" value={form.city} onChange={handleChange} autoComplete="address-level2" required />
                <Select id="mo-province" name="province" label="Province / Territory" value={form.province} onChange={handleChange} required>
                  <option value="">Select</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="mo-postal_code" name="postal_code" label="Postal code" value={form.postal_code} onChange={handleChange} autoComplete="postal-code" required placeholder="A1A 1A1" />
                <Field id="mo-country" name="country" label="Country" value={form.country} onChange={handleChange} autoComplete="country-name" required />
              </div>
            </fieldset>
          </div>

          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {saveError && (
              <p className="text-xs text-red-300 flex-1" role="alert">{saveError}</p>
            )}
            {savedFlash && (
              <p className="text-xs text-emerald-400 flex-1" role="status">Changes saved.</p>
            )}
            <button
              type="submit"
              disabled={saving || !rowFilter}
              title={!rowFilter ? 'No row identifier from the database; cannot save.' : undefined}
              className="sm:ml-auto min-w-[160px] bg-[#0070E0] text-white text-sm font-semibold py-2.5 px-5 rounded-xl
                         hover:bg-[#5DADE2] focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  id, name, label, value, onChange, autoComplete, required, placeholder, type = 'text',
}: {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  autoComplete?: string
  required?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">
        {label}{required && <span className="sr-only"> (required)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        aria-required={required}
        className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                   focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                   placeholder:text-[#4A7BA7] bg-[#002855]"
      />
    </div>
  )
}

function TextArea({
  id, name, label, value, onChange,
}: {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">{label}</label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        rows={4}
        className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                   focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                   placeholder:text-[#4A7BA7] bg-[#002855] resize-y min-h-[100px]"
      />
    </div>
  )
}

function Select({
  id, name, label, value, onChange, required, children,
}: {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">
        {label}{required && <span className="sr-only"> (required)</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        aria-required={required}
        className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                   focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                   bg-[#002855] appearance-none"
      >
        {children}
      </select>
    </div>
  )
}
