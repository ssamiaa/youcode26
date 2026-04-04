import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import OrgSignup from './app/org/OrgSignup'
import OrgDashboard from './app/org/OrgDashboard'
import { AdPipelineUI } from './components/AdPipelineUI'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/org/signup" element={<OrgSignup />} />
        <Route path="/org" element={<OrgDashboard />} />
        <Route path="/ad-pipeline" element={<AdPipelineUI />} />
        <Route path="*" element={<Navigate to="/org/signup" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
