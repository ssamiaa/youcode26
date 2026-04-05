import { useState, useEffect, useCallback, useId } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { PipelineEntry } from '../pipeline/PipelineBoard'

interface AnalyticsUIProps {
  /** Full combined string, a single clause, or '' — forwarded to the post pipeline as `insightsContext`. */
  onCreateAd?: (context: string) => void
  orgBn?: string
}

interface OtherInsightOption {
  id: string
  title: string
  clause: string
}

type InsightModalTab = 'interested' | 'not_converted' | 'other'

const RANDOM_CHOICE = 'random' as const

function clauseInterestedSkill(skill: string, count: number) {
  const n = count === 1 ? 'volunteer' : 'volunteers'
  return `Among interested volunteers, ${skill} is a leading skill (${count} interested ${n}).`
}

function clauseNotConvertedSkill(skill: string, count: number) {
  const n = count === 1 ? 'volunteer' : 'volunteers'
  return `Among volunteers who have not yet converted, ${skill} appears often (${count} ${n}).`
}

const STATUS_COLORS: Record<string, string> = {
  matched:        '#4A7BA7',
  sent:           '#0070E0',
  interested:     '#5DADE2',
  not_interested: '#8B9DB5',
}

const STATUS_LABELS: Record<string, string> = {
  matched:        'Matched',
  sent:           'Sent',
  interested:     'Interested',
  not_interested: 'Not interested',
}

