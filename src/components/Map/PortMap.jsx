import { useEffect } from 'react'
import { MapContainer, CircleMarker, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import BaseTileLayer from './BaseTileLayer'
import AutoResize from './AutoResize'
import { useTheme } from '../../context/ThemeContext'
import { mapColors } from '../../lib/mapColors'

const CHINA_CENTER = [30.5, 118.0]
const CHINA_ZOOM = 4

function FlyToPort({ port }) {
  const map = useMap()
  useEffect(() => {
    if (port) map.flyTo([port.latitude, port.longitude], 8, { duration: 0.8 })
  }, [port, map])
  return null
}

/**
 * Ports are drawn as circle markers rather than pins: there are only a handful
 * of them and the flat dot keeps the map calm and readable at country zoom.
 */
export default function PortMap({ ports, selectedPort, onSelect }) {
  const { resolvedTheme } = useTheme()
  const colors = mapColors(resolvedTheme)

  return (
    <MapContainer
      center={CHINA_CENTER}
      zoom={CHINA_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      zoomControl={false}
    >
      {/* Matches the factory map so the controls sit in the same place. */}
      <ZoomControl position="topright" />
      <BaseTileLayer />
      <AutoResize />
      <FlyToPort port={selectedPort} />

      {ports.map((port) => {
        const isSelected = selectedPort?.id === port.id
        return (
          <CircleMarker
            key={port.id}
            center={[port.latitude, port.longitude]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              color: colors.markerStroke,
              weight: 2,
              fillColor: isSelected ? colors.markerSelected : colors.markerBase,
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(port) }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-[13px] font-medium">{port.name}</span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
