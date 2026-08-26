/**
 * Suggestions for this platform.
 *
 * The smallest section in the app: one table, no children, no images. Anyone
 * signed in may post one and reword their own; only an administrator may decide
 * what happens to it, which is enforced by a trigger in schema.sql rather than
 * by hiding the control.
 *
 * The tone classes are the ones already defined for the R&D labels — a status
 * board is a status board, and inventing a second palette for five more states
 * would mean five more contrast pairs to keep honest.
 */
export const SUGGESTION_STATUSES = ['new', 'planned', 'in_progress', 'done', 'declined']

export const STATUS_TONES = {
  new: 'status-idea',
  planned: 'status-todo',
  in_progress: 'status-checking',
  done: 'status-done',
  declined: 'status-denied',
}

/** Open first, settled last; within a group, newest first. */
const RANK = { new: 0, planned: 1, in_progress: 2, done: 3, declined: 4 }

export const byStatusThenNewest = (a, b) => {
  const left = RANK[a.status] ?? 99
  const right = RANK[b.status] ?? 99
  if (left !== right) return left - right
  return (b.created_at ?? '').localeCompare(a.created_at ?? '')
}

/** Whether a status means the request is still live. */
export const isOpen = (status) => status === 'new' || status === 'planned' || status === 'in_progress'

export const statusKey = (status) => `suggestions.status.${status}`

export const formatDate = (value, language = 'en') => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-GB', {
    dateStyle: 'medium',
  }).format(date)
}
