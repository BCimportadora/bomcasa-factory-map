import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { THEMES } from '../lib/constants'

/**
 * Must match the key read by the inline script in index.html. That script
 * applies the stored theme before React mounts; without it a dark-mode user
 * gets a white flash on every page load.
 */
const STORAGE_KEY = 'bomcasa.theme'
const DEFAULT_THEME = 'system'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Kept in step with --c-canvas so the mobile browser chrome matches the page. */
const BROWSER_CHROME = { light: '#fafafa', dark: '#111113' }

const ThemeContext = createContext(null)

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (THEMES.includes(stored)) return stored
  } catch {
    // localStorage can be unavailable (private mode); fall through to the default
  }
  return DEFAULT_THEME
}

const matchDark = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY)
    : null

/**
 * Appearance: light, dark, or following the operating system.
 *
 * This is a per-device display preference and is stored in localStorage rather
 * than on the profile — night mode is about the room you are sitting in, not
 * about who you are, and a phone at night and a desk in daylight want different
 * answers. Like language, it has no bearing on role, permissions or access.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  const [systemDark, setSystemDark] = useState(() => matchDark()?.matches ?? false)

  // Follow the OS setting live, so 'system' flips when the machine does.
  useEffect(() => {
    const query = matchDark()
    if (!query) return

    const handleChange = (event) => setSystemDark(event.matches)
    setSystemDark(query.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', BROWSER_CHROME[resolvedTheme])
  }, [resolvedTheme])

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // preference simply will not persist if storage is blocked
    }
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, isDark: resolvedTheme === 'dark', setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
