/**
 * Reading a supplier's commercial invoice and packing list.
 *
 * One workbook, two sheets: `PI` states what was bought and for how much, `PL`
 * states how it was packed. They carry the same lines under the same headings,
 * so the packing figures are merged onto the invoice lines by product code.
 *
 * The thing that makes this document different from a proforma:
 *
 * ONE FILE CAN CARRY LINES FROM SEVERAL ORDERS. The invoice for order 77 also
 * shipped one line left over from order 75 and one from order 76, each under
 * its own `PO.` and `S/C NO.` heading part-way down the sheet. Reading the file
 * as a single order would file those two lines under 77 -- and since catalog
 * pricing follows the newest order, that is exactly the mistake that puts a
 * stale figure in as though it were current. Every line is attributed to the
 * block it sits in.
 *
 * The blocks are keyed on the S/C number rather than the PO, because that is
 * the identifier both sheets carry: `PL` marks its later blocks with the S/C
 * alone and no PO line at all.
 */

/** Strip accents, punctuation and doubled spaces so headings compare sanely. */
export const normalise = (value) =>
  (value ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Headings we read, most specific first.
 *
 * `Code for Box` is OUR article code and `Item No.` is the supplier's own --
 * the opposite way round from the Milan proforma, where the `Code` column holds
 * ours. Reading them the other way would file every product under a code no
 * document of ours uses.
 */
const COLUMNS = [
  ['s no', 'line_no'],
  ['item no', 'supplier_code'],
  ['bar code', 'barcode'],
  ['code for box', 'product_code'],
  ['description of goods', 'description_en'],
  ['quanity pcs', 'quantity'],
  ['quantity pcs', 'quantity'],
  ['unit price', 'unit_price'],
  ['amount', 'amount'],
  ['package ctns', 'cartons'],
  ['volume cbm', 'volume_cbm'],
  ['n w kgs', 'net_weight'],
  ['g w kgs', 'gross_weight'],
]

/** `PO.202603-77` -> 77. The middle six digits are the year and month. */
const PO_LINE = /^\s*p\s*o\s*\.?\s*\d{6}\s*-\s*(\d+)\s*$/i

/** `S/C NO.YQ-BQ-2603034` -> `YQ-BQ-2603034`. */
const CONTRACT = /s\s*\/?\s*c\s*no\.?\s*([A-Za-z0-9][A-Za-z0-9-]*)/i

/** `Date: 2026.03.18` -> `2026-03-18`, which sorts and compares as text. */
const DATE_LINE = /date\s*:?\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/i

const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = parseFloat(value.replace(/[^\d.,-]/g, '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

/** Thirteen digits or nothing. A partial barcode is worse than no barcode. */
const barcode = (value) => {
  const digits = (value ?? '').toString().replace(/\D/g, '')
  return /^\d{13}$/.test(digits) ? digits : null
}

const text = (value) => {
  const s = String(value ?? '').trim()
  return s ? s.replace(/\s+/g, ' ') : null
}

/** The row that labels the columns: the one naming the box code. */
function findHeaderRow(rows) {
  for (const row of rows) {
    const values = [...row.cells.values()].map(normalise)
    if (values.some((v) => v === 'code for box')) return row
  }
  return null
}

function mapColumns(headerRow) {
  const columns = {}
  const taken = new Set()
  for (const [heading, field] of COLUMNS) {
    if (columns[field] !== undefined) continue
    for (const [index, raw] of headerRow.cells) {
      if (taken.has(index)) continue
      if (normalise(raw).startsWith(heading)) {
        columns[field] = index
        taken.add(index)
        break
      }
    }
  }
  return columns
}

/**
 * Read one sheet into blocks.
 *
 * A block starts at a `PO.` or `S/C NO.` marker and runs to the next one. The
 * sheet's own header supplies the first block, so a file with no mid-sheet
 * markers reads as a single order and nothing here behaves differently.
 *
 * A data row is one whose S/No. is a number AND which carries a box code.
 * That is what separates products from everything else the sheet holds: the
 * `SC SERIES- SKIN WHITE` banners (text where the number goes), the `TOTAL:`
 * rows, the payment terms and bank details, and the `Additional Poly bag`
 * lines, which are real goods but have no article code and are not products.
 */
function readSheet(sheet) {
  const headerRow = findHeaderRow(sheet.rows)
  if (!headerRow) return null
  const columns = mapColumns(headerRow)

  const identity = { supplierName: null, contractNo: null, orderNumber: null, date: null }
  for (const row of sheet.rows) {
    if (row.number >= headerRow.number) break
    for (const value of row.cells.values()) {
      const raw = text(value)
      if (!raw) continue
      if (!identity.supplierName && row.number === 1) identity.supplierName = raw
      const contract = raw.match(CONTRACT)
      if (contract && !identity.contractNo) identity.contractNo = contract[1]
      const po = raw.match(PO_LINE)
      if (po && identity.orderNumber === null) identity.orderNumber = Number(po[1])
      const date = raw.match(DATE_LINE)
      if (date && !identity.date) {
        identity.date = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`
      }
    }
  }

  const blocks = []
  let current = {
    contractNo: identity.contractNo,
    orderNumber: identity.orderNumber,
    lines: [],
  }
  blocks.push(current)

  const get = (row, field) =>
    columns[field] === undefined ? null : (row.cells.get(columns[field]) ?? null)

  for (const row of sheet.rows) {
    if (row.number <= headerRow.number) continue

    // A marker row opens a new block. Both identifiers are looked for on the
    // same row: `PI` writes the PO and the S/C side by side, `PL` writes the
    // S/C alone.
    let po = null
    let contract = null
    for (const value of row.cells.values()) {
      const raw = text(value)
      if (!raw) continue
      const m = raw.match(PO_LINE)
      if (m) po = Number(m[1])
      const c = raw.match(CONTRACT)
      if (c) contract = c[1]
    }
    if (po !== null || contract !== null) {
      current = { contractNo: contract, orderNumber: po, lines: [] }
      blocks.push(current)
      continue
    }

    const lineNo = get(row, 'line_no')
    if (lineNo === null || !/^\d+$/.test(String(lineNo).trim())) continue
    const productCode = text(get(row, 'product_code'))
    if (!productCode) continue

    current.lines.push({
      row: row.number,
      line_no: Number(lineNo),
      product_code: productCode,
      supplier_code: text(get(row, 'supplier_code')),
      barcode: barcode(get(row, 'barcode')),
      description_en: text(get(row, 'description_en')),
      quantity: num(get(row, 'quantity')),
      unit_price: num(get(row, 'unit_price')),
      cartons: num(get(row, 'cartons')),
      volume_cbm: num(get(row, 'volume_cbm')),
    })
  }

  return { identity, blocks: blocks.filter((b) => b.lines.length > 0) }
}

/** Which sheet is which, by what its header holds rather than by its name. */
const hasField = (sheet, field) => {
  const header = findHeaderRow(sheet.rows)
  return header ? mapColumns(header)[field] !== undefined : false
}

/**
 * Turn the workbook into blocks, one per order the file carries.
 *
 * The invoice is the spine: it defines the blocks and their order numbers. The
 * packing list is merged onto it by contract and product code, so a line the
 * invoice carries with no packing counterpart -- an item shipped by air, say --
 * keeps its identity and simply has no CBM.
 */
export function parseCommercialInvoice(workbook, { fileName } = {}) {
  const warnings = []

  const invoiceSheet = workbook.sheets.find((s) => hasField(s, 'unit_price'))
  if (!invoiceSheet) throw new Error('noInvoiceSheet')
  const packingSheet = workbook.sheets.find((s) => s !== invoiceSheet && hasField(s, 'volume_cbm'))
  if (!packingSheet) warnings.push('noPackingList')

  const invoice = readSheet(invoiceSheet)
  const packing = packingSheet ? readSheet(packingSheet) : null

  // Packing figures, keyed by contract and code. Keyed on the contract too
  // because the same article appears under more than one order in this file,
  // with different quantities each time.
  const packed = new Map()
  for (const block of packing?.blocks ?? []) {
    for (const line of block.lines) {
      packed.set(`${block.contractNo ?? ''}|${line.product_code}`, line)
    }
  }

  const blocks = invoice.blocks.map((block) => ({
    contractNo: block.contractNo,
    orderNumber: block.orderNumber,
    lines: block.lines.map((line) => {
      const p = packed.get(`${block.contractNo ?? ''}|${line.product_code}`)
      return { ...line, cartons: line.cartons ?? p?.cartons ?? null, volume_cbm: line.volume_cbm ?? p?.volume_cbm ?? null }
    }),
  }))

  if (blocks.length === 0) throw new Error('noInvoiceRows')
  if (!invoice.identity.supplierName) warnings.push('noSupplierName')
  if (blocks.some((b) => b.orderNumber === null)) warnings.push('noOrderNumber')

  return {
    fileName: fileName ?? null,
    invoiceSheet: invoiceSheet.name,
    packingSheet: packingSheet?.name ?? null,
    supplierName: invoice.identity.supplierName,
    contractNo: invoice.identity.contractNo,
    date: invoice.identity.date,
    blocks,
    lineCount: blocks.reduce((sum, b) => sum + b.lines.length, 0),
    warnings,
  }
}
