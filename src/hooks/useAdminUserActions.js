import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Calls the admin-user-actions Edge Function.
 *
 * Authorisation is decided there, on the server; this hook only reports what
 * came back. A business user reaching this code would receive 403.
 */

/** Translate an HTTP status / error body into a message key. */
async function resolveErrorKey(error) {
  const status = error?.context?.status
  if (status === 404) return 'admin.notConfigured'
  if (status === 403) return 'errors.accessDeniedMessage'
  if (!error?.context) return 'errors.network'

  try {
    const body = await error.context.clone().json()
    switch (body?.error) {
      case 'cannot_delete_self':
        return 'admin.cannotDeleteSelf'
      case 'user_not_found':
        return 'admin.userNotFound'
      case 'forbidden':
        return 'errors.accessDeniedMessage'
      default:
        break
    }
    if (body?.code === 'NOT_FOUND') return 'admin.notConfigured'
  } catch {
    // non-JSON body
  }
  return 'errors.generic'
}

export function useAdminUserActions() {
  const [busy, setBusy] = useState(false)

  const invoke = useCallback(async (action, userId) => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-actions', {
        body: { action, user_id: userId },
      })
      if (error) return { ok: false, errorKey: await resolveErrorKey(error) }
      return { ok: true, data }
    } catch (err) {
      console.error(`admin action "${action}" failed:`, err)
      return { ok: false, errorKey: 'errors.generic' }
    } finally {
      setBusy(false)
    }
  }, [])

  const deleteUser = useCallback((userId) => invoke('delete', userId), [invoke])
  const resetPassword = useCallback((userId) => invoke('reset_password', userId), [invoke])

  return { deleteUser, resetPassword, busy }
}
