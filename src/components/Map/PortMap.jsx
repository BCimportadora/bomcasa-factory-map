import { useEffect } from 'react'
import { MapContainer, ZoomControl, useMap } from 'react-leaflet'
import BaseTileLayer from './BaseTileLayer'
import AutoResize from './AutoResize'
import MeasureLayer from './MeasureLayer'
import PortMarker from './PortMarker'

const CHINA_CENTER = [30.5, 118.0]
const CHINA_ZOOM = 4

function FlyToPort({ port }) {
  const map = useMap()
  useEffect(() => {
    if (port) map.flyTo([port.latitude, port.longitude], 8, { duration: 0.8 })
  }, [port, map])
  return null
}

export default function PortMap({
  ports,
  selectedPort,
  onSelect,
  /** While measuring, clicking a port adds it to the path rather than opening its details. */
  measuring = false,
  measurePoints = [],
  measureLegs = [],
  measureSelectedKeys,
  onMeasurePort,
}) {
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
      <AutoResize watch={measuring} />
      {/* Flying to the details of a port nobody asked to see would yank the map
          around mid-measurement. */}
      <FlyToPort port={measuring ? null : selectedPort} />

      <MeasureLayer points={measurePoints} legs={measureLegs} />

      {ports.map((port) => (
        <PortMarker
          key={port.id}
          port={port}
          highlighted={
            measuring ? measureSelectedKeys?.has(`port:${port.id}`) : selectedPort?.id === port.id
          }
          onSelect={measuring ? onMeasurePort : (port) => onSelect(port)}
        />
      ))}
    </MapContainer>
  )
}
