import { useEffect } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  ZoomControl,
  useMapEvents,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import BaseTileLayer from './BaseTileLayer'
import AutoResize from './AutoResize'
import { useI18n } from '../../i18n'
import { useTheme } from '../../context/ThemeContext'
import { mapColors } from '../../lib/mapColors'
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

/**
 * Numbered pin marking a stop on a measurement.
 *
 * A div icon rather than an image so the number can be drawn, and so it picks
 * up the theme from the stylesheet like everything else. Passing className
 * replaces Leaflet's default 'leaflet-div-icon', which would otherwise put a
 * white box behind it.
 */
const measureIcon = (position) =>
  L.divIcon({
    className: 'measure-pin',
    html: `<span>${position}</span>`,
    iconSize: [26, 26],
    // Offset up and to the right of the factory pin rather than centred on the
    // coordinate, where the pin's own graphic would sit on top of it. The
    // default pin is 25x41 anchored at its tip, so this clears the head.
    iconAnchor: [-6, 46],
  })

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

function FactoryPopup({ factory, onEdit, onDelete, canManage }) {
  const { t } = useI18n()

  return (
    <div className="min-w-[190px] space-y-1.5">
      <p className="text-[14px] font-semibold text-ink">{factory.name}</p>
      <p className="text-[13px] text-muted">
        {[factory.city, factory.province].filter(Boolean).join(', ')}
      </p>
      {factory.products && (
        <p className="text-[13px]">
          <span className="font-medium">{t('factories.products')}:</span> {factory.products}
        </p>
      )}
      {factory.contact_person && (
        <p className="text-[13px]">
          <span className="font-medium">{t('factories.contactPerson')}:</span>{' '}
          {factory.contact_person}
        </p>
      )}
      {factory.phone && (
        <p className="text-[13px]">
          <span className="font-medium">{t('factories.phone')}:</span> {factory.phone}
        </p>
      )}
      {canManage(factory) && (
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onEdit(factory)}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {t('common.edit')}
          </button>
          <button
            onClick={() => onDelete(factory)}
            className="text-[13px] font-medium text-danger hover:underline"
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
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
  /** While measuring, clicking a factory adds it to the path instead of opening its details. */
  measuring = false,
  measurePoints = [],
  onMeasureSelect,
}) {
  const { resolvedTheme } = useTheme()
  const colors = mapColors(resolvedTheme)

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

      {measurePoints.length > 1 && (
        <Polyline
          positions={measurePoints.map((p) => [p.latitude, p.longitude])}
          pathOptions={{ color: colors.measureLine, weight: 3, opacity: 0.9, dashArray: '7 7' }}
        />
      )}

      {/* Drawn after the factory markers below would put these underneath, so
          they are rendered first and Leaflet's marker pane keeps them on top by
          z-index; a numbered pin sits directly over the factory it marks. */}
      {measurePoints.map((point, index) => (
        <Marker
          key={`measure-${index}-${point.id}`}
          position={[point.latitude, point.longitude]}
          icon={measureIcon(index + 1)}
          interactive={false}
          zIndexOffset={1000}
        />
      ))}

      {factories.map((f) => (
        <Marker
          key={f.id}
          position={[f.latitude, f.longitude]}
          eventHandlers={measuring ? { click: () => onMeasureSelect?.(f) } : undefined}
        >
          {/* No popup while measuring: there, a click means "add this stop". */}
          {!measuring && (
            <Popup>
              <FactoryPopup
                factory={f}
                onEdit={onEdit}
                onDelete={onDelete}
                canManage={canManage}
              />
            </Popup>
          )}
        </Marker>      ))}
    </MapContainer>
  )
}
