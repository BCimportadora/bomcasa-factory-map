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
 * Every supplier labels these differently and none of them is going to change
 * for us, so each field lists the spellings actually seen. The quantity column
 * alone arrives as `Quanity (PCS)` (Klik, with the typo), `QTY` (CHS) and
 * `Unidades` -- one field, and they must all read the same.
 *
 * ORDER MATTERS, because a field takes the first unclaimed column whose heading
 * begins with one of its patterns. `codigo arancelario` is listed under
 * `arancel` ABOVE `codigo` under `product_code`, or the tariff column would be
 * swallowed as the article code.
 *
 * Which column holds OUR code differs per supplier and getting it wrong files
 * every product under a code no document of ours uses: Klik writes ours as
 * `Code for Box` and its own as `Item No.`; CHS writes ours as `Codigo` on the
 * invoice and `Customer Item No.` on the packing list. The Milan proforma is
 * different again -- its `Code` is ours -- which is why that one has its own
 * reader.
 */
const COLUMNS = [
  // The tariff code FIRST: "codigo arancelario" begins with "codigo", so listing
  // it after the article code would hand the tariff column over as the code.
  ['codigo arancelario', 'arancel'],
  ['partida arancelaria', 'arancel'],
  ['arancel', 'arancel'],
  ['hs code', 'arancel'],
  ['h s code', 'arancel'],
  ['hs no', 'arancel'],
  ['tariff', 'arancel'],
  ['hts', 'arancel'],

  // OUR article code. Which heading holds it moves per supplier, and reading
  // the wrong one files every product under a code we do not use.
  ['customer item no', 'product_code'],
  ['customer code', 'product_code'],
  ['code for box', 'product_code'],
  ['our code', 'product_code'],
  ['our item', 'product_code'],
  ['article no', 'product_code'],
  ['article code', 'product_code'],
  ['product code', 'product_code'],
  ['codigo del producto', 'product_code'],
  ['codigo', 'product_code'],

  // The supplier's own reference for the same goods.
  ['item no', 'supplier_code'],
  ['supplier code', 'supplier_code'],
  ['supplier item', 'supplier_code'],
  ['factory code', 'supplier_code'],
  ['ref no', 'supplier_code'],

  ['bar code', 'barcode'],
  ['barcode', 'barcode'],
  ['codigo de barra', 'barcode'],
  ['ean', 'barcode'],
  ['upc', 'barcode'],

  ['description of goods', 'description_en'],
  ['commodity description', 'description_en'],
  ['description', 'description_en'],
  ['descripcion', 'description_es'],

  // One field, however it is spelt. Klik writes "Quanity (PCS)" with the typo,
  // CHS writes "QTY", our own paperwork writes "Unidades".
  ['quanity', 'quantity'],
  ['quantity', 'quantity'],
  ['q ty', 'quantity'],
  ['qty', 'quantity'],
  ['unidades', 'quantity'],
  ['cantidad', 'quantity'],
  ['units', 'quantity'],
  ['pcs', 'quantity', 'exact'],

  ['unit price', 'unit_price'],
  ['precio unitario', 'unit_price'],
  ['u price', 'unit_price'],
  ['price', 'unit_price'],

  ['amount', 'amount'],
  ['importe', 'amount'],
  ['monto', 'amount'],

  // Cartons. "no of package" is tried before the bare "package", or a sheet
  // carrying both hands over the wrong one.
  ['no of package', 'cartons'],
  ['no of ctn', 'cartons'],
  ['package ctns', 'cartons'],
  ['packages', 'cartons'],
  ['cartons', 'cartons'],
  ['ctns', 'cartons', 'exact'],
  ['cajas', 'cartons'],
  ['bultos', 'cartons'],

  ['volume cbm', 'volume_cbm'],
  ['volume', 'volume_cbm'],
  ['volumen', 'volume_cbm'],
  ['cbm', 'volume_cbm'],
  ['m3', 'volume_cbm', 'exact'],

  ['n w kgs', 'net_weight'],
  ['net weight', 'net_weight'],
  ['n w', 'net_weight'],
  ['peso neto', 'net_weight'],

  ['g w kgs', 'gross_weight'],
  ['gross weight', 'gross_weight'],
  ['g w', 'gross_weight'],
  ['peso bruto', 'gross_weight'],

  // Last, and deliberately narrow. A bare "no" as a prefix would swallow
  // "No. of Package (CTNS)" and take the cartons column with it, so the line
  // number is only claimed by a heading that is exactly one of these.
  ['s no', 'line_no'],
  ['s n', 'line_no', 'exact'],
  ['no', 'line_no', 'exact'],
  ['item', 'line_no', 'exact'],
  ['linea', 'line_no', 'exact'],
]

