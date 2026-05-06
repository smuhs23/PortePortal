// Map setup with Leaflet + OSM raster tiles

import { state, saveState } from './state.js';

let _map = null;
let _baseLayer = null;

const TILES = {
  osm: { url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr:'© OpenStreetMap contributors', max:19 },
  sat: { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'Tiles © Esri', max:19 },
};

export function setBasemap(map, kind){
  if (!TILES[kind]) return;
  if (_baseLayer) map.removeLayer(_baseLayer);
  _baseLayer = L.tileLayer(TILES[kind].url, { maxZoom:TILES[kind].max, attribution:TILES[kind].attr }).addTo(map);
  state.meta.basemap = kind;
}

export async function initMap(){
  const baseKind = state.meta.basemap || 'osm';
  if (!Array.isArray(state.meta.center) || state.meta.center.length !== 2){
    state.meta.center = [51.1657, 10.4515];
  }
  const map = L.map('map', {
    center: state.meta.center,
    zoom: state.meta.zoom || 6,
    zoomControl: true,
    attributionControl: true,
    doubleClickZoom: false,  // we use dblclick to finish trace
  });
  _baseLayer = L.tileLayer(TILES[baseKind].url, { maxZoom:TILES[baseKind].max, attribution:TILES[baseKind].attr }).addTo(map);
  state.meta.basemap = baseKind;

  map.on('moveend', () => {
    const c = map.getCenter();
    state.meta.center = [c.lat, c.lng];
    state.meta.zoom = map.getZoom();
    saveState();
  });

  // Beim Zoom: Trassen-Labels neu drehen (Pixel-Bezug ändert sich)
  map.on('zoomend', () => {
    if (window.ctx) {
      import('./render.js').then(m => m.renderTraces(window.ctx));
    }
  });

  _map = map;
  return map;
}

export function getMap(){ return _map; }

export function refocusMap(lat, lng, zoom){
  if (!_map) return;
  _map.flyTo([lat, lng], zoom || _map.getZoom(), { duration: 0.6 });
}
