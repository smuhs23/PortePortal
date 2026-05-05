// v6/modules/cableTypes.js
// Kabeltyp-Katalog: Liste aller verfügbaren Kabeltypen (Standard + Custom)
// Analog zum Asset-Katalog.

import { openModal, closeModal, fmt, fmtEur, escapeHtml, uid, showInfo } from './ui.js';
import { DEFAULT_CABLE_TYPES } from './constants.js';

let currentEditCableId = null;

// Öffnet die Kabeltyp-Verwaltung
export function openCableTypesCatalog(ctx) {
  const sheet = document.querySelector('#modalCableTypes .sheet');

  const builtins = ctx.state.cableTypes.filter(c => c.builtin);
  const customs = ctx.state.cableTypes.filter(c => !c.builtin);

  sheet.innerHTML = `
    <header>
      <h2>Kabeltyp-Katalog</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <div style="background:var(--bg);padding:10px;border-radius:6px;font-size:12px;margin-bottom:10px">
        <b>Standard (BImA):</b> ${builtins.length} Typen eingebaut<br>
        <b>Eigene:</b> ${customs.length} angelegt
      </div>

      <div class="cat-section"><h3>Strom- / Datenkabel (eingebaut)</h3>
        ${builtins.map(c => renderCableRow(c, ctx)).join('')}
      </div>

      <div class="cat-section"><h3>Eigene Kabeltypen</h3>
        ${customs.length ? customs.map(c => renderCableRow(c, ctx)).join('') :
          '<div style="padding:12px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine eigenen Typen angelegt</div>'}
      </div>

      ${ctx.state.uiMode === 'edit' ? `<button id="cblAddBtn" style="width:100%;margin-top:14px;padding:13px;background:var(--green);color:var(--navy);border:none;border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer">+ Eigenen Kabeltyp anlegen</button>` : ''}

      <div style="background:#fff3cd;border-left:3px solid var(--amber);padding:8px 10px;font-size:11px;margin-top:14px;border-radius:4px;color:#654b00">
        <b>Hinweis:</b> Eingebaute BImA-Kabeltypen können nicht gelöscht werden, aber Preise sind individuell anpassbar. "Zurück auf Default"-Button pro Typ.
      </div>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close" style="flex:1">Schließen</button>
    </div>
  `;

  sheet.onclick = (e) => {
    if (e.target.dataset.act === 'close') { closeModal('modalCableTypes'); return; }
    if (e.target.id === 'cblAddBtn') { showAddCable(ctx); return; }
    const editId = e.target.dataset.editCable;
    if (editId) editCableType(editId, ctx);
  };

  openModal('modalCableTypes');
}

function renderCableRow(c, ctx) {
  const tagClass = c.builtin ? 'builtin' : 'custom';
  const tagText = c.builtin ? 'Standard' : 'Eigen';
  return `
    <div class="cat-item" data-id="${c.id}">
      <div class="icon shape-circle" style="background:${c.color || '#666'}">${c.id.toUpperCase().slice(0, 3)}</div>
      <div class="info">
        <div class="name">${escapeHtml(c.label)}</div>
        <div class="price">${fmtEur(c.price)} / m${c.lvPos ? ' · LV ' + escapeHtml(c.lvPos) : ''}</div>
      </div>
      <span class="tag-badge ${tagClass}" style="margin-right:8px">${tagText}</span>
      ${ctx.state.uiMode === 'edit' ? `<button class="del" data-edit-cable="${c.id}">✎</button>` : ''}
    </div>
  `;
}

function showAddCable(ctx) {
  currentEditCableId = null;
  renderAddCableSheet(ctx, null);
  openModal('modalAddCable');
}

function editCableType(id, ctx) {
  const c = ctx.state.cableTypes.find(x => x.id === id);
  if (!c) return;
  currentEditCableId = id;
  renderAddCableSheet(ctx, c);
  openModal('modalAddCable');
}

function renderAddCableSheet(ctx, c) {
  const isBuiltin = !!(c && c.builtin);
  const defaultForBuiltin = isBuiltin ? DEFAULT_CABLE_TYPES.find(d => d.id === c.id) : null;

  const sheet = document.querySelector('#modalAddCable .sheet');
  sheet.innerHTML = `
    <header>
      <h2>${c ? (isBuiltin ? 'Standard-Kabeltyp' : 'Kabeltyp bearbeiten') : 'Neuer Kabeltyp'}</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      ${isBuiltin ? '<div style="background:#eef;border-left:3px solid var(--navy);padding:8px 10px;font-size:11px;margin-bottom:10px;border-radius:4px;color:var(--navy)"><b>Eingebauter BImA-Typ.</b> Du kannst Preis und Bezeichnung überschreiben.</div>' : ''}

      <label>Bezeichnung</label>
      <input id="cblLabel" value="${escapeHtml(c?.label || '')}" placeholder="z.B. Zero Fault Feeder 4x25mm²">

      <div class="row">
        <div><label>Preis (€/m)</label><input id="cblPrice" type="number" step="0.01" value="${c?.price ?? ''}"></div>
        <div><label>Farbe (Icon)</label><input id="cblColor" type="color" value="${c?.color || '#666666'}"></div>
      </div>

      <label>LV-Position (optional)</label>
      <input id="cblLvPos" value="${escapeHtml(c?.lvPos || '')}" placeholder="z.B. 19a.">

      ${isBuiltin ? `
        <hr style="margin:16px 0">
        <button id="cblResetBtn" style="width:100%;padding:11px;background:#fff;color:var(--navy);border:2px solid var(--navy);border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer">↺ Zurück auf Default (${defaultForBuiltin ? fmtEur(defaultForBuiltin.price) : ''})</button>
      ` : ''}
    </div>
    <div class="foot">
      ${(c && !isBuiltin) ? `<button class="danger" data-act="del">🗑</button>` : ''}
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Speichern</button>
    </div>
  `;

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') closeModal('modalAddCable');
    if (act === 'save') saveCableType(ctx);
    if (act === 'del') deleteCableType(ctx);
    if (e.target.id === 'cblResetBtn') resetCableType(ctx, c.id);
  };
}

