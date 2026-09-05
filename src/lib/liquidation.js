/**
 * Reading a "liquidación de costo" workbook.
 *
 * One of these is produced per container: it takes what was ordered, adds the
 * freight, insurance, duties and local charges actually incurred, and arrives at
 * a landed cost per unit and a selling price.
 *
 * Columns are located by their heading text, not by position. These sheets are
 * maintained by hand and a column gets inserted sooner or later; matching on
 * position means the import silently reads duty as freight rather than failing.
 * Headings are normalised first — they contain line breaks, double spaces,
 * accents and at least one typo ("TRERRESTE") that must keep working.
 */

/** Strip accents, collapse whitespace, drop punctuation: for comparing headings. */
export const normalise = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

/**
 * Every field we read, with the headings seen in the wild.
 *
 * The first match wins, so more specific headings are listed before the
 * substrings they contain — "costo total imp pagos" before "costo total".
 */
const FIELDS = [
  { key: 'line_no', headings: ['no'], exact: true },
  { key: 'product_code', headings: ['codigo'] },
  { key: 'units', headings: ['unidades recibidas', 'unidades'] },
  { key: 'description', headings: ['descripcion'] },
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
  { key: 'port_storage', headings: ['almacenaje puerto dpw', 'almacenaje puerto'] },
  { key: 'port_collect', headings: ['dph o portcollect', 'dph'] },
  { key: 'customs_agent', headings: ['gestion aduanal'] },
  // The sheet spells it "TRERRESTE"; both spellings are accepted.
  { key: 'land_transport', headings: ['transporte trerreste', 'transporte terrestre'] },
  { key: 'inspection', headings: ['qima inspeccion', 'inspeccion'] },
  { key: 'local_handling', headings: ['manejo local'] },
  { key: 'landed_total', headings: ['total puesto en almacen'] },
  { key: 'landed_unit_cost', headings: ['costo unitario'] },
  { key: 'price_with_fx', headings: ['mas 4%v divisa 2 5%trans', 'mas 4%v divisa'] },
  { key: 'margin', headings: ['margen beneficios'] },
  { key: 'sale_price_ex_tax', headings: ['precio venta s itbis'] },
  { key: 'sale_price_inc_tax', headings: ['precio venta c itbis'] },
  { key: 'list_price', headings: ['precio lista actual', 'precio lista'] },
  { key: 'expected_volume', headings: ['volumen venta esperado'] },
  { key: 'suggested_price', headings: ['sugerencia de precio'] },
  { key: 'comment', headings: ['comentario'] },
]

/** Fields kept as first-class columns; the rest travel in the breakdown blob. */
export const HEADLINE_FIELDS = [
  'product_code',
  'units',
  'description',
  'fob_total',
  'landed_total',
  'landed_unit_cost',
  'sale_price_inc_tax',
  'list_price',
]

const num = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  // Excel error values ("#REF!", "#DIV/0!") arrive as text and are not zero.
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
 * Find the row that labels the columns.
 *
 * Identified by content rather than by a fixed row number: these sheets carry a
 * variable block of container totals above the table.
 */
