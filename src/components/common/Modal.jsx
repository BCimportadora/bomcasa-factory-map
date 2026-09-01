import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useFocusTrap } from '../../hooks/useFocusTrap'

/**
 * `size` widens the dialog for forms that genuinely need the room (the order
 * form carries a table of line items). Everything else stays narrow, because a
 * wide dialog around a short form reads as an empty page.
 */
const WIDTHS = { default: 'max-w-lg', wide: 'max-w-2xl' }

export default function Modal({ title, onClose, size = 'default', children }) {
  const { t } = useI18n()
  // Escape and the Tab cycle. The hook keeps a stack of open overlays and only
  // the topmost one answers, which is what stops one Escape from closing both
  // this dialog and a confirmation opened on top of it.
  const panel = useFocusTrap(true, onClose)

  useEffect(() => {
    // Prevent the page behind the modal from scrolling.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className="print-plain fixed inset-0 z-[4000] flex items-end justify-center scrim-strong p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`print-plain max-h-[92vh] w-full ${WIDTHS[size] ?? WIDTHS.default} overflow-y-auto rounded-t-2xl bg-surface shadow-overlay sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="print-hide rounded-lg p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
