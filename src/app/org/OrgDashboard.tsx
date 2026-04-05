import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ConversationUI, { type MatchResult } from '../../components/conversation/ConversationUI'
import PipelineBoard from '../../components/pipeline/PipelineBoard'
import { AdPipelineUI } from '../../components/AdPipelineUI'
import AnalyticsUI from '../../components/analytics/AnalyticsUI'
import ImportCSV from '../../components/ImportCSV'
import MyOrganizationUI from '../../components/org/MyOrganizationUI'
import { supabase } from '../../lib/supabaseClient'
import { useSession } from '../../lib/AuthContext'

type Tab = 'find' | 'pipeline' | 'analytics' | 'posts' | 'organization'

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
  const navigate = useNavigate()
  const session = useSession()
  const [tab, setTab] = useState<Tab>('find')
  const [volunteers, setVolunteers] = useState<VolunteerCard[]>([])
  const [sessionTag, setSessionTag] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [chatKey, setChatKey] = useState(0)
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set())

  const [adContext, setAdContext] = useState<string>('')
  const [showToast, setShowToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])
  const [orgRefreshKey, setOrgRefreshKey] = useState(0)

  function handleNewChat() {
    setChatKey(k => k + 1)
    setVolunteers([])
    setSessionTag('')
    setSessionId('')
    setConnectedIds(new Set())
  }

  function handleConnect(volunteerId: string) {
    setConnectedIds(prev => new Set(prev).add(volunteerId))
    setPipelineRefreshKey(k => k + 1)
    setShowToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setShowToast(false), 5000)
  }

  const handleCreateAdFromAnalytics = (context: string) => {
    setAdContext(context)
    setTab('posts')
  }

  async function handleSend(text: string): Promise<MatchResult> {
    const orgBn = localStorage.getItem('relinkd_org_bn')
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, session_tag: sessionTag, session_id: sessionId, org_bn: orgBn }),
    })
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    const data: MatchResult = await res.json()
    if (data.volunteers) setVolunteers(data.volunteers as VolunteerCard[])
    if (data.session_tag) setSessionTag(data.session_tag)
    if (data.session_id) setSessionId(data.session_id)
    if (data.volunteers?.length) setPipelineRefreshKey(k => k + 1)
    return data
  }

  return (
    <div className="h-screen bg-[#002855] flex flex-col overflow-hidden">
      <header className="border-b border-[#1A3A52] px-4 py-3 flex items-center justify-between bg-[#002855]">
        {/* <img src="/logo.png" alt="Relinkd logo" className="h-16 w-16 rounded-xl object-contain" /> */}
        <p className="text-3xl font-bold tracking-widest text-[#8B9DB5] uppercase">Relinkd</p>
        <div className="flex items-center gap-3">
          {session?.user.email && (
            <span className="hidden sm:block text-xs text-[#8B9DB5] truncate max-w-[200px]">{session.user.email}</span>
          )}
          <ImportCSV />
          <button
            onClick={async () => { await supabase?.auth.signOut(); navigate('/org/login') }}
            className="text-xs font-medium text-[#8B9DB5] hover:text-white border border-[#4A7BA7] hover:border-[#5DADE2] rounded-lg px-3 py-1.5 transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      <nav aria-label="Dashboard sections" className="border-b border-[#1A3A52] px-4 flex justify-center gap-0 bg-[#002855]">
        {([
          { id: 'find',          label: 'Find volunteers' },
          { id: 'pipeline',      label: 'Pipeline' },
          { id: 'analytics',     label: 'Analytics' },
          { id: 'posts',         label: 'Post Generator' },
          { id: 'organization',  label: 'My Organization' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-100
              ${tab === t.id
                ? 'border-[#0070E0] text-white'
                : 'border-transparent text-[#8B9DB5] hover:text-white hover:border-[#5DADE2]'
              }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className={tab === 'find' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
          <FindTab
            key={chatKey}
            volunteers={volunteers}
            onSend={handleSend}
            sessionTag={sessionTag}
            onNewChat={handleNewChat}
            onConnect={handleConnect}
            connectedIds={connectedIds}
          />
        </div>
        <div className={tab === 'pipeline' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
          <PipelineBoard orgId={localStorage.getItem('relinkd_org_bn') ?? undefined} refreshTrigger={pipelineRefreshKey} onVolunteerConnected={handleConnect} />
        </div>
        <div className={tab === 'analytics' ? 'flex-1 overflow-y-auto' : 'hidden'}>
          <AnalyticsUI orgBn={localStorage.getItem('relinkd_org_bn') ?? undefined} onCreateAd={handleCreateAdFromAnalytics} />
        </div>
        <div className={tab === 'posts' ? 'flex-1 overflow-y-auto' : 'hidden'}>
          <AdPipelineUI
            onBack={() => setTab('find')}
            insightsContext={adContext || undefined}
            onInsightsConsumed={() => setAdContext('')}
            organizationRefreshKey={orgRefreshKey}
            userId={session?.user.id}
          />
        </div>
        <div className={tab === 'organization' ? 'flex-1 overflow-y-auto flex flex-col min-h-0' : 'hidden'}>
          <MyOrganizationUI
            organizationRefreshKey={orgRefreshKey}
            onSaved={() => setOrgRefreshKey(k => k + 1)}
            userId={session?.user.id}
          />
        </div>
      </main>

      {/* Connect toast */}
      <div
        aria-live="polite"
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 transition-all duration-300
          ${showToast ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3 bg-[#1A3A52] border border-[#0070E0] rounded-2xl px-4 py-3 shadow-xl">
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[#5DADE2] animate-pulse" />
          <p className="text-sm text-white">Outreach sent!</p>
          <button
            onClick={() => { setShowToast(false); setTab('pipeline') }}
            className="ml-1 text-sm font-semibold text-[#5DADE2] hover:text-white transition-colors whitespace-nowrap"
          >
            View in Pipeline →
          </button>
          <button
            onClick={() => setShowToast(false)}
            aria-label="Dismiss"
            className="ml-1 text-[#4A7BA7] hover:text-white transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Find tab ─────────────────────────────────────────────────────────────────

interface FindTabProps {
  volunteers: VolunteerCard[]
  onSend: (text: string) => Promise<MatchResult>
  sessionTag: string
  onNewChat: () => void
  onConnect: (volunteerId: string) => void
  connectedIds: Set<string>
}

function FindTab({ volunteers, onSend, sessionTag, onNewChat, onConnect, connectedIds }: FindTabProps) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 p-4">

      {/* Left — conversation card */}
      <section
        aria-label="Find volunteers by conversation"
        className="flex-1 min-h-0 lg:flex-none lg:w-[520px] rounded-2xl border border-[#A9CEE8] overflow-hidden shadow-sm flex flex-col"
      >
        <ConversationUI onSendMessage={onSend} onNewChat={onNewChat} />
      </section>

      {/* Right — results card */}
      <section
        aria-label="Matched volunteers"
        className="flex-1 min-h-0 rounded-2xl border border-[#A9CEE8] shadow-sm overflow-y-auto p-5 bg-[#1A3A52]"
      >
        {volunteers.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[#8B9DB5] text-center">
              Matched volunteers will appear here after your search.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">
                {volunteers.length} match{volunteers.length !== 1 ? 'es' : ''} found
              </h2>
              {sessionTag && (
                <span className="text-xs border border-[#4A7BA7] text-[#A9CEE8] px-2 py-0.5 rounded-full">
                  {sessionTag}
                </span>
              )}
            </div>
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {volunteers.map(v => (
                <VolunteerCardItem key={v.volunteer_id} volunteer={v} sessionTag={sessionTag} onConnect={onConnect} connected={connectedIds.has(v.volunteer_id)} />
              ))}
            </ul>
          </>
        )}
      </section>

    </div>
  )
}

// ── Volunteer card ────────────────────────────────────────────────────────────

function VolunteerCardItem({ volunteer: v, sessionTag, onConnect, connected: externalConnected }: { volunteer: VolunteerCard; sessionTag: string; onConnect: (volunteerId: string) => void; connected: boolean }) {
  const [connecting, setConnecting] = useState(false)
  const [localConnected, setLocalConnected] = useState(false)
  const connected = externalConnected || localConnected

  async function handleConnect() {
    setConnecting(true)
    try {
      await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteer_id: v.volunteer_id,
          session_tag: sessionTag,
          score: v.match_score ?? null,
          reason: v.match_reason ?? null,
        }),
      })
      setLocalConnected(true)
      onConnect(v.volunteer_id)
    } catch {
      // silently fail — organizer can retry
    } finally {
      setConnecting(false)
    }
  }

  return (
    <li className="border border-[#A9CEE8] rounded-2xl p-4 flex flex-col bg-white">
      {/* Content grows to fill space */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-sm text-[#2C3E50]">{v.first_name} {v.last_name}</p>
          {v.match_score != null && (
            <span
              className="text-xs font-bold tabular-nums text-white bg-[#0070E0] px-2 py-0.5 rounded-full flex-shrink-0"
              aria-label={`Match score ${v.match_score} out of 100`}
            >
              {v.match_score}%
            </span>
          )}
        </div>

        {v.match_reason && (
          <p className="text-xs text-[#4A7BA7] leading-relaxed">{v.match_reason}</p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#4A7BA7]">
          <span>{v.neighbourhood}</span>
          {v.availability && <span>{v.availability}</span>}
          {v.hours_available_per_month && <span>{v.hours_available_per_month}h/mo</span>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {v.skills?.map(s => (
            <span key={s} className="text-xs bg-[#F5F7FA] text-[#002855] px-2 py-0.5 rounded-full">{s}</span>
          ))}
          {v.languages_spoken?.filter((_, i) => i > 0 || (v.languages_spoken?.length ?? 0) > 1).map(l => (
            <span key={l} className="text-xs border border-[#A9CEE8] text-[#4A7BA7] px-2 py-0.5 rounded-full">{l}</span>
          ))}
          {v.background_check_status && (
            <span className="text-xs border border-[#A9CEE8] text-[#4A7BA7] px-2 py-0.5 rounded-full">
              {v.background_check_status}
            </span>
          )}
          {v.has_vehicle && (
            <span className="text-xs border border-[#A9CEE8] text-[#4A7BA7] px-2 py-0.5 rounded-full">Has vehicle</span>
          )}
        </div>
      </div>

      {/* Button pinned to bottom */}
      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting || connected}
        className={`mt-4 w-full py-2 text-xs font-semibold rounded-xl border transition-colors duration-150
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]
          disabled:cursor-not-allowed
          ${connected
            ? 'bg-white text-[#8B9DB5] border-[#A9CEE8]'
            : 'bg-[#0070E0] text-white border-[#0070E0] hover:bg-[#5DADE2] disabled:opacity-50'
          }`}
        aria-label={`Connect with ${v.first_name} ${v.last_name}`}
      >
        {connected ? 'Connected' : connecting ? 'Connecting…' : 'Connect'}
      </button>
    </li>
  )
}
