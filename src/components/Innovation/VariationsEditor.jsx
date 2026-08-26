import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n'
import { CURRENCIES, SAFETY_LEVELS, safetyKey } from '../../lib/innovations'

export const emptyVariation = () => ({ id: undefined, name: '', notes: '' })
export const emptyQuote = (variationId = null) => ({
  id: undefined,
  variation_id: variationId,
  factory_id: '',
  safety: 'unknown',
  quoted_price: '',
  currency: 'USD',
  notes: '',
})

/** The quotes attached to one variation, or the loose ones when key is null. */
function QuoteRows({ variationKey, quotes, factories, onChange }) {
  const { t } = useI18n()

  const mine = quotes
    .map((quote, index) => ({ quote, index }))
    .filter(({ quote }) => (quote.variation_key ?? null) === variationKey)

  const update = (index, field, value) => {
    onChange(quotes.map((quote, i) => (i === index ? { ...quote, [field]: value } : quote)))
  }

  return (
    <div className="mt-2">
      <p className="hint mb-1.5">{t('innovations.quotesTitle')}</p>

      {mine.length === 0 && <p className="hint italic">{t('innovations.noQuotes')}</p>}

      <div className="space-y-2">
        {mine.map(({ quote, index }) => (
          <div key={index} className="rounded-lg border border-line bg-surface p-2.5">
            <div className="flex items-start gap-2">
              <select
                value={quote.factory_id ?? ''}
                onChange={(e) => update(index, 'factory_id', e.target.value)}
                aria-label={t('innovations.quoteFactory')}
                className="select flex-1 text-[13px]"
              >
                <option value="">{t('innovations.chooseFactory')}</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(quotes.filter((_, i) => i !== index))}
                aria-label={t('innovations.removeQuote')}
                className="mt-1 rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <input
                value={quote.quoted_price ?? ''}
                onChange={(e) => update(index, 'quoted_price', e.target.value)}
                inputMode="decimal"
                placeholder={t('innovations.quotedPrice')}
                aria-label={t('innovations.quotedPrice')}
                className="input text-[13px]"
              />
              <select
                value={quote.currency ?? 'USD'}
                onChange={(e) => update(index, 'currency', e.target.value)}
                aria-label={t('innovations.currency')}
                className="select text-[13px]"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <select
                value={quote.safety ?? 'unknown'}
                onChange={(e) => update(index, 'safety', e.target.value)}
                aria-label={t('innovations.safetyLabel')}
                className="select text-[13px]"
              >
                {SAFETY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(safetyKey(level))}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onChange([...quotes, { ...emptyQuote(), variation_key: variationKey }])
        }
        className="btn-ghost btn-sm mt-2"
      >
        <Plus size={13} />
        {t('innovations.addQuote')}
      </button>
    </div>
  )
}

/**
 * Variations, each with the factories being asked to quote it.
 *
 * A variation is how one report covers a bundle — a 4 1/2 inch and a 7 inch
 * disc quoted together. Quotes carrying no variation are kept and shown under
 * "the item itself", which is where they sit before anyone splits it up.
 *
 * Rows are tracked by `variation_key` rather than by database id because a
 * variation added in this session has no id until it is saved, and its quotes
 * still need to point at it.
 */
export default function VariationsEditor({ variations, quotes, factories, onVariations, onQuotes }) {
  const { t } = useI18n()

  const updateVariation = (index, field, value) => {
    onVariations(variations.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  const removeVariation = (index) => {
    const key = variations[index].key
    onVariations(variations.filter((_, i) => i !== index))
    // Its quotes go with it; leaving them would orphan them onto the item.
    onQuotes(quotes.filter((quote) => (quote.variation_key ?? null) !== key))
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label mb-0">{t('innovations.variations')}</span>
        <span className="hint">{t('innovations.variationsHint')}</span>
      </div>

      {/* Quotes for the item as a whole, before it is split into sizes. */}
      <div className="rounded-xl border border-line bg-canvas p-3">
        <p className="text-[13px] font-medium text-ink">{t('innovations.itemItself')}</p>
        <QuoteRows variationKey={null} quotes={quotes} factories={factories} onChange={onQuotes} />
      </div>

      <div className="mt-2.5 space-y-2.5">
        {variations.map((variation, index) => (
          <div key={variation.key} className="rounded-xl border border-line bg-canvas p-3">
            <div className="flex items-start gap-2">
              <input
                value={variation.name}
                onChange={(e) => updateVariation(index, 'name', e.target.value)}
                placeholder={t('innovations.variationName')}
                aria-label={t('innovations.variationName')}
                className="input flex-1 text-[14px]"
              />
              <button
                type="button"
                onClick={() => removeVariation(index)}
                aria-label={t('innovations.removeVariation')}
                className="mt-1 rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <QuoteRows
              variationKey={variation.key}
              quotes={quotes}
              factories={factories}
              onChange={onQuotes}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          onVariations([
            ...variations,
            { ...emptyVariation(), key: `new-${Date.now()}-${variations.length}` },
          ])
        }
        className="btn-secondary btn-sm mt-3"
      >
        <Plus size={14} />
        {t('innovations.addVariation')}
      </button>
    </div>
  )
}
