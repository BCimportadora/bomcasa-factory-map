/**
 * The R&D board, in one place.
 *
 * As with orders there is one table and two sections. The difference is that
 * the two axes are separate columns:
 *
 *   label  - the working tag, which anybody may change
 *   stage  - which section the item lives in, which only an administrator may
 *            change, and only once the label reads 'done'
 *
 * That separation is enforced by a trigger in schema.sql, not just by the UI,
 * because the anon key is public and PostgREST would otherwise accept the
 * change straight from the browser.
 */

/** Every label, in the order work actually moves through them. */
export const INNOVATION_LABELS = [
  'need_to_present',
  'to_do',
  'checking',
  'got_supplier',
  'got_quote',
  'ready_to_present',
  'done',
  'denied',
]

/**
 * The modifier class that colours a label pill. The colours themselves are
 * tokens in index.css: no single Tailwind shade is readable on both a white
 * card and a near-black one.
 */
export const LABEL_TONES = {
  need_to_present: 'status-idea',
  to_do: 'status-todo',
  checking: 'status-checking',
  got_supplier: 'status-supplier',
  got_quote: 'status-quote',
  ready_to_present: 'status-present',
  done: 'status-done',
  denied: 'status-denied',
}

/** Only these two, and only an administrator moves an item between them. */
export const INNOVATION_STAGES = ['development', 'ready']

export const INNOVATION_VIEWS = {
  development: {
    id: 'development',
    stage: 'development',
    sectionId: 'innovationsDevelopment',
  },
  ready: {
    id: 'ready',
    stage: 'ready',
    sectionId: 'innovationsReady',
  },
}

/** How safe we judge a supplier to be. Unknown is the honest default. */
export const SAFETY_LEVELS = ['unknown', 'safe', 'unsafe']

export const SAFETY_TONES = {
  unknown: 'status-idea',
  safe: 'status-done',
  unsafe: 'status-denied',
}

/** An item is only promotable once it is finished; the database agrees. */
export const READY_TO_PROMOTE = 'done'
export const canPromote = (innovation) => innovation?.label === READY_TO_PROMOTE

/** The label whose items the print sheet collects. */
export const PRINTABLE_LABEL = 'ready_to_present'

export const CURRENCIES = ['USD', 'EUR', 'CNY']

export const labelKey = (label) => `innovations.labels.${label}`
export const stageKey = (stage) => `innovations.stages.${stage}`
export const safetyKey = (level) => `innovations.safety.${level}`
export const viewEmptyKey = (view) => `innovations.views.${view}.empty`

/**
 * PostgREST sends `numeric` as a JSON number, but an empty form field arrives
 * as '' and a hand-edited row can hold anything. Coerce rather than trust.
 */
const num = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

const localeFor = (language) => (language === 'es' ? 'es-ES' : 'en-GB')

export const formatMoney = (amount, currency = 'USD', language = 'en') => {
  const value = num(amount)
  if (value === null) return null
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    // An unrecognised currency code should not blank out the price.
    return `${value.toFixed(2)} ${currency}`
  }
}

export const formatUnits = (value, language = 'en') => {
  const parsed = num(value)
  if (parsed === null) return null
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: 0 }).format(parsed)
}

export const formatDateTime = (value, language = 'en') => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' }).format(date)
}

/** What the whole order would cost at the quoted FOB price. */
export const plannedTotal = (innovation) => {
  const price = num(innovation?.fob_price)
  const units = num(innovation?.planned_units)
  if (price === null || units === null) return null
  return price * units
}

/** Quotes belonging to one variation, or the loose ones when given null. */
export const quotesFor = (innovation, variationId) =>
  (innovation?.innovation_quotes ?? []).filter((quote) =>
    variationId === null ? !quote.variation_id : quote.variation_id === variationId,
  )

/**
 * The cheapest quote we would actually accept.
 *
 * Quotes from suppliers marked unsafe are skipped: showing the lowest number on
 * the card when that number comes from a supplier we have rejected would be
 * actively misleading.
 */
export const bestQuote = (innovation) => {
  const usable = (innovation?.innovation_quotes ?? []).filter(
    (quote) => quote.safety !== 'unsafe' && num(quote.quoted_price) !== null,
  )
  if (usable.length === 0) return null
  return usable.reduce((best, quote) =>
    num(quote.quoted_price) < num(best.quoted_price) ? quote : best,
  )
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
/** Matches the bucket's own limit in schema.sql; both have to agree. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const isAllowedImage = (file) => IMAGE_TYPES.includes(file?.type)

/**
 * Where an uploaded file lives in the bucket.
 *
 * Prefixed by innovation id so everything for one item can be removed together,
 * and given a random name because two people uploading `photo.jpg` on the same
 * item must not overwrite each other.
 */
export const imagePath = (innovationId, file) => {
  const dot = file.name.lastIndexOf('.')
  const extension = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : 'jpg'
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${innovationId}/${random}.${extension}`
}

export const STORAGE_BUCKET = 'innovations'
