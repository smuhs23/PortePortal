// TiefbauPorte — Main entry point
// Imports all modules and wires them together

import { state, loadState, saveState, pushUndo, undo, redo, dirty, uid } from './modules/state.js';
import { initMap, getMap, refocusMap, setBasemap } from './modules/map.js';
import { renderCatalog, initCatalog, bumpRecent } from './modules/catalog.js';
import { renderTree } from './modules/tree.js';
import { renderInspector, selectObject, selectTrace, clearSelection } from './modules/inspector.js';
import { renderBOM } from './modules/bom.js';
import { renderPins, renderTraces } from './modules/render.js';
import { initTools, setTool } from './modules/tools.js';
import { initTimeline, showTimeline, hideTimeline, refreshTimeline } from './modules/timeline.js';
import { initExport } from './modules/export.js';
import { initCatalogManager } from './modules/catManager.js';
import { initWelcome } from './modules/welcome.js';
import { showToast } from './modules/ui.js';

const ctx = {
  state,
  map: null,
  selection: null, // {kind:'object'|'trace', id} or null
  hoveredTrace: null,
  refresh: () => fullRender(),
  refreshInspector: () => renderInspector(ctx),
  refreshTree: () => renderTree(ctx),
  refreshBOM: () => renderBOM(ctx),
  refreshTimeline: () => refreshTimeline(ctx),
  selectObject: (id) => { ctx.selection = id ? {kind:'object', id} : null; renderInspector(ctx); renderTree(ctx); renderPins(ctx); },
  selectTrace: (id, segIdx) => {
    ctx.selection = id ? {kind:'trace', id, segIdx} : null;
    renderInspector(ctx); renderTree(ctx); renderTraces(ctx);
    if (id) showTimeline(ctx, id, segIdx); else hideTimeline(ctx);
  },
  clearSelection: () => { ctx.selection = null; renderInspector(ctx); renderTree(ctx); renderPins(ctx); renderTraces(ctx); hideTimeline(ctx); },
  pushUndo: () => pushUndo(),
  save: () => { saveState(); updateSaveStatus(); },
  showToast,
};

window.ctx = ctx; // debug

function fullRender(){
  renderPins(ctx);
  renderTraces(ctx);
  renderCatalog(ctx);
  renderTree(ctx);
  renderInspector(ctx);
  renderBOM(ctx);
  refreshTimeline(ctx);
  updateTotals();
  updateSaveStatus();
}

function updateTotals(){
  const totals = computeGrandTotal(state);
  document.getElementById('topTotal').textContent = fmtEur(totals);
}

function computeGrandTotal(s){
  let sum = 0;
  // Assets
  s.objects.forEach(o => {
    sum += (Number(o.qty)||0) * (Number(o.price)||0);
  });
  // Trassen + Kabel
  s.traces.forEach(t => {
    t.segments.forEach(seg => {
      const def = state.OF_DEFS[seg.of];
      if (def) sum += seg.len * (def.prOF + def.prWH + (state.PRICE_GRABEN + (seg.hand ? state.PRICE_HAND : 0)));
    });
    (t.cables||[]).forEach(c => {
      const baseLen = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      const eff = c.reserveMode === 'm' ? baseLen + (Number(c.reserveValue)||0) : baseLen * (1 + (Number(c.reserveValue)||0)/100);
      const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
      sum += eff * (Number(c.count)||0) * unit;
    });
  });
  // Zuschläge
  const meta = s.meta || {};
  const tiefbau = sum; // simplified
  const konta = meta.konta ? tiefbau * (Number(meta.kontaPct)||0)/100 : 0;
  const denk  = meta.denk  ? tiefbau * (Number(meta.denkPct)||0)/100 : 0;
  const netto = sum + konta + denk;
  const gk = netto * (Number(meta.gk)||0)/100;
  const wg = (netto + gk) * (Number(meta.wg)||0)/100;
  return netto + gk + wg;
}

function fmtEur(n){
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n||0);
}

function updateSaveStatus(){
  const el = document.getElementById('saveStatus');
  if (dirty()){
    el.textContent = '💾 ungespeichert';
    el.classList.add('dirty');
  } else {
    el.textContent = '💾 gespeichert';
    el.classList.remove('dirty');
  }
}

function initTabs(){
  document.querySelectorAll('.panel-tabs').forEach(tabbar => {
    const panes = tabbar.parentElement.querySelectorAll('.ppane');
    tabbar.querySelectorAll('.ptab').forEach(btn => {
      btn.onclick = () => {
        tabbar.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b === btn));
        panes.forEach(p => p.classList.toggle('active', p.dataset.pt === btn.dataset.pt));
      };
    });
  });
}

