import { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Plane, Upload } from 'lucide-react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
import { readWorkbook, isSupported as xlsxSupported } from '../../lib/xlsxReader'
import { readLiquidacion } from '../../lib/liquidacionPdf'
import { parseProforma } from '../../lib/proforma'
import { parseLiquidation } from '../../lib/liquidation'
import { parseCommercialInvoice } from '../../lib/commercialInvoice'
import { factoryLabel, matchFactoryByName } from '../../lib/factories'
import {
  detectDocType,
  docTypeKey,
  isoDate,
  planImport,
  validateLiquidacion,
} from '../../lib/catalog'

/**
 * The order reference a supplier's invoice block belongs to.
 *
 * The document says "PO.202603-77" and names the supplier in full at the top of
 * the page; we call that order "KLIK 77". So the reference is the supplier's
 * nickname and the PO's number -- which is what makes the products land in that
 * supplier's section, since the catalog works a product's supplier out from
 * this reference and nothing else.
 *
 * Null when the supplier has no nickname, because there would be nothing to
 * build the reference from and an invented one would not match the order.
 */
export const invoiceReference = (factory, orderNumber) => {
  const nickname = factory?.nickname?.trim()
  if (!nickname || orderNumber == null) return null
  return `${nickname.toUpperCase()} ${orderNumber}`
}

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

/** Several plans read as one, for the summary figures at the top. */
const mergePlans = (plans) => ({
  added: plans.flatMap((p) => p.added),
  updated: plans.flatMap((p) => p.updated),
  skipped: plans.flatMap((p) => p.skipped),
  failed: plans.flatMap((p) => p.failed ?? []),
  conflicts: plans.flatMap((p) => p.conflicts),
  uncoded: plans.flatMap((p) => p.uncoded ?? []),
})

function Figure({ label, value, tone = '' }) {
  return (
    <div>
      <p className="hint">{label}</p>
      <p className={`text-[17px] font-semibold ${tone || 'text-ink'}`}>{value}</p>
    </div>
  )
}

