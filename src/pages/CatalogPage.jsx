import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Printer,
  Search,
  Upload,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { useCatalog } from '../hooks/useCatalog'
import { useFactories } from '../hooks/useFactories'
import { useOrders } from '../hooks/useOrders'
import { factoryLabel } from '../lib/factories'
import {
  CURRENCY_OF,
  PAGE_SIZE,
  codeKey,
  formatPrice,
  formatProductCode,
  formatPercent,
  isInternalUse,
  lastSeenOrder,
  orderSortKey,
  supplierIndex,
} from '../lib/catalog'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import CatalogImport from '../components/Catalog/CatalogImport'
import ProductEditor from '../components/Catalog/ProductEditor'

/** Columns, and how each one sorts. */
const COLUMNS = [
  { field: 'product_code', align: 'left', numeric: false },
  { field: 'description', align: 'left', numeric: false },
  { field: 'barcode', align: 'left', numeric: false },
  { field: 'arancel', align: 'left', numeric: false },
  { field: 'gravamen_pct', align: 'right', numeric: true },
  { field: 'fob_usd', align: 'right', numeric: true },
  { field: 'unit_price_dop', align: 'right', numeric: true },
  { field: 'precio_lista', align: 'right', numeric: true },
  { field: 'cbm_unit', align: 'right', numeric: true },
  { field: 'units_per_box', align: 'right', numeric: true },
  // Neither of these is stored. Both are worked out from whichever of doc_ref
  // and cost_ref is the later order -- see lastSeenOrder and supplierIndex.
  { field: 'supplier', align: 'left', numeric: false, derived: true },
  { field: 'lastSeen', align: 'left', numeric: false, derived: true },
]

/** The value the supplier filter uses for products whose supplier is unknown. */
const NO_SUPPLIER = 'none'

