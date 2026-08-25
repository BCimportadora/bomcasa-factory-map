/**
 * Straight-line distances between points on the map.
 *
 * This is the great-circle ("as the crow flies") distance, not a road or sea
 * route: the app has no routing provider, and inventing one would be worse than
 * being clear about what is measured. The UI says so alongside the figure.
 */
const EARTH_RADIUS_KM = 6371.0088

const toRadians = (degrees) => (degrees * Math.PI) / 180

/**
 * Haversine distance in kilometres between two { latitude, longitude } points.
 *
 * Haversine rather than the simpler equirectangular approximation because
 * suppliers can be two thousand kilometres apart, where the flat-earth shortcut
 * drifts by several kilometres.
 */
export function distanceKm(from, to) {
  if (!from || !to) return 0

  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Each consecutive pair in a path, with the distance between them. */
export function pathLegs(points) {
  return points.slice(1).map((to, index) => {
    const from = points[index]
    return { from, to, km: distanceKm(from, to) }
  })
}

export const pathLengthKm = (points) =>
  pathLegs(points).reduce((total, leg) => total + leg.km, 0)

/**
 * Every unordered pair of points, nearest first.
 *
 * A path answers "how far is this route"; pairs answer "how far is everything
 * from everything else" — which port is closest to each of these factories, and
 * how far apart the factories are, in one reading. Sorted by distance because
 * the question is almost always "which is nearest".
 */
export function pointPairs(points) {
  const pairs = []

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      pairs.push({ from: points[i], to: points[j], km: distanceKm(points[i], points[j]) })
    }
  }

  return pairs.sort((a, b) => a.km - b.km)
}

/**
 * Human-readable distance. Metres below a kilometre, one decimal below a
 * hundred, whole kilometres above — precision that flatters the source data
 * rather than implying more than a rooftop coordinate can support.
 *
 * Formatted through Intl so the decimal separator follows the chosen language.
 */
export function formatDistance(km, language = 'en') {
  if (!Number.isFinite(km)) return '—'

  if (km < 1) {
    return `${new Intl.NumberFormat(language).format(Math.round(km * 1000))} m`
  }

  const decimals = km < 100 ? 1 : 0
  const value = new Intl.NumberFormat(language, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(km)

  return `${value} km`
}
