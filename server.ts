import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { parseNeed } from './lib/ai/parseNeed.js'
import { scoreAndMatch } from './lib/matching/score.js'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!
  return createClient(process.env.VITE_SUPABASE_URL!, key)
}

const app = express()
app.use(cors())
app.use(express.json())

console.log('starting server...')
console.log('SUPABASE URL:', process.env.VITE_SUPABASE_URL)
console.log('ANTHROPIC KEY exists:', !!process.env.ANTHROPIC_API_KEY)

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Parse endpoint
app.post('/api/parse', async (req, res) => {
  const { description } = req.body
  const parsed = await parseNeed(description)
  res.json(parsed)
})

app.post('/api/match', async (req, res) => {
    const { message } = req.body
    
    
    if (!message) {
      return res.json({ reply: "Hi! Describe what kind of volunteer help you need." })
    }

  // Claude parses whatever the coordinator typed so far
  const criteria = await parseNeed(message)

  // Check what info is missing and ask for it one at a time
  if (!criteria.languages.length) {
    return res.json({ reply: "What language should the volunteer speak?" })
  }
  if (!criteria.availability.length) {
    return res.json({ reply: "What days or times do they need to be available?" })
  }
  if (!criteria.neighbourhood) {
    return res.json({ reply: "What neighbourhood is this for?" })
  }
  if (!criteria.cause_areas.length) {
    return res.json({ reply: "What kind of work is this for?" })
  }

  // All fields filled score
  const topVolunteers = await scoreAndMatch(criteria)

  // reason for each match
  const withReasons = await Promise.all(
    topVolunteers.map(async (volunteer) => {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Volunteer: ${JSON.stringify(volunteer)}
Need: ${message}
Write one sentence (max 25 words) explaining why this is a good match. Be specific.`
        }]
      })
      const reason = response.content[0].type === 'text' ? response.content[0].text : ''
      return { 
        ...volunteer, 
        reason,
        match_score: volunteer.score,
        match_reason: reason,
        skills: volunteer.skills?.split(';').map((s: string) => s.trim()) ?? [],
        languages_spoken: volunteer.languages_spoken?.split(';').map((l: string) => l.trim()) ?? [],
      }
    })
  )
  const tagResponse = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `Summarise this volunteer need in 2-4 words max, like a tag. No punctuation. Example: "Cantonese elder care weekends". Need: ${message}`
    }]
  })
  const session_tag = tagResponse.content[0].type === 'text' ? tagResponse.content[0].text.trim() : ''

  // Save all matches to the DB
  const supabase = getSupabase()
  const rows = withReasons.map(v => ({
    volunteer_id: v.volunteer_id,
    score: v.match_score ?? null,
    reason: v.match_reason ?? null,
    session_tag: session_tag || null,
    status: 'matched',
  }))
  const { error: insertError } = await supabase.from('matches').insert(rows)
  if (insertError) console.error('matches insert error:', insertError.message)

  return res.json({
    reply: `I found ${withReasons.length} great matches for you!`,
    volunteers: withReasons,
    session_tag
  })
})

// Mark a matched volunteer as 'interested'
app.post('/api/outreach', async (req, res) => {
  const { volunteer_id, session_tag } = req.body
  if (!volunteer_id) return res.status(400).json({ error: 'volunteer_id required' })

  const supabase = getSupabase()

  // Try to update an existing match row for this volunteer + session
  const { data, error } = await supabase
    .from('matches')
    .update({ status: 'sent' })
    .eq('volunteer_id', volunteer_id)
    .eq('session_tag', session_tag)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// Fetch pipeline entries joined with volunteer info
app.get('/api/pipeline', async (_req, res) => {
  const supabase = getSupabase()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  if (!matches?.length) return res.json([])

  // Fetch volunteer details for each unique volunteer_id
  const volunteerIds = [...new Set(matches.map((m: { volunteer_id: string }) => m.volunteer_id))]
  const { data: volunteers } = await supabase
    .from('volunteers')
    .select('volunteer_id, first_name, last_name, neighbourhood, skills')
    .in('volunteer_id', volunteerIds)

  const volunteerMap = Object.fromEntries(
    (volunteers ?? []).map((v: { volunteer_id: string; first_name: string; last_name: string; neighbourhood: string; skills: string }) => [v.volunteer_id, v])
  )

  const entries = matches.map((m: { volunteer_id: string; skills?: string[] }) => {
    const v = volunteerMap[m.volunteer_id] ?? {}
    return {
      ...m,
      first_name: v.first_name,
      last_name: v.last_name,
      neighbourhood: v.neighbourhood,
      skills: v.skills ? v.skills.split(';').map((s: string) => s.trim()) : [],
    }
  })

  return res.json(entries)
})

app.listen(3001, () => console.log('Server running on port 3001'))