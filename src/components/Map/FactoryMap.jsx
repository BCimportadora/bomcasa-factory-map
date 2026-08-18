import { useEffect } from 'react'
import { MapContainer, Marker, Popup, ZoomControl, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import BaseTileLayer from './BaseTileLayer'
import AutoResize from './AutoResize'
import { useI18n } from '../../i18n'
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

export default function FactoryMap({
  factories,
  onMapClick,
  flyToTarget,
  onEdit,
  onDelete,
  canManage,
  /** Changes whenever the page resizes the map's box, e.g. the panel collapsing. */
  layoutKey,
}) {
  const { t } = useI18n()

  return (
    <MapContainer
      center={CHINA_CENTER}
      zoom={CHINA_ZOOM}
      className="h-full w-full"
      /* The default top-left zoom control would sit under the panel toggle, so
         it is placed explicitly on the opposite side. */
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <BaseTileLayer />
      <AutoResize watch={layoutKey} />
      <ClickHandler onMapClick={onMapClick} />
      <FlyToFactory target={flyToTarget} />
      {factories.map((f) => (
        <Marker key={f.id} position={[f.latitude, f.longitude]}>
          <Popup>
            <div className="min-w-[190px] space-y-1.5">
              <p className="text-[14px] font-semibold text-ink">{f.name}</p>
              <p className="text-[13px] text-muted">
                {[f.city, f.province].filter(Boolean).join(', ')}
              </p>
              {f.products && (
                <p className="text-[13px]">
                  <span className="font-medium">{t('factories.products')}:</span> {f.products}
                </p>
              )}
              {f.contact_person && (
                <p className="text-[13px]">
                  <span className="font-medium">{t('factories.contactPerson')}:</span> {f.contact_person}
                </p>
              )}
              {f.phone && (
                <p className="text-[13px]">
                  <span className="font-medium">{t('factories.phone')}:</span> {f.phone}
                </p>
              )}
              {canManage(f) && (
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => onEdit(f)}
                    className="text-[13px] font-medium text-accent hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    onClick={() => onDelete(f)}
                    className="text-[13px] font-medium text-danger hover:underline"
                  >
                    {t('common.delete')}
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
