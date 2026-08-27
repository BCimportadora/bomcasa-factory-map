import { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Library, Paperclip, Upload } from 'lucide-react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
import { readWorkbook, isSupported } from '../../lib/xlsxReader'
import { parseLiquidation, normalise } from '../../lib/liquidation'
import { formatMoney } from '../../lib/orders'

/**
 * Guess which factory a liquidation belongs to from its reference.
 *
 * The sheets are named after the supplier and a sequence number -- "MILAN 11"
 * for Shanghai Milanlux -- so the alphabetic part is matched against the factory
 * list. It is only a default: the preview lets it be changed before anything is
 * written, because a wrong guess here would attach a container to the wrong
 * supplier.
 */
export const guessFactory = (reference, factories) => {
  const word = normalise(reference).replace(/[0-9]+/g, '').trim()
  if (word.length < 3) return null
  return factories.find((factory) => normalise(factory.name).includes(word)) ?? null
}

/** Match an existing order by reference, so a re-import updates rather than duplicates. */
export const matchOrder = (reference, orders) => {
  const key = normalise(reference)
  return orders.find((order) => normalise(order.reference) === key) ?? null
}

function Figure({ label, value, strong = false }) {
  return (
    <div>
      <p className="hint">{label}</p>
      <p className={strong ? 'text-[17px] font-semibold text-ink' : 'text-[14px] text-ink'}>{value}</p>
    </div>
  )
}

