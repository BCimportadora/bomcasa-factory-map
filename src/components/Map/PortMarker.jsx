import { CircleMarker, Tooltip } from 'react-leaflet'
import { useTheme } from '../../context/ThemeContext'
import { mapColors } from '../../lib/mapColors'
import { useI18n } from '../../i18n'

/**
 * A FOB port on any map.
 *
 * Drawn as a flat circle rather than a pin: there are only eight of them, the
 * dot keeps the map calm at country zoom, and it tells a port apart from a
 * factory at a glance when both are on screen together.
 */
export default function PortMarker({ port, highlighted, onSelect }) {
  const { resolvedTheme } = useTheme()
  const { t } = useI18n()
  const colors = mapColors(resolvedTheme)

  // The ports this business ships from are drawn larger and haloed, so they
  // are pickable at country zoom without hunting among the rest.
  const primary = Boolean(port.primary)
  const radius = highlighted ? 10 : primary ? 9 : 6

  return (
    <>
      {primary && (
        <CircleMarker
          center={[port.latitude, port.longitude]}
          radius={radius + 7}
          interactive={false}
          pathOptions={{ stroke: false, fillColor: colors.measureLine, fillOpacity: 0.18 }}
        />
      )}

      <CircleMarker
        center={[port.latitude, port.longitude]}
        radius={radius}
        pathOptions={{
          color: colors.markerStroke,
          weight: primary ? 3 : 2,
          fillColor: highlighted ? colors.markerSelected : colors.markerBase,
          fillOpacity: 1,
        }}
        eventHandlers={{ click: (event) => onSelect(port, event.originalEvent) }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          <span className="text-[13px] font-medium">
            {t('ports.namedPort', { name: port.name })}
          </span>
        </Tooltip>
      </CircleMarker>
    </>
  )
}
