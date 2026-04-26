// v6/app.js — TiefbauPorte v6 Bootstrapping

import { DEFAULT_CATALOG, DEFAULT_CABLE_TYPES } from './modules/constants.js';
import { loadState, saveState } from './modules/storage.js';
import { showInfo, fmtEur } from './modules/ui.js';
import { render as renderAll } from './modules/render.js';
import { calcTotals } from './modules/calc.js';
import { initModeToggle, initMapMode } from './modules/mode.js';
import { openCatalog } from './modules/catalog.js';
import { initTraceDrawing } from './modules/traces.js';

// ========== State ==========
let state = loadState();
if (!state) {
  state = {
    meta: {
      we: '', loc: '', date: new Date().toISOString().slice(0, 10),
      author: '', note: '',
      gk: 0, wg: 0,
      konta: false, denk: false, kontaPct: 20, denkPct: 15
    },
    catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
    cableTypes: JSON.parse(JSON.stringify(DEFAULT_CABLE_TYPES)),
    objects: [],
    traces: [],
    selectedCat: null,
    viz: { hw: true, tr: true, links: false, bigPins: false },
    uiMode: 'edit',
    schemaVersion: 6
  };
}

function save() { saveState(state); }

// State-Migration: viz.bigPins ergänzen, falls aus älterem Stand geladen
if (state.viz && state.viz.bigPins === undefined) state.viz.bigPins = false;

// ========== Map ==========
const map = L.map('map', { zoomControl: false, tap: true }).setView([52.4512, 13.2890], 18);
L.control.zoom({ position: 'bottomright' }).addTo(map);

const layerOSM = L.tileLayer('https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap', maxZoom: 19, subdomains: 'abc', crossOrigin: true
});
const layerSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '© Esri', maxZoom: 20, crossOrigin: true
});
layerOSM.addTo(map);
let activeLayer = 'map';

const objLayer = L.layerGroup().addTo(map);
const traceLayer = L.layerGroup().addTo(map);
const drawLayer = L.layerGroup().addTo(map);
const linkLayer = L.layerGroup().addTo(map);

// Overlay-Elemente: verhindern dass Clicks in Suchfeld/Legende/etc. auf die Karte durchschlagen
function blockMapEvents(el) {
  if (!el) return;
  L.DomEvent.disableClickPropagation(el);
  L.DomEvent.disableScrollPropagation(el);
  // Zusätzlich alle Pointer-/Touch-Events hart stoppen
  ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'contextmenu'].forEach(ev => {
    el.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  });
}
['searchbar', 'srchRes', 'legend', 'selBadge', 'infoBanner'].forEach(id => {
  blockMapEvents(document.getElementById(id));
});
blockMapEvents(document.querySelector('.layerctl'));

// ========== Gemeinsamer Context ==========
// Der ctx wird an alle Module gereicht, damit sie auf State und gemeinsame
// Funktionen zugreifen können, ohne in app.js hineinimportieren zu müssen.
const ctx = {
  get state() { return state; },
  map,
  objLayer,
  traceLayer,
  drawLayer,
  linkLayer,
  mode: 'pin',
  currentTrace: null,
  save,
  render: () => renderAll(ctx),
  updateTotal
};

// ========== Update-Total Header ==========
function updateTotal() {
  const t = calcTotals(state);
  document.getElementById('sumTotal').textContent = fmtEur(t.total);
  let sub = 'Vor-Ort-Check · Union E';
  if (state.meta.we) sub = 'WE ' + state.meta.we;
  document.getElementById('hdrSub').textContent = sub;
}

// ========== Layer-Controls ==========
document.getElementById('lyrMap').onclick = () => {
  if (activeLayer === 'map') return;
  map.removeLayer(layerSat);
  layerOSM.addTo(map);
  document.getElementById('lyrMap').classList.add('active');
  document.getElementById('lyrSat').classList.remove('active');
  activeLayer = 'map';
};
document.getElementById('lyrSat').onclick = () => {
  if (activeLayer === 'sat') return;
  map.removeLayer(layerOSM);
  layerSat.addTo(map);
  document.getElementById('lyrSat').classList.add('active');
  document.getElementById('lyrMap').classList.remove('active');
  activeLayer = 'sat';
};
document.getElementById('lyrHW').onclick = function() {
  state.viz.hw = !state.viz.hw;
  this.classList.toggle('active', state.viz.hw);
  ctx.render();
};
document.getElementById('lyrTR').onclick = function() {
  state.viz.tr = !state.viz.tr;
  this.classList.toggle('active', state.viz.tr);
  ctx.render();
};
document.getElementById('lyrLinks').onclick = function() {
  state.viz.links = !state.viz.links;
  this.classList.toggle('active', state.viz.links);
  ctx.render();
};
document.getElementById('lyrLinks').classList.toggle('active', state.viz.links);

