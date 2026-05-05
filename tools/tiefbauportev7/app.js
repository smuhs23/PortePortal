// KalkuPorte v7 — Main entry point
// Imports all modules and wires them together

import { state, loadState, saveState, pushUndo, undo, redo, dirty } from './modules/state.js';
import { initMap, getMap, refocusMap, setBasemap } from './modules/map.js';
import { renderCatalog, initCatalog } from './modules/catalog.js';
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
      if (def) sum += seg.len * (def.prOF + def.prWH + (seg.hand ? state.PRICE_HAND : state.PRICE_GRABEN));
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

  fullRender();

  // First-time: show welcome
  if (!state.meta.we && state.objects.length === 0 && state.traces.length === 0){
    import('./modules/welcome.js').then(m => m.openWelcome(ctx));
  }
}

init();
