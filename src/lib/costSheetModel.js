/**
 * The current cost sheet, as a calculation.
 *
 * This module holds the shape of "CONTENEDOR 1" -- its thirty-one columns, the
 * two allocation drivers, and every figure derived from them -- and the rules
 * that decide whether a conversion may be downloaded.
 *
 * THE ARITHMETIC IS DELIBERATELY IEEE-754, not decimal. The generated workbook
 * carries live formulas, so Excel recalculates every derived cell itself, in
 * binary doubles. A preview computed in arbitrary-precision decimal would
 * therefore be guaranteed to disagree with the file it is previewing. What is
 * kept exact is everything a PERSON states -- the freight, the rate, the seven
 * expenses -- which is parsed from its own text rather than round-tripped
 * through arithmetic, and every figure shown is rounded explicitly at the point
 * of display. Sums accumulate in row order, which is the order Excel's own SUM
 * walks a range, so the two agree to the last bit rather than merely to the
 * cent.
 *
 * The other rule here: nothing is invented. A lookup that fails leaves a cell
 * BLANK and raises a finding. It does not fall back to zero -- a landed cost of
 * nothing and a selling price of nothing are both real, different claims, and a
 * figure invites arithmetic in a way an empty cell does not.
 */

import { codeKey, formatProductCode, productDescription, isInternalUse } from './catalog'
import { EXPENSE_KEYS, GRAVAMEN_RATES } from './costSheetSource'

/**
 * The two ITBIS bases, and the reason there is a choice at all.
 *
 * The current sheet charges ITBIS on CIF plus gravamen; the old one included
 * Selectivo in the base as well. Neither is wrong in general -- which applies
 * depends on the goods -- and the sample files disagree, so this is asked
 * rather than assumed. Every tax figure on the sheet moves with it.
 */
export const ITBIS_BASES = ['sinSelectivo', 'conSelectivo']
export const DEFAULT_ITBIS_BASE = 'sinSelectivo'

/** Where each line's gravamen rate is taken from. */
export const GRAVAMEN_SOURCES = ['sheet', 'arancel']
export const DEFAULT_GRAVAMEN_SOURCE = 'sheet'

/** Freight and insurance as stated: dollars, or pesos to be converted. */
export const CURRENCIES = ['USD', 'DOP']

export const ITBIS_RATE = 0.18

/**
 * The factor in column X: 4% on the currency exchange and 2.5% on the transfer.
 * Written as one number on the sheet and kept that way.
 */
export const FX_FACTOR = 1.065

/**
 * Columns Z and AA divide by these. The 1.12 is NOT the current ITBIS rate --
 * it is what the target workbook writes, and every sheet in this series has
 * written it for years. Changing it here would silently reprice a whole
 * shipment against the file it is supposed to reproduce, so it is carried over
 * exactly and flagged in the documentation instead.
 */
export const PRICE_EX_TAX_DIVISOR = 1.18
export const PRICE_INC_TAX_DIVISOR = 1.12

/**
 * The thirty-one columns of "CONTENEDOR 1", in order.
 *
 * `header` is reproduced to the character, line breaks and trailing spaces
 * included, because these sheets are compared side by side with earlier ones
 * and a heading that reads differently looks like a different document.
 * `kind` drives both the preview's alignment and the number format written
 * into the workbook.
 */
