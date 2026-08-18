/**
 * Capture auth parameters from the landing URL.
 *
 * This module runs once, before the Supabase client is created, because
 * supabase-js strips the hash from the URL as soon as it processes it. Reading
 * afterwards would find nothing, which is why a failed recovery link used to
 * end up as a silent redirect to the sign-in page.
 *
 * Supabase can deliver a recovery in three shapes:
 *   - implicit: #access_token=…&type=recovery
 *   - PKCE:     ?code=…
 *   - verify:   ?token_hash=…&type=recovery
 * and reports failures as #error=…&error_code=…
 */
function parse(source) {
  if (!source) return {}
  return Object.fromEntries(new URLSearchParams(source.replace(/^[#?]/, '')))
}

const params = { ...parse(window.location.search), ...parse(window.location.hash) }

export const authRedirectParams = params

/** True when this page load is the result of a password-recovery link. */
export const isRecoveryRedirect =
  params.type === 'recovery' || Boolean(params.code) || Boolean(params.token_hash)

/** Supabase reports a bad or already-used link with error params. */
export const authRedirectError = params.error || params.error_code
  ? {
      code: params.error_code || params.error,
      description: params.error_description?.replace(/\+/g, ' ') ?? '',
    }
  : null

/** An expired or already-consumed one-time link. */
export const isExpiredLink =
  authRedirectError != null &&
  /expired|invalid|otp/i.test(`${authRedirectError.code} ${authRedirectError.description}`)
