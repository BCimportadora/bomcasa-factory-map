import { useState } from 'react'

const emptyFactory = {
  name: '',
  address: '',
  city: '',
  province: '',
  latitude: '',
  longitude: '',
  contact_person: '',
  phone: '',
  products: '',
  capacity: '',
  notes: '',
}

export default function FactoryForm({ initialValues, onSubmit, onCancel, submitting }) {
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
      setFormError('Name is required.')
      return
    }
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      setFormError('Latitude must be a number between -90 and 90.')
      return
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      setFormError('Longitude must be a number between -180 and 180.')
      return
    }
    onSubmit({ ...values, latitude: lat, longitude: lng })
  }

  const field = (label, name, props = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        name={name}
        value={values[name]}
        onChange={handleChange}
        className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        {...props}
      />
    </label>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {formError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
      {field('Factory name *', 'name', { required: true })}
      {field('Address', 'address')}
      <div className="grid grid-cols-2 gap-3">
        {field('City', 'city')}
        {field('Province', 'province')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Latitude *', 'latitude', { required: true, inputMode: 'decimal' })}
        {field('Longitude *', 'longitude', { required: true, inputMode: 'decimal' })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('Contact person', 'contact_person')}
        {field('Phone', 'phone')}
      </div>
      {field('Products', 'products')}
      {field('Capacity', 'capacity')}
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">Notes</span>
        <textarea
          name="notes"
          value={values.notes}
          onChange={handleChange}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded px-4 py-2 text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save factory'}
        </button>
      </div>
    </form>
  )
}
