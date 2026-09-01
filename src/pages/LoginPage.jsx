import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { PasswordInput } from '../components/Auth/PasswordFields'
import LanguageSwitcher from '../components/Layout/LanguageSwitcher'
import logo from '../assets/logo.png'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Map Supabase auth errors onto translated, non-revealing messages. */
function messageKeyFor(error) {
  const raw = error?.message?.toLowerCase() ?? ''
  if (raw.includes('invalid login') || raw.includes('invalid credentials')) return 'auth.invalidCredentials'
  if (raw.includes('email not confirmed')) return 'auth.emailNotConfirmed'
  return 'auth.genericError'
}

export default function LoginPage() {
  const { signIn, user, loading } = useAuth()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  const validate = () => {
    const errors = {}
    if (!email.trim()) errors.email = t('auth.emailRequired')
    else if (!EMAIL_RE.test(email.trim())) errors.email = t('auth.emailInvalid')
    if (!password) errors.password = t('auth.passwordRequired')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSubmitting(true)
    const { error } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (error) setFormError(t(messageKeyFor(error)))
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center">
          <img src={logo} alt="" className="h-12 w-auto" />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {t('auth.signInTitle')}
          </h1>
          <p className="mt-1.5 text-center text-[14px] text-muted">{t('auth.signInSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="card card-pad shadow-subtle">
          {formError && (
            <p role="alert" className="alert-error mb-4">
              {formError}
            </p>
          )}

          <div className="mb-4">
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
              aria-invalid={Boolean(fieldErrors.email)}
              className={`input ${fieldErrors.email ? 'input-error' : ''}`}
            />
            {fieldErrors.email && <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.email}</p>}
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="label">
              {t('auth.password')}
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />
            {fieldErrors.password && (
              <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.password}</p>
            )}
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          <p className="mt-4 text-center">
            <Link to="/forgot-password" className="text-[13px] text-muted hover:text-ink">
              {t('auth.forgotPassword')}
            </Link>
          </p>
        </form>

        <p className="mt-5 text-center text-[13px] leading-relaxed text-muted">
          {t('auth.noPublicSignup')}
        </p>

        <LanguageSwitcher variant="inline" className="mt-6" />
      </div>
    </div>
  )
}
