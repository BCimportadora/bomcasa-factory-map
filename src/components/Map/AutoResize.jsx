import { useCallback, useEffect } from 'react'
import { useMap } from 'react-leaflet'

/**
 * Keep Leaflet's idea of its own size in step with its container.
 *
 * Leaflet caches the container size and only recalculates on a window resize.
 * When the surrounding layout changes without the window changing — collapsing
 * the factory panel, opening the navigation drawer, an orientation change — the
 * map keeps drawing at its old dimensions, leaving strips where nothing was
 * rendered.
 *
 * Two triggers, because neither covers everything on its own:
 *   - `watch` is an explicit signal from the page that it changed the layout.
 *     The effect runs after React has committed the DOM, so the new size is
 *     already measurable — no timers or guessed delays.
 *   - a ResizeObserver catches everything the page does not know about, such as
 *     the window being resized or the device rotating.
 */
export default function AutoResize({ watch }) {
  const map = useMap()

  const recalculate = useCallback(() => {
    map.invalidateSize({ animate: false })

    // The MapLibre basemap needs telling separately: the Leaflet bridge resizes
    // its own wrapper but never calls resize() on the GL map, and MapLibre only
    // re-measures its container when asked.
    //
    // This is queued rather than called straight away because the bridge does
    // its own resizing inside an animation frame scheduled by invalidateSize
    // above. Ours is queued second, so it runs after the wrapper has its new
    // size and MapLibre measures the right box.
    requestAnimationFrame(() => {
      map.eachLayer((layer) => {
        if (typeof layer.getMaplibreMap === 'function') {
          layer.getMaplibreMap()?.resize()
        }
      })
    })
  }, [map])

  // Explicit trigger: the page told us the layout changed.
  useEffect(() => {
    recalculate()
  }, [recalculate, watch])

  // Catch-all for size changes the page does not drive.
  useEffect(() => {
    const container = map.getContainer()
    if (!container || typeof ResizeObserver === 'undefined') return

    let frame = 0
    const observer = new ResizeObserver(() => {
      // Coalesce bursts of callbacks (a CSS transition fires many) into one
      // recalculation on the next paint.
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(recalculate)
    })

    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [map, recalculate])

  return null
}
