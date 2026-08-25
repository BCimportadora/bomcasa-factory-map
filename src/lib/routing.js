/**
 * Road distances, from an OSRM-compatible routing service.
 *
 * The default is OSRM's public demo server, which needs no account and covers
 * China from OpenStreetMap data. It is explicitly a *demo*: no uptime promise,
 * and it asks not to be used for production load. Occasional interactive use by
 * a small team is within what it tolerates, but point VITE_ROUTING_URL at a
 * self-hosted or commercial OSRM instance before relying on it — the API is the
 * same, so nothing here changes.
 *
 * Straight-line distance stays the default in the UI because it always works
 * and never depends on someone else's server being up.
 */
const ROUTING_URL = (import.meta.env.VITE_ROUTING_URL || 'https://router.project-osrm.org').replace(
  /\/+$/,
  '',
)

/** OSRM profiles are baked into a server at build time; the demo serves 'driving'. */
const PROFILE = import.meta.env.VITE_ROUTING_PROFILE || 'driving'

/**
 * Above this, stop asking. The table service costs the server roughly n²
 * shortest paths, and no one measures thirty places at once on purpose.
 */
export const MAX_ROUTED_POINTS = 25

/**
 * How far a coordinate may be moved onto the road network before the answer
 * stops being about the place that was asked for. A rooftop pin is metres from
 * a road; a kilometre means the coordinate is somewhere a lorry cannot reach,
 * and the distance returned is to the nearest road instead.
 */
export const SNAP_WARNING_METRES = 1000

export class RoutingError extends Error {
  constructor(reason) {
    super(`Routing failed: ${reason}`)
    this.name = 'RoutingError'
    /** One of: tooMany, rateLimited, noRoute, unavailable. */
    this.reason = reason
  }
}

/**
 * Road distance and driving time between every pair of points, in one request.
 *
 * The table service returns full matrices, which covers both readings the UI
 * offers — consecutive legs are just some of the cells. Matrices are asymmetric
 * on purpose: one-way streets mean A→B and B→A are genuinely different roads.
 *
 * Distances are metres and durations are seconds, matching OSRM. Unreachable
 * pairs come back as null and are left as-is for the caller to render as
 * unknown rather than as zero.
 */
export async function fetchRoadMatrix(points, { signal } = {}) {
  if (points.length > MAX_ROUTED_POINTS) throw new RoutingError('tooMany')

  const coordinates = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const url = `${ROUTING_URL}/table/v1/${PROFILE}/${coordinates}?annotations=distance,duration`

  let response
  try {
    response = await fetch(url, { signal })
  } catch (err) {
    // An aborted request is the caller changing its mind, not a failure.
    if (err.name === 'AbortError') throw err
    throw new RoutingError('unavailable')
  }

  if (!response.ok) {
    throw new RoutingError(response.status === 429 ? 'rateLimited' : 'unavailable')
  }

  const body = await response.json()
  if (body.code !== 'Ok' || !Array.isArray(body.distances)) {
    throw new RoutingError(body.code === 'NoRoute' ? 'noRoute' : 'unavailable')
  }

  return {
    distances: body.distances,
    durations: Array.isArray(body.durations) ? body.durations : null,
    // How far each coordinate had to be moved to reach a routable road. The
    // service snaps silently, so without this a distance measured from
    // somewhere else entirely looks exactly like a good one.
    snapped: Array.isArray(body.sources)
      ? body.sources.map((source) => (Number.isFinite(source?.distance) ? source.distance : null))
      : null,
  }
}

/**
 * Driving time, rounded to the minute — the underlying estimate is not precise
 * enough to justify seconds, and a freight journey is not a commute anyway.
 */
export function formatDuration(seconds, language = 'en') {
  if (!Number.isFinite(seconds)) return null

  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const number = new Intl.NumberFormat(language)

  if (hours === 0) return `${number.format(minutes)} min`
  if (minutes === 0) return `${number.format(hours)} h`
  return `${number.format(hours)} h ${number.format(minutes)} min`
}
