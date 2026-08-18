import { useEffect } from 'react'
import { useI18n } from '../../i18n'

/**
 * Confirmation for an action that cannot be undone.
 *
 * Deliberately plain: a clear question, the specific subject named, and the
 * destructive button distinguished by colour rather than by size or alarm.
 */
export default function ConfirmDialog({
  title,
  message,
  subject,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  destructive = true,
}) {
  const { t } = useI18n()

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-end justify-center bg-ink/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={() => !busy && onCancel()}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-t-2xl bg-surface p-5 shadow-overlay sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">{message}</p>

        {subject && (
          <p className="mt-3 truncate rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] font-medium text-ink">
            {subject}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={destructive ? 'btn-danger' : 'btn-primary'}
          >
            {busy ? t('common.saving') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
