import { useCallback, useMemo, useState } from 'react'
import { pathLegs, pathLengthKm } from '../lib/distance'

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

  // Leaving measure mode discards the path: a stale measurement reappearing
  // the next time the button is pressed is never what was wanted.
  const toggle = useCallback(() => {
    setMeasuring((on) => !on)
    setPoints([])
  }, [])

  const select = useCallback((point) => {
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

  const legs = useMemo(() => pathLegs(points), [points])
  const totalKm = useMemo(() => pathLengthKm(points), [points])
  const selectedKeys = useMemo(() => new Set(points.map((p) => p.key)), [points])

  return { measuring, points, legs, totalKm, selectedKeys, toggle, select, undo, clear }
}
