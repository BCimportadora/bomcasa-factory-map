import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { DEPARTMENTS, departmentKey, roleKey } from '../lib/constants'
import PasswordFields, { validateNewPassword } from '../components/Auth/PasswordFields'
import LanguageSwitcher from '../components/Layout/LanguageSwitcher'
import ThemeSwitcher from '../components/Layout/ThemeSwitcher'

function Section({ title, subtitle, children }) {
  return (
    <section className="card card-pad">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

/** Read-only row for values the user cannot change here. */
function ReadOnlyRow({ label, children }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="rounded-xl bg-canvas px-3.5 py-2.5 text-[15px] text-ink">{children}</div>
    </div>
  )
}

function DetailsForm() {
  const { user, profile, updateOwnProfile } = useAuth()
  const { t } = useI18n()

  const [values, setValues] = useState({
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    department: profile?.department ?? '',
  })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null) // 'saved' | 'error'
  const [saving, setSaving] = useState(false)

  const set = (name) => (e) => {
    setValues((v) => ({ ...v, [name]: e.target.value }))
    setStatus(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!values.first_name.trim()) next.first_name = t('profile.firstNameRequired')
    if (!values.last_name.trim()) next.last_name = t('profile.lastNameRequired')
    if (!DEPARTMENTS.includes(values.department)) next.department = t('profile.departmentRequired')
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    setStatus(null)
    try {
      // role is deliberately not sent; the database rejects role changes from
      // non-admins in any case.
      await updateOwnProfile(values)
      setStatus('saved')
    } catch (err) {
      console.error('Account update failed:', err)
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {status === 'saved' && <p className="alert-success">{t('account.saved')}</p>}
      {status === 'error' && (
        <p role="alert" className="alert-error">
          {t('account.saveError')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="first_name" className="label">
            {t('profile.firstName')}
          </label>
          <input
            id="first_name"
            value={values.first_name}
            onChange={set('first_name')}
            aria-invalid={Boolean(errors.first_name)}
            className={`input ${errors.first_name ? 'input-error' : ''}`}
          />
          {errors.first_name && <p className="mt-1.5 text-[13px] text-danger">{errors.first_name}</p>}
        </div>
        <div>
          <label htmlFor="last_name" className="label">
            {t('profile.lastName')}
          </label>
          <input
            id="last_name"
            value={values.last_name}
            onChange={set('last_name')}
            aria-invalid={Boolean(errors.last_name)}
            className={`input ${errors.last_name ? 'input-error' : ''}`}
          />
          {errors.last_name && <p className="mt-1.5 text-[13px] text-danger">{errors.last_name}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="department" className="label">
          {t('profile.department')}
        </label>
        <select
          id="department"
          value={values.department}
          onChange={set('department')}
          aria-invalid={Boolean(errors.department)}
          className={`select ${errors.department ? 'input-error' : ''}`}
        >
          <option value="">{t('profile.selectDepartment')}</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {t(departmentKey(d))}
            </option>
          ))}
        </select>
        {errors.department && <p className="mt-1.5 text-[13px] text-danger">{errors.department}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ReadOnlyRow label={t('account.email')}>
          <span className="block truncate">{user?.email}</span>
        </ReadOnlyRow>
        <ReadOnlyRow label={t('account.role')}>
          {t(roleKey(profile?.role ?? 'business_user'))}
        </ReadOnlyRow>
      </div>
      <p className="hint">{t('account.emailManagedByAdmin')}</p>

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t('common.saving') : t('account.saveChanges')}
        </button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const { updatePassword } = useAuth()
  const { t } = useI18n()
  const [values, setValues] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }))
    setStatus(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validation = validateNewPassword(values, t)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    setSaving(true)
    const { error } = await updatePassword(values.password)
    setSaving(false)

    if (error) {
      setStatus(error.status === 429 ? 'rate' : 'error')
      return
    }
    setStatus('saved')
    setValues({ password: '', confirm: '' })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {status === 'saved' && <p className="alert-success">{t('auth.passwordUpdated')}</p>}
      {status === 'error' && (
        <p role="alert" className="alert-error">
          {t('auth.resetError')}
        </p>
      )}
      {status === 'rate' && (
        <p role="alert" className="alert-error">
          {t('auth.resetRateLimited')}
        </p>
      )}

      <PasswordFields
        password={values.password}
        confirm={values.confirm}
        onChange={handleChange}
        errors={errors}
      />

      <div className="flex justify-end pt-1">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t('common.saving') : t('account.changePassword')}
        </button>
      </div>
    </form>
  )
}

export default function AccountPage() {
  const { t } = useI18n()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7">
          <h1 className="page-title">{t('account.title')}</h1>
          <p className="page-subtitle">{t('account.subtitle')}</p>
        </header>

        <div className="space-y-5">
          <Section title={t('account.detailsTitle')} subtitle={t('account.detailsSubtitle')}>
            <DetailsForm />
          </Section>

          <Section title={t('account.appearanceTitle')} subtitle={t('account.appearanceSubtitle')}>
            <ThemeSwitcher className="max-w-sm" />
          </Section>

          <Section title={t('account.languageTitle')} subtitle={t('account.languageSubtitle')}>
            <LanguageSwitcher className="max-w-xs" />
          </Section>

          <Section title={t('account.passwordTitle')} subtitle={t('account.passwordSubtitle')}>
            <PasswordForm />
          </Section>
        </div>
      </div>
    </div>
  )
}
