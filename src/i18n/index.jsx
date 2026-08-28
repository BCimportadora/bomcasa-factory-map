import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from './en'
import es from './es'
import { LANGUAGES } from '../lib/constants'

const BUNDLES = { en, es }
const STORAGE_KEY = 'bomcasa.language'
const DEFAULT_LANGUAGE = 'en'

const I18nContext = createContext(null)

/** Read a dotted key path out of a bundle, e.g. 'nav.people'. */
function lookup(bundle, path) {
  return path.split('.').reduce((node, part) => (node == null ? undefined : node[part]), bundle)
}

/** Replace {{placeholders}} with values. */
function interpolate(template, values) {
  if (!values) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  )
}

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && LANGUAGES.includes(stored)) return stored
  } catch {
    // localStorage can be unavailable (private mode); fall through to the default
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : null
  return LANGUAGES.includes(browser) ? browser : DEFAULT_LANGUAGE
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage)

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return
    setLanguageState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // preference simply will not persist if storage is blocked
    }
  }, [])

  /**
   * Translate a dotted key. Falls back to English, then to the key itself, so a
   * missing string is visible in development rather than rendering as blank.
   */
  const t = useCallback(
    (key, values) => {
      const raw = lookup(BUNDLES[language], key) ?? lookup(BUNDLES[DEFAULT_LANGUAGE], key)
      if (typeof raw !== 'string') {
        if (import.meta.env.DEV) console.warn(`[i18n] missing translation: ${key}`)
        return key
      }
      return interpolate(raw, values)
    },
    [language],
  )

  /**
   * Translate if there is a string for this key, otherwise return the fallback.
   *
   * For text that is not always ours. An error thrown by a library carries a
   * sentence as its message, not a key, so `t()` correctly finds nothing and --
   * by the rule above -- hands back the key it was given. A caller writing
   * `t(`x.${err.message}`) || err.message` therefore never reaches its fallback,
   * and the user is shown `catalog.errors.Setting up fake worker failed: ...`
   * with the prefix still attached. This is the way to ask.
   */
  const tOr = useCallback(
    (key, fallback, values) => {
      const raw = lookup(BUNDLES[language], key) ?? lookup(BUNDLES[DEFAULT_LANGUAGE], key)
      return typeof raw === 'string' ? interpolate(raw, values) : fallback
    },
    [language],
  )

  /** Count-aware helper: t('people.countOne' | 'people.countOther'). */
  const tCount = useCallback(
    (baseKey, count) => t(count === 1 ? `${baseKey}One` : `${baseKey}Other`, { count }),
    [t],
  )

  const value = useMemo(
    () => ({ language, setLanguage, t, tOr, tCount }),
    [language, setLanguage, t, tOr, tCount],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
