import { useState } from 'react'
import { useI18n } from '../../i18n'
import Modal from '../common/Modal'
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

export default function ProductEditor({ product, onSave, onClose }) {
  const { t } = useI18n()
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

  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const code = values.product_code.trim()
    if (!code) return setError(t('catalog.edit.codeRequired'))
    if (!codeKey(code)) return setError(t('catalog.edit.codeNeedsDigits'))

    const barcode = values.barcode.replace(/\D/g, '')
    if (values.barcode.trim() && barcode.length !== 13) {
      return setError(t('catalog.edit.barcodeLength'))
    }

    const payload = {}
    for (const f of TEXT_FIELDS) payload[f] = values[f].toString().trim() || null
    if (payload.barcode) payload.barcode = barcode
    for (const f of NUMBER_FIELDS) {
      const raw = values[f].toString().trim()
      if (raw === '') {
        payload[f] = null
      } else if (Number.isFinite(Number(raw))) {
        // Kept as a string so the decimal reaches Postgres exactly as typed.
        payload[f] = raw
      } else {
        return setError(t('catalog.edit.notANumber', { field: t(`catalog.fields.${f}`) }))
      }
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

  const field = (name, type = 'text') => (
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
        className="input"
        autoComplete="off"
      />
    </div>
  )

  return (
    <Modal size="wide" title={product.product_code || product.description || t('catalog.noCode')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && (
          <p role="alert" className="alert-error mb-4">
            {error}
          </p>
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

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
