import { useI18n } from '../../i18n'
import { LANGUAGES } from '../../lib/constants'

const LABELS = { en: 'English', es: 'Español' }

/**
 * Text-only language selector (no flags — a language is not a country).
 * `variant="inline"` renders the two options side by side for the sign-in
 * screen; the default renders a compact segmented control for the sidebar.
 */
export default function LanguageSwitcher({ variant = 'segmented', className = '' }) {
  const { language, setLanguage, t } = useI18n()

  if (variant === 'inline') {
    return (
      <div className={`flex items-center justify-center gap-1 text-[13px] ${className}`}>
        {LANGUAGES.map((code, i) => (
          <span key={code} className="flex items-center">
            {i > 0 && <span className="px-1.5 text-line" aria-hidden="true">|</span>}
            <button
              type="button"
              onClick={() => setLanguage(code)}
              aria-current={language === code ? 'true' : undefined}
              className={`rounded-md px-1.5 py-0.5 transition-colors ${
                language === code ? 'font-medium text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {LABELS[code]}
            </button>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className={`flex rounded-lg border border-line bg-canvas p-0.5 ${className}`}
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-pressed={language === code}
          className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
            language === code ? 'bg-surface text-ink shadow-subtle' : 'text-muted hover:text-ink'
          }`}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  )
}
