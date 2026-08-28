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

/** The money columns. The workbook prints these in bold; so do we. */
const MONEY = new Set(['fob_usd', 'unit_price_dop', 'precio_lista'])

/** Codes and figures must not wrap; the two descriptions are what may. */
const NOWRAP = new Set([...MONEY, 'gravamen_pct', 'product_code', 'supplier_code', 'barcode', 'arancel'])

/**
 * Relative column widths, taken from the workbook's own column settings --
 * where the two description columns together hold well over half the sheet.
 *
 * They have to be declared rather than left to the browser. With automatic
 * layout a column claims the width of its longest heading, so "COSTO UNITARIO
 * (RD$)" reserved a hundred points to print "20.00" in, and the descriptions
 * paid for it by wrapping onto three lines each. The weights are normalised
 * over whichever columns actually render, so dropping an empty one hands its
 * width back to the rest instead of leaving a gap.
 */
const WIDTH = {
  product_code: 5,
  supplier_code: 9,
  description_en: 21,
  description: 30,
  barcode: 8,
  arancel: 7,
  gravamen_pct: 5,
  fob_usd: 5,
  unit_price_dop: 5,
  precio_lista: 5,
}

/**
 * Column alignment, copied from the workbook cell for cell: our code to the
 * right, their code centred, the English description left, figures right.
 * Anything unlisted takes the default, which is left.
 */
const ALIGN = {
  product_code: 'text-right',
  supplier_code: 'text-center',
  barcode: 'text-center',
  arancel: 'text-center',
  gravamen_pct: 'text-right',
  fob_usd: 'text-right',
  unit_price_dop: 'text-right',
  precio_lista: 'text-right',
}

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

  /**
   * A figure the way the workbook writes one: the bare number, to the decimals
   * that column uses, with no currency symbol.
   *
   * The symbol moves up into the heading instead. Their COSTO columns are all
   * dollars so the column itself says so; ours are not -- FOB is USD and the
   * other two are pesos -- so the heading carries it. Repeating "US$" down
   * three hundred rows costs the width the descriptions need, and a zero here
   * still means no price rather than free.
   */
  const figure = (value, decimals) => {
    if (value == null || value === '' || Number(value) === 0) return '—'
    const n = Number(value)
    if (!Number.isFinite(n)) return '—'
    return new Intl.NumberFormat(language === 'es' ? 'es-ES' : 'en-GB', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n)
  }

  const widthTotal = columns.reduce((sum, field) => sum + (WIDTH[field] ?? 5), 0)

  const cell = (product, field) => {
    if (field === 'product_code') return formatProductCode(product[field]) || '—'
    if (field === 'gravamen_pct') return formatPercent(product[field], language)
    if (field === 'precio_lista' && isInternalUse(product)) return t('catalog.fields.internal_use')
    // Three decimals on the FOB cost, as the workbook's COSTO columns carry;
    // two on the peso figures, which is how pesos are written.
    if (field === 'fob_usd') return figure(product[field], 3)
    if (field === 'unit_price_dop' || field === 'precio_lista') return figure(product[field], 2)
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
        {/* Centred over the table, as the workbook's own two title rows are. */}
        <header className="mb-4 text-center print:mb-1.5 print:pt-[9mm]">
          <h1 className="text-[20px] font-bold print:text-[14px]">{t('catalog.print.company')}</h1>
          <p className="text-[13px] font-bold print:text-[10px]">{heading}</p>
          <p className="mt-0.5 text-[12px] text-neutral-600 print:text-[8px]">
            {t('catalog.print.subtitle', { count: rows.length, date: printedOn })}
          </p>
        </header>

        {loading ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-[14px] text-neutral-600">{t('catalog.noMatches')}</p>
        ) : (
          <table className="w-full table-fixed border-collapse text-[11px] print:text-[9px]">
            <colgroup>
              {columns.map((field) => (
                <col key={field} style={{ width: `${((WIDTH[field] ?? 5) / widthTotal) * 100}%` }} />
              ))}
            </colgroup>
            {/* Repeated on every sheet: a page of figures with no headings on
                it is unreadable on its own. Its padding-top is also what gives
                pages two onwards their top margin. */}
            <thead className="table-header-group">
              <tr>
                {columns.map((field) => (
                  // The padding-top is outside the box on purpose: it is the
                  // page's top margin, not part of the heading cell.
                  <th key={field} className="align-bottom print:pt-[8mm]">
                    <div className="border border-neutral-500 px-1.5 py-1.5 text-center font-bold uppercase print:py-1">
                      {t(`catalog.print.columns.${field}`)}
                    </div>
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
                      className="border border-neutral-500 px-1.5 py-1.5 text-center text-[13px] font-bold uppercase print:py-1 print:text-[10px]"
                    >
                      {section.label}
                      <span className="ml-2 text-[11px] font-normal normal-case text-neutral-600 print:text-[8px]">
                        {tCount('catalog.print.sectionCount', section.rows.length)}
                      </span>
                    </td>
                  </tr>
                )}
                {section.rows.map((product) => (
                  // `break-inside: avoid` so a row is never split across sheets.
                  <tr key={product.id} className="break-inside-avoid">
                    {columns.map((field) => (
                      <td
                        key={field}
                        className={`border border-neutral-400 px-1.5 py-1 align-top print:py-[2px] ${
                          MONEY.has(field) ? 'font-bold' : ''
                        } ${
                          // "Uso interno" stands where a price would, and is
                          // wider than one: the only cell in a money column
                          // allowed to wrap rather than run over its border.
                          NOWRAP.has(field) && !(field === 'precio_lista' && isInternalUse(product))
                            ? 'whitespace-nowrap'
                            : ''
                        } ${ALIGN[field] ?? ''}`}
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
