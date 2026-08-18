// Supabase Edge Function: admin-user-actions
//
// Administrator operations on other accounts: deleting a user, and resetting a
// user's password. Both require the service-role key, which must never reach
// the browser, and both are authorised server-side by requireAdmin() — a
// business user calling this endpoint directly gets 403 no matter what the
// request contains.
//
// Deploy with:  supabase functions deploy admin-user-actions

import { CORS_HEADERS, json, requireAdmin, generatePassword, UUID_RE } from '../_shared/adminGuard.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin, callerId } = auth

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const action = String(payload.action ?? '')
  const userId = String(payload.user_id ?? '')

  if (!UUID_RE.test(userId)) return json({ error: 'invalid_user_id' }, 400)

  // The target must exist. Also gives us the email for the response.
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, email, role')
    .eq('id', userId)
    .single()

  if (targetError || !target) return json({ error: 'user_not_found' }, 404)

  switch (action) {
    case 'delete': {
      // Refuse self-deletion: an administrator removing their own account can
      // leave the project with no way back in.
      if (userId === callerId) return json({ error: 'cannot_delete_self' }, 400)

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) {
        console.error('deleteUser failed:', error.message)
        return json({ error: 'delete_failed' }, 400)
      }
      // public.profiles cascades from auth.users, so no second delete is needed.
      return json({ id: userId, email: target.email, deleted: true })
    }

    case 'reset_password': {
      const temporaryPassword = generatePassword()
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
      })
      if (error) {
        console.error('updateUserById failed:', error.message)
        return json({ error: 'reset_failed' }, 400)
      }
      // Returned once, to be passed to the user over a secure channel. Nothing
      // is written to our database: Supabase Auth stores only the hash.
      return json({ id: userId, email: target.email, temporary_password: temporaryPassword })
    }

    default:
      return json({ error: 'unknown_action' }, 400)
  }
})
