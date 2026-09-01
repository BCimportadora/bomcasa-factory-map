import { useRef, useState } from 'react'
import { Download, FileUp, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../i18n'
import { useProfiles } from '../../hooks/useProfiles'
import { fullName } from '../../lib/constants'
import {
  DEFAULT_DOC_TYPE,
  DOC_TYPES,
  FILE_ACCEPT,
  MAX_FILE_BYTES,
  docTypeKey,
  formatBytes,
  formatUploadedAt,
  isAllowedFile,
} from '../../lib/orderFiles'
import ConfirmDialog from '../common/ConfirmDialog'

/**
 * The paperwork on one order: list, upload, download, delete.
 *
 * One component for both places this appears -- the Files section and the order
 * detail modal -- so the two can never drift into showing different files for
 * the same order. It takes the hook's data as props rather than calling the
 * hook itself, because the Files page already holds every row and a second
 * subscription per order would be wasteful.
 */
export default function OrderFiles({
  files,
  onUpload,
  onDelete,
  onDownload,
  compact = false,
}) {
  const { t, language } = useI18n()
  const { user, isAdmin } = useAuth()
  const { profiles } = useProfiles()
  const input = useRef(null)

  const [docType, setDocType] = useState(DEFAULT_DOC_TYPE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(null)

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const handleFiles = async (event) => {
    const chosen = [...(event.target.files ?? [])]
    // Let the same file be picked again after a failure.
    event.target.value = ''
    if (chosen.length === 0) return

    setError('')
    const tooBig = chosen.find((file) => file.size > MAX_FILE_BYTES)
    if (tooBig) {
      setError(
        t('files.tooLarge', {
          name: tooBig.name,
          max: formatBytes(MAX_FILE_BYTES, language),
        }),
      )
      return
    }
    const wrongType = chosen.find((file) => !isAllowedFile(file))
    if (wrongType) {
      setError(t('files.wrongType', { name: wrongType.name }))
      return
    }

    setBusy(true)
    try {
      await onUpload(chosen, docType)
      setDocType(DEFAULT_DOC_TYPE)
    } catch (err) {
      setError(err.message ?? t('files.uploadError'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Fetch a fresh signed link and follow it.
   *
   * Not an <a href> with a stored url: the bucket is private and a link signed
   * when the list rendered would already have expired by the time anyone
   * scrolled to it.
   */
  const handleDownload = async (file) => {
    setError('')
    setDownloading(file.id)
    try {
      const url = await onDownload(file)
      window.location.href = url
    } catch (err) {
      setError(err.message ?? t('files.downloadError'))
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onDelete(confirming)
      setConfirming(null)
    } catch (err) {
      setError(err.message ?? t('files.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label mb-0 flex items-center gap-1.5">
            <Paperclip size={13} strokeWidth={1.75} />
            {t('files.heading')}
          </span>
          {!compact && <p className="hint mt-0.5">{t('files.headingHint')}</p>}
        </div>

        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="order-file-doc-type" className="label">
              {t('files.docType')}
            </label>
            <select
              id="order-file-doc-type"
              value={docType}
              onChange={(event) => setDocType(event.target.value)}
              disabled={busy}
              className="input h-9 py-0 text-[13px]"
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(docTypeKey(type))}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-secondary h-9"
          >
            {busy ? (
              <Loader2 size={15} strokeWidth={2} className="animate-spin" />
            ) : (
              <FileUp size={15} strokeWidth={2} />
            )}
            {busy ? t('common.saving') : t('files.upload')}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="alert-error mb-2">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-[14px] font-medium text-ink">{t('files.noFiles')}</p>
          <p className="mt-1 text-[13px] text-muted">{t('files.noFilesHint')}</p>
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
          <table className="w-full min-w-[42rem] text-[12px]">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-2 font-medium">{t('files.name')}</th>
                <th className="px-3 py-2 font-medium">{t('files.docType')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('files.size')}</th>
                <th className="px-3 py-2 font-medium">{t('files.uploaded')}</th>
                <th className="px-3 py-2 font-medium">{t('files.uploadedBy')}</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const uploader = profilesById.get(file.created_by)
                const name = fullName(uploader)
                // Mirrors the delete policy on order_files: your own, or
                // anything if you are an administrator. Showing the button to
                // anyone else offers an action the database will refuse.
                const canDelete = file.created_by === user?.id || isAdmin
                return (
                  <tr
                    key={file.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-canvas"
                  >
                    <td className="px-3 py-2">
                      <span className="break-all font-medium text-ink">{file.file_name}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {t(docTypeKey(file.doc_type))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                      {formatBytes(file.size_bytes, language)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {formatUploadedAt(file.created_at, language) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {name || uploader?.email || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        disabled={downloading === file.id}
                        aria-label={t('files.download')}
                        title={t('files.download')}
                        className="btn-ghost btn-sm"
                      >
                        {downloading === file.id ? (
                          <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                        ) : (
                          <Download size={14} strokeWidth={2} />
                        )}
                      </button>
                      {/* Hidden rather than disabled: a greyed-out control on
                          most rows reads as something being broken. The RLS
                          policy is the actual guard either way. */}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirming(file)}
                          aria-label={t('files.delete')}
                          title={t('files.delete')}
                          className="btn-ghost btn-sm text-danger"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      {confirming && (
        <ConfirmDialog
          title={t('files.deleteTitle')}
          message={t('files.deleteMessage')}
          subject={confirming.file_name}
          confirmLabel={t('files.delete')}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setConfirming(null)}
        />
      )}
    </div>
  )
}
