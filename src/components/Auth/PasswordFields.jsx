import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useI18n } from '../../i18n'

export const MIN_PASSWORD_LENGTH = 8

/**
 * A password box with a show/hide toggle.
 *
 * Lives here rather than in its own file because this module already holds the
 * shared password pieces, and the login screen needs the same box.
 *
 * The toggle is a `button` and not an icon on a div, so Tab reaches it and a
 * screen reader is told what it does; `tabIndex={-1}` is deliberately NOT set,
 * since a person typing a long password is exactly who needs to reveal it.
 * `aria-pressed` reports which state it is in.
 */
export function PasswordInput({ id, error, ...props }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        aria-invalid={Boolean(error)}
        className={`input pr-11 ${error ? 'input-error' : ''}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-muted transition-colors hover:text-ink"
      >
        {visible ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}
      </button>
    </div>
  )
}

/**
 * Validate a new password and its confirmation.
 * Returns translated field errors keyed by input name.
 */
export function validateNewPassword({ password, confirm }, t) {
  const errors = {}
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = t('auth.passwordTooShort')
  else if (password !== confirm) errors.confirm = t('auth.passwordsDoNotMatch')
  return errors
}

/** New-password + confirmation pair, shared by the reset and settings screens. */
export default function PasswordFields({ password, confirm, onChange, errors, autoFocus }) {
  const { t } = useI18n()

  return (
    <>
      <div>
        <label htmlFor="password" className="label">
          {t('auth.newPassword')}
        </label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={password}
          onChange={(e) => onChange('password', e.target.value)}
          error={errors.password}
        />
        {errors.password && <p className="mt-1.5 text-[13px] text-danger">{errors.password}</p>}
      </div>

      <div>
        <label htmlFor="confirm" className="label">
          {t('auth.confirmPassword')}
        </label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onChange('confirm', e.target.value)}
          error={errors.confirm}
        />
        {errors.confirm && <p className="mt-1.5 text-[13px] text-danger">{errors.confirm}</p>}
      </div>
    </>
  )
}
