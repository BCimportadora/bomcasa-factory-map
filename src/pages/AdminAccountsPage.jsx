import { useState } from 'react'
import { Plus, Check, Copy, MoreHorizontal } from 'lucide-react'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import CreateAccountForm from '../components/Admin/CreateAccountForm'
import UserProfileModal from '../components/Admin/UserProfileModal'
import { useProfiles } from '../hooks/useProfiles'
import { useAdminUserActions } from '../hooks/useAdminUserActions'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { departmentKey, roleKey, fullName, initials } from '../lib/constants'

/** Shown once after creation or a reset; never stored client-side. */
function TemporaryPassword({ result, t }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the value stays visible for manual copying.
    }
  }

  return (
    <div>
      <p className="alert-success mb-4">
        {t(result.kind === 'reset' ? 'admin.passwordReset' : 'admin.created', { email: result.email })}
      </p>
      <p className="label">{t('admin.tempPasswordTitle')}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-xl border border-line bg-canvas px-3.5 py-2.5 font-mono text-[14px] text-ink">
          {result.temporaryPassword}
        </code>
        <button type="button" onClick={copy} className="btn-secondary btn-sm flex-shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('admin.copied') : t('admin.copy')}
        </button>
      </div>
      <p className="hint mt-3 leading-relaxed">{t('admin.tempPasswordHelp')}</p>
    </div>
  )
}

export default function AdminAccountsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { profiles, loading, error, refetch } = useProfiles({ includeEmail: true })
  const { deleteUser, resetPassword, busy } = useAdminUserActions()

  const [showForm, setShowForm] = useState(false)
  const [credentials, setCredentials] = useState(null) // { kind, email, temporaryPassword }
  const [viewing, setViewing] = useState(null)
  const [confirming, setConfirming] = useState(null) // { type: 'delete' | 'reset', user }
  const [actionError, setActionError] = useState('')

  const isSelf = (person) => person.id === user?.id

  const handleCreated = (result) => {
    setShowForm(false)
    setCredentials({ kind: 'create', ...result })
    refetch()
  }

  const runConfirmedAction = async () => {
    if (!confirming) return
    const { type, user: target } = confirming
    setActionError('')

    const result = type === 'delete' ? await deleteUser(target.id) : await resetPassword(target.id)

    if (!result.ok) {
      setActionError(t(result.errorKey))
      setConfirming(null)
      return
    }

    setConfirming(null)
    setViewing(null)
    if (type === 'reset') {
      setCredentials({
        kind: 'reset',
        email: result.data.email,
        temporaryPassword: result.data.temporary_password,
      })
    }
    refetch()
  }

  const confirmCopy =
    confirming?.type === 'delete'
      ? {
          title: t('admin.deleteUserTitle'),
          message: t('admin.deleteUserMessage'),
          confirmLabel: t('admin.deleteUser'),
          destructive: true,
        }
      : {
          title: t('admin.resetPasswordTitle'),
          message: t('admin.resetPasswordMessage'),
          confirmLabel: t('admin.resetPassword'),
          destructive: false,
        }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{t('admin.title')}</h1>
            <p className="page-subtitle">{t('admin.subtitle')}</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} />
            {t('admin.createAccount')}
          </button>
        </header>

        {actionError && (
          <p role="alert" className="alert-error mb-5">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('common.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('people.loadError')}</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-line text-[12px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">{t('admin.firstName')}</th>
                  <th className="px-5 py-3">{t('admin.email')}</th>
                  <th className="px-5 py-3">{t('admin.department')}</th>
                  <th className="px-5 py-3">{t('admin.role')}</th>
                  <th className="px-5 py-3 text-right">{t('admin.actionsTitle')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profiles.map((p) => (
                  <tr key={p.id} className="text-[14px] transition-colors hover:bg-canvas">
                    <td className="px-5 py-3 font-medium text-ink">
                      {fullName(p) || <span className="text-muted">{t('people.incompleteProfile')}</span>}
                    </td>
                    <td className="px-5 py-3 text-muted">{p.email}</td>
                    <td className="px-5 py-3 text-muted">
                      {p.department ? t(departmentKey(p.department)) : t('common.none')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={p.role === 'admin' ? 'badge-accent' : 'badge-neutral'}>
                        {t(roleKey(p.role))}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setViewing(p)}
                        className="btn-secondary btn-sm"
                      >
                        {t('admin.viewProfile')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-line sm:hidden">
              {profiles.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-[12px] font-semibold text-accent">
                    {initials(p)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{fullName(p) || '—'}</p>
                    <p className="truncate text-[12px] text-muted">{p.email}</p>
                    <p className="truncate text-[12px] text-muted">
                      {p.department ? t(departmentKey(p.department)) : t('common.none')}
                    </p>
                  </div>
                  <span className={p.role === 'admin' ? 'badge-accent' : 'badge-neutral'}>
                    {t(roleKey(p.role))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewing(p)}
                    aria-label={t('admin.viewProfile')}
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={t('admin.createAccountTitle')} onClose={() => setShowForm(false)}>
          <CreateAccountForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        </Modal>
      )}

      {viewing && (
        <UserProfileModal
          user={viewing}
          isSelf={isSelf(viewing)}
          onClose={() => setViewing(null)}
          onResetPassword={(target) => setConfirming({ type: 'reset', user: target })}
          onDelete={(target) => setConfirming({ type: 'delete', user: target })}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirmCopy.title}
          message={confirmCopy.message}
          subject={`${fullName(confirming.user) || t('people.incompleteProfile')} · ${confirming.user.email ?? ''}`}
          confirmLabel={confirmCopy.confirmLabel}
          destructive={confirmCopy.destructive}
          busy={busy}
          onConfirm={runConfirmedAction}
          onCancel={() => setConfirming(null)}
        />
      )}

      {credentials && (
        <Modal
          title={credentials.kind === 'reset' ? t('admin.resetPasswordTitle') : t('admin.createAccountTitle')}
          onClose={() => setCredentials(null)}
        >
          <TemporaryPassword result={credentials} t={t} />
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setCredentials(null)} className="btn-primary">
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
