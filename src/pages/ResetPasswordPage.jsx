import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { authRedirectParams, authRedirectError, isExpiredLink } from '../lib/authRedirect'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import PasswordFields, { validateNewPassword } from '../components/Auth/PasswordFields'
import LanguageSwitcher from '../components/Layout/LanguageSwitcher'
import logo from '../assets/logo.png'

/**
 * Landing page for the link in the reset email.
 *
 * supabase-js consumes the recovery token from the URL on load and turns it
 * into a session, so reaching this page with no session means the link was
 * invalid or has expired.
 */
export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [values, setValues] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true

    // The token may still be in flight when this mounts, so listen as well as read.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) {
        setHasRecoverySession(true)
        setChecking(false)
      }
    })

    async function establishSession() {
      // Supabase reported the link itself as bad — no point probing further.
      if (authRedirectError) {
        if (active) setChecking(false)
        return
      }

      const { data } = await supabase.auth.getSession()
      if (data.session) {
        if (active) {
          setHasRecoverySession(true)
          setChecking(false)
        }
        return
      }

      // Formats supabase-js does not consume on its own.
      const { code, token_hash: tokenHash } = authRedirectParams
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (active) {
          setHasRecoverySession(!error)
          setChecking(false)
        }
        return
      }
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (active) {
          setHasRecoverySession(!error)
          setChecking(false)
        }
        return
      }

      if (active) setChecking(false)
    }

    establishSession()

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const handleChange = (name, value) => setValues((v) => ({ ...v, [name]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const validation = validateNewPassword(values, t)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSubmitting(true)
    const { error } = await updatePassword(values.password)
    setSubmitting(false)

    if (error) {
      setFormError(error.status === 429 ? t('auth.resetRateLimited') : t('auth.resetError'))
      return
    }
    setDone(true)
    setTimeout(() => navigate('/', { replace: true }), 1800)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center">
          <img src={logo} alt="" className="h-12 w-auto" />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {t('auth.resetTitle')}
          </h1>
          {!checking && hasRecoverySession && !done && (
            <p className="mt-1.5 text-center text-[14px] text-muted">{t('auth.resetSubtitle')}</p>
          )}
        </div>

        {checking ? (
          <p className="text-center text-[15px] text-muted">{t('auth.checkingSession')}</p>
        ) : done ? (
          <p className="alert-success text-center">{t('auth.passwordUpdated')}</p>
        ) : !hasRecoverySession ? (
          <>
            <p className="alert-error">{t('auth.resetLinkInvalid')}</p>
            {isExpiredLink && <p className="hint mt-3 leading-relaxed">{t('auth.resetLinkExpiredHint')}</p>}
            {authRedirectError?.description && (
              <p className="hint mt-2 break-words">
                <span className="font-medium">{t('errors.details')}:</span>{' '}
                {authRedirectError.description}
              </p>
            )}
            <p className="mt-5 text-center">
              <Link to="/forgot-password" className="btn-primary w-full">
                {t('auth.sendResetLink')}
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="card card-pad space-y-4 shadow-subtle">
            {formError && (
              <p role="alert" className="alert-error">
                {formError}
              </p>
            )}
            <PasswordFields
              password={values.password}
              confirm={values.confirm}
              onChange={handleChange}
              errors={errors}
              autoFocus
            />
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('common.saving') : t('auth.updatePassword')}
            </button>
          </form>
        )}

        <p className="mt-5 text-center">
          <Link to="/login" className="text-[13px] font-medium text-muted hover:text-ink">
            {t('auth.backToSignIn')}
          </Link>
        </p>

        <LanguageSwitcher variant="inline" className="mt-6" />
      </div>
    </div>
  )
}
