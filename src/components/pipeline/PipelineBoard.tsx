import { useState, useEffect, useCallback } from 'react'

export interface PipelineEntry {
  match_id: string
  volunteer_ID: string
  first_name: string
  last_name: string
  neighbourhood?: string
  skills?: string[]
  status: 'sent' | 'responded' | 'confirmed'
  contacted_at: string      // ISO string
  responded_at?: string
  confirmed_at?: string
}

type Column = { id: PipelineEntry['status']; label: string; description: string }

const COLUMNS: Column[] = [
  { id: 'sent',      label: 'Sent',      description: 'Outreach sent, awaiting reply' },
  { id: 'responded', label: 'Responded', description: 'Volunteer has replied'         },
  { id: 'confirmed', label: 'Confirmed', description: 'Confirmed and ready'           },
]

interface PipelineBoardProps {
  orgId?: string
}

export default function PipelineBoard({ orgId }: PipelineBoardProps) {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPipeline = useCallback(async () => {
    try {
      const url = orgId ? `/api/pipeline?org_id=${orgId}` : '/api/pipeline'
      const res = await fetch(url)
      if (!res.ok) {
        // API not ready yet — treat as empty pipeline
        setEntries([])
        return
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        // Dev server returned HTML — API not deployed yet
        setEntries([])
        return
      }
      const data: PipelineEntry[] = await res.json()
      setEntries(data)
    } catch {
      // Network error or JSON parse failure — show empty state
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchPipeline()
  }, [fetchPipeline])

  const byStatus = (status: PipelineEntry['status']) =>
    entries.filter(e => e.status === status)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading pipeline…</p>
      </div>
    )
  }


  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 max-w-4xl mx-auto w-full">
        <p className="text-xs text-gray-400">
          {entries.length === 0 ? 'No outreach yet.' : `${entries.length} volunteer${entries.length !== 1 ? 's' : ''} in pipeline`}
        </p>
        <button
          onClick={fetchPipeline}
          aria-label="Refresh pipeline"
          className="text-xs text-gray-400 hover:text-black transition-colors duration-150 underline"
        >
          Refresh
        </button>
      </div>

      {/* Kanban — horizontal scroll on mobile, 3-col grid on desktop */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-4">
        <div className="flex md:grid md:grid-cols-3 gap-4 h-full min-w-[600px] md:min-w-0 max-w-4xl mx-auto">
          {COLUMNS.map(col => (
            <Column
              key={col.id}
              col={col}
              entries={byStatus(col.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Column ───────────────────────────────────────────────────────────────────

function Column({ col, entries }: { col: Column; entries: PipelineEntry[] }) {
  return (
    <section
      aria-label={`${col.label} column`}
      className="flex flex-col rounded-2xl border border-gray-200 overflow-hidden flex-shrink-0 w-[280px] md:w-auto"
    >
      {/* Column header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold !text-black">{col.label}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{col.description}</p>
        </div>
        <span
          className="text-xs font-bold tabular-nums bg-gray-100 text-black px-2 py-0.5 rounded-full"
          aria-label={`${entries.length} entries`}
        >
          {entries.length}
        </span>
      </div>

      {/* Cards */}
      <ul className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0 ? (
          <li className="text-xs text-gray-300 text-center py-6">Empty</li>
        ) : (
          entries.map(entry => (
            <PipelineCard key={entry.match_id} entry={entry} />
          ))
        )}
      </ul>
    </section>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

function PipelineCard({ entry: e }: { entry: PipelineEntry }) {
  const sentDate     = formatDate(e.contacted_at)
  const respondedDate = e.responded_at ? formatDate(e.responded_at) : null
  const confirmedDate = e.confirmed_at  ? formatDate(e.confirmed_at)  : null

  return (
    <li className="rounded-xl border border-gray-200 p-3 flex flex-col gap-2 bg-white">
      <p className="text-sm font-semibold text-black leading-tight">
        {e.first_name} {e.last_name}
      </p>

      {e.neighbourhood && (
        <p className="text-xs text-gray-500">{e.neighbourhood}</p>
      )}

      {e.skills && e.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Skills">
          {e.skills.slice(0, 3).map(s => (
            <li key={s} className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded-full">{s}</li>
          ))}
          {e.skills.length > 3 && (
            <li className="text-xs text-gray-400">+{e.skills.length - 3}</li>
          )}
        </ul>
      )}

      {/* Timeline */}
      <div className="text-xs text-gray-400 space-y-0.5 mt-1">
        <p>Sent {sentDate}</p>
        {respondedDate && <p>Replied {respondedDate}</p>}
        {confirmedDate && <p>Confirmed {confirmedDate}</p>}
      </div>
    </li>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day:   'numeric',
      hour:  'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
