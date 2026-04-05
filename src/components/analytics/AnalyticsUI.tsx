import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { PipelineEntry } from '../pipeline/PipelineBoard'

interface AnalyticsUIProps {
  onCreateAd?: (context: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  matched:      '#4A7BA7',
  sent:         '#0070E0',
  interested:   '#22C55E',
  not_interested: '#EF4444',
}

const STATUS_LABELS: Record<string, string> = {
  matched:        'Matched',
  sent:           'Sent',
  interested:     'Interested',
  not_interested: 'Not interested',
}

export default function AnalyticsUI({ onCreateAd }: AnalyticsUIProps) {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pipeline')
      if (!res.ok) { setEntries([]); return }
      const data: PipelineEntry[] = await res.json()
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const total = entries.length

  const countBy = (status: PipelineEntry['status']) =>
    entries.filter(e => e.status === status).length

  const matched      = countBy('matched')
  const sent         = countBy('sent')
  const interested   = countBy('interested')
  const notInterested = countBy('not_interested')

  const responseRate = sent + interested + notInterested > 0
    ? Math.round(((interested + notInterested) / (sent + interested + notInterested)) * 100)
    : 0

  const interestRate = interested + notInterested > 0
    ? Math.round((interested / (interested + notInterested)) * 100)
    : 0

  // Funnel data
  const funnelData = [
    { stage: 'Matched',       count: matched + sent + interested + notInterested },
    { stage: 'Outreach sent', count: sent + interested + notInterested },
    { stage: 'Responded',     count: interested + notInterested },
    { stage: 'Interested',    count: interested },
  ]

  // Pie: status breakdown
  const pieData = (['matched', 'sent', 'interested', 'not_interested'] as const)
    .map(s => ({ name: STATUS_LABELS[s], value: countBy(s), color: STATUS_COLORS[s] }))
    .filter(d => d.value > 0)

  // Skills: top skills among interested volunteers
  const interestedEntries = entries.filter(e => e.status === 'interested')
  const skillCount: Record<string, number> = {}
  interestedEntries.forEach(e => {
    e.skills?.forEach(s => { skillCount[s] = (skillCount[s] ?? 0) + 1 })
  })
  const topSkills = Object.entries(skillCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({ skill, count }))

  // Neighbourhood breakdown among interested
  const nbrCount: Record<string, number> = {}
  interestedEntries.forEach(e => {
    if (e.neighbourhood) nbrCount[e.neighbourhood] = (nbrCount[e.neighbourhood] ?? 0) + 1
  })
  const topNeighbourhoods = Object.entries(nbrCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([neighbourhood, count]) => ({ neighbourhood, count }))

  // Not-interested: skills we're missing (skills in not_interested but not in interested)
  const notInterestedSkills: Record<string, number> = {}
  entries.filter(e => e.status === 'not_interested').forEach(e => {
    e.skills?.forEach(s => { notInterestedSkills[s] = (notInterestedSkills[s] ?? 0) + 1 })
  })
  const missedSkills = Object.entries(notInterestedSkills)
    .filter(([s]) => !skillCount[s])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s)

