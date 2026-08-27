/**
 * The paperwork attached to an order.
 *
 * These are the documents an import actually travels on -- the DGA liquidación,
 * the supplier's proforma, the packing list, the B/L, the barcode sheet. They
 * are evidence, and the catalog importer will read them later, so nothing here
 * parses, rewrites or re-encodes a file. Upload stores the bytes; download
 * returns the same bytes under the name they arrived with.
 */

export const STORAGE_BUCKET = 'order-files'

/** 25 MB. Scanned customs paperwork is the large end of what turns up here. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * A label for filtering, chosen by hand at upload. Must match the check
 * constraint on order_files.doc_type in schema.sql.
 *
 * Deliberately not inferred from the filename: `Milan_11_arancel.pdf` and
 * `BARCODE_CODIGOS_DE_BARRA_MILAN_11.xlsx` are readable to us but the naming is
 * a habit, not a rule, and a wrong label silently filed under the wrong type is
 * worse than an unlabelled one.
 */
export const DOC_TYPES = ['liquidacion', 'proforma', 'packing_list', 'bl', 'barcodes', 'other']

export const DEFAULT_DOC_TYPE = 'other'

export const docTypeKey = (type) => `files.docTypes.${type}`

/**
 * Extension -> the content type we send on upload.
 *
 * The browser's own `file.type` is not trustworthy for these formats: Windows
 * reports .xlsx as application/octet-stream when Excel is not installed, and
 * .csv arrives as application/vnd.ms-excel, text/plain or '' depending on the
 * machine. The bucket enforces an allowlist against whatever content type is
 * sent, so trusting the guess makes uploads fail on some people's laptops and
 * not others -- the worst kind of bug to be told about second-hand.
 *
 * Sending a canonical type derived from the extension is metadata only. The
 * stored bytes are untouched either way.
 */
export const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export const ALLOWED_EXTENSIONS = Object.keys(MIME_BY_EXTENSION)

/** What the file picker offers. Extensions, for the reason given above. */
export const FILE_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export const extensionOf = (name = '') => {
  const dot = name.lastIndexOf('.')
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : ''
}

export const isAllowedFile = (file) =>
  Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, extensionOf(file?.name))

export const mimeForFile = (file) =>
  MIME_BY_EXTENSION[extensionOf(file?.name)] ?? 'application/octet-stream'

/**
 * Where an uploaded file lives in the bucket.
 *
 * Prefixed by order id so everything for one order can be listed or removed
 * together, and given a random name because `packing list.pdf` is what half of
 * these are called and one must not overwrite another. The original name is
 * kept in the row, not in the key.
 */
export const filePath = (orderId, file) => {
  const extension = extensionOf(file?.name) || 'bin'
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${orderId}/${random}.${extension}`
}

/**
 * Human file size. Binary units, because that is what the operating system
 * shows next to the same file and a mismatch reads as corruption.
 */
export const formatBytes = (bytes, language = 'en') => {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—'
  const size = Number(bytes)
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const locale = language === 'es' ? 'es-ES' : 'en-GB'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`
}

/** Uploaded-at, with the time: two versions of a document often arrive the same day. */
export const formatUploadedAt = (value, language = 'en') => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'es' ? 'es-ES' : 'en-GB'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
