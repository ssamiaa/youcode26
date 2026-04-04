import { useState } from 'react'
import ConversationUI, { type MatchResult } from '../../components/conversation/ConversationUI'

type Tab = 'find' | 'pipeline'

// Volunteer result shape — matches volunteers table
export interface VolunteerCard {
  volunteer_ID: string
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
}

export default function OrgDashboard() {
  const [tab, setTab] = useState<Tab>('find')
  const [volunteers, setVolunteers] = useState<VolunteerCard[]>([])

  async function handleSend(text: string): Promise<MatchResult> {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    const data: MatchResult = await res.json()
    if (data.volunteers) setVolunteers(data.volunteers as VolunteerCard[])
    return data
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top bar */}
      <header className="border-b border-gray-200 px-4 py-3">
        <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">Organizer</p>
      </header>

      {/* Tabs */}
      <nav aria-label="Dashboard sections" className="border-b border-gray-200 px-4 flex gap-0">
        {([
          { id: 'find',     label: 'Find volunteers' },
          { id: 'pipeline', label: 'Pipeline' },
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

      {/* Tab content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {tab === 'find' && (
          <FindTab volunteers={volunteers} onSend={handleSend} />
        )}
        {tab === 'pipeline' && (
          <PlaceholderTab label="Pipeline" description="Volunteer pipeline coming soon." />
        )}
      </main>
    </div>
  )
}

// ── Find tab ────────────────────────────────────────────────────────────────

interface FindTabProps {
  volunteers: VolunteerCard[]
  onSend: (text: string) => Promise<MatchResult>
}

function FindTab({ volunteers, onSend }: FindTabProps) {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto px-6 flex flex-col flex-1">
      {/* Conversation section — fixed height, self-contained */}
      <section aria-label="Find volunteers by conversation" className="flex-shrink-0 border border-gray-200 rounded-2xl overflow-hidden mt-6">
        <div className="h-[420px] flex flex-col">
          <ConversationUI onSendMessage={onSend} />
        </div>
      </section>

      {/* Results section — grows below */}
      <section aria-label="Matched volunteers" className="py-6">
        {volunteers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Matched volunteers will appear here after your search.
          </p>
        ) : (
          <>
            <h2 className="text-sm font-bold text-black mb-4">
              {volunteers.length} match{volunteers.length !== 1 ? 'es' : ''} found
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {volunteers.map(v => (
                <VolunteerCardItem key={v.volunteer_ID} volunteer={v} />
              ))}
            </ul>
          </>
        )}
      </section>
      </div>
    </div>
  )
}

// ── Volunteer card ───────────────────────────────────────────────────────────

function VolunteerCardItem({ volunteer: v }: { volunteer: VolunteerCard }) {
  return (
    <li className="border border-gray-200 rounded-2xl p-4 flex flex-col gap-2 hover:border-black transition-colors duration-150">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-black">{v.first_name} {v.last_name}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {v.background_check_status && (
            <span className="text-xs text-gray-500">{v.background_check_status}</span>
          )}
          {v.has_vehicle && (
            <span className="text-xs text-gray-500">Has vehicle</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
        <span>{v.neighbourhood}</span>
        {v.age && <span>Age {v.age}</span>}
        {v.hours_available_per_month && <span>{v.hours_available_per_month}h/mo</span>}
        {v.availability && <span>{v.availability}</span>}
      </div>

      {v.skills && v.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
          {v.skills.map(s => (
            <li key={s} className="text-xs bg-gray-100 text-black px-2 py-0.5 rounded-full">{s}</li>
          ))}
        </ul>
      )}

      {v.cause_areas_of_interest && v.cause_areas_of_interest.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Cause areas">
          {v.cause_areas_of_interest.map(c => (
            <li key={c} className="text-xs border border-gray-300 text-gray-600 px-2 py-0.5 rounded-full">{c}</li>
          ))}
        </ul>
      )}

      {v.languages_spoken && v.languages_spoken.length > 1 && (
        <p className="text-xs text-gray-400">{v.languages_spoken.join(', ')}</p>
      )}
    </li>
  )
}

// ── Placeholder for future tabs ──────────────────────────────────────────────

function PlaceholderTab({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center">
        <p className="font-semibold text-black text-sm">{label}</p>
        <p className="text-sm text-gray-400 mt-1">{description}</p>
      </div>
    </div>
  )
}