export default function CatalogPage() {
  const { t, language } = useI18n()
  const { user } = useAuth()
  const {
    products,
    loading,
    error,
    listProducts,
    findImport,
    applyImport,
    updateProduct,
  } = useCatalog()
  // A product's supplier is not stored on it -- it is the supplier of the order
  // its paperwork came from. Both lists are needed to work that out.
  const { factories } = useFactories()
  const { orders } = useOrders()

  const [query, setQuery] = useState('')
  const [arancel, setArancel] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [printOpen, setPrintOpen] = useState(false)
  const [sort, setSort] = useState({ field: 'product_code', dir: 'asc' })
  const [page, setPage] = useState(0)
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState(null)
  const [actionError, setActionError] = useState('')

  const aranceles = useMemo(
    () => [...new Set(products.map((p) => p.arancel).filter(Boolean))].sort(),
    [products],
  )

  // Escape closes the print menu. The backdrop behind it catches a click
  // anywhere, but a menu that only a mouse can dismiss is a menu somebody gets
  // stuck in.
  useEffect(() => {
    if (!printOpen) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setPrintOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [printOpen])

  const supplierFor = useMemo(() => supplierIndex({ orders, factories }), [orders, factories])

  /** The supplier's name for searching, sorting and display; '' when unknown. */
  const supplierLabel = useCallback(
    (product) => {
      const factory = supplierFor(product)
      return factory ? factoryLabel(factory) : ''
    },
    [supplierFor],
  )

  /**
   * The suppliers the catalog actually holds products for, with a count.
   *
   * Built from the products rather than from the factory list, so the filter
   * never offers a supplier that would return an empty table -- and so the
   * counts add up to the catalog in front of you.
   */
  const suppliers = useMemo(() => {
    const found = new Map()
    let unknown = 0
    for (const product of products) {
      const factory = supplierFor(product)
      if (!factory) {
        unknown += 1
        continue
      }
      const entry = found.get(factory.id)
      if (entry) entry.count += 1
      else found.set(factory.id, { id: factory.id, label: factoryLabel(factory), count: 1 })
    }
    const list = [...found.values()].sort((a, b) => a.label.localeCompare(b.label))
    if (unknown > 0) list.push({ id: NO_SUPPLIER, label: t('catalog.noSupplier'), count: unknown })
    return list
  }, [products, supplierFor, t])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // A search that looks like a code is also matched against the normalised
    // key, so typing 5915-03 finds the product stored as 591503.
    const asKey = codeKey(needle)

    const filtered = products.filter((p) => {
      if (arancel && p.arancel !== arancel) return false
      if (supplierId && (supplierFor(p)?.id ?? NO_SUPPLIER) !== supplierId) return false
      if (!needle) return true
      return (
        (p.product_code ?? '').toLowerCase().includes(needle) ||
        (asKey && (p.code_key ?? '').includes(asKey)) ||
        (p.description ?? '').toLowerCase().includes(needle) ||
        (p.description_es ?? '').toLowerCase().includes(needle) ||
        (p.description_en ?? '').toLowerCase().includes(needle) ||
        (p.barcode ?? '').includes(needle.replace(/\D/g, '')) ||
        (p.supplier_code ?? '').toLowerCase().includes(needle) ||
        (p.model ?? '').toLowerCase().includes(needle) ||
        (lastSeenOrder(p) ?? '').toLowerCase().includes(needle) ||
        supplierLabel(p).toLowerCase().includes(needle)
      )
    })

    const column = COLUMNS.find((c) => c.field === sort.field)
    const direction = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      // Orders sort by their sequence, not their spelling: alphabetically
      // "MILAN 9" would land after "MILAN 12".
      if (sort.field === 'lastSeen') {
        const l = lastSeenOrder(a)
        const r = lastSeenOrder(b)
        if (!l) return r ? 1 : 0
        if (!r) return -1
        return orderSortKey(l).localeCompare(orderSortKey(r)) * direction
      }
      if (sort.field === 'supplier') {
        return supplierLabel(a).localeCompare(supplierLabel(b)) * direction
      }
      const left = a[sort.field]
      const right = b[sort.field]
      // Blanks always sort last, whichever way the column is pointing: a column
      // of empty cells at the top tells you nothing.
      if (left == null || left === '') return right == null || right === '' ? 0 : 1
      if (right == null || right === '') return -1
      if (column?.numeric) return (Number(left) - Number(right)) * direction
      return String(left).localeCompare(String(right)) * direction
    })
  }, [products, query, arancel, supplierId, sort, supplierFor, supplierLabel])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const rows = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)

  const toggleSort = (field) => {
    setPage(0)
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }))
  }

  const cell = (product, field) => {
    if (field === 'lastSeen') return lastSeenOrder(product) || '—'
    if (field === 'supplier') return supplierLabel(product) || '—'
    // Where the selling price would be, say why there isn't one. An em dash
    // here reads as "nobody has filled this in yet", which is a different
    // thing and would send someone looking for a price that does not exist.
    if (field === 'precio_lista' && isInternalUse(product)) {
      return <span className="badge-neutral">{t('catalog.fields.internal_use')}</span>
    }
    if (CURRENCY_OF[field]) return formatPrice(product[field], CURRENCY_OF[field], language)
    if (field === 'gravamen_pct') return formatPercent(product[field], language)
    // Formatted on the way out as well as on the way in, so rows imported
    // before the hyphen rule existed read correctly without a migration.
    if (field === 'product_code') return formatProductCode(product[field]) || '—'
    return product[field] || '—'
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{t(sectionNameKey('catalog'))}</h1>
            <p className="page-subtitle">{t(sectionDescriptionKey('catalog'))}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Two ways to print, because they are two different jobs: one
                supplier's sheet to take to a meeting, or the whole book. The
                supplier list is the same one the filter offers. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPrintOpen((open) => !open)}
                aria-expanded={printOpen}
                aria-haspopup="menu"
                className="btn-secondary"
              >
                <Printer size={16} strokeWidth={2.25} />
                {t('catalog.print.action')}
              </button>

              {printOpen && (
                <>
                  {/* Catches the click that closes the menu, and nothing else. */}
                  <div
                    className="fixed inset-0 z-40"
                    role="presentation"
                    onClick={() => setPrintOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-overlay"
                  >
                    <Link
                      role="menuitem"
                      to="/catalog/print"
                      onClick={() => setPrintOpen(false)}
                      className="block px-3.5 py-2 text-[13px] font-medium text-ink hover:bg-canvas"
                    >
                      {t('catalog.print.everything')}
                      <span className="ml-1.5 text-muted">({products.length})</span>
                    </Link>

                    {suppliers.length > 0 && (
                      <>
                        <p className="mt-1 border-t border-line px-3.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                          {t('catalog.print.bySupplier')}
                        </p>
                        {suppliers.map((supplier) => (
                          <Link
                            key={supplier.id}
                            role="menuitem"
                            to={`/catalog/print?supplier=${encodeURIComponent(supplier.id)}`}
                            onClick={() => setPrintOpen(false)}
                            className="block px-3.5 py-2 text-[13px] text-ink hover:bg-canvas"
                          >
                            {supplier.label}
                            <span className="ml-1.5 text-muted">({supplier.count})</span>
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <button type="button" onClick={() => setImporting(true)} className="btn-primary">
              <Upload size={16} strokeWidth={2.25} />
              {t('catalog.import.action')}
            </button>
          </div>
        </header>

        {(actionError || error) && (
          <p role="alert" className="alert-error mb-4">
            {actionError || error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search
              size={15}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder={t('catalog.searchPlaceholder')}
              aria-label={t('catalog.searchPlaceholder')}
              className="input pl-9"
            />
          </div>
          <select
            value={arancel}
            onChange={(e) => {
              setArancel(e.target.value)
              setPage(0)
            }}
            aria-label={t('catalog.fields.arancel')}
            className="input w-auto min-w-[12rem]"
          >
            <option value="">{t('catalog.allAranceles')}</option>
            {aranceles.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="relative">
            <Building2
              size={15}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                setPage(0)
              }}
              aria-label={t('catalog.fields.supplier')}
              className="input w-auto min-w-[13rem] pl-9"
            >
              <option value="">{t('catalog.allSuppliers')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label} ({supplier.count})
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('catalog.loading')}</p>
        ) : products.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t('catalog.empty')}</p>
            <p className="mt-1 text-[13px] text-muted">{t('catalog.emptyHint')}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t('catalog.noMatches')}</p>
            <p className="mt-1 text-[13px] text-muted">{t('catalog.noMatchesHint')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[64rem] text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    {COLUMNS.map((c) => (
                      <th
                        key={c.field}
                        className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(c.field)}
                          className={`inline-flex items-center gap-1 hover:text-ink ${
                            sort.field === c.field ? 'text-ink' : ''
                          }`}
                        >
                          {t(`catalog.fields.${c.field}`)}
                          {CURRENCY_OF[c.field] && (
                            <span className="text-[10px] text-muted">{CURRENCY_OF[c.field]}</span>
                          )}
                          <ArrowUpDown size={11} strokeWidth={2} />
                        </button>
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((product) => (
                    <tr key={product.id} className="border-b border-line last:border-0">
                      {COLUMNS.map((c) => (
                        <td
                          key={c.field}
                          className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : ''} ${
                            c.field === 'product_code' ? 'whitespace-nowrap font-medium text-ink' : 'text-muted'
                          }`}
                        >
                          {c.field === 'description' ? (
                            <span className="block max-w-[22rem] truncate">{cell(product, c.field)}</span>
                          ) : (
                            cell(product, c.field)
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          aria-label={t('catalog.edit.action')}
                          title={t('catalog.edit.action')}
                          className="btn-ghost btn-sm"
                        >
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="hint">
                {t('catalog.showing', {
                  from: current * PAGE_SIZE + 1,
                  to: current * PAGE_SIZE + rows.length,
                  total: visible.length,
                })}
              </p>
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={current === 0}
                    aria-label={t('catalog.previous')}
                    className="btn-ghost btn-sm"
                  >
                    <ChevronLeft size={15} strokeWidth={2} />
                  </button>
                  <span className="px-2 text-[12px] text-muted">
                    {t('catalog.pageOf', { page: current + 1, pages: pageCount })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={current >= pageCount - 1}
                    aria-label={t('catalog.next')}
                    className="btn-ghost btn-sm"
                  >
                    <ChevronRight size={15} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {importing && (
        <CatalogImport
          factories={factories}
          onCheckImported={findImport}
          onListProducts={listProducts}
          onConfirm={({ plan, document }) => applyImport({ plan, document, userId: user.id })}
          onClose={() => setImporting(false)}
        />
      )}

      {editing && (
        <ProductEditor
          product={editing}
          onSave={async (id, fields) => {
            setActionError('')
            try {
              await updateProduct(id, fields)
            } catch (err) {
              setActionError(err.message)
              throw err
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