export const COLUMNS = [
  { key: 'no', letter: 'A', header: 'No.', kind: 'int' },
  { key: 'code', letter: 'B', header: 'Codigo', kind: 'text' },
  { key: 'units', letter: 'C', header: 'Unidades \nRecibidas', kind: 'int' },
  { key: 'description', letter: 'D', header: 'Descripcion', kind: 'text' },
  { key: 'fob', letter: 'E', header: 'COSTO TOTAL', kind: 'money' },
  { key: 'freight', letter: 'F', header: 'FLETE', kind: 'money' },
  { key: 'insurance', letter: 'G', header: 'SEGURO', kind: 'money' },
  { key: 'cifUsd', letter: 'H', header: 'CIF DOLARES ', kind: 'money' },
  { key: 'cifLocal', letter: 'I', header: 'CIF PESOS', kind: 'money' },
  { key: 'duty', letter: 'J', header: 'Gravamen\n', kind: 'money' },
  { key: 'excise', letter: 'K', header: 'Selectivo', kind: 'money' },
  { key: 'vat', letter: 'L', header: 'ITBIS', kind: 'money' },
  { key: 'dutyVat', letter: 'M', header: 'Gravamen + \nITBIS', kind: 'money' },
  { key: 'customsTotal', letter: 'N', header: 'COSTO TOTAL IMP. PAGOS', kind: 'money' },
  { key: 'customs_service', letter: 'O', header: 'SERVICIO ADUANERO', kind: 'money', expense: true },
  { key: 'port_storage', letter: 'P', header: 'ALMACENAJE PUERTO DPW', kind: 'money', expense: true },
  { key: 'port_collect', letter: 'Q', header: 'DPH O PORTCOLLECT', kind: 'money', expense: true },
  { key: 'customs_agent', letter: 'R', header: 'GESTION ADUANAL', kind: 'money', expense: true },
  // The sheet's own spelling. Do not "fix" it: see CLAUDE.md.
  { key: 'land_transport', letter: 'S', header: 'TRANSPORTE TRERRESTE', kind: 'money', expense: true },
  { key: 'inspection', letter: 'T', header: 'QIMA INSPECCION', kind: 'money', expense: true },
  { key: 'local_handling', letter: 'U', header: 'MANEJO LOCAL ', kind: 'money', expense: true },
  { key: 'landed', letter: 'V', header: 'Total puesto en Almacen', kind: 'money' },
  { key: 'unitCost', letter: 'W', header: 'Costo \nunitario', kind: 'money' },
  { key: 'withFx', letter: 'X', header: 'MAS\n4%V/DIVISA\n2,5%TRANS', kind: 'money' },
  { key: 'margin', letter: 'Y', header: 'MARGEN \nBENEFICIOS', kind: 'ratio' },
  { key: 'priceExTax', letter: 'Z', header: '\nPRECIO VENTA S/ITBIS    ', kind: 'money' },
  { key: 'priceIncTax', letter: 'AA', header: 'PRECIO VENTA \nC/ITBIS', kind: 'money' },
  { key: 'listPrice', letter: 'AB', header: 'PRECIO \nLISTA\nActual', kind: 'money' },
  { key: 'expectedVolume', letter: 'AC', header: 'VOLUMEN\nVENTA\nESPERADO', kind: 'money' },
  { key: 'suggestedPrice', letter: 'AD', header: 'SUGERENCIA DE PRECIO', kind: 'money' },
  { key: 'comment', letter: 'AE', header: 'COMENTARIO', kind: 'text' },
]

/** Where the fixed parts of the sheet live. Row 12 is always the first line. */
export const LAYOUT = {
  shipmentNameCell: 'A2',
  ratesFirstRow: 2,
  entryLabelRow: 8,
  headerBlockRow: 10,
  headerRow: 11,
  firstDataRow: 12,
}

const isBlank = (value) => value === null || value === undefined || value === ''

/**
 * A number typed by a person, read exactly as typed.
 *
 * Accepts both conventions -- "1.234,56" and "1,234.56" -- because these sheets
 * are read in Spanish and typed on keyboards set either way. The separator that
 * appears LAST is the decimal one; where only one kind appears, a group of
 * exactly three digits after it means it was a thousands separator.
 *
 * Returns null rather than NaN or 0. A field nobody filled must not arrive in
 * the arithmetic as a zero, which is a real and different answer.
 */
