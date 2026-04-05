import { useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface ParsedRow {
  [key: string]: string
}

// Map CSV header → volunteers table column (case-insensitive, flexible)
const FIELD_ALIASES: Record<string, string> = {
  volunteer_id: 'volunteer_id',
  id: 'volunteer_id',
  first_name: 'first_name',
  firstname: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  age: 'age',
  neighbourhood: 'neighbourhood',
  neighborhood: 'neighbourhood',
  languages_spoken: 'languages_spoken',
  languages: 'languages_spoken',
  skills: 'skills',
  cause_areas_of_interest: 'cause_areas_of_interest',
  causes: 'cause_areas_of_interest',
  cause_areas: 'cause_areas_of_interest',
  availability: 'availability',
  hours_available_per_month: 'hours_available_per_month',
  hours: 'hours_available_per_month',
  prior_volunteer_experience: 'prior_volunteer_experience',
  experience: 'prior_volunteer_experience',
  has_vehicle: 'has_vehicle',
  vehicle: 'has_vehicle',
  background_check_status: 'background_check_status',
  background_check: 'background_check_status',
  phone_number: 'phone',
  phone: 'phone',
  mobile: 'phone',
}

const ARRAY_FIELDS = new Set(['languages_spoken', 'skills', 'cause_areas_of_interest'])
const BOOL_FIELDS = new Set(['prior_volunteer_experience', 'has_vehicle'])
const NUM_FIELDS = new Set(['age', 'hours_available_per_month'])

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: ParsedRow = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

function mapRow(raw: ParsedRow): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const col = FIELD_ALIASES[rawKey.toLowerCase().replace(/\s+/g, '_')]
    if (!col || !rawVal) continue
    if (ARRAY_FIELDS.has(col)) {
      mapped[col] = rawVal.split(';').map(s => s.trim()).filter(Boolean)
    } else if (BOOL_FIELDS.has(col)) {
      mapped[col] = ['true', 'yes', '1'].includes(rawVal.toLowerCase())
    } else if (NUM_FIELDS.has(col)) {
      const n = Number(rawVal)
      if (!isNaN(n)) mapped[col] = n
    } else {
      mapped[col] = rawVal
    }
  }
  return mapped
}

export default function ImportCSV() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [fileName, setFileName] = useState('')
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStatus('idle')
    setMessage('')
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text).map(mapRow).filter(r => Object.keys(r).length > 0)
      setRows(parsed)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (rows.length === 0) return
    if (!supabase) {
      setStatus('error')
      setMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      return
    }
    setStatus('importing')
    setMessage('')
    const { error } = await supabase.from('volunteers').insert(rows)
    if (error) {
      setStatus('error')
      setMessage(error.message)
    } else {
      setStatus('done')
      setMessage(`${rows.length} volunteer${rows.length !== 1 ? 's' : ''} imported.`)
    }
  }

  function handleClose() {
    setOpen(false)
    setRows([])
    setFileName('')
    setStatus('idle')
    setMessage('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // Preview columns (first row keys)
  const previewCols = rows.length > 0 ? Object.keys(rows[0]) : []

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-[#A9CEE8] hover:text-white border border-[#4A7BA7]
                   hover:border-[#A9CEE8] rounded-xl px-3 py-1.5 transition-colors duration-150"
      >
        Import Volunteers
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import volunteer CSV"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg w-full max-w-2xl flex flex-col max-h-[80vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-semibold !text-black">Import volunteers</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Upload a CSV — columns map to the volunteers table. Separate multi-values with semicolons.
                </p>
                {!supabase && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    CSV import needs Supabase: set <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> and{' '}
                    <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono text-[11px]">.env.local</code>, then restart the dev server.
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="text-gray-400 hover:text-black transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            {/* File picker */}
            <div className="px-6 py-4 border-b border-gray-100">
              <label
                htmlFor="csv-upload"
                className="flex items-center gap-3 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:border-black transition-colors duration-150"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-sm text-gray-500">
                  {fileName || 'Choose a CSV file'}
                </span>
              </label>
              <input
                ref={fileRef}
                id="csv-upload"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="sr-only"
              />
              <p className="text-xs text-gray-400 mt-2">
                Accepted columns: first_name, last_name, age, neighbourhood, skills (semicolon-separated), languages_spoken, availability, has_vehicle, background_check_status, etc.
              </p>
            </div>

            {/* Preview table */}
            {rows.length > 0 && (
              <div className="flex-1 overflow-auto px-6 py-4">
                <p className="text-xs text-gray-400 mb-2">{rows.length} row{rows.length !== 1 ? 's' : ''} detected — preview (first 5):</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr>
                        {previewCols.map(c => (
                          <th key={c} className="text-left text-gray-500 font-semibold px-2 py-1 border-b border-gray-100 whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {previewCols.map(c => (
                            <td key={c} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[160px] truncate">
                              {Array.isArray(row[c]) ? (row[c] as string[]).join(', ') : String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div>
                {message && (
                  <p
                    role="alert"
                    className={`text-xs ${status === 'error' ? 'text-red-700' : 'text-gray-600'}`}
                  >
                    {message}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-xs px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:border-black hover:text-black transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={rows.length === 0 || status === 'importing' || status === 'done' || !supabase}
                  className="text-xs px-4 py-2 rounded-xl bg-[#0070E0] text-white font-semibold
                             hover:bg-[#5DADE2] disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors duration-150"
                >
                  {status === 'importing' ? 'Importing…' : status === 'done' ? 'Imported' : `Import ${rows.length > 0 ? rows.length : ''}`}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
