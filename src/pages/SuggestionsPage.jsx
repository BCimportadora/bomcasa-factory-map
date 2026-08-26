import { useMemo, useState } from 'react'
import { MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { useSuggestions } from '../hooks/useSuggestions'
import { useProfiles } from '../hooks/useProfiles'
import {
  STATUS_TONES,
  SUGGESTION_STATUSES,
  byStatusThenNewest,
  formatDate,
  isOpen,
  statusKey,
} from '../lib/suggestions'
import { sectionDescriptionKey, sectionNameKey } from '../lib/sections'
import { fullName } from '../lib/constants'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'

function StatusBadge({ status }) {
  const { t } = useI18n()
  const tone = STATUS_TONES[status] ?? 'status-idea'
  return <span className={`badge-status ${tone}`}>{t(statusKey(status))}</span>
}

/** Post or reword a suggestion. Status is not here: authors do not set it. */
function SuggestionForm({ initialValues, onSubmit, onCancel, submitting }) {
  const { t } = useI18n()
  const [values, setValues] = useState({
    title: initialValues?.title ?? '',
    body: initialValues?.body ?? '',
  })
  const [formError, setFormError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!values.title.trim()) {
      setFormError(t('suggestions.titleRequired'))
      return
    }
    setFormError('')
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="alert-error">
          {formError}
        </p>
      )}

      <div>
        <label htmlFor="title" className="label">
          {t('suggestions.titleField')}
        </label>
        <input
          id="title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={t('suggestions.titlePlaceholder')}
          autoFocus
          className="input text-[14px]"
        />
      </div>

      <div>
        <label htmlFor="body" className="label">
          {t('suggestions.bodyField')}
        </label>
        <textarea
          id="body"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          rows={5}
          placeholder={t('suggestions.bodyPlaceholder')}
          className="textarea text-[14px]"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}

/** The administrator's reply: a status, and optionally a reason. */
function DecideForm({ suggestion, onSubmit, onCancel, submitting }) {
  const { t } = useI18n()
  const [status, setStatus] = useState(suggestion.status)
  const [response, setResponse] = useState(suggestion.response ?? '')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(status, response)
      }}
      className="space-y-4"
    >
      <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] font-medium text-ink">
        {suggestion.title}
      </p>

      <div>
        <label htmlFor="status" className="label">
          {t('suggestions.statusField')}
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="select text-[14px]"
        >
          {SUGGESTION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(statusKey(value))}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="response" className="label">
          {t('suggestions.responseField')}
        </label>
        <textarea
          id="response"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={3}
          placeholder={t('suggestions.responsePlaceholder')}
          className="textarea text-[14px]"
        />
        <p className="mt-1.5 hint">{t('suggestions.responseHint')}</p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('common.saving') : t('suggestions.saveDecision')}
        </button>
      </div>
    </form>
  )
}

