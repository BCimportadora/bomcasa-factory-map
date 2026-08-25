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
  onUndo,
  onClear,
  onClose,
  emptyHint,
  nextHint,
}) {
  const { t, language } = useI18n()

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

          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
            <span className="text-[13px] font-medium text-ink">{t('measure.total')}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">
              {formatDistance(totalKm, language)}
            </span>
          </div>
        </>
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
