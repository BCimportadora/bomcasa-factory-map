import { useEffect } from 'react'
import { TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const MAPTILER_STYLE = import.meta.env.VITE_MAPTILER_STYLE

const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/**
 * Renders a MapTiler vector style inside the Leaflet map.
 *
 * Vector (rather than raster) tiles are required here: MapTiler only serves
 * raster tiles for its stock styles, so a custom style — which is what carries
 * the English label configuration — has to be drawn client-side by MapLibre.
 * MapLibre is imported lazily so it stays out of the initial bundle.
 */
function MapLibreLayer({ styleUrl }) {
  const map = useMap()

  useEffect(() => {
    let layer
    let cancelled = false

    async function addLayer() {
      try {
        const maplibregl = (await import('maplibre-gl')).default
        // the Leaflet bridge plugin reads maplibregl off the global scope
        window.maplibregl = maplibregl
        await import('@maplibre/maplibre-gl-leaflet')
        if (cancelled) return

        layer = L.maplibreGL({ style: styleUrl, attribution: MAPTILER_ATTRIBUTION })
        layer.addTo(map)
      } catch (err) {
        console.error('Failed to load the MapTiler basemap:', err)
      }
    }

    addLayer()

    return () => {
      cancelled = true
      if (layer) map.removeLayer(layer)
    }
  }, [map, styleUrl])

  return null
}

/**
 * Basemap selection.
 *
 * With a MapTiler key and custom style id configured, labels come from the
 * OpenStreetMap `name:en` tags, so Chinese streets read in English. Without
 * them we fall back to CARTO Positron, which needs no account but labels
 * streets in the local language.
 */
export default function BaseTileLayer() {
  if (MAPTILER_KEY && MAPTILER_STYLE) {
    const styleUrl = `https://api.maptiler.com/maps/${MAPTILER_STYLE}/style.json?key=${MAPTILER_KEY}`
    return <MapLibreLayer styleUrl={styleUrl} />
  }

  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      subdomains="abcd"
      maxZoom={20}
    />
  )
}
