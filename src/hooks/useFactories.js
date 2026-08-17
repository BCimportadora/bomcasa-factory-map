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

  return { factories, loading, error, createFactory, updateFactory, deleteFactory, refetch: fetchFactories }
}
