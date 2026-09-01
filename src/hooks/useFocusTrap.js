import { useEffect, useRef } from 'react'

/**
 * Elements a person can Tab to.
 *
 * `[tabindex="-1"]` is excluded deliberately: it marks something reachable by
 * script but not by the Tab key, which is exactly what must stay out of the
 * cycle.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Every trap currently open, oldest first.
 *
 * Overlays nest: the product editor is a Modal, and its delete confirmation is
 * a ConfirmDialog on top of it. Both listen on `document`, so one Escape would
 * otherwise reach both and close the editor along with the question it had
 * just asked. Only the last one in this stack acts.
 */
const stack = []

/**
 * Keep the Tab key inside an open overlay, and close it on Escape.
 *
 * Returns a ref for the element that holds the overlay's own content -- the
 * drawer panel, not the backdrop, or the backdrop's click-to-close would be
 * part of the cycle.
 *
 * Two details that are easy to get wrong:
 *
 * `onEscape` is held in a ref rather than listed as a dependency. Callers pass
 * an inline arrow, and an inline arrow is a new value on every render: as a
 * dependency it would tear the listener down and set it up again each time,
 * stealing focus back to the first item while somebody was Tabbing through.
 * That is the same trap as the map-layer note in CLAUDE.md.
 *
 * The listener sits on `document`, not on the container, because Escape has to
 * work after a click on the backdrop has taken focus out of the panel.
 */
export function useFocusTrap(active, onEscape) {
  const ref = useRef(null)
  const escape = useRef(onEscape)
  escape.current = onEscape

  useEffect(() => {
    if (!active) return undefined
    const container = ref.current
    if (!container) return undefined

    // Where focus was before the overlay opened, so it can be handed back.
    // Restoring it is what stops the Tab order restarting from the top of the
    // page every time somebody opens and closes the menu.
    const previous = document.activeElement

    // Read fresh each time: the panel's contents change with the route, and a
    // list captured on open would go stale.
    const focusable = () =>
      [...container.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0,
      )

    focusable()[0]?.focus()

    // Identity for this trap's place in the stack. Declared before the handler
    // that closes over it.
    const self = {}

    const onKey = (event) => {
      // Only the topmost overlay responds; the ones underneath are covered.
      if (stack[stack.length - 1] !== self) return
      if (event.key === 'Escape') {
        escape.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      // Wrap at both ends, and pull focus back in if it has escaped the panel
      // altogether -- which it has whenever the active element is not ours.
      if (!container.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    stack.push(self)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(self), 1)
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
    }
  }, [active])

  return ref
}
