/**
 * Reading the documents a cost sheet is converted FROM.
 *
 * Two shapes turn up. The current one -- "CONTENEDOR 1" in
 * `LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx` -- allocates freight and insurance
 * and carries a full pricing block. The old one -- "Precios" in
 * `LIQUIDACION CHS 09 - copia.xlsx` -- has neither: its CIF PESOS is a figure
 * pasted in from the declaration, and there is no exchange rate on the sheet at
 * all. Converting the second into the first is what this section exists for,
 * and everything the old sheet cannot answer has to be ASKED rather than
 * assumed.
 *
 * Columns are found by heading text, never by position, for the reason given in
 * lib/liquidation.js: these sheets are kept by hand and gain a column sooner or
 * later, and reading duty as freight is worse than failing.
 */

import { normalise } from './liquidation'

export const FORMAT = { TARGET: 'target', OLD: 'old', UNKNOWN: 'unknown' }

/**
 * Column A of a spreadsheet is 0 here and 'A' on screen. People report these
 * sheets by cell -- "the rate is missing from H10" -- so every source quoted
 * back to them is written the way they would write it.
 */
export const columnLetter = (index) => {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export const cellRef = (rowNumber, columnIndex) => `${columnLetter(columnIndex)}${rowNumber}`

/**
 * Where a value came from, in the words a person would use to go and look at it.
 *
 * Every prefilled field carries one of these, so an auto-detected figure can be
 * told from a typed one at a glance -- which is the whole point of showing them.
 */
export const source = (fileName, sheetName, rowNumber, columnIndex) => ({
  file: fileName ?? null,
  sheet: sheetName ?? null,
  cell: rowNumber != null && columnIndex != null ? cellRef(rowNumber, columnIndex) : null,
})

const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  // Excel error text ("#REF!", "#N/A") is not a number and is certainly not zero.
  if (value.trim().startsWith('#')) return null
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

const text = (value) => {
  const s = String(value ?? '').trim()
  if (!s || s.startsWith('#')) return null
  return s.replace(/\s+/g, ' ')
}

/**
 * Every column either layout can carry.
 *
 * The first match wins, so a heading that starts with another one is listed
 * above it: "costo total imp pagos" before "costo total", "gravamen itbis"
 * before "gravamen", "total puesto en almacen" before the bare "total".
 *
 * `exact` marks patterns short enough to begin an unrelated heading. "no" as a
 * prefix would swallow "No. entrada"; "total" as a prefix would swallow
 * "Total Puesto en almacen" and take the landed cost with it.
 */
const FIELDS = [
  { key: 'line_no', headings: ['no'], exact: true },
  { key: 'product_code', headings: ['codigo'] },
  { key: 'units', headings: ['unidades recibidas', 'unidades', 'cantidad'] },
  { key: 'description', headings: ['descripcion'] },
  // The old sheet states a unit price and multiplies it out; the current one
  // states only the line amount. Both are read, and the line amount leads.
  { key: 'fob_unit', headings: ['precio fob', 'fob unitario'] },
  { key: 'customs_total', headings: ['costo total imp pagos'] },
  { key: 'fob_total', headings: ['costo total'] },
  { key: 'freight', headings: ['flete'] },
  { key: 'insurance', headings: ['seguro'] },
  { key: 'cif_usd', headings: ['cif dolares'] },
  { key: 'cif_local', headings: ['cif pesos'] },
  { key: 'duty_and_vat', headings: ['gravamen itbis'] },
  { key: 'duty', headings: ['gravamen'] },
  { key: 'excise', headings: ['selectivo'] },
  { key: 'vat', headings: ['itbis'] },
  { key: 'customs_service', headings: ['servicio aduanero'] },
  { key: 'port_storage', headings: ['almacenaje puerto'] },
  // "PORT COLLET" on the old sheet, "DPH O PORTCOLLECT" on the current one.
  { key: 'port_collect', headings: ['dph', 'portcollect', 'port collect', 'port collet'] },
  { key: 'customs_agent', headings: ['gestion aduanal'] },
  // The sheet spells it "TRERRESTE". Both spellings are accepted; see CLAUDE.md.
  { key: 'land_transport', headings: ['transporte trerreste', 'transporte terrestre'] },
  { key: 'inspection', headings: ['qima inspeccion', 'inspeccion qima', 'inspeccion', 'qima'] },
  { key: 'local_handling', headings: ['manejo local'] },
  { key: 'landed_total', headings: ['total puesto en almacen'] },
  { key: 'landed_unit_cost', headings: ['costo unitario'] },
  // The old sheet's bare "Total" is the current sheet's "COSTO TOTAL IMP.
  // PAGOS": CIF plus duty plus excise, the base the local charges are shared
  // out by. Read only to be checked against, never carried forward.
  { key: 'customs_total_old', headings: ['total'], exact: true },
  { key: 'price_with_fx', headings: ['mas 4%v divisa'] },
  { key: 'margin', headings: ['margen beneficios'] },
  { key: 'sale_price_ex_tax', headings: ['precio venta s itbis'] },
  { key: 'sale_price_inc_tax', headings: ['precio venta c itbis'] },
  { key: 'list_price', headings: ['precio lista actual', 'precio lista'] },
  { key: 'expected_volume', headings: ['volumen venta esperado'] },
  { key: 'suggested_price', headings: ['sugerencia de precio'] },
  { key: 'comment', headings: ['comentario'] },
]

/** The seven local expenses, in the order the target sheet prints them. */
export const EXPENSE_KEYS = [
  'customs_service',
  'port_storage',
  'port_collect',
  'customs_agent',
  'land_transport',
  'inspection',
  'local_handling',
]

/** The five gravamen rates the current header offers. The old one lacks 0.08. */
export const GRAVAMEN_RATES = [0, 0.2, 0.14, 0.03, 0.08]

/**
 * A rate read back off a line, snapped to one of the five where it is one.
 *
 * The rate is not written anywhere on the sheet -- it lives inside the formula
 * `=G11*0.2`, and this reader sees cached values, not formulas. So it is
 * recovered by division, which lands on 0.19999999999999998 as often as not.
 * Anything that does not land on one of the five is kept exactly as found and
 * reported, because a duty rate nobody recognises is a question, not a figure
 * to round away.
 */
export const snapRate = (rate) => {
  if (rate == null || !Number.isFinite(rate)) return { rate: null, snapped: false }
  for (const option of GRAVAMEN_RATES) {
    if (Math.abs(rate - option) < 1e-6) return { rate: option, snapped: true }
  }
  return { rate, snapped: false }
}

function mapColumns(headerRow) {
  const columns = {}
  const taken = new Set()
  for (const field of FIELDS) {
    for (const heading of field.headings) {
      let found = null
      for (const [index, raw] of headerRow.cells) {
        if (taken.has(index)) continue
        const value = normalise(raw)
        if (field.exact ? value === heading : value.startsWith(heading)) {
          found = index
          break
        }
      }
      if (found !== null) {
        columns[field.key] = found
        taken.add(found)
        break
      }
    }
  }
  return columns
}

/**
 * A sheet is ours only if it carries a heading no supplier writes on an invoice
 * to us.
 *
 * "Codigo" beside "Descripcion" is not enough on its own: CHS's commercial
 * invoice heads its columns exactly that way. The invoice reader keeps the same
 * guard from the other side, under the name OUR_COST_SHEET.
 */
const OURS = [
  'cif pesos',
  'cif dolares',
  'costo unitario',
  'unidades recibidas',
  'total puesto en almacen',
]

function findHeaderRow(rows) {
  for (const row of rows) {
    const values = [...row.cells.values()].map(normalise)
    const hasCode = values.some((v) => v === 'codigo')
    const hasDescription = values.some((v) => v.startsWith('descripcion'))
    if (!hasCode || !hasDescription) continue
    if (!values.some((v) => OURS.some((o) => v.startsWith(o)))) continue
    return row
  }
  return null
}

/**
 * The row carrying the seven local expense totals, and the one carrying their
 * entry numbers.
 *
 * Both are found by their own label -- "MONTOS" and "No. entrada" -- rather
 * than by a row offset, because the block above the table is a different height
 * in the two layouts: row 9 on the old sheet, row 10 on the current one.
 */
function findLabelledRow(rows, headerNumber, label) {
  for (const row of rows) {
    if (row.number >= headerNumber) break
    for (const [index, value] of row.cells) {
      if (normalise(value) === label) return { row, index }
    }
  }
  return null
}

/**
 * The shipment's name, written above the table on its own.
 *
 * "CHS 09", "MILAN 11" -- letters and digits, short. The same rule
 * parseLiquidation uses for an order reference, and for the same reason: it is
 * the only place either sheet says which shipment it is.
 */
function findShipmentName(rows, headerNumber) {
  for (const row of rows) {
    if (row.number >= headerNumber) break
    for (const [index, value] of row.cells) {
      const candidate = text(value)
      if (
        candidate &&
        candidate.length <= 40 &&
        /[A-Za-z]/.test(candidate) &&
        /\d/.test(candidate) &&
        normalise(candidate) !== 'no entrada'
      ) {
        return { name: candidate, row: row.number, index }
      }
    }
  }
  return null
}

/**
 * The exchange rates, the freight and the insurance, out of the CUENTA T sheet.
 *
 * CUENTA T is an account, not a cost sheet. It states FOUR different rates --
 * what the initial payment worked out at, what the completive payment worked
 * out at, the average of the two, and the one DGII used -- and nothing on it
 * says which one a cost sheet should use. That is decision 2 in the interface,
 * and this reader's job is to find every candidate and label it, not to choose.
 *
 * The two TASA columns are located from the "TASA" headings rather than by
 * letter, and each rate is read from the row its own label names. Taking "the
 * last number in the row" instead picks up the DIFERENCIAS column on the
 * completive row, which is a peso amount and not a rate at all.
 */
function parseCuentaT(sheet, fileName) {
  if (!sheet) return { rates: [], freight: null, insurance: null }

  const tasaColumns = []
  let dgiiColumn = null
  let amountColumn = null

  for (const row of sheet.rows) {
    for (const [index, value] of row.cells) {
      const v = normalise(value)
      if (v === 'tasa' && !tasaColumns.includes(index)) tasaColumns.push(index)
      if (v.startsWith('segun dgii')) dgiiColumn = index
      if (v.startsWith('monto rd')) amountColumn = index
    }
  }
  tasaColumns.sort((a, b) => a - b)

  // The system block's rate column, then the DGII block's. Where only one
  // "TASA" heading exists there is only a system rate to be had.
  const systemColumn = tasaColumns[0] ?? null
  const dgiiRateColumn =
    tasaColumns.find((c) => dgiiColumn != null && c > dgiiColumn) ?? tasaColumns[1] ?? null

  const rates = []
  const addRate = (id, row, column) => {
    if (column == null || rates.some((r) => r.id === id)) return
    const value = num(row.cells.get(column))
    if (value == null || value <= 0) return
    rates.push({ id, value, source: source(fileName, sheet.name, row.number, column) })
  }

  let freight = null
  let insurance = null

  for (const row of sheet.rows) {
    const labels = [...row.cells.values()].map(normalise)
    if (labels.includes('inicial')) addRate('initial', row, systemColumn)
    if (labels.includes('completivo')) addRate('completive', row, systemColumn)
    if (labels.includes('total')) addRate('average', row, systemColumn)
    if (dgiiRateColumn != null) addRate('dgii', row, dgiiRateColumn)

    // FLETE MARITIMO and PRIMA SEGURO, read in the "MONTO RD" column.
    if (amountColumn != null) {
      const amount = num(row.cells.get(amountColumn))
      if (amount != null) {
        if (freight == null && labels.some((v) => v.startsWith('flete'))) {
          freight = { value: amount, source: source(fileName, sheet.name, row.number, amountColumn) }
        }
        if (insurance == null && labels.some((v) => v.startsWith('prima seguro'))) {
          insurance = { value: amount, source: source(fileName, sheet.name, row.number, amountColumn) }
        }
      }
    }
  }

  return { rates, freight, insurance }
}

/** The workbook's own lookup sheet: code, description, list price. */
function parseLookupSheet(workbook) {
  const sheet = workbook.sheets.find((s) => normalise(s.name).startsWith('no tocar'))
  if (!sheet) return null
  const entries = []
  for (const row of sheet.rows) {
    const code = text(row.cells.get(0))
    if (!code) continue
    // The current file heads this sheet; the old one starts straight at data.
    if (normalise(code).startsWith('numero de articulo')) continue
    entries.push({ code, description: text(row.cells.get(1)), list_price: num(row.cells.get(2)) })
  }
  return { name: sheet.name, entries }
}

/**
 * Read a cost sheet workbook.
 *
 * Returns a format of 'unknown' rather than throwing when the file is not one
 * of ours: an unrelated spreadsheet should be reported in the interface, not
 * surfaced as an exception in a developer's wording.
 */
export function parseCostSheetWorkbook(workbook, { fileName } = {}) {
  let picked = null
  for (const sheet of workbook.sheets) {
    const header = findHeaderRow(sheet.rows)
    if (!header) continue
    picked = { sheet, header }
    // A sheet named CONTENEDOR is the cost table proper; prefer it over any
    // other that happens to parse.
    if (normalise(sheet.name).startsWith('contenedor')) break
  }

  if (!picked) {
    return {
      format: FORMAT.UNKNOWN,
      fileName: fileName ?? null,
      sheetNames: workbook.sheets.map((s) => s.name),
    }
  }

  const { sheet, header } = picked
  const columns = mapColumns(header)
  // The current layout allocates freight and derives CIF in dollars; the old
  // one has neither column. That is the whole difference between them.
  const format = columns.cif_usd !== undefined && columns.freight !== undefined
    ? FORMAT.TARGET
    : FORMAT.OLD

  const get = (row, key) => (columns[key] === undefined ? null : row.cells.get(columns[key]))

  const lines = []
  let statedTotals = null

  for (const row of sheet.rows) {
    if (row.number <= header.number) continue
    const code = text(get(row, 'product_code'))

    if (!code) {
      // No code but figures present: the sheet's own totals line, which sits
      // directly under the last product.
      const landed = num(get(row, 'landed_total'))
      const units = num(get(row, 'units'))
      const fob = num(get(row, 'fob_total'))
      if (!statedTotals && (landed != null || units != null || fob != null)) {
        statedTotals = {
          row: row.number,
          units,
          fob_total: fob,
          cif_local: num(get(row, 'cif_local')),
          landed_total: landed,
        }
      }
      continue
    }

    const cif = num(get(row, 'cif_local'))
    const duty = num(get(row, 'duty'))
    const rawRate = cif != null && cif !== 0 && duty != null ? duty / cif : null
    const { rate, snapped } = snapRate(rawRate)

    lines.push({
      row: row.number,
      line_no: num(get(row, 'line_no')),
      product_code: code,
      units: num(get(row, 'units')),
      description: text(get(row, 'description')),
      fob_unit: num(get(row, 'fob_unit')),
      fob_total: num(get(row, 'fob_total')),
      cif_local: cif,
      duty,
      excise: num(get(row, 'excise')),
      list_price: num(get(row, 'list_price')),
      comment: text(get(row, 'comment')),
      gravamen_rate: rate,
      gravamen_snapped: snapped,
    })
  }

  // The seven expense totals and their entry numbers, read at the column each
  // expense's own heading sits in -- not at a fixed offset from "MONTOS", since
  // the two layouts word five of the seven headings differently.
  const montos = findLabelledRow(sheet.rows, header.number, 'montos')
  const entrada = findLabelledRow(sheet.rows, header.number, 'no entrada')
  const expenses = {}
  const entryNumbers = {}
  for (const key of EXPENSE_KEYS) {
    const column = columns[key]
    if (column === undefined) {
      expenses[key] = { value: null, source: null }
      entryNumbers[key] = { value: null, source: null }
      continue
    }
    const amount = montos ? num(montos.row.cells.get(column)) : null
    expenses[key] = {
      value: amount,
      source: montos && amount != null ? source(fileName, sheet.name, montos.row.number, column) : null,
    }
    const entry = entrada ? entrada.row.cells.get(column) : null
    entryNumbers[key] = {
      value: entry == null ? null : String(entry).trim(),
      source: entrada && entry != null ? source(fileName, sheet.name, entrada.row.number, column) : null,
    }
  }

  const shipment = findShipmentName(sheet.rows, header.number)
  const cuentaT = workbook.sheets.find((s) => normalise(s.name).startsWith('cuenta t'))
  const account = parseCuentaT(cuentaT, fileName)

  // Stated in the header block of the current layout only.
  let freightUsd = null
  let insuranceUsd = null
  let exchangeRate = null
  if (format === FORMAT.TARGET && montos) {
    const at = (key) => {
      const column = columns[key]
      if (column === undefined) return null
      const value = num(montos.row.cells.get(column))
      return value == null
        ? null
        : { value, source: source(fileName, sheet.name, montos.row.number, column) }
    }
    freightUsd = at('freight')
    insuranceUsd = at('insurance')
    // The rate sits under the CIF DOLARES column; nothing labels it, and on
    // this layout nothing else is there.
    exchangeRate = at('cif_usd')
  }

  return {
    format,
    fileName: fileName ?? null,
    sheetName: sheet.name,
    sheetNames: workbook.sheets.map((s) => s.name),
    headerRow: header.number,
    columns,
    shipmentName: shipment?.name ?? null,
    shipmentSource: shipment ? source(fileName, sheet.name, shipment.row, shipment.index) : null,
    lines,
    statedTotals,
    expenses,
    entryNumbers,
    freightUsd,
    insuranceUsd,
    exchangeRate,
    rates: account.rates,
    accountFreight: account.freight,
    accountInsurance: account.insurance,
    cuentaTSheet: cuentaT?.name ?? null,
    lookup: parseLookupSheet(workbook),
  }
}