export default function CatalogImport({
  factories = [],
  onCheckImported,
  onListProducts,
  onConfirm,
  onClose,
}) {
  const { t, tCount } = useI18n()
  const input = useRef(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [state, setState] = useState(null) // { docType, parsed, plan, document, validation }
  const [alreadyImported, setAlreadyImported] = useState(null)
  // A commercial invoice is imported per order block, and the supplier it names
  // decides every block's reference -- so it is confirmed before anything runs.
  const [supplierId, setSupplierId] = useState('')
  // Whether this order has an air shipment. Deliberately three-valued: null is
  // "nobody has been asked yet", and the import waits for an answer, because a
  // line the invoice bills and the packing list omits is either flying or a
  // document contradicting itself and only a person can say which.
  const [airSection, setAirSection] = useState(null)

  /**
   * Plan a commercial invoice: one plan per order the file carries.
   *
   * The blocks are planned NEWEST FIRST, and each block's additions are fed
   * into the list the next block is planned against. Without that, a product
   * the invoice ships under two orders -- 3401-50 arrives under both 77 and 75
   * here -- would be planned as an insert twice and the second would collide on
   * the unique code. Newest first also means the older block finds the row
   * already there and is ranked older against it, which is the same answer it
   * would give if the two orders had been imported as separate files.
   */
  const planInvoice = async (invoice, file) => {
    const factory = matchFactoryByName(invoice.supplierName, factories)
    setSupplierId(factory?.id ?? '')

    const keys = invoice.blocks.map((b) => `invoice:${b.contractNo ?? file.name}`)
    for (const key of keys) {
      const seen = await onCheckImported(key)
      if (seen) {
        setAlreadyImported(seen)
        return null
      }
    }

    const existing = await onListProducts()
    return {
      docType: 'invoice',
      parsed: invoice,
      fileName: file.name,
      existing,
      factory,
      validation: null,
      ...planBlocks(invoice, factory, existing, file.name),
    }
  }

  /** The per-order plans, and the merged view of them the summary reads. */
  const planBlocks = (invoice, factory, existing, fileName) => {
    let known = existing
    const ordered = [...invoice.blocks].sort(
      (a, b) => (b.orderNumber ?? 0) - (a.orderNumber ?? 0),
    )

    const blocks = ordered.map((block) => {
      const reference = invoiceReference(factory, block.orderNumber)
      const plan = planImport({
        docType: 'invoice',
        rows: block.lines,
        existing: known,
        docDate: invoice.date,
        docRef: reference,
      })
      known = [
        ...known,
        ...plan.added.map((a) => ({ id: null, code_key: a.key, ...a.fields })),
      ]
      return {
        ...block,
        reference,
        plan,
        document: {
          doc_type: 'invoice',
          doc_key: `invoice:${block.contractNo ?? fileName}`,
          file_name: fileName,
          invoice_no: block.contractNo ?? null,
          doc_ref: reference,
          doc_date: invoice.date,
          line_count: block.lines.length,
        },
      }
    })

    return {
      blocks,
      plan: mergePlans(blocks.map((b) => b.plan)),
      document: blocks[0].document,
    }
  }

  /**
   * Re-plan against a different supplier.
   *
   * The supplier decides every block's reference, and the reference is what
   * files the products under an order -- so changing it has to redo the plans,
   * not just relabel them. Planned against the same snapshot of the catalog the
   * first pass used, so switching back and forth cannot drift.
   */
  const changeSupplier = (id) => {
    setSupplierId(id)
    setState((prev) => {
      if (!prev?.blocks) return prev
      const factory = factories.find((f) => f.id === id) ?? null
      return { ...prev, factory, ...planBlocks(prev.parsed, factory, prev.existing, prev.fileName) }
    })
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setAlreadyImported(null)
    setState(null)
    setAirSection(null)
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

        // A supplier's commercial invoice is tried first: it is the only one of
        // the three whose header names a "Code for Box", so it can be told
        // apart with certainty rather than by elimination.
        try {
          const invoice = parseCommercialInvoice(workbook, { fileName: file.name })
          setState(await planInvoice(invoice, file))
          return
        } catch (err) {
          if (err.message !== 'noInvoiceSheet' && err.message !== 'noInvoiceRows') throw err
        }

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
      if (state.blocks) {
        // One import record per order, so each block's products carry the
        // reference of the order they actually shipped on. Newest first, the
        // same order they were planned in.
        for (const block of state.blocks) {
          await onConfirm({ plan: block.plan, document: block.document })
        }
      } else {
        await onConfirm({ plan: state.plan, document: state.document })
      }
      onClose()
    } catch (err) {
      setError(err.message ?? t('catalog.errors.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  const validationFailed = state?.validation && !state.validation.ok

  /** Lines that are flying, or that the container is not carrying. */
  const flying = state?.parsed?.flying ?? []
  // An unanswered question is a blocked import, which is the point of asking.
  const awaitingAir = flying.length > 0 && airSection === null

  /**
   * The partidas arancelarias the document carried, and how many lines each
   * classified.
   *
   * Counted from the rows as read, not from what the import will write: a line
   * skipped as a duplicate still told us its tariff code, and the point of this
   * figure is to say what the document contained.
   */
  const showsGravamen = (state?.plan.added ?? []).some((a) => a.fields.gravamen_pct != null)
  // Same reasoning for the tariff code: a commercial invoice classifies
  // nothing, so the column would be forty-three em dashes.
  const showsArancel = (state?.plan.added ?? []).some((a) => a.fields.arancel)

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

          {/* Lines the container is not carrying, or that the supplier marked
              as flying. Nothing imports until this is answered: a line the
              invoice bills and the packing list omits is either an air
              shipment or a document that disagrees with itself. */}
          {flying.length > 0 && (
            <div
              className={`mt-3 rounded-xl border px-3.5 py-3 ${
                airSection === null ? 'border-warning/40 bg-warning/5' : 'border-line'
              }`}
            >
              <div className="flex gap-2.5">
                <Plane size={16} className="mt-0.5 flex-shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">
                    {tCount('catalog.import.airQuestion', flying.length)}
                  </p>
                  <p className="hint mt-0.5">{t('catalog.import.airQuestionHint')}</p>

                  <ul className="mt-2 space-y-1">
                    {flying.map((line) => (
                      <li key={`${line.orderNumber}-${line.product_code}`} className="text-[12px]">
                        <span className="font-medium text-ink">{line.product_code}</span>
                        <span className="ml-1.5 text-muted">
                          {line.onPackingList === false
                            ? t('catalog.import.airNotPacked')
                            : t('catalog.import.airNoted')}
                          {line.note && <> · “{line.note}”</>}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAirSection(true)}
                      className={airSection === true ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                    >
                      {t('catalog.import.airYes')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAirSection(false)}
                      className={airSection === false ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                    >
                      {t('catalog.import.airNo')}
                    </button>
                  </div>

                  {airSection === true && (
                    <p className="hint mt-2">{t('catalog.import.airYesHint')}</p>
                  )}
                  {airSection === false && (
                    <p className="mt-2 text-[12px] text-warning">{t('catalog.import.airNoHint')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Which supplier, and which orders. Both are read off the document,
              and both are shown before anything is written -- the reference
              built here is what files each product under its order, so a wrong
              supplier would put a whole shipment in the wrong section. */}
          {state.blocks && (
            <div className="mt-3 rounded-xl border border-line px-3.5 py-3">
              <label htmlFor="inv-supplier" className="label">
                {t('catalog.import.supplier')}
              </label>
              <select
                id="inv-supplier"
                value={supplierId}
                onChange={(e) => changeSupplier(e.target.value)}
                className="select text-[14px]"
              >
                <option value="">{t('catalog.import.supplierUnknown')}</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factoryLabel(factory)}
                  </option>
                ))}
              </select>
              <p className="hint mt-1.5">
                {t('catalog.import.supplierFrom', { name: state.parsed.supplierName ?? '—' })}
              </p>

              <p className="label mb-1 mt-3">
                {tCount('catalog.import.orderBlocks', state.blocks.length)}
              </p>
              <ul className="space-y-1">
                {state.blocks.map((block) => (
                  <li key={block.document.doc_key} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="font-medium text-ink">
                      {block.reference ?? t('catalog.import.noReference')}
                    </span>
                    <span className="text-muted">
                      {t('catalog.import.blockLines', {
                        count: block.lines.length,
                        contract: block.contractNo ?? '—',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              {state.blocks.some((b) => !b.reference) && (
                <p className="hint mt-2 text-warning">{t('catalog.import.noReferenceHint')}</p>
              )}
            </div>
          )}

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
                    {/* Only where the document actually supplies it. A
                        liquidación never supplies a duty rate — that comes off
                        the cost sheet — and an invoice supplies no tariff code
                        at all. A column of em dashes says nothing. */}
                    {showsArancel && (
                      <th className="px-3 py-2 font-medium">{t('catalog.fields.arancel')}</th>
                    )}
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
                        {a.fields.description ??
                          a.fields.description_es ??
                          a.fields.description_en ??
                          '—'}
                      </td>
                      {showsArancel && (
                        <td className="whitespace-nowrap px-3 py-1.5 text-muted">
                          {a.fields.arancel ?? '—'}
                        </td>
                      )}
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
              disabled={busy || validationFailed || awaitingAir}
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
