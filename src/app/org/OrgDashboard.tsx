import { useState } from 'react'
import ConversationUI, { type MatchResult } from '../../components/conversation/ConversationUI'
import PipelineBoard from '../../components/pipeline/PipelineBoard'
import { AdPipelineUI } from '../../components/AdPipelineUI'
import ImportCSV from '../../components/ImportCSV'

type Tab = 'find' | 'pipeline' | 'ads'

export interface VolunteerCard {
  volunteer_id: string
  first_name: string
  last_name: string
  age?: number
  neighbourhood: string
  languages_spoken?: string[]
  skills?: string[]
  cause_areas_of_interest?: string[]
  availability?: string
  hours_available_per_month?: number
  prior_volunteer_experience?: boolean
  has_vehicle?: boolean
  background_check_status?: string
  phone?: string
  match_score?: number
  match_reason?: string
}

export default function OrgDashboard() {
  const [tab, setTab] = useState<Tab>('find')
  const [volunteers, setVolunteers] = useState<VolunteerCard[]>([])
  const [sessionTag, setSessionTag] = useState('')

  async function handleSend(text: string): Promise<MatchResult> {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, session_tag: sessionTag }),
    })
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    const data: MatchResult = await res.json()
    if (data.volunteers) setVolunteers(data.volunteers as VolunteerCard[])
    if (data.session_tag) setSessionTag(data.session_tag)
    return data
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Organizer</p>
        <ImportCSV />
      </header>

      <nav aria-label="Dashboard sections" className="border-b border-gray-200 px-4 flex gap-0">
        {([
          { id: 'find',     label: 'Find volunteers' },
          { id: 'pipeline', label: 'Pipeline' },
          { id: 'ads',      label: 'Ad Generator' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-100
              ${tab === t.id
                ? 'border-black text-black'
                : 'border-transparent text-gray-400 hover:text-black hover:border-gray-300'
              }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'find' && (
          <FindTab
            volunteers={volunteers}
            onSend={handleSend}
            sessionTag={sessionTag}
          />
        )}
        {tab === 'pipeline' && <PipelineBoard />}
        {tab === 'ads' && (
          <div className="flex-1 overflow-y-auto">
            <AdPipelineUI onBack={() => setTab('find')} />
          </div>
        )}
      </main>
    </div>
  )
}

// ── Find tab ─────────────────────────────────────────────────────────────────

interface FindTabProps {
  volunteers: VolunteerCard[]
  onSend: (text: string) => Promise<MatchResult>
  sessionTag: string
}

function FindTab({ volunteers, onSend, sessionTag }: FindTabProps) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 p-4">

      {/* Left — conversation card */}
      <section
        aria-label="Find volunteers by conversation"
        className="flex-shrink-0 rounded-2xl border border-gray-200 overflow-hidden shadow-sm
                   flex flex-col h-[460px] lg:h-auto lg:w-[520px]"
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <ConversationUI onSendMessage={onSend} />
        </div>
      </section>

      {/* Right — results card */}
      <section
        aria-label="Matched volunteers"
        className="flex-1 rounded-2xl border border-gray-200 shadow-sm overflow-y-auto p-5 min-h-[200px]"
      >
        {volunteers.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-gray-400 text-center">
              Matched volunteers will appear here after your search.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-black">
                {volunteers.length} match{volunteers.length !== 1 ? 'es' : ''} found
              </h2>
              {sessionTag && (
                <span className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">
                  {sessionTag}
                </span>
              )}
            </div>
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {volunteers.map(v => (
                <VolunteerCardItem key={v.volunteer_id} volunteer={v} sessionTag={sessionTag} />
              ))}
            </ul>
          </>
        )}
      </section>

    </div>
  )
}

// ── Volunteer card ────────────────────────────────────────────────────────────

function VolunteerCardItem({ volunteer: v, sessionTag }: { volunteer: VolunteerCard; sessionTag: string }) {
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteer_id: v.volunteer_id, session_tag: sessionTag }),
      })
      setConnected(true)
    } catch {
      // silently fail — organizer can retry
    } finally {
      setConnecting(false)
    }
  }

  return (
    <li className="border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-black">{v.first_name} {v.last_name}</p>
        {v.match_score != null && (
          <span
            className="text-xs font-bold tabular-nums text-black bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0"
            aria-label={`Match score ${v.match_score} out of 100`}
          >
            {v.match_score}%
          </span>
        )}
      </div>

      {v.match_reason && (
        <p className="text-xs text-gray-600 leading-relaxed">{v.match_reason}</p>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        <span>{v.neighbourhood}</span>
        {v.availability && <span>{v.availability}</span>}
        {v.hours_available_per_month && <span>{v.hours_available_per_month}h/mo</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {v.skills?.map(s => (
          <span key={s} className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded-full">{s}</span>
        ))}
        {v.languages_spoken?.filter((_, i) => i > 0 || (v.languages_spoken?.length ?? 0) > 1).map(l => (
          <span key={l} className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">{l}</span>
        ))}
        {v.background_check_status && (
          <span className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">
            {v.background_check_status}
          </span>
        )}
        {v.has_vehicle && (
          <span className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">Has vehicle</span>
        )}
      </div>

      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting || connected}
        className={`mt-1 w-full py-2 text-xs font-semibold rounded-xl border transition-colors duration-150
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black
          disabled:cursor-not-allowed
          ${connected
            ? 'bg-white text-gray-400 border-gray-200'
            : 'bg-black text-white border-black hover:bg-gray-900 disabled:opacity-50'
          }`}
        aria-label={`Connect with ${v.first_name} ${v.last_name}`}
      >
        {connected ? 'Outreach sent' : connecting ? 'Sending…' : 'Connect'}
      </button>
    </li>
  )
}
