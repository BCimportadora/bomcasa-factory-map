/**
 * A minimal .xlsx reader, with no third-party dependency.
 *
 * An .xlsx file is a ZIP of XML parts. Rather than pull in a spreadsheet
 * library — the popular one is heavyweight, and its npm package has moved
 * around — this unzips with the browser's own `DecompressionStream` and reads
 * the handful of parts we actually need.
 *
 * Requires DecompressionStream('deflate-raw'): Chrome 103+, Firefox 113+,
 * Safari 16.4+. `isSupported()` says so before a user picks a file, because
 * "nothing happened" is a miserable way to find out.
 */

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50
const ZIP64_SENTINEL = 0xffffffff

export const isSupported = () =>
  typeof DecompressionStream !== 'undefined' &&
  (() => {
    try {
      // Constructing it is the only honest test; the constructor throws on an
      // unsupported format rather than reporting it.
      new DecompressionStream('deflate-raw')
      return true
    } catch {
      return false
    }
  })()

/** Locate the End Of Central Directory record, which is at the end but not at a fixed offset. */
function findEocd(view) {
  // It carries a variable-length comment, so scan back over the largest one.
  const start = Math.max(0, view.byteLength - 65_557)
  for (let i = view.byteLength - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) return i
  }
  throw new Error('Not a valid .xlsx file (no ZIP directory found).')
}

/** Every entry in the archive: name, where its bytes are, and how they are packed. */
function readDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEocd(view)
  const count = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)

  if (cdOffset === ZIP64_SENTINEL) {
    throw new Error('This spreadsheet uses the ZIP64 format, which is not supported.')
  }

  const decoder = new TextDecoder()
  const entries = new Map()
  let at = cdOffset

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localOffset = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))

    entries.set(name, { method, compressedSize, localOffset })
    at += 46 + nameLength + extraLength + commentLength
  }

  return { entries, bytes, view }
}

/**
 * The compressed bytes of one entry.
 *
 * The central directory records where the *local* header starts, not where the
 * data does — and the local header has its own name and extra fields whose
 * lengths differ from the central ones, so they have to be read again here.
 */
function rawData({ bytes, view }, entry) {
  const nameLength = view.getUint16(entry.localOffset + 26, true)
  const extraLength = view.getUint16(entry.localOffset + 28, true)
  const start = entry.localOffset + 30 + nameLength + extraLength
  return bytes.subarray(start, start + entry.compressedSize)
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Read one part of the archive as text, or null when it is not present. */
async function readPart(archive, name) {
  const entry = archive.entries.get(name)
  if (!entry) return null
  const data = rawData(archive, entry)
  const bytes = entry.method === 0 ? data : await inflate(data)
  return new TextDecoder().decode(bytes)
}

// --- XML ------------------------------------------------------------------

const ENTITIES = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&#(\d+);/g, null],
  [/&amp;/g, '&'],
]

function unescape(text) {
  let out = text
  for (const [pattern, replacement] of ENTITIES) {
    out =
      replacement === null
        ? out.replace(pattern, (_, code) => String.fromCharCode(Number(code)))
        : out.replace(pattern, replacement)
  }
  return out
}

/*
 * Cells are matched as whole elements rather than with a lazy `.*?` up to the
 * first `/>`. A shared formula is written `<f t="shared" si="0"/>`, and a lazy
 * match stops at that self-closing tag — silently dropping the value of every
 * row that reuses a formula instead of restating it. That failure is invisible:
 * the first rows of a sheet read correctly and the rest come back blank.
 */
const CELL = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const ROW = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g

const columnIndex = (ref) => {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellValue(attrs, inner, shared) {
  if (inner == null) return null
  const kind = /\st="([^"]+)"/.exec(attrs)?.[1] ?? 'n'

  if (kind === 'inlineStr') {
    const parts = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1])
    return parts.length > 0 ? unescape(parts.join('')) : null
  }

  const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)
  if (!v) return null
  const raw = unescape(v[1])

  if (kind === 's') return shared[Number(raw)] ?? raw
  if (kind === 'str' || kind === 'e') return raw
  const num = Number(raw)
  return Number.isFinite(num) ? num : raw
}

/**
 * Read a workbook into `{ sheets: [{ name, rows }] }`, where each row is
 * `{ number, cells: Map<columnIndex, value> }`. Only non-empty rows appear.
 */
export async function readWorkbook(file) {
  if (!isSupported()) {
    throw new Error('This browser cannot open .xlsx files. Try Chrome, Edge, Firefox or Safari.')
  }

  const archive = readDirectory(new Uint8Array(await file.arrayBuffer()))

  const sharedXml = (await readPart(archive, 'xl/sharedStrings.xml')) ?? ''
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    unescape([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )

  const relsXml = (await readPart(archive, 'xl/_rels/workbook.xml.rels')) ?? ''
  const rels = new Map(
    [...relsXml.matchAll(/<Relationship[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [
      m[1],
      m[2].replace(/^\//, ''),
    ]),
  )

  const workbookXml = (await readPart(archive, 'xl/workbook.xml')) ?? ''
  const sheets = []

  for (const m of workbookXml.matchAll(/<sheet[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)) {
    const target = rels.get(m[2])
    // Chart sheets appear in the workbook but have no cells; skip them rather
    // than reporting an empty sheet the user then wonders about.
    if (!target || !target.includes('worksheets/')) continue

    const path = target.startsWith('xl/') ? target : `xl/${target}`
    const xml = await readPart(archive, path)
    if (!xml) continue

    const rows = []
    for (const rowMatch of xml.matchAll(ROW)) {
      const inner = rowMatch[2]
      if (inner == null) continue
      const number = Number(/\sr="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1)
      const cells = new Map()
      let auto = 0
      for (const cellMatch of inner.matchAll(CELL)) {
        const ref = /\sr="([A-Z]+\d+)"/.exec(cellMatch[1])?.[1]
        const index = ref ? columnIndex(ref) : auto
        auto = index + 1
        const value = cellValue(cellMatch[1], cellMatch[2], shared)
        if (value !== null && value !== '') cells.set(index, value)
      }
      if (cells.size > 0) rows.push({ number, cells })
    }

    sheets.push({ name: unescape(m[1]), rows })
  }

  if (sheets.length === 0) throw new Error('That file contains no worksheets.')
  return { sheets }
}
