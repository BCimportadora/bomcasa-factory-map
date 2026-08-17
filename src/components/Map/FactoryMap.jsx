import { useEffect } from 'react'
import { MapContainer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import BaseTileLayer from './BaseTileLayer'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const CHINA_CENTER = [35.8617, 104.1954]
const CHINA_ZOOM = 4

function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng)
    },
  })
  return null
}

function FlyToFactory({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.flyTo([target.latitude, target.longitude], 12, { duration: 0.8 })
    }
  }, [target, map])
  return null
}

export default function FactoryMap({ factories, onMapClick, flyToTarget, onEdit, onDelete, canManage }) {
  return (
    <MapContainer center={CHINA_CENTER} zoom={CHINA_ZOOM} className="h-full w-full">
      <BaseTileLayer />
      <ClickHandler onMapClick={onMapClick} />
      <FlyToFactory target={flyToTarget} />
      {factories.map((f) => (
        <Marker key={f.id} position={[f.latitude, f.longitude]}>
          <Popup>
            <div className="min-w-[180px] space-y-1">
              <p className="font-semibold">{f.name}</p>
              <p className="text-sm text-gray-600">{[f.city, f.province].filter(Boolean).join(', ')}</p>
              {f.products && (
                <p className="text-sm">
                  <span className="font-medium">Products:</span> {f.products}
                </p>
              )}
              {f.contact_person && (
                <p className="text-sm">
                  <span className="font-medium">Contact:</span> {f.contact_person}
                </p>
              )}
              {f.phone && (
                <p className="text-sm">
                  <span className="font-medium">Phone:</span> {f.phone}
                </p>
              )}
              {canManage(f) && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => onEdit(f)} className="text-sm text-blue-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => onDelete(f)} className="text-sm text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