export default function LiquidationImport({ orders, factories, onImport, onClose }) {
  const { t, language } = useI18n()
  const input = useRef(null)

  const [parsed, setParsed] = useState(null)
  // Held so the sheet itself can be filed against the order it creates, not
  // just its name. Reading the workbook does not consume the File.
  const [source, setSource] = useState(null)
  const [factoryId, setFactoryId] = useState('')
  const [targetOrderId, setTargetOrderId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fileWarning, setFileWarning] = useState('')
  const [catalogNote, setCatalogNote] = useState(null)

  const supported = isSupported()

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked again after an error
    if (!file) return

    setError('')
    setBusy(true)
    try {
      const workbook = await readWorkbook(file)
      const result = parseLiquidation(workbook, { fileName: file.name })
      setParsed(result)
      setSource(file)
      setFactoryId(guessFactory(result.reference, factories)?.id ?? '')
      setTargetOrderId(matchOrder(result.reference, orders)?.id ?? '')
    } catch (err) {
      setError(err.message ?? t('liquidation.readError'))
      setParsed(null)
      setSource(null)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    setFileWarning('')
    try {
      const result = await onImport(parsed, {
        orderId: targetOrderId || null,
        factoryId: factoryId || null,
        file: source,
      })
      // The costs are in either way. If only the sheet failed to file, or the
      // catalog could not be updated, say so and stay open -- closing on a
      // warning nobody read would leave someone believing it all went through.
      if (result?.catalog) setCatalogNote(result.catalog)
      if (result?.fileError) {
        setFileWarning(t('liquidation.fileNotStored'))
        return
      }
      if (result?.catalog?.error) return
      onClose()
    } catch (err) {
      setError(err.message ?? t('liquidation.importError'))
    } finally {
      setBusy(false)
    }
  }

  const totalWarnings = (parsed?.warnings ?? []).filter((w) => w.startsWith('total:'))

  return (
    <Modal size="wide" title={t('liquidation.title')} onClose={onClose}>
      {!supported && (
        <p className="alert-error mb-4">{t('liquidation.unsupportedBrowser')}</p>
      )}

      {error && (
        <p role="alert" className="alert-error mb-4">
          {error}
        </p>
      )}

      {catalogNote && !catalogNote.error && (
        <div role="status" className="mb-4 flex gap-2.5 rounded-xl border border-line px-3.5 py-3">
          <Library size={16} className="mt-0.5 flex-shrink-0 text-muted" />
          <div>
            <p className="text-[13px] font-medium text-ink">{t('liquidation.catalogUpdated')}</p>
            <p className="hint mt-0.5">
              {catalogNote.skipped === 'alreadyImported'
                ? t('liquidation.catalogAlready')
                : t('liquidation.catalogCounts', {
                    added: catalogNote.added,
                    updated: catalogNote.updated,
                    skipped: catalogNote.skipped,
                  })}
            </p>
          </div>
        </div>
      )}

      {catalogNote?.error && (
        <div role="alert" className="mb-4 flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-medium text-ink">{t('liquidation.catalogFailed')}</p>
            <p className="hint mt-0.5">{t('liquidation.catalogFailedHint')}</p>
          </div>
        </div>
      )}

      {fileWarning && (
        <div
          role="alert"
          className="mb-4 flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warning" />
          <div>
            <p className="text-[13px] font-medium text-ink">{fileWarning}</p>
            <p className="hint mt-0.5">{t('liquidation.fileNotStoredHint')}</p>
          </div>
        </div>
      )}

      {!parsed ? (
        <div>
          <p className="text-[14px] leading-relaxed text-muted">{t('liquidation.intro')}</p>

          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy || !supported}
            className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <FileSpreadsheet size={26} strokeWidth={1.5} />
            <span className="text-[14px] font-medium">
              {busy ? t('liquidation.reading') : t('liquidation.choose')}
            </span>
            <span className="text-[12px]">{t('liquidation.chooseHint')}</span>
          </button>

          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      ) : (
        <div>
          {/* Nothing has been written yet: this is the last look before it is. */}
          <div className="rounded-xl border border-line bg-canvas p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label={t('liquidation.reference')} value={parsed.reference ?? '—'} strong />
              <Figure label={t('liquidation.lines')} value={parsed.lines.length} strong />
              <Figure
                label={t('liquidation.fobTotal')}
                value={formatMoney(parsed.totals.fob_total ?? 0, 'USD', language)}
                strong
              />
              <Figure
                label={t('liquidation.landedTotal')}
                value={formatMoney(parsed.totals.landed_total ?? 0, 'DOP', language)}
                strong
              />
            </div>
            <p className="hint mt-3">
              {t('liquidation.readFrom', { sheet: parsed.sheetName, file: parsed.fileName })}
            </p>
            {source && (
              <p className="hint mt-1 flex items-center gap-1.5">
                <Paperclip size={11} strokeWidth={2} />
                {t('liquidation.willFile')}
              </p>
            )}
          </div>

          {totalWarnings.length > 0 && (
            <div className="mt-3 flex gap-2.5 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-3">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-warning" />
              <div>
                <p className="text-[13px] font-medium text-ink">{t('liquidation.totalsDisagree')}</p>
                <p className="hint mt-0.5">{t('liquidation.totalsDisagreeHint')}</p>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="liq-factory" className="label">
                {t('orders.factory')}
              </label>
              <select
                id="liq-factory"
                value={factoryId}
                onChange={(e) => setFactoryId(e.target.value)}
                className="select text-[14px]"
              >
                <option value="">{t('orders.noFactory')}</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="liq-order" className="label">
                {t('liquidation.target')}
              </label>
              <select
                id="liq-order"
                value={targetOrderId}
                onChange={(e) => setTargetOrderId(e.target.value)}
                className="select text-[14px]"
              >
                <option value="">{t('liquidation.createNew')}</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.reference}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 hint">
                {targetOrderId ? t('liquidation.willReplace') : t('liquidation.willCreate')}
              </p>
            </div>
          </div>

          <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-line">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-2 font-medium">{t('liquidation.code')}</th>
                  <th className="px-3 py-2 font-medium">{t('orders.items.product')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('liquidation.units')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('liquidation.unitCost')}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.lines.map((line) => (
                  <tr key={line.product_code} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink">{line.product_code}</td>
                    <td className="max-w-[16rem] truncate px-3 py-1.5 text-muted">
                      {line.description}
                    </td>
                    <td className="px-3 py-1.5 text-right text-ink">{line.units ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-ink">
                      {line.landed_unit_cost != null
                        ? formatMoney(line.landed_unit_cost, 'DOP', language)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            {/* Once the costs are in, importing again achieves nothing — the
                only thing left to do is close and, if wanted, attach the sheet
                by hand from the order's files. */}
            {fileWarning || catalogNote ? (
              <button type="button" onClick={onClose} className="btn-primary">
                {t('common.close')}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setParsed(null)} className="btn-secondary">
                  {t('liquidation.chooseAnother')}
                </button>
                <button type="button" onClick={handleConfirm} disabled={busy} className="btn-primary">
                  <Upload size={16} strokeWidth={2} />
                  {busy ? t('common.saving') : t('liquidation.confirm')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
