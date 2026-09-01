import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Factory, FolderOpen, Paperclip } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { factoryLabel } from '../lib/factories'
import { useFactories } from '../hooks/useFactories'
import { useOrders } from '../hooks/useOrders'
import { useOrderFiles } from '../hooks/useOrderFiles'
import { formatDate } from '../lib/orders'
import { locationTypeKey } from '../lib/constants'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import { CardSkeleton, TableSkeleton } from '../components/common/Skeleton'
import StatusBadge from '../components/Order/StatusBadge'
import OrderFiles from '../components/Order/OrderFiles'

/**
 * Paperwork, reached the way people look for it: which factory, which order,
 * which document.
 *
 * This is a view over the existing factories and orders, not a store of its
 * own -- the only new data is the file rows themselves. An order opened here
 * shows exactly the files the order detail modal shows, because both render
 * the same component over the same hook.
 */

/** Orders with no factory still have paperwork; this is where it lives. */
const UNASSIGNED = 'unassigned'

const newestFirst = (a, b) => {
  // order_date is what a person means by "when was this order", but it is
  // optional; created_at always exists and keeps the sort stable without it.
  const left = a.order_date ?? a.created_at ?? ''
  const right = b.order_date ?? b.created_at ?? ''
  if (left === right) return 0
  return left > right ? -1 : 1
}

