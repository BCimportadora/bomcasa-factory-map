import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/** Columns that live on `orders`. Anything else on a form value is ignored. */
const ORDER_COLUMNS = [
  'reference',
  'factory_id',
  'status',
  'currency',
  'fob_port',
  'order_date',
  'ready_date',
  'etd',
  'eta',
  'container_no',
  'bl_number',
  'notes',
]

const ITEM_COLUMNS = ['product', 'quantity', 'unit', 'unit_price']

/** A date column left blank must go to the database as null, not ''. */
const DATE_COLUMNS = new Set(['order_date', 'ready_date', 'etd', 'eta'])
const NUMERIC_COLUMNS = new Set(['quantity', 'unit_price'])

const clean = (value, column) => {
  if (typeof value !== 'string') return value ?? null
  const trimmed = value.trim()
  if (trimmed === '') return DATE_COLUMNS.has(column) || NUMERIC_COLUMNS.has(column) ? null : ''
  if (NUMERIC_COLUMNS.has(column)) {
    const parsed = parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return trimmed
}

const orderPayload = (values) =>
  Object.fromEntries(ORDER_COLUMNS.filter((c) => c in values).map((c) => [c, clean(values[c], c)]))

const itemPayload = (item, index, orderId) => ({
  ...Object.fromEntries(ITEM_COLUMNS.map((c) => [c, clean(item[c], c)])),
  order_id: orderId,
  line_no: index,
})

/** Lines are typed in a meaningful order; the API does not promise to keep it. */
const sortItems = (order) => ({
  ...order,
  order_items: [...(order.order_items ?? [])].sort((a, b) => (a.line_no ?? 0) - (b.line_no ?? 0)),
})

export function useOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setOrders((data ?? []).map(sortItems))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchOrders()

    // Line items are watched too: editing an order's products without touching
    // the order row itself would otherwise leave every other tab showing the
    // old totals.
    const channel = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchOrders])

  const replaceItems = async (orderId, items, previousItems = []) => {
    const rows = (items ?? [])
      .filter((item) => item.product?.trim())
      .map((item, index) => itemPayload(item, index, orderId))

    // Insert the replacements before removing what they replace. The two steps
    // are not one transaction, so if the second fails the order shows duplicate
    // lines, which is visible and fixable — the other order would silently lose
    // the products instead.
    if (rows.length > 0) {
      const { error } = await supabase.from('order_items').insert(rows)
      if (error) throw error
    }

    const staleIds = previousItems.map((item) => item.id).filter(Boolean)
    if (staleIds.length > 0) {
      const { error } = await supabase.from('order_items').delete().in('id', staleIds)
      if (error) throw error
    }
  }

  const createOrder = async (values, items) => {
    const { data, error } = await supabase
      .from('orders')
      .insert(orderPayload(values))
      .select()
      .single()
    if (error) throw error
    await replaceItems(data.id, items)
    await fetchOrders()
    return data
  }

  const updateOrder = async (id, values, items, previousItems) => {
    const { data, error } = await supabase
      .from('orders')
      .update(orderPayload(values))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    if (items) await replaceItems(id, items, previousItems)
    await fetchOrders()
    return data
  }

  /** Advancing an order along the lifecycle touches nothing else. */
  const setStatus = async (id, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id)
    if (error) throw error
    await fetchOrders()
  }

  const deleteOrder = async (id) => {
    // order_items go with it: the foreign key is `on delete cascade`.
    const { error } = await supabase.from('orders').delete().eq('id', id)
    if (error) throw error
    await fetchOrders()
  }

  return {
    orders,
    loading,
    error,
    createOrder,
    updateOrder,
    setStatus,
    deleteOrder,
    refetch: fetchOrders,
  }
}
