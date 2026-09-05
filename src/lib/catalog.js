/**
 * The catalog: one row per product, built from the documents an import travels
 * on.
 *
 * Two rules shape everything here.
 *
 * A product is identified by its code reduced to DIGITS. The same article is
 * written `591503` on a liquidación and `5915-03` on a proforma, and a few rows
 * of the master list carry a dot where the hyphen belongs. Comparing the codes
 * as written would file one product as three.
 *
 * Prices follow the NEWEST document, not the first one imported. Paperwork
 * arrives out of order -- Milan 10's liquidación can turn up after Milan 11's --
 * and what belongs on a product is the most recent price, not whichever file
 * happened to be opened first. Documents are therefore compared by their own
 * date. An older document still fills in blanks, but never overwrites what a
 * newer one established, and two documents of the same date that disagree are
 * reported for a person rather than silently resolved.
 */

// Shared with the cost-sheet reader rather than reimplemented: the rule for
// flattening a heading or a comment to something comparable is one rule.
import { normalise } from './liquidation'
import { aliasKey, matchFactoryByAlias } from './factories'

/**
 * The deduplication key: digits only.
 *
 * Deliberately not "trim and uppercase". These codes are numeric and arrive
 * punctuated three different ways; the punctuation carries no meaning.
 */
export const codeKey = (code) => (code ?? '').toString().replace(/\D/g, '')

/**
 * The code as we write it: `NNNN-NN`.
 *
 * A liquidación prints it without the hyphen (`591103`) because the customs
 * agent types it that way; our own master list, the proformas and everyone
 * here use `5911-03`. One product, one spelling — the hyphen goes back in.
 *
 * Only six-digit codes are reshaped. The master list also holds four- and
 * three-digit legacy codes, and inventing a hyphen for those would be making
 * up a format nobody uses.
 */
export const formatProductCode = (code) => {
  const raw = (code ?? '').toString().trim()
  if (raw.includes('-')) return raw
  const digits = codeKey(raw)
  return digits.length === 6 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : raw
}

/**
 * A description reduced to letters and digits, for products that arrive without
 * a code.
 *
 * Some liquidación lines carry no product code at all — spare drivers, and the
 * rechargeable bulbs on Milan 10. They still classify goods under a partida
 * arancelaria, which is worth having, so they become catalog entries keyed on
 * their description instead. Prefixed so such a key can never be mistaken for,
 * or collide with, a real code.
 */
export const descriptionKey = (description) => {
  const text = (description ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s*NO APLICA\s*$/, '')
    .replace(/[^A-Z0-9]+/g, '')
  return text ? `desc:${text}` : ''
}

/**
 * An existing product whose description matches an uncoded line, or null.
 *
 * The cost sheet writes the same goods with a packing suffix the declaration
 * omits — "BOMBILLO LED RECARGABLE 12W KOLNY" against "...KOLNY (100/1)" — so a
 * prefix counts as a match. Only when exactly one product matches: two
 * candidates mean the description does not identify anything, and attaching a
 * tariff code to the wrong product is worse than leaving it unattached.
 */
export const matchByDescription = (description, products) => {
  const needle = descriptionKey(description)
  if (!needle || needle.length < 'desc:'.length + 8) return null
  const body = needle.slice(5)
  const hits = (products ?? []).filter((p) => {
    const theirs = descriptionKey(p.description)
    if (!theirs) return false
    const other = theirs.slice(5)
    return other === body || other.startsWith(body) || body.startsWith(other)
  })
  return hits.length === 1 ? hits[0] : null
}

/**
 * How alike two descriptions are, 0 to 1, by the words they share.
 *
 * Word overlap rather than edit distance: these are the same goods described by
 * two people, so what differs is a word or two -- a colour spelled out, a
 * packing suffix, the supplier's code on the end -- not letters within words.
 * `TOMA CORRIENTE DOBLE GRIS CLARO` against `TOMA CORRIENTE DOBLE GRIS` shares
 * four of five, which reads as "probably the same"; edit distance on the whole
 * string would call a long description similar to another long description for
 * no better reason than length.
 *
 * Weighted toward the SHORTER description on purpose, so a short one contained
 * inside a longer one scores high -- that is exactly the customs-wording case.
 */
export const descriptionSimilarity = (a, b) => {
  const words = (text) =>
    new Set(
      normalise(text)
        .split(' ')
        .filter((w) => w.length > 1),
    )
  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const w of left) if (right.has(w)) shared += 1
  // One word in common is a coincidence, not a resemblance. The customs line
  // "GRAPA" shares its only word with "GRAPA ELECTRICA KOLNY GRIS RCC-10" and
  // would otherwise score a perfect 1.0 against it -- and against every other
  // clip in the catalog, which is the opposite of a useful question.
  if (shared < 2) return 0
  return shared / Math.min(left.size, right.size)
}

