import { useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { THEMES } from '../../lib/constants'

/**
 * Ties the appearance setting to whoever is signed in.
 *
 * Two rules:
 *
 *   - Signed out, the interface follows the device. The sign-in screen belongs
 *     to nobody in particular, so it should not still be wearing the colours of
 *     whoever used this browser last.
 *   - Signed in, it follows that person's saved preference, so it travels with
 *     them to any device rather than being a property of the machine.
 *
 * This lives at the application root rather than inside the layout because it
 * has to see the signed-out state too, which never renders the layout.
 *
 * Appearance is a display preference only — it never affects role, permissions
 * or access.
 */
export default function ThemeSync() {
  const { user, profile, loading, updateOwnProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const adopted = useRef(false)

  // Signed out: hand the interface back to the device.
  useEffect(() => {
    // While the session is still resolving, `user` is null but nobody has
    // signed out — resetting here would throw away the cached preference and
    // flash the wrong colours on every reload.
    if (loading || user) return

    adopted.current = false
    if (theme !== 'system') setTheme('system')
  }, [loading, user, theme, setTheme])

  // Adopt the saved preference once per session.
  useEffect(() => {
    if (adopted.current || !profile) return
    adopted.current = true

    // An older database without the theme column simply yields undefined here,
    // which is not a valid theme, so the cached preference stands.
    if (THEMES.includes(profile.theme) && profile.theme !== theme) {
      setTheme(profile.theme)
    }
  }, [profile, theme, setTheme])

  // Write later changes back to the profile.
  useEffect(() => {
    if (!adopted.current || !profile) return
    if (profile.theme === theme) return

    updateOwnProfile({ theme }).catch((err) => {
      // Not being able to store a display preference must never block the UI;
      // the choice still applies for this session and is cached locally.
      console.warn('Could not save appearance preference:', err.message)
    })
  }, [theme, profile, updateOwnProfile])

  return null
}
