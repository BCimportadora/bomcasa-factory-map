import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useI18n } from '../i18n'
import { useInnovations } from '../hooks/useInnovations'
import { useFactories } from '../hooks/useFactories'
import {
  PRINTABLE_LABEL,
  formatMoney,
  quotesFor,
} from '../lib/innovations'
import InnovationImage from '../components/Innovation/InnovationImage'

/**
 * The printable sheet of everything ready to present.
 *
 * Deliberately outside the application chrome and hard-coded to black on white:
 * this is the one screen whose job is to leave the screen. Night mode would put
 * a dark rectangle on the paper on most printers, and the theme tokens would
 * follow the viewer's setting, so the colours here are literals rather than
 * `bg-surface` and friends. That is the opposite of the rule everywhere else in
 * this codebase, which is why it is written down.
 */
export default function InnovationsPrintPage() {
  const { t, language } = useI18n()
  const { innovations, loading } = useInnovations()
  const { factories } = useFactories()

  const items = useMemo(
    () => innovations.filter((innovation) => innovation.label === PRINTABLE_LABEL),
    [innovations],
  )

  const factoriesById = useMemo(
    () => new Map(factories.map((factory) => [factory.id, factory])),
    [factories],
  )

  return (
    <div className="min-h-full bg-white text-black">
      {/* Screen-only controls; `print:hidden` keeps them off the paper. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3 print:hidden">
        <Link
          to="/innovations/in-development"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {t('innovations.backToBoard')}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Printer size={16} strokeWidth={2} />
          {t('innovations.print')}
        </button>
      </div>

      <div className="mx-auto max-w-4xl px-8 py-8">
        <header className="mb-8">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            {t('innovations.printTitle')}
          </h1>
          <p className="mt-1 text-[14px] text-neutral-600">
            {t('innovations.printSubtitle', { count: items.length })}
          </p>
        </header>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-neutral-500">
            {t('innovations.loading')}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 px-4 py-8 text-center text-[15px] text-neutral-600">
            {t('innovations.printEmpty')}
          </p>
        ) : (
          <div className="space-y-8">
            {items.map((innovation) => {
              const images = innovation.innovation_images ?? []
              const variations = innovation.innovation_variations ?? []
              const loose = quotesFor(innovation, null)

              return (
                <article
                  key={innovation.id}
                  // Keep one item from being split across two sheets.
                  className="break-inside-avoid rounded-xl border border-neutral-200 p-5 print:border-neutral-300"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[18px] font-semibold tracking-[-0.01em]">
                      {innovation.name}
                    </h2>
                    {innovation.local_price != null && (
                      <p className="text-[14px] text-neutral-700">
                        {t('innovations.localPriceShort', {
                          price: formatMoney(
                            innovation.local_price,
                            innovation.local_currency,
                            language,
                          ),
                        })}
                      </p>
                    )}
                  </div>

                  {images.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {images.slice(0, 6).map((image) => (
                        <InnovationImage
                          key={image.id}
                          path={image.storage_path}
                          alt={innovation.name}
                          ratio="aspect-[4/3]"
                        />
                      ))}
                    </div>
                  )}

                  {innovation.notes && (
                    <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-neutral-700">
                      {innovation.notes}
                    </p>
                  )}

                  {(loose.length > 0 || variations.length > 0) && (
                    <div className="mt-4 space-y-2">
                      {[
                        { key: 'loose', title: t('innovations.itemItself'), quotes: loose },
                        ...variations.map((variation) => ({
                          key: variation.id,
                          title: variation.name,
                          quotes: quotesFor(innovation, variation.id),
                        })),
                      ]
                        .filter((group) => group.quotes.length > 0)
                        .map((group) => (
                          <div key={group.key}>
                            <p className="text-[13px] font-medium">{group.title}</p>
                            <ul className="mt-0.5 text-[13px] text-neutral-700">
                              {group.quotes.map((quote) => (
                                <li key={quote.id} className="flex justify-between gap-4 py-0.5">
                                  <span>
                                    {factoriesById.get(quote.factory_id)?.name ??
                                      t('innovations.unknownFactory')}
                                    {quote.safety === 'unsafe' && (
                                      <span className="ml-2 text-neutral-500">
                                        ({t('innovations.safety.unsafe')})
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium">
                                    {formatMoney(quote.quoted_price, quote.currency, language) ??
                                      t('innovations.awaitingQuote')}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
