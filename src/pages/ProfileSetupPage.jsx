import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { DEPARTMENTS, departmentKey, roleKey } from '../lib/constants'
import LanguageSwitcher from '../components/Layout/LanguageSwitcher'
import logo from '../assets/logo.png'

/**
 * First-run onboarding. The email comes from the authenticated session and is
 * shown read-only; the role is displayed but not editable — only an
 * administrator can set it, and the database rejects role changes from
 * non-admins regardless of what the client sends.
 */
export default function ProfileSetupPage() {
  const { user, profile, profileComplete, updateOwnProfile } = useAuth()
  const { t, language } = useI18n()

  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [department, setDepartment] = useState(profile?.department ?? '')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (profileComplete) return <Navigate to="/" replace />

  const validate = () => {
    const errors = {}
    if (!firstName.trim()) errors.firstName = t('profile.firstNameRequired')
    if (!lastName.trim()) errors.lastName = t('profile.lastNameRequired')
    if (!DEPARTMENTS.includes(department)) errors.department = t('profile.departmentRequired')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      await updateOwnProfile({
        first_name: firstName,
        last_name: lastName,
        department,
        language,
      })
      // profileComplete flips to true and the guard above redirects to "/"
    } catch (err) {
      console.error('Profile save failed:', err)
      setFormError(t('profile.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center">
          <img src={logo} alt="" className="h-10 w-auto" />
          <h1 className="mt-5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
            {t('profile.setupTitle')}
          </h1>
          <p className="mt-1.5 text-center text-[14px] text-muted">{t('profile.setupSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="card card-pad shadow-subtle">
          {formError && (
            <p role="alert" className="alert-error mb-4">
              {formError}
            </p>
          )}

          <div className="mb-4 rounded-xl bg-canvas px-3.5 py-3">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
              {t('profile.signedInAs')}
            </p>
            <p className="mt-0.5 truncate text-[14px] text-ink">{user?.email}</p>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label">
                {t('profile.firstName')}
              </label>
              <input
                id="firstName"
                autoFocus
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.firstName)}
                className={`input ${fieldErrors.firstName ? 'input-error' : ''}`}
              />
              {fieldErrors.firstName && (
                <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.firstName}</p>
              )}
            </div>
            <div>
              <label htmlFor="lastName" className="label">
                {t('profile.lastName')}
              </label>
              <input
                id="lastName"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-invalid={Boolean(fieldErrors.lastName)}
                className={`input ${fieldErrors.lastName ? 'input-error' : ''}`}
              />
              {fieldErrors.lastName && (
                <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="department" className="label">
              {t('profile.department')}
            </label>
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              aria-invalid={Boolean(fieldErrors.department)}
              className={`select ${fieldErrors.department ? 'input-error' : ''}`}
            >
              <option value="">{t('profile.selectDepartment')}</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {t(departmentKey(d))}
                </option>
              ))}
            </select>
            {fieldErrors.department && (
              <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.department}</p>
            )}
          </div>

          <p className="mb-5 flex items-baseline gap-2 rounded-xl bg-canvas px-3.5 py-3 text-[13px] text-muted">
            <span className="badge-neutral">{t(roleKey(profile?.role ?? 'business_user'))}</span>
            <span>{t('profile.roleAssignedByAdmin')}</span>
          </p>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('common.saving') : t('profile.saveProfile')}
          </button>
        </form>

        <LanguageSwitcher variant="inline" className="mt-6" />
      </div>
    </div>
  )
}
