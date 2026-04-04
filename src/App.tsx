import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import OrgSignup from './app/org/OrgSignup'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/org/signup" element={<OrgSignup />} />
        <Route path="*" element={<Navigate to="/org/signup" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
