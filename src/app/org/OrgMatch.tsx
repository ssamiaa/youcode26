import ConversationUI, { type MatchResult } from '../../components/conversation/ConversationUI'

export default function OrgMatch() {
  async function handleSend(text: string): Promise<MatchResult> {
    const res = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    if (!res.ok) throw new Error(`Server error: ${res.status}`)
    return res.json()
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="flex-shrink-0 border-b border-gray-200 px-4 py-3">
        <h1 className="text-base font-bold !text-black">Find Volunteers</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Describe what you need in plain language.
        </p>
      </header>

      <div className="flex-1 min-h-0">
        <ConversationUI onSendMessage={handleSend} />
      </div>
    </div>
  )
}
