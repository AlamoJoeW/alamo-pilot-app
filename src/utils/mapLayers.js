// Shared Leaflet tile layer definitions for all three maps in the app (pilot
// Map tab, Route tab, Admin view) so the street/satellite toggle behaves and
// looks identical everywhere.
//
// Satellite uses Esri World Imagery — free, no API key or billing account
// required, unlike Mapbox/Google satellite tiles. Good enough resolution for
// site-inspection use; swap here if Joe ever wants a different provider.

export const STREET_TILE = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
}

export const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  options: {
    attribution: 'Tiles © Esri — Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
  },
}

export function tileLayerFor(satellite) {
  return satellite ? SATELLITE_TILE : STREET_TILE
}
