import { useState } from 'react'
import { useI18n } from '../../i18n'
import { CURRENCIES, ORDER_STATUSES, statusKey } from '../../lib/orders'
import { FOB_PORTS } from '../../lib/ports'
import OrderItemsEditor, { emptyItem } from './OrderItemsEditor'

const emptyOrder = {
  reference: '',
  factory_id: '',
  status: 'draft',
  currency: 'USD',
  fob_port: '',
  order_date: '',
  ready_date: '',
  etd: '',
  eta: '',
  container_no: '',
  bl_number: '',
  notes: '',
}

/** A date column is null in the database and '' in an <input type="date">. */
const asDateInput = (value) => value ?? ''

export default function OrderForm({ initialValues, factories, onSubmit, onCancel, submitting }) {
  const { t } = useI18n()

  const [values, setValues] = useState(() => {
    const merged = { ...emptyOrder, ...initialValues }
    return {
      ...merged,
      factory_id: merged.factory_id ?? '',
      fob_port: merged.fob_port ?? '',
      order_date: asDateInput(merged.order_date),
      ready_date: asDateInput(merged.ready_date),
      etd: asDateInput(merged.etd),
      eta: asDateInput(merged.eta),
      container_no: merged.container_no ?? '',
      bl_number: merged.bl_number ?? '',
      notes: merged.notes ?? '',
    }
  })

  const [items, setItems] = useState(() => {
    const existing = initialValues?.order_items ?? []
    if (existing.length === 0) return [emptyItem()]
    return existing.map((item) => ({
      product: item.product ?? '',
      quantity: item.quantity ?? '',
      unit: item.unit ?? 'pcs',
      unit_price: item.unit_price ?? '',
    }))
  })

  const [formError, setFormError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setFormError('')

    if (!values.reference.trim()) {
      setFormError(t('orders.referenceRequired'))
      return
    }
    // Dates are compared as ISO strings, which sort correctly without parsing.
    if (values.order_date && values.ready_date && values.ready_date < values.order_date) {
      setFormError(t('orders.readyBeforeOrder'))
      return
    }
    if (values.etd && values.eta && values.eta < values.etd) {
      setFormError(t('orders.etaBeforeEtd'))
      return
    }

    onSubmit(values, items)
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

  const select = (name, labelKey, children) => (
    <div>
      <label htmlFor={name} className="label">
        {t(labelKey)}
      </label>
      <select
        id={name}
        name={name}
        value={values[name]}
        onChange={handleChange}
        className="select text-[14px]"
      >
        {children}
      </select>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="alert-error">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {field('reference', 'orders.reference', {
          required: true,
          autoFocus: true,
          placeholder: t('orders.referencePlaceholder'),
        })}
        {select(
          'factory_id',
          'orders.factory',
          <>
            <option value="">{t('orders.noFactory')}</option>
            {factories.map((factory) => (
              <option key={factory.id} value={factory.id}>
                {factory.name}
              </option>
            ))}
          </>,
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {select(
          'status',
          'orders.statusLabel',
          ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(statusKey(status))}
            </option>
          )),
        )}
        {select(
          'currency',
          'orders.currency',
          CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          )),
        )}
      </div>

      <OrderItemsEditor items={items} onChange={setItems} currency={values.currency} />

      <div className="border-t border-line pt-4">
        <p className="section-title mb-3">{t('orders.shippingTitle')}</p>

        <div className="space-y-4">
          {select(
            'fob_port',
            'orders.fobPort',
            <>
              <option value="">{t('orders.noPort')}</option>
              {FOB_PORTS.map((port) => (
                <option key={port.id} value={port.id}>
                  {t('ports.namedPort', { name: port.name })}
                </option>
              ))}
            </>,
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {field('order_date', 'orders.orderDate', { type: 'date' })}
            {field('ready_date', 'orders.readyDate', { type: 'date' })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field('etd', 'orders.etd', { type: 'date' })}
            {field('eta', 'orders.eta', { type: 'date' })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {field('container_no', 'orders.containerNo')}
            {field('bl_number', 'orders.blNumber')}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className="label">
          {t('orders.notes')}
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
