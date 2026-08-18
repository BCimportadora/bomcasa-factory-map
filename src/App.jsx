import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import AccountPage from './pages/AccountPage'
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
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/*
        Reset arrives from an email link carrying a recovery token, so it must be
        reachable without a normal session and must not be pushed to /setup.
      */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
      <Route path="/account" element={protectedPage(<AccountPage />)} />
      <Route path="/admin/accounts" element={protectedPage(<AdminAccountsPage />, { requireAdmin: true })} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