function findHeaderRow(rows) {
  for (const row of rows) {
    const values = [...row.cells.values()].map(normalise)
    const hasCode = values.some((v) => v === 'codigo')
    const hasDescription = values.some((v) => v.startsWith('descripcion'))
    if (hasCode && hasDescription) return row
  }
  return null
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
        const hit = field.exact ? value === heading : value.startsWith(heading)
        if (hit) {
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
 * How usable this sheet is as a cost table: the number of coded rows, or 0.
 *
 * Zero unless it carries all three columns the parser cannot do without. That
 * matters because `REGISTRO` — an accounting ledger that lives in the same
 * workbook — heads its columns `UNIDAD | CODIGO | DESCRIPCION`, which is enough
 * to look like a cost table and enough to hold a few coded rows, and it has no
 * quantity at all. Counting rows alone let it tie with the real sheet and win
 * on sheet order.
 */
function tableScore(sheet, header) {
  const columns = mapColumns(header)
  for (const required of ['product_code', 'description', 'units']) {
    if (columns[required] === undefined) return 0
  }
  let found = 0
  for (const row of sheet.rows) {
    if (row.number <= header.number) continue
    if (text(row.cells.get(columns.product_code))) found += 1
  }
  return found
}

/**
 * The sheet holding the cost table.
 *
 * A header of `Codigo` beside `Descripcion` is not enough to choose by, because
 * these workbooks accumulate sheets. KLIK 56 and 57 each carry SIX: a `Precios`
 * and a `LIQUIDACION ` left over from another shipment entirely -- cáncamos,
 * with the code column empty -- and the real one under `LIQUIDACIÓN`, accent
 * and all. Taking the first sheet that merely parsed found `Precios`, read no
 * product rows from it and gave up with "the cost table has no product rows",
 * while the data sat two sheets away.
 *
 * So candidates are ranked by whether they yield any product rows at all, and a
 * sheet named CONTENEDOR still wins among those that do. The last resort is a
 * sheet that has a header and no rows, which keeps the original error message
 * for a workbook that genuinely has nothing in it.
 */
function pickSheet(sheets) {
  const scored = []
  for (const sheet of sheets) {
    const header = findHeaderRow(sheet.rows)
    if (!header) continue
    scored.push({ sheet, header, rows: tableScore(sheet, header) })
  }
  if (scored.length === 0) return { sheet: null, header: null }

  // Usable first, then the one named CONTENEDOR, then the fullest. The last
  // tie-break matters: a workbook can hold a stale sheet with two leftover rows
  // beside the real one with forty.
  scored.sort((a, b) => {
    const usable = (c) => (c.rows > 0 ? 0 : 1)
    const named = (c) => (normalise(c.sheet.name).startsWith('contenedor') ? 0 : 1)
    return usable(a) - usable(b) || named(a) - named(b) || b.rows - a.rows
  })
  return { sheet: scored[0].sheet, header: scored[0].header }
}

/**
 * Turn a workbook into `{ reference, lines, totals, warnings }`.
 *
 * `reference` is the order name written above the table ("MILAN 11").
 * `totals` are the sheet's own totals row where present — kept separately from
 * our sum of the lines so the two can be compared rather than assumed equal.
 */
export function parseLiquidation(workbook, { fileName } = {}) {
  const { sheet, header } = pickSheet(workbook.sheets)
  if (!sheet) {
    throw new Error('No cost table found: expected a sheet with "Codigo" and "Descripcion" columns.')
  }

  const columns = mapColumns(header)
  const warnings = []

  for (const required of ['product_code', 'description', 'units']) {
    if (columns[required] === undefined) {
      throw new Error(`The sheet has no "${required}" column that this importer recognises.`)
    }
  }
  if (columns.landed_unit_cost === undefined) {
    warnings.push('noUnitCost')
  }

  const lines = []
  let totalsRow = null

  for (const row of sheet.rows) {
    if (row.number <= header.number) continue

    const get = (key) => (columns[key] === undefined ? null : row.cells.get(columns[key]))
    const code = text(get('product_code'))

    if (!code) {
      // A row with figures but no code is the sheet's own totals line, which
      // sits directly under the last product.
      const landed = num(get('landed_total'))
      const units = num(get('units'))
      if (!totalsRow && (landed || units)) {
        totalsRow = {
          units,
          fob_total: num(get('fob_total')),
          landed_total: landed,
        }
      }
      continue
    }

    const line = { product_code: code, description: text(get('description')) }
    for (const field of FIELDS) {
      if (['product_code', 'description', 'comment', 'line_no'].includes(field.key)) continue
      line[field.key] = num(get(field.key))
    }
    line.comment = text(get('comment'))
    lines.push(line)
  }

  if (lines.length === 0) throw new Error('The cost table has no product rows.')

  // The order name sits above the table, usually alone in the first column.
  let reference = null
  for (const row of sheet.rows) {
    if (row.number >= header.number) break
    for (const value of row.cells.values()) {
      const candidate = text(value)
      if (candidate && candidate.length <= 40 && /[A-Za-z]/.test(candidate) && /\d/.test(candidate)) {
        reference = candidate
        break
      }
    }
    if (reference) break
  }

  const summed = {
    units: lines.reduce((s, l) => s + (l.units ?? 0), 0),
    fob_total: lines.reduce((s, l) => s + (l.fob_total ?? 0), 0),
    landed_total: lines.reduce((s, l) => s + (l.landed_total ?? 0), 0),
  }

  // If the sheet states its own totals and ours disagree, say so rather than
  // quietly importing figures that do not add up.
  if (totalsRow) {
    for (const key of ['units', 'fob_total', 'landed_total']) {
      const stated = totalsRow[key]
      const ours = summed[key]
      if (stated == null || !ours) continue
      const drift = Math.abs(stated - ours)
      const tolerance = Math.max(0.02, Math.abs(stated) * 0.0001)
      if (drift > tolerance) warnings.push(`total:${key}`)
    }
  }

  return {
    reference,
    sheetName: sheet.name,
    fileName: fileName ?? null,
    lines,
    totals: summed,
    statedTotals: totalsRow,
    warnings,
    columnsFound: Object.keys(columns).length,
  }
}

/** Split a parsed line into the stored columns and the breakdown blob. */
export const splitLine = (line) => {
  const breakdown = {}
  for (const [key, value] of Object.entries(line)) {
    if (HEADLINE_FIELDS.includes(key) || key === 'comment') continue
    if (value !== null && value !== undefined) breakdown[key] = value
  }
  return breakdown
}
