import { useMemo, useState } from 'react'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { useOrders } from '../hooks/useOrders'
import { useFactories } from '../hooks/useFactories'
import { ORDER_VIEWS, byDate, formatMoney, orderTotal, statusKey, viewEmptyKey } from '../lib/orders'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import OrderCard from '../components/Order/OrderCard'
import OrderForm from '../components/Order/OrderForm'
import OrderDetail from '../components/Order/OrderDetail'
import LiquidationImport from '../components/Order/LiquidationImport'

/**
 * Both order sections render from here.
 *
 * `view` picks which slice of the single orders table is shown and which date
 * the board is sorted by. There is no second page and no second table, so an
 * order that ships simply appears in the other tile.
 */
export default function OrdersPage({ view }) {
  const config = ORDER_VIEWS[view]
  const { t, language, tCount } = useI18n()
  const { user, isAdmin } = useAuth()
  const { orders, loading, error, createOrder, updateOrder, setStatus, deleteOrder, importLiquidation } =
    useOrders()
  const { factories } = useFactories()

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [factoryId, setFactoryId] = useState('')
  const [editing, setEditing] = useState(null) // an order, or the string 'new'
  const [deleting, setDeleting] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [importing, setImporting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const canManage = (order) => isAdmin || order.created_by === user?.id

  const factoriesById = useMemo(
    () => new Map(factories.map((factory) => [factory.id, factory])),
    [factories],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders
      .filter((order) => {
        // A status filter narrows within the view; with none set the view shows
        // only its own statuses, which is what keeps a cancelled order out of
        // the way until it is asked for by name.
        if (statusFilter ? order.status !== statusFilter : !config.statuses.includes(order.status)) {
          return false
        }
        if (factoryId && order.factory_id !== factoryId) return false
        if (!q) return true
        const haystack = [
          order.reference,
          order.container_no,
          order.bl_number,
          factoriesById.get(order.factory_id)?.name,
          ...(order.order_items ?? []).map((item) => item.product),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort(byDate(config.dateField))
  }, [orders, statusFilter, factoryId, query, config, factoriesById])

  /** Totals only add up within one currency, so they are reported per currency. */
  const totals = useMemo(() => {
    const sums = new Map()
    for (const order of visible) {
      const currency = order.currency ?? 'USD'
      sums.set(currency, (sums.get(currency) ?? 0) + orderTotal(order))
    }
    return [...sums.entries()].filter(([, amount]) => amount > 0)
  }, [visible])

  const handleSubmit = async (values, items) => {
    setSubmitting(true)
    setActionError('')
    try {
      if (editing === 'new') {
        await createOrder({ ...values, created_by: user.id }, items)
      } else {
        await updateOrder(editing.id, values, items, editing.order_items ?? [])
      }
      setEditing(null)
    } catch (err) {
      setActionError(err.message ?? t('orders.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleAdvance = async (order, next) => {
    setActionError('')
    try {
      await setStatus(order.id, next)
    } catch (err) {
      setActionError(err.message ?? t('orders.saveError'))
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      await deleteOrder(deleting.id)
      setDeleting(null)
    } catch (err) {
      setActionError(err.message ?? t('orders.deleteError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{t(sectionNameKey(config.sectionId))}</h1>
            <p className="page-subtitle">{t(sectionDescriptionKey(config.sectionId))}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setImporting(true)} className="btn-secondary">
              <FileSpreadsheet size={16} strokeWidth={2} />
              {t('liquidation.action')}
            </button>
            <button type="button" onClick={() => setEditing('new')} className="btn-primary">
              <Plus size={16} strokeWidth={2.25} />
              {t('orders.add')}
            </button>
          </div>
        </header>

        {actionError && (
          <p role="alert" className="alert-error mb-4">
            {actionError}
          </p>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="search"
            placeholder={t('orders.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('common.search')}
            className="input"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('orders.statusLabel')}
            className="select sm:w-48"
          >
            <option value="">{t('orders.allStatuses')}</option>
            {config.filterStatuses.map((value) => (
              <option key={value} value={value}>
                {t(statusKey(value))}
              </option>
            ))}
          </select>
          <select
            value={factoryId}
            onChange={(e) => setFactoryId(e.target.value)}
            aria-label={t('orders.factory')}
            className="select sm:w-52"
          >
            <option value="">{t('orders.allFactories')}</option>
            {factories.map((factory) => (
              <option key={factory.id} value={factory.id}>
                {factory.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('orders.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('orders.loadError')}</p>
        ) : visible.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t(viewEmptyKey(view))}</p>
            <p className="mt-1 text-[13px] text-muted">{t('orders.emptyHint')}</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-[13px] text-muted">{tCount('orders.count', visible.length)}</p>
              {totals.length > 0 && (
                <p className="text-[13px] text-muted">
                  {t('orders.total')}
                  {': '}
                  <span className="font-medium text-ink">
                    {totals
                      .map(([currency, amount]) => formatMoney(amount, currency, language))
                      .join('  ·  ')}
                  </span>
                </p>
              )}
            </div>

            <ul className="grid gap-3 lg:grid-cols-2">
              {visible.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  factory={factoriesById.get(order.factory_id)}
                  dateField={config.dateField}
                  canManage={canManage(order)}
                  onOpen={setViewing}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                  onAdvance={handleAdvance}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <Modal
          size="wide"
          title={editing === 'new' ? t('orders.addTitle') : t('orders.editTitle')}
          onClose={() => setEditing(null)}
        >
          <OrderForm
            initialValues={
              editing === 'new'
                ? { status: config.statuses[0], factory_id: factoryId || '' }
                : editing
            }
            factories={factories}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            submitting={submitting}
          />
        </Modal>
      )}

      {viewing && (
        <OrderDetail
          order={orders.find((o) => o.id === viewing.id) ?? viewing}
          factory={factoriesById.get(viewing.factory_id)}
          onClose={() => setViewing(null)}
        />
      )}

      {importing && (
        <LiquidationImport
          orders={orders}
          factories={factories}
          onImport={(parsed, options) =>
            importLiquidation(parsed, { ...options, userId: user.id })
          }
          onClose={() => setImporting(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('orders.deleteTitle')}
          message={t('orders.deleteConfirm')}
          subject={deleting.reference}
          confirmLabel={t('common.delete')}
          busy={submitting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
