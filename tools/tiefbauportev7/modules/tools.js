// Tools: select, trace drawing, click handlers — Leaflet
import { state, pushUndo, uid } from './state.js';
import { distMeters, recalcSegments } from './render.js';
import { bumpRecent } from './catalog.js';

let drawing = null;
let draftLayer = null;
let snapMarker = null;
const SNAP_PIXELS = 16;

function findSnapTarget(ctx, latlng){
  if (!state.objects.length) return null;
  const map = ctx.map;
  const cursorPt = map.latLngToContainerPoint(latlng);
  let best = null;
  let bestPx = SNAP_PIXELS;
  state.objects.forEach(o => {
    const p = map.latLngToContainerPoint([o.lat, o.lng]);
    const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
    if (d < bestPx){ bestPx = d; best = { lat: o.lat, lng: o.lng, objId: o.id }; }
  });
  return best;
}

function showSnapIndicator(ctx, target){
  if (!snapMarker){
    const icon = L.divIcon({ html:'<div class="kp-snap-indicator"></div>', className:'kp-snap-wrap', iconSize:[24,24], iconAnchor:[12,12] });
    snapMarker = L.marker([target.lat, target.lng], { icon, interactive:false }).addTo(ctx.map);
  } else {
    snapMarker.setLatLng([target.lat, target.lng]);
    if (!ctx.map.hasLayer(snapMarker)) snapMarker.addTo(ctx.map);
  }
}
function hideSnapIndicator(){
  if (snapMarker && snapMarker._map){ snapMarker.remove(); }
}

export function initTools(ctx){
  ctx.toolMode = 'select';

  document.querySelectorAll('.tool[data-tool]').forEach(b => {
    b.onclick = () => setTool(ctx, b.dataset.tool);
  });

  ctx.map.on('click', (e) => {
    const lat = e.latlng.lat, lng = e.latlng.lng;
    if (ctx.toolMode === 'pin' && state.selectedCat){
      placePin(ctx, lat, lng);
    } else if (ctx.toolMode === 'trace'){
      const snap = findSnapTarget(ctx, e.latlng);
      addTracePoint(ctx, snap ? snap.lat : lat, snap ? snap.lng : lng);
    } else {
      ctx.clearSelection();
    }
  });

  ctx.map.on('mousemove', (e) => {
    if (ctx.toolMode !== 'trace'){ hideSnapIndicator(); return; }
    const snap = findSnapTarget(ctx, e.latlng);
    if (snap) showSnapIndicator(ctx, snap); else hideSnapIndicator();
  });

  ctx.map.on('dblclick', () => {
    if (ctx.toolMode === 'trace' && drawing && drawing.points.length >= 2){
      finishTrace(ctx);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape'){
      if (drawing) cancelTrace(ctx);
      if (state.selectedCat){ state.selectedCat = null; setTool(ctx, 'select'); }
    }
  });
}

export function setTool(ctx, mode){
  if (ctx.toolMode === 'trace' && mode !== 'trace' && drawing) cancelTrace(ctx);
  if (mode !== 'trace') hideSnapIndicator();

  if (mode === 'trace' && !drawing && ctx.selection?.kind === 'trace'){
    const t = state.traces.find(x => x.id === ctx.selection.id);
    if (t && t.points.length){
      const choice = askExtendChoice(ctx, t);
      if (choice === 'end') beginExtend(ctx, t, 'end');
      else if (choice === 'start') beginExtend(ctx, t, 'start');
    }
  }

  ctx.toolMode = mode;
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool===mode));
  const map = document.getElementById('map');
  map.classList.toggle('tool-pin', mode==='pin');
  map.classList.toggle('tool-trace', mode==='trace');
  if (mode !== 'pin') state.selectedCat = null;
  import('./catalog.js').then(m => m.renderCatalog(ctx));
  updateHint(ctx);
}

function askExtendChoice(ctx, t){
  const i = state.traces.indexOf(t);
  const msg = `Trasse #${i+1} ist ausgewählt.\n\nOK = Am Ende der Trasse anknüpfen\nAbbrechen = Neue Trasse zeichnen`;
  return window.confirm(msg) ? 'end' : 'new';
}

function beginExtend(ctx, t, where){
  drawing = { points: t.points.slice(), extending: { traceId: t.id, where } };
  if (where === 'start') drawing.points = drawing.points.slice().reverse();
  pushUndo();
  redrawDraft(ctx);
  showFinishBtn(ctx, true);
}

