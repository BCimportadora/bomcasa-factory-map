import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { useInnovations } from '../hooks/useInnovations'
import { useFactories } from '../hooks/useFactories'
import { useProfiles } from '../hooks/useProfiles'
import {
  INNOVATION_LABELS,
  INNOVATION_VIEWS,
  PRINTABLE_LABEL,
  labelKey,
  viewEmptyKey,
} from '../lib/innovations'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import InnovationCard from '../components/Innovation/InnovationCard'
import InnovationForm from '../components/Innovation/InnovationForm'
import InnovationDetail from '../components/Innovation/InnovationDetail'

/**
 * Both innovation sections render from here.
 *
 * `view` selects the stage. Moving an item between stages is an administrator
 * action and lives in the detail modal, which is also where an item is opened
 * from by clicking its picture.
 */
export default function InnovationsPage({ view }) {
  const config = INNOVATION_VIEWS[view]
  const showOrderPlan = config.stage === 'ready'

  const { t, tCount } = useI18n()
  const { user } = useAuth()
  const {
    innovations,
    loading,
    error,
    createInnovation,
    updateInnovation,
    setStage,
    deleteInnovation,
    addImages,
    removeImage,
    saveDetails,
  } = useInnovations()
  const { factories } = useFactories()
  const { profiles } = useProfiles()

  const [query, setQuery] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [editing, setEditing] = useState(null) // an innovation, or 'new'
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return innovations.filter((innovation) => {
      if (innovation.stage !== config.stage) return false
      if (labelFilter && innovation.label !== labelFilter) return false
      if (!q) return true
      const haystack = [
        innovation.name,
        innovation.notes,
        ...(innovation.innovation_variations ?? []).map((variation) => variation.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [innovations, config.stage, labelFilter, query])

  const printableCount = useMemo(
    () => innovations.filter((i) => i.label === PRINTABLE_LABEL).length,
    [innovations],
  )

  /** Keep the open detail in step with the list after any change. */
  const syncViewing = (id) => {
    setViewing((current) => (current?.id === id ? null : current))
  }

  const handleSubmit = async (values, variations, quotes) => {
    setSubmitting(true)
    setActionError('')
    try {
      if (editing === 'new') {
        const created = await createInnovation({ ...values, created_by: user.id })
        await saveDetails(created.id, variations, quotes, {})
        // Images can only be attached once the row exists, so a new item opens
        // straight into its own detail view where they can be added.
        setEditing(null)
        setViewing(created)
      } else {
        await updateInnovation(editing.id, values)
        await saveDetails(editing.id, variations, quotes, {
          variations: editing.innovation_variations ?? [],
          quotes: editing.innovation_quotes ?? [],
        })
        setEditing(null)
        syncViewing(editing.id)
      }
    } catch (err) {
      setActionError(err.message ?? t('innovations.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleStage = async (innovation, stage) => {
    setActionError('')
    try {
      await setStage(innovation.id, stage)
      setViewing(null)
    } catch (err) {
      // The database refuses this for non-administrators and for items that are
      // not finished; surface its answer rather than a generic failure.
      setActionError(err.message ?? t('innovations.promoteError'))
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      await deleteInnovation(deleting.id, deleting.innovation_images ?? [])
      setDeleting(null)
      setViewing(null)
    } catch (err) {
      setActionError(err.message ?? t('innovations.deleteError'))
    } finally {
      setSubmitting(false)
    }
  }

  // The list is refetched after every change, so a modal holding a stale copy
  // has to be re-pointed at the fresh row.
  const live = (innovation) =>
    innovation ? (innovations.find((i) => i.id === innovation.id) ?? innovation) : null

  const viewingLive = live(viewing)
  const editingLive = editing === 'new' ? 'new' : live(editing)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-content px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{t(sectionNameKey(config.sectionId))}</h1>
            <p className="page-subtitle">{t(sectionDescriptionKey(config.sectionId))}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!showOrderPlan && (
              <Link to="/innovations/print" className="btn-secondary">
                <Printer size={16} strokeWidth={2} />
                {t('innovations.printReady', { count: printableCount })}
              </Link>
            )}
            <button type="button" onClick={() => setEditing('new')} className="btn-primary">
              <Plus size={16} strokeWidth={2.25} />
              {t('innovations.add')}
            </button>
          </div>
        </header>

        {actionError && (
          <p role="alert" className="alert-error mb-4">
            {actionError}
          </p>
        )}

        <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            placeholder={t('innovations.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('common.search')}
            className="input"
          />
          <select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            aria-label={t('innovations.labelField')}
            className="select sm:w-56"
          >
            <option value="">{t('innovations.allLabels')}</option>
            {INNOVATION_LABELS.map((label) => (
              <option key={label} value={label}>
                {t(labelKey(label))}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('innovations.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('innovations.loadError')}</p>
        ) : visible.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t(viewEmptyKey(view))}</p>
            <p className="mt-1 text-[13px] text-muted">{t('innovations.emptyHint')}</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-muted">{tCount('innovations.count', visible.length)}</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((innovation) => (
                <InnovationCard
                  key={innovation.id}
                  innovation={innovation}
                  showOrderPlan={showOrderPlan}
                  onOpen={setViewing}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {viewingLive && !editing && (
        <InnovationDetail
          innovation={viewingLive}
          factories={factories}
          profiles={profiles}
          showOrderPlan={showOrderPlan}
          onClose={() => setViewing(null)}
          onEdit={setEditing}
          onDelete={setDeleting}
          onPromote={(innovation) => handleStage(innovation, 'ready')}
          onDemote={(innovation) => handleStage(innovation, 'development')}
        />
      )}

      {editing && (
        <Modal
          size="wide"
          title={editing === 'new' ? t('innovations.addTitle') : t('innovations.editTitle')}
          onClose={() => setEditing(null)}
        >
          <InnovationForm
            initialValues={editingLive === 'new' ? {} : editingLive}
            factories={factories}
            profiles={profiles}
            showOrderPlan={showOrderPlan}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            onAddImages={(files) =>
              addImages(
                editingLive.id,
                files,
                user.id,
                (editingLive.innovation_images ?? []).length,
              )
            }
            onRemoveImage={removeImage}
            submitting={submitting}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('innovations.deleteTitle')}
          message={t('innovations.deleteConfirm')}
          subject={deleting.name}
          confirmLabel={t('common.delete')}
          busy={submitting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
