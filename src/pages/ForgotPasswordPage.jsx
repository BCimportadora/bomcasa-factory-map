import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/Layout/LanguageSwitcher'
import logo from '../assets/logo.png'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')

    const trimmed = email.trim()
    if (!trimmed) return setFieldError(t('auth.emailRequired'))
    if (!EMAIL_RE.test(trimmed)) return setFieldError(t('auth.emailInvalid'))
    setFieldError('')

    setSubmitting(true)
    const { error } = await sendPasswordReset(trimmed)
    setSubmitting(false)

    if (error && error.status === 429) {
      setFormError(t('auth.resetRateLimited'))
      return
    }
    // Any other outcome reports success: revealing whether an address is
    // registered would let anyone enumerate accounts.
    setSent(true)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center">
          <img src={logo} alt="" className="h-12 w-auto" />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {sent ? t('auth.resetLinkSent') : t('auth.forgotTitle')}
          </h1>
          <p className="mt-1.5 text-center text-[14px] leading-relaxed text-muted">
            {sent ? t('auth.resetLinkSentDetail', { email: email.trim() }) : t('auth.forgotSubtitle')}
          </p>
        </div>

        {!sent && (
          <form onSubmit={handleSubmit} noValidate className="card card-pad shadow-subtle">
            {formError && (
              <p role="alert" className="alert-error mb-4">
                {formError}
              </p>
            )}

            <div className="mb-5">
              <label htmlFor="email" className="label">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(fieldError)}
                className={`input ${fieldError ? 'input-error' : ''}`}
              />
              {fieldError && <p className="mt-1.5 text-[13px] text-danger">{fieldError}</p>}
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('auth.sending') : t('auth.sendResetLink')}
            </button>
          </form>
        )}

        <p className="mt-5 text-center">
          <Link to="/login" className="text-[13px] font-medium text-accent hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </p>

        <LanguageSwitcher variant="inline" className="mt-6" />
      </div>
    </div>
  )
}
