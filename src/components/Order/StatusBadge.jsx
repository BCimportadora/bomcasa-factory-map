import { useI18n } from '../../i18n'
import { STATUS_TONES, statusKey } from '../../lib/orders'

export default function StatusBadge({ status, className = '' }) {
  const { t } = useI18n()
  const tone = STATUS_TONES[status]

  // An unrecognised status still has to render as something readable.
  const classes = tone ? `badge-status ${tone}` : 'badge-neutral'

  return <span className={`${classes} ${className}`}>{t(statusKey(status))}</span>
}