export const parseAmount = (input) => {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^\d.,-]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null

  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalised
  if (lastComma > -1 && lastDot > -1) {
    normalised =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '')
  } else if (lastComma > -1) {
    const tail = cleaned.length - lastComma - 1
    normalised = tail === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.')
  } else {
    const tail = lastDot > -1 ? cleaned.length - lastDot - 1 : -1
    // "1.234" with one dot and three digits after it is a thousands separator
    // only when there is more than one group; a bare "1.234" price is left alone.
    normalised = cleaned
    if (tail === 3 && (cleaned.match(/\./g) ?? []).length > 1) normalised = cleaned.replace(/\./g, '')
  }
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/**
 * Round half away from zero at `dp`, the way a person reading the sheet would.
 *
 * The naive `Math.round(v * 100) / 100` gets 1.005 wrong, because 1.005 is
 * really 1.00499999999999989 in binary. Going through the decimal exponent form
 * side-steps that without pulling in a decimal library for a rounding that only
 * ever affects display.
 */
export const round = (value, dp = 2) => {
  if (value == null || !Number.isFinite(value)) return null
  const shifted = Number(`${value}e${dp}`)
  if (!Number.isFinite(shifted)) return value
  return Number(`${Math.round(Math.abs(shifted)) * Math.sign(shifted) || 0}e${-dp}`)
}

/** Excel sums a range in order; so does this, so the two agree exactly. */
const sum = (values) => {
  let total = 0
  for (const value of values) total += value ?? 0
  return total
}

/**
 * Freight and insurance in dollars, whatever they were stated in.
 *
 * The target sheet's F10 and G10 are dollars by definition. CUENTA T states
 * both in pesos, under a column headed "MONTO RD". Converting is the ONLY
 * currency arithmetic in this module, and it happens once, here.
 */
export const toUsd = (amount, currency, rate) => {
  if (isBlank(amount)) return null
  if (currency === 'USD') return amount
  if (isBlank(rate) || !rate) return null
  return amount / rate
}

/**
 * Where each product's description and list price came from.
 *
 * The Catalog leads: it is the platform's own record, kept current by every
 * import. The source workbook's "No tocar" sheet is the fallback, which is
 * flagged -- it is a snapshot from whenever that file was last saved, and a
 * price out of it may be a year stale. A product in neither is reported by
 * name, and its cells stay empty.
 */
export const resolveProduct = ({ code, sourceLookup, catalogByKey, invoiceByKey }) => {
  const key = codeKey(code)
  const product = catalogByKey?.get(key) ?? null
  const lookupEntry = sourceLookup?.get(key) ?? null
  const invoiceLine = invoiceByKey?.get(key) ?? null

  const catalogDescription = product ? productDescription(product) : null
  const invoiceDescription = invoiceLine?.description_es || invoiceLine?.description_en || null

  let description = null
  let descriptionFrom = null
  if (catalogDescription) {
    description = catalogDescription
    descriptionFrom = 'catalog'
  } else if (lookupEntry?.description) {
    description = lookupEntry.description
    descriptionFrom = 'lookup'
  } else if (invoiceDescription) {
    description = invoiceDescription
    descriptionFrom = 'invoice'
  }

  // A product marked internal-use has no selling price on purpose -- spare
  // drivers, samples. That is an absence, not a price of zero, so the cell
  // stays blank and the reason is reported rather than a 0.00 written in.
  const internal = product ? isInternalUse(product) : false
  let listPrice = null
  let listPriceFrom = null
  if (product && !internal && !isBlank(product.precio_lista) && Number(product.precio_lista) > 0) {
    listPrice = Number(product.precio_lista)
    listPriceFrom = 'catalog'
  } else if (!internal && lookupEntry && lookupEntry.list_price != null && lookupEntry.list_price > 0) {
    listPrice = lookupEntry.list_price
    listPriceFrom = 'lookup'
  }

  return {
    description,
    descriptionFrom,
    listPrice,
    listPriceFrom,
    internal,
    arancel: invoiceLine?.arancel ?? product?.arancel ?? null,
    inCatalog: Boolean(product),
  }
}

