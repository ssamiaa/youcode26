import { useState, useEffect, useRef, useCallback } from 'react'

export interface Message {
  id: string
  role: 'assistant' | 'user'
  text: string
}

export interface MatchResult {
  reply: string
  volunteers?: unknown[]
  session_tag?: string
}

interface ConversationUIProps {
  onSendMessage: (text: string) => Promise<MatchResult>
  initialMessage?: string
}

const INITIAL_MSG: Message = {
  id: 'init',
  role: 'assistant',
  text: "Hi! Describe what kind of volunteer help you need — skills, availability, neighbourhood, anything that's useful. I'll find the best matches for you.",
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export default function ConversationUI({ onSendMessage, initialMessage }: ConversationUIProps) {
  const firstMsg: Message = initialMessage
    ? { ...INITIAL_MSG, text: initialMessage }
    : INITIAL_MSG

  const [messages, setMessages] = useState<Message[]>([firstMsg])
  const [input, setInput] = useState('')
  const [interimText, setInterimText] = useState('')   // live speech preview
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const [speechSupported] = useState(() => getSpeechRecognition() !== null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const committedInputRef = useRef('')   // tracks committed (non-interim) input value

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const announce = (text: string) => {
    if (liveRef.current) liveRef.current.textContent = text
  }

  const addMessage = (msg: Omit<Message, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`
    setMessages(prev => [...prev, { ...msg, id }])
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    // Stop recording if active
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setRecording(false)
    }

    setInput('')
    setInterimText('')
    committedInputRef.current = ''
    addMessage({ role: 'user', text: trimmed })
    setLoading(true)
    announce('Searching for volunteers…')

    try {
      const result = await onSendMessage(trimmed)
      addMessage({ role: 'assistant', text: result.reply })
      announce('Response received.')
    } catch {
      addMessage({ role: 'assistant', text: 'Something went wrong. Please try again.' })
      announce('Error. Please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [loading, onSendMessage])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    committedInputRef.current = e.target.value
  }

  function toggleRecording() {
    setSpeechError('')
    const SR = getSpeechRecognition()
    if (!SR) return

    if (recording) {
      recognitionRef.current?.stop()
      setRecording(false)
      setInterimText('')
      return
    }

    const recognition = new SR()
    recognition.lang = 'en-CA'
    recognition.continuous = true      // keep listening until manually stopped
    recognition.interimResults = true  // show words as they're spoken
    recognitionRef.current = recognition

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let finalChunk = ''

      for (let i = e.results.length - 1; i >= 0; i--) {
        const result = e.results[i]
        if (result.isFinal) {
          finalChunk = result[0].transcript
          break
        } else {
          interim = result[0].transcript
        }
      }

      if (finalChunk) {
        const base = committedInputRef.current
        const updated = base ? base + ' ' + finalChunk.trim() : finalChunk.trim()
        committedInputRef.current = updated
        setInput(updated)
        setInterimText('')
      } else {
        setInterimText(interim)
      }
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'no-speech') setSpeechError('Microphone error: ' + e.error)
      setRecording(false)
      setInterimText('')
    }

    recognition.onend = () => {
      setRecording(false)
      setInterimText('')
    }

    recognition.start()
    setRecording(true)
  }

  // Combined display value: committed text + live interim preview
  const displayValue = interimText
    ? (input ? input + ' ' + interimText : interimText)
    : input

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Screen-reader live region */}
      <div ref={liveRef} aria-live="polite" aria-atomic="true" className="sr-only" />

      {/* Message thread */}
      <div
        role="log"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-2xl
                ${msg.role === 'user'
                  ? 'bg-black text-white rounded-br-sm'
                  : 'bg-gray-100 text-black border border-gray-200 rounded-bl-sm'
                }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start" aria-label="Searching…">
            <div className="bg-gray-100 border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm">
              <span className="inline-flex gap-1" aria-hidden="true">
                <Dot delay="0ms" />
                <Dot delay="160ms" />
                <Dot delay="320ms" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Recording animation */}
      {recording && (
        <div
          aria-live="polite"
          aria-label="Recording active"
          className="flex items-center justify-center gap-2 py-2 bg-gray-50 border-t border-gray-100"
        >
          <SoundWave />
          <span className="text-xs text-gray-500 font-medium">Listening…</span>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        {speechError && (
          <p role="alert" className="text-xs text-red-700 mb-2 rounded">{speechError}</p>
        )}

        <div className="flex items-end gap-2">
          <label htmlFor="conversation-input" className="sr-only">
            Describe what you need
          </label>
          <textarea
            ref={inputRef}
            id="conversation-input"
            rows={1}
            value={displayValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={recording ? 'Speak now…' : 'Describe what you need…'}
            disabled={loading}
            aria-disabled={loading}
            className={`flex-1 resize-none border text-black text-sm px-3 py-2.5 rounded-xl
                       focus:outline-none focus:border-black focus:ring-1 focus:ring-black
                       placeholder:text-gray-400 bg-white disabled:opacity-50
                       max-h-32 overflow-y-auto transition-colors duration-150
                       ${recording ? 'border-black' : 'border-gray-400'}`}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />

          {speechSupported && (
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? 'Stop recording' : 'Start voice input'}
              aria-pressed={recording}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full border
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                         focus-visible:outline-black transition-colors duration-150
                         ${recording
                           ? 'bg-black text-white border-black'
                           : 'bg-white text-black border-gray-400 hover:border-black'
                         }`}
            >
              <MicIcon recording={recording} />
            </button>
          )}

          <button
            type="button"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full
                       bg-black text-white border border-black
                       hover:bg-gray-900 focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-black
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors duration-150"
          >
            <SendIcon />
          </button>
        </div>

        <p className="mt-1.5 text-xs text-gray-400">
          <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift+Enter</kbd> for new line
          {speechSupported && ' · tap mic to speak'}
        </p>
      </div>
    </div>
  )
}

// Animated sound wave shown while recording
function SoundWave() {
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden="true">
      {[0, 80, 160, 80, 0].map((delay, i) => (
        <span
          key={i}
          className="w-[3px] bg-black rounded-full animate-pulse"
          style={{
            height: `${[8, 14, 16, 14, 8][i]}px`,
            animationDelay: `${delay}ms`,
            animationDuration: '700ms',
          }}
        />
      ))}
    </span>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block animate-bounce"
      style={{ animationDelay: delay }}
    />
  )
}

function MicIcon({ recording }: { recording: boolean }) {
  return recording ? (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
