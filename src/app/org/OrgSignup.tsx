import { useState, type FormEvent } from 'react'

export interface OrgSignupData {
  BN: string
  legal_name: string
  account_name: string
  address1: string
  address2: string
  city: string
  province: string
  postal_code: string
  country: string
  sector: string
}

interface OrgSignupProps {
  onSubmit?: (data: OrgSignupData) => Promise<void> | void
}

const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]

const SECTORS = [
  'Arts & Culture',
  'Education',
  'Environment',
  'Food Security',
  'Health',
  'Housing',
  'Legal',
  'Seniors',
  'Social Services',
  'Sports & Recreation',
  'Youth',
  'Other',
]

const EMPTY_FORM: OrgSignupData = {
  BN: '',
  legal_name: '',
  account_name: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Canada',
  sector: '',
}

export default function OrgSignup({ onSubmit }: OrgSignupProps) {
  const [form, setForm] = useState<OrgSignupData>(EMPTY_FORM)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      await onSubmit?.(form)
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div
          role="alert"
          aria-live="polite"
          className="max-w-md w-full border-2 border-black p-8 text-center"
        >
          <h1 className="text-2xl font-bold !text-black mb-3">You're registered.</h1>
          <p className="text-gray-700">
            <strong>{form.legal_name}</strong> has been added.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <header className="mb-8">
          <h1 className="text-3xl font-bold !text-black tracking-tight">Register your organization</h1>
          <p className="mt-2 text-gray-600 text-base">Connect with volunteers in your community.</p>
        </header>

        <form onSubmit={handleSubmit} aria-label="Organization signup form">
          <div className="space-y-5">

            {/* Identity */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Organization identity
              </legend>
              <Field id="legal_name" name="legal_name" label="Legal name" value={form.legal_name} onChange={handleChange} autoComplete="organization" required />
              <Field id="account_name" name="account_name" label="Account / operating name" value={form.account_name} onChange={handleChange} required />
              <Field id="BN" name="BN" label="Business Number (BN)" value={form.BN} onChange={handleChange} placeholder="123456789" required />
            </fieldset>

            <hr className="border-gray-200" />

            {/* Sector */}
            <fieldset>
              <legend className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Sector
              </legend>
              <SelectField id="sector" name="sector" label="Sector" value={form.sector} onChange={handleChange} required>
                <option value="">Select a sector</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectField>
            </fieldset>

            <hr className="border-gray-200" />

            {/* Address */}
            <fieldset className="space-y-4">
              <legend className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                Address
              </legend>
              <Field id="address1" name="address1" label="Address line 1" value={form.address1} onChange={handleChange} autoComplete="address-line1" required />
              <Field id="address2" name="address2" label="Address line 2" value={form.address2} onChange={handleChange} autoComplete="address-line2" required />
              <div className="grid grid-cols-2 gap-4">
                <Field id="city" name="city" label="City" value={form.city} onChange={handleChange} autoComplete="address-level2" required />
                <SelectField id="province" name="province" label="Province / Territory" value={form.province} onChange={handleChange} autoComplete="address-level1" required>
                  <option value="">Select</option>
                  {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                </SelectField>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field id="postal_code" name="postal_code" label="Postal code" value={form.postal_code} onChange={handleChange} autoComplete="postal-code" required placeholder="A1A 1A1" />
                <Field id="country" name="country" label="Country" value={form.country} onChange={handleChange} autoComplete="country-name" required />
              </div>
            </fieldset>

          </div>

          {status === 'error' && (
            <p role="alert" className="mt-5 text-sm text-red-700 border border-red-700 px-3 py-2">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="mt-7 w-full bg-black text-white text-base font-semibold py-3 px-4
                       hover:bg-gray-900 focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-black
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors duration-150"
          >
            {status === 'submitting' ? 'Registering…' : 'Register'}
          </button>
        </form>
      </div>
    </main>
  )
}

// --- Field components ---

interface FieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  autoComplete?: string
  required?: boolean
  placeholder?: string
}

function Field({ id, name, label, value, onChange, autoComplete, required, placeholder }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-black mb-1.5">
        {label}{required && <span className="sr-only"> (required)</span>}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        aria-required={required}
        className="w-full border border-gray-400 text-black text-base px-3 py-2.5
                   focus:outline-none focus:border-black focus:ring-1 focus:ring-black
                   placeholder:text-gray-400 bg-white"
      />
    </div>
  )
}

interface SelectFieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  autoComplete?: string
  required?: boolean
  children: React.ReactNode
}

function SelectField({ id, name, label, value, onChange, autoComplete, required, children }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-black mb-1.5">
        {label}{required && <span className="sr-only"> (required)</span>}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        aria-required={required}
        className="w-full border border-gray-400 text-black text-base px-3 py-2.5
                   focus:outline-none focus:border-black focus:ring-1 focus:ring-black
                   bg-white appearance-none"
      >
        {children}
      </select>
    </div>
  )
}
