import { Ruler } from 'lucide-react'
import { useI18n } from '../../i18n'

/** Starts and stops measuring. Filled while active, so the mode is unmistakable. */
export default function MeasureButton({ active, onClick, className = '' }) {
  const { t } = useI18n()
  const label = active ? t('measure.stop') : t('measure.start')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-subtle backdrop-blur transition-colors ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-surface/95 text-muted hover:text-ink'
      } ${className}`}
    >
      <Ruler size={17} />
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  )
}
