import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

const AuthContext = createContext<Session | null | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    }) ?? setSession(null)

    const subscription = supabase?.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription?.data.subscription.unsubscribe()
  }, [])

  // undefined = still loading
  return (
    <AuthContext.Provider value={session}>
      {children}
    </AuthContext.Provider>
  )
}

/** Returns `undefined` while loading, `null` when logged out, or the Session when logged in. */
export function useSession() {
  return useContext(AuthContext)
}
