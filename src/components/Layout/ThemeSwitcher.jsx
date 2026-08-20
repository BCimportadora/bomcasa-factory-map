import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useI18n } from '../../i18n'
import { THEMES, themeKey } from '../../lib/constants'

const ICONS = { light: Sun, dark: Moon, system: Monitor }

/**
 * Appearance selector, built to match the language switcher beside it.
 *
 * The control reflects the *chosen* setting rather than the resolved one, so
 * "System" stays selected when the operating system flips the interface from
 * light to dark underneath it.
 */
export default function ThemeSwitcher({ className = '' }) {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()

  return (
    <div
      role="group"
      aria-label={t('theme.label')}
      className={`flex rounded-lg border border-line bg-canvas p-0.5 ${className}`}
    >
      {THEMES.map((value) => {
        const Icon = ICONS[value]
        const selected = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={selected}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
              selected ? 'bg-surface text-ink shadow-subtle' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" className="flex-shrink-0" />
            {t(themeKey(value))}
          </button>
        )
      })}
    </div>
  )
}
