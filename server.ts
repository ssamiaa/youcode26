import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import express from 'express'
import cors from 'cors'
import { parseNeed } from './lib/ai/parseNeed.js'
import { scoreAndMatch } from './lib/matching/score.js'
import Anthropic from '@anthropic-ai/sdk'

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
  
  // Return reply + volunteers + session tag
  return res.json({
    reply: `I found ${withReasons.length} great matches for you!`,
    volunteers: withReasons,
    session_tag
  })

  // Return reply + volunteers so the UI can show match cards
  return res.json({
    reply: `I found ${withReasons.length} great matches for you!`,
    volunteers: withReasons
  })
})

app.listen(3001, () => console.log('Server running on port 3001'))