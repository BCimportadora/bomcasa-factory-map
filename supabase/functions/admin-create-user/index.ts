// Supabase Edge Function: admin-create-user
//
// Creates a new account. This is the ONLY way accounts are created in the app —
// public sign-up is disabled — and every check that matters happens here on the
// server, where the client cannot influence it. Authorisation lives in
// ../_shared/adminGuard.ts: the caller's role is re-read from the database
// rather than taken from the request.
//
// Deploy with:  supabase functions deploy admin-create-user

import { CORS_HEADERS, json, requireAdmin, generatePassword } from '../_shared/adminGuard.ts'

const DEPARTMENTS = ['sales', 'rnd_purchasing', 'administration', 'accounting']
const ROLES = ['admin', 'business_user']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = await requireAdmin(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const email = String(payload.email ?? '').trim().toLowerCase()
  const firstName = String(payload.first_name ?? '').trim()
  const lastName = String(payload.last_name ?? '').trim()
  const department = String(payload.department ?? '').trim()
  const role = String(payload.role ?? '').trim()

  const fieldErrors: Record<string, string> = {}
  if (!email) fieldErrors.email = 'required'
  else if (!EMAIL_RE.test(email)) fieldErrors.email = 'invalid'
  if (!firstName) fieldErrors.first_name = 'required'
  if (!lastName) fieldErrors.last_name = 'required'
  if (!DEPARTMENTS.includes(department)) fieldErrors.department = 'invalid'
  if (!ROLES.includes(role)) fieldErrors.role = 'invalid'

  if (Object.keys(fieldErrors).length > 0) {
    return json({ error: 'validation_failed', fields: fieldErrors }, 400)
  }

  const temporaryPassword = generatePassword()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, department },
  })

  if (createError) {
    const message = createError.message?.toLowerCase() ?? ''
    if (message.includes('already') || message.includes('exists') || message.includes('registered')) {
      return json({ error: 'email_taken' }, 409)
    }
    console.error('createUser failed:', createError.message)
    return json({ error: 'create_failed' }, 400)
  }

  const newUserId = created.user?.id
  if (!newUserId) return json({ error: 'create_failed' }, 500)

  // Set profile fields and role with the service role (bypasses RLS).
  const { error: updateError } = await admin
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, department, role, email })
    .eq('id', newUserId)

  if (updateError) {
    // Do not leave a half-created account behind.
    await admin.auth.admin.deleteUser(newUserId)
    console.error('Profile update failed, rolled back user:', updateError.message)
    return json({ error: 'create_failed' }, 500)
  }

  return json({ id: newUserId, email, temporary_password: temporaryPassword }, 201)
})