function initTopbar(){
  document.getElementById('btnUndo').onclick = () => { undo(); fullRender(); };
  document.getElementById('btnRedo').onclick = () => { redo(); fullRender(); };
  document.getElementById('projName').oninput = (e) => { state.meta.name = e.target.value; saveState(); };
  document.getElementById('projWE').oninput = (e) => { state.meta.we = e.target.value; saveState(); };
  document.getElementById('btnExport').onclick = () => {
    import('./modules/export.js').then(m => m.openExportDialog(ctx));
  };
  // Column toggles
  document.getElementById('btnToggleLeft').onclick = () => {
    document.body.classList.toggle('hide-left');
    setTimeout(() => ctx.map?.invalidateSize?.(), 220);
  };
  document.getElementById('btnToggleRight').onclick = () => {
    document.body.classList.toggle('hide-right');
    setTimeout(() => ctx.map?.invalidateSize?.(), 220);
  };
  // Basemap
  document.querySelectorAll('#basemapGroup .tool').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('#basemapGroup .tool').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      setBasemap(ctx.map, b.dataset.base);
      fullRender();
    };
  });
  // Global location search
  initGlobalSearch();
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if ((e.ctrlKey||e.metaKey) && e.key === 'z' && !e.shiftKey){ e.preventDefault(); undo(); fullRender(); }
    if ((e.ctrlKey||e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))){ e.preventDefault(); redo(); fullRender(); }
    if (e.key === 'Escape'){ ctx.clearSelection(); }
    if (e.key === 'Delete' || e.key === 'Backspace'){
      if (ctx.selection){
        e.preventDefault();
        deleteSelection();
      }
    }
  });
}

