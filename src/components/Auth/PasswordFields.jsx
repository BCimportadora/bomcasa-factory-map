import { useI18n } from '../../i18n'

export const MIN_PASSWORD_LENGTH = 8

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
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={password}
          onChange={(e) => onChange('password', e.target.value)}
          aria-invalid={Boolean(errors.password)}
          className={`input ${errors.password ? 'input-error' : ''}`}
        />
        {errors.password && <p className="mt-1.5 text-[13px] text-danger">{errors.password}</p>}
      </div>

      <div>
        <label htmlFor="confirm" className="label">
          {t('auth.confirmPassword')}
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onChange('confirm', e.target.value)}
          aria-invalid={Boolean(errors.confirm)}
          className={`input ${errors.confirm ? 'input-error' : ''}`}
        />
        {errors.confirm && <p className="mt-1.5 text-[13px] text-danger">{errors.confirm}</p>}
      </div>
    </>
  )
}
