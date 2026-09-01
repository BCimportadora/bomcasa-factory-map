import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * Copy one value, and say so briefly.
 *
 * What lands on the clipboard is exactly `value` — no label, no quotes, no
 * trailing space. A barcode copied from here is thirteen digits and nothing
 * else, because it is pasted straight into somebody's own spreadsheet.
 *
 * The confirmation is a tick on the button rather than a toast: these sit in
 * dense table rows, and a message floating over the page would cover the next
 * row somebody was about to read. It is announced once through a live region
 * for anyone who cannot see the tick.
 *
 * `opacity-0 group-hover:opacity-100` keeps a column of icons from competing
 * with the figures beside them; `focus-visible:opacity-100` is what keeps it
 * reachable by Tab, since a button nobody can see is still in the tab order
 * and would otherwise be a focus stop that appears to do nothing.
 */
export default function CopyButton({ value, label }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  if (value === null || value === undefined || value === '') return null

  const text = String(value)

  const copy = async (event) => {
    // These buttons live inside table rows and form fields that have their own
    // click handlers; copying must not also open the editor.
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Refused by the browser -- an insecure origin, or permission denied.
      // Nothing to report: the value is still on screen to be selected by hand.
    }
  }

  const description = label ? t('common.copyField', { field: label }) : t('common.copy')

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t('common.copied') : description}
      title={copied ? t('common.copied') : description}
      className={`print-hide ml-1.5 inline-flex flex-shrink-0 rounded p-0.5 align-middle transition-all
        focus-visible:opacity-100 group-hover:opacity-100
        ${copied ? 'text-success opacity-100' : 'text-muted opacity-0 hover:text-ink'}`}
    >
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t('common.copied') : ''}
      </span>
    </button>
  )
}