function updateHint(ctx){
  const el = document.getElementById('toolHint');
  if (!el) return;
  if (ctx.toolMode === 'trace'){
    el.textContent = drawing
      ? `✏ ${drawing.points.length} Punkte · klick = mehr · Doppelklick = fertig`
      : '✏ Klicke Punkte für Trasse';
  } else if (ctx.toolMode === 'pin' && state.selectedCat){
    const c = state.catalog.find(x => x.id === state.selectedCat);
    el.textContent = `🎯 ${c?.name || ''} – auf Karte tippen`;
  } else {
    el.textContent = 'Asset im Katalog wählen oder Trasse-Tool nutzen';
  }
}

function placePin(ctx, lat, lng){
  const cat = state.catalog.find(c => c.id === state.selectedCat);
  if (!cat) return;
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
  ctx.showToast(`📍 ${cat.name} gesetzt`, 'ok');
}

function addTracePoint(ctx, lat, lng){
  if (!drawing){ drawing = { points: [] }; pushUndo(); }
  drawing.points.push([lat, lng]);
  redrawDraft(ctx);
  updateHint(ctx);
  showFinishBtn(ctx, drawing.points.length >= 2);
}

function redrawDraft(ctx){
  if (draftLayer) { ctx.map.removeLayer(draftLayer); draftLayer = null; }
  if (!drawing || drawing.points.length < 2) return;
  draftLayer = L.polyline(drawing.points, {
    color:'#D32F2F', weight:6, opacity:0.9, dashArray:'6 4'
  }).addTo(ctx.map);
}

function finishTrace(ctx){
  if (!drawing || drawing.points.length < 2) return;

  if (drawing.extending){
    const t = state.traces.find(x => x.id === drawing.extending.traceId);
    if (t){
      let newPoints = drawing.points.slice();
      if (drawing.extending.where === 'start') newPoints.reverse();
      const oldCount = t.points.length;
      t.points = newPoints;
      const allSegs = [];
      for (let i = 0; i < newPoints.length - 1; i++){
        let oldSegIdx = -1;
        if (drawing.extending.where === 'end' && i < t.segments.length) oldSegIdx = i;
        else if (drawing.extending.where === 'start'){
          const offset = newPoints.length - oldCount;
          if (i >= offset) oldSegIdx = i - offset;
        }
        if (oldSegIdx >= 0 && t.segments[oldSegIdx]) allSegs.push(t.segments[oldSegIdx]);
        else allSegs.push({ of:'OF0', hand:false, len: distMeters(newPoints[i], newPoints[i+1]) });
      }
      t.segments = allSegs;
      recalcSegments(t);
      if (drawing.extending.where === 'start'){
        const offset = newPoints.length - oldCount;
        (t.cables || []).forEach(c => { c.segIds = (c.segIds || []).map(i => i + offset); });
      }
      drawing = null;
      if (draftLayer){ ctx.map.removeLayer(draftLayer); draftLayer = null; }
      showFinishBtn(ctx, false);
      hideSnapIndicator();
      setTool(ctx, 'select');
      ctx.refresh(); ctx.save();
      ctx.selectTrace(t.id);
      ctx.showToast('🚧 Trasse erweitert', 'ok');
      return;
    }
  }

  const segments = [];
  for (let i = 0; i < drawing.points.length - 1; i++){
    segments.push({ of:'OF0', hand:false, len: distMeters(drawing.points[i], drawing.points[i+1]) });
  }
  const t = { id: uid(), points: drawing.points.slice(), segments, cables: [], note: '', photos: [] };
  state.traces.push(t);
  drawing = null;
  if (draftLayer){ ctx.map.removeLayer(draftLayer); draftLayer = null; }
  showFinishBtn(ctx, false);
  hideSnapIndicator();
  setTool(ctx, 'select');
  ctx.refresh(); ctx.save();
  ctx.selectTrace(t.id);
  ctx.showToast('🚧 Trasse erstellt', 'ok');
}

function cancelTrace(ctx){
  drawing = null;
  if (draftLayer){ ctx.map.removeLayer(draftLayer); draftLayer = null; }
  showFinishBtn(ctx, false);
  hideSnapIndicator();
  updateHint(ctx);
}

let finishBtn = null;
function showFinishBtn(ctx, show){
  if (show && !finishBtn){
    finishBtn = document.createElement('button');
    finishBtn.className = 'kp-finish-btn';
    finishBtn.textContent = '✓ Trasse fertig';
    finishBtn.onclick = () => finishTrace(ctx);
    document.getElementById('map').appendChild(finishBtn);
  } else if (!show && finishBtn){
    finishBtn.remove(); finishBtn = null;
  }
}
