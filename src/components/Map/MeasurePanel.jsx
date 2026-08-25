import { X } from 'lucide-react'
import { formatDistance } from '../../lib/distance'
import { useI18n } from '../../i18n'

/**
 * Readout for a measurement: each leg and the running total.
 *
 * The hints are passed in rather than looked up here because what can be
 * selected differs by map — factories and ports on one, ports alone on the
 * other.
 */
export default function MeasurePanel({
  points,
  legs,
  totalKm,
  mode,
  onModeChange,
  onUndo,
  onClear,
  onClose,
  emptyHint,
  nextHint,
}) {
  const { t, language } = useI18n()
  // With one stop there is nothing to compare, so the choice is noise.
  const showModes = points.length > 1

  return (
    <div className="absolute bottom-4 left-3 z-[1101] w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-surface/95 p-4 shadow-panel backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">{t('measure.title')}</p>
          <p className="text-[12px] text-muted">{t('measure.straightLine')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('measure.stop')}
          className="-mr-1 -mt-1 flex-shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>

      {showModes && (
        <div
          role="group"
          aria-label={t('measure.modeLabel')}
          className="mt-3 flex rounded-lg border border-line bg-canvas p-0.5"
        >
          {['path', 'pairs'].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onModeChange(option)}
              aria-pressed={mode === option}
              className={`flex-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
                mode === option ? 'bg-surface text-ink shadow-subtle' : 'text-muted hover:text-ink'
              }`}
            >
              {t(option === 'path' ? 'measure.modePath' : 'measure.modePairs')}
            </button>
          ))}
        </div>
      )}

      {legs.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          {points.length === 0 ? emptyHint : nextHint}
        </p>
      ) : (
        <>
          <ol className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
            {legs.map((leg, index) => (
              <li
                key={`${leg.from.key}-${leg.to.key}-${index}`}
                className="flex items-baseline justify-between gap-3 text-[13px]"
              >
                <span className="min-w-0 truncate text-muted">
                  {leg.from.name} → {leg.to.name}
                </span>
                <span className="flex-shrink-0 tabular-nums text-ink">
                  {formatDistance(leg.km, language)}
                </span>
              </li>
            ))}
          </ol>

          {/* Adding up every pair would be a meaningless number, so the total
              belongs to the route reading only. */}
          {mode === 'path' && (
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
              <span className="text-[13px] font-medium text-ink">{t('measure.total')}</span>
              <span className="text-[15px] font-semibold tabular-nums text-ink">
                {formatDistance(totalKm, language)}
              </span>
            </div>
          )}
        </>
      )}

      {showModes && mode === 'path' && (
        <p className="mt-3 text-[12px] leading-snug text-muted">{t('measure.pairsTip')}</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={points.length === 0}
          className="btn-secondary btn-sm flex-1"
        >
          {t('measure.undo')}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={points.length === 0}
          className="btn-secondary btn-sm flex-1"
        >
          {t('measure.clear')}
        </button>
      </div>
    </div>
  )
}
