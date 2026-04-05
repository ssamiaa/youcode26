import Anthropic from '@anthropic-ai/sdk'

// fields calude will give back to us 
export interface ParsedNeed {
  languages: string[]         
  availability: string[]      
  neighbourhood: string     
  cause_areas: string[]       
  skills: string[]           
  requires_background_check: boolean  
}

// claude turns coordinators into sturctured data
export async function parseNeed(rawDescription: string): Promise<ParsedNeed> {
    
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,

    // claude prompt
    system: `You are a volunteer matching assistant.
Extract structured criteria from the coordinator's request.
Return ONLY valid JSON, no other text.
IMPORTANT: Only include values that are EXPLICITLY mentioned. If something is not clearly stated, leave it as empty array or empty string. Do not guess or infer.
{
  "languages": [],
  "availability": [],
  "neighbourhood": "",
  "cause_areas": [],
  "skills": [],
  "requires_background_check": false
}
Map availability to one of: "weekday mornings", "weekday afternoons",
"weekday evenings", "weekends only", "weekend mornings",
"weekend afternoons", "flexible / as needed", "weekdays only", "evenings only".
If availability is not clearly stated, return empty array.
If language is not clearly stated, return empty array.
If neighbourhood is not clearly stated, return empty string.`,

    messages: [{ role: 'user', content: rawDescription }],
  })

  // claude response text
  const text = response.content[0].type === 'text' ? response.content[0].text : ''

// Remove markdown backticks if Claude added them
const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

return JSON.parse(clean) as ParsedNeed
}