  // Ad context summary for "Generate Ad" CTA
  const adContext = [
    topSkills.length    ? `Top skills from interested volunteers: ${topSkills.slice(0, 3).map(s => s.skill).join(', ')}.` : '',
    topNeighbourhoods.length ? `Strongest neighbourhoods: ${topNeighbourhoods.slice(0, 3).map(n => n.neighbourhood).join(', ')}.` : '',
    interestRate > 0    ? `Current interest rate: ${interestRate}%.` : '',
    missedSkills.length ? `Skills we haven't converted yet: ${missedSkills.join(', ')}.` : '',
  ].filter(Boolean).join(' ')

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[#8B9DB5]">Loading analytics…</p>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-[#8B9DB5] text-center">
          No pipeline data yet. Start matching volunteers to see analytics.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-6xl mx-auto w-full">

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={fetchData}
          className="text-xs text-[#8B9DB5] hover:text-white transition-colors underline"
        >
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total matched" value={total} color="#4A7BA7" />
        <KpiCard label="Outreach sent" value={sent + interested + notInterested} color="#0070E0" />
        <KpiCard label="Interested" value={interested} color="#22C55E" />
        <KpiCard label="Interest rate" value={`${interestRate}%`} color="#A9CEE8" sub={`${responseRate}% responded`} />
      </div>

      {/* Row: funnel + pie */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <ChartCard title="Outreach funnel">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fill: '#8B9DB5', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" width={100} tick={{ fill: '#A9CEE8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1A3A52', border: '1px solid #4A7BA7', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#A9CEE8' }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="count" fill="#0070E0" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status breakdown">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} paddingAngle={3}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1A3A52', border: '1px solid #4A7BA7', borderRadius: 8, fontSize: 12 }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#8B9DB5' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row: top skills + neighbourhoods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <ChartCard title="Top skills (interested volunteers)">
          {topSkills.length === 0 ? (
            <p className="text-xs text-[#4A7BA7] py-4 text-center">No interested volunteers yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSkills} margin={{ left: 0, right: 20 }}>
                <XAxis dataKey="skill" tick={{ fill: '#8B9DB5', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis tick={{ fill: '#8B9DB5', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1A3A52', border: '1px solid #4A7BA7', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#A9CEE8' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="count" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Interested by neighbourhood">
          {topNeighbourhoods.length === 0 ? (
            <p className="text-xs text-[#4A7BA7] py-4 text-center">No neighbourhood data yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topNeighbourhoods} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#8B9DB5', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="neighbourhood" width={110} tick={{ fill: '#A9CEE8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1A3A52', border: '1px solid #4A7BA7', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#A9CEE8' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Bar dataKey="count" fill="#5DADE2" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Insights + CTA */}
      <div className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">Outreach insights</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#A9CEE8]">
          {interestRate >= 50 ? (
            <Insight positive text={`Strong interest rate of ${interestRate}% — your messaging is resonating.`} />
          ) : interestRate > 0 ? (
            <Insight text={`Interest rate is ${interestRate}% — consider refining your outreach for better conversion.`} />
          ) : null}

          {missedSkills.length > 0 && (
            <Insight text={`Volunteers with ${missedSkills.slice(0, 3).join(', ')} skills haven't converted — try tailoring your ask.`} />
          )}

          {topNeighbourhoods[0] && (
            <Insight positive text={`${topNeighbourhoods[0].neighbourhood} has the most interested volunteers (${topNeighbourhoods[0].count}) — a strong area for targeted outreach.`} />
          )}

          {sent > 0 && interested === 0 && notInterested === 0 && (
            <Insight text={`${sent} outreach message${sent !== 1 ? 's' : ''} sent with no replies yet. Follow up or adjust timing.`} />
          )}
        </div>

        {onCreateAd && (
          <button
            onClick={() => onCreateAd(adContext)}
            className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0070E0] text-white text-xs font-semibold
                       hover:bg-[#5DADE2] transition-colors duration-150
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            Generate targeted post from insights
          </button>
        )}
      </div>

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] px-4 py-4 flex flex-col gap-1">
      <p className="text-xs text-[#8B9DB5]">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-[#4A7BA7]">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] px-4 py-4">
      <p className="text-xs font-semibold text-[#A9CEE8] mb-3">{title}</p>
      {children}
    </div>
  )
}

function Insight({ text, positive }: { text: string; positive?: boolean }) {
  return (
    <div className={`flex gap-2 items-start rounded-xl px-3 py-2.5 border ${positive ? 'border-green-800 bg-green-950/40' : 'border-[#4A7BA7] bg-[#002855]/60'}`}>
      <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${positive ? 'bg-green-400' : 'bg-[#5DADE2]'}`} />
      <p className={positive ? 'text-green-300' : 'text-[#A9CEE8]'}>{text}</p>
    </div>
  )
}
