import { CircleMarker, Tooltip } from 'react-leaflet'
import { useTheme } from '../../context/ThemeContext'
import { mapColors } from '../../lib/mapColors'

/**
 * A FOB port on any map.
 *
 * Drawn as a flat circle rather than a pin: there are only eight of them, the
 * dot keeps the map calm at country zoom, and it tells a port apart from a
 * factory at a glance when both are on screen together.
 */
export default function PortMarker({ port, highlighted, onSelect }) {
  const { resolvedTheme } = useTheme()
  const colors = mapColors(resolvedTheme)

  return (
    <CircleMarker
      center={[port.latitude, port.longitude]}
      radius={highlighted ? 10 : 7}
      pathOptions={{
        color: colors.markerStroke,
        weight: 2,
        fillColor: highlighted ? colors.markerSelected : colors.markerBase,
        fillOpacity: 1,
      }}
      eventHandlers={{ click: (event) => onSelect(port, event.originalEvent) }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
        <span className="text-[13px] font-medium">{port.name}</span>
      </Tooltip>
    </CircleMarker>
  )
}