export default function SuggestionsPage() {
  const { t, language, tCount } = useI18n()
  const { user, isAdmin } = useAuth()
  const { suggestions, loading, error, createSuggestion, updateSuggestion, decide, deleteSuggestion } =
    useSuggestions()
  const { profiles } = useProfiles()

  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState(null) // a suggestion, or 'new'
  const [deciding, setDeciding] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')

  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  )

  const visible = useMemo(
    () =>
      suggestions
        .filter((s) => (statusFilter ? s.status === statusFilter : true))
        .sort(byStatusThenNewest),
    [suggestions, statusFilter],
  )

  const openCount = useMemo(() => suggestions.filter((s) => isOpen(s.status)).length, [suggestions])

  const handleSubmit = async (values) => {
    setSubmitting(true)
    setActionError('')
    try {
      if (editing === 'new') await createSuggestion({ ...values, created_by: user.id })
      else await updateSuggestion(editing.id, values)
      setEditing(null)
    } catch (err) {
      setActionError(err.message ?? t('suggestions.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDecide = async (status, response) => {
    setSubmitting(true)
    setActionError('')
    try {
      await decide(deciding.id, status, response)
      setDeciding(null)
    } catch (err) {
      // The database refuses this for non-administrators; show its answer.
      setActionError(err.message ?? t('suggestions.decideError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setSubmitting(true)
    setActionError('')
    try {
      await deleteSuggestion(deleting.id)
      setDeleting(null)
    } catch (err) {
      setActionError(err.message ?? t('suggestions.deleteError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{t(sectionNameKey('suggestions'))}</h1>
            <p className="page-subtitle">{t(sectionDescriptionKey('suggestions'))}</p>
          </div>
          <button type="button" onClick={() => setEditing('new')} className="btn-primary">
            <MessageSquarePlus size={16} strokeWidth={2.25} />
            {t('suggestions.add')}
          </button>
        </header>

        {actionError && (
          <p role="alert" className="alert-error mb-4">
            {actionError}
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            {tCount('suggestions.open', openCount)}
          </p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={t('suggestions.statusField')}
            className="select sm:w-52"
          >
            <option value="">{t('suggestions.allStatuses')}</option>
            {SUGGESTION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(statusKey(value))}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[15px] text-muted">{t('suggestions.loading')}</p>
        ) : error ? (
          <p className="alert-error">{t('suggestions.loadError')}</p>
        ) : visible.length === 0 ? (
          <div className="card card-pad text-center">
            <p className="text-[15px] font-medium text-ink">{t('suggestions.empty')}</p>
            <p className="mt-1 text-[13px] text-muted">{t('suggestions.emptyHint')}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {visible.map((suggestion) => {
              const author = profilesById.get(suggestion.created_by)
              const mine = suggestion.created_by === user?.id
              return (
                <li key={suggestion.id} className="card card-pad">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em] text-ink">
                      {suggestion.title}
                    </p>
                    <StatusBadge status={suggestion.status} />
                  </div>

                  {suggestion.body && (
                    <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted">
                      {suggestion.body}
                    </p>
                  )}

                  <p className="mt-2 text-[12px] text-muted/80">
                    {t('suggestions.postedBy', {
                      name: author ? fullName(author) || author.email : t('common.none'),
                      date: formatDate(suggestion.created_at, language) ?? '',
                    })}
                  </p>

                  {suggestion.response && (
                    <div className="mt-3 rounded-xl border border-line bg-canvas px-3.5 py-2.5">
                      <p className="hint mb-0.5">{t('suggestions.responseLabel')}</p>
                      <p className="whitespace-pre-line text-[13px] text-ink">
                        {suggestion.response}
                      </p>
                    </div>
                  )}

                  {(mine || isAdmin) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setDeciding(suggestion)}
                          className="btn-secondary btn-sm"
                        >
                          {t('suggestions.decide')}
                        </button>
                      )}
                      {mine && (
                        <button
                          type="button"
                          onClick={() => setEditing(suggestion)}
                          className="btn-ghost btn-sm"
                        >
                          <Pencil size={14} />
                          {t('common.edit')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleting(suggestion)}
                        className="btn-ghost btn-sm text-danger hover:bg-danger/5 hover:text-danger"
                      >
                        <Trash2 size={14} />
                        {t('common.delete')}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? t('suggestions.addTitle') : t('suggestions.editTitle')}
          onClose={() => setEditing(null)}
        >
          <SuggestionForm
            initialValues={editing === 'new' ? null : editing}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            submitting={submitting}
          />
        </Modal>
      )}

      {deciding && (
        <Modal title={t('suggestions.decideTitle')} onClose={() => setDeciding(null)}>
          <DecideForm
            suggestion={deciding}
            onSubmit={handleDecide}
            onCancel={() => setDeciding(null)}
            submitting={submitting}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={t('suggestions.deleteTitle')}
          message={t('suggestions.deleteConfirm')}
          subject={deleting.title}
          confirmLabel={t('common.delete')}
          busy={submitting}
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
