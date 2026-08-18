import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * The people directory.
 *
 * Only non-sensitive columns are requested. Row-level security decides what is
 * readable; this select list additionally keeps data the UI does not need (such
 * as email) out of the client for ordinary directory use.
 */
const DIRECTORY_COLUMNS = 'id, first_name, last_name, department, role, created_at'

export function useProfiles({ includeEmail = false } = {}) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    const columns = includeEmail ? `${DIRECTORY_COLUMNS}, email` : DIRECTORY_COLUMNS
    const { data, error } = await supabase
      .from('profiles')
      .select(columns)
      .order('first_name', { ascending: true, nullsFirst: false })

    if (error) {
      setError(error.message)
    } else {
      setProfiles(data ?? [])
      setError(null)
    }
    setLoading(false)
  }, [includeEmail])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  return { profiles, loading, error, refetch: fetchProfiles }
}
