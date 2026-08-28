import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useI18n } from '../i18n'
import { useCatalog } from '../hooks/useCatalog'
import { useFactories } from '../hooks/useFactories'
import { useOrders } from '../hooks/useOrders'
import { factoryLabel } from '../lib/factories'
import {
  formatPercent,
  formatPrice,
  formatProductCode,
  isInternalUse,
  lastSeenOrder,
  supplierIndex,
} from '../lib/catalog'

/** Which supplier to print, or 'all'. Matches the filter's own value. */
const NO_SUPPLIER = 'none'

/**
 * The catalog on paper.
 *
 * Two jobs, one page: the whole price book, or one supplier's products to take
 * to a meeting with them. Which one is in the query string rather than in
 * component state, so a link to a particular supplier's sheet can be sent to
 * somebody and open the same thing.
 *
 * Like the innovations sheet, this is deliberately outside the application
 * chrome and hard-coded to black on white: paper has no theme, and the colour
 * tokens would follow whatever the person printing happens to have set. That is
 * the opposite of the rule everywhere else in this codebase, which is why both
 * print pages say so.
 *
 * Not paginated. Paging exists on the catalog screen so a browser is not asked
 * to lay out three thousand rows at once; a printer is being asked for the
 * whole thing on purpose.
 */
export default function CatalogPrintPage() {
  const { t, language } = useI18n()
  const [params, setParams] = useSearchParams()
  const { products, loading } = useCatalog()
  const { factories } = useFactories()
  const { orders } = useOrders()

  const selected = params.get('supplier') ?? ''
  const supplierFor = useMemo(() => supplierIndex({ orders, factories }), [orders, factories])

  /** Every supplier the catalog holds products for — the print menu's list. */
  const suppliers = useMemo(() => {
    const found = new Map()
    let unknown = 0
    for (const product of products) {
      const factory = supplierFor(product)
      if (!factory) {
        unknown += 1
        continue
      }
      if (!found.has(factory.id)) found.set(factory.id, { id: factory.id, label: factoryLabel(factory) })
    }
    const list = [...found.values()].sort((a, b) => a.label.localeCompare(b.label))
    if (unknown > 0) list.push({ id: NO_SUPPLIER, label: t('catalog.noSupplier') })
    return list
  }, [products, supplierFor, t])

  const rows = useMemo(() => {
    const wanted = products.filter(
      (p) => !selected || (supplierFor(p)?.id ?? NO_SUPPLIER) === selected,
    )
    return [...wanted].sort((a, b) =>
      (a.product_code ?? '').localeCompare(b.product_code ?? '', undefined, { numeric: true }),
    )
  }, [products, selected, supplierFor])

  const heading = selected
    ? suppliers.find((s) => s.id === selected)?.label ?? t('catalog.noSupplier')
    : t('catalog.print.everything')

  const printedOn = new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
  }).format(new Date())

  const columns = [
    'product_code',
    'description',
    'barcode',
    'arancel',
    'gravamen_pct',
    'fob_usd',
    'unit_price_dop',
    'precio_lista',
  ]

  const cell = (product, field) => {
    if (field === 'product_code') return formatProductCode(product[field]) || '—'
    if (field === 'gravamen_pct') return formatPercent(product[field], language)
    if (field === 'precio_lista' && isInternalUse(product)) return t('catalog.fields.internal_use')
    if (field === 'fob_usd') return formatPrice(product[field], 'USD', language)
    if (field === 'unit_price_dop' || field === 'precio_lista') {
      return formatPrice(product[field], 'DOP', language)
    }
    return product[field] || '—'
  }

  return (
    <div className="min-h-full bg-white text-black">
      {/* Screen-only controls; `print:hidden` keeps them off the paper. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3 print:hidden">
        <Link
          to="/catalog"
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          {t('catalog.print.back')}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* Switching supplier here rather than going back and choosing again:
              this is the screen where you can see what will come out. */}
          <select
            value={selected}
            onChange={(e) => setParams(e.target.value ? { supplier: e.target.value } : {})}
            aria-label={t('catalog.fields.supplier')}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[14px] text-black"
          >
            <option value="">{t('catalog.print.everything')}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Printer size={16} strokeWidth={2} />
            {t('catalog.print.action')}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <header className="mb-5">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{heading}</h1>
          <p className="mt-0.5 text-[12px] text-neutral-600">
            {t('catalog.print.subtitle', { count: rows.length, date: printedOn })}
          </p>
        </header>

        {loading ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.noMatches')}</p>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            {/* Repeated on every sheet: a page of figures with no headings on
                it is unreadable on its own. */}
            <thead className="table-header-group">
              <tr className="border-b border-neutral-400 text-left">
                {columns.map((field) => (
                  <th
                    key={field}
                    className={`px-1.5 py-1.5 font-semibold ${
                      field === 'product_code' || field === 'description' || field === 'barcode' || field === 'arancel'
                        ? ''
                        : 'text-right'
                    }`}
                  >
                    {t(`catalog.fields.${field}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                // `break-inside: avoid` so a row is never split across sheets.
                <tr key={product.id} className="break-inside-avoid border-b border-neutral-200">
                  {columns.map((field) => (
                    <td
                      key={field}
                      className={`px-1.5 py-1 align-top ${
                        field === 'product_code' ? 'whitespace-nowrap font-medium' : ''
                      } ${
                        field === 'gravamen_pct' ||
                        field === 'fob_usd' ||
                        field === 'unit_price_dop' ||
                        field === 'precio_lista'
                          ? 'whitespace-nowrap text-right'
                          : ''
                      }`}
                    >
                      {cell(product, field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Only where it tells you something: on one supplier's sheet the
            order is the same for every row and belongs in the heading, not in
            a column repeated down the page. */}
        {!selected && rows.length > 0 && (
          <p className="mt-4 text-[10px] text-neutral-500">{t('catalog.print.footnote')}</p>
        )}
      </div>
    </div>
  )
}