/**
 * A gravamen rate per line, from the chosen source, falling back to the other.
 *
 * The commercial invoice states a TARIFF CODE, not a rate -- a partida
 * arancelaria says what the goods are, and the rate that goes with it is
 * recorded against products we have already imported. So `arancelRates` is
 * built from the Catalog's own arancel/gravamen_pct pairs; nothing is invented
 * from the tariff code itself. Where an arancel carries two different rates in
 * the Catalog it identifies nothing, and the line falls back and says so.
 */
export const resolveGravamen = ({ preferred, fromSheet, arancel, arancelRates }) => {
  const fromArancel = arancel && arancelRates ? arancelRates.get(String(arancel).trim()) : undefined
  const arancelRate = fromArancel === undefined ? null : fromArancel

  const first = preferred === 'arancel' ? arancelRate : fromSheet
  const second = preferred === 'arancel' ? fromSheet : arancelRate

  if (first != null) return { rate: first, from: preferred, fellBack: false }
  if (second != null) {
    return { rate: second, from: preferred === 'arancel' ? 'sheet' : 'arancel', fellBack: true }
  }
  return { rate: null, from: null, fellBack: false }
}

/**
 * Build the arancel -> rate map out of the Catalog.
 *
 * Only tariff codes whose recorded rate is unanimous. Two products sharing a
 * partida but carrying different gravamen percentages mean the platform does
 * not actually know the rate for that partida, and picking either would be a
 * guess with a customs figure attached.
 */
export const arancelRateIndex = (products) => {
  const seen = new Map()
  for (const product of products ?? []) {
    const arancel = product?.arancel ? String(product.arancel).trim() : null
    if (!arancel || isBlank(product.gravamen_pct)) continue
    const rate = Number(product.gravamen_pct) / 100
    if (!Number.isFinite(rate)) continue
    const current = seen.get(arancel)
    if (current === undefined) seen.set(arancel, rate)
    else if (current !== null && Math.abs(current - rate) > 1e-9) seen.set(arancel, null)
  }
  const index = new Map()
  for (const [arancel, rate] of seen) if (rate !== null) index.set(arancel, rate)
  return index
}

/**
 * Compute the whole sheet.
 *
 * Every derived column is produced here exactly as the workbook's formula will
 * produce it, so the preview and the downloaded file agree. Anything that
 * cannot be computed comes back null and is rendered as an em dash rather than
 * as a zero.
 */
