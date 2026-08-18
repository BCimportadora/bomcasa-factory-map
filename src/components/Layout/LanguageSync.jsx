import { useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { LANGUAGES } from '../../lib/constants'

/**
 * Keeps the language preference on the profile in step with the chosen language.
 *
 * On the first render after sign-in the stored preference is adopted, so the
 * choice follows the person across devices; after that, changes are written
 * back. Language is a display preference only — it never affects role,
 * permissions or access.
 */
export default function LanguageSync() {
  const { profile, updateOwnProfile } = useAuth()
  const { language, setLanguage } = useI18n()
  const adopted = useRef(false)

  // Adopt the saved preference once per session.
  useEffect(() => {
    if (adopted.current || !profile) return
    adopted.current = true
    if (LANGUAGES.includes(profile.language) && profile.language !== language) {
      setLanguage(profile.language)
    }
  }, [profile, language, setLanguage])

  // Write later changes back to the profile.
  useEffect(() => {
    if (!adopted.current || !profile) return
    if (profile.language === language) return
    updateOwnProfile({ language }).catch((err) => {
      // Not being able to store a display preference must never block the UI.
      console.warn('Could not save language preference:', err.message)
    })
  }, [language, profile, updateOwnProfile])

  return null
}
