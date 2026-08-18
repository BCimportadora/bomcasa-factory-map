import { KeyRound, Trash2 } from 'lucide-react'
import Modal from '../common/Modal'
import { useI18n } from '../../i18n'
import { departmentKey, roleKey, fullName, initials } from '../../lib/constants'

function Row({ label, children }) {
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="w-36 flex-shrink-0 text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-[14px] text-ink">{children}</dd>
    </div>
  )
}

/**
 * Administrator's view of one account.
 *
 * Only profile data is shown. Passwords, hashes and tokens are never sent to
 * the browser in the first place — Supabase Auth holds them and the API does
 * not expose them.
 */
export default function UserProfileModal({ user, isSelf, onClose, onResetPassword, onDelete }) {
  const { t, language } = useI18n()

  const formatDate = (value) => {
    if (!value) return t('common.none')
    return new Date(value).toLocaleString(language === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  return (
    <Modal title={t('admin.profileTitle')} onClose={onClose}>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-[17px] font-semibold text-accent">
          {initials(user)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">
            {fullName(user) || t('people.incompleteProfile')}
          </p>
          <span className={`mt-1 ${user.role === 'admin' ? 'badge-accent' : 'badge-neutral'}`}>
            {t(roleKey(user.role))}
          </span>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-line border-t border-line pt-1">
        <Row label={t('admin.firstName')}>{user.first_name || t('common.none')}</Row>
        <Row label={t('admin.lastName')}>{user.last_name || t('common.none')}</Row>
        <Row label={t('admin.email')}>{user.email || t('common.none')}</Row>
        <Row label={t('admin.department')}>
          {user.department ? t(departmentKey(user.department)) : t('common.none')}
        </Row>
        <Row label={t('admin.role')}>{t(roleKey(user.role))}</Row>
        <Row label={t('admin.createdAt')}>{formatDate(user.created_at)}</Row>
        <Row label={t('admin.updatedAt')}>{formatDate(user.updated_at)}</Row>
      </dl>

      {/* Destructive actions kept apart from the information above. */}
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-[13px] font-medium text-ink">{t('admin.actionsTitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onResetPassword(user)} className="btn-secondary btn-sm">
            <KeyRound size={14} />
            {t('admin.resetPassword')}
          </button>
          <button
            type="button"
            onClick={() => onDelete(user)}
            disabled={isSelf}
            title={isSelf ? t('admin.cannotDeleteSelf') : undefined}
            className="btn-secondary btn-sm text-danger hover:bg-danger/5 disabled:opacity-50"
          >
            <Trash2 size={14} />
            {t('admin.deleteUser')}
          </button>
        </div>
        {isSelf && <p className="hint mt-2">{t('admin.cannotDeleteSelf')}</p>}
      </div>
    </Modal>
  )
}
