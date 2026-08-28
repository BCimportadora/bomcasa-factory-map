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
 * The columns, in the order and under the headings of the company's own
 * "CODIGOS INTERRUPTORES" workbook, which is the sheet people here already read.
 *
 * Four of that workbook's columns are not here, because the catalog does not
 * hold them: IMAGEN, CBM UNITARIO, CANTIDAD POR CAJA, and the run of historic
 * COSTO columns (03.2021, 09.2022, 05.23, 10.23...). The catalog keeps one FOB
 * cost, the current one, because that is what the newest order established --
 * a price history would be a different feature. The last two columns are ours
 * and not the workbook's: what the goods land at and what we sell them for.
 */
const ALL_COLUMNS = [
  'product_code',
  'supplier_code',
  'description_en',
  'description',
  'barcode',
  'arancel',
  'gravamen_pct',
  'fob_usd',
  'unit_price_dop',
  'precio_lista',
]

/** The ones that read as figures, and belong right-aligned. */
const NUMERIC = new Set(['gravamen_pct', 'fob_usd', 'unit_price_dop', 'precio_lista'])

/** Codes and figures must not wrap; the two descriptions are what may. */
const NOWRAP = new Set([...NUMERIC, 'product_code', 'supplier_code', 'barcode', 'arancel'])

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
  const { t, tCount, language } = useI18n()
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

  const byCode = (a, b) =>
    (a.product_code ?? '').localeCompare(b.product_code ?? '', undefined, { numeric: true })

  const rows = useMemo(() => {
    const wanted = products.filter(
      (p) => !selected || (supplierFor(p)?.id ?? NO_SUPPLIER) === selected,
    )
    return [...wanted].sort(byCode)
  }, [products, selected, supplierFor])

  /**
   * The rows broken into headed blocks, the way the company's own workbook
   * breaks its list into BLANCO, MODULOS NEGROS and the rest.
   *
   * Our sections are suppliers, which is the division that means something
   * here: it is who to call about a price. One supplier's sheet is a single
   * unnamed block -- repeating the name above every row of a list that is
   * already titled with it would be noise.
   */
  const sections = useMemo(() => {
    if (selected) return [{ key: 'only', label: null, rows }]
    const found = new Map()
    for (const product of rows) {
      const factory = supplierFor(product)
      const key = factory?.id ?? NO_SUPPLIER
      const label = factory ? factoryLabel(factory) : t('catalog.noSupplier')
      if (!found.has(key)) found.set(key, { key, label, rows: [] })
      found.get(key).rows.push(product)
    }
    return [...found.values()].sort((a, b) => {
      // Products nobody can attribute go last, whatever they are called.
      if ((a.key === NO_SUPPLIER) !== (b.key === NO_SUPPLIER)) return a.key === NO_SUPPLIER ? 1 : -1
      return a.label.localeCompare(b.label)
    })
  }, [rows, selected, supplierFor, t])

  const heading = selected
    ? suppliers.find((s) => s.id === selected)?.label ?? t('catalog.noSupplier')
    : t('catalog.print.everything')

  const printedOn = new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'long',
  }).format(new Date())

  /**
   * Only the columns this selection actually has something in.
   *
   * One supplier's sheet is often missing a whole field -- Klik's 42 articles
   * carry no barcode at all -- and a column of 42 em dashes costs width the
   * descriptions need, which is what pushes them onto three lines each. Nothing
   * is hidden: a column only goes when every row of it is empty.
   */
  const columns = useMemo(
    () =>
      ALL_COLUMNS.filter((field) =>
        rows.some((p) =>
          field === 'precio_lista' ? isInternalUse(p) || p[field] != null : p[field] != null && p[field] !== '',
        ),
      ),
    [rows],
  )

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

      {/*
        Kills the browser's own header and footer -- the date, the page title,
        the URL and "1/4" -- by leaving no page margin for them to sit in. It
        is scoped to this component rather than put in index.css because
        `@page` cannot be scoped by selector: the rule only exists in the
        document while this route is mounted, so the innovations sheet keeps
        the 14mm margin it is laid out for.

        With no page margin the sheet supplies its own. Horizontal padding
        survives a page break and so applies to all four pages; vertical
        padding does not, which is why the top and bottom margins are carried
        by the repeating thead and tfoot below.
      */}
      <style>{'@media print { @page { size: landscape; margin: 0 } }'}</style>

      <div className="mx-auto max-w-5xl px-8 py-8 print:max-w-none print:px-[10mm] print:py-0">
        <header className="mb-5 print:mb-0 print:pt-[9mm]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 print:text-[9px]">
            {t('catalog.print.company')}
          </p>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] print:text-[14px]">{heading}</h1>
          <p className="mt-0.5 text-[12px] text-neutral-600 print:text-[8px]">
            {t('catalog.print.subtitle', { count: rows.length, date: printedOn })}
          </p>
        </header>

        {loading ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.noMatches')}</p>
        ) : (
          <table className="w-full border-collapse text-[11px] print:text-[9px]">
            {/* Repeated on every sheet: a page of figures with no headings on
                it is unreadable on its own. Its padding-top is also what gives
                pages two onwards their top margin. */}
            <thead className="table-header-group">
              <tr className="border-b border-neutral-400 text-left">
                {columns.map((field) => (
                  <th
                    key={field}
                    className={`px-1.5 py-1.5 font-semibold print:pb-1 print:pt-[8mm] ${
                      NUMERIC.has(field) ? 'text-right' : ''
                    }`}
                  >
                    {t(`catalog.print.columns.${field}`)}
                  </th>
                ))}
              </tr>
            </thead>
            {/* One tbody per section rather than one per table, so the
                section heading travels with its first rows across a break. */}
            {sections.map((section) => (
              <tbody key={section.key}>
                {section.label && (
                  <tr className="break-inside-avoid">
                    <td
                      colSpan={columns.length}
                      className="border-b border-neutral-400 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide print:pb-0.5 print:pt-2.5 print:text-[9px]"
                    >
                      {section.label}
                      <span className="ml-2 font-normal normal-case text-neutral-500">
                        {tCount('catalog.print.sectionCount', section.rows.length)}
                      </span>
                    </td>
                  </tr>
                )}
                {section.rows.map((product) => (
                  // `break-inside: avoid` so a row is never split across sheets.
                  <tr key={product.id} className="break-inside-avoid border-b border-neutral-200">
                    {columns.map((field) => (
                      <td
                        key={field}
                        className={`px-1.5 py-1 align-top print:py-[2px] ${
                          field === 'product_code' ? 'font-medium' : ''
                        } ${NOWRAP.has(field) ? 'whitespace-nowrap' : ''} ${
                          NUMERIC.has(field) ? 'text-right' : ''
                        }`}
                      >
                        {cell(product, field)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
            {/* An empty band that repeats at the foot of every sheet, so the
                last row never runs into the paper's unprintable edge now that
                the page itself has no margin. */}
            <tfoot className="table-footer-group">
              <tr>
                <td colSpan={columns.length} className="p-0 print:pt-[9mm]" />
              </tr>
            </tfoot>
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
