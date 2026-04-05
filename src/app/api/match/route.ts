import { parseNeed } from '../../../../lib/ai/parseNeed'
import { scoreAndMatch } from '../../../../lib/matching/score'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  
  // Get the coordinators text description
  const { description } = await req.json() as { description: string }

  // parse
  const criteria = await parseNeed(description)

  // Score and find top 5 
  const topVolunteers = await scoreAndMatch(criteria)

  // claude writes a reason for each match
  const withReasons = await Promise.all(
    topVolunteers.map(async (volunteer) => {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Volunteer: ${JSON.stringify(volunteer)}
Need: ${description}
Write one sentence (max 25 words) explaining why this is a good match. Be specific.`
        }]
      })
      const reason = response.content[0].type === 'text' ? response.content[0].text : ''
      return { ...volunteer, reason }
    })
  )

  // Return the top 5 with scores and reasons
  return Response.json(withReasons)
}