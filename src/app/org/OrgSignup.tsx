import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export interface OrgSignupData {
  BN: string
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
}

interface OrgSignupProps {
  onSubmit?: (data: OrgSignupData) => Promise<void> | void
}

export const PROVINCES = [
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]

export const SECTORS = [
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
  mission: '',
  address1: '',
  address2: '',
  city: '',
  province: '',
  postal_code: '',
  country: 'Canada',
  sector: '',
}

export default function OrgSignup({ onSubmit }: OrgSignupProps) {
  const navigate = useNavigate()
  const [form, setForm] = useState<OrgSignupData>(EMPTY_FORM)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      if (!supabase) throw new Error('Supabase not configured.')
      const { error } = await supabase.from('organizations').insert({
        bn: form.BN,
        legal_name: form.legal_name,
        account_name: form.account_name,
        mission: form.mission || null,
        address1: form.address1,
        address2: form.address2 || null,
        city: form.city,
        province: form.province,
        postal_code: form.postal_code,
        country: form.country,
        sector: form.sector,
      })
      if (error) throw new Error(error.message)
      await onSubmit?.(form)
      navigate('/org')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }


  return (
    <div className="min-h-screen bg-[#002855] flex flex-col">
      {/* Header — matches dashboard */}
      <header className="border-b border-[#1A3A52] px-4 py-3">
        {/* <img src="/logo.png" alt="Relinkd logo" className="h-16 w-16 rounded-xl object-contain" /> */}
        <p className="text-3xl font-bold tracking-widest text-[#8B9DB5] uppercase">Relinkd</p>
      </header>

      {/* Form card */}
      <div className="flex-1 flex items-start justify-center px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-lg">
          <div className="border border-[#A9CEE8] rounded-2xl shadow-sm overflow-hidden bg-[#1A3A52]">
            {/* Card header */}
            <div className="px-6 py-6 border-b border-[#4A7BA7]">
              <h1 className="text-3xl font-bold text-white">Register your organization</h1>
              <p className="text-sm text-[#8B9DB5] mt-1.5">Connect with volunteers in your community.</p>
            </div>

            {/* Card body */}
            <form onSubmit={handleSubmit} aria-label="Organization signup form" className="px-6 py-5">
              <div className="space-y-5">

                <fieldset className="space-y-4">
                  <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-3">
                    Organization identity
                  </legend>
                  <Field id="legal_name" name="legal_name" label="Legal name" value={form.legal_name} onChange={handleChange} autoComplete="organization" required />
                  <Field id="account_name" name="account_name" label="Account / operating name" value={form.account_name} onChange={handleChange} required />
                  <Field id="BN" name="BN" label="Business Number (BN)" value={form.BN} onChange={handleChange} placeholder="123456789" required />
                  <TextAreaField id="mission" name="mission" label="Mission statement" value={form.mission} onChange={handleChange} placeholder="Briefly describe your organization's mission…" />
                </fieldset>

                <hr className="border-[#4A7BA7]" />

                <fieldset>
                  <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-3">
                    Sector
                  </legend>
                  <SelectField id="sector" name="sector" label="Sector" value={form.sector} onChange={handleChange} required>
                    <option value="">Select a sector</option>
                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectField>
                </fieldset>

                <hr className="border-[#4A7BA7]" />

                <fieldset className="space-y-4">
                  <legend className="text-xs font-bold text-[#8B9DB5] uppercase tracking-widest mb-3">
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
                <p role="alert" className="mt-5 text-xs text-red-700 border border-red-200 rounded-xl px-3 py-2 bg-red-50">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="mt-6 w-full bg-[#0070E0] text-white text-sm font-semibold py-2.5 px-4 rounded-xl
                           hover:bg-[#5DADE2] focus-visible:outline focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors duration-150"
              >
                {status === 'submitting' ? 'Registering…' : 'Register'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
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
      <label htmlFor={id} className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">
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
        className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                   focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                   placeholder:text-[#4A7BA7] bg-[#002855]"
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

interface TextAreaFieldProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  placeholder?: string
}

function TextAreaField({ id, name, label, value, onChange, placeholder }: TextAreaFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                   focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                   placeholder:text-[#4A7BA7] bg-[#002855] resize-none"
      />
    </div>
  )
}

function SelectField({ id, name, label, value, onChange, autoComplete, required, children }: SelectFieldProps) {
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
        autoComplete={autoComplete}
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
