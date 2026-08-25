import { Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../../context/ThemeContext'
import { mapColors } from '../../lib/mapColors'

/**
 * Numbered badge marking a stop on a measurement.
 *
 * A div icon rather than an image so the number can be drawn, and so it takes
 * its colours from the stylesheet like everything else. Passing className
 * replaces Leaflet's default 'leaflet-div-icon', which would otherwise put a
 * white box behind it.
 */
const measureIcon = (position) =>
  L.divIcon({
    className: 'measure-pin',
    html: `<span>${position}</span>`,
    iconSize: [26, 26],
    // Offset up and to the right of the marker rather than centred on the
    // coordinate, where a factory pin's own graphic would sit on top of it.
    // The default pin is 25x41 anchored at its tip, so this clears the head.
    iconAnchor: [-6, 46],
  })

/**
 * What is drawn over a map while measuring: one line per measured leg, and a
 * numbered badge on each stop.
 *
 * Drawing per leg rather than as a single polyline means the same code serves
 * both modes — consecutive legs look identical to one continuous line, and pair
 * mode simply has more of them.
 */
export default function MeasureLayer({ points, legs = [] }) {
  const { resolvedTheme } = useTheme()
  const colors = mapColors(resolvedTheme)

  if (points.length === 0) return null

  return (
    <>
      {legs.map((leg, index) => (
        <Polyline
          key={`${leg.from.key}-${leg.to.key}-${index}`}
          positions={[
            [leg.from.latitude, leg.from.longitude],
            [leg.to.latitude, leg.to.longitude],
          ]}
          pathOptions={{ color: colors.measureLine, weight: 3, opacity: 0.9, dashArray: '7 7' }}
        />
      ))}

      {points.map((point, index) => (
        <Marker
          key={`${point.key}-${index}`}
          position={[point.latitude, point.longitude]}
          icon={measureIcon(index + 1)}
          // Clicks fall through to the marker underneath, so a badge never
          // blocks selecting the same place again.
          interactive={false}
          zIndexOffset={1000}
        />
      ))}
    </>
  )
}
