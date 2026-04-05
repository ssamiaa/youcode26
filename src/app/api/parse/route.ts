import { parseNeed } from '../../../../lib/ai/parseNeed'

// frontend sends a request to /api/parse
export async function POST(req: Request) {
  
  // description the coordinator typed
  const { description } = await req.json() as { description: string }

  const parsed = await parseNeed(description)

  return Response.json(parsed)
}