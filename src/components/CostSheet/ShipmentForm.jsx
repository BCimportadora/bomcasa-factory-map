import { useI18n } from '../../i18n'
import { EXPENSE_KEYS } from '../../lib/costSheetSource'
import { ITBIS_BASES, GRAVAMEN_SOURCES, CURRENCIES } from '../../lib/costSheetModel'
import SourceTag from './SourceTag'

/**
 * Stage two: everything the sheet needs stated, with its provenance beside it.
 *
 * Two rules run through this form.
 *
 * A field that could not be prefilled is MARKED, not silently left empty --
 * blank and blank-because-nobody-knows look identical otherwise, and the second
 * is the one that puts an invented figure into a customs document.
 *
 * The four controls at the bottom are choices the sample files cannot settle.
 * Each is defaulted, visible and changeable, and each says what it moves. They
 * are the only sanctioned defaults in this whole section; everything else is
 * either read from a document or typed by a person.
 */

function Field({ id, label, value, onChange, source, missing, edited, suffix, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {missing && <span className="ml-1 text-danger">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={type}
          inputMode={type === 'text' ? 'decimal' : undefined}
          className={`input ${missing ? 'input-error' : ''}`}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="flex-shrink-0 text-[13px] text-muted">{suffix}</span>}
      </div>
      <SourceTag source={source} missing={missing} edited={edited} />
    </div>
  )
}

function Choice({ name, options, value, onChange, labelFor, describeFor }) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <label
          key={option}
          className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors
            ${value === option ? 'border-accent bg-accent/5' : 'border-line hover:bg-canvas'}`}
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
            className="mt-1 flex-shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-ink">{labelFor(option)}</span>
            <span className="hint mt-0.5 block">{describeFor(option)}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export default function ShipmentForm({ form, setField, source, edits, rateOptions, exchangeRate, language }) {
  const { t } = useI18n()

  const number = (value) =>
    value == null
      ? ''
      : new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
          maximumFractionDigits: 4,
        }).format(value)

  return (
    <div className="space-y-5">
      <div className="card card-pad">
        <h2 className="section-title">{t('costSheet.form.shipmentTitle')}</h2>
        <p className="hint mt-1">{t('costSheet.form.shipmentBody')}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="cs-name"
            label={t('costSheet.form.shipmentName')}
            value={form.shipmentName}
            onChange={(v) => setField('shipmentName', v)}
            source={source.shipmentSource}
            edited={edits.has('shipmentName')}
            missing={!String(form.shipmentName ?? '').trim()}
          />

          <div>
            <label className="label" htmlFor="cs-rate">
              {t('costSheet.form.exchangeRate')}
              {!exchangeRate && <span className="ml-1 text-danger">*</span>}
            </label>
            <select
              id="cs-rate"
              className="select"
              value={form.rateChoice}
              onChange={(event) => setField('rateChoice', event.target.value)}
            >
              {rateOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {t(`costSheet.rates.${option.id}`)} — {number(option.value)}
                </option>
              ))}
              <option value="manual">{t('costSheet.rates.manual')}</option>
            </select>
            {form.rateChoice === 'manual' && (
              <input
                className={`input mt-2 ${form.manualRate ? '' : 'input-error'}`}
                inputMode="decimal"
                placeholder={t('costSheet.form.ratePlaceholder')}
                value={form.manualRate}
                onChange={(event) => setField('manualRate', event.target.value)}
              />
            )}
            <SourceTag
              source={rateOptions.find((o) => o.id === form.rateChoice)?.source}
              edited={form.rateChoice === 'manual'}
              missing={!exchangeRate}
            />
            <p className="hint mt-1">{t('costSheet.form.rateNote')}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            id="cs-freight"
            label={t('costSheet.form.freight')}
            value={form.freight}
            onChange={(v) => setField('freight', v)}
            source={source.freightUsd?.source ?? source.accountFreight?.source}
            edited={edits.has('freight')}
            missing={!form.freight}
            suffix={form.currency}
          />
          <Field
            id="cs-insurance"
            label={t('costSheet.form.insurance')}
            value={form.insurance}
            onChange={(v) => setField('insurance', v)}
            source={source.insuranceUsd?.source ?? source.accountInsurance?.source}
            edited={edits.has('insurance')}
            missing={!form.insurance}
            suffix={form.currency}
          />
        </div>

        {/* Decision 3. The target's F10 and G10 are dollars by definition, and
            CUENTA T states pesos, so this cannot be left implicit. */}
        <fieldset className="mt-4">
          <legend className="label">{t('costSheet.form.currencyTitle')}</legend>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => setField('currency', currency)}
                className={form.currency === currency ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              >
                {t(`costSheet.form.currency.${currency}`)}
              </button>
            ))}
          </div>
          <p className="hint mt-1.5">
            {form.currency === 'USD'
              ? t('costSheet.form.currencyNoteUsd')
              : t('costSheet.form.currencyNoteDop', { rate: number(exchangeRate) })}
          </p>
        </fieldset>
      </div>

      <div className="card card-pad">
        <h2 className="section-title">{t('costSheet.form.expensesTitle')}</h2>
        <p className="hint mt-1">{t('costSheet.form.expensesBody')}</p>

        <div className="mt-4 space-y-3">
          {EXPENSE_KEYS.map((key) => (
            <div key={key} className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field
                id={`cs-exp-${key}`}
                label={t(`costSheet.expenses.${key}`)}
                value={form.expenses[key]}
                onChange={(v) => setField(`expenses.${key}`, v)}
                source={source.expenses?.[key]?.source}
                edited={edits.has(`expenses.${key}`)}
                missing={!String(form.expenses[key] ?? '').trim()}
                suffix="RD$"
              />
              <Field
                id={`cs-entry-${key}`}
                label={t('costSheet.form.entryNumber')}
                value={form.entryNumbers[key]}
                onChange={(v) => setField(`entryNumbers.${key}`, v)}
                source={source.entryNumbers?.[key]?.source}
                edited={edits.has(`entryNumbers.${key}`)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="section-title">{t('costSheet.form.decisionsTitle')}</h2>
        <p className="hint mt-1">{t('costSheet.form.decisionsBody')}</p>

        <div className="mt-4 space-y-5">
          <fieldset>
            <legend className="label">{t('costSheet.form.itbisTitle')}</legend>
            <Choice
              name="itbisBase"
              options={ITBIS_BASES}
              value={form.itbisBase}
              onChange={(v) => setField('itbisBase', v)}
              labelFor={(o) => t(`costSheet.itbis.${o}.label`)}
              describeFor={(o) => t(`costSheet.itbis.${o}.note`)}
            />
            <p className="hint mt-1.5">{t('costSheet.form.itbisNote')}</p>
          </fieldset>

          <fieldset>
            <legend className="label">{t('costSheet.form.gravamenTitle')}</legend>
            <Choice
              name="gravamenSource"
              options={GRAVAMEN_SOURCES}
              value={form.gravamenSource}
              onChange={(v) => setField('gravamenSource', v)}
              labelFor={(o) => t(`costSheet.gravamen.${o}.label`)}
              describeFor={(o) => t(`costSheet.gravamen.${o}.note`)}
            />
            <p className="hint mt-1.5">{t('costSheet.form.gravamenNote')}</p>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
