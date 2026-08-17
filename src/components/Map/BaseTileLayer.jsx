import { TileLayer } from 'react-leaflet'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY
// A MapTiler style whose label language is set to English. Create one in
// MapTiler Cloud (Customize -> Language -> English) and put its id here via env;
// "streets-v2" is MapTiler's stock style and falls back to local-language labels.
const MAPTILER_STYLE = import.meta.env.VITE_MAPTILER_STYLE || 'streets-v2'

/**
 * Basemap tiles.
 *
 * MapTiler is used when an API key is configured, because it can render the
 * OpenStreetMap `name:en` tags — most Chinese streets carry one, so labels come
 * through in English. Without a key we fall back to CARTO Positron, which needs
 * no account but renders street names in the local language (Chinese).
 */
export default function BaseTileLayer() {
  if (MAPTILER_KEY) {
    return (
      <TileLayer
        attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url={`https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`}
        tileSize={512}
        zoomOffset={-1}
        minZoom={1}
        maxZoom={20}
        crossOrigin
      />
    )
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
