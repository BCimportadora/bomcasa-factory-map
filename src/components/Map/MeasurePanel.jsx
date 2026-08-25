import { X } from 'lucide-react'
import { formatDistance } from '../../lib/distance'
import { useI18n } from '../../i18n'

/** Stop number, matching the badge drawn on the map. */
function StopNumber({ children }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-accent/10 px-1 text-[11px] font-semibold tabular-nums text-accent">
      {children}
    </span>
  )
}

/**
 * Readout for a measurement: what was selected, and the distance between them.
 *
 * Distances are labelled by stop number rather than by name. Supplier names run
 * long enough that any panel narrow enough to sit over a map would clip them,
 * and a clipped name identifies nothing — the numbers are short, unambiguous,
 * and already drawn on the map beside each marker. The names are listed once,
 * in full, above.
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
    <div className="absolute bottom-4 left-3 z-[1101] flex max-h-[70vh] w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl border border-line bg-surface/95 p-4 shadow-panel backdrop-blur">
      <div className="flex flex-shrink-0 items-start justify-between gap-2">
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
          className="mt-3 flex flex-shrink-0 rounded-lg border border-line bg-canvas p-0.5"
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

      {/* Only this middle section scrolls, so the buttons below stay reachable
          however many pairs there are. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {points.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">{emptyHint}</p>
        ) : (
          <>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t('measure.stops')}
            </p>
            <ol className="mt-1.5 space-y-1">
              {points.map((point, index) => (
                <li key={`${point.key}-${index}`} className="flex items-start gap-2 text-[13px]">
                  <StopNumber>{index + 1}</StopNumber>
                  {/* Long supplier names wrap rather than clip — this is the one
                      place the full name is shown. */}
                  <span className="min-w-0 flex-1 break-words leading-snug text-ink">
                    {point.name}
                  </span>
                </li>
              ))}
            </ol>

            {legs.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">{nextHint}</p>
            ) : (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {t('measure.distances')}
                </p>
                <ol className="mt-1.5 space-y-1">
                  {legs.map((leg, index) => (
                    <li
                      key={`${leg.from.key}-${leg.to.key}-${index}`}
                      className="flex items-center justify-between gap-3 text-[13px]"
                      title={`${leg.from.name} → ${leg.to.name}`}
                    >
                      <span className="flex flex-shrink-0 items-center gap-1.5">
                        <StopNumber>{leg.fromIndex + 1}</StopNumber>
                        <span aria-hidden="true" className="text-muted">
                          →
                        </span>
                        <StopNumber>{leg.toIndex + 1}</StopNumber>
                      </span>
                      <span className="tabular-nums text-ink">
                        {formatDistance(leg.km, language)}
                      </span>
                    </li>
                  ))}
                </ol>

                {/* Adding up every pair would be a meaningless number, so the
                    total belongs to the route reading only. */}
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
          </>
        )}
      </div>

      {showModes && mode === 'path' && (
        <p className="mt-3 flex-shrink-0 text-[12px] leading-snug text-muted">
          {t('measure.pairsTip')}
        </p>
      )}

      <div className="mt-3 flex flex-shrink-0 gap-2">
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
