import { useState } from 'react'
import { useI18n } from '../../i18n'
import { CURRENCIES, INNOVATION_LABELS, labelKey } from '../../lib/innovations'
import { fullName } from '../../lib/constants'
import ImageUploader from './ImageUploader'
import VariationsEditor, { emptyQuote } from './VariationsEditor'

const emptyInnovation = {
  name: '',
  label: 'need_to_present',
  assigned_to: '',
  local_price: '',
  local_currency: 'USD',
  local_price_notes: '',
  fob_price: '',
  fob_currency: 'USD',
  planned_units: '',
  notes: '',
}

/**
 * Existing rows are seeded with `key` set to their id, so that saved and
 * unsaved variations can be addressed the same way while the form is open.
 */
const seedVariations = (innovation) =>
  (innovation?.innovation_variations ?? []).map((variation) => ({
    id: variation.id,
    key: variation.id,
    name: variation.name ?? '',
    notes: variation.notes ?? '',
  }))

const seedQuotes = (innovation) =>
  (innovation?.innovation_quotes ?? []).map((quote) => ({
    ...emptyQuote(),
    id: quote.id,
    variation_key: quote.variation_id ?? null,
    factory_id: quote.factory_id ?? '',
    safety: quote.safety ?? 'unknown',
    quoted_price: quote.quoted_price ?? '',
    currency: quote.currency ?? 'USD',
    notes: quote.notes ?? '',
  }))

export default function InnovationForm({
  initialValues,
  factories,
  profiles,
  showOrderPlan = false,
  onSubmit,
  onCancel,
  onAddImages,
  onRemoveImage,
  submitting,
}) {
  const { t } = useI18n()

  const [values, setValues] = useState(() => {
    const merged = { ...emptyInnovation, ...initialValues }
    return Object.fromEntries(
      Object.keys(emptyInnovation).map((k) => [k, merged[k] ?? emptyInnovation[k]]),
    )
  })
  const [variations, setVariations] = useState(() => seedVariations(initialValues))
  const [quotes, setQuotes] = useState(() => seedQuotes(initialValues))
  const [formError, setFormError] = useState('')

  // Images are uploaded immediately, so they only exist for a saved item.
  const isNew = !initialValues?.id

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')
    if (!values.name.trim()) {
      setFormError(t('innovations.nameRequired'))
      return
    }
    onSubmit(values, variations, quotes)
  }

  const field = (name, labelText, props = {}) => (
    <div>
      <label htmlFor={name} className="label">
        {labelText}
      </label>
      <input
        id={name}
        name={name}
        value={values[name]}
        onChange={handleChange}
        className="input text-[14px]"
        {...props}
      />
    </div>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="alert-error">
          {formError}
        </p>
      )}

      {field('name', t('innovations.name'), { required: true, autoFocus: true })}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="label" className="label">
            {t('innovations.labelField')}
          </label>
          <select
            id="label"
            name="label"
            value={values.label}
            onChange={handleChange}
            className="select text-[14px]"
          >
            {INNOVATION_LABELS.map((label) => (
              <option key={label} value={label}>
                {t(labelKey(label))}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="assigned_to" className="label">
            {t('innovations.assignedTo')}
          </label>
          <select
            id="assigned_to"
            name="assigned_to"
            value={values.assigned_to ?? ''}
            onChange={handleChange}
            className="select text-[14px]"
          >
            <option value="">{t('innovations.nobodyAssigned')}</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {fullName(profile) || profile.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Local price: what the product sells for here, which is the number the
          quotes are ultimately judged against. */}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        {field('local_price', t('innovations.localPrice'), { inputMode: 'decimal' })}
        <div>
          <label htmlFor="local_currency" className="label">
            {t('innovations.currency')}
          </label>
          <select
            id="local_currency"
            name="local_currency"
            value={values.local_currency}
            onChange={handleChange}
            className="select text-[14px] sm:w-28"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>
      {field('local_price_notes', t('innovations.localPriceNotes'), {
        placeholder: t('innovations.localPriceNotesPlaceholder'),
      })}

      {isNew ? (
        <p className="rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13px] text-muted">
          {t('innovations.imagesAfterSave')}
        </p>
      ) : (
        <ImageUploader
          images={initialValues.innovation_images ?? []}
          onAdd={onAddImages}
          onRemove={onRemoveImage}
        />
      )}

      <div className="border-t border-line pt-4">
        <VariationsEditor
          variations={variations}
          quotes={quotes}
          factories={factories}
          onVariations={setVariations}
          onQuotes={setQuotes}
        />
      </div>

      {showOrderPlan && (
        <div className="border-t border-line pt-4">
          <p className="section-title mb-3">{t('innovations.orderPlan')}</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            {field('fob_price', t('innovations.fobPrice'), { inputMode: 'decimal' })}
            <div>
              <label htmlFor="fob_currency" className="label">
                {t('innovations.currency')}
              </label>
              <select
                id="fob_currency"
                name="fob_currency"
                value={values.fob_currency}
                onChange={handleChange}
                className="select text-[14px] sm:w-28"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            {field('planned_units', t('innovations.plannedUnits'), { inputMode: 'numeric' })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="notes" className="label">
          {t('innovations.notes')}
        </label>
        <textarea
          id="notes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          rows={3}
          className="textarea text-[14px]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
