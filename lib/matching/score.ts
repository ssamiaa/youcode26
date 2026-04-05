import { createClient } from '@supabase/supabase-js'
import type { ParsedNeed } from '../ai/parseNeed.js'

export async function scoreAndMatch(criteria: ParsedNeed) {

  // Create client here so env variables are already loaded
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  )

  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('*')

  if (error) throw new Error(error.message)

  const scored = volunteers.map((v) => {
    let score = 100

    // Language (most important — 40 point swing)
    const languageMatch = criteria.languages.some(lang =>
      v.languages_spoken?.toLowerCase().includes(lang.toLowerCase())
    )
    if (!languageMatch) score -= 40

    // Availability (second most important — 30 point swing)
    const availabilityMatch = criteria.availability.some(a =>
      v.availability?.toLowerCase().includes(a.toLowerCase())
    )
    if (!availabilityMatch) score -= 30

    // Neighbourhood (10 point swing)
    if (criteria.neighbourhood &&
      !v.neighbourhood?.toLowerCase().includes(criteria.neighbourhood.toLowerCase())) {
      score -= 10
    }

    // Background check bonus
    if (criteria.requires_background_check && v.background_check_status === 'Completed') {
      score += 5
    }

    // Skills bonus
    const skillMatch = criteria.skills.some(s =>
      v.skills?.toLowerCase().includes(s.toLowerCase())
    )
    if (skillMatch) score += 5

    // Cause area bonus
    const causeMatch = criteria.cause_areas.some(c =>
      v.cause_areas_of_interest?.toLowerCase().includes(c.toLowerCase())
    )
    if (causeMatch) score += 5

    // Clamp between 0 and 100
    const finalScore = Math.max(0, Math.min(100, score))

    return { ...v, score: finalScore }
  })

  // Filter out bad matches and return top 5
  return scored
    .filter(v => v.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}