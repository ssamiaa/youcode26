import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { parseNeed } from './lib/ai/parseNeed.js'
import { scoreAndMatch } from './lib/matching/score.js'
import Anthropic from '@anthropic-ai/sdk'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env' })

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY!
  return createClient(process.env.VITE_SUPABASE_URL!, key)
}

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

console.log('starting server...')
console.log('SUPABASE URL:', process.env.VITE_SUPABASE_URL)
console.log('ANTHROPIC KEY exists:', !!process.env.ANTHROPIC_API_KEY)

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// store in memory to remember conversation history per session
const sessions = new Map<string, string>()

// Parse endpoint - turns plain text into structured JSON
app.post('/api/parse', async (req, res) => {
  const { description } = req.body
  const parsed = await parseNeed(description)
  res.json(parsed)
})

// Match endpoint - guided conversation + scoring + reasons
app.post('/api/match', async (req, res) => {
  const { message, session_id } = req.body

  if (!message) {
    return res.json({ reply: "Hi! Describe what kind of volunteer help you need." })
  }

  // Generate a new session ID if this is the first message
  const id = (session_id && session_id !== '') ? session_id : `session-${Date.now()}`


  // Accumulate all messages so Claude has full context from the whole conversation
  const previous = sessions.get(id) ?? ''
  const accumulated = previous ? `${previous}. ${message}` : message
  sessions.set(id, accumulated)

  console.log('SESSION ID:', id)
  console.log('ACCUMULATED:', accumulated)

  // Claude parses the full accumulated conversation so far
  const criteria = await parseNeed(accumulated)

  console.log('PARSED CRITERIA:', JSON.stringify(criteria))

  // Only block on truly essential fields — language, availability, neighbourhood
  if (!criteria.languages.length) {
    return res.json({ reply: "What language should the volunteer speak?", session_id: id })
  }
  if (!criteria.availability.length) {
    return res.json({ reply: "What days or times do they need to be available?", session_id: id })
  }
  if (!criteria.neighbourhood) {
    return res.json({ reply: "What neighbourhood is this for?", session_id: id })
  }
  // cause_areas is optional — don't block on it

  // All essential fields filled — score volunteers from Supabase
  const topVolunteers = await scoreAndMatch(criteria)

  // Claude writes a reason for each match
  const withReasons = await Promise.all(
    topVolunteers.map(async (volunteer) => {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Volunteer: ${JSON.stringify(volunteer)}
Need: ${accumulated}
Reply with a single plain sentence (no markdown, no bullet points, no headers) of max 25 words explaining why this volunteer is a good match. Only output the sentence itself.`
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

  // Claude generates a short session tag summarising the task
  const tagResponse = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `Summarise this volunteer need in 2-4 words max, like a tag. No punctuation. Example: "Cantonese elder care weekends". Need: ${accumulated}`
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
    session_tag,
    session_id: id
  })

})

// Send outreach SMS and update match status to 'sent'
app.post('/api/outreach', async (req, res) => {
  const { volunteer_id, session_tag } = req.body
  const supabase = getSupabase()

  const { data: volunteer } = await supabase
    .from('volunteers')
    .select('first_name, last_name, phone')
    .eq('volunteer_id', volunteer_id)
    .single()

  if (!volunteer) return res.status(404).json({ error: 'Volunteer not found' })

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .update({ status: 'sent' })
    .eq('volunteer_id', volunteer_id)
    .eq('session_tag', session_tag)
    .select('id')
    .single()

  console.log('outreach match update:', match, matchError)

  await twilioClient.messages.create({
    body: `Hi ${volunteer.first_name}! An organization needs your help. Interested? Reply YES or NO.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: volunteer.phone ?? process.env.MY_PHONE_NUMBER!
  })

  res.json({ success: true, match_id: match?.id })
})

// Twilio webhook — handle YES/NO replies
app.post('/api/webhook', async (req, res) => {
  const body = (req.body.Body as string)?.trim().toUpperCase()
  const supabase = getSupabase()

  const { data: match, error: webhookError } = await supabase
    .from('matches')
    .select('id')
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  console.log('webhook match lookup:', match, webhookError)

  let responseText = ''
  if (body === 'YES') {
    if (match) await supabase.from('matches').update({ status: 'interested' }).eq('id', match.id)
    responseText = `Great, thank you! We'll be in touch shortly.`
  } else {
    if (match) await supabase.from('matches').update({ status: 'not_interested' }).eq('id', match.id)
    responseText = `No worries, thank you for letting us know!`
  }

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${responseText}</Message></Response>`)
})

/** PostgREST-safe identifier (alphanumeric + underscore). */
function isSafeDbColumn(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(s)
}

/** Allowed organization fields to update. */
const ORG_UPDATE_KEYS = new Set([
  'bn', 'legal_name', 'account_name', 'mission', 'address1', 'address2',
  'city', 'province', 'postal_code', 'country', 'sector', 'website', 'email',
])

// Update organization profile (uses service role / server key — same as pipeline & outreach)
app.patch('/api/organization', async (req, res) => {
  const body = req.body as {
    filter?: { column: string; value: string }
    updates?: Record<string, unknown>
  }
  const { filter, updates } = body
  if (!filter?.column || typeof filter.value !== 'string' || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Request must include filter { column, value } and updates object.' })
  }
  if (!isSafeDbColumn(filter.column)) {
    return res.status(400).json({ error: 'Invalid filter column name.' })
  }

  const sanitized: Record<string, unknown> = {}
  for (const key of Object.keys(updates)) {
    if (ORG_UPDATE_KEYS.has(key)) sanitized[key] = updates[key]
  }
  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update.' })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('organizations')
    .update(sanitized)
    .eq(filter.column, filter.value)
    .select()

  if (error) return res.status(400).json({ error: error.message })

  const rows = data ?? []
  if (rows.length === 0) {
    return res.status(404).json({
      error:
        'No row was updated. If you use Supabase Row Level Security, the anon client cannot UPDATE from the browser; this API path uses the server key and should still work—check that filter column/value matches your organizations table.',
    })
  }

  return res.json({ ok: true, organization: rows[0] })
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