function saveCableType(ctx) {
  const label = document.getElementById('cblLabel').value.trim();
  if (!label) { alert('Bezeichnung erforderlich'); return; }
  const data = {
    label,
    price: parseFloat(document.getElementById('cblPrice').value) || 0,
    color: document.getElementById('cblColor').value,
    lvPos: document.getElementById('cblLvPos').value.trim()
  };

  if (ctx.pushUndo) ctx.pushUndo();
  if (currentEditCableId) {
    const existing = ctx.state.cableTypes.find(x => x.id === currentEditCableId);
    Object.assign(existing, data);
  } else {
    const newId = 'c_' + uid().slice(3, 11);
    ctx.state.cableTypes.push({ id: newId, ...data, builtin: false });
  }

  closeModal('modalAddCable');
  openCableTypesCatalog(ctx);
  ctx.render();
}

function deleteCableType(ctx) {
  if (!currentEditCableId) return;
  const c = ctx.state.cableTypes.find(x => x.id === currentEditCableId);
  if (!c || c.builtin) return;
  // Prüfen ob in Trassen verwendet
  const usedIn = ctx.state.traces.filter(t => (t.cables || []).some(cab => cab.typeId === c.id));
  if (usedIn.length > 0) {
    if (!confirm(`Dieser Kabeltyp ist in ${usedIn.length} Trasse(n) in Verwendung. Trotzdem löschen?\n\nDie Einträge in den Trassen bleiben als Snapshot erhalten (Label + Preis), sind aber dann nicht mehr aus dem Katalog wählbar.`)) return;
  } else {
    if (!confirm('Kabeltyp wirklich löschen?')) return;
  }
  if (ctx.pushUndo) ctx.pushUndo();
  ctx.state.cableTypes = ctx.state.cableTypes.filter(x => x.id !== currentEditCableId);
  closeModal('modalAddCable');
  openCableTypesCatalog(ctx);
  ctx.render();
}

function resetCableType(ctx, id) {
  const def = DEFAULT_CABLE_TYPES.find(d => d.id === id);
  if (!def) return;
  if (!confirm(`Zurücksetzen auf Default?\nPreis: ${fmtEur(def.price)}\nBezeichnung: ${def.label}`)) return;
  const existing = ctx.state.cableTypes.find(x => x.id === id);
  if (ctx.pushUndo) ctx.pushUndo();
  Object.assign(existing, { label: def.label, price: def.price, color: def.color, lvPos: def.lvPos });
  closeModal('modalAddCable');
  openCableTypesCatalog(ctx);
  ctx.render();
}

// ========== Auswahl-Dialog: Kabeltyp zu Trasse hinzufügen ==========
export function openPickCable(ctx, onPicked) {
  const sheet = document.querySelector('#modalPickCable .sheet');
  const builtins = ctx.state.cableTypes.filter(c => c.builtin);
  const customs = ctx.state.cableTypes.filter(c => !c.builtin);

  sheet.innerHTML = `
    <header>
      <h2>Leitung hinzufügen</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <p style="font-size:12px;color:#666;margin:4px 0 10px">Kabeltyp antippen, um ihn der Trasse hinzuzufügen.</p>

      <div class="cat-section"><h3>Standard</h3>
        ${builtins.map(c => renderCablePickRow(c)).join('')}
      </div>

      ${customs.length ? `<div class="cat-section"><h3>Eigene</h3>
        ${customs.map(c => renderCablePickRow(c)).join('')}
      </div>` : ''}

      <button id="pickCableManageBtn" style="width:100%;margin-top:14px;padding:11px;background:#fff;color:var(--navy);border:2px dashed var(--navy);border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer">⚙ Kabeltyp-Katalog verwalten</button>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close" style="flex:1">Abbruch</button>
    </div>
  `;

  sheet.onclick = (e) => {
    if (e.target.dataset.act === 'close') { closeModal('modalPickCable'); return; }
    if (e.target.id === 'pickCableManageBtn') {
      closeModal('modalPickCable');
      openCableTypesCatalog(ctx);
      return;
    }
    const item = e.target.closest('.cat-item');
    if (item && item.dataset.pickCable) {
      const c = ctx.state.cableTypes.find(x => x.id === item.dataset.pickCable);
      if (c) {
        onPicked(c);
        closeModal('modalPickCable');
      }
    }
  };

  openModal('modalPickCable');
}

function renderCablePickRow(c) {
  return `
    <div class="cat-item" data-pick-cable="${c.id}">
      <div class="icon shape-circle" style="background:${c.color || '#666'}">${c.id.toUpperCase().slice(0, 3)}</div>
      <div class="info">
        <div class="name">${escapeHtml(c.label)}</div>
        <div class="price">${fmtEur(c.price)} / m${c.lvPos ? ' · LV ' + escapeHtml(c.lvPos) : ''}</div>
      </div>
      <span style="color:#999;font-size:18px">+</span>
    </div>
  `;
}
