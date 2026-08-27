import { useState } from 'react'
import { useI18n } from '../../i18n'
import { LOCATION_TYPES, locationTypeKey } from '../../lib/constants'

/**
 * Deliberately loose. The point is to catch a typed mistake, not to police what
 * counts as an address — a supplier contact that the form refuses to save is a
 * worse outcome than a slightly odd one that does.
 */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emptyFactory = {
  name: '',
  nickname: '',
  address: '',
  city: '',
  province: '',
  latitude: '',
  longitude: '',
  location_type: 'factory',
  contact_person: '',
  phone: '',
  email: '',
  products: '',
  capacity: '',
  notes: '',
}

export default function FactoryForm({ initialValues, onSubmit, onCancel, submitting }) {
  const { t } = useI18n()
  const [values, setValues] = useState({ ...emptyFactory, ...initialValues })
  const [formError, setFormError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')
    const lat = parseFloat(values.latitude)
    const lng = parseFloat(values.longitude)

    if (!values.name.trim()) {
      setFormError(t('factories.nameRequired'))
      return
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setFormError(t('factories.latitudeInvalid'))
      return
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      setFormError(t('factories.longitudeInvalid'))
      return
    }
    if (values.email.trim() && !LOOKS_LIKE_EMAIL.test(values.email.trim())) {
      setFormError(t('factories.emailInvalid'))
      return
    }
    onSubmit({ ...values, latitude: lat, longitude: lng })
  }

  const field = (name, labelKey, props = {}) => (
    <div>
      <label htmlFor={name} className="label">
        {t(labelKey)}
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

      {field('name', 'factories.name', { required: true, autoFocus: true })}

      <div>
        {field('nickname', 'factories.nickname')}
        <p className="mt-1.5 hint">{t('factories.nicknameHint')}</p>
      </div>

      {field('address', 'factories.address')}

      <div className="grid gap-4 sm:grid-cols-2">
        {field('city', 'factories.city')}
        {field('province', 'factories.province')}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {field('latitude', 'factories.latitude', { required: true, inputMode: 'decimal' })}
        {field('longitude', 'factories.longitude', { required: true, inputMode: 'decimal' })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {field('contact_person', 'factories.contactPerson')}
        {field('phone', 'factories.phone', { type: 'tel' })}
      </div>

      {field('email', 'factories.email', { type: 'email', inputMode: 'email' })}

      <div>
        <label htmlFor="location_type" className="label">
          {t('factories.locationType')}
        </label>
        <select
          id="location_type"
          name="location_type"
          value={values.location_type}
          onChange={handleChange}
          className="select text-[14px]"
        >
          {LOCATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(locationTypeKey(type))}
            </option>
          ))}
        </select>
        <p className="mt-1.5 hint">{t('factories.locationTypeHint')}</p>
      </div>

      {field('products', 'factories.products')}
      {field('capacity', 'factories.capacity')}

      <div>
        <label htmlFor="notes" className="label">
          {t('factories.notes')}
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
