import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setSuggestions(data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSuggestions()

    const channel = supabase
      .channel('suggestions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, fetchSuggestions)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchSuggestions])

  const createSuggestion = async (values) => {
    const { data, error } = await supabase
      .from('suggestions')
      .insert({
        title: values.title.trim(),
        body: values.body?.trim() || null,
        created_by: values.created_by,
      })
      .select()
      .single()
    if (error) throw error
    await fetchSuggestions()
    return data
  }

  /** Authors reword their own; the trigger keeps status and response out of it. */
  const updateSuggestion = async (id, values) => {
    const { error } = await supabase
      .from('suggestions')
      .update({ title: values.title.trim(), body: values.body?.trim() || null })
      .eq('id', id)
    if (error) throw error
    await fetchSuggestions()
  }

  /**
   * Decide on a suggestion. The database refuses this for non-administrators,
   * so a failure here is a real answer rather than something to work around.
   */
  const decide = async (id, status, response) => {
    const { error } = await supabase
      .from('suggestions')
      .update({ status, response: response?.trim() || null })
      .eq('id', id)
    if (error) throw error
    await fetchSuggestions()
  }

  const deleteSuggestion = async (id) => {
    const { error } = await supabase.from('suggestions').delete().eq('id', id)
    if (error) throw error
    await fetchSuggestions()
  }

  return {
    suggestions,
    loading,
    error,
    createSuggestion,
    updateSuggestion,
    decide,
    deleteSuggestion,
    refetch: fetchSuggestions,
  }
}
