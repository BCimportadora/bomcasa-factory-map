/**
 * Writing a cost sheet workbook, with live formulas.
 *
 * No third-party dependency, for the same reason lib/xlsxReader.js has none: an
 * .xlsx is a ZIP of XML parts, the browser can deflate with `CompressionStream`,
 * and every browser that can already OPEN a spreadsheet here can write one.
 * This is the mirror image of that reader and the two are meant to be read
 * together.
 *
 * Two decisions worth knowing before changing anything here.
 *
 * EVERY FORMULA IS WRITTEN WITH ITS COMPUTED VALUE ALONGSIDE. openpyxl writes
 * formulas with no cached value, and CLAUDE.md records what that costs: this
 * platform's own readers take the cache, so such a file comes back as a sheet
 * of blanks. Writing `<f>` and `<v>` together means the file is correct to
 * anything that reads it -- Excel, LibreOffice, our own importer -- before it
 * has been recalculated even once. Excel recalculates on open regardless.
 *
 * STRINGS ARE INLINE, not pooled in sharedStrings.xml. It costs some bytes,
 * which deflate largely takes back, and it removes a whole class of index bugs.
 * It also guarantees that a product code stays TEXT: `2014` written as a number
 * would never match `'2014'` in the lookup sheet, and the VLOOKUP would come
 * back #N/A on exactly one line of a thirty-one line sheet.
 */

import { COLUMNS, LAYOUT, ITBIS_RATE, FX_FACTOR, PRICE_EX_TAX_DIVISOR, PRICE_INC_TAX_DIVISOR } from './costSheetModel'
import { EXPENSE_KEYS, GRAVAMEN_RATES } from './costSheetSource'

// --- ZIP ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