/** Below this, two descriptions are simply different goods. */
export const SIMILAR_ENOUGH = 0.7

/**
 * Products whose description is close to this one, most alike first.
 *
 * For the question a person can answer and the importer cannot: two wordings
 * turn up for what may be one article, and only somebody who knows the goods
 * can say whether they are. So this never merges anything -- it reports.
 */
export const nearestDescriptions = (description, products, limit = 3) => {
  const scored = []
  for (const product of products ?? []) {
    const theirs = productDescription(product)
    if (!theirs) continue
    const score = descriptionSimilarity(description, theirs)
    if (score >= SIMILAR_ENOUGH) {
      scored.push({
        code: product.product_code ?? null,
        code_key: product.code_key ?? null,
        description: theirs,
        score: Math.round(score * 100) / 100,
      })
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * A customs description with the supplier's own code stuck on the end.
 *
 * The agent types the goods and then the factory's reference, run together:
 * `TOMA CORRIENTE DOBLE/MODULO CON TAPA GRIS CLARO R6C(GC)`. Our wording is
 * `TOMA CORRIENTE DOBLE/MODULO CON TAPA GRIS CLARO` and `R6C(GC)` is Klik's.
 *
 * The only rule that holds across suppliers is ORDER: our description always
 * comes first, so whatever is being split off is a SUFFIX. Their codes are not
 * a single shape -- some are letters and digits, some carry a parenthesised
 * colour, some are a measurement -- so this does not try to recognise a code.
 * It peels the last token or two and hands back the candidates, longest first,
 * for a caller to try in turn.
 *
 * Deliberately a list of candidates rather than a decision. Nothing here writes
 * a description; the candidates are only used to FIND a product we already
 * have, so a wrong split costs a match that was not going to happen anyway. A
 * split that silently rewrote the stored name would be a different matter.
 */
export const descriptionCandidates = (description) => {
  const text = String(description ?? '')
    .replace(/\s*NO APLICA\s*$/i, '')
    .trim()
  if (!text) return []

  const candidates = [text]
  const words = text.split(/\s+/)
  // Two at most. Three would start eating real words off descriptions that end
  // in a size -- "CANALETA ... 3/4 (20MM) X 6" is all ours.
  for (let drop = 1; drop <= 2 && words.length - drop >= 2; drop += 1) {
    const head = words.slice(0, words.length - drop).join(' ')
    const tail = words.slice(words.length - drop).join(' ')
    // A tail that is plain words in our own vocabulary is part of the
    // description, not a code: KOLNY, NEGRO, PAQ. A supplier's reference
    // almost always mixes letters with digits or punctuation.
    if (/^[A-Za-zÁÉÍÓÚÑáéíóúñ]+$/.test(tail.replace(/\s+/g, ''))) continue
    candidates.push(head)
  }
  return candidates
}

/**
 * The supplier code a customs description ends with, if it ends with one.
 *
 * The mirror of `descriptionCandidates`: what was peeled off. Only reported,
 * never written -- `supplier_code` comes from the supplier's own paperwork, and
 * a guess from a customs line is not that.
 */
export const trailingSupplierCode = (description, productDescription) => {
  const full = String(description ?? '').replace(/\s*NO APLICA\s*$/i, '').trim()
  const head = normalise(productDescription)
  if (!full || !head) return null
  // Walk back word by word until our own description is exactly consumed. A
  // plain `startsWith` cannot do it: the declaration is ALL CAPS and ours is
  // not, and the two punctuate differently -- comparing normalised, but
  // slicing the ORIGINAL, is what keeps `R6C(GC)` spelled the way it was
  // written.
  const words = full.split(/\s+/)
  for (let keep = words.length - 1; keep >= 1; keep -= 1) {
    if (normalise(words.slice(0, keep).join(' ')) === head) {
      return words.slice(keep).join(' ').trim() || null
    }
  }
  return null
}

/** The selling prices on a cost-sheet line. Costs are deliberately not here. */
const SELLING_PRICE_FIELDS = ['sale_price_ex_tax', 'sale_price_inc_tax', 'list_price']

/**
 * Whether a cost-sheet line is something we buy but never sell.
 *
 * Spare drivers, packaging, samples. They travel in the container, they carry a
 * landed cost and a partida arancelaria, and they have no selling price because
 * nobody is ever quoted one. The sheet says so two ways and either is enough:
 * COMENTARIO reads USO INTERNO, or every selling price on the line is 0.
 *
 * The zero is the absence of a price, not a price of nothing — the same reading
 * OrderDetail already applies when it renders a 0 as an em dash. Storing it as
 * 0.00 would put "we sell this for nothing" into the catalog, which is worse
 * than storing nothing at all: a figure invites arithmetic.
 *
 * ALL the selling prices, not any one of them. A line still being priced can
 * carry a 0 in one column while the others are filled, and calling that "not
 * sold" would be guessing at a fact the sheet has not stated.
 */
export const isNotSold = (row) => {
  if (/\buso interno\b/.test(normalise(row?.comment))) return true
  const prices = SELLING_PRICE_FIELDS.map((f) => row?.[f]).filter((v) => !isBlank(v))
  return prices.length > 0 && prices.every((v) => Number(v) === 0)
}

/**
 * The same fact read back off a stored product.
 *
 * `internal_use` is what the importer writes from now on. Rows imported before
 * that column existed say it the only way they could — a `precio_lista` of
 * exactly 0, which can only have come from a cost sheet's zero — so they read
 * correctly without a migration. A real product never has a list price of 0.
 */
/**
 * The description to show, out of the three a product can carry.
 *
 * `description` is our own cost sheet's wording and leads where we have it.
 * But a supplier document is often the FIRST thing imported for an order, and
 * CHS and Klik each state their description in one language only -- so a
 * catalog built from invoices alone had a dash in every Descripcion cell while
 * the text sat one column away. The search has always looked at all three;
 * the table now agrees with it.
 */
export const productDescription = (product) =>
  product?.description || product?.description_es || product?.description_en || null

export const isInternalUse = (product) =>
  product?.internal_use === true ||
  (product?.internal_use == null && !isBlank(product?.precio_lista) && Number(product.precio_lista) === 0)

/** Gravamen as a percentage of CIF, to two decimals. Null when CIF is zero. */
export const gravamenPct = (gravamen, cif) => {
  // Same trap as perUnit: a duty rate nobody stated must not read as 0.00 %,
  // which is a real and different answer -- the Milan bulbs genuinely are
  // duty-free. `isBlank` lets a true zero through and stops a null.
  if (isBlank(gravamen) || isBlank(cif)) return null
  const g = Number(gravamen)
  const c = Number(cif)
  if (!Number.isFinite(g) || !Number.isFinite(c) || c === 0) return null
  return (Math.round((g / c) * 10000) / 100).toFixed(2)
}

/** Fields a person may edit by hand, and which the importer may fill if null. */
export const EDITABLE_FIELDS = [
  'product_code',
  'description',
  'fob_usd',
  'arancel',
  'gravamen_pct',
  'barcode',
  'supplier_code',
  'model',
  'description_en',
  'description_es',
  'unit_price_dop',
  'precio_lista',
  'cbm_unit',
  'units_per_box',
  'internal_use',
]

/** Which of those hold money, and in which currency. Nothing is ever converted. */
export const CURRENCY_OF = {
  fob_usd: 'USD',
  unit_price_dop: 'DOP',
  precio_lista: 'DOP',
}

export const fieldLabelKey = (field) => `catalog.fields.${field}`

/**
 * Validation gates from docs/data-sources.md.
 *
 * Every one of these must pass before a single row is written. They are not
 * warnings: a liquidación whose columns do not sum to its own Totales row has
 * been mis-parsed, and importing it would put wrong duty rates into the
 * catalog where nothing later would question them.
 */
export function validateLiquidacion(parsed) {
  const checks = []
  const rows = parsed.rows ?? []

  const maxItem = rows.reduce((m, r) => Math.max(m, r.item || 0), 0)
  checks.push({
    id: 'rowCount',
    ok: rows.length > 0 && rows.length === maxItem,
    expected: String(maxItem),
    actual: String(rows.length),
  })

  const contiguous = rows.every((r, i) => r.item === i + 1)
  checks.push({ id: 'contiguous', ok: contiguous, expected: `1..${maxItem}`, actual: contiguous ? 'ok' : 'gaps' })

  // The tax columns are exact sums. Five centavos of tolerance covers the
  // document's own rounding and nothing else.
  for (const [id, field] of [
    ['cif', 'cif'],
    ['gravamen', 'gravamen'],
    ['selectivo', 'selectivo'],
    ['itbis', 'itbis'],
    ['total', 'total'],
  ]) {
    const stated = parsed.statedTotals?.[field]
    if (stated === null || stated === undefined) {
      checks.push({ id, ok: false, expected: 'stated total', actual: 'not found' })
      continue
    }
    const sum = rows.reduce((s, r) => s + Number(r[field] ?? 0), 0)
    const diff = Math.abs(sum - Number(stated))
    checks.push({
      id,
      ok: diff <= 0.05,
      expected: Number(stated).toFixed(2),
      actual: sum.toFixed(2),
      diff: diff.toFixed(2),
    })
  }

  return { ok: checks.every((c) => c.ok), checks }
}

/**
 * Where each field comes from, decided by which document actually knows it.
 *
 * The DGA liquidación knows what customs classified the goods as, so it gives
 * the partida arancelaria — and nothing else priced. Its FOB figure is rounded
 * to two decimals for the declaration and its gravamen is one shipment's duty,
 * neither of which is what we want to quote from.
 *
 * The supplier's proforma knows the barcode. That is all we take from it.
 *
 * Our own cost sheet knows what things cost and what we sell them for, so every
 * money figure and the duty rate come from there.
 */

/** From the liquidación: the tariff classification, and the identity. */
const fromLiquidacionRow = (row) => ({
  product_code: formatProductCode(row.codigo),
  description: row.descripcion ? row.descripcion.replace(/\s*NO APLICA\s*$/, '').trim() : null,
  arancel: row.arancel || null,
})

/**
 * From the proforma: the barcode, the supplier's own identifiers, and how the
 * goods are packed.
 *
 * The packing figures are the proforma's alone -- no liquidación or cost sheet
 * states them. Both are quoted per CARTON there, and one of the two is derived
 * rather than read:
 *
 *   cbm_unit = CBM/CTN / PCS/CTN
 *
 * because a cubic metre per unit is what a container is planned with, and it is
 * what the company's own CODIGOS workbook prints. Storing the carton figure as
 * well would be a third fact that is only the product of the other two.
 */
const fromProformaRow = (row) => ({
  product_code: formatProductCode(row.supplier_code),
  barcode: row.barcode,
  supplier_code: row.supplier_code,
  model: row.model,
  description_en: row.description_en,
  description_es: row.description_es,
  units_per_box: wholeNumber(row.pcs_per_carton),
  cbm_unit: perUnit(row.cbm_per_carton, row.pcs_per_carton, 6),
})

/**
 * From a supplier's commercial invoice and packing list: identity, the barcode
 * and how the goods were packed.
 *
 * No money, deliberately. The invoice states a unit price and it is a real one,
 * but every figure with a currency on it comes from our own cost sheet -- which
 * derives the same number after the goods have actually landed, and is the one
 * document that also knows what they cost us here. Taking the price from two
 * places would mean two answers to one question.
 *
 * Both packing figures are derived, because the document states totals per line
 * rather than per unit:
 *
 *   units_per_box = Quanity (PCS) / Package (CTNS)
 *   cbm_unit      = Volume (CBM)  / Quanity (PCS)
 */
const fromInvoiceRow = (row) => ({
  product_code: formatProductCode(row.product_code),
  barcode: row.barcode,
  supplier_code: row.supplier_code,
  description_en: row.description_en,
  // Cada proveedor describe en un idioma: Klik en inglés, CHS en español. Se
  // guarda el que venga.
  description_es: row.description_es,
  // Y alguno trae la partida arancelaria, que la liquidación de aduanas también
  // da pero suele llegar meses después.
  arancel: row.arancel,
  units_per_box: wholeNumber(
    row.quantity && row.cartons ? Number(row.quantity) / Number(row.cartons) : null,
  ),
  cbm_unit: perUnit(row.volume_cbm, row.quantity, 6),
})

/** A count, as a count. Pieces in a carton are never a fraction of a piece. */
const wholeNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null
}

/**
 * From the internal cost sheet: every figure with a currency on it, plus the
 * duty rate.
 *
 * Two are derived rather than read, because the sheet holds totals where we
 * want a rate and a unit price:
 *
 *   fob_usd      = COSTO TOTAL (US$) / unidades recibidas
 *   gravamen_pct = Gravamen (RD$) / CIF pesos * 100
 *
 * Both divisions are guarded: a line with no units, or a duty-free line whose
 * CIF is zero, yields null rather than Infinity or NaN.
 *
 * Goods we do not sell are the one place a figure is dropped rather than read.
 * See isNotSold.
 */
const fromCostoRow = (row) => {
  const notSold = isNotSold(row)
  return {
    product_code: formatProductCode(row.product_code),
    description: row.description,
    fob_usd: perUnit(row.fob_total, row.units),
    gravamen_pct: gravamenPct(row.duty, row.cif_local),
    // What it cost us landed. Real whether or not we ever sell it, so an
    // internal-use line keeps it.
    unit_price_dop: row.landed_unit_cost,
    // What we sell it for. For internal-use goods that is not zero, it is
    // nothing, so the field is left for the flag to explain.
    precio_lista: notSold ? null : row.list_price,
    internal_use: notSold,
  }
}

/**
 * A total divided by a count. Null unless both are usable.
 *
 * The precision is per caller: four decimals is right for a unit price in
 * dollars, and far too coarse for a cubic metre per unit, where every figure
 * lives past the third place.
 */
const perUnit = (total, units, decimals = 4) => {
  // A missing total is not a total of nothing. `Number(null)` is 0 and passes
  // every finiteness test after it, so without this guard a line whose volume
  // the document never stated comes out as a CBM of 0.000000 -- a figure
  // somebody would then plan a container with.
  if (isBlank(total) || isBlank(units)) return null
  const t = Number(total)
  const u = Number(units)
  if (!Number.isFinite(t) || !Number.isFinite(u) || u === 0) return null
  const scale = 10 ** decimals
  return (Math.round((t / u) * scale) / scale).toFixed(decimals)
}

const isBlank = (value) => value === null || value === undefined || value === ''

/**
 * An order reference split into its series and its number: "MILAN 11" ->
 * { series: 'milan', number: 11 }.
 *
 * Orders within a series run in sequence, and the sequence is what says which
 * pricing is current: Milan 11 supersedes Milan 10, which supersedes Milan 9.
 * Dates cannot be relied on for this — a liquidación for an earlier order can
 * be filed later, and a cost sheet carries no date of its own at all.
 */
export const orderPriority = (reference) => {
  const raw = (reference ?? '').toString().trim()
  // The usual shape: a name, then the number, and nothing after it.
  // The fallback catches a title that runs on -- our CHS cost sheet is headed
  // "CHS09 CANALETAS NEGRAS". It requires the digits to be GLUED to the letters,
  // because that cannot be confused with a number that means something else:
  // "ORDEN 11 MILANLUX" has a space there and is left unranked, as before.
  const m = raw.match(/^\s*([A-Za-zÁÉÍÓÚÑáéíóúñ\s.]+?)\s*[-#]?\s*(\d+)\s*$/) ??
    raw.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)(\d+)/)
  if (!m) return null
  const series = m[1]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '')
  if (!series) return null
  return { series, number: Number(m[2]) }
}

/**
 * How an incoming document relates to the one that set a value: 'newer',
 * 'older', 'same' or 'unknown'.
 *
 * Sequence first, and only within the same series: "Milan 11" beats "Milan 10",
 * but "Klik 76" and "Milan 11" are separate runs of orders whose numbers mean
 * nothing to each other. Where the references cannot be compared that way the
 * document dates decide.
 *
 * 'unknown' is deliberately distinct from 'older'. Two documents we cannot
 * place relative to each other are a question for a person, not an excuse to
 * keep whichever happened to arrive first.
 */
export const compareDocuments = (incoming, stored) => {
  const a = orderPriority(incoming?.ref)
  const b = orderPriority(stored?.ref)
  if (a && b && a.series === b.series) {
    return a.number > b.number ? 'newer' : a.number < b.number ? 'older' : 'same'
  }
  const ad = incoming?.date ?? null
  const bd = stored?.date ?? null
  if (ad && bd) return ad > bd ? 'newer' : ad < bd ? 'older' : 'same'
  if (ad && !bd) return 'newer'
  if (!ad && bd) return 'older'
  return 'unknown'
}

/**
 * The most recent order this product was seen in.
 *
 * `doc_ref` is the liquidación that classified it, `cost_ref` the cost sheet
 * that priced it, and each only advances when a newer document arrives — so
 * between them they already say where the product was last bought. This picks
 * whichever is later.
 *
 * Returns null for a product nobody has imported from a document, which is the
 * honest answer for one somebody typed in by hand.
 */
export const lastSeenOrder = (product) => {
  const refs = [product?.doc_ref, product?.cost_ref].filter(Boolean)
  if (refs.length === 0) return null
  if (refs.length === 1) return refs[0]
  const [a, b] = refs
  return compareDocuments({ ref: a }, { ref: b }) === 'newer' ? a : b
}

/**
 * Which supplier a product came from, worked out rather than stored.
 *
 * There is deliberately no `factory_id` on `catalog`. A product's supplier is
 * already recorded, once, on the order it arrived on — and the reference of
 * that order is what `doc_ref` and `cost_ref` hold. Copying the supplier onto
 * every product as well would give the same fact two homes, and the day
 * somebody corrects the supplier on an order the catalog would still be
 * carrying the old answer.
 *
 * Two ways to resolve it, in this order:
 *
 *   1. The `orders` row with that exact reference. Authoritative: a person
 *      confirmed that supplier when the liquidación was imported.
 *   2. Failing that, the reference's word against the supplier nicknames —
 *      "MILAN 11" is Milan plus a number. This catches products whose order
 *      predates the platform, or was never created as an order at all.
 *
 * Null for a product nobody imported from a document, which is the honest
 * answer for one typed in by hand.
 */
export const supplierIndex = ({ orders, factories }) => {
  const byId = new Map((factories ?? []).map((f) => [f.id, f]))
  const byReference = new Map()
  for (const order of orders ?? []) {
    const key = aliasKey(order?.reference)
    const factory = byId.get(order?.factory_id)
    if (key && factory && !byReference.has(key)) byReference.set(key, factory)
  }

  return (product) => {
    const reference = lastSeenOrder(product)
    if (!reference) return null
    const exact = byReference.get(aliasKey(reference))
    if (exact) return exact
    // The reference is not always tidy. Our CHS cost sheet is headed
    // "CHS09 CANALETAS NEGRAS", so stripping the digits leaves
    // "CHS CANALETAS NEGRAS" and matches no nickname. orderPriority already
    // knows how to find the series in a reference that runs on, so ask it
    // first and fall back to the whole word only when it cannot.
    const series = orderPriority(reference)?.series
    return (
      (series && matchFactoryByAlias(series, factories ?? [])) ??
      matchFactoryByAlias(reference.replace(/[0-9]+/g, '').trim(), factories ?? [])
    )
  }
}

/** Sort key for an order reference: series first, then number, blanks last. */
export const orderSortKey = (reference) => {
  const parsed = orderPriority(reference)
  if (!parsed) return reference ? `zz${reference}` : 'zzzz'
  return `${parsed.series}${String(parsed.number).padStart(8, '0')}`
}

/** Which columns record where a document type's values came from. */
export const DATE_FIELD_FOR = {
  liquidacion: 'doc_date',
  proforma: 'doc_date',
  invoice: 'doc_date',
  costo: 'cost_date',
}
export const REF_FIELD_FOR = {
  liquidacion: 'doc_ref',
  proforma: 'doc_ref',
  invoice: 'doc_ref',
  costo: 'cost_ref',
}

/**
 * Work out what an import would do, without doing any of it.
 *
 * The rule is NEWEST DOCUMENT WINS, not first-one-there. Orders arrive out of
 * order -- Milan 10's paperwork can land after Milan 11's -- and what we want
 * on a product is the most recent price, whichever file turned up last. So a
 * document is compared by its own date, not by when somebody imported it:
 *
 *   - a field nobody has filled is filled, whatever the date
 *   - a NEWER document replaces what an older one put there
 *   - an OLDER document leaves the newer value alone and says so
 *   - two documents of the SAME date that disagree are a conflict for a person
 *
 * Undated documents are treated as older than anything dated, because a file we
 * cannot place in time must not be allowed to overwrite one we can.
 */
export function planImport({ docType, rows, existing, docDate = null, docRef = null }) {
  const byKey = new Map((existing ?? []).map((p) => [p.code_key, p]))
  const extract =
    docType === 'proforma'
      ? fromProformaRow
      : docType === 'invoice'
        ? fromInvoiceRow
        : docType === 'costo'
          ? fromCostoRow
          : fromLiquidacionRow
  const dateField = DATE_FIELD_FOR[docType] ?? 'doc_date'
  const refField = REF_FIELD_FOR[docType] ?? 'doc_ref'

  const added = []
  const updated = []
  const skipped = []
  const failed = []
  const conflicts = []
  // Lines that arrived with no product code, and what became of them.
  const uncoded = []
  // The same code appears on more than one line of a single liquidación, so a
  // file is deduped against itself as well as against the database.
  const seenInFile = new Map()

  for (const row of rows) {
    const fields = extract(row)
    let key = codeKey(fields.product_code)
    const where = row.item ?? row.row ?? row.line_no

    /*
     * How this row's goods are worded, kept apart from what will be WRITTEN.
     *
     * `description` is our own cost sheet's wording -- what the company calls
     * the product. A customs declaration states the same goods the way the
     * agent has to declare them, which is not a name anybody here uses, and
     * letting it fill the field put that wording in front of everyone. Worse,
     * once it was there a later cost sheet could not correct it: the two write
     * different columns (`doc_ref` against `cost_ref`), so a cost sheet
     * arriving afterwards ranks 'unknown' against a blank `cost_ref`, and an
     * 'unknown' relation is reported as a conflict rather than applied.
     *
     * The declaration still READS it -- an uncoded line is matched on it and,
     * failing that, keyed on it, and a coded line adopts an orphan by it. So it
     * is held here, and dropped from `fields` below. Keeping the two separate
     * is deliberate: doing it by deleting the key at the right moment made
     * three unrelated lookups depend on statement order, and quietly broke
     * adoption.
     */
    const declared = fields.description ?? null

    /*
     * A line with no product code hands its tariff code to a product we ALREADY
     * have, or it is reported. It no longer creates one.
     *
     * It used to fall back to an entry keyed on the description, so that a
     * declaration could introduce goods our own paperwork had not reached yet.
     * That was written for Milan, where one line of seventeen lacks a code. CHS
     * 09's declaration carries NO codes at all: all thirty-one lines took the
     * fallback, ten of them described only as "GRAPA", and because the key is
     * the description those ten collapsed into a single row while eleven more
     * lines were dropped as duplicates of each other. What survived was twenty
     * rows named in customs wording -- which is the one thing `description` is
     * not for.
     *
     * Matching an existing product is kept, and is where the value was all
     * along: the partida still lands on the right row, and it lands under our
     * own name for it. A line that matches nothing is a question for a person,
     * so it goes to `failed` -- which is itemised on screen -- rather than into
     * a count nobody reads.
     */
    if (!key) {
      if (docType !== 'liquidacion') {
        skipped.push({ where, code: fields.product_code ?? null, reason: 'noCode' })
        continue
      }
      // The agent runs our wording and the factory's own reference together --
      // `...GRIS CLARO R6C(GC)`. Our description always comes first, so the
      // whole line is tried before the line with its last token or two peeled
      // off. Longest first, so a product whose real name happens to end in a
      // measurement is matched whole rather than truncated.
      let match = null
      let matchedOn = declared
      for (const candidate of descriptionCandidates(declared)) {
        match = matchByDescription(candidate, existing ?? [])
        if (match) {
          matchedOn = candidate
          break
        }
      }

      if (!match) {
        // Nothing matched outright. Before reporting it as unusable, say
        // whether anything in the catalog is CLOSE -- two wordings of the same
        // goods is the likeliest reason a line finds no home.
        const near = nearestDescriptions(declared, existing ?? [])
        failed.push({
          where,
          row: where,
          reason: near.length > 0 ? 'noCodeSimilar' : 'noCodeUnmatched',
          detail: declared,
          similar: near,
        })
        continue
      }

      key = match.code_key
      // What was peeled off, if anything. Reported so a person can confirm it
      // really was the supplier's code; never written to `supplier_code`.
      const trailing = trailingSupplierCode(declared, match.description)
      uncoded.push({ where, key, matched: true, code: match.product_code, trailing })
    }

    // Withheld outright. Now that an unmatched line is reported rather than
    // turned into a row, there is no product left whose only name this would be.
    if (docType === 'liquidacion') delete fields.description

    if (seenInFile.has(key)) {
      skipped.push({ where, code: fields.product_code, reason: 'duplicateInFile', firstSeen: seenInFile.get(key) })
      continue
    }
    seenInFile.set(key, where)

    // A coded row may be the same goods as an uncoded entry an earlier
    // liquidación left behind. Adopting it -- rather than adding a second row
    // beside it -- is what makes the result the same whichever document is
    // imported first.
    let current = byKey.get(key)
    let adopts = null
    if (!current && !key.startsWith('desc:')) {
      const orphan = matchByDescription(
        declared,
        (existing ?? []).filter((p) => (p.code_key ?? '').startsWith('desc:')),
      )
      if (orphan) {
        current = orphan
        adopts = { code_key: key, product_code: fields.product_code }
      }
    }

    if (!current) {
      /*
       * A customs declaration classifies goods; it does not introduce them.
       *
       * The scope it is allowed to touch is the products tagged with the order
       * a person picked at import -- `existing` arrives already narrowed to
       * those. A line that finds nothing there is either goods from another
       * shipment or a wording nobody has matched yet, and both are questions.
       * Creating the product instead is how a declaration ends up owning a
       * product it only ever taxed.
       */
      if (docType === 'liquidacion') {
        const near = nearestDescriptions(declared, existing ?? [])
        failed.push({
          where,
          row: where,
          reason: near.length > 0 ? 'notInOrderSimilar' : 'notInOrder',
          detail: fields.product_code || declared,
          similar: near,
        })
        continue
      }
      added.push({
        where,
        key,
        fields: { ...fields, [dateField]: docDate, [refField]: docRef, order_refs: docRef ? [docRef] : [] },
      })
      continue
    }

    const relation = compareDocuments(
      { ref: docRef, date: docDate },
      { ref: current[refField] ?? null, date: current[dateField] ?? null },
    )
    const newer = relation === 'newer'
    const older = relation === 'older'

    // Fills and refreshes are kept apart because they are written back with
    // different guards: filling a blank is always safe, replacing a value is
    // only safe while this document is still the newest one to have touched it.
    const fills = {}
    const refreshes = {}
    let kept = 0

    for (const [field, value] of Object.entries(fields)) {
      if (isBlank(value) || field === 'product_code') continue

      if (isBlank(current[field])) {
        fills[field] = value
        continue
      }

      const same =
        String(current[field]) === String(value) ||
        (Number.isFinite(Number(current[field])) &&
          Number.isFinite(Number(value)) &&
          Number(current[field]) === Number(value))
      if (same) continue

      if (newer) {
        refreshes[field] = value
      } else if (older) {
        kept += 1
      } else {
        conflicts.push({ where, key, code: fields.product_code, field, existing: current[field], incoming: value })
      }
    }

    // `internal_use` and `precio_lista` are one statement about a product, not
    // two independent fields. An older document is normally still allowed to
    // fill a blank -- but the blank on a not-sold product is deliberate, and
    // filling it there would leave the row saying both "we never sell this" and
    // "we sell it for 9.00". A document that is not allowed to change the flag
    // does not get to supply the price either.
    if (isInternalUse(current) && !newer) {
      for (const field of ['precio_lista', 'internal_use']) {
        if (field in fills) {
          delete fills[field]
          kept += 1
        }
      }
    }

    // Giving an uncoded entry its real code is a fill, not an overwrite: there
    // was nothing there before.
    if (adopts) Object.assign(fills, adopts)

    /*
     * The order tag, which accumulates rather than replacing.
     *
     * Not a fill and not a refresh: both of those decide between an old value
     * and a new one, and this is a set that only ever grows. A product bought
     * in Klik 61, 62 and 77 carries all three, so asking "was this part of 61?"
     * keeps answering yes after the 77 paperwork lands.
     */
    let tags = null
    if (docRef) {
      const current_refs = Array.isArray(current.order_refs) ? current.order_refs : []
      if (!current_refs.includes(docRef)) tags = [...current_refs, docRef]
    }

    const changed = Object.keys(fills).length + Object.keys(refreshes).length + (tags ? 1 : 0)
    if (changed > 0) {
      // Which document supplied these fields, recorded the same way the fields
      // themselves are: filled when blank, replaced only by a newer document.
      //
      // Writing it only on `newer` left a real hole. A cost sheet and an
      // invoice for the SAME order rank as 'same', not 'newer' -- so importing
      // CHS 09's invoice first and its cost sheet second filled every priced
      // column and then recorded no `cost_ref` at all, because there was
      // nothing older to beat. Reversing the two files gave a different row
      // from identical documents, and a blank reference is what decides that a
      // product belongs to no supplier.
      for (const [field, value] of [[dateField, docDate], [refField, docRef]]) {
        if (value === null) continue
        if (isBlank(current[field])) fills[field] = value
        else if (newer) refreshes[field] = value
      }
      updated.push({
        where,
        key,
        id: current.id,
        fills,
        refreshes,
        tags,
        refreshed: Object.keys(refreshes).filter((f) => f !== dateField && f !== refField).length,
        dateField,
        refField,
        docDate,
        docRef,
      })
    } else if (kept > 0) {
      skipped.push({ where, code: fields.product_code, reason: 'olderDocument' })
    } else {
      skipped.push({ where, code: fields.product_code, reason: 'alreadyExists' })
    }
  }

  return { added, updated, skipped, failed, conflicts, uncoded }
}

const localeFor = (language) => (language === 'es' ? 'es-ES' : 'en-GB')

/**
 * Money, with its currency named rather than assumed.
 *
 * USD and DOP figures sit in adjacent columns and are never converted, so a
 * bare number here would be genuinely ambiguous.
 */
export const formatMoney = (amount, currency, language = 'en') => {
  if (isBlank(amount)) return '—'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

/**
 * A catalog money figure, with zero read as no figure at all.
 *
 * Nothing in this table is ever legitimately worth 0 — not a FOB price, not a
 * landed cost, not a list price — so a 0 here is the cost sheet's way of
 * writing "none", and printing "DOP 0.00" would read as a real price. Applied
 * on display so rows imported before that was understood read correctly
 * without a migration.
 */
export const formatPrice = (amount, currency, language = 'en') =>
  isBlank(amount) || Number(amount) === 0 ? '—' : formatMoney(amount, currency, language)

/**
 * A timestamptz as a date and time.
 *
 * Not `formatDate` from lib/orders: that one takes a `date` column and builds
 * `${value}T00:00:00`, which on a timestamptz appends a second time to one
 * that is already there and yields an Invalid Date -- silently, as a null.
 */
export const formatTimestamp = (value, language = 'en') => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export const formatPercent = (value, language = 'en') => {
  if (isBlank(value)) return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)} %`
}

/**
 * Which document type a chosen file is.
 *
 * A .pdf is a liquidación. A .xlsx is either a supplier proforma or one of our
 * own cost sheets, and the two cannot be told apart by the file name -- both
 * arrive called things like "LIQUIDACION ... MILAN 11.xlsx". The caller settles
 * it by content: a proforma has a `No.`/`Code` header pair, a cost sheet has
 * `Codigo`/`Descripcion`. This only narrows it down.
 */
export const detectDocType = (file) => {
  const name = (file?.name ?? '').toLowerCase()
  if (name.endsWith('.pdf')) return 'liquidacion'
  if (name.endsWith('.xlsx')) return 'spreadsheet'
  return null
}

/**
 * A `dd/mm/yyyy` date as `yyyy-mm-dd`, which sorts and compares as text.
 *
 * The liquidación prints day-first. Parsing it into a Date only to format it
 * back would invite a timezone to shift it across midnight.
 */
export const isoDate = (value) => {
  const m = (value ?? '').toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export const DOC_TYPES = ['liquidacion', 'proforma', 'invoice', 'costo']
export const docTypeKey = (type) => `catalog.docTypes.${type}`
export const PAGE_SIZE = 25
