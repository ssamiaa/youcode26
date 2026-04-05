import { useState, useEffect, useCallback } from 'react'

export interface PipelineEntry {
  id: string
  need_id?: string
  volunteer_id: string
  score?: number
  reason?: string
  status: 'sent' | 'interested' | 'not_interested'
  session_tag?: string
  created_at: string
  // joined from volunteers table by the API
  first_name?: string
  last_name?: string
  neighbourhood?: string
  skills?: string[]
}

type Column = { id: PipelineEntry['status']; label: string; description: string }

const COLUMNS: Column[] = [
  { id: 'sent',         label: 'Sent',          description: 'Outreach sent, awaiting reply' },
  { id: 'interested',   label: 'Interested',    description: 'Volunteer wants to help'       },
  { id: 'not_interested', label: 'Not interested', description: 'Passed or no response'      },
]

interface PipelineBoardProps {
  orgId?: string
}

export default function PipelineBoard({ orgId }: PipelineBoardProps) {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const fetchPipeline = useCallback(async () => {
    try {
      const url = orgId ? `/api/pipeline?org_id=${orgId}` : '/api/pipeline'
      const res = await fetch(url)
      if (!res.ok) { setEntries([]); return }
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) { setEntries([]); return }
      const data: PipelineEntry[] = await res.json()
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { fetchPipeline() }, [fetchPipeline])

  // All unique tags across entries
  const allTags = Array.from(
    new Set(entries.map(e => e.session_tag).filter((t): t is string => !!t))
  )

  const filtered = activeTag ? entries.filter(e => e.session_tag === activeTag) : entries
  const byStatus = (status: PipelineEntry['status']) => filtered.filter(e => e.status === status)

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading pipeline…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header + tag filter */}
      <div className="px-6 pt-4 pb-3 max-w-4xl mx-auto w-full space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {entries.length === 0
              ? 'No outreach yet.'
              : `${filtered.length} of ${entries.length} volunteer${entries.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={fetchPipeline}
            aria-label="Refresh pipeline"
            className="text-xs text-gray-400 hover:text-black transition-colors duration-150 underline"
          >
            Refresh
          </button>
        </div>

        {/* Tag filter pills */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by search label">
            <button
              onClick={() => setActiveTag(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors duration-100
                ${activeTag === null
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-black hover:text-black'
                }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors duration-100
                  ${activeTag === tag
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-500 border-gray-300 hover:border-black hover:text-black'
                  }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kanban — horizontal scroll on mobile, 3-col grid on desktop */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-4">
        <div className="flex md:grid md:grid-cols-3 gap-4 h-full min-w-[600px] md:min-w-0 max-w-4xl mx-auto">
          {COLUMNS.map(col => (
            <KanbanColumn key={col.id} col={col} entries={byStatus(col.id)} />
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({ col, entries }: { col: Column; entries: PipelineEntry[] }) {
  return (
    <section
      aria-label={`${col.label} column`}
      className="flex flex-col rounded-2xl border border-gray-200 overflow-hidden flex-shrink-0 w-[280px] md:w-auto"
    >
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

      <ul className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0 ? (
          <li className="text-xs text-gray-300 text-center py-6">Empty</li>
        ) : (
          entries.map(entry => <PipelineCard key={entry.id} entry={entry} />)
        )}
      </ul>
    </section>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────

function PipelineCard({ entry: e }: { entry: PipelineEntry }) {
  return (
    <li className="rounded-xl border border-gray-200 p-3 flex flex-col gap-2 bg-white">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-black leading-tight">
          {e.first_name} {e.last_name}
        </p>
        {e.session_tag && (
          <span className="text-xs border border-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0 max-w-[100px] truncate">
            {e.session_tag}
          </span>
        )}
      </div>

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

      <div className="text-xs text-gray-400 space-y-0.5 mt-1">
        <p>Sent {formatDate(e.created_at)}</p>
        {e.score != null && <p>Score {e.score}</p>}
      </div>
    </li>
  )
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
