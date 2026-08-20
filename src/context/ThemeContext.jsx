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
 * This provider only holds and applies the setting. Deciding *which* setting is
 * in force belongs to ThemeSync, which adopts the signed-in person's saved
 * preference and drops back to 'system' when nobody is signed in.
 *
 * localStorage is a cache rather than the source of truth: it exists so the
 * inline script in index.html can paint the right colours before this file has
 * even been parsed. Like language, the setting has no bearing on role,
 * permissions or access.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  const [systemDark, setSystemDark] = useState(() => matchDark()?.matches ?? false)

  // Follow the OS setting live, so 'system' flips when the machine does.
  useEffect(() => {
    const query = matchDark()
    if (!query) return

    // Reads the query fresh each time rather than trusting an event payload,
    // so the same handler serves all three triggers below.
    const sync = () => setSystemDark(query.matches)

    sync()
    query.addEventListener('change', sync)

    // Changing the appearance means leaving the browser for the system
    // settings, and a hidden tab has its timers and events throttled — the
    // change can arrive late or coalesced, which looks exactly like the theme
    // being stuck. Re-reading when the page is looked at again makes the
    // switch deterministic on the way back.
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      query.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
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
