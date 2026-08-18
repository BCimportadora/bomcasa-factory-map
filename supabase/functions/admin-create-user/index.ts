// Supabase Edge Function: admin-create-user
//
// Creates a new account. This is the ONLY way accounts are created in the app —
// public sign-up is disabled — and every check that matters happens here on the
// server, where the client cannot influence it.
//
// Authorisation flow:
//   1. Require a bearer token belonging to a real, signed-in user.
//   2. Re-read that user's role from the database with the service role. The
//      caller's claim about who they are is never trusted; only the row in
//      public.profiles decides.
//   3. Reject anyone who is not an administrator with 403.
//
// The service-role key lives only in the function's environment (Supabase
// injects SUPABASE_SERVICE_ROLE_KEY) and is never exposed to the browser.
//
// Deploy with:  supabase functions deploy admin-create-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const DEPARTMENTS = ['sales', 'rnd_purchasing', 'administration', 'accounting']
const ROLES = ['admin', 'business_user']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Temporary password the administrator passes to the new user out of band. */
function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return json({ error: 'server_misconfigured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // --- 1. authenticate the caller -----------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'unauthorized' }, 401)

  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller?.user) return json({ error: 'unauthorized' }, 401)

  // --- 2. authorise: the database decides whether they are an admin --------
  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()

  if (profileError) {
    console.error('Failed to load caller profile:', profileError.message)
    return json({ error: 'server_error' }, 500)
  }
  if (callerProfile?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  // --- 3. validate the payload --------------------------------------------
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

  // --- 4. create the auth user --------------------------------------------
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

  // --- 5. set profile fields and role (service role bypasses RLS) ----------
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