const crc32 = (bytes) => {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Build the archive.
 *
 * Entries are deflated unless deflating makes them bigger, which it does for
 * the very small parts. A stored entry is method 0, which the reader on the
 * other side already handles.
 */
async function zip(entries) {
  const encoder = new TextEncoder()
  const chunks = []
  const central = []
  let offset = 0

  for (const [name, text] of entries) {
    const raw = encoder.encode(text)
    const packed = await deflate(raw)
    const stored = packed.length >= raw.length
    const data = stored ? raw : packed
    const method = stored ? 0 : 8
    const crc = crc32(raw)
    const nameBytes = encoder.encode(name)

    const local = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, method, true)
    // A fixed timestamp: nothing here depends on it, and a moving one makes two
    // otherwise identical downloads differ byte for byte.
    view.setUint16(10, 0, true)
    view.setUint16(12, 0x2821, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, raw.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    chunks.push(local, data)

    const entry = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x2821, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    entry.set(nameBytes, 46)
    central.push(entry)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((n, e) => n + e.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...chunks, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// --- XML ------------------------------------------------------------------

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are not legal in XML 1.0 at all and Excel rejects the
    // whole part rather than the cell. A tab or a newline inside a heading is
    // legal and must survive: the column labels depend on it.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/**
 * Style indices, matching the order written into styles.xml below.
 *
 * `text` is not merely cosmetic: it carries the "@" number format, which is
 * what stops Excel offering to convert a code that looks like a number.
 */
const S = {
  base: 0,
  header: 1,
  money: 2,
  int: 3,
  text: 4,
  totalMoney: 5,
  totalInt: 6,
  ratio: 7,
  title: 8,
  rate: 9,
}

const cell = (ref, value, { style = S.base, formula = null, type = 'n' } = {}) => {
  const s = style ? ` s="${style}"` : ''
  if (formula != null) {
    // The computed value travels with the formula; see the note at the top.
    // A formula that returns TEXT -- the description VLOOKUP does -- has to
    // declare `t="str"`, or the cached value is read back as a number and
    // silently discarded, leaving every description blank until somebody
    // recalculates the file.
    if (typeof value === 'string') {
      return `<c r="${ref}"${s} t="str"><f>${escapeXml(formula)}</f><v>${escapeXml(value)}</v></c>`
    }
    const v = value == null || !Number.isFinite(value) ? '' : `<v>${value}</v>`
    return `<c r="${ref}"${s}><f>${escapeXml(formula)}</f>${v}</c>`
  }
  if (value == null || value === '') return ''
  if (type === 's') return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  if (!Number.isFinite(value)) return ''
  return `<c r="${ref}"${s}><v>${value}</v></c>`
}

const row = (number, cells) => {
  const body = cells.filter(Boolean).join('')
  return body ? `<row r="${number}">${body}</row>` : ''
}

const sheetXml = (rows, { cols = '', freeze = null } = {}) => {
  const pane = freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows.filter(Boolean).join('')}</sheetData></worksheet>`
}

// --- the workbook ---------------------------------------------------------

const LOOKUP_SHEET = 'No tocar'
const COST_SHEET = 'CONTENEDOR 1'
const NOTES_SHEET = 'NOTAS'

const letterOf = (key) => COLUMNS.find((c) => c.key === key)?.letter

/**
 * The lookup sheet the generated file carries with it.
 *
 * Two jobs. It makes the workbook self-contained -- the descriptions and list
 * prices resolve without the Catalog, on a laptop with no connection -- and it
 * is what guarantees the VLOOKUPs never fail. Every product on the cost sheet
 * is written into it under EXACTLY the code string column B holds, so there is
 * no spelling of a code that resolves on one sheet and not the other.
 */
function buildLookup({ rows, sourceEntries }) {
  const entries = []
  const byKey = new Map()
  for (const entry of sourceEntries ?? []) {
    const code = String(entry.code ?? '').trim()
    if (!code) continue
    const index = entries.length
    entries.push({ code, description: entry.description ?? null, list_price: entry.list_price ?? null })
    // Keyed on digits, because the same article is written three ways across
    // these documents and the lookup must find it however it was typed.
    const key = code.replace(/\D/g, '')
    if (key && !byKey.has(key)) byKey.set(key, index)
  }

  for (const line of rows) {
    const code = String(line.code ?? '').trim()
    if (!code) continue
    const key = code.replace(/\D/g, '')
    const at = key ? byKey.get(key) : undefined
    const record = {
      code,
      description: line.description ?? null,
      list_price: line.listPrice ?? null,
    }
    if (at === undefined) {
      byKey.set(key, entries.length)
      entries.push(record)
    } else {
      // This shipment's own resolution wins over whatever the source file had
      // cached, and the code is rewritten to the exact string column B uses.
      entries[at] = record
    }
  }
  return entries
}

function lookupSheetXml(entries) {
  const rows = [
    row(1, [
      cell('A1', 'Número de artículo', { style: S.header, type: 's' }),
      cell('B1', 'Descripción del artículo', { style: S.header, type: 's' }),
    ]),
  ]
  entries.forEach((entry, index) => {
    const r = index + 2
    rows.push(
      row(r, [
        cell(`A${r}`, entry.code, { style: S.text, type: 's' }),
        cell(`B${r}`, entry.description, { style: S.text, type: 's' }),
        entry.list_price == null ? '' : cell(`C${r}`, entry.list_price, { style: S.money }),
      ]),
    )
  })
  const cols = '<cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="62" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/></cols>'
  return { xml: sheetXml(rows, { cols, freeze: 1 }), count: entries.length + 1 }
}

/**
 * The cost sheet itself.
 *
 * Column by column, this reproduces the formulas of
 * `LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx`. Two things are deliberately NOT
 * reproduced: the duplicated line number the sample carries at rows 27 and 28,
 * and any cell whose value could not be established. The first is a defect; the
 * second stays empty and is reported, because a blank cell is a question and a
 * zero is an answer.
 */
function costSheetXml({ computed, input, lookupRows }) {
  const first = LAYOUT.firstDataRow
  const last = first + computed.rows.length - 1
  const totalRow = last + 1
  const rows = []

  // The shipment's name, and the five gravamen rates the header offers.
  rows.push(row(2, [
    cell('A2', input.shipmentName, { style: S.title, type: 's' }),
    cell('M2', GRAVAMEN_RATES[0], { style: S.rate }),
  ]))
  for (let i = 1; i < GRAVAMEN_RATES.length; i += 1) {
    rows.push(row(2 + i, [cell(`M${2 + i}`, GRAVAMEN_RATES[i], { style: S.rate })]))
  }

  // Entry numbers, above the amounts they belong to.
  const entryCells = [cell('N8', 'No. entrada', { style: S.text, type: 's' })]
  EXPENSE_KEYS.forEach((key) => {
    const value = input.entryNumbers?.[key]
    if (value == null || value === '') return
    const asNumber = Number(value)
    entryCells.push(
      Number.isFinite(asNumber) && String(asNumber) === String(value).trim()
        ? cell(`${letterOf(key)}8`, asNumber, { style: S.int })
        : cell(`${letterOf(key)}8`, value, { style: S.text, type: 's' }),
    )
  })
  rows.push(row(LAYOUT.entryLabelRow, entryCells))

  // The header block: name, the two allocation totals, the rate, the seven
  // expense amounts every local charge is shared out of.
  const blockCells = [
    cell('B10', input.shipmentName, { style: S.text, type: 's' }),
    cell('F10', input.freightUsd, { style: S.money }),
    cell('G10', input.insuranceUsd, { style: S.money }),
    cell('H10', input.exchangeRate, { style: S.money }),
    cell('N10', 'MONTOS', { style: S.text, type: 's' }),
  ]
  EXPENSE_KEYS.forEach((key) => {
    blockCells.push(cell(`${letterOf(key)}10`, input.expenses?.[key], { style: S.money }))
  })
  rows.push(row(LAYOUT.headerBlockRow, blockCells))

  // The column labels, reproduced to the character.
  rows.push(
    row(
      LAYOUT.headerRow,
      COLUMNS.map((column) =>
        cell(`${column.letter}${LAYOUT.headerRow}`, column.header, { style: S.header, type: 's' }),
      ),
    ),
  )

  const money = (ref, value, formula) => cell(ref, value, { style: S.money, formula })

  computed.rows.forEach((line, index) => {
    const r = first + index
    const at = (key) => `${letterOf(key)}${r}`
    const cells = []

    // Numbered sequentially here, whatever the source did. The sample workbook
    // numbers two different products 16; a generated sheet never will.
    cells.push(cell(at('no'), index + 1, { style: S.int }))
    cells.push(cell(at('code'), line.code, { style: S.text, type: 's' }))
    cells.push(cell(at('units'), line.units, { style: S.int }))

    // The description is looked up rather than typed, exactly as the target
    // does -- so correcting the lookup sheet corrects the cost sheet. Written
    // only when there is something to find; an unresolved product would give
    // #N/A, which must never reach a generated file.
    cells.push(
      line.description
        ? cell(at('description'), line.description, {
            style: S.text,
            formula: `VLOOKUP(B${r},'${LOOKUP_SHEET}'!$A$2:$C$${lookupRows},2,FALSE)`,
          })
        : '',
    )

    cells.push(money(at('fob'), line.fob))
    cells.push(money(at('freight'), line.freight, `(E${r}/$E$${totalRow})*$F$10`))
    cells.push(money(at('insurance'), line.insurance, `(E${r}/$E$${totalRow})*$G$10`))
    cells.push(money(at('cifUsd'), line.cifUsd, `E${r}+F${r}+G${r}`))
    cells.push(money(at('cifLocal'), line.cifLocal, `H${r}*$H$10`))

    // A rate of zero is written as a literal zero, as the target does: there is
    // no duty, and `=+I12*0` states that less plainly than 0 does.
    cells.push(
      line.gravamenRate
        ? money(at('duty'), line.duty, `+I${r}*${line.gravamenRate}`)
        : cell(at('duty'), line.duty ?? 0, { style: S.money }),
    )
    cells.push(cell(at('excise'), line.excise ?? 0, { style: S.money }))

    const vatBase = input.itbisBase === 'conSelectivo' ? `I${r}+J${r}+K${r}` : `I${r}+J${r}`
    cells.push(money(at('vat'), line.vat, `+(${vatBase})*${ITBIS_RATE}`))
    cells.push(money(at('dutyVat'), line.dutyVat, `+J${r}+L${r}`))
    cells.push(money(at('customsTotal'), line.customsTotal, `+I${r}+J${r}+K${r}`))

    EXPENSE_KEYS.forEach((key) => {
      cells.push(money(at(key), line[key], `+N${r}/$N$${totalRow}*$${letterOf(key)}$10`))
    })

    cells.push(money(at('landed'), line.landed, `+SUM(N${r}:U${r})`))
    cells.push(money(at('unitCost'), line.unitCost, `+V${r}/C${r}`))
    cells.push(money(at('withFx'), line.withFx, `W${r}*${FX_FACTOR}`))

    // The pricing block, and the reason it is all-or-nothing: with no list
    // price there is nothing to work the selling prices back from, and a chain
    // of zeros would read as "we sell this for nothing".
    if (line.listPrice != null) {
      cells.push(
        line.margin == null
          ? ''
          : cell(at('margin'), line.margin, { style: S.ratio, formula: `+(Z${r}/X${r})-1` }),
      )
      cells.push(money(at('priceExTax'), line.priceExTax, `+AA${r}/${PRICE_EX_TAX_DIVISOR}`))
      cells.push(money(at('priceIncTax'), line.priceIncTax, `+AB${r}/${PRICE_INC_TAX_DIVISOR}`))
      cells.push(
        money(at('listPrice'), line.listPrice, `+VLOOKUP(B${r},'${LOOKUP_SHEET}'!$A$1:$C$${lookupRows},3,FALSE)`),
      )
      cells.push(money(at('expectedVolume'), line.expectedVolume, `Z${r}*C${r}`))
    }

    // AD is the buyer's own suggestion and AE their note; neither is derived.
    if (line.comment) cells.push(cell(at('comment'), line.comment, { style: S.text, type: 's' }))

    rows.push(row(r, cells))
  })

  // The totals line. Selectivo is summed too, which the sample omits -- a
  // column with no total reads as a generator that forgot one.
  const totalKeys = [
    ['units', computed.totals.units, S.totalInt],
    ['fob', computed.totals.fob],
    ['freight', computed.totals.freight],
    ['insurance', computed.totals.insurance],
    ['cifUsd', computed.totals.cifUsd],
    ['cifLocal', computed.totals.cifLocal],
    ['duty', computed.totals.duty],
    ['excise', computed.totals.excise],
    ['vat', computed.totals.vat],
    ['dutyVat', computed.totals.dutyVat],
    ['customsTotal', computed.totals.customsTotal],
    ...EXPENSE_KEYS.map((key) => [key, computed.totals[key]]),
    ['landed', computed.totals.landed],
    ['expectedVolume', computed.totals.expectedVolume],
  ]
  rows.push(
    row(
      totalRow,
      totalKeys.map(([key, value, style]) => {
        const letter = letterOf(key)
        return cell(`${letter}${totalRow}`, value, {
          style: style ?? S.totalMoney,
          formula: `SUM(${letter}${first}:${letter}${last})`,
        })
      }),
    ),
  )

  // What a peso of goods costs landed, and the gross profit expected of the
  // shipment. Their labels sit beneath them, as on the target sheet.
  rows.push(
    row(totalRow + 1, [
      cell(`V${totalRow + 1}`, computed.costFactor, {
        style: S.money,
        formula: `+V${totalRow}/E${totalRow}`,
      }),
      cell(`AC${totalRow + 1}`, computed.grossMarginRatio, {
        style: S.ratio,
        formula: `+(AC${totalRow}/V${totalRow})-1`,
      }),
    ]),
  )
  rows.push(
    row(totalRow + 2, [
      cell(`V${totalRow + 2}`, 'factor costo', { style: S.text, type: 's' }),
      cell(`AC${totalRow + 2}`, computed.grossProfit, {
        style: S.totalMoney,
        formula: `+AC${totalRow}-V${totalRow}`,
      }),
    ]),
  )
  rows.push(row(totalRow + 3, [cell(`AC${totalRow + 3}`, 'UTILIDAD BRUTA', { style: S.text, type: 's' })]))

  const widths = COLUMNS.map((column, index) => {
    const width = column.key === 'description' ? 46 : column.kind === 'text' ? 22 : 14
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  }).join('')

  return sheetXml(rows, { cols: `<cols>${widths}</cols>`, freeze: LAYOUT.headerRow })
}

/**
 * The record of how this file was produced.
 *
 * Anyone opening it in six months needs to know which ITBIS base was used,
 * which of the four exchange rates, where the gravamen rates came from, and --
 * above all -- which values were incomplete and accepted anyway. Without that
 * the sheet looks like every other one, and its gaps are invisible.
 */
function notesSheetXml(notes) {
  const rows = [
    row(1, [cell('A1', 'CÓMO SE GENERÓ ESTA HOJA', { style: S.title, type: 's' })]),
  ]
  let r = 3
  for (const [label, value] of notes) {
    rows.push(
      row(r, [
        cell(`A${r}`, label, { style: S.text, type: 's' }),
        cell(`B${r}`, value, { style: S.text, type: 's' }),
      ]),
    )
    r += 1
  }
  const cols = '<cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="96" customWidth="1"/></cols>'
  return sheetXml(rows, { cols })
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0000"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="${LOOKUP_SHEET}" sheetId="1" r:id="rId1"/>
<sheet name="${COST_SHEET}" sheetId="2" r:id="rId2"/>
<sheet name="${NOTES_SHEET}" sheetId="3" r:id="rId3"/>
</sheets>
<calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`

/**
 * The generated file's name.
 *
 * Modelled on the company's own -- `LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx` --
 * because these are filed by name in a folder alongside the originals, and a
 * name in a different shape is the one nobody finds again.
 */
export const costSheetFileName = (shipmentName) => {
  const name = String(shipmentName ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `LIQUIDACION COSTO ${name || 'SIN NOMBRE'}.xlsx`
}

/**
 * Produce the workbook.
 *
 * `notes` is a list of `[label, value]` pairs written verbatim onto the NOTAS
 * sheet: the four decisions, and every warning that was accepted.
 */
export async function buildCostSheetWorkbook({ computed, input, sourceLookupEntries, notes = [] }) {
  const entries = buildLookup({ rows: computed.rows, sourceEntries: sourceLookupEntries })
  const lookup = lookupSheetXml(entries)

  return zip([
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['xl/workbook.xml', WORKBOOK],
    ['xl/_rels/workbook.xml.rels', WORKBOOK_RELS],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', lookup.xml],
    ['xl/worksheets/sheet2.xml', costSheetXml({ computed, input, lookupRows: lookup.count })],
    ['xl/worksheets/sheet3.xml', notesSheetXml(notes)],
  ])
}
