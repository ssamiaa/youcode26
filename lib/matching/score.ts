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
    let score = 0
    if (criteria.languages.some(lang => v.languages_spoken?.toLowerCase().includes(lang.toLowerCase()))) score += 40
    if (criteria.availability.some(a => v.availability?.toLowerCase().includes(a.toLowerCase()))) score += 25
    if (criteria.requires_background_check && v.background_check_status === 'Completed') score += 20
    if (criteria.skills.some(s => v.skills?.toLowerCase().includes(s.toLowerCase()))) score += 15
    if (criteria.cause_areas.some(c => v.cause_areas_of_interest?.toLowerCase().includes(c.toLowerCase()))) score += 10
    if (criteria.neighbourhood && v.neighbourhood?.toLowerCase().includes(criteria.neighbourhood.toLowerCase())) score += 5
    return { ...v, score }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, 5)
}