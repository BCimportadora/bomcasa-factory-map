import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { UNIT_SUGGESTIONS, formatMoney, itemTotal } from '../../lib/orders'

export const emptyItem = () => ({ product: '', quantity: '', unit: 'pcs', unit_price: '' })

/**
 * The line items of one order.
 *
 * State is owned by the form above so that saving is a single submit rather
 * than a save per line. Rows are keyed by index deliberately: a new line has no
 * id yet, and the list is short enough that React re-rendering the tail after a
 * removal costs nothing.
 */
export default function OrderItemsEditor({ items, onChange, currency }) {
  const { t, language } = useI18n()

  const update = (index, field, value) => {
    onChange(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const remove = (index) => {
    const next = items.filter((_, i) => i !== index)
    // Never leave the editor with nothing to type into.
    onChange(next.length > 0 ? next : [emptyItem()])
  }

  const total = items.reduce((sum, item) => sum + itemTotal(item), 0)

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label mb-0">{t('orders.items.title')}</span>
        <span className="hint">{t('orders.items.hint')}</span>
      </div>

      <div className="space-y-2.5">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border border-line bg-canvas p-3">
            <div className="flex items-start gap-2">
              <input
                value={item.product}
                onChange={(e) => update(index, 'product', e.target.value)}
                placeholder={t('orders.items.product')}
                aria-label={t('orders.items.product')}
                className="input flex-1 text-[14px]"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t('orders.items.remove')}
                title={t('orders.items.remove')}
                className="mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <input
                value={item.quantity}
                onChange={(e) => update(index, 'quantity', e.target.value)}
                inputMode="decimal"
                placeholder={t('orders.items.quantity')}
                aria-label={t('orders.items.quantity')}
                className="input text-[14px]"
              />
              <input
                value={item.unit}
                onChange={(e) => update(index, 'unit', e.target.value)}
                list="order-unit-suggestions"
                placeholder={t('orders.items.unit')}
                aria-label={t('orders.items.unit')}
                className="input text-[14px]"
              />
              <input
                value={item.unit_price}
                onChange={(e) => update(index, 'unit_price', e.target.value)}
                inputMode="decimal"
                placeholder={t('orders.items.unitPrice')}
                aria-label={t('orders.items.unitPrice')}
                className="input text-[14px]"
              />
            </div>

            {itemTotal(item) > 0 && (
              <p className="mt-2 text-right text-[13px] text-muted">
                {formatMoney(itemTotal(item), currency, language)}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* One datalist for every row: the suggestions are identical. */}
      <datalist id="order-unit-suggestions">
        {UNIT_SUGGESTIONS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange([...items, emptyItem()])}
          className="btn-secondary btn-sm"
        >
          <Plus size={14} />
          {t('orders.items.add')}
        </button>

        <div className="text-right">
          <p className="hint">{t('orders.total')}</p>
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
            {formatMoney(total, currency, language)}
          </p>
        </div>
      </div>
    </div>
  )
}
