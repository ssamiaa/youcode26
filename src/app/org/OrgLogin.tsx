import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function OrgLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) { setErrorMsg('Supabase not configured.'); setStatus('error'); return }
    setStatus('submitting')
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      const isUnconfirmed = error.message.toLowerCase().includes('not confirmed') || error.message.toLowerCase().includes('email')
      setErrorMsg(
        isUnconfirmed
          ? 'Your email hasn\'t been confirmed yet. Check your inbox for a confirmation link — or ask your admin to disable email confirmation in Supabase.'
          : error.message
      )
    } else {
      navigate('/org')
    }
  }

  return (
    <div className="min-h-screen bg-[#002855] flex flex-col">
      <header className="border-b border-[#1A3A52] px-4 py-3">
        <p className="text-3xl font-bold tracking-widest text-[#8B9DB5] uppercase">Relinkd</p>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="border border-[#A9CEE8] rounded-2xl shadow-sm overflow-hidden bg-[#1A3A52]">
            <div className="px-6 py-6 border-b border-[#4A7BA7]">
              <h1 className="text-2xl font-bold text-white">Welcome back</h1>
              <p className="text-sm text-[#8B9DB5] mt-1">Sign in to your organization account.</p>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                             focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                             placeholder:text-[#4A7BA7] bg-[#002855]"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#A9CEE8] mb-1.5">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full border border-[#4A7BA7] rounded-xl text-white text-sm px-3 py-2.5
                             focus:outline-none focus:border-[#0070E0] focus:ring-1 focus:ring-[#0070E0]
                             placeholder:text-[#4A7BA7] bg-[#002855]"
                />
              </div>

              {status === 'error' && (
                <p role="alert" className="text-xs text-red-300 border border-red-400/30 rounded-xl px-3 py-2 bg-red-900/20">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full bg-[#0070E0] text-white text-sm font-semibold py-2.5 px-4 rounded-xl
                           hover:bg-[#5DADE2] focus-visible:outline focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-[#0070E0]
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
              >
                {status === 'submitting' ? 'Signing in…' : 'Sign in'}
              </button>

              <p className="text-center text-xs text-[#8B9DB5]">
                Don't have an account?{' '}
                <Link to="/org/signup" className="text-[#5DADE2] hover:text-white transition-colors">
                  Register your organization
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
