import { useI18n } from '../../i18n'
import { LABEL_TONES, SAFETY_TONES, labelKey, safetyKey } from '../../lib/innovations'

export default function LabelBadge({ label, className = '' }) {
  const { t } = useI18n()
  const tone = LABEL_TONES[label]
  const classes = tone ? `badge-status ${tone}` : 'badge-neutral'

  return <span className={`${classes} ${className}`}>{t(labelKey(label))}</span>
}

/**
 * Whether a supplier is considered safe to deal with.
 *
 * 'unknown' is shown rather than hidden: a supplier nobody has checked must not
 * look the same as one that has been cleared.
 */
export function SafetyBadge({ safety, className = '' }) {
  const { t } = useI18n()
  const tone = SAFETY_TONES[safety] ?? 'status-idea'

  return <span className={`badge-status ${tone} ${className}`}>{t(safetyKey(safety))}</span>
}
