import { useState } from 'react'
import { Library, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import { useCatalog } from '../hooks/useCatalog'
import { docTypeKey } from '../lib/catalog'
import ConfirmDialog from '../components/common/ConfirmDialog'

/**
 * Catalog settings, for administrators.
 *
 * One destructive action, deliberately kept away from the catalog itself: the
 * button that empties a table people spend hours filling should not sit next to
 * the one that adds to it.
 *
 * The route is admin-guarded and this page is only linked for administrators,
 * but neither is what actually stops anyone else — the delete policies in
 * schema.sql do. Both are convenience.
 */
export default function AdminCatalogPage() {
  const { t, language } = useI18n()
  const { products, imports, loading, error, clearCatalog } = useCatalog()

  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cleared, setCleared] = useState(false)

  const handleClear = async () => {
    setBusy(true)
    setActionError('')
    try {
      await clearCatalog()
      setConfirming(false)
      setCleared(true)
    } catch (err) {
      setActionError(err.message ?? t('catalog.admin.clearError'))
    } finally {
      setBusy(false)
    }
  }

  const formatDate = (value) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-GB', {
      dateStyle: 'medium',
    }).format(date)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7">
          <h1 className="page-title">{t('catalog.admin.title')}</h1>
          <p className="page-subtitle">{t('catalog.admin.subtitle')}</p>
        </header>

        {(actionError || error) && (
          <p role="alert" className="alert-error mb-4">
            {actionError || error}
          </p>
        )}

        {cleared && (
          <p role="status" className="alert-success mb-4">
            {t('catalog.admin.cleared')}
          </p>
        )}

        <div className="card card-pad">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600">
              <Library size={20} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">{t('catalog.admin.contents')}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {loading
                  ? t('catalog.loading')
                  : t('catalog.admin.counts', {
                      products: products.length,
                      documents: imports.length,
                    })}
              </p>
            </div>
          </div>

          {imports.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[34rem] text-[12px]">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="px-3 py-2 font-medium">{t('catalog.admin.document')}</th>
                    <th className="px-3 py-2 font-medium">{t('catalog.fields.docType')}</th>
                    <th className="px-3 py-2 text-right font-medium">{t('liquidation.lines')}</th>
                    <th className="px-3 py-2 font-medium">{t('catalog.admin.imported')}</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((doc) => (
                    <tr key={doc.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <span className="break-all text-ink">{doc.file_name}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {t(docTypeKey(doc.doc_type))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-muted">
                        {doc.line_count ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">
                        {formatDate(doc.created_at) ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad mt-4 border-danger/30">
          <p className="text-[15px] font-semibold text-ink">{t('catalog.admin.clearTitle')}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {t('catalog.admin.clearBody')}
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={loading || products.length + imports.length === 0}
            className="btn-danger mt-4"
          >
            <Trash2 size={16} strokeWidth={2} />
            {t('catalog.admin.clear')}
          </button>
          {products.length + imports.length === 0 && !loading && (
            <p className="hint mt-2">{t('catalog.admin.alreadyEmpty')}</p>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t('catalog.admin.confirmTitle')}
          message={t('catalog.admin.confirmBody')}
          subject={t('catalog.admin.counts', {
            products: products.length,
            documents: imports.length,
          })}
          confirmLabel={t('catalog.admin.clear')}
          busy={busy}
          onConfirm={handleClear}
          onCancel={() => !busy && setConfirming(false)}
        />
      )}
    </div>
  )
}