export function computeSheet(input) {
  const {
    lines = [],
    exchangeRate = null,
    freightUsd = null,
    insuranceUsd = null,
    expenses = {},
    itbisBase = DEFAULT_ITBIS_BASE,
  } = input

  const fobValues = lines.map((line) => line.fob ?? null)
  const totalFob = sum(fobValues)

  // First pass: everything up to the customs total, which is the second
  // allocation driver and cannot be shared out until every line has one.
  const stage = lines.map((line) => {
    const fob = line.fob
    const share = totalFob ? (fob ?? 0) / totalFob : null
    const freight = share == null || freightUsd == null ? null : share * freightUsd
    const insurance = share == null || insuranceUsd == null ? null : share * insuranceUsd
    const cifUsd = fob == null || freight == null || insurance == null ? null : fob + freight + insurance
    const cifLocal = cifUsd == null || exchangeRate == null ? null : cifUsd * exchangeRate
    const duty = cifLocal == null || line.gravamenRate == null ? null : cifLocal * line.gravamenRate
    const excise = line.excise ?? 0
    const vatBase =
      cifLocal == null || duty == null
        ? null
        : itbisBase === 'conSelectivo'
          ? cifLocal + duty + excise
          : cifLocal + duty
    const vat = vatBase == null ? null : vatBase * ITBIS_RATE
    const dutyVat = duty == null || vat == null ? null : duty + vat
    const customsTotal = cifLocal == null || duty == null ? null : cifLocal + duty + excise
    return { ...line, fob, freight, insurance, cifUsd, cifLocal, duty, excise, vat, dutyVat, customsTotal }
  })

  const totalCustoms = sum(stage.map((row) => row.customsTotal))

  const rows = stage.map((row, index) => {
    const out = { ...row, no: index + 1 }

    for (const key of EXPENSE_KEYS) {
      const total = expenses[key]
      out[key] =
        row.customsTotal == null || !totalCustoms || isBlank(total)
          ? null
          : (row.customsTotal / totalCustoms) * total
    }

    const parts = [row.customsTotal, ...EXPENSE_KEYS.map((key) => out[key])]
    out.landed = parts.some((value) => value == null) ? null : sum(parts)
    out.unitCost = out.landed == null || !row.units ? null : out.landed / row.units
    out.withFx = out.unitCost == null ? null : out.unitCost * FX_FACTOR

    // The pricing block runs backwards: the list price is the known figure and
    // the two selling prices are worked back from it. With no list price there
    // is nothing to work back FROM, so all four cells stay empty rather than
    // collapsing to a chain of zeros that reads as "we sell this for nothing".
    if (out.listPrice == null) {
      out.priceIncTax = null
      out.priceExTax = null
      out.margin = null
      out.expectedVolume = null
    } else {
      out.priceIncTax = out.listPrice / PRICE_INC_TAX_DIVISOR
      out.priceExTax = out.priceIncTax / PRICE_EX_TAX_DIVISOR
      // A zero landed cost would divide by zero here. Excel would show
      // #DIV/0!, which must never reach a generated file, so the cell is left
      // empty and the line is reported instead.
      out.margin = out.withFx ? out.priceExTax / out.withFx - 1 : null
      out.expectedVolume = row.units == null ? null : out.priceExTax * row.units
    }
    return out
  })

  const totalOf = (key) => sum(rows.map((row) => row[key]))
  const totals = {
    units: totalOf('units'),
    fob: totalFob,
    freight: totalOf('freight'),
    insurance: totalOf('insurance'),
    cifUsd: totalOf('cifUsd'),
    cifLocal: totalOf('cifLocal'),
    duty: totalOf('duty'),
    excise: totalOf('excise'),
    vat: totalOf('vat'),
    dutyVat: totalOf('dutyVat'),
    customsTotal: totalCustoms,
    landed: totalOf('landed'),
    expectedVolume: totalOf('expectedVolume'),
  }
  for (const key of EXPENSE_KEYS) totals[key] = totalOf(key)

  return {
    rows,
    totals,
    // The two figures under the table: what a peso of goods costs by the time
    // it is in the warehouse, and the gross profit the sheet expects.
    costFactor: totals.fob ? totals.landed / totals.fob : null,
    grossMarginRatio: totals.landed ? totals.expectedVolume / totals.landed - 1 : null,
    grossProfit: totals.expectedVolume - totals.landed,
  }
}

/** Difference beyond which two figures that ought to match are reported. */
const TOLERANCE = 0.01

/**
 * Every reason this conversion may not be downloaded, and every reason to look
 * at it twice before doing so.
 *
 * Findings are grouped BY FIELD, never by row: four products with no list price
 * are one finding naming four codes, not four findings to chase separately.
 * Each one names what it is about and what the consequence is, so the panel can
 * say which cell stays empty rather than only that something is wrong.
 */