function initGlobalSearch(){
  const inp = document.getElementById('globalSearch');
  const out = document.getElementById('globalSearchResults');
  let timer = null;
  inp.oninput = () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 3){ out.hidden = true; return; }
    timer = setTimeout(async () => {
      try{
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6`);
        const data = await r.json();
        if (!data.length){ out.innerHTML = '<div class="sr-empty">Keine Treffer</div>'; out.hidden = false; return; }
        out.innerHTML = data.map(d =>
          `<div class="sr-item" data-lat="${d.lat}" data-lon="${d.lon}">${escapeHtml(d.display_name)}</div>`
        ).join('');
        out.hidden = false;
        out.querySelectorAll('.sr-item').forEach(it => {
          it.onclick = () => {
            ctx.map.flyTo({ center:[Number(it.dataset.lon), Number(it.dataset.lat)], zoom: 18, duration: 700 });
            out.hidden = true;
            inp.value = '';
          };
        });
      }catch(e){ out.hidden = true; }
    }, 350);
  };
  inp.onblur = () => setTimeout(() => out.hidden = true, 200);
  inp.onfocus = () => { if (out.innerHTML) out.hidden = false; };
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function deleteSelection(){
  if (!ctx.selection) return;
  pushUndo();
  if (ctx.selection.kind === 'object'){
    const idx = state.objects.findIndex(o => o.id === ctx.selection.id);
    if (idx >= 0) state.objects.splice(idx, 1);
  } else if (ctx.selection.kind === 'trace'){
    const idx = state.traces.findIndex(t => t.id === ctx.selection.id);
    if (idx >= 0) state.traces.splice(idx, 1);
  }
  ctx.selection = null;
  fullRender();
  ctx.save();
  showToast('Gelöscht');
}

// Init
async function init(){
  loadState();
  document.getElementById('projName').value = state.meta.name || 'Neues Projekt';
  document.getElementById('projWE').value = state.meta.we || '';
  initTabs();
  initTopbar();
  ctx.map = await initMap();
  initTools(ctx);
  initCatalog(ctx);
  initTimeline(ctx);
  initExport(ctx);
  initCatalogManager(ctx);
  initWelcome(ctx);

  // Viz toggles — sync state ↔ checkbox initial
  document.getElementById('vizPins').checked = state.viz.pins !== false;
  document.getElementById('vizTraces').checked = state.viz.traces !== false;
  document.getElementById('vizLabels').checked = !!state.viz.labels;
  document.getElementById('vizPins').onchange = (e) => { state.viz.pins = e.target.checked; renderPins(ctx); };
  document.getElementById('vizTraces').onchange = (e) => { state.viz.traces = e.target.checked; renderTraces(ctx); };
  document.getElementById('vizLabels').onchange = (e) => { state.viz.labels = e.target.checked; renderPins(ctx); };

  // Pin-Size Slider
  const pinSlider = document.getElementById('pinSizeSlider');
  const pinVal = document.getElementById('pinSizeVal');
  if (pinSlider){
    const initSize = Number(state.viz.pinSize) || 30;
    pinSlider.value = initSize;
    pinVal.textContent = initSize;
    document.documentElement.style.setProperty('--pin-size', initSize + 'px');
    pinSlider.oninput = (e) => {
      const sz = Number(e.target.value) || 30;
      state.viz.pinSize = sz;
      pinVal.textContent = sz;
      document.documentElement.style.setProperty('--pin-size', sz + 'px');
      renderPins(ctx);
      saveState();
    };
  }

  // GPS-Button: Asset an aktueller Position setzen
  const btnGps = document.getElementById('btnGpsPlace');
  if (btnGps){
    btnGps.onclick = () => placeAtGps(ctx);
  }

  // GPS-Sprung-Button: Karte auf aktuelle Position zentrieren
  const btnGpsJump = document.getElementById('btnGpsJump');
  if (btnGpsJump){
    btnGpsJump.onclick = () => jumpToGps(ctx);
  }

  // Screenshot-Button
  const btnSnap = document.getElementById('btnScreenshot');
  if (btnSnap){
    btnSnap.onclick = () => captureMapScreenshot(ctx);
  }

  fullRender();

  // First-time: show welcome
  if (!state.meta.we && state.objects.length === 0 && state.traces.length === 0){
    import('./modules/welcome.js').then(m => m.openWelcome(ctx));
  }
}

init();

// === GPS-Sprung: Karte auf aktuelle Position zentrieren ===
let _gpsMarker = null;
function jumpToGps(ctx){
  if (!navigator.geolocation){
    ctx.showToast('GPS wird vom Browser nicht unterstützt', 'err');
    return;
  }
  ctx.showToast('📡 GPS-Position wird ermittelt…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      ctx.map?.flyTo([lat, lng], Math.max(ctx.map.getZoom(), 18), { duration: 0.7 });
      // Marker setzen für aktuelle Position
      if (_gpsMarker) _gpsMarker.remove();
      const icon = L.divIcon({
        html: '<div class="kp-gps-marker"></div>',
        className: 'kp-gps-wrap',
        iconSize: [20, 20], iconAnchor: [10, 10]
      });
      _gpsMarker = L.marker([lat, lng], { icon, interactive:false }).addTo(ctx.map);
      ctx.showToast(`🧭 Aktuelle Position (±${Math.round(pos.coords.accuracy)}m)`, 'ok');
    },
    (err) => {
      const msg = err.code === 1 ? 'GPS-Zugriff verweigert'
                : err.code === 2 ? 'Position nicht verfügbar'
                : err.code === 3 ? 'GPS-Timeout'
                : 'GPS-Fehler';
      ctx.showToast('❌ ' + msg, 'err');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

// === Screenshot: Karten-Ausschnitt + Pins/Trassen als PNG ===
async function captureMapScreenshot(ctx){
  if (!ctx.map){ ctx.showToast('Karte nicht bereit', 'err'); return; }
  ctx.showToast('📸 Screenshot wird erstellt…');
  const map = ctx.map;
  const size = map.getSize();
  const W = size.x, H = size.y;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const cctx = canvas.getContext('2d');
  cctx.fillStyle = '#e8eef3';
  cctx.fillRect(0, 0, W, H);

  // 1) Tiles zeichnen
  const tilePane = map.getPanes().tilePane;
  const imgs = Array.from(tilePane.querySelectorAll('img.leaflet-tile-loaded'));
  const mapRect = map.getContainer().getBoundingClientRect();
  for (const img of imgs){
    try{
      const r = img.getBoundingClientRect();
      const x = r.left - mapRect.left, y = r.top - mapRect.top;
      cctx.drawImage(img, x, y, r.width, r.height);
    }catch(e){ /* CORS-Tile übersprungen */ }
  }

  // 2) Polylines (Trassen) zeichnen
  state.traces.forEach(t => {
    if (!state.viz.traces) return;
    t.segments.forEach((seg, i) => {
      const a = t.points[i], b = t.points[i+1];
      if (!a || !b) return;
      const def = state.OF_DEFS[seg.of];
      const pa = map.latLngToContainerPoint(a);
      const pb = map.latLngToContainerPoint(b);
      cctx.lineWidth = 7;
      cctx.lineCap = 'round';
      cctx.strokeStyle = def?.color || '#D32F2F';
      if (seg.hand){ cctx.setLineDash([6,4]); } else { cctx.setLineDash([]); }
      cctx.beginPath();
      cctx.moveTo(pa.x, pa.y);
      cctx.lineTo(pb.x, pb.y);
      cctx.stroke();
    });
  });
  cctx.setLineDash([]);

  // 3) Pins (Assets) zeichnen
  if (state.viz.pins){
    const sz = Number(state.viz.pinSize) || 30;
    state.objects.forEach(o => {
      const cat = state.catalog.find(c => c.id === o.catId);
      if (!cat) return;
      const p = map.latLngToContainerPoint([o.lat, o.lng]);
      cctx.fillStyle = o.colorOverride || cat.color || '#1B2D5E';
      cctx.strokeStyle = '#fff';
      cctx.lineWidth = 2;
      const r = sz/2;
      if (cat.shape === 'square'){
        cctx.fillRect(p.x-r, p.y-r, sz, sz);
        cctx.strokeRect(p.x-r, p.y-r, sz, sz);
      } else if (cat.shape === 'hex'){
        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(Math.PI/4);
        cctx.fillRect(-r, -r, sz, sz);
        cctx.strokeRect(-r, -r, sz, sz);
        cctx.restore();
      } else {
        cctx.beginPath();
        cctx.arc(p.x, p.y, r, 0, Math.PI*2);
        cctx.fill();
        cctx.stroke();
      }
      // Icon-Text
      cctx.fillStyle = '#fff';
      cctx.font = `700 ${Math.round(sz*0.32)}px sans-serif`;
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      cctx.fillText(String(cat.icon||'').slice(0,3), p.x, p.y);
    });
  }

  // 4) Header / Projekt-Info
  cctx.fillStyle = 'rgba(27,45,94,0.92)';
  cctx.fillRect(0, 0, W, 36);
  cctx.fillStyle = '#fff';
  cctx.font = '700 14px sans-serif';
  cctx.textAlign = 'left';
  cctx.textBaseline = 'middle';
  cctx.fillText(`TiefbauPorte · ${state.meta.name||'Projekt'} · ${new Date().toLocaleString('de-DE')}`, 12, 18);

  // Speichern
  canvas.toBlob((blob) => {
    if (!blob){ ctx.showToast('Screenshot fehlgeschlagen', 'err'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.meta.name||'Projekt'}_${new Date().toISOString().slice(0,10)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    ctx.showToast('📸 Screenshot gespeichert', 'ok');
  }, 'image/png');
}

// === GPS: Asset an aktueller Position setzen ===
function placeAtGps(ctx){
  if (!state.selectedCat){
    ctx.showToast('Bitte zuerst ein Asset im Katalog auswählen', 'err');
    return;
  }
  if (!navigator.geolocation){
    ctx.showToast('GPS wird vom Browser nicht unterstützt', 'err');
    return;
  }
  const cat = state.catalog.find(c => c.id === state.selectedCat);
  if (!cat){ ctx.showToast('Asset nicht gefunden', 'err'); return; }

  ctx.showToast('📡 GPS-Position wird ermittelt…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      pushUndo();
      const o = {
        id: uid(), catId: cat.id, lat, lng, qty: 1, price: cat.price,
        amps: '', kw: '', note: '', photos: [],
        customName: '', colorOverride: '',
        linkedTraceId: null, linkedSegmentIdx: null,
      };
      state.objects.push(o);
      bumpRecent(cat.id);
      ctx.refresh();
      ctx.save();
      ctx.selectObject(o.id);
      // Karte auf Position zentrieren
      ctx.map?.flyTo([lat, lng], Math.max(ctx.map.getZoom(), 18), { duration: 0.7 });
      ctx.showToast(`🛰📍 ${cat.name} an GPS-Position gesetzt (±${Math.round(pos.coords.accuracy)}m)`, 'ok');
    },
    (err) => {
      const msg = err.code === 1 ? 'GPS-Zugriff verweigert'
                : err.code === 2 ? 'Position nicht verfügbar'
                : err.code === 3 ? 'GPS-Timeout'
                : 'GPS-Fehler';
      ctx.showToast('❌ ' + msg, 'err');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}
