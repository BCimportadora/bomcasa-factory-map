/**
 * The order lifecycle, in one place.
 *
 * There is a single orders table, not one per menu tile: an order that ships
 * changes status, it does not get re-typed somewhere else. "Orders to do" and
 * "Orders ready & in transit" are two filtered views of the same list, which is
 * why the split lives here rather than in either page.
 */

/** Every status, in lifecycle order. Must match orders_status_check in schema.sql. */
export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'in_production',
  'ready',
  'shipped',
  'arrived',
  'cancelled',
]

/**
 * The modifier class that colours a status pill. The colours themselves are
 * tokens in index.css, because no single shade is readable on both a white card
 * and a near-black one.
 */
export const STATUS_TONES = {
  draft: 'status-draft',
  confirmed: 'status-confirmed',
  in_production: 'status-in-production',
  ready: 'status-ready',
  shipped: 'status-shipped',
  arrived: 'status-arrived',
  cancelled: 'status-cancelled',
}

/**
 * The two views.
 *
 * `statuses` is what the view shows by default; `dateField` is the date it
 * sorts and counts down to, because "late" means something different before and
 * after a container leaves.
 *
 * Cancelled orders are filterable from the to-do view only. Putting them in
 * neither would lose them; putting them in both would show a dead order on the
 * shipping board. A cancelled order is something you go looking for, so it sits
 * one click away in the list you would look in.
 */
export const ORDER_VIEWS = {
  todo: {
    id: 'todo',
    sectionId: 'ordersTodo',
    statuses: ['draft', 'confirmed', 'in_production'],
    filterStatuses: ['draft', 'confirmed', 'in_production', 'cancelled'],
    dateField: 'ready_date',
  },
  inTransit: {
    id: 'inTransit',
    sectionId: 'ordersInTransit',
    statuses: ['ready', 'shipped', 'arrived'],
    filterStatuses: ['ready', 'shipped', 'arrived'],
    dateField: 'eta',
  },
}

/** The status this one normally becomes next, or null at the end of the line. */
export const nextStatus = (status) => {
  const flow = ORDER_STATUSES.slice(0, -1) // 'cancelled' is not part of the flow
  const at = flow.indexOf(status)
  return at === -1 || at === flow.length - 1 ? null : flow[at + 1]
}

export const CURRENCIES = ['USD', 'EUR', 'CNY']

/** Offered as suggestions, not enforced — a factory may quote in anything. */
export const UNIT_SUGGESTIONS = ['pcs', 'sets', 'ctn', 'pairs', 'kg', 'm']

export const statusKey = (status) => `orders.status.${status}`
export const viewEmptyKey = (view) => `orders.views.${view}.empty`

/**
 * PostgREST sends `numeric` as a JSON number, but an empty form field arrives
 * as '' and a hand-edited row can hold anything. Coerce rather than trust.
 */
const num = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const itemTotal = (item) => num(item?.quantity) * num(item?.unit_price)

export const orderTotal = (order) =>
  (order?.order_items ?? []).reduce((sum, item) => sum + itemTotal(item), 0)

const localeFor = (language) => (language === 'es' ? 'es-ES' : 'en-GB')

export const formatMoney = (amount, currency = 'USD', language = 'en') => {
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // An unrecognised currency code should not blank out the total.
    return `${amount.toFixed(2)} ${currency}`
  }
}

export const formatQuantity = (value, language = 'en') =>
  new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 3 }).format(num(value))

export const formatDate = (value, language = 'en') => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' }).format(date)
}

/**
 * Whole days from today to a date column, negative once it is in the past.
 * Both sides are pinned to midnight so the answer does not change during the
 * day, and null dates return null rather than a misleading 0.
 */
export const daysUntil = (value) => {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

/** Sort by a date column, soonest first, with undated rows last rather than first. */
export const byDate = (field) => (a, b) => {
  const left = a?.[field]
  const right = b?.[field]
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * How a line travelled. An order can arrive in two parts and still be one
 * order: a container by sea, and whatever was needed sooner on a plane.
 *
 * `sea` first because it is the default and what almost every line does.
 */
export const SHIPMENTS = ['sea', 'air']

export const shipmentKey = (value) => `orders.shipments.${value}`

/** The lines of an order split into the two parts, air last and only if any. */
export const byShipment = (items) => {
  const sea = (items ?? []).filter((i) => (i.shipment ?? 'sea') !== 'air')
  const air = (items ?? []).filter((i) => i.shipment === 'air')
  return air.length === 0 ? [{ mode: 'sea', items: sea, only: true }] : [
    { mode: 'sea', items: sea, only: false },
    { mode: 'air', items: air, only: false },
  ]
}