/**
 * Headings under which a supplier writes OUR article code -- read off the table
 * above rather than repeated, so adding a synonym there is the whole change.
 */
const CODE_HEADINGS = COLUMNS.filter(([, field]) => field === 'product_code').map(([h]) => h)

/**
 * Headings that belong to OUR OWN cost sheet and to no supplier's invoice.
 *
 * The guard exists because a supplier invoice and our landed-cost workbook can
 * both head a column `Codigo` beside one headed `Descripcion` -- which is all
 * the cost-sheet reader looks for. Without this, CHS's commercial invoice is
 * claimed by the invoice reader on `Codigo`... and, worse, our own cost sheets
 * would be too. Its FOB dollars would then land in the catalog's peso columns.
 * No supplier writes CIF PESOS or COSTO UNITARIO on an invoice to us.
 */
const OUR_COST_SHEET = [
  'costo total',
  'cif dolares',
  'cif pesos',
  'gravamen',
  'costo unitario',
  'total puesto en almacen',
  'precio venta',
]

/** `PO.202603-77` -> 77. The middle six digits are the year and month. */
const PO_LINE = /^\s*p\s*o\s*\.?\s*\d{6}\s*-\s*(\d+)\s*$/i

/** `S/C NO.YQ-BQ-2603034` -> `YQ-BQ-2603034`. */
const CONTRACT = /s\s*\/?\s*c\s*no\.?\s*([A-Za-z0-9][A-Za-z0-9-]*)/i

/** `Date: 2026.03.18` -> `2026-03-18`, which sorts and compares as text. */
const DATE_LINE = /date\s*:?\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/i

/**
 * The note a supplier writes beside a line that is not travelling by sea.
 *
 * Both spellings are in one file: `By air-2000PCS` on the invoice and
 * `2000pcs by air` on the packing list. The note is looked for in EVERY cell of
 * the row rather than in a Remark column, because on this document it sits one
 * column past the labelled one -- the labelled Remark holds the general terms.
 */
const AIR_NOTE = /(?:by\s*air\D{0,4}(\d[\d,]*)\s*(?:pcs)?)|(?:(\d[\d,]*)\s*(?:pcs)?\s*by\s*air)/i

const airNote = (row) => {
  for (const value of row.cells.values()) {
    const raw = String(value ?? '')
    const m = raw.match(AIR_NOTE)
    if (m) {
      const qty = (m[1] ?? m[2] ?? '').replace(/,/g, '')
      return { note: raw.trim().replace(/\s+/g, ' '), quantity: qty ? Number(qty) : null }
    }
  }
  return null
}

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

/**
 * The row that labels the columns: the one naming our article code.
 *
 * A row carrying one of OUR_COST_SHEET's headings is refused outright, however
 * well the rest of it matches -- that is our own workbook, and it has its own
 * reader. See the note on OUR_COST_SHEET.
 */
function findHeaderRow(rows) {
  for (const row of rows) {
    const values = [...row.cells.values()].map(normalise)
    if (values.some((v) => OUR_COST_SHEET.some((own) => v.startsWith(own)))) continue
    if (values.some((v) => CODE_HEADINGS.some((code) => v.startsWith(code)))) return row
  }
  return null
}

/**
 * Column index -> field, by heading text.
 *
 * A heading matches as a PREFIX by default, which is what finds "Quanity (PCS)"
 * and "Unit Price FOB SHANGHAI" without listing every tail a supplier appends.
 * Patterns short enough to appear at the start of an unrelated heading are
 * marked `exact` instead.
 *
 * Within a field the patterns are priority-ordered, and a column already
 * claimed cannot be taken again.
 */