export function buildFindings({ input, computed, sourceTotals, context = {} }) {
  const findings = []
  const add = (finding) => findings.push(finding)

  const blocking = (id, params = {}) => add({ id, level: 'blocking', ...params })
  const warning = (id, params = {}) => add({ id, level: 'warning', ...params })

  // --- shipment-level inputs -------------------------------------------------
  if (!String(input.shipmentName ?? '').trim()) blocking('shipmentName', { field: 'shipmentName' })
  if (isBlank(input.exchangeRate) || !(input.exchangeRate > 0)) {
    blocking('exchangeRate', { field: 'exchangeRate' })
  }
  if (isBlank(input.freightUsd)) blocking('freight', { field: 'freight' })
  if (isBlank(input.insuranceUsd)) blocking('insurance', { field: 'insurance' })

  const missingExpenses = EXPENSE_KEYS.filter((key) => isBlank(input.expenses?.[key]))
  if (missingExpenses.length > 0) {
    blocking('expenses', { field: 'expenses', keys: missingExpenses, count: missingExpenses.length })
  }

  // --- line-level completeness ----------------------------------------------
  const noCode = computed.rows.filter((row) => !String(row.code ?? '').trim())
  if (noCode.length > 0) {
    blocking('lineCode', { field: 'code', count: noCode.length, rows: noCode.map((r) => r.no) })
  }

  const noUnits = computed.rows.filter((row) => isBlank(row.units) || !(row.units > 0))
  if (noUnits.length > 0) {
    blocking('lineUnits', {
      field: 'units',
      count: noUnits.length,
      codes: noUnits.map((r) => r.code).filter(Boolean),
    })
  }

  const noFob = computed.rows.filter((row) => isBlank(row.fob))
  if (noFob.length > 0) {
    blocking('lineFob', {
      field: 'fob',
      count: noFob.length,
      codes: noFob.map((r) => r.code).filter(Boolean),
    })
  }

  // --- the three totals that must reconcile ---------------------------------
  if (sourceTotals?.fob_total != null && computed.rows.length > 0) {
    const drift = computed.totals.fob - sourceTotals.fob_total
    if (Math.abs(drift) > TOLERANCE) {
      blocking('fobTotal', {
        field: 'fob',
        expected: sourceTotals.fob_total,
        actual: computed.totals.fob,
        difference: drift,
      })
    }
  }

  for (const [id, field, total, stated] of [
    ['freightTotal', 'freight', computed.totals.freight, input.freightUsd],
    ['insuranceTotal', 'insurance', computed.totals.insurance, input.insuranceUsd],
  ]) {
    if (isBlank(stated) || computed.rows.length === 0) continue
    const drift = total - stated
    if (Math.abs(drift) > TOLERANCE) {
      blocking(id, { field, expected: stated, actual: total, difference: drift })
    }
  }

  // --- anything that would be written as an error ---------------------------
  const wouldError = computed.rows.filter(
    (row) => row.units === 0 && row.landed != null,
  )
  if (wouldError.length > 0) {
    blocking('errorCell', {
      field: 'units',
      count: wouldError.length,
      codes: wouldError.map((r) => r.code).filter(Boolean),
    })
  }

  // --- warnings -------------------------------------------------------------
  const collect = (predicate) =>
    computed.rows.filter(predicate).map((row) => row.code).filter(Boolean)

  const noDescription = collect((row) => !row.description)
  if (noDescription.length > 0) {
    warning('description', { field: 'description', codes: noDescription, count: noDescription.length })
  }

  const fallbackDescription = collect((row) => row.descriptionFrom && row.descriptionFrom !== 'catalog')
  if (fallbackDescription.length > 0) {
    warning('descriptionFallback', {
      field: 'description',
      codes: fallbackDescription,
      count: fallbackDescription.length,
    })
  }

  const noListPrice = collect((row) => row.listPrice == null && !row.internal)
  if (noListPrice.length > 0) {
    warning('listPrice', { field: 'listPrice', codes: noListPrice, count: noListPrice.length })
  }

  const internalUse = collect((row) => row.internal)
  if (internalUse.length > 0) {
    warning('internalUse', { field: 'listPrice', codes: internalUse, count: internalUse.length })
  }

  const fallbackListPrice = collect((row) => row.listPriceFrom === 'lookup')
  if (fallbackListPrice.length > 0) {
    warning('listPriceFallback', {
      field: 'listPrice',
      codes: fallbackListPrice,
      count: fallbackListPrice.length,
    })
  }

  const noRate = collect((row) => row.gravamenRate == null)
  if (noRate.length > 0) {
    warning('gravamenMissing', { field: 'duty', codes: noRate, count: noRate.length })
  }

  const fellBack = collect((row) => row.gravamenFellBack)
  if (fellBack.length > 0) {
    warning('gravamenFallback', { field: 'duty', codes: fellBack, count: fellBack.length })
  }

  const oddRate = computed.rows
    .filter((row) => row.gravamenRate != null && !GRAVAMEN_RATES.some((r) => Math.abs(r - row.gravamenRate) < 1e-6))
    .map((row) => row.code)
    .filter(Boolean)
  if (oddRate.length > 0) {
    warning('gravamenUnrecognised', { field: 'duty', codes: oddRate, count: oddRate.length })
  }

  const assumedExcise = collect((row) => row.exciseAssumed)
  if (assumedExcise.length > 0) {
    warning('excise', { field: 'excise', codes: assumedExcise, count: assumedExcise.length })
  }

  const noMargin = collect((row) => row.listPrice != null && row.margin == null)
  if (noMargin.length > 0) {
    warning('margin', { field: 'margin', codes: noMargin, count: noMargin.length })
  }

  // A product on one document and not the other. Either the paperwork
  // disagrees with itself or something flew; only a person knows which.
  if (context.onlyInCostSheet?.length > 0) {
    warning('onlyInCostSheet', {
      field: 'code',
      codes: context.onlyInCostSheet,
      count: context.onlyInCostSheet.length,
    })
  }
  if (context.onlyInInvoice?.length > 0) {
    warning('onlyInInvoice', {
      field: 'code',
      codes: context.onlyInInvoice,
      count: context.onlyInInvoice.length,
    })
  }

  if (context.singleFile) warning('singleFile', { field: 'files' })

  /*
   * The conversion's one genuinely consequential change, and the easiest to
   * miss: the old sheet's CIF PESOS was pasted in from the declaration, and the
   * new one is DERIVED from FOB plus the freight and insurance entered here,
   * times the chosen rate. When the two disagree, every duty and ITBIS figure
   * on the converted sheet differs from what was actually paid. That is not a
   * fault to be corrected silently -- it is the number to check the inputs
   * against.
   */
  if (sourceTotals?.cif_local != null && computed.totals.cifLocal) {
    const drift = computed.totals.cifLocal - sourceTotals.cif_local
    if (Math.abs(drift) > Math.max(1, Math.abs(sourceTotals.cif_local) * 0.005)) {
      warning('cifDrift', {
        field: 'cifLocal',
        expected: sourceTotals.cif_local,
        actual: computed.totals.cifLocal,
        difference: drift,
      })
    }
  }

  return findings
}

