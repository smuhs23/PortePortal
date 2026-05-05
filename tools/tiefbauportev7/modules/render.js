// Map render: pins (assets) + traces (cable paths) — Leaflet

import { state, saveState, pushUndo } from './state.js';

let pinMarkers = [];
let traceLayers = [];   // Leaflet polylines + tooltips
let vertexMarkers = [];

export function renderPins(ctx){
  pinMarkers.forEach(m => ctx.map.removeLayer(m));
  pinMarkers = [];
  if (!state.viz.pins) return;

  state.objects.forEach(o => {
    const cat = state.catalog.find(c => c.id === o.catId);
    if (!cat) return;
    const isSel = ctx.selection?.kind==='object' && ctx.selection.id===o.id;
    const html = `
      <div class="kp-pin ${cat.shape==='square'?'square':cat.shape==='hex'?'hex':''} ${isSel?'sel':''}"
           style="background:${o.colorOverride || cat.color}">${cat.icon}
           ${o.customName && state.viz.labels ? `<div class="kp-label">${escapeHtml(o.customName)}</div>` : ''}
      </div>`;
    const sz = Number(state.viz?.pinSize) || 30;
    const icon = L.divIcon({ html, className:'kp-pin-wrap', iconSize:[sz, sz], iconAnchor:[sz/2, sz/2] });
    const m = L.marker([o.lat, o.lng], { icon, draggable:true, title: (o.customName || cat.name) + ` · ${o.qty}× ${cat.unit}` }).addTo(ctx.map);
    m.on('click', (e) => { L.DomEvent.stopPropagation(e); ctx.selectObject(o.id); });
    m.on('contextmenu', (e) => {
      L.DomEvent.preventDefault(e); L.DomEvent.stopPropagation(e);
      const oe = e.originalEvent;
      showPinContextMenu(oe.clientX, oe.clientY, o, ctx);
    });
    m.on('dragstart', () => pushUndo());
    m.on('dragend', (e) => {
      const p = e.target.getLatLng();
      o.lat = p.lat; o.lng = p.lng;
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
        if (i>=0) state.objects.splice(i,1);
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

  state.traces.forEach((t) => {
    const isSelTrace = ctx.selection?.kind==='trace' && ctx.selection.id===t.id;
    t.segments.forEach((seg, i) => {
      const a = t.points[i], b = t.points[i+1];
      if (!a || !b) return;
      const def = state.OF_DEFS[seg.of];
      const isSelSeg = isSelTrace && ctx.selection.segIdx === i;
      const poly = L.polyline([a, b], {
        color: def?.color || '#D32F2F',
        weight: isSelSeg ? 11 : 8,
        opacity: isSelTrace ? 1 : 0.85,
        dashArray: seg.hand ? '6 4' : null,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(ctx.map);
      poly.on('click', (e) => { L.DomEvent.stopPropagation(e); ctx.selectTrace(t.id, i); });
      poly.on('mouseover', () => poly._path && (poly._path.style.cursor = 'pointer'));
      traceLayers.push(poly);
    });

    if (isSelTrace){
      t.points.forEach((p, i) => {
        const icon = L.divIcon({ html:'<div class="kp-vertex"></div>', className:'kp-vertex-wrap', iconSize:[14,14], iconAnchor:[7,7] });
        const m = L.marker([p[0], p[1]], { icon, draggable:true }).addTo(ctx.map);
        m.on('dragstart', () => pushUndo());
        m.on('drag', (e) => {
          const ll = e.target.getLatLng();
          t.points[i] = [ll.lat, ll.lng];
          recalcSegments(t);
          renderTraces(ctx);
          ctx.refreshTimeline();
        });
        m.on('dragend', () => { ctx.save(); ctx.refreshInspector(); });
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
