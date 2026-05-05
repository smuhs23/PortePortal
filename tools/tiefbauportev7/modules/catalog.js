// Catalog sidebar with search, favorites, recents

import { state, saveState, markDirty } from './state.js';

export function initCatalog(ctx){
  const search = document.getElementById('catSearch');
  search.oninput = () => renderCatalog(ctx);

  document.getElementById('btnManageCatalog').onclick = () => {
    import('./catManager.js').then(m => m.openCatalogManager(ctx));
  };
}

const CHIPS = ['⭐ Favoriten', 'Alle', 'Ladeinfrastruktur', 'Verteilung', 'Netzanschluss', 'Ausstattung', 'Durchbruch', 'Erdung', 'Sonstiges'];
let activeChip = '⭐ Favoriten';

export function renderCatalog(ctx){
  const chipsEl = document.getElementById('catChips');
  chipsEl.innerHTML = CHIPS.map(c =>
    `<button class="chip ${c===activeChip?'on':''}" data-c="${c}">${c}</button>`
  ).join('');
  chipsEl.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => { activeChip = b.dataset.c; renderCatalog(ctx); };
  });

  const search = document.getElementById('catSearch')?.value?.toLowerCase().trim() || '';
  let items = state.catalog.slice();

  // Filter by chip
  if (activeChip === '⭐ Favoriten'){
    const favSet = new Set(state.favorites);
    items = items.filter(c => favSet.has(c.id));
    if (!items.length && !search){
      // Auto-fall back to "Alle" if no favorites
      items = state.catalog.slice();
    }
  } else if (activeChip !== 'Alle'){
    items = items.filter(c => c.cat === activeChip);
  }

  if (search){
    items = items.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.icon.toLowerCase().includes(search) ||
      (c.cat||'').toLowerCase().includes(search)
    );
  }

  const list = document.getElementById('catList');
  if (!items.length){
    list.innerHTML = `<div style="padding:20px;color:var(--ink-3);text-align:center;font-size:11px">Keine Treffer</div>`;
    return;
  }

  // Show recents at top if no chip filter active and no search
  let html = '';
  if (activeChip === 'Alle' && !search && state.recents.length){
    html += `<div style="font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px;margin:6px 8px 4px;font-weight:700">Zuletzt</div>`;
    state.recents.slice(0,5).forEach(id => {
      const c = state.catalog.find(x => x.id === id);
      if (c) html += renderCatItem(c);
    });
    html += `<div style="font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px;margin:10px 8px 4px;font-weight:700">Alle</div>`;
  }

  items.forEach(c => { html += renderCatItem(c); });
  list.innerHTML = html;

  list.querySelectorAll('.cat-item').forEach(el => {
    el.onclick = (e) => {
      if (e.target.classList.contains('star')) return;
      const id = el.dataset.id;
      state.selectedCat = (state.selectedCat === id) ? null : id;
      // Switch tool to "pin" mode (cursor only) — actual placement on map click
      ctx.toolMode = state.selectedCat ? 'pin' : 'select';
      renderCatalog(ctx);
      updateToolHint(ctx);
      // Update tool buttons
      document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
      if (!state.selectedCat) document.querySelector('.tool[data-tool="select"]').classList.add('active');
    };
    el.querySelector('.star').onclick = (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const idx = state.favorites.indexOf(id);
      if (idx >= 0) state.favorites.splice(idx,1);
      else state.favorites.push(id);
      saveState();
      renderCatalog(ctx);
    };
  });
}

function renderCatItem(c){
  const sel = state.selectedCat === c.id;
  const fav = state.favorites.includes(c.id);
  const shapeCls = c.shape === 'square' ? '' : c.shape === 'hex' ? 'hex' : '';
  return `<div class="cat-item ${sel?'sel':''}" data-id="${c.id}">
    <div class="ico" style="background:${c.color}">${c.icon}</div>
    <div class="meta">
      <div class="name">${escapeHtml(c.name)}</div>
      <div class="sub">${c.pos ? 'LV '+c.pos+' · ' : ''}${fmtEur(c.price)}</div>
    </div>
    <div class="star ${fav?'on':''}">★</div>
  </div>`;
}

export function bumpRecent(catId){
  const i = state.recents.indexOf(catId);
  if (i >= 0) state.recents.splice(i, 1);
  state.recents.unshift(catId);
  if (state.recents.length > 10) state.recents.length = 10;
  saveState();
}

function updateToolHint(ctx){
  const el = document.getElementById('toolHint');
  if (!el) return;
  if (state.selectedCat){
    const c = state.catalog.find(x => x.id === state.selectedCat);
    el.textContent = `🎯 ${c?.name || ''} – auf Karte tippen zum Setzen (Esc bricht ab)`;
  } else if (ctx.toolMode === 'trace'){
    el.textContent = '✏ Klicke Punkte für Trasse · Doppelklick = fertig';
  } else {
    el.textContent = 'Asset im Katalog wählen, dann auf Karte klicken';
  }
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtEur(n){
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n||0);
}
