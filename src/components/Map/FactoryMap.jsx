import { useEffect } from 'react'
import { MapContainer, Marker, Popup, ZoomControl, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import BaseTileLayer from './BaseTileLayer'
import AutoResize from './AutoResize'
import MeasureLayer from './MeasureLayer'
import PortMarker from './PortMarker'
import { useI18n } from '../../i18n'
import { locationTypeKey } from '../../lib/constants'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

/*
 * Leaflet's default marker images, wired up for a bundler.
 *
 * The delete is not optional. Icon.Default overrides _getIconUrl to prepend a
 * "detected" image path, guessed from the background-image of
 * .leaflet-default-icon-path in Leaflet's own stylesheet. Our urls are already
 * absolute, so the two get concatenated into
 * /node_modules/leaflet/dist/images//node_modules/... — which Vite's dev server
 * answers with the SPA fallback HTML, so every pin renders as a broken image.
 *
 * It only shows up locally: a production build inlines that background-image as
 * a data URI, the path-guessing regex fails to match it, and the prefix comes
 * out empty. Removing the override drops the guessing entirely and uses the
 * urls as given, in both.
 */
delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const CHINA_CENTER = [35.8617, 104.1954]
const CHINA_ZOOM = 4

/**
 * A pin for somewhere that is not a plant.
 *
 * Same marker, desaturated by CSS, so an office or a warehouse does not read as
 * a factory at a glance on a map that is otherwise all factories. Built once:
 * a new icon per render would make Leaflet replace every marker element.
 */
const NON_FACTORY_ICON = new L.Icon.Default({ className: 'marker-muted' })

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
      {factory.location_type && factory.location_type !== 'factory' && (
        <p>
          <span className="badge-neutral">{t(locationTypeKey(factory.location_type))}</span>
        </p>
      )}
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
      {factory.email && (
        <p className="text-[13px]">
          <span className="font-medium">{t('factories.email')}:</span>{' '}
          <a href={`mailto:${factory.email}`} className="text-accent hover:underline">
            {factory.email}
          </a>
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
  /**
   * While measuring, clicking a marker adds it to the path instead of opening
   * its details, and the FOB ports appear alongside the factories so a
   * factory-to-port leg can be measured without leaving this map. They are
   * hidden the rest of the time — this is the factory map, not a port map.
   */
  measuring = false,
  measurePoints = [],
  measureLegs = [],
  measureSelectedKeys,
  onMeasureFactory,
  onMeasurePort,
  ports = [],
}) {
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

      {measuring &&
        ports.map((port) => (
          <PortMarker
            key={port.id}
            port={port}
            highlighted={measureSelectedKeys?.has(`port:${port.id}`)}
            onSelect={onMeasurePort}
          />
        ))}

      <MeasureLayer points={measurePoints} legs={measureLegs} />

      {factories.map((f) => (
        <Marker
          key={f.id}
          position={[f.latitude, f.longitude]}
          icon={f.location_type && f.location_type !== 'factory' ? NON_FACTORY_ICON : undefined}
          eventHandlers={
            measuring
              ? { click: (event) => onMeasureFactory?.(f, event.originalEvent) }
              : undefined
          }
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
        </Marker>
      ))}
    </MapContainer>
  )
}
