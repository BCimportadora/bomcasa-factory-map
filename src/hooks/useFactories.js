import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useFactories() {
  const [factories, setFactories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchFactories = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('factories').select('*').order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setFactories(data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchFactories()

    const channel = supabase
      .channel('factories-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'factories' }, () => {
        fetchFactories()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchFactories])

  /**
   * The rows as the database has them right now, returned rather than pushed
   * into state.
   *
   * `factories` above is only refreshed when the realtime subscription fires,
   * and a component reads whatever its closure captured at render time. That
   * is fine for display and wrong for deciding whether a row already exists:
   * an import that answers that question from stale state re-inserts
   * everything it cannot see. Ask the database when the answer has to be true.
   */
  const listFactories = async () => {
    const { data, error } = await supabase.from('factories').select('*')
    if (error) throw error
    return data ?? []
  }

  const createFactory = async (factory) => {
    const { data, error } = await supabase.from('factories').insert(factory).select().single()
    if (error) throw error
    return data
  }

  const updateFactory = async (id, updates) => {
    const { data, error } = await supabase.from('factories').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  }

  const deleteFactory = async (id) => {
    const { error } = await supabase.from('factories').delete().eq('id', id)
    if (error) throw error
  }

  return {
    factories,
    loading,
    error,
    listFactories,
    createFactory,
    updateFactory,
    deleteFactory,
    refetch: fetchFactories,
  }
}
