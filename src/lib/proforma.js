/**
 * Reading a supplier proforma invoice.
 *
 * The reasoning is in docs/data-sources.md. What matters here:
 *
 *  - The header is not row 1 and is two rows deep: merged group headings
 *    (`QUANTITY`, `FOB PRICE`) sit above sub-headings (`Q'TY`, `UNIT PRICE`).
 *    It is found by content, never by a row number -- suppliers add and remove
 *    address lines above it.
 *
 *  - The barcode column heading in our sample literally reads "Barcode
 *    missing". It is located by position and by holding 13-digit numbers, not
 *    by its label.
 *
 *  - The last row is a TOTAL, not a product.
 */

import { readWorkbook } from './xlsxReader'

/** Strip accents, punctuation and doubled spaces so headings compare sanely. */
export const normalise = (value) =>
  (value ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The sub-headings we need, and what to call them. More specific first. */
const COLUMN_MAP = [
  ['no', 'line_no'],
  ['code', 'supplier_code'],
  ['model', 'model'],
  ['english', 'description_en'],
  ['spanish', 'description_es'],
  ['q ty', 'quantity'],
  ['qty', 'quantity'],
  ['pcs ctn', 'pcs_per_carton'],
  ['ctns', 'cartons'],
  ['unit price', 'unit_price'],
  ['amount', 'amount'],
]

const EAN13 = /^\d{13}$/

/** Strip everything that is not a digit, then insist on exactly thirteen. */
export const cleanBarcode = (value) => {
  const digits = (value ?? '').toString().replace(/\D/g, '')
  return EAN13.test(digits) ? digits : null
}

/** A cell as a decimal string, keeping full precision. Excel stores 0.285 as
 *  0.28499999999999998; the shortest round-trip form is the honest reading. */
const decimal = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : null
}

/** Sub-headings that mark the second row of a two-deep header. */
const SUB_HEADINGS = new Set(['english', 'spanish', 'q ty', 'qty', 'pcs ctn', 'ctns', 'unit price', 'amount'])

/**
 * Find the header, which is two rows deep.
 *
 * The top row carries `No.` and `Code` and the merged group headings
 * (`QUANTITY`, `FOB PRICE`); the row BELOW it carries their sub-headings
 * (`Q'TY`, `UNIT PRICE`). Columns A-E are merged down across both, so their
 * labels appear only on the top row.
 *
 * Reading only one of the two rows loses half the columns silently — the
 * prices and the Spanish description come back empty and everything else looks
 * fine. Both rows are read, and data starts after the lower one.
 */
function findHeader(rows) {
  for (const row of rows) {
    const byIndex = new Map()
    for (const [index, value] of row.cells) byIndex.set(index, normalise(value))
    for (const [index, text] of byIndex) {
      if (text === 'code' && byIndex.get(index - 1) === 'no') {
        const below = rows.find((r) => r.number === row.number + 1)
        const hasSubHeadings =
          below && [...below.cells.values()].some((v) => SUB_HEADINGS.has(normalise(v)))
        return {
          row,
          subRow: hasSubHeadings ? below : null,
          codeIndex: index,
          lastHeaderRow: hasSubHeadings ? below.number : row.number,
        }
      }
    }
  }
  return null
}

/**
 * Map column index -> field name across both header rows.
 *
 * The sub-heading row is read first so that where both rows carry a label for
 * the same column, the more specific one wins.
 */
function mapColumns(header) {
  const columns = {}
  const seen = new Set()
  const consider = (index, raw) => {
    const text = normalise(raw)
    if (!text) return
    for (const [heading, field] of COLUMN_MAP) {
      if (text === heading && !seen.has(field)) {
        columns[index] = field
        seen.add(field)
        return
      }
    }
  }
  if (header.subRow) for (const [index, value] of header.subRow.cells) consider(index, value)
  for (const [index, value] of header.row.cells) consider(index, value)
  return columns
}

export function parseProforma(workbook, { fileName } = {}) {
  const warnings = []
  let picked = null

  for (const sheet of workbook.sheets) {
    const header = findHeader(sheet.rows)
    if (header) {
      picked = { sheet, header }
      break
    }
  }
  if (!picked) throw new Error('noProformaHeader')

  const { sheet, header } = picked
  const columns = mapColumns(header)
  // The barcode sits immediately right of Code, and its label cannot be
  // trusted -- ours reads "Barcode missing".
  const barcodeIndex = header.codeIndex + 1

  const invoiceNo = findInvoiceNumber(sheet.rows, header.row.number)

  const lines = []
  const failures = []
  for (const row of sheet.rows) {
    if (row.number <= header.lastHeaderRow) continue

    const value = (field) => {
      const index = Object.keys(columns).find((k) => columns[k] === field)
      return index === undefined ? null : (row.cells.get(Number(index)) ?? null)
    }

    const lineNo = value('line_no')
    // The TOTAL row carries text where the line number belongs. Detected by
    // content, not by being last: a supplier may add a note beneath it.
    if (lineNo === null || !/^\d+$/.test(String(lineNo).trim())) continue

    const supplierCode = (value('supplier_code') ?? '').toString().trim()
    const rawBarcode = row.cells.get(barcodeIndex) ?? null
    const barcode = cleanBarcode(rawBarcode)

    if (rawBarcode !== null && barcode === null) {
      failures.push({
        row: row.number,
        code: supplierCode,
        reason: 'badBarcode',
        detail: String(rawBarcode).trim(),
      })
      continue
    }

    lines.push({
      row: row.number,
      line_no: Number(lineNo),
      supplier_code: supplierCode || null,
      barcode,
      model: (value('model') ?? '').toString().trim() || null,
      description_en: (value('description_en') ?? '').toString().trim() || null,
      description_es: (value('description_es') ?? '').toString().trim() || null,
      quantity: decimal(value('quantity')),
      unit_price: decimal(value('unit_price')),
      amount: decimal(value('amount')),
    })
  }

  if (lines.length === 0 && failures.length === 0) throw new Error('noProformaRows')
  if (!invoiceNo) warnings.push('noInvoiceNumber')

  return {
    sheetName: sheet.name,
    fileName: fileName ?? null,
    invoiceNo,
    lines,
    failures,
    warnings,
  }
}

/**
 * The invoice number, from the metadata block above the table.
 *
 * Looked up by the label rather than a cell reference: the block moves as the
 * supplier's address grows.
 */
function findInvoiceNumber(rows, headerRowNumber) {
  for (const row of rows) {
    if (row.number >= headerRowNumber) break
    for (const [index, value] of row.cells) {
      if (!normalise(value).startsWith('invoice no')) continue
      // The value sits BELOW the label, in the same column -- the cell to the
      // right is the next label ("Date"), not the number.
      const below = rows.find((r) => r.number === row.number + 1)
      const under = below?.cells.get(index)
      if (under !== undefined && String(under).trim()) return String(under).trim()
      // Some suppliers put it beside the label instead.
      const beside = row.cells.get(index + 1)
      if (beside !== undefined && String(beside).trim()) return String(beside).trim()
    }
  }
  return null
}

export async function readProforma(file) {
  const workbook = await readWorkbook(file)
  return parseProforma(workbook, { fileName: file.name })
}