export const isBlocked = (findings) => findings.some((f) => f.level === 'blocking')

/**
 * Turn parsed source lines into the lines the calculation works on.
 *
 * This is where the two documents meet: the cost sheet supplies the quantity,
 * the FOB amount and (by default) the duty rate, while the Catalog and the
 * supplier's invoice supply the description, the list price and the tariff
 * code. Every resolution records WHERE it came from, because the interface has
 * to be able to say so and a value with no provenance is one nobody can check.
 */
export function prepareLines({
  sourceLines,
  sourceLookup,
  catalogByKey,
  invoiceByKey,
  arancelRates,
  gravamenSource = DEFAULT_GRAVAMEN_SOURCE,
  overrides = {},
}) {
  return (sourceLines ?? []).map((line) => {
    const code = sheetCode(line.product_code)
    const resolved = resolveProduct({ code, sourceLookup, catalogByKey, invoiceByKey })
    const override = overrides[codeKey(code)] ?? {}

    const gravamen = resolveGravamen({
      preferred: gravamenSource,
      fromSheet: line.gravamen_rate,
      arancel: resolved.arancel,
      arancelRates,
    })

    // Selectivo is stated on the old sheet, and is 0 on every line of both
    // samples. A line that states nothing is taken as zero AND reported, since
    // an excise nobody mentioned is not the same claim as one written as 0.
    const statedExcise = line.excise
    const exciseAssumed = isBlank(statedExcise)

    return {
      code,
      sourceCode: line.product_code,
      units: override.units ?? line.units,
      fob: override.fob ?? line.fob_total,
      excise: exciseAssumed ? 0 : statedExcise,
      exciseAssumed,
      comment: line.comment ?? null,
      description: override.description ?? resolved.description,
      descriptionFrom: override.description ? 'manual' : resolved.descriptionFrom,
      listPrice: override.listPrice ?? resolved.listPrice,
      listPriceFrom: override.listPrice != null ? 'manual' : resolved.listPriceFrom,
      internal: resolved.internal,
      inCatalog: resolved.inCatalog,
      arancel: resolved.arancel,
      gravamenRate: override.gravamenRate ?? gravamen.rate,
      gravamenFrom: gravamen.from,
      gravamenFellBack: override.gravamenRate == null && gravamen.fellBack,
      sourceCifLocal: line.cif_local,
      sourceRow: line.row,
    }
  })
}

