import { Anchor, ArrowRight, Factory, Pencil, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { factoryLabel } from '../../lib/factories'
import {
  daysUntil,
  formatDate,
  formatMoney,
  formatQuantity,
  nextStatus,
  orderTotal,
  statusKey,
} from '../../lib/orders'
import { getPort } from '../../lib/ports'
import StatusBadge from './StatusBadge'

/**
 * The date the view cares about, with how long is left on it.
 *
 * Late is red, this week is amber, anything further out is quiet — a board
 * where every row shouts tells you nothing about which row to open first.
 */
function DueDate({ value, labelKey }) {
  const { t, tCount, language } = useI18n()
  const formatted = formatDate(value, language)
  if (!formatted) return null

  const days = daysUntil(value)
  let relative = null
  let tone = 'text-muted'

  if (days !== null) {
    if (days < 0) {
      relative = tCount('orders.due.late', Math.abs(days))
      tone = 'text-danger'
    } else if (days === 0) {
      relative = t('orders.due.today')
      tone = 'text-danger'
    } else {
      relative = tCount('orders.due.in', days)
      // Anything inside a week is close enough to want chasing today.
      if (days <= 7) tone = 'text-warning'
    }
  }

  return (
    <p className="text-[13px] text-muted">
      {t(labelKey)}: <span className="text-ink">{formatted}</span>
      {relative && (
        <span className={`ml-1.5 font-medium ${tone}`}>
          {/* A bare gap is not enough here: "20 Aug 2026" running into
              "6 days late" reads as one long number. */}
          <span aria-hidden="true" className="mr-1.5 text-muted">
            ·
          </span>
          {relative}
        </span>
      )}
    </p>
  )
}

export default function OrderCard({
  order,
  factory,
  dateField,
  canManage,
  onOpen,
  onEdit,
  onDelete,
  onAdvance,
}) {
  const { t, language, tCount } = useI18n()

  const items = order.order_items ?? []
  const total = orderTotal(order)
  const port = getPort(order.fob_port)
  const advanceTo = nextStatus(order.status)
  const dateLabelKey = dateField === 'eta' ? 'orders.eta' : 'orders.readyDate'

  return (
    <li className="card p-4 transition-shadow duration-200 hover:shadow-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(order)}
            className="block max-w-full truncate text-left text-[15px] font-semibold tracking-[-0.01em] text-ink hover:text-accent"
          >
            {order.reference}
          </button>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Factory size={13} strokeWidth={1.75} />
              {factory ? factoryLabel(factory) : t('orders.noFactory')}
            </span>
            {port && (
              <span className="inline-flex items-center gap-1.5">
                <Anchor size={13} strokeWidth={1.75} />
                {t('ports.namedPort', { name: port.name })}
              </span>
            )}
          </p>
        </div>
        <StatusBadge status={order.status} className="flex-shrink-0" />
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 flex-1 truncate text-ink">{item.product}</span>
              <span className="flex-shrink-0 text-muted">
                {item.quantity != null && `${formatQuantity(item.quantity, language)} ${item.unit ?? ''}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
        <div className="min-w-0">
          <DueDate value={order[dateField]} labelKey={dateLabelKey} />
          {order.container_no && (
            <p className="truncate text-[13px] text-muted">
              {t('orders.containerNo')}: <span className="text-ink">{order.container_no}</span>
            </p>
          )}
          <p className="hint">{tCount('orders.lineCount', items.length)}</p>
        </div>
        {total > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {formatMoney(total, order.currency, language)}
            </p>
            {/* Landed cost is in another currency, so it is labelled rather
                than sitting under the FOB total as if comparable. */}
            {order.landed_total != null && (
              <p className="hint">
                {t('liquidation.landedShort', {
                  amount: formatMoney(order.landed_total, order.landed_currency ?? 'DOP', language),
                })}
              </p>
            )}
          </div>
        )}
      </div>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {advanceTo && (
            <button type="button" onClick={() => onAdvance(order, advanceTo)} className="btn-secondary btn-sm">
              {t('orders.advanceTo', { status: t(statusKey(advanceTo)) })}
              <ArrowRight size={14} />
            </button>
          )}
          <button type="button" onClick={() => onEdit(order)} className="btn-ghost btn-sm">
            <Pencil size={14} />
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={() => onDelete(order)}
            className="btn-ghost btn-sm text-danger hover:bg-danger/5 hover:text-danger"
          >
            <Trash2 size={14} />
            {t('common.delete')}
          </button>
        </div>
      )}
    </li>
  )
}
