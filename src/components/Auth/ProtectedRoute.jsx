import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import FullScreenMessage from '../common/FullScreenMessage'

/**
 * Route guard.
 *
 * This is a usability layer, not the security boundary: every rule below is
 * also enforced by row-level security in Postgres and by the account-creation
 * Edge Function, so bypassing the client gains nothing.
 */
export default function ProtectedRoute({ children, requireAdmin = false, requireProfile = true }) {
  const { user, loading, isAdmin, profileComplete } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  if (loading) {
    return <FullScreenMessage>{t('auth.checkingSession')}</FullScreenMessage>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (requireProfile && !profileComplete) {
    return <Navigate to="/setup" replace />
  }

  if (requireAdmin && !isAdmin) {
    return (
      <FullScreenMessage title={t('errors.accessDenied')} action={{ to: '/', label: t('errors.backToApp') }}>
        {t('errors.accessDeniedMessage')}
      </FullScreenMessage>
    )
  }

  return children
}