export default function AnalyticsUI({ onCreateAd, orgBn }: AnalyticsUIProps) {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [insightModalOpen, setInsightModalOpen] = useState(false)
  const [insightModalTab, setInsightModalTab] = useState<InsightModalTab>('interested')
  const [insightChoice, setInsightChoice] = useState<string>(RANDOM_CHOICE)
  const insightModalTitleId = useId()
  const insightModalDescId = useId()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const url = orgBn ? `/api/pipeline?org_bn=${encodeURIComponent(orgBn)}` : '/api/pipeline'
      const res = await fetch(url)
      if (!res.ok) { setEntries([]); return }
      const data: PipelineEntry[] = await res.json()
      setEntries(data)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [orgBn])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!insightModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInsightModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [insightModalOpen])

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
  const missedSkillsRanked = Object.entries(notInterestedSkills)
    .filter(([s]) => !skillCount[s])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({ skill, count }))

  const missedSkills = missedSkillsRanked.map(m => m.skill)

  const otherInsightOptions: OtherInsightOption[] = []
  if (topNeighbourhoods.length) {
    otherInsightOptions.push({
      id: 'neighbourhoods',
      title: 'Strongest neighbourhoods',
      clause: `Strongest neighbourhoods: ${topNeighbourhoods.slice(0, 3).map(n => n.neighbourhood).join(', ')}.`,
    })
  }
  if (interestRate > 0) {
    otherInsightOptions.push({
      id: 'interest-rate',
      title: 'Interest rate',
      clause: `Current interest rate: ${interestRate}%.`,
    })
  }

  const interestedSkillClauses = topSkills.map(s => clauseInterestedSkill(s.skill, s.count))
  const notConvertedSkillClauses = missedSkillsRanked.map(s => clauseNotConvertedSkill(s.skill, s.count))
  const otherClauses = otherInsightOptions.map(o => o.clause)
  const fullRandomContext = [...interestedSkillClauses, ...notConvertedSkillClauses, ...otherClauses].join(' ')
  const hasAnyInsightPayload = fullRandomContext.trim().length > 0

  function openInsightModal() {
    setInsightModalOpen(true)
    if (topSkills.length > 0) {
      setInsightModalTab('interested')
      setInsightChoice('int-0')
    } else if (missedSkillsRanked.length > 0) {
      setInsightModalTab('not_converted')
      setInsightChoice('miss-0')
    } else {
      setInsightModalTab('other')
      setInsightChoice(RANDOM_CHOICE)
    }
  }

  function setModalTab(tab: InsightModalTab) {
    setInsightModalTab(tab)
    if (tab === 'interested' && topSkills.length > 0) setInsightChoice('int-0')
    else if (tab === 'not_converted' && missedSkillsRanked.length > 0) setInsightChoice('miss-0')
    else setInsightChoice(RANDOM_CHOICE)
  }

  function confirmTargetedPost() {
    if (!onCreateAd) return
    if (!hasAnyInsightPayload) {
      onCreateAd('')
      setInsightModalOpen(false)
      return
    }
    if (insightChoice === RANDOM_CHOICE) {
      onCreateAd(fullRandomContext)
      setInsightModalOpen(false)
      return
    }
    const intM = /^int-(\d+)$/.exec(insightChoice)
    if (intM) {
      const row = topSkills[Number(intM[1])]
      onCreateAd(row ? clauseInterestedSkill(row.skill, row.count) : fullRandomContext)
      setInsightModalOpen(false)
      return
    }
    const missM = /^miss-(\d+)$/.exec(insightChoice)
    if (missM) {
      const row = missedSkillsRanked[Number(missM[1])]
      onCreateAd(row ? clauseNotConvertedSkill(row.skill, row.count) : fullRandomContext)
      setInsightModalOpen(false)
      return
    }
    const otherM = /^other-(.+)$/.exec(insightChoice)
    if (otherM) {
      const opt = otherInsightOptions.find(o => o.id === otherM[1])
      onCreateAd(opt?.clause ?? fullRandomContext)
    } else {
      onCreateAd(fullRandomContext)
    }
    setInsightModalOpen(false)
  }

  const insightSelectionValid =
    !hasAnyInsightPayload ||
    (insightModalTab === 'interested' &&
      topSkills.length > 0 &&
      (() => {
        const m = /^int-(\d+)$/.exec(insightChoice)
        return m != null && topSkills[Number(m[1])] != null
      })()) ||
    (insightModalTab === 'not_converted' &&
      missedSkillsRanked.length > 0 &&
      (() => {
        const m = /^miss-(\d+)$/.exec(insightChoice)
        return m != null && missedSkillsRanked[Number(m[1])] != null
      })()) ||
    (insightModalTab === 'other' &&
      (insightChoice === RANDOM_CHOICE ||
        otherInsightOptions.some(o => insightChoice === `other-${o.id}`)))

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
        <KpiCard label="Interested" value={interested} color="#5DADE2" />
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
            <ResponsiveContainer width="100%" height={Math.max(200, topSkills.length * 32)}>
              <BarChart data={topSkills} layout="vertical" margin={{ left: 10, right: 24 }}>
                <XAxis type="number" tick={{ fill: '#8B9DB5', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="skill" width={130} tick={{ fill: '#A9CEE8', fontSize: 11 }} axisLine={false} tickLine={false} />
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#A9CEE8] mt-2">
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
            type="button"
            onClick={openInsightModal}
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

      {insightModalOpen && onCreateAd && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="presentation"
          onClick={() => setInsightModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={insightModalTitleId}
            aria-describedby={insightModalDescId}
            className="w-full max-w-lg rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] shadow-xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h4 id={insightModalTitleId} className="text-sm font-bold text-white">
              Target an insight
            </h4>
            <p id={insightModalDescId} className="text-xs text-[#8B9DB5] leading-relaxed">
              Pick a skill to anchor the post, or use the Other tab for neighbourhoods, interest rate, or a random focus across all analytics lines.
            </p>

            {!hasAnyInsightPayload ? (
              <p className="text-xs text-[#A9CEE8]">
                No structured insight snippets are available yet. You can still open the post generator and run it without an analytics anchor.
              </p>
            ) : (
              <>
                <div
                  role="tablist"
                  aria-label="Insight category"
                  className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[#002855]/80 border border-[#4A7BA7]"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightModalTab === 'interested'}
                    disabled={topSkills.length === 0}
                    onClick={() => setModalTab('interested')}
                    className={`flex-1 min-w-[6.5rem] px-2 py-2 rounded-lg text-xs font-semibold transition-colors
                      ${insightModalTab === 'interested' ? 'bg-[#0070E0] text-white' : 'text-[#A9CEE8] hover:bg-[#1A3A52]'}
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                  >
                    Interested skills
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightModalTab === 'not_converted'}
                    disabled={missedSkillsRanked.length === 0}
                    onClick={() => setModalTab('not_converted')}
                    className={`flex-1 min-w-[6.5rem] px-2 py-2 rounded-lg text-xs font-semibold transition-colors
                      ${insightModalTab === 'not_converted' ? 'bg-[#0070E0] text-white' : 'text-[#A9CEE8] hover:bg-[#1A3A52]'}
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                  >
                    Not converted
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={insightModalTab === 'other'}
                    onClick={() => setModalTab('other')}
                    className={`flex-1 min-w-[5rem] px-2 py-2 rounded-lg text-xs font-semibold transition-colors
                      ${insightModalTab === 'other' ? 'bg-[#0070E0] text-white' : 'text-[#A9CEE8] hover:bg-[#1A3A52]'}`}
                  >
                    Other
                  </button>
                </div>

                <div
                  className="max-h-[min(280px,42vh)] overflow-y-auto pr-1 space-y-2"
                  role="tabpanel"
                >
                  {insightModalTab === 'interested' && (
                    topSkills.length === 0 ? (
                      <p className="text-xs text-[#8B9DB5] py-2">No skill data from interested volunteers yet.</p>
                    ) : (
                      <fieldset className="space-y-2 border-0 p-0 m-0">
                        <legend className="sr-only">Skill among interested volunteers</legend>
                        {topSkills.map((row, i) => (
                          <label
                            key={row.skill}
                            className="flex gap-3 items-start rounded-xl border border-[#4A7BA7] bg-[#002855]/60 px-3 py-2.5 cursor-pointer hover:border-[#0070E0] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0070E0]"
                          >
                            <input
                              type="radio"
                              name="insight-pick"
                              className="mt-0.5"
                              checked={insightChoice === `int-${i}`}
                              onChange={() => setInsightChoice(`int-${i}`)}
                            />
                            <span>
                              <span className="block text-xs font-semibold text-white">{row.skill}</span>
                              <span className="block text-[11px] text-[#8B9DB5] mt-0.5">
                                {row.count} interested volunteer{row.count !== 1 ? 's' : ''}
                              </span>
                              <span className="block text-[11px] text-[#4A7BA7] mt-1 leading-snug">
                                {clauseInterestedSkill(row.skill, row.count)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )
                  )}

                  {insightModalTab === 'not_converted' && (
                    missedSkillsRanked.length === 0 ? (
                      <p className="text-xs text-[#8B9DB5] py-2">
                        No &ldquo;not yet converted&rdquo; skill patterns yet, or all declining volunteers overlap with interested skills.
                      </p>
                    ) : (
                      <fieldset className="space-y-2 border-0 p-0 m-0">
                        <legend className="sr-only">Skill among volunteers not yet converted</legend>
                        {missedSkillsRanked.map((row, i) => (
                          <label
                            key={row.skill}
                            className="flex gap-3 items-start rounded-xl border border-[#4A7BA7] bg-[#002855]/60 px-3 py-2.5 cursor-pointer hover:border-[#0070E0] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0070E0]"
                          >
                            <input
                              type="radio"
                              name="insight-pick"
                              className="mt-0.5"
                              checked={insightChoice === `miss-${i}`}
                              onChange={() => setInsightChoice(`miss-${i}`)}
                            />
                            <span>
                              <span className="block text-xs font-semibold text-white">{row.skill}</span>
                              <span className="block text-[11px] text-[#8B9DB5] mt-0.5">
                                {row.count} not-yet-converted volunteer{row.count !== 1 ? 's' : ''}
                              </span>
                              <span className="block text-[11px] text-[#4A7BA7] mt-1 leading-snug">
                                {clauseNotConvertedSkill(row.skill, row.count)}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )
                  )}

                  {insightModalTab === 'other' && (
                    <fieldset className="space-y-2 border-0 p-0 m-0">
                      <legend className="sr-only">Other analytics anchors</legend>
                      <label className="flex gap-3 items-start rounded-xl border border-[#4A7BA7] bg-[#002855]/60 px-3 py-2.5 cursor-pointer hover:border-[#0070E0] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0070E0]">
                        <input
                          type="radio"
                          name="insight-pick"
                          className="mt-0.5"
                          checked={insightChoice === RANDOM_CHOICE}
                          onChange={() => setInsightChoice(RANDOM_CHOICE)}
                        />
                        <span>
                          <span className="block text-xs font-semibold text-white">Pick one for me</span>
                          <span className="block text-[11px] text-[#8B9DB5] mt-0.5">
                            Randomly chooses one line from every skill, neighbourhood, and rate insight above.
                          </span>
                        </span>
                      </label>
                      {otherInsightOptions.map(opt => (
                        <label
                          key={opt.id}
                          className="flex gap-3 items-start rounded-xl border border-[#4A7BA7] bg-[#002855]/60 px-3 py-2.5 cursor-pointer hover:border-[#0070E0] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0070E0]"
                        >
                          <input
                            type="radio"
                            name="insight-pick"
                            className="mt-0.5"
                            checked={insightChoice === `other-${opt.id}`}
                            onChange={() => setInsightChoice(`other-${opt.id}`)}
                          />
                          <span>
                            <span className="block text-xs font-semibold text-white">{opt.title}</span>
                            <span className="block text-[11px] text-[#A9CEE8] mt-0.5 leading-snug">{opt.clause}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setInsightModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#A9CEE8] border border-[#4A7BA7] hover:bg-[#002855] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTargetedPost}
                disabled={hasAnyInsightPayload && !insightSelectionValid}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0070E0] hover:bg-[#5DADE2] transition-colors
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]
                           disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {!hasAnyInsightPayload ? 'Open post generator' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] px-4 py-4 flex flex-col gap-1">
      <p className="text-xs font-semibold text-white">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-[#4A7BA7]">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#A9CEE8] bg-[#1A3A52] px-4 py-4">
      <p className="text-sm font-bold text-white mb-3">{title}</p>
      {children}
    </div>
  )
}

function Insight({ text, positive }: { text: string; positive?: boolean }) {
  return (
    <div className={`flex gap-2 items-center rounded-xl px-3 py-2.5 border ${positive ? 'border-[#0070E0] bg-[#0070E0]/10' : 'border-[#4A7BA7] bg-[#002855]/60'}`}>
      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${positive ? 'bg-[#5DADE2]' : 'bg-[#8B9DB5]'}`} />
      <p className={positive ? 'text-[#A9CEE8]' : 'text-[#8B9DB5]'}>{text}</p>
    </div>
  )
}
