import { Images } from 'lucide-react'
import { useI18n } from '../../i18n'
import { formatMoney, formatUnits, plannedTotal } from '../../lib/innovations'
import InnovationImage from './InnovationImage'
import LabelBadge from './LabelBadge'

/**
 * One item on the board.
 *
 * The picture is the whole top of the card and is the click target for the
 * detail view. The name and the label sit *below* it — bottom left and bottom
 * right of the card, not overlaid on the image, so neither is ever lost against
 * a busy photograph.
 */
export default function InnovationCard({ innovation, onOpen, showOrderPlan = false }) {
  const { t, language } = useI18n()

  const images = innovation.innovation_images ?? []
  const cover = images[0]
  const total = plannedTotal(innovation)

  return (
    <li className="card overflow-hidden transition-shadow duration-200 hover:shadow-subtle">
      <button
        type="button"
        onClick={() => onOpen(innovation)}
        aria-label={t('innovations.openDetail', { name: innovation.name })}
        className="group relative block w-full"
      >
        <InnovationImage
          path={cover?.storage_path}
          alt={innovation.name}
          ratio="aspect-[4/3]"
          className="rounded-none transition-transform duration-200 ease-out group-hover:scale-[1.02]"
        />
        {images.length > 1 && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            <Images size={11} strokeWidth={2} />
            {images.length}
          </span>
        )}
      </button>

      {/* Name bottom-left, label bottom-right, both outside the image. */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {innovation.name}
          </p>
          {showOrderPlan ? (
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {innovation.fob_price != null
                ? t('innovations.fobEach', {
                    price: formatMoney(innovation.fob_price, innovation.fob_currency, language),
                  })
                : t('innovations.noFobYet')}
              {total != null && (
                <>
                  {'  ·  '}
                  {formatMoney(total, innovation.fob_currency, language)}
                </>
              )}
            </p>
          ) : (
            innovation.local_price != null && (
              <p className="mt-0.5 truncate text-[13px] text-muted">
                {t('innovations.localPriceShort', {
                  price: formatMoney(innovation.local_price, innovation.local_currency, language),
                })}
              </p>
            )
          )}
          {showOrderPlan && innovation.planned_units != null && (
            <p className="truncate text-[12px] text-muted/80">
              {t('innovations.plannedUnitsShort', {
                units: formatUnits(innovation.planned_units, language),
              })}
            </p>
          )}
        </div>
        <LabelBadge label={innovation.label} className="mt-0.5 flex-shrink-0" />
      </div>
    </li>
  )
}