function mapColumns(headerRow) {
  const columns = {}
  const taken = new Set()
  for (const [heading, field, exact] of COLUMNS) {
    if (columns[field] !== undefined) continue
    for (const [index, raw] of headerRow.cells) {
      if (taken.has(index)) continue
      const value = normalise(raw)
      if (exact ? value === heading : value.startsWith(heading)) {
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
      // La primera línea en letras latinas, no la primera línea a secas: CHS
      // encabeza con su razón social en chino y pone la occidental debajo, y es
      // ésta la que se puede cotejar con la lista de fábricas.
      if (!identity.supplierName && /[A-Za-z]{4}/.test(raw)) identity.supplierName = raw
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

    // Carrying an article code is what makes a row a product. The line number
    // is only a second opinion, and only when the sheet has that column at all
    // -- CHS's invoice has no S/No. column, so requiring one rejected every
    // line of it.
    const productCode = text(get(row, 'product_code'))
    if (!productCode) continue
    const lineNo = get(row, 'line_no')
    const numbered = columns.line_no === undefined || lineNo === null
    if (!numbered && !/^\d+$/.test(String(lineNo).trim())) continue

    current.lines.push({
      row: row.number,
      line_no: lineNo === null ? current.lines.length + 1 : Number(lineNo),
      product_code: productCode,
      supplier_code: text(get(row, 'supplier_code')),
      barcode: barcode(get(row, 'barcode')),
      description_en: text(get(row, 'description_en')),
      // Cada proveedor describe en su idioma y alguno trae la partida.
      description_es: text(get(row, 'description_es')),
      arancel: text(get(row, 'arancel')),
      quantity: num(get(row, 'quantity')),
      unit_price: num(get(row, 'unit_price')),
      cartons: num(get(row, 'cartons')),
      volume_cbm: num(get(row, 'volume_cbm')),
      // Read but never stored: the quantities in these notes do not always
      // agree with the invoiced ones -- 3409-89 is invoiced 600 and noted
      // "1080PCS BY AIR" -- so the note is shown to a person and left at that.
      air: airNote(row),
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
 * The invoice is the spine where there is one: it defines the blocks and their
 * order numbers, and the packing list is merged onto it by contract and product
 * code -- so a line the invoice carries with no packing counterpart, an item
 * shipped by air say, keeps its identity and simply has no CBM.
 *
 * EITHER SHEET ALONE IS ENOUGH. The two carry the same identity columns, and
 * the catalog takes nothing from the invoice that the packing list lacks: no
 * money is read from this document at all, so a packing list on its own gives
 * the full set. A packing list alone does lose something, but it is the order
 * number rather than a field -- this supplier marks its later blocks with the
 * S/C number only, and the PO appears just in the sheet's own header. Those
 * blocks come back with no reference, and the importer says so.
 */
export function parseCommercialInvoice(workbook, { fileName } = {}) {
  const warnings = []

  const invoiceSheet = workbook.sheets.find((s) => hasField(s, 'unit_price'))
  // Por los cartones o por el volumen: CHS numera los cartones bajo un
  // encabezado claro pero deja el volumen en una columna sin etiquetar, así que
  // exigir el volumen dejaba su packing list sin encontrar.
  const packingSheet = workbook.sheets.find(
    (s) => s !== invoiceSheet && (hasField(s, 'cartons') || hasField(s, 'volume_cbm')),
  )
  // Whichever is present leads. Both anchor on a `Code for Box` heading, which
  // is what tells this supplier's paperwork apart from a proforma or one of our
  // own cost sheets.
  const spineSheet = invoiceSheet ?? packingSheet
  if (!spineSheet) throw new Error('noInvoiceSheet')
  if (!invoiceSheet) warnings.push('packingListOnly')
  if (!packingSheet) warnings.push('noPackingList')

  const invoice = readSheet(spineSheet)
  const packing = packingSheet && packingSheet !== spineSheet ? readSheet(packingSheet) : null

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
      return {
        ...line,
        cartons: line.cartons ?? p?.cartons ?? null,
        volume_cbm: line.volume_cbm ?? p?.volume_cbm ?? null,
        // Either sheet may carry the note; the invoice's wins because it is
        // where the supplier writes it first.
        air: line.air ?? p?.air ?? null,
        // Whether the container is actually carrying it. A line the invoice
        // bills and the packing list omits is not in the container at all --
        // on this file that is 3408-85, invoiced at a quantity of nothing and
        // noted "By air-2000PCS".
        onPackingList: packing ? Boolean(p) : null,
      }
    }),
  }))

  if (blocks.length === 0) throw new Error('noInvoiceRows')
  if (!invoice.identity.supplierName) warnings.push('noSupplierName')
  if (blocks.some((b) => b.orderNumber === null)) warnings.push('noOrderNumber')

  // Lines the container is not carrying, or that the supplier has marked as
  // flying. The importer puts these to a person: a line missing from the
  // packing list is either an air shipment or a document that disagrees with
  // itself, and only somebody who knows the order can say which.
  const flying = blocks.flatMap((block) =>
    block.lines
      .filter((line) => line.onPackingList === false || line.air)
      .map((line) => ({
        orderNumber: block.orderNumber,
        product_code: line.product_code,
        description_en: line.description_en,
        quantity: line.quantity,
        note: line.air?.note ?? null,
        airQuantity: line.air?.quantity ?? null,
        onPackingList: line.onPackingList,
      })),
  )

  return {
    fileName: fileName ?? null,
    flying,
    invoiceSheet: invoiceSheet?.name ?? null,
    packingSheet: packingSheet?.name ?? null,
    supplierName: invoice.identity.supplierName,
    contractNo: invoice.identity.contractNo,
    date: invoice.identity.date,
    blocks,
    lineCount: blocks.reduce((sum, b) => sum + b.lines.length, 0),
    warnings,
  }
}
