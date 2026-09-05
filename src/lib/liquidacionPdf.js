/**
 * Reading a DGA "Reporte de Liquidación de Impuestos".
 *
 * The full reasoning lives in docs/data-sources.md. The short version, because
 * two of these will cost a day each if they are forgotten:
 *
 *  - Only the header row of the table is ruled. The body has no ruling at all,
 *    so the columns come from fixed x boundaries and every word is assigned to
 *    a column by the x-centre of its box.
 *
 *  - The ITEM number and the numeric columns are vertically CENTRED in their
 *    row, while the DESCRIPCION cell wraps from the row top. So the item number
 *    is not on the first description line and cannot delimit rows. A parser
 *    that uses it produces rows whose totals all reconcile while the product
 *    codes belong to the wrong products -- the worst kind of wrong, because
 *    every check still passes. Rows are delimited by the vertical gap in the
 *    DESCRIPCION column instead, which is strictly bimodal: ~9.6pt of line
 *    leading within a row, ~13.2pt of padding between rows.
 *
 * pdf.js is imported dynamically so it is not in the main bundle: it is several
 * hundred kilobytes and only this screen needs it.
 */

// The worker's URL, resolved by Vite at build time and served from our own
// origin rather than a CDN the browser may not be allowed to reach.
//
// A STATIC `?url` import on purpose. As a dynamic `await import('...?url')`
// this works in a production build and fails in dev: the dev server has no
// module at that specifier and answers the request with a 404, which surfaces
// as "Failed to fetch dynamically imported module". `?url` yields a string, so
// importing it statically costs a few bytes and does not drag pdf.js itself
// into the main bundle -- that stays behind the dynamic import below.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/** Column x boundaries, from the ruled header. Verified on two declarations. */
const BOUNDS = [
  34.92, 60.6, 102.0, 191.4, 225.6, 261.6, 306.6, 340.2, 386.4, 435.6, 484.8, 525.6, 577.05,
]
const ITEM = 0
const ARANCEL = 1
const DESC = 2
const UNID = 3
const ORIGEN = 4
const CANT = 5
const FOB = 6
const CIF = 7
const GRAVAMEN = 8
const SELECTIVO = 9
const ITBIS = 10
const TOTAL = 11

/** The header labels, and the column each must land in. Checked on every import. */
const HEADER_CHECKS = [
  ['ITEM', ITEM],
  ['ARANCEL', ARANCEL],
  ['DESCRIPCION', DESC],
  ['CANT.', CANT],
  ['FOB', FOB],
  ['CIF', CIF],
  ['GRAVAMEN', GRAVAMEN],
  ['TOTAL', TOTAL],
]

const columnOf = (x) => {
  for (let i = 0; i < 12; i += 1) {
    if (x >= BOUNDS[i] && x < BOUNDS[i + 1]) return i
  }
  return null
}

/** A figure as printed: `1,234.56` -> '1234.56'. Returns null for anything else. */
const numeric = (value) => {
  const trimmed = (value ?? '').replace(/,/g, '').replace(/^\$/, '').trim()
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : null
}

/** Group items into visual lines by their y, then left-to-right within a line. */
const toLines = (items, tolerance = 3) => {
  const lines = []
  for (const item of [...items].sort((a, b) => a.y - b.y || a.left - b.left)) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(item.y - last.y) < tolerance) last.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }
  for (const line of lines) line.items.sort((a, b) => a.left - b.left)
  return lines
}

/** Pull the value to the right of a `Label :` on the header, within its column band. */
const headerField = (items, label) => {
  const anchor = items.find((i) => i.str.replace(/\s*:\s*$/, '').trim() === label)
  if (!anchor) return null
  // The header is laid out in three columns and the reading order interleaves
  // them, so take only what sits to the right of the label on the same line and
  // stop before the next column begins.
  const sameLine = items.filter((i) => Math.abs(i.y - anchor.y) < 4 && i.left > anchor.left)
  if (sameLine.length === 0) return null
  const nearest = sameLine.sort((a, b) => a.left - b.left)[0]
  return nearest.str.trim() || null
}

export const isSupported = () => typeof Promise !== 'undefined'

/**
 * Extract the line items and header of one liquidación.
 *
 * Throws with a readable message if the document does not look like one, rather
 * than returning something empty that reads as "no products in this file".
 */