/**
 * What the uploaded files answered, and what the conversion still needs.
 *
 * Shown BEFORE the form, because the useful moment to learn that CUENTA T
 * holds the freight in pesos is before filling in fourteen other fields, not
 * after. Every entry names the target cell it feeds and where that value
 * normally comes from, so a gap is something a person can go and close rather
 * than a complaint they can only accept.
 */
export function buildReadiness({ source, invoice }) {
  const items = []
  const need = (id, cell, status, detail = {}) => items.push({ id, cell, status, ...detail })

  need('shipmentName', 'A2', source?.shipmentName ? 'found' : 'missing', {
    value: source?.shipmentName ?? null,
    source: source?.shipmentSource ?? null,
  })

  // The rate is the one figure the old layout never states. CUENTA T offers
  // four of them and says nothing about which applies.
  const rates = source?.rates ?? []
  need('exchangeRate', 'H10', source?.exchangeRate ? 'found' : rates.length > 0 ? 'choose' : 'missing', {
    value: source?.exchangeRate?.value ?? null,
    source: source?.exchangeRate?.source ?? null,
    options: rates.length,
  })

  for (const [id, cell, header, account] of [
    ['freight', 'F10', source?.freightUsd, source?.accountFreight],
    ['insurance', 'G10', source?.insuranceUsd, source?.accountInsurance],
  ]) {
    // Stated in dollars on the current layout; in pesos, if at all, on CUENTA T.
    need(id, cell, header ? 'found' : account ? 'currency' : 'missing', {
      value: header?.value ?? account?.value ?? null,
      source: header?.source ?? account?.source ?? null,
    })
  }

  const missingExpenses = EXPENSE_KEYS.filter((key) => isBlank(source?.expenses?.[key]?.value))
  need('expenses', 'O10:U10', missingExpenses.length === 0 ? 'found' : 'partial', {
    missing: missingExpenses,
    found: EXPENSE_KEYS.length - missingExpenses.length,
    total: EXPENSE_KEYS.length,
  })

  const entries = EXPENSE_KEYS.filter((key) => !isBlank(source?.entryNumbers?.[key]?.value))
  need('entryNumbers', 'O8:U8', entries.length === EXPENSE_KEYS.length ? 'found' : 'partial', {
    found: entries.length,
    total: EXPENSE_KEYS.length,
  })

  const lines = source?.lines ?? []
  need('lines', 'B:C', lines.length > 0 ? 'found' : 'missing', { count: lines.length })
  need('fob', 'E', lines.every((l) => l.fob_total != null) ? 'found' : 'partial', {
    missing: lines.filter((l) => l.fob_total == null).length,
  })
  need('gravamen', 'J', lines.every((l) => l.gravamen_rate != null) ? 'found' : 'partial', {
    missing: lines.filter((l) => l.gravamen_rate == null).length,
  })

  // The supplier's invoice is the only document that states a tariff code.
  need('arancel', 'J', invoice ? 'found' : 'noFile', {
    count: invoice ? invoice.lineCount : 0,
  })

  return items
}

/** A stable identity for a finding, so an acknowledgement survives a recompute. */
export const findingKey = (finding) => `${finding.id}:${finding.field ?? ''}`

/** The code as the generated sheet writes it: hyphenated, and always text. */
export const sheetCode = (code) => formatProductCode(code)
