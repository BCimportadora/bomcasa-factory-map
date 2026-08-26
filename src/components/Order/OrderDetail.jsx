import { useState } from 'react'
import { ChevronDown, FileSpreadsheet } from 'lucide-react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
import StatusBadge from './StatusBadge'
import { formatMoney, formatQuantity, orderTotal } from '../../lib/orders'
import { getPort } from '../../lib/ports'

/** The charge components of one line, in the order the sheet computes them. */
const BREAKDOWN_ORDER = [
  'freight',
  'insurance',
  'cif_usd',
  'cif_local',
  'duty',
  'excise',
  'vat',
  'duty_and_vat',
  'customs_total',
  'customs_service',
  'port_storage',
  'port_collect',
  'customs_agent',
  'land_transport',
  'inspection',
  'local_handling',
  'price_with_fx',
  'margin',
  'sale_price_ex_tax',
  'expected_volume',
  'suggested_price',
]

/** Components quoted in the import currency rather than the landed one. */
const IN_ORDER_CURRENCY = new Set(['freight', 'insurance', 'cif_usd'])
/** Ratios, not money — printing a currency symbol on a margin is nonsense. */
const PLAIN_NUMBER = new Set(['margin'])

/**
 * A price of zero is not a price.
 *
 * The sheet leaves 0 against items that are never sold -- a spare driver
 * marked USO INTERNO -- and printing "DOP 0.00" there reads as a real price
 * rather than as an item with none. The stored value keeps the zero.
 */
const price = (value, currency, language, t) =>
  value == null || Number(value) === 0 ? '—' : formatMoney(value, currency, language)

function LineBreakdown({ breakdown, orderCurrency, landedCurrency }) {
  const { t, language } = useI18n()
  const entries = BREAKDOWN_ORDER.filter((key) => breakdown?.[key] != null)

  if (entries.length === 0) return <p className="hint px-3 py-2">{t('liquidation.noBreakdown')}</p>

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-3">
      {entries.map((key) => {
        const value = breakdown[key]
        const currency = IN_ORDER_CURRENCY.has(key) ? orderCurrency : landedCurrency
        return (
          <div key={key} className="flex justify-between gap-2">
            <dt className="truncate text-[11px] text-muted">{t(`liquidation.fields.${key}`)}</dt>
            <dd className="flex-shrink-0 text-[11px] font-medium text-ink">
              {PLAIN_NUMBER.has(key)
                ? formatQuantity(value, language)
                : formatMoney(value, currency, language)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * Everything on one order, including the landed cost when a liquidation has
 * been imported. Without this the imported figures would be stored and
 * invisible, which is the same as not importing them.
 */
export default function OrderDetail({ order, factory, onClose }) {
  const { t, language, tCount } = useI18n()
  const [expanded, setExpanded] = useState(null)

  const items = order.order_items ?? []
  const port = getPort(order.fob_port)
  const landedCurrency = order.landed_currency ?? 'DOP'
  const hasLanded = items.some((item) => item.landed_total != null)
  const liq = order.liquidation

  return (
    <Modal size="wide" title={order.reference} onClose={onClose}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] text-muted">
          {factory?.name ?? t('orders.noFactory')}
          {port && <> · {t('ports.namedPort', { name: port.name })}</>}
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-line bg-canvas p-4 sm:grid-cols-4">
        <div>
          <p className="hint">{t('liquidation.lines')}</p>
          <p className="text-[15px] font-semibold text-ink">{items.length}</p>
        </div>
        <div>
          <p className="hint">{t('liquidation.units')}</p>
          <p className="text-[15px] font-semibold text-ink">
            {formatQuantity(
              order.landed_units ?? items.reduce((s, i) => s + Number(i.quantity ?? 0), 0),
              language,
            )}
          </p>
        </div>
        <div>
          <p className="hint">{t('liquidation.fobTotal')}</p>
          <p className="text-[15px] font-semibold text-ink">
            {formatMoney(orderTotal(order), order.currency ?? 'USD', language)}
          </p>
        </div>
        <div>
          <p className="hint">{t('liquidation.landedTotal')}</p>
          <p className="text-[15px] font-semibold text-ink">
            {order.landed_total != null
              ? formatMoney(order.landed_total, landedCurrency, language)
              : '—'}
          </p>
        </div>
      </div>

      {liq?.file_name && (
        <p className="hint mt-2 flex items-center gap-1.5">
          <FileSpreadsheet size={12} strokeWidth={1.75} />
          {t('liquidation.readFrom', { sheet: liq.sheet_name, file: liq.file_name })}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[48rem] text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-3 py-2 font-medium">{t('liquidation.code')}</th>
              <th className="px-3 py-2 font-medium">{t('orders.items.product')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('liquidation.units')}</th>
              {hasLanded && (
                <>
                  <th className="px-3 py-2 text-right font-medium">{t('liquidation.unitCost')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('liquidation.salePrice')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('liquidation.listPrice')}</th>
                </>
              )}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const open = expanded === item.id
              return (
                <tr key={item.id} className="border-b border-line last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-ink">{item.product_code ?? '—'}</td>
                  <td className="px-3 py-2">
                    <p className="text-ink">{item.product}</p>
                    {item.line_comment && (
                      <span className="badge-neutral mt-1">{item.line_comment}</span>
                    )}
                    {open && (
                      <div className="-mx-3 mt-2 border-t border-line bg-canvas">
                        <LineBreakdown
                          breakdown={item.cost_breakdown}
                          orderCurrency={order.currency ?? 'USD'}
                          landedCurrency={landedCurrency}
                        />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-ink">
                    {item.quantity != null ? formatQuantity(item.quantity, language) : '—'}
                  </td>
                  {hasLanded && (
                    <>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-ink">
                        {price(item.landed_unit_cost, landedCurrency, language, t)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-ink">
                        {price(item.sale_price, landedCurrency, language, t)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                        {price(item.list_price, landedCurrency, language, t)}
                      </td>
                    </>
                  )}
                  <td className="px-1 py-2">
                    {item.cost_breakdown && Object.keys(item.cost_breakdown).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : item.id)}
                        aria-label={t('liquidation.showBreakdown')}
                        aria-expanded={open}
                        className="rounded-lg p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="hint mt-2">{tCount('orders.lineCount', items.length)}</p>
    </Modal>
  )
}