export async function readLiquidacion(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  }).promise

  const pages = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    pages.push(
      content.items
        .filter((i) => i.str.trim() !== '' && (i.width ?? 0) > 0)
        .map((i) => ({
          /*
           * The x-CENTRE of the word, which is what docs/data-sources.md
           * specifies and what this had drifted away from.
           *
           * The values in a column are centred under its heading, so a long
           * word starts further left than a short one in the same column:
           * `Kilogramos` begins at x=191.1 where `Unidades` begins at 197. The
           * DESCRIPCION band ends at 191.4, so measuring from the left EDGE put
           * `Kilogramos` inside the description -- by three tenths of a unit --
           * and a KLIK 66 row came out reading `DOBLE Kilogramos KOLNY/BLANCO
           * (10/1)`. A centre cannot do that: it sits where the column is,
           * whatever the word's length.
           */
          x: i.transform[4] + (i.width ?? 0) / 2,
          // Kept because the description is read left to right and the raw edge
          // is what orders words within a line.
          left: i.transform[4],
          // pdf.js measures from the bottom of the page; everything here reads
          // top-down, and so do the boundaries above.
          y: Number((viewport.height - i.transform[5]).toFixed(2)),
          str: i.str.trim(),
        })),
    )
  }

  if (pages.length === 0) throw new Error('emptyPdf')

  // --- the document is what we think it is ---------------------------------
  const firstPage = pages[0]
  const title = firstPage.find((i) => i.str.includes('Liquidación de Impuestos'))
  if (!title) throw new Error('notALiquidacion')

  for (const [label, expected] of HEADER_CHECKS) {
    const cell = firstPage.find((i) => i.str === label)
    if (!cell) throw new Error(`missingColumn:${label}`)
    if (columnOf(cell.x) !== expected) throw new Error(`columnMoved:${label}`)
  }

  // --- header fields --------------------------------------------------------
  const header = {
    declaracion: headerField(firstPage, 'Declaración'),
    liquidacion: headerField(firstPage, 'Liquidación'),
    fechaDecl: headerField(firstPage, 'Fecha Decl.'),
    fechaLlegada: headerField(firstPage, 'Fecha Llegada'),
    consignatario: headerField(firstPage, 'Consignatario'),
    manifiesto: headerField(firstPage, 'Manifiesto'),
    blNumber: headerField(firstPage, 'Número B/L'),
    agencia: headerField(firstPage, 'Agencia'),
  }

  // --- line items -----------------------------------------------------------
  //
  // The Totales row ends the table, and it is NOT always on the last page: a
  // short declaration puts it on page 1 with only the container and money
  // footer overleaf. Find it once, then read rows from the pages up to and
  // including it and ignore everything after.
  //
  // Getting this wrong is quiet. The FURGONES table on the footer page carries
  // a `1` in the ITEM column, so a page past the Totales row contributes a
  // phantom line item, and the row-count check then fails against a document
  // that parsed almost perfectly.
  const totalesPage = pages.findIndex((items) => items.some((i) => i.str === 'Totales'))
  const totalesItem =
    totalesPage === -1 ? null : pages[totalesPage].find((i) => i.str === 'Totales')

  const rows = []
  const warnings = []
  if (totalesPage === -1) warnings.push('noTotalesRow')

  pages.forEach((items, index) => {
    if (totalesPage !== -1 && index > totalesPage) return
    const stop = totalesPage === index ? totalesItem.y : Infinity
    /*
     * The table starts under its OWN header row, not at a fixed y.
     *
     * `300` was measured off one declaration and is wrong on the next. KLIK 48
     * heads its table at y=268.5 and item 1's description begins at 281.7, so
     * the cutoff swallowed the first two of its three lines AND the anchor that
     * carries the item number -- leaving a stray block reading `BLANCO (10/1)`
     * with no anchor of its own. Blocks and anchors are paired by index, so
     * that one orphan shifted every description on the page onto the following
     * row: item 2 wore item 3's name, and so on down. Every figure still
     * summed, which is why it took a totals check on the CIF column to notice.
     *
     * Four of thirty-eight declarations were being read this way. The header
     * row is on the page in plain text, so it is read rather than guessed --
     * the same rule the spreadsheet readers already follow. The old constant
     * stays as the fallback for a page that has no header of its own.
     *
     * The bottom is the Totales row, never a fixed margin -- a row can sit at
     * y=740 and a margin cutoff drops it without a word.
     */
    const heading = items.find((i) => i.str === 'DESCRIPCION' && columnOf(i.x) === DESC)
    // Just past the header's own line: `toLines` groups within 3 units, so 4
    // clears it without reaching the first description line under it.
    const top = heading ? heading.y + 4 : index === 0 ? 300 : 25
    const body = items.filter((i) => i.y > top && i.y < stop - 2)
    if (body.length === 0) return

    const lines = toLines(body)

    // Description blocks, split where the gap widens. The threshold is derived
    // from the gaps actually present rather than hard-coded, so a change of
    // font size does not silently merge every row into one.
    const descLines = lines.filter((l) => l.items.some((i) => columnOf(i.x) === DESC))
    const gaps = [
      ...new Set(descLines.slice(1).map((l, i) => Number((l.y - descLines[i].y).toFixed(2)))),
    ].sort((a, b) => a - b)
    const threshold = gaps.length > 1 ? (gaps[0] + gaps[gaps.length - 1]) / 2 : Infinity

    const blocks = []
    let current = []
    descLines.forEach((line, i) => {
      if (current.length && line.y - descLines[i - 1].y > threshold) {
        blocks.push(current)
        current = []
      }
      current.push(line)
    })
    if (current.length) blocks.push(current)

    // Anchors: a line carrying a lone integer in the ITEM column.
    const anchors = []
    for (const line of lines) {
      const inItem = line.items.filter((i) => columnOf(i.x) === ITEM).map((i) => i.str)
      if (inItem.length === 1 && /^\d+$/.test(inItem[0])) {
        const cells = {}
        for (const cell of line.items) {
          const column = columnOf(cell.x)
          if (column !== null && column !== DESC) {
            cells[column] = cells[column] ?? []
            cells[column].push(cell.str)
          }
        }
        anchors.push(cells)
      }
    }

    if (blocks.length !== anchors.length) {
      warnings.push(`layout:page ${index + 1}: ${blocks.length} descriptions, ${anchors.length} rows`)
    }

    anchors.forEach((cells, i) => {
      const block = blocks[i] ?? []
      const description = block
        .flatMap((line) => line.items.filter((it) => columnOf(it.x) === DESC).map((it) => it.str))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      const get = (column) => (cells[column] ?? []).join(' ').trim()
      rows.push({
        page: index + 1,
        item: Number(get(ITEM)),
        arancel: get(ARANCEL),
        descripcion: description,
        unid: get(UNID),
        origen: get(ORIGEN),
        cant: numeric(get(CANT)),
        fob: numeric(get(FOB)),
        cif: numeric(get(CIF)),
        gravamen: numeric(get(GRAVAMEN)),
        selectivo: numeric(get(SELECTIVO)),
        itbis: numeric(get(ITBIS)),
        total: numeric(get(TOTAL)),
      })
    })
  })

  // --- footer ---------------------------------------------------------------
  // The money block is on the last page; the Totales row may not be.
  const footerText = pages[pages.length - 1].map((i) => i.str).join(' ')
  const rateMatch = footerText.match(/US\$\s*\(\s*([\d.,]+)\s*\)/)
  const statedTotals = {}
  if (totalesItem) {
    for (const cell of pages[totalesPage].filter((i) => Math.abs(i.y - totalesItem.y) < 4)) {
      const column = columnOf(cell.x)
      const value = numeric(cell.str)
      if (value !== null && column !== null) statedTotals[column] = value
    }
  }

  return {
    header,
    // Recorded against the import, never used to convert. The printed figure is
    // rounded to two decimals and does not reproduce the document's own totals.
    exchangeRate: rateMatch ? rateMatch[1].replace(/,/g, '') : null,
    rows,
    statedTotals: {
      cif: statedTotals[CIF] ?? null,
      gravamen: statedTotals[GRAVAMEN] ?? null,
      selectivo: statedTotals[SELECTIVO] ?? null,
      itbis: statedTotals[ITBIS] ?? null,
      total: statedTotals[TOTAL] ?? null,
    },
    warnings,
  }
}
