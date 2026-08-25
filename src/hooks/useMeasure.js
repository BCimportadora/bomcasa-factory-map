import { useCallback, useMemo, useState } from 'react'
import { pathLegs, pathLengthKm, pointPairs } from '../lib/distance'

/**
 * How the selected points are read.
 *
 * 'path' walks them in the order they were chosen — a route. 'pairs' measures
 * every one against every other, which is what answers "how far is each of
 * these factories from that port, and from each other" in a single reading.
 */
export const MEASURE_MODES = ['path', 'pairs']

/**
 * A measurement is a path over anything that has a name and a coordinate, so
 * factories and FOB ports go through the same adapters and can be mixed in one
 * path — "this factory to Ningbo, then on to that other factory" is a question
 * worth being able to ask.
 *
 * The key is namespaced because a factory id and a port id come from different
 * places and are only accidentally distinct.
 */
export const factoryPoint = (factory) => ({
  key: `factory:${factory.id}`,
  name: factory.name,
  latitude: factory.latitude,
  longitude: factory.longitude,
})

export const portPoint = (port) => ({
  key: `port:${port.id}`,
  name: port.name,
  latitude: port.latitude,
  longitude: port.longitude,
})

/** Measurement state for a map: what is selected, and the distances that follow. */
export function useMeasure() {
  const [measuring, setMeasuring] = useState(false)
  const [points, setPoints] = useState([])
  const [mode, setMode] = useState('path')

  // Leaving measure mode discards the path: a stale measurement reappearing
  // the next time the button is pressed is never what was wanted.
  const toggle = useCallback(() => {
    setMeasuring((on) => !on)
    setPoints([])
    setMode('path')
  }, [])

  /**
   * Add a stop. `comparePairs` — set when the modifier key was held during the
   * click — switches to pair mode at the same time, so holding it while
   * selecting is all that is needed to get every distance rather than a route.
   */
  const select = useCallback((point, { comparePairs = false } = {}) => {
    if (comparePairs) setMode('pairs')

    setPoints((current) => {
      // Ignore a repeat of the stop just added; it would contribute a leg of
      // zero and read as a stutter in the list. Returning to a point later in
      // the path is still allowed — a round trip is a real measurement.
      const last = current[current.length - 1]
      return last?.key === point.key ? current : [...current, point]
    })
  }, [])

  const undo = useCallback(() => setPoints((current) => current.slice(0, -1)), [])
  const clear = useCallback(() => setPoints([]), [])

  // In both modes these are { from, to, km } and are what gets drawn and
  // listed, so everything downstream stays mode-agnostic.
  const legs = useMemo(
    () => (mode === 'pairs' ? pointPairs(points) : pathLegs(points)),
    [mode, points],
  )
  const totalKm = useMemo(() => pathLengthKm(points), [points])
  const selectedKeys = useMemo(() => new Set(points.map((p) => p.key)), [points])

  return {
    measuring,
    points,
    mode,
    setMode,
    legs,
    totalKm,
    selectedKeys,
    toggle,
    select,
    undo,
    clear,
  }
}

/** True when a click carried the "compare every pair" modifier. */
export const wantsPairs = (event) => Boolean(event?.ctrlKey || event?.metaKey)