// v6.1: Toggle "Große Marker"
const bigPinsBtn = document.getElementById('lyrBigPins');
function applyBigPins() {
  document.body.classList.toggle('big-pins', !!state.viz.bigPins);
  bigPinsBtn.classList.toggle('active', !!state.viz.bigPins);
}
bigPinsBtn.onclick = function() {
  state.viz.bigPins = !state.viz.bigPins;
  applyBigPins();
  save();
  ctx.render();
};
applyBigPins();

// ========== GPS ==========
document.getElementById('btnLocate').onclick = () => {
  if (!navigator.geolocation) { showInfo('GPS nicht verfügbar', 'err'); return; }
  showInfo('Standort wird gesucht...');
  navigator.geolocation.getCurrentPosition(
    p => { map.setView([p.coords.latitude, p.coords.longitude], 20); showInfo('Standort ✓'); },
    e => showInfo('GPS Fehler: ' + e.message, 'err'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

// ========== Toolbar ==========
document.getElementById('btnCatalog').onclick = () => openCatalog(ctx);
document.getElementById('btnMeta').onclick = () => openMetaDialog();
document.getElementById('btnExport').onclick = async () => {
  const mod = await import('./modules/exportDialog.js');
  mod.openExport(ctx);
};
document.getElementById('btnKalk').onclick = async () => {
  const mod = await import('./modules/kalk.js');
  mod.openKalk(ctx);
};

// ========== Meta-Dialog (voll) ==========
function openMetaDialog() {
  const sheet = document.querySelector('#modalMeta .sheet');
  sheet.innerHTML = `
    <header>
      <h2>Projekt-Daten</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <label>WE-Nummer</label>
      <input id="metaWE" value="${escapeAttr(state.meta.we)}" placeholder="z.B. 127798">

      <label>Liegenschaft</label>
      <input id="metaLoc" value="${escapeAttr(state.meta.loc)}" placeholder="z.B. Fabeckstraße, Berlin">

      <label>Datum Begehung</label>
      <input id="metaDate" type="date" value="${escapeAttr(state.meta.date)}">

      <label>Ersteller</label>
      <input id="metaAuthor" value="${escapeAttr(state.meta.author)}" placeholder="Christian Galka">

      <label>Standort-Eigenschaften</label>
      <div class="toggles">
        <div class="toggle ${state.meta.konta?'on':''}" id="tglKonta">☣ Kontamination</div>
        <div class="toggle ${state.meta.denk?'on':''}" id="tglDenk">🛡 Denkmalschutz</div>
      </div>
      <small style="color:#666;display:block;margin-top:4px">Wirken als prozentualer Aufschlag auf Tiefbau</small>

      <div class="row" style="margin-top:6px">
        <div><label style="font-size:11px">Konta %</label><input id="metaKontaPct" type="number" step="1" value="${state.meta.kontaPct}"></div>
        <div><label style="font-size:11px">Denkmal %</label><input id="metaDenkPct" type="number" step="1" value="${state.meta.denkPct}"></div>
      </div>

      <label>Bemerkung</label>
      <textarea id="metaNote" rows="3">${escapeAttr(state.meta.note)}</textarea>

      <hr style="margin:16px 0">
      <label>Zuschläge Pauschal</label>
      <div class="row">
        <div><label style="font-size:11px">GK (%)</label><input id="metaGK" type="number" step="0.1" value="${state.meta.gk}"></div>
        <div><label style="font-size:11px">W+G (%)</label><input id="metaWG" type="number" step="0.1" value="${state.meta.wg}"></div>
      </div>

      <hr style="margin:16px 0">
      <button id="metaCableTypesBtn" style="width:100%;padding:12px;background:var(--green);color:var(--navy);border:none;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer">⚙ Kabeltyp-Katalog verwalten</button>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Speichern</button>
    </div>
  `;
  // Toggle-Logik
  sheet.querySelector('#tglKonta').onclick = function() { this.classList.toggle('on'); };
  sheet.querySelector('#tglDenk').onclick = function() { this.classList.toggle('on'); };
  sheet.querySelector('#metaCableTypesBtn').onclick = async () => {
    const mod = await import('./modules/cableTypes.js');
    document.getElementById('modalMeta').classList.remove('open');
    mod.openCableTypesCatalog(ctx);
  };

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') document.getElementById('modalMeta').classList.remove('open');
    if (act === 'save') {
      state.meta.we = document.getElementById('metaWE').value;
      state.meta.loc = document.getElementById('metaLoc').value;
      state.meta.date = document.getElementById('metaDate').value;
      state.meta.author = document.getElementById('metaAuthor').value;
      state.meta.note = document.getElementById('metaNote').value;
      state.meta.gk = parseFloat(document.getElementById('metaGK').value) || 0;
      state.meta.wg = parseFloat(document.getElementById('metaWG').value) || 0;
      state.meta.kontaPct = parseFloat(document.getElementById('metaKontaPct').value) || 0;
      state.meta.denkPct = parseFloat(document.getElementById('metaDenkPct').value) || 0;
      state.meta.konta = sheet.querySelector('#tglKonta').classList.contains('on');
      state.meta.denk = sheet.querySelector('#tglDenk').classList.contains('on');
      document.getElementById('modalMeta').classList.remove('open');
      updateTotal();
      save();
      ctx.render();
    }
  };
  document.getElementById('modalMeta').classList.add('open');
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ========== Addresse-Suche (Nominatim) ==========
const srchInput = document.getElementById('srchInput');
const srchBtn = document.getElementById('srchBtn');
const srchRes = document.getElementById('srchRes');

async function doSearch() {
  const q = srchInput.value.trim();
  if (!q) { srchRes.classList.remove('show'); return; }
  showInfo('Suche ...');
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1&countrycodes=de,at,ch`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Language': 'de' } });
    const data = await res.json();
    if (data.length === 0) { showInfo('Keine Treffer', 'err'); srchRes.classList.remove('show'); return; }
    srchRes.innerHTML = data.map((d, i) => `<div class="item" data-i="${i}"><b>${d.display_name.split(',').slice(0,2).join(',')}</b><span style="color:#888;font-size:11px">${d.display_name}</span></div>`).join('');
    srchRes.classList.add('show');
    srchRes._data = data;
    const pickResult = (d) => {
      // Eat-Click-Guard: Map-Click direkt nach Auswahl ignorieren
      ctx._eatClickUntil = Date.now() + 350;
      map.setView([+d.lat, +d.lon], 19);
      srchRes.classList.remove('show');
      srchInput.value = d.display_name.split(',')[0];
      showInfo('✓ ' + d.display_name.split(',')[0]);
    };
    srchRes.querySelectorAll('.item').forEach(el => {
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const d = srchRes._data[+el.dataset.i];
        if (d) pickResult(d);
      };
      el.addEventListener('mousedown', handler);
      el.addEventListener('touchstart', handler, { passive: false });
      // Zusätzlich click abfangen, damit synthetische clicks (iOS, Pointer-Events) auch verschluckt werden
      el.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
    });
  } catch (e) {
    showInfo('Suche fehlgeschlagen', 'err');
    console.warn(e);
  }
}
srchBtn.onclick = doSearch;
srchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
srchInput.addEventListener('focus', () => { if (srchRes.innerHTML) srchRes.classList.add('show'); });
document.addEventListener('mousedown', e => {
  if (!srchRes.contains(e.target) && e.target !== srchInput && e.target !== srchBtn) {
    srchRes.classList.remove('show');
  }
});

// ========== Snapshot-Button (Screenshot der Karte) ==========
const snapBtn = document.getElementById('snapBtn');
if (snapBtn) {
  snapBtn.onclick = async () => {
    showInfo('Screenshot wird erstellt...');
    const mapContainer = map.getContainer();
    const size = map.getSize();
    const hide = document.querySelectorAll('.searchbar, .searchres, .layerctl, .legend, .info, .fab, .sel-badge, .leaflet-control-zoom, .leaflet-control-attribution');
    hide.forEach(el => el.style.visibility = 'hidden');
    try {
      const canvas = await html2canvas(mapContainer, {
        useCORS: true, allowTaint: true, backgroundColor: '#fff', logging: false,
        scale: 2, width: size.x, height: size.y,
        windowWidth: size.x, windowHeight: size.y, x: 0, y: 0
      });
      hide.forEach(el => el.style.visibility = '');
      canvas.toBlob(b => {
        const url = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TiefbauPorte_Snapshot_${state.meta.we || 'WE'}_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showInfo('Screenshot gespeichert ✓');
      }, 'image/png');
    } catch (e) {
      hide.forEach(el => el.style.visibility = '');
      showInfo('Snapshot fehlgeschlagen', 'err');
      console.warn(e);
    }
  };
}

// ========== Initialisierung ==========
initModeToggle(ctx);
initMapMode(ctx);
initTraceDrawing(ctx);

// Erste Zeichnung
ctx.render();
setTimeout(() => map.invalidateSize(), 300);
window.addEventListener('resize', () => map.invalidateSize());

// State ins Fenster exponieren für Debugging
window.__tbp = { state, ctx };
console.log('TiefbauPorte v6 · bereit', { catalog: state.catalog.length, objects: state.objects.length, traces: state.traces.length });