function Breadcrumb({ trail }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-[13px] text-muted">
      {trail.map((step, index) => (
        <span key={step.to ?? step.label} className="flex items-center gap-1">
          {index > 0 && <ChevronRight size={13} strokeWidth={2} className="text-muted" />}
          {step.to ? (
            <Link to={step.to} className="hover:text-ink">
              {step.label}
            </Link>
          ) : (
            <span className="text-ink">{step.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

function Shell({ children }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
    </div>
  )
}

function EmptyState({ title, hint }) {
  return (
    <div className="card card-pad text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[13px] text-muted">{hint}</p>
    </div>
  )
}

export default function FilesPage() {
  const { factoryId, orderId } = useParams()
  const { t, tCount, language } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { factories, loading: factoriesLoading, error: factoriesError } = useFactories()
  const { orders, loading: ordersLoading, error: ordersError } = useOrders()
  const {
    loading: filesLoading,
    error: filesError,
    addFiles,
    removeFile,
    signedUrlFor,
    filesFor,
    countByOrder,
  } = useOrderFiles()

  const loading = factoriesLoading || ordersLoading || filesLoading
  const error = factoriesError || ordersError || filesError
  const fileCounts = useMemo(() => countByOrder(), [countByOrder])

  const ordersByFactory = useMemo(() => {
    const map = new Map()
    for (const order of orders) {
      const key = order.factory_id ?? UNASSIGNED
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(order)
    }
    for (const list of map.values()) list.sort(newestFirst)
    return map
  }, [orders])

  const rootCrumb = { label: t(sectionNameKey('files')), to: '/files' }

  if (error) {
    return (
      <Shell>
        <p className="alert-error">{error}</p>
      </Shell>
    )
  }

  // ---------------------------------------------------------------- route 3
  if (factoryId && orderId) {
    const order = orders.find((candidate) => candidate.id === orderId)
    const factory = factories.find((candidate) => candidate.id === factoryId)

    if (loading) {
      return (
        <Shell>
          <TableSkeleton rows={5} cols={5} label={t('files.loading')} />
        </Shell>
      )
    }
    if (!order) {
      return (
        <Shell>
          <Breadcrumb trail={[rootCrumb]} />
          <EmptyState title={t('files.orderMissing')} hint={t('files.orderMissingHint')} />
        </Shell>
      )
    }

    const supplierName = factory ? factoryLabel(factory) : t('files.unassigned')
    return (
      <Shell>
        <Breadcrumb
          trail={[
            rootCrumb,
            { label: supplierName, to: `/files/${factoryId}` },
            { label: order.reference },
          ]}
        />

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title">{order.reference}</h1>
            <p className="page-subtitle">
              {supplierName}
              {formatDate(order.order_date, language) && (
                <> · {formatDate(order.order_date, language)}</>
              )}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </header>

        <OrderFiles
          files={filesFor(order.id)}
          onUpload={(chosen, docType) => addFiles(order.id, chosen, user?.id, docType)}
          onDelete={removeFile}
          onDownload={signedUrlFor}
        />

        <button
          type="button"
          onClick={() => navigate(`/files/${factoryId}`)}
          className="btn-ghost mt-6"
        >
          <ArrowLeft size={15} strokeWidth={2} />
          {t('files.backToOrders')}
        </button>
      </Shell>
    )
  }

  // ---------------------------------------------------------------- route 2
  if (factoryId) {
    const factory = factories.find((candidate) => candidate.id === factoryId)
    const unassigned = factoryId === UNASSIGNED
    const list = ordersByFactory.get(factoryId) ?? []

    if (loading) {
      return (
        <Shell>
          <CardSkeleton count={4} label={t('files.loading')} />
        </Shell>
      )
    }
    if (!factory && !unassigned) {
      return (
        <Shell>
          <Breadcrumb trail={[rootCrumb]} />
          <EmptyState title={t('files.factoryMissing')} hint={t('files.factoryMissingHint')} />
        </Shell>
      )
    }

    const supplierName = unassigned ? t('files.unassigned') : factoryLabel(factory)
    return (
      <Shell>
        <Breadcrumb trail={[rootCrumb, { label: supplierName }]} />

        <header className="mb-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{supplierName}</h1>
            {/* Which of the supplier's locations this is — without it, two
                rows with the same name are indistinguishable once opened. */}
            {factory?.location_type && factory.location_type !== 'factory' && (
              <span className="badge-neutral">{t(locationTypeKey(factory.location_type))}</span>
            )}
          </div>
          <p className="page-subtitle">
            {unassigned ? t('files.unassignedHint') : t('files.factoryHint')}
          </p>
        </header>

        {list.length === 0 ? (
          <EmptyState title={t('files.noOrders')} hint={t('files.noOrdersHint')} />
        ) : (
          <ul className="space-y-2">
            {list.map((order) => {
              const count = fileCounts.get(order.id) ?? 0
              return (
                <li key={order.id}>
                  <Link
                    to={`/files/${factoryId}/${order.id}`}
                    className="card card-pad flex items-center gap-3 transition-colors hover:border-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-ink">
                          {order.reference}
                        </span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {formatDate(order.order_date, language) ?? t('files.noDate')}
                        <span aria-hidden="true" className="mx-1.5">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Paperclip size={11} strokeWidth={2} />
                          {tCount('files.fileCount', count)}
                        </span>
                      </p>
                    </div>
                    <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <Link to="/files" className="btn-ghost mt-6">
          <ArrowLeft size={15} strokeWidth={2} />
          {t('files.backToFactories')}
        </Link>
      </Shell>
    )
  }

  // ---------------------------------------------------------------- route 1
  // `factories` holds offices and warehouses as well as plants, so a supplier
  // with two locations appears twice here. They are genuinely separate rows
  // that can each carry orders — the fix is to label them, the way the factory
  // map and list do, not to merge or hide them.
  const rows = [
    ...factories.map((factory) => ({
      id: factory.id,
      name: factoryLabel(factory),
      city: factory.city,
      locationType: factory.location_type,
      orders: ordersByFactory.get(factory.id) ?? [],
    })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  // Only shown when something is actually there, so the list does not carry a
  // permanent row for a case most teams never hit.
  const orphans = ordersByFactory.get(UNASSIGNED) ?? []
  if (orphans.length > 0) {
    rows.push({ id: UNASSIGNED, name: t('files.unassigned'), city: null, orders: orphans })
  }

  return (
    <Shell>
      <header className="mb-7">
        <h1 className="page-title">{t(sectionNameKey('files'))}</h1>
        <p className="page-subtitle">{t(sectionDescriptionKey('files'))}</p>
      </header>

      {loading ? (
        <CardSkeleton count={5} label={t('files.loading')} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('files.noFactories')} hint={t('files.noFactoriesHint')} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const fileTotal = row.orders.reduce(
              (sum, order) => sum + (fileCounts.get(order.id) ?? 0),
              0,
            )
            return (
              <li key={row.id}>
                <Link
                  to={`/files/${row.id}`}
                  className="card card-pad flex items-center gap-3 transition-colors hover:border-accent"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                    {row.id === UNASSIGNED ? (
                      <FolderOpen size={17} strokeWidth={1.75} />
                    ) : (
                      <Factory size={17} strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-ink">{row.name}</p>
                      {/* Only flagged when it is not a plant — a badge on every
                          row would carry no information. */}
                      {row.locationType && row.locationType !== 'factory' && (
                        <span className="badge-neutral flex-shrink-0">
                          {t(locationTypeKey(row.locationType))}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {tCount('files.orderCount', row.orders.length)}
                      <span aria-hidden="true" className="mx-1.5">
                        ·
                      </span>
                      {tCount('files.fileCount', fileTotal)}
                      {row.city && (
                        <>
                          <span aria-hidden="true" className="mx-1.5">
                            ·
                          </span>
                          {row.city}
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronRight size={16} strokeWidth={2} className="flex-shrink-0 text-muted" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Shell>
  )
}
