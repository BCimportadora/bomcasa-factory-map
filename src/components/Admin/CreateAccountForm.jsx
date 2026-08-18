import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useI18n } from '../../i18n'
import { DEPARTMENTS, ROLES, departmentKey, roleKey } from '../../lib/constants'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMPTY = { email: '', first_name: '', last_name: '', department: '', role: 'business_user' }

/** Map an error code onto a translated message. */
function errorKeyFor(code) {
  switch (code) {
    case 'email_taken':
      return 'admin.emailTaken'
    case 'forbidden':
      return 'errors.accessDeniedMessage'
    case 'not_deployed':
      return 'admin.notConfigured'
    case 'network':
      return 'errors.network'
    default:
      return 'admin.createError'
  }
}

/**
 * Work out what actually went wrong.
 *
 * The HTTP status is the most reliable signal, so it is checked first: when the
 * function has not been deployed Supabase answers 404 with {"code":"NOT_FOUND"},
 * which carries no `error` field of ours. The response is cloned before reading
 * so the body stays available to callers.
 */
async function resolveErrorCode(error) {
  const status = error?.context?.status

  if (status === 404) return 'not_deployed'
  if (status === 403) return 'forbidden'
  if (status === 409) return 'email_taken'
  // No context at all means the request never completed (offline, DNS, CORS).
  if (!error?.context) return 'network'

  try {
    const body = await error.context.clone().json()
    if (body?.error) return body.error
    if (body?.code === 'NOT_FOUND') return 'not_deployed'
  } catch {
    // Non-JSON body; fall through to the generic message.
  }
  return 'create_failed'
}

export default function CreateAccountForm({ onCreated, onCancel }) {
  const { t } = useI18n()
  const [values, setValues] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }))

  const validate = () => {
    const errors = {}
    const email = values.email.trim()
    if (!email) errors.email = t('admin.emailRequired')
    else if (!EMAIL_RE.test(email)) errors.email = t('admin.emailInvalid')
    if (!values.first_name.trim()) errors.first_name = t('admin.firstNameRequired')
    if (!values.last_name.trim()) errors.last_name = t('admin.lastNameRequired')
    if (!DEPARTMENTS.includes(values.department)) errors.department = t('admin.departmentRequired')
    if (!ROLES.includes(values.role)) errors.role = t('admin.roleRequired')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: values.email.trim().toLowerCase(),
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          department: values.department,
          role: values.role,
        },
      })

      if (error) {
        setFormError(t(errorKeyFor(await resolveErrorCode(error))))
        return
      }

      onCreated({ email: data.email, temporaryPassword: data.temporary_password })
      setValues(EMPTY)
    } catch (err) {
      console.error('Account creation failed:', err)
      setFormError(t('admin.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  const field = (name, label, props = {}) => (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input
        id={name}
        value={values[name]}
        onChange={set(name)}
        aria-invalid={Boolean(fieldErrors[name])}
        className={`input ${fieldErrors[name] ? 'input-error' : ''}`}
        {...props}
      />
      {fieldErrors[name] && <p className="mt-1.5 text-[13px] text-danger">{fieldErrors[name]}</p>}
    </div>
  )

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="alert-error">
          {formError}
        </p>
      )}

      {field('email', t('admin.email'), { type: 'email', autoComplete: 'off', autoFocus: true })}

      <div className="grid gap-4 sm:grid-cols-2">
        {field('first_name', t('admin.firstName'))}
        {field('last_name', t('admin.lastName'))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="department" className="label">
            {t('admin.department')}
          </label>
          <select
            id="department"
            value={values.department}
            onChange={set('department')}
            aria-invalid={Boolean(fieldErrors.department)}
            className={`select ${fieldErrors.department ? 'input-error' : ''}`}
          >
            <option value="">{t('admin.selectDepartment')}</option>
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

        <div>
          <label htmlFor="role" className="label">
            {t('admin.role')}
          </label>
          <select
            id="role"
            value={values.role}
            onChange={set('role')}
            aria-invalid={Boolean(fieldErrors.role)}
            className={`select ${fieldErrors.role ? 'input-error' : ''}`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(roleKey(r))}
              </option>
            ))}
          </select>
          {fieldErrors.role && <p className="mt-1.5 text-[13px] text-danger">{fieldErrors.role}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('admin.creating') : t('admin.create')}
        </button>
      </div>
    </form>
  )
}
