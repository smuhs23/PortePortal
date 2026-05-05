// Tools: select, trace drawing, click handlers — Leaflet
import { state, pushUndo, uid } from './state.js';
import { distMeters, recalcSegments } from './render.js';
import { bumpRecent } from './catalog.js';

let drawing = null;
let draftLayer = null;
let snapMarker = null;
const SNAP_PIXELS = 16;

function findSnapTarget(ctx, latlng){
  const map = ctx.map;
  const cursorPt = map.latLngToContainerPoint(latlng);
  let best = null;
  let bestPx = SNAP_PIXELS;
  // 1. Asset-Pins
  state.objects.forEach(o => {
    const p = map.latLngToContainerPoint([o.lat, o.lng]);
    const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
    if (d < bestPx){ bestPx = d; best = { lat: o.lat, lng: o.lng, objId: o.id, kind: 'asset' }; }
  });
  // 2. Trassen-Punkte (für Abzweig)
  state.traces.forEach(t => {
    t.points.forEach((pt, i) => {
      const p = map.latLngToContainerPoint(pt);
      const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
      if (d < bestPx){ bestPx = d; best = { lat: pt[0], lng: pt[1], traceId: t.id, pointIdx: i, kind: 'tracePoint' }; }
    });
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

// Findet nächsten Trassen-Punkt im Pixel-Radius (für Asset-Snap auf Trassen-Punkte)
export function findTracePointSnap(ctx, lat, lng, maxPx = 22){
  const cursorPt = ctx.map.latLngToContainerPoint([lat, lng]);
  let best = null, bestPx = maxPx;
  state.traces.forEach(t => {
    t.points.forEach((pt, i) => {
      const p = ctx.map.latLngToContainerPoint(pt);
      const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
      if (d < bestPx){
        bestPx = d;
        best = { lat: pt[0], lng: pt[1], traceId: t.id, pointIdx: i };
      }
    });
  });
  return best;
}

export function initTools(ctx){
  ctx.toolMode = 'select';

  document.querySelectorAll('.tool[data-tool]').forEach(b => {
    b.onclick = () => setTool(ctx, b.dataset.tool);
  });

  // Click → mit kleiner Verzögerung, damit dblclick Vorrang hat
  let clickTimer = null;
  ctx.map.on('click', (e) => {
    const lat = e.latlng.lat, lng = e.latlng.lng;
    if (ctx.toolMode === 'pin' && state.selectedCat){
      placePin(ctx, lat, lng);
    } else if (ctx.toolMode === 'trace'){
      // Defer, falls dblclick folgt
      clearTimeout(clickTimer);
      const snap = findSnapTarget(ctx, e.latlng);
      const useLat = snap ? snap.lat : lat;
      const useLng = snap ? snap.lng : lng;
      const branchInfo = (snap && snap.kind === 'tracePoint' && (!drawing || drawing.points.length === 0))
        ? { traceId: snap.traceId, pointIdx: snap.pointIdx } : null;
      clickTimer = setTimeout(() => {
        addTracePoint(ctx, useLat, useLng, branchInfo);
      }, 220);
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
    clearTimeout(clickTimer);
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
    if (drawing){
      const tag = drawing.branch ? '🔀 Abzweig · ' : '';
      el.textContent = `✏ ${tag}${drawing.points.length} Punkte · klick = mehr · Doppelklick = fertig`;
    } else {
      el.textContent = '✏ Klicke Punkte für Trasse · Klick auf bestehenden Trassen-Punkt = Abzweig';
    }
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
  // Snap auf nächstgelegenen Trassen-Punkt im Pixel-Radius
  const snap = findTracePointSnap(ctx, lat, lng);
  if (snap){ lat = snap.lat; lng = snap.lng; }
  // Nächste freie Nummer pro Katalog-Typ ermitteln (LN2/1, LN2/2, ...)
  const usedNos = state.objects
    .filter(x => x.catId === cat.id)
    .map(x => Number(x.seqNo)||0)
    .filter(n => n > 0);
  let seqNo = 1;
  while (usedNos.includes(seqNo)) seqNo++;
  const o = {
    id: uid(), catId: cat.id, lat, lng, qty: 1, price: cat.price,
    seqNo,
    amps: '', kw: '', note: '', photos: [],
    customName: '', colorOverride: '',
    linkedTraceId: snap?.traceId || null,
    linkedPointIdx: snap?.pointIdx ?? null,
    linkedSegmentIdx: null,
  };
  state.objects.push(o);
  // Sicherstellen, dass Pins sichtbar sind
  if (state.viz.pins === false){
    state.viz.pins = true;
    const cb = document.getElementById('vizPins'); if (cb) cb.checked = true;
  }
  bumpRecent(cat.id);
  ctx.refresh();
  ctx.save();
  ctx.selectObject(o.id);
  ctx.showToast(`📍 ${cat.name} gesetzt`, 'ok');
}

function addTracePoint(ctx, lat, lng, branchInfo = null){
  if (!drawing){
    drawing = { points: [] };
    pushUndo();
    if (branchInfo) drawing.branch = branchInfo;
  }
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
      import('./links.js').then(m => m.recomputeAllSupplies());
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
  const t = {
    id: uid(),
    points: drawing.points.slice(),
    segments,
    cables: [],
    note: '',
    photos: [],
    parentTraceId: drawing.branch?.traceId || null,
    parentPointIdx: drawing.branch?.pointIdx ?? null,
  };
  state.traces.push(t);
  // Sicherstellen, dass Trassen sichtbar sind
  if (state.viz.traces === false){
    state.viz.traces = true;
    const cb = document.getElementById('vizTraces'); if (cb) cb.checked = true;
  }
  drawing = null;
  if (draftLayer){ ctx.map.removeLayer(draftLayer); draftLayer = null; }
  showFinishBtn(ctx, false);
  hideSnapIndicator();
  setTool(ctx, 'select');
  ctx.refresh(); ctx.save();
  ctx.selectTrace(t.id);
  ctx.showToast(t.parentTraceId ? '🔀 Abzweig-Trasse erstellt' : '🚧 Trasse erstellt', 'ok');
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
