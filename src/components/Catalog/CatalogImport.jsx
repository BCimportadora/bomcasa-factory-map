import { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
import { readWorkbook, isSupported as xlsxSupported } from '../../lib/xlsxReader'
import { readLiquidacion } from '../../lib/liquidacionPdf'
import { parseProforma } from '../../lib/proforma'
import { parseLiquidation } from '../../lib/liquidation'
import {
  detectDocType,
  docTypeKey,
  isoDate,
  planImport,
  validateLiquidacion,
} from '../../lib/catalog'

/** Rows the catalog can be built from, out of one parsed liquidación. */
const liquidacionRows = (parsed) =>
  parsed.rows.map((r) => ({
    ...r,
    codigo: lastSixDigits(r.descripcion),
  }))

/**
 * The product code embedded in a liquidación description.
 *
 * `NO APLICA` is stripped if present but never required — one row of our own
 * sample ends at the code with no marker at all, and a parser that insists on
 * it returns nothing for that row.
 */
function lastSixDigits(description) {
  const head = (description ?? '').replace(/\s*NO APLICA\s*$/, '')
  const found = [...head.matchAll(/(?<!\d)(\d{6})(?!\d)/g)].map((m) => m[1])
  return found.length ? found[found.length - 1] : null
}

function Figure({ label, value, tone = '' }) {
  return (
    <div>
      <p className="hint">{label}</p>
      <p className={`text-[17px] font-semibold ${tone || 'text-ink'}`}>{value}</p>
    </div>
  )
}

export default function CatalogImport({ onCheckImported, onListProducts, onConfirm, onClose }) {
  const { t, tCount } = useI18n()
  const input = useRef(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState(null) // { docType, parsed, plan, document, validation }
  const [alreadyImported, setAlreadyImported] = useState(null)

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setAlreadyImported(null)
    setState(null)
    setBusy(true)

    try {
      const detected = detectDocType(file)
      if (!detected) throw new Error('unsupportedFile')

      let docType = detected
      let parsed
      let rows
      let document
      let validation = null
      let docDate = null

      if (docType === 'liquidacion') {
        parsed = await readLiquidacion(file)
        // Nothing is written unless the document reconciles against its own
        // Totales row. A liquidación that does not has been mis-parsed, and its
        // duty rates would go into the catalog where nothing later questions
        // them.
        validation = validateLiquidacion(parsed)
        rows = liquidacionRows(parsed)
        document = {
          doc_type: 'liquidacion',
          doc_key: parsed.header.declaracion ?? `file:${file.name}`,
          file_name: file.name,
          declaracion: parsed.header.declaracion ?? null,
          liquidacion: parsed.header.liquidacion ?? null,
          exchange_rate: parsed.exchangeRate,
          line_count: parsed.rows.length,
        }
        // The declaration's own date, not today's. It is what decides whether
        // this document's prices beat the ones already stored.
        docDate = isoDate(parsed.header.fechaDecl) ?? isoDate(parsed.header.fechaLlegada)
        document.doc_date = docDate
      } else {
        if (!xlsxSupported()) throw new Error('unsupportedBrowser')
        const workbook = await readWorkbook(file)
        // A supplier proforma and one of our own cost sheets are both .xlsx and
        // are named alike. Try the proforma shape first; if the sheet has no
        // No./Code header pair it is a cost sheet, which is read by the parser
        // the Orders section already uses.
        try {
          parsed = parseProforma(workbook, { fileName: file.name })
          docType = 'proforma'
          rows = parsed.lines
          document = {
            doc_type: 'proforma',
            doc_key: parsed.invoiceNo ?? `file:${file.name}`,
            file_name: file.name,
            invoice_no: parsed.invoiceNo ?? null,
            line_count: parsed.lines.length,
          }
        } catch {
          parsed = parseLiquidation(workbook, { fileName: file.name })
          docType = 'costo'
          rows = parsed.lines
          document = {
            doc_type: 'costo',
            doc_key: `costo:${parsed.reference ?? file.name}`,
            file_name: file.name,
            invoice_no: parsed.reference ?? null,
            line_count: parsed.lines.length,
          }
        }
      }

      const seen = await onCheckImported(document.doc_key)
      if (seen) {
        setAlreadyImported(seen)
        return
      }

      const existing = await onListProducts()
      const plan = planImport({ docType, rows, existing, docDate })
      // A row the parser itself rejected is a failure with a reason, not a
      // silent absence.
      plan.failed = [...(plan.failed ?? []), ...(parsed.failures ?? [])]

      setState({ docType, parsed, plan, document, validation })
    } catch (err) {
      setError(t(`catalog.errors.${err.message}`, {}) || err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm({ plan: state.plan, document: state.document })
      onClose()
    } catch (err) {
      setError(err.message ?? t('catalog.errors.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  const validationFailed = state?.validation && !state.validation.ok

  /**
   * The partidas arancelarias the document carried, and how many lines each
   * classified.
   *
   * Counted from the rows as read, not from what the import will write: a line
   * skipped as a duplicate still told us its tariff code, and the point of this
   * figure is to say what the document contained.
   */
  const showsGravamen = (state?.plan.added ?? []).some((a) => a.fields.gravamen_pct != null)

  const tariffs = (() => {
    if (state?.docType !== 'liquidacion') return null
    const tally = new Map()
    for (const row of state.parsed.rows ?? []) {
      if (!row.arancel) continue
      tally.set(row.arancel, (tally.get(row.arancel) ?? 0) + 1)
    }
    const codes = [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const lines = codes.reduce((sum, [, n]) => sum + n, 0)
    const missing = (state.parsed.rows ?? []).length - lines
    return { codes, lines, missing }
  })()

  return (
    <Modal size="wide" title={t('catalog.import.title')} onClose={onClose}>
      {error && (
        <p role="alert" className="alert-error mb-4">
          {error}
        </p>
      )}

      {alreadyImported && (
        <div className="mb-4 flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-medium text-ink">{t('catalog.import.alreadyImported')}</p>
            <p className="hint mt-0.5">
              {t('catalog.import.alreadyImportedHint', {
                file: alreadyImported.file_name,
                key: alreadyImported.doc_key,
              })}
            </p>
          </div>
        </div>
      )}

      {!state ? (
        <div>
          <p className="text-[14px] leading-relaxed text-muted">{t('catalog.import.intro')}</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <FileSpreadsheet size={26} strokeWidth={1.5} />
            <span className="text-[14px] font-medium">
              {busy ? t('catalog.import.reading') : t('catalog.import.choose')}
            </span>
            <span className="text-[12px]">{t('catalog.import.chooseHint')}</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf,.xlsx"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      ) : (
        <div>
          <div className="rounded-xl border border-line bg-canvas p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label={t('catalog.import.willAdd')} value={state.plan.added.length} tone="text-success" />
              <Figure label={t('catalog.import.willUpdate')} value={state.plan.updated.length} />
              <Figure label={t('catalog.import.willSkip')} value={state.plan.skipped.length} tone="text-muted" />
              <Figure
                label={t('catalog.import.willFail')}
                value={state.plan.failed.length}
                tone={state.plan.failed.length ? 'text-danger' : 'text-muted'}
              />
            </div>
            <p className="hint mt-3">
              {t('catalog.import.readFrom', {
                type: t(docTypeKey(state.docType)),
                file: state.document.file_name,
              })}
              {state.document.exchange_rate && (
                <> · {t('catalog.import.rate', { rate: state.document.exchange_rate })}</>
              )}
            </p>
          </div>

          {tariffs && (
            <div className="mt-3 rounded-xl border border-line px-3.5 py-3">
              <p className="text-[13px] font-medium text-ink">
                {tCount('catalog.import.tariffCodes', tariffs.codes.length)}
              </p>
              <p className="hint mt-0.5">
                {t('catalog.import.tariffCodesHint', { lines: tariffs.lines })}
                {tariffs.missing > 0 && (
                  <> · {t('catalog.import.tariffCodesMissing', { count: tariffs.missing })}</>
                )}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tariffs.codes.map(([code, count]) => (
                  <span key={code} className="badge-neutral">
                    {code}
                    <span className="ml-1 text-muted">×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Validation gates. A failure here stops the import entirely. */}
          {state.validation && (
            <div
              className={`mt-3 rounded-xl border px-3.5 py-3 ${
                validationFailed ? 'border-danger/40 bg-danger/5' : 'border-line'
              }`}
            >
              <p className="text-[13px] font-medium text-ink">
                {validationFailed ? t('catalog.import.checksFailed') : t('catalog.import.checksPassed')}
              </p>
              {validationFailed && (
                <ul className="mt-2 space-y-1">
                  {state.validation.checks
                    .filter((c) => !c.ok)
                    .map((c) => (
                      <li key={c.id} className="text-[12px] text-danger">
                        {t(`catalog.checks.${c.id}`)}: {t('catalog.import.expectedActual', {
                          expected: c.expected,
                          actual: c.actual,
                        })}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {state.plan.conflicts.length > 0 && (
            <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3">
              <p className="text-[13px] font-medium text-ink">
                {t('catalog.import.conflicts', { count: state.plan.conflicts.length })}
              </p>
              <p className="hint mt-0.5">{t('catalog.import.conflictsHint')}</p>
              <ul className="mt-2 space-y-1">
                {state.plan.conflicts.slice(0, 10).map((c, i) => (
                  <li key={`${c.key}-${c.field}-${i}`} className="text-[12px] text-muted">
                    <span className="text-ink">{c.code}</span> · {t(`catalog.fields.${c.field}`)}:{' '}
                    {String(c.existing)} → {String(c.incoming)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.plan.failed.length > 0 && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3">
              <p className="text-[13px] font-medium text-ink">{t('catalog.import.failedRows')}</p>
              <ul className="mt-2 space-y-1">
                {state.plan.failed.map((f, i) => (
                  <li key={i} className="text-[12px] text-danger">
                    {t('catalog.import.rowNumber', { row: f.row ?? f.where })}: {t(`catalog.errors.${f.reason}`)}
                    {f.detail && ` (${f.detail})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.plan.added.length > 0 && (
            <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-3 py-2 font-medium">{t('catalog.fields.product_code')}</th>
                    <th className="px-3 py-2 font-medium">{t('catalog.fields.description')}</th>
                    <th className="px-3 py-2 font-medium">{t('catalog.fields.arancel')}</th>
                    {/* Only where the document actually supplies it. A
                        liquidación never does — the duty rate comes off the
                        cost sheet — and a column of em dashes says nothing. */}
                    {showsGravamen && (
                      <th className="px-3 py-2 text-right font-medium">
                        {t('catalog.fields.gravamen_pct')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {state.plan.added.map((a) => (
                    <tr key={a.key} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink">{a.fields.product_code}</td>
                      <td className="max-w-[20rem] truncate px-3 py-1.5 text-muted">
                        {a.fields.description ?? a.fields.description_es ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted">{a.fields.arancel ?? '—'}</td>
                      {showsGravamen && (
                        <td className="px-3 py-1.5 text-right text-ink">
                          {a.fields.gravamen_pct != null ? `${a.fields.gravamen_pct} %` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setState(null)} className="btn-secondary">
              {t('catalog.import.chooseAnother')}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || validationFailed}
              className="btn-primary"
            >
              <Upload size={16} strokeWidth={2} />
              {busy ? t('common.saving') : t('catalog.import.confirm')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
