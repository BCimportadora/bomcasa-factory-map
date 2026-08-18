import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import FactoriesPage from './pages/FactoriesPage'
import PeoplePage from './pages/PeoplePage'
import PortsPage from './pages/PortsPage'
import AdminAccountsPage from './pages/AdminAccountsPage'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import AppLayout from './components/Layout/AppLayout'

/**
 * There is deliberately no /signup route: accounts are created by an
 * administrator only (see supabase/functions/admin-create-user).
 */
const protectedPage = (element, { requireAdmin = false } = {}) => (
  <ProtectedRoute requireAdmin={requireAdmin}>
    <AppLayout>{element}</AppLayout>
  </ProtectedRoute>
)

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Onboarding runs before the profile is complete, so it skips that check. */}
      <Route
        path="/setup"
        element={
          <ProtectedRoute requireProfile={false}>
            <ProfileSetupPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={protectedPage(<FactoriesPage />)} />
      <Route path="/people" element={protectedPage(<PeoplePage />)} />
      <Route path="/ports" element={protectedPage(<PortsPage />)} />
      <Route path="/admin/accounts" element={protectedPage(<AdminAccountsPage />, { requireAdmin: true })} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
