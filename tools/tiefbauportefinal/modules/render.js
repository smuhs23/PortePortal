// Map render: pins (assets) + traces (cable paths) — Leaflet

import { state, saveState, pushUndo } from './state.js';
import { chainForSelection, recomputeAllSupplies } from './links.js';
import { findTracePointSnap } from './tools.js';

let pinMarkers = [];
let traceLayers = [];   // Leaflet polylines + tooltips
let vertexMarkers = [];
let supplyLines = [];

export function renderPins(ctx){
  pinMarkers.forEach(m => ctx.map.removeLayer(m));
  pinMarkers = [];
  supplyLines.forEach(l => ctx.map.removeLayer(l));
  supplyLines = [];
  if (!state.viz.pins) return;

  const chain = chainForSelection(ctx.selection);
  const hasChain = chain.objectIds.size > 0 || chain.traceIds.size > 0;

  // Versorgungs-Linien (gestrichelt) für jede Einspeisung in obj.supplies[]
  state.objects.forEach(o => {
    const supplies = Array.isArray(o.supplies) ? o.supplies : [];
    supplies.forEach(s => {
      const src = state.objects.find(x => x.id === s.sourceId);
      if (!src) return;
      const cable = state.cableTypes.find(c => c.id === s.cableTypeId);
      const color = cable?.color || '#1B2D5E';
      if (state.viz.supplyLines === false) return;
      const inChain = chain.supplyIds.has(s.id);
      const dim = hasChain && !inChain;
      const line = L.polyline([[src.lat, src.lng],[o.lat, o.lng]], {
        color, weight: inChain ? 2.5 : 1, opacity: dim ? 0.12 : (inChain ? 0.85 : 0.35),
        dashArray: '3 5', interactive: false,
      }).addTo(ctx.map);
      supplyLines.push(line);
    });
    if (state.viz.supplyLines === false) return;
    if (!supplies.length && o.supplyFromId){
      const src = state.objects.find(x => x.id === o.supplyFromId);
      if (src){
        const line = L.polyline([[src.lat, src.lng],[o.lat, o.lng]], {
          color: '#1B2D5E', weight: 1, opacity: 0.3,
          dashArray: '3 5', interactive: false,
        }).addTo(ctx.map);
        supplyLines.push(line);
      }
    }
  });

  state.objects.forEach(o => {
    const cat = state.catalog.find(c => c.id === o.catId);
    if (!cat) return;
    const isSel = ctx.selection?.kind==='object' && ctx.selection.id===o.id;
    const inChain = chain.objectIds.has(o.id);
    const dim = hasChain && !inChain;
    const html = `
      <div class="kp-pin ${cat.shape==='square'?'square':cat.shape==='hex'?'hex':''} ${isSel?'sel':''} ${inChain && !isSel ? 'chain' : ''}"
           style="background:${o.colorOverride || cat.color};${dim?'opacity:0.3;':''}">${cat.icon}${o.seqNo?`<sub style="font-size:8px;margin-left:1px">${o.seqNo}</sub>`:''}
           ${(o.customName || o.seqNo) && state.viz.labels ? `<div class="kp-label">${escapeHtml(o.customName || (cat.icon+'/'+o.seqNo))}</div>` : ''}
      </div>`;
    const sz = Number(state.viz?.pinSize) || 30;
    const icon = L.divIcon({ html, className:'kp-pin-wrap', iconSize:[sz, sz], iconAnchor:[sz/2, sz/2] });
    const m = L.marker([o.lat, o.lng], { icon, draggable:true, title: (o.customName || cat.name) + ` · ${o.qty}× ${cat.unit}` }).addTo(ctx.map);
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      import('./feed.js').then(mod => {
        if (mod.isFeedActive()){
          mod.handleFeedPick(ctx, o.id);
        } else {
          ctx.selectObject(o.id);
        }
      });
    });
    m.on('contextmenu', (e) => {
      L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e);
      const oe = e.originalEvent;
      showPinContextMenu(oe.clientX, oe.clientY, o, ctx);
    });
    m.on('dragstart', () => pushUndo());
    m.on('dragend', (e) => {
      const p = e.target.getLatLng();
      let lat = p.lat, lng = p.lng;
      const snap = findTracePointSnap(ctx, lat, lng);
      if (snap){
        lat = snap.lat; lng = snap.lng;
        o.linkedTraceId = snap.traceId;
        o.linkedPointIdx = snap.pointIdx;
        e.target.setLatLng([lat, lng]);
      } else {
        o.linkedTraceId = null;
        o.linkedPointIdx = null;
      }
      o.lat = lat; o.lng = lng;
      recomputeAllSupplies();
      ctx.save();
      ctx.refreshInspector();
    });
    pinMarkers.push(m);
  });
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function showPinContextMenu(x, y, obj, ctx){
  const menu = document.getElementById('ctxMenu');
  menu.innerHTML = `
    <div class="item" data-act="edit">✎ Bearbeiten</div>
    <div class="item" data-act="dup">⎘ Duplizieren</div>
    <div class="sep"></div>
    <div class="item danger" data-act="del">🗑 Löschen</div>
  `;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.hidden = false;
  const close = () => { menu.hidden = true; document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
  menu.querySelectorAll('.item').forEach(it => {
    it.onclick = () => {
      const act = it.dataset.act;
      if (act === 'edit') ctx.selectObject(obj.id);
      if (act === 'dup'){
        pushUndo();
        const dup = JSON.parse(JSON.stringify(obj));
        dup.id = 'i_' + Math.random().toString(36).slice(2,10);
        dup.lat += 0.0001; dup.lng += 0.0001;
        state.objects.push(dup);
        ctx.refresh();
        ctx.save();
      }
      if (act === 'del'){
        pushUndo();
        const i = state.objects.findIndex(o => o.id === obj.id);
        if (i>=0){
          state.objects.splice(i,1);
          import('./links.js').then(m => { m.cleanupAfterObjectDelete(obj.id); ctx.refresh(); ctx.save(); });
        }
        if (ctx.selection?.id === obj.id) ctx.selection = null;
        ctx.refresh();
        ctx.save();
      }
      menu.hidden = true;
    };
  });
}

export function renderTraces(ctx){
  traceLayers.forEach(l => ctx.map.removeLayer(l));
  traceLayers = [];
  vertexMarkers.forEach(m => ctx.map.removeLayer(m));
  vertexMarkers = [];

  if (!state.viz.traces) return;

  const chain = chainForSelection(ctx.selection);
  const hasChain = chain.traceIds.size > 0 || chain.objectIds.size > 0;

  state.traces.forEach((t) => {
    const isSelTrace = ctx.selection?.kind==='trace' && ctx.selection.id===t.id;
    const inChain = chain.traceIds.has(t.id);
    const dim = hasChain && !inChain && !isSelTrace;
    // Abzweig-Knoten visualisieren (am parentPointIdx der Mutter-Trasse)
    if (t.parentTraceId && t.points.length){
      const parent = state.traces.find(x => x.id === t.parentTraceId);
      if (parent && parent.points[t.parentPointIdx]){
        const pp = parent.points[t.parentPointIdx];
        const branchIcon = L.divIcon({
          html: '<div class="kp-branch-node" title="Abzweig"></div>',
          className: 'kp-branch-wrap',
          iconSize: [14,14], iconAnchor:[7,7],
        });
        const bm = L.marker(pp, { icon: branchIcon, interactive:false, keyboard:false }).addTo(ctx.map);
        traceLayers.push(bm);
      }
    }
    t.segments.forEach((seg, i) => {
      const a = t.points[i], b = t.points[i+1];
      if (!a || !b) return;
      const def = state.OF_DEFS[seg.of];
      const isSelSeg = isSelTrace && ctx.selection.segIdx === i;
      const poly = L.polyline([a, b], {
        color: def?.color || '#D32F2F',
        weight: isSelSeg ? 11 : (inChain && !isSelTrace ? 9 : 8),
        opacity: dim ? 0.2 : (isSelTrace ? 1 : (inChain ? 1 : 0.85)),
        dashArray: seg.hand ? '6 4' : null,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(ctx.map);
      poly.on('click', (e) => { L.DomEvent.stopPropagation(e); ctx.selectTrace(t.id, i); });
      poly.on('mouseover', () => poly._path && (poly._path.style.cursor = 'pointer'));
      traceLayers.push(poly);
    });

    // Trassen-Label entlang des ersten Segments (gedrehter Text, kein Pillen-Hintergrund)
    const traceIdx = state.traces.indexOf(t);
    if (t.points.length >= 2){
      const a = t.points[0], b = t.points[1];
      const labelText = t.name && t.name.trim() ? t.name.trim() : `Trasse ${traceIdx+1}`;
      const placement = computeLabelPlacement(ctx, a, b);
      const labelHtml = `<div class="kp-trace-label ${isSelTrace?'sel':''}"
        style="transform: translate(-50%, -50%) rotate(${placement.angleDeg}deg); color:${state.OF_DEFS[t.segments[0]?.of]?.color || '#D32F2F'}">
        ${escapeHtml(labelText)}
      </div>`;
      const labelIcon = L.divIcon({ html: labelHtml, className:'kp-trace-label-wrap', iconSize:[1,1], iconAnchor:[0,0] });
      const labelMarker = L.marker(placement.midLatLng, { icon: labelIcon, interactive: true, keyboard: false }).addTo(ctx.map);
      labelMarker.on('click', (e) => { L.DomEvent.stopPropagation(e); ctx.selectTrace(t.id); });
      traceLayers.push(labelMarker);
    }

    if (isSelTrace){
      t.points.forEach((p, i) => {
        const icon = L.divIcon({ html:'<div class="kp-vertex"></div>', className:'kp-vertex-wrap', iconSize:[16,16], iconAnchor:[8,8] });
        const m = L.marker([p[0], p[1]], { icon, draggable:true, autoPan:true }).addTo(ctx.map);
        m.on('dragstart', () => pushUndo());
        m.on('drag', (e) => {
          let ll = e.target.getLatLng();
          // Snap auf Assets oder andere Trassen-Punkte während des Ziehens
          const snap = findAssetSnap(ctx, ll, t, i);
          if (snap){
            ll = L.latLng(snap.lat, snap.lng);
            e.target.setLatLng(ll);
          }
          t.points[i] = [ll.lat, ll.lng];
          // Nur Polylines live aktualisieren — Marker NICHT neu erzeugen (würde Drag abbrechen)
          updatePolylinesLive(ctx, t);
          recalcSegments(t);
          ctx.refreshTimeline();
          ctx.refreshInspector();
        });
        m.on('dragend', () => {
          // Vollständig neu rendern (für saubere Marker-Anordnung)
          recomputeAllSupplies();
          renderTraces(ctx);
          ctx.save();
          ctx.refreshInspector();
        });
        m.on('contextmenu', (e) => {
          L.DomEvent.preventDefault(e);
          if (t.points.length <= 2){ ctx.showToast('Mindestens 2 Punkte', 'err'); return; }
          if (confirm(`Punkt #${i+1} löschen?`)){
            pushUndo();
            t.points.splice(i,1);
            if (i === 0) t.segments.splice(0,1);
            else if (i === t.points.length) t.segments.splice(i-1,1);
            else t.segments.splice(i-1,1);
            adjustCablesAfter(t, i === 0 ? 0 : i-1);
            recalcSegments(t);
            recomputeAllSupplies();
            renderTraces(ctx);
            ctx.refreshTimeline();
            ctx.save();
          }
        });
        vertexMarkers.push(m);
      });
    }
  });
}

// Berechnet Mittelpunkt + Drehwinkel eines Segments (in Pixel-Raum, damit Text gerade liest)
function computeLabelPlacement(ctx, a, b){
  const map = ctx.map;
  const pa = map.latLngToContainerPoint(a);
  const pb = map.latLngToContainerPoint(b);
  let dx = pb.x - pa.x, dy = pb.y - pa.y;
  // Wenn Text "auf dem Kopf" stünde (Winkel > 90° absolut) → drehen, damit lesbar
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  const midLatLng = L.latLng((a[0]+b[0])/2, (a[1]+b[1])/2);
  return { midLatLng, angleDeg: angle };
}

// Snap-Suche für Vertex-Drag (Assets + andere Trassen-Punkte, nicht der eigene)
function findAssetSnap(ctx, latlng, excludeTrace, excludePointIdx){
  const cursorPt = ctx.map.latLngToContainerPoint(latlng);
  let best = null, bestPx = 18;
  state.objects.forEach(o => {
    const p = ctx.map.latLngToContainerPoint([o.lat, o.lng]);
    const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
    if (d < bestPx){ bestPx = d; best = { lat:o.lat, lng:o.lng }; }
  });
  state.traces.forEach(t => {
    t.points.forEach((pt, i) => {
      if (t === excludeTrace && i === excludePointIdx) return;
      const p = ctx.map.latLngToContainerPoint(pt);
      const d = Math.hypot(p.x - cursorPt.x, p.y - cursorPt.y);
      if (d < bestPx){ bestPx = d; best = { lat:pt[0], lng:pt[1] }; }
    });
  });
  return best;
}

// Aktualisiert NUR die Polylines der angegebenen Trasse während Drag
function updatePolylinesLive(ctx, t){
  let segIdx = 0;
  // Iteriere über alle traceLayers; finde diejenigen, die zu dieser Trasse gehören
  // Einfachste Methode: alle aktualisieren – wir wissen Reihenfolge entspricht state.traces
  // → wir aktualisieren nur die Polylines die zu Trasse t gehören:
  // Da traceLayers in Reihenfolge angelegt wurde (für jede Trasse je ein Polyline pro Segment),
  // berechnen wir Offset:
  let offset = 0;
  for (const tr of state.traces){
    if (tr === t) break;
    offset += tr.segments.length;
  }
  for (let i = 0; i < t.segments.length; i++){
    const layer = traceLayers[offset + i];
    if (!layer) continue;
    const a = t.points[i], b = t.points[i+1];
    if (a && b) layer.setLatLngs([a, b]);
  }
}

export function recalcSegments(t){
  while (t.segments.length > t.points.length - 1) t.segments.pop();
  while (t.segments.length < t.points.length - 1) t.segments.push({of:'OF0', hand:false, len:0});
  for (let i = 0; i < t.segments.length; i++){
    t.segments[i].len = distMeters(t.points[i], t.points[i+1]);
  }
}

function adjustCablesAfter(t, deletedIdx){
  if (!Array.isArray(t.cables)) return;
  t.cables.forEach(c => {
    if (!Array.isArray(c.segIds)) { c.segIds = []; return; }
    c.segIds = c.segIds.filter(i => i !== deletedIdx).map(i => i > deletedIdx ? i-1 : i);
  });
  t.cables = t.cables.filter(c => c.segIds.length > 0);
}

export function distMeters(a, b){
  const R=6371000, toRad = x => x*Math.PI/180;
  const dLat = toRad(b[0]-a[0]), dLng = toRad(b[1]-a[1]);
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1)*Math.cos(lat2);
  return 2*R*Math.asin(Math.sqrt(x));
}
