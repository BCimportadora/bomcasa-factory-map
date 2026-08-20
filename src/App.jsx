import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import AccountPage from './pages/AccountPage'
import HomePage from './pages/HomePage'
import FactoriesPage from './pages/FactoriesPage'
import PeoplePage from './pages/PeoplePage'
import PortsPage from './pages/PortsPage'
import AdminAccountsPage from './pages/AdminAccountsPage'
import SectionPlaceholder from './pages/SectionPlaceholder'
import ProtectedRoute from './components/Auth/ProtectedRoute'
import RecoveryRedirect from './components/Auth/RecoveryRedirect'
import ThemeSync from './components/Layout/ThemeSync'
import AppLayout from './components/Layout/AppLayout'
import { SECTIONS } from './lib/sections'

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
    <>
      <RecoveryRedirect />
      {/* Sits outside the routes: it has to see the signed-out state, which
          never renders the application layout. */}
      <ThemeSync />
      <AppRoutes />
    </>
  )
}

function AppRoutes() {
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

      {/* Signing in lands on the main menu, not inside a section. */}
      <Route path="/" element={protectedPage(<HomePage />)} />

      <Route path="/factories" element={protectedPage(<FactoriesPage />)} />
      <Route path="/people" element={protectedPage(<PeoplePage />)} />
      <Route path="/ports" element={protectedPage(<PortsPage />)} />
      <Route path="/account" element={protectedPage(<AccountPage />)} />
      <Route path="/admin/accounts" element={protectedPage(<AdminAccountsPage />, { requireAdmin: true })} />

      {/*
        Sections that are announced on the menu but not built yet. Driven from
        the same list the menu renders, so adding a section there is enough to
        give it a reachable route.
      */}
      {SECTIONS.filter((section) => !section.ready).map((section) => (
        <Route
          key={section.id}
          path={section.path}
          element={protectedPage(<SectionPlaceholder sectionId={section.id} />)}
        />
      ))}

      {/* The old map URL; keep existing bookmarks working. */}
      <Route path="/map" element={<Navigate to="/factories" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
