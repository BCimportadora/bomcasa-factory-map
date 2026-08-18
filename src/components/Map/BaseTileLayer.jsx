import { useCallback, useEffect, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
const MAPTILER_STYLE = import.meta.env.VITE_MAPTILER_STYLE

const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function CartoTileLayer() {
  return (
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      subdomains="abcd"
      maxZoom={20}
    />
  )
}

/**
 * Renders a MapTiler vector style inside the Leaflet map.
 *
 * Vector (rather than raster) tiles are required: MapTiler serves raster tiles only
 * for its stock styles, so a custom style — which is what carries the English label
 * configuration — has to be drawn client-side by MapLibre. MapLibre is imported
 * lazily so it stays out of the initial bundle.
 *
 * Calls onFailure() if the basemap cannot be shown, so the caller can fall back to
 * raster tiles rather than leaving the user with an empty map.
 */
function MapLibreLayer({ styleUrl, onFailure }) {
  const map = useMap()

  useEffect(() => {
    let layer
    let cancelled = false

    /**
     * The Leaflet bridge resizes its own wrapper element when the map resizes
     * but never calls resize() on the MapLibre map, and MapLibre only re-reads
     * its container on an explicit resize or a window resize. Without this the
     * GL canvas keeps its old width after the factory panel collapses, leaving
     * a strip of the map undrawn. The rAF lets the bridge set the container
     * size first, so MapLibre measures the new box.
     */
    const handleResize = () => {
      requestAnimationFrame(() => {
        const glMap = layer?.getMaplibreMap?.()
        if (glMap) glMap.resize()
      })
    }

    async function addLayer() {
      try {
        // maplibre-gl v5 ships UMD, so Vite's interop puts the library on `default`;
        // read the namespace itself as a fallback in case that ever changes.
        const mod = await import('maplibre-gl')
        const maplibregl = mod.default ?? mod
        if (typeof maplibregl?.Map !== 'function') {
          throw new Error('maplibre-gl did not expose a Map constructor')
        }
        // the Leaflet bridge is UMD and reads maplibregl off the global scope when it
        // is not resolved through the bundler
        window.maplibregl = maplibregl

        await import('@maplibre/maplibre-gl-leaflet')
        if (cancelled) return

        layer = L.maplibreGL({ style: styleUrl, attribution: MAPTILER_ATTRIBUTION })
        layer.addTo(map)
        map.on('resize', handleResize)
      } catch (err) {
        console.error('MapTiler basemap failed to load, falling back to CARTO tiles:', err)
        if (!cancelled) onFailure()
      }
    }

    addLayer()

    return () => {
      cancelled = true
      map.off('resize', handleResize)
      if (layer) map.removeLayer(layer)
    }
  }, [map, styleUrl, onFailure])

  return null
}

/**
 * Basemap selection.
 *
 * With a MapTiler key and custom style id configured, labels come from the
 * OpenStreetMap `name:en` tags, so Chinese streets read in English. Without them —
 * or if MapLibre fails to initialise — we fall back to CARTO Positron, which needs
 * no account but labels streets in the local language.
 */
export default function BaseTileLayer() {
  const [maptilerFailed, setMaptilerFailed] = useState(false)

  // Stable identity: this is an effect dependency in MapLibreLayer, and an
  // inline arrow would tear down and rebuild the whole GL map on every render
  // of the surrounding page — including every time the factory panel toggles.
  const handleFailure = useCallback(() => setMaptilerFailed(true), [])

  const useMaptiler = MAPTILER_KEY && MAPTILER_STYLE && !maptilerFailed
  if (!useMaptiler) return <CartoTileLayer />

  const styleUrl = `https://api.maptiler.com/maps/${MAPTILER_STYLE}/style.json?key=${MAPTILER_KEY}`
  return <MapLibreLayer styleUrl={styleUrl} onFailure={handleFailure} />
}
