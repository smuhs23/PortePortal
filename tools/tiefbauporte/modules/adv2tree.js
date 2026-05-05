// Project tree view
import { state } from './state.js';

export function renderTree(ctx){
  const el = document.getElementById('treeList');
  let html = '';

  // Group objects by category
  const byCat = {};
  state.objects.forEach(o => {
    const c = state.catalog.find(x => x.id === o.catId);
    const k = c?.cat || 'Sonstiges';
    (byCat[k] = byCat[k] || []).push(o);
  });

  if (Object.keys(byCat).length){
    html += `<div class="tree-section">Assets</div>`;
    Object.entries(byCat).forEach(([cat, items]) => {
      html += `<div class="tree-section" style="font-size:9px;margin-top:6px">${escapeHtml(cat)} (${items.length})</div>`;
      items.forEach(o => {
        const c = state.catalog.find(x => x.id === o.catId);
        const sel = ctx.selection?.kind==='object' && ctx.selection.id===o.id;
        html += `<div class="tree-row ${sel?'sel':''}" data-kind="object" data-id="${o.id}">
          <div class="ico">${c?.icon || '?'}</div>
          <div class="lbl">${escapeHtml(o.customName || c?.name || 'Unbenannt')}</div>
          <div class="sm">×${o.qty}</div>
        </div>`;
      });
    });
  }

  if (state.traces.length){
    html += `<div class="tree-section" style="margin-top:10px">Trassen</div>`;
    state.traces.forEach((t, i) => {
      const sel = ctx.selection?.kind==='trace' && ctx.selection.id===t.id;
      const len = t.segments.reduce((s,sg)=>s+sg.len,0);
      html += `<div class="tree-row ${sel?'sel':''}" data-kind="trace" data-id="${t.id}">
        <div class="ico">🚧</div>
        <div class="lbl">${escapeHtml(t.name || 'Trasse #'+(i+1))}</div>
        <div class="sm">${len.toFixed(0)}m</div>
      </div>`;
    });
  }

  if (!Object.keys(byCat).length && !state.traces.length){
    html = `<div style="padding:30px 12px;text-align:center;color:var(--ink-3);font-size:11px;line-height:1.5">
      <div style="font-size:30px;margin-bottom:6px">📍</div>
      Noch keine Objekte<br>
      <small>Wähle ein Asset im Katalog und klicke auf die Karte</small>
    </div>`;
  }

  el.innerHTML = html;
  el.querySelectorAll('.tree-row').forEach(r => {
    r.onclick = () => {
      const id = r.dataset.id;
      const kind = r.dataset.kind;
      if (kind === 'object'){
        const o = state.objects.find(x => x.id === id);
        if (o){
          ctx.selectObject(id);
          ctx.map.flyTo([o.lat, o.lng], Math.max(ctx.map.getZoom(), 17));
        }
      } else {
        const t = state.traces.find(x => x.id === id);
        if (t && t.points.length){
          ctx.selectTrace(id);
          // Fit bounds to trace
          const bounds = L.latLngBounds(t.points);
          ctx.map.flyToBounds(bounds, { padding:[80,80], maxZoom:19, duration:0.6 });
        }
      }
    };
  });
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
