import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useSession } from './lib/AuthContext'
import OrgSignup from './app/org/OrgSignup'
import OrgLogin from './app/org/OrgLogin'
import OrgDashboard from './app/org/OrgDashboard'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const session = useSession()
  if (session === undefined) return null // still loading
  if (!session) return <Navigate to="/org/login" replace />
  return <>{children}</>
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const session = useSession()
  if (session === undefined) return null // still loading
  if (session) return <Navigate to="/org" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/org/signup" element={<PublicOnlyRoute><OrgSignup /></PublicOnlyRoute>} />
          <Route path="/org/login"  element={<PublicOnlyRoute><OrgLogin /></PublicOnlyRoute>} />
          <Route path="/org"        element={<ProtectedRoute><OrgDashboard /></ProtectedRoute>} />
          <Route path="*"           element={<Navigate to="/org/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
