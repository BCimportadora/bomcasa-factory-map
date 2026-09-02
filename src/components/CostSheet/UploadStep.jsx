import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { formatBytes } from '../../lib/orderFiles'

/**
 * The two documents a conversion can be built from, each in its own slot.
 *
 * Labelled slots rather than one "add files" box, because which document is
 * which decides what is read out of it: the cost sheet supplies the quantities
 * and the money, the supplier's invoice supplies the tariff codes and the
 * descriptions. A file dropped in the wrong slot would be read for figures it
 * does not carry, and the readiness summary would then report a dozen things
 * missing for no reason a person could see.
 *
 * Only the cost sheet is required. The invoice is offered because it makes the
 * result fuller, and its absence is reported rather than silently accepted.
 */
function Slot({ id, file, onPick, onClear, required, hint }) {
  const { t } = useI18n()
  const input = useRef(null)
  const [over, setOver] = useState(false)

  const take = (list) => {
    const picked = [...(list ?? [])][0]
    if (picked) onPick(picked)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        take(event.dataTransfer?.files)
      }}
      className={`rounded-xl border-2 border-dashed p-5 transition-colors
        ${over ? 'border-accent bg-accent/5' : file ? 'border-line bg-canvas' : 'border-line'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">
            {t(`costSheet.upload.${id}.title`)}
            {required && <span className="ml-1 text-danger">*</span>}
          </p>
          <p className="hint mt-0.5">{hint}</p>
        </div>
        {file && (
          <button
            type="button"
            onClick={onClear}
            className="btn-ghost btn-sm flex-shrink-0"
            aria-label={t('costSheet.upload.remove')}
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      {file ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-ink">
          <FileSpreadsheet size={16} strokeWidth={2} className="flex-shrink-0 text-accent" />
          <span className="min-w-0 truncate">{file.name}</span>
          <span className="flex-shrink-0 text-muted">{formatBytes(file.size)}</span>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="btn-secondary btn-sm mt-3">
          <Upload size={14} strokeWidth={2} />
          {t('costSheet.upload.choose')}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept=".xlsx"
        className="sr-only"
        onChange={(event) => {
          take(event.target.files)
          // Cleared so picking the SAME file again still fires a change event,
          // which is what somebody does after correcting the file on disk.
          event.target.value = ''
        }}
      />
    </div>
  )
}

export default function UploadStep({ costFile, invoiceFile, onPick, onClear, onRead, busy, error }) {
  const { t } = useI18n()

  return (
    <div className="card card-pad">
      <h2 className="section-title">{t('costSheet.upload.title')}</h2>
      <p className="hint mt-1">{t('costSheet.upload.body')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Slot
          id="cost"
          file={costFile}
          required
          hint={t('costSheet.upload.cost.hint')}
          onPick={(file) => onPick('cost', file)}
          onClear={() => onClear('cost')}
        />
        <Slot
          id="invoice"
          file={invoiceFile}
          hint={t('costSheet.upload.invoice.hint')}
          onPick={(file) => onPick('invoice', file)}
          onClear={() => onClear('invoice')}
        />
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">{error}</p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={onRead} disabled={!costFile || busy} className="btn-primary">
          {busy ? t('costSheet.upload.reading') : t('costSheet.upload.read')}
        </button>
        {!invoiceFile && costFile && <p className="hint">{t('costSheet.upload.invoiceMissingHint')}</p>}
      </div>
    </div>
  )
}
