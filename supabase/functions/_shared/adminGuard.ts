// Shared server-side authorisation for the administrator Edge Functions.
//
// The rule everywhere: never trust anything the client says about who it is.
// The bearer token is verified against the auth server, and the role is then
// re-read from public.profiles with the service role. A tampered request body,
// a patched frontend or an edited localStorage value cannot influence this.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** Service-role client. Bypasses RLS, so it must only be used after authorising. */
export function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return null
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type AdminContext = { admin: SupabaseClient; callerId: string }

/**
 * Resolve the caller and require that they are an administrator.
 * Returns either a Response to send back immediately, or the admin context.
 */
export async function requireAdmin(req: Request): Promise<{ error: Response } | AdminContext> {
  const admin = serviceClient()
  if (!admin) return { error: json({ error: 'server_misconfigured' }, 500) }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: json({ error: 'unauthorized' }, 401) }

  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller?.user) return { error: json({ error: 'unauthorized' }, 401) }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .single()

  if (profileError) {
    console.error('Failed to load caller profile:', profileError.message)
    return { error: json({ error: 'server_error' }, 500) }
  }
  if (profile?.role !== 'admin') return { error: json({ error: 'forbidden' }, 403) }

  return { admin, callerId: caller.user.id }
}

/** Temporary password handed to the user out of band; never stored by us. */
export function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
