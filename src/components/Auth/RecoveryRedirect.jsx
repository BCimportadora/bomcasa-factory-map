import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isRecoveryRedirect, authRedirectError } from '../../lib/authRedirect'

/**
 * Send password-recovery landings to /reset-password.
 *
 * Supabase falls back to the project's Site URL whenever the requested redirect
 * is not on the allow list, so a recovery link can legitimately arrive at "/"
 * instead. Without this the guard would treat it as an ordinary visit and — if
 * the link had already expired, so no session was created — bounce the person
 * to the sign-in page with no explanation.
 */
export default function RecoveryRedirect() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/reset-password') return
    if (isRecoveryRedirect || authRedirectError) {
      navigate('/reset-password', { replace: true })
    }
  }, [navigate, location.pathname])

  return null
}
