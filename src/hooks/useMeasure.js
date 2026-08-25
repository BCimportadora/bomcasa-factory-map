import { useCallback, useEffect, useMemo, useState } from 'react'
import { pathLegs, pathLengthKm, pointPairs } from '../lib/distance'
import { fetchRoadMatrix } from '../lib/routing'

/**
 * How a distance is measured.
 *
 * 'straight' is the great-circle distance: instant, offline, always available.
 * 'road' asks a routing service for the actual driving distance and time, which
 * is what matters for a lorry but depends on a network call succeeding.
 */
export const MEASURE_METRICS = ['straight', 'road']

const IDLE_ROAD = { status: 'idle', matrix: null, error: null }

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
  const [metric, setMetric] = useState('straight')
  const [road, setRoad] = useState(IDLE_ROAD)

  // Leaving measure mode discards the path: a stale measurement reappearing
  // the next time the button is pressed is never what was wanted.
  const toggle = useCallback(() => {
    setMeasuring((on) => !on)
    setPoints([])
    setMode('path')
    setMetric('straight')
    setRoad(IDLE_ROAD)
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

  // One request covers every reading: consecutive legs are simply some of the
  // cells in the matrix, so switching between route and pairs costs nothing
  // further. Straight-line stays on screen throughout — while this is in
  // flight, and if it never arrives.
  useEffect(() => {
    if (metric !== 'road' || points.length < 2) {
      setRoad((current) => (current.status === 'idle' ? current : IDLE_ROAD))
      return undefined
    }

    const controller = new AbortController()
    setRoad({ status: 'loading', matrix: null, error: null })

    fetchRoadMatrix(points, { signal: controller.signal })
      .then((matrix) => setRoad({ status: 'ready', matrix, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setRoad({ status: 'error', matrix: null, error: err.reason ?? 'unavailable' })
      })

    return () => controller.abort()
  }, [metric, points])

  // In both modes these are { from, to, fromIndex, toIndex, km } and are what
  // gets drawn and listed, so everything downstream stays mode-agnostic. Road
  // figures overwrite km in place for the same reason, and keep the
  // straight-line value alongside rather than discarding it.
  const legs = useMemo(() => {
    const base = mode === 'pairs' ? pointPairs(points) : pathLegs(points)
    if (metric !== 'road' || road.status !== 'ready') return base

    return base.map((leg) => {
      const metres = road.matrix.distances?.[leg.fromIndex]?.[leg.toIndex]
      const seconds = road.matrix.durations?.[leg.fromIndex]?.[leg.toIndex]

      return {
        ...leg,
        straightKm: leg.km,
        // OSRM answers null where no road connects the two, which must read as
        // unknown rather than as a distance of zero.
        km: Number.isFinite(metres) ? metres / 1000 : NaN,
        seconds: Number.isFinite(seconds) ? seconds : undefined,
      }
    })
  }, [mode, points, metric, road])

  const totalKm = useMemo(
    () =>
      metric === 'road' && road.status === 'ready'
        ? legs.reduce((total, leg) => total + (Number.isFinite(leg.km) ? leg.km : 0), 0)
        : pathLengthKm(points),
    [metric, road.status, legs, points],
  )

  const totalSeconds = useMemo(
    () =>
      metric === 'road' && road.status === 'ready' && legs.every((leg) => leg.seconds !== undefined)
        ? legs.reduce((total, leg) => total + leg.seconds, 0)
        : undefined,
    [metric, road.status, legs],
  )

  const selectedKeys = useMemo(() => new Set(points.map((p) => p.key)), [points])

  return {
    measuring,
    points,
    mode,
    setMode,
    metric,
    setMetric,
    roadStatus: road.status,
    roadError: road.error,
    roadSnaps: road.matrix?.snapped ?? null,
    legs,
    totalKm,
    totalSeconds,
    selectedKeys,
    toggle,
    select,
    undo,
    clear,
  }
}

/** True when a click carried the "compare every pair" modifier. */
export const wantsPairs = (event) => Boolean(event?.ctrlKey || event?.metaKey)
