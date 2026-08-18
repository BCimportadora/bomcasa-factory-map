import { useState } from 'react'
import { Plus, Check, Copy } from 'lucide-react'
import Modal from '../components/common/Modal'
import CreateAccountForm from '../components/Admin/CreateAccountForm'
import { useProfiles } from '../hooks/useProfiles'
import { useI18n } from '../i18n'
import { departmentKey, roleKey, fullName, initials } from '../lib/constants'

/** Shown once after creation — the temporary password is never stored client-side. */
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
      <p className="alert-success mb-4">{t('admin.created', { email: result.email })}</p>
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
  const { profiles, loading, error, refetch } = useProfiles({ includeEmail: true })
  const [showForm, setShowForm] = useState(false)
  const [created, setCreated] = useState(null)

  const handleCreated = (result) => {
    setShowForm(false)
    setCreated(result)
    refetch()
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

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('common.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('people.loadError')}</p>
        ) : (
          <div className="card overflow-hidden">
            {/* Table on wide screens */}
            <table className="hidden w-full text-left sm:table">
              <thead>
                <tr className="border-b border-line text-[12px] font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">{t('admin.firstName')}</th>
                  <th className="px-5 py-3">{t('admin.email')}</th>
                  <th className="px-5 py-3">{t('admin.department')}</th>
                  <th className="px-5 py-3">{t('admin.role')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {profiles.map((p) => (
                  <tr key={p.id} className="text-[14px]">
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
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Stacked cards on small screens */}
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

      {created && (
        <Modal title={t('admin.createAccountTitle')} onClose={() => setCreated(null)}>
          <TemporaryPassword result={created} t={t} />
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setCreated(null)} className="btn-primary">
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
