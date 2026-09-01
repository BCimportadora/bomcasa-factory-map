import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
import ConfirmDialog from '../common/ConfirmDialog'
import { CURRENCY_OF, codeKey, isInternalUse, lastSeenOrder } from '../../lib/catalog'

/**
 * Correcting one product by hand.
 *
 * Everything is editable, including the fields an import fills. An import only
 * yields to a document newer than the one that set a value, so a figure a sheet
 * got wrong stays wrong until somebody corrects it here.
 *
 * The money fields and the duty rate are grouped together because they share a
 * source: all four come from our own cost sheet, not from the liquidación or
 * the proforma.
 */
const TEXT_FIELDS = [
  'product_code',
  'description',
  'arancel',
  'barcode',
  'supplier_code',
  'model',
  'description_en',
  'description_es',
]
const NUMBER_FIELDS = [
  'fob_usd',
  'gravamen_pct',
  'unit_price_dop',
  'precio_lista',
  'cbm_unit',
  'units_per_box',
]

export default function ProductEditor({ product, onSave, onDelete, canDelete = false, onClose }) {
  const { t, tCount } = useI18n()
  const [values, setValues] = useState(() => {
    const initial = {}
    for (const f of [...TEXT_FIELDS, ...NUMBER_FIELDS]) initial[f] = product[f] ?? ''
    return initial
  })
  // Read through isInternalUse rather than off the column, so a row imported
  // before that column existed shows the box already ticked.
  const [internalUse, setInternalUse] = useState(() => isInternalUse(product))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Every problem with the form at once, keyed by the field it belongs to.
  // Validating to the FIRST failure and stopping meant a row with a bad code
  // and two unparseable numbers was corrected in three round trips, each one
  // revealing the next problem.
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const handleDelete = async () => {
    setBusy(true)
    setError('')
    try {
      await onDelete(product.id)
      onClose()
    } catch (err) {
      setConfirmingDelete(false)
      setError(err.message ?? t('catalog.edit.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const set = (field) => (event) => {
    setValues((v) => ({ ...v, [field]: event.target.value }))
    // Clear this field's complaint as soon as it is touched; leaving it under
    // a box somebody is actively fixing reads as though it is still wrong.
    setFieldErrors((e) => (e[field] ? { ...e, [field]: undefined } : e))
  }

  /** Every problem with the values as they stand. Empty means good to save. */
  const validate = () => {
    const problems = {}

    const code = values.product_code.trim()
    if (!code) problems.product_code = t('catalog.edit.codeRequired')
    else if (!codeKey(code)) problems.product_code = t('catalog.edit.codeNeedsDigits')

    const barcode = values.barcode.replace(/\D/g, '')
    if (values.barcode.trim() && barcode.length !== 13) {
      problems.barcode = t('catalog.edit.barcodeLength')
    }

    for (const f of NUMBER_FIELDS) {
      const raw = values[f].toString().trim()
      if (raw !== '' && !Number.isFinite(Number(raw))) {
        problems[f] = t('catalog.edit.notANumber', { field: t(`catalog.fields.${f}`) })
      }
    }

    return problems
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const problems = validate()
    setFieldErrors(problems)
    if (Object.keys(problems).length > 0) return

    const barcode = values.barcode.replace(/\D/g, '')
    const payload = {}
    for (const f of TEXT_FIELDS) payload[f] = values[f].toString().trim() || null
    if (payload.barcode) payload.barcode = barcode
    for (const f of NUMBER_FIELDS) {
      const raw = values[f].toString().trim()
      // Kept as a string so the decimal reaches Postgres exactly as typed.
      payload[f] = raw === '' ? null : raw
    }

    // Ticking the box is a statement that this is never sold, so the list price
    // goes with it rather than being left behind to contradict the badge.
    payload.internal_use = internalUse
    if (internalUse) payload.precio_lista = null

    setBusy(true)
    try {
      await onSave(product.id, payload)
      onClose()
    } catch (err) {
      setError(err.message ?? t('catalog.edit.saveError'))
    } finally {
      setBusy(false)
    }
  }

  const field = (name, type = 'text') => {
    const problem = fieldErrors[name]
    return (
      <div>
        <label htmlFor={`cat-${name}`} className="label">
          {t(`catalog.fields.${name}`)}
          {CURRENCY_OF[name] && <span className="ml-1 text-muted">({CURRENCY_OF[name]})</span>}
        </label>
        <input
          id={`cat-${name}`}
          type={type}
          inputMode={type === 'text' ? undefined : 'decimal'}
          value={values[name]}
          onChange={set(name)}
          aria-invalid={Boolean(problem)}
          aria-describedby={problem ? `cat-${name}-error` : undefined}
          className={`input ${problem ? 'input-error' : ''}`}
          autoComplete="off"
        />
        {problem && (
          <p id={`cat-${name}-error`} className="mt-1.5 text-[13px] text-danger">
            {problem}
          </p>
        )}
      </div>
    )
  }

  // The summary only earns its place when there is more than one thing wrong:
  // with a single error the message under its own box says it better, and a
  // banner repeating it is noise.
  const listed = Object.entries(fieldErrors).filter(([, message]) => message)

  return (
    <Modal size="wide" title={product.product_code || product.description || t('catalog.noCode')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <p role="alert" className="alert-error mb-4">
            {error}
          </p>
        )}

        {listed.length > 1 && (
          <div role="alert" className="alert-error mb-4">
            <p className="font-medium">{tCount('catalog.edit.problems', listed.length)}</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {listed.map(([name, message]) => (
                <li key={name}>
                  <span className="font-medium">{t(`catalog.fields.${name}`)}</span>: {message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field('product_code')}
          {field('barcode')}
        </div>

        <div className="mt-4">{field('description')}</div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {field('arancel')}
          {field('supplier_code')}
          {field('model')}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field('description_en')}
          {field('description_es')}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="label mb-0">{t('catalog.edit.packing')}</p>
          <p className="hint mb-3">{t('catalog.edit.packingHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('cbm_unit')}
            {field('units_per_box')}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <p className="label mb-0">{t('catalog.edit.costSheet')}</p>
          <p className="hint mb-3">{t('catalog.edit.costSheetHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('fob_usd')}
            {field('gravamen_pct')}
            {field('unit_price_dop')}
            {field('precio_lista')}
          </div>

          <label htmlFor="cat-internal_use" className="mt-4 flex items-start gap-2.5">
            <input
              id="cat-internal_use"
              type="checkbox"
              checked={internalUse}
              onChange={(e) => setInternalUse(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-accent"
            />
            <span>
              <span className="block text-[14px] text-ink">{t('catalog.fields.internal_use')}</span>
              <span className="hint">{t('catalog.edit.internalUseHint')}</span>
            </span>
          </label>
        </div>

        {/* Where this product's values came from. Read-only: it is a record of
            what the imports did, not something to type over. */}
        {(product.doc_ref || product.cost_ref || product.doc_date || product.cost_date) && (
          <div className="mt-5 rounded-xl border border-line bg-canvas px-3.5 py-3">
            <p className="label mb-1">{t('catalog.edit.provenance')}</p>
            <dl className="grid gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('catalog.edit.lastSeen')}</dt>
                <dd className="text-ink">{lastSeenOrder(product) || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('catalog.edit.tariffFrom')}</dt>
                <dd className="text-ink">{product.doc_ref || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('catalog.edit.pricedFrom')}</dt>
                <dd className="text-ink">{product.cost_ref || '—'}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              className="btn-ghost mr-auto hover:text-danger"
            >
              <Trash2 size={15} strokeWidth={2} />
              {t('catalog.edit.delete')}
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>

      {confirmingDelete && (
        <ConfirmDialog
          title={t('catalog.edit.deleteTitle')}
          message={t('catalog.edit.deleteMessage')}
          subject={[product.product_code, product.description || product.description_es]
            .filter(Boolean)
            .join(' · ')}
          confirmLabel={t('catalog.edit.delete')}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => !busy && setConfirmingDelete(false)}
        />
      )}
    </Modal>
  )
}
