// v6/modules/objects.js
// Asset-Info-Dialog (read-only) und Edit-Dialog

import { openModal, closeModal, fmtEur, escapeHtml, renderPhotos } from './ui.js';
import { showSingleArrow, hideSingleArrow } from './links.js';

export function openObjDialogInfo(id, ctx) {
  const o = ctx.state.objects.find(x => x.id === id);
  if (!o) return;
  const cat = ctx.state.catalog.find(c => c.id === o.catId);
  if (!cat) return;

  // Pfeil zur Trasse wenn verknüpft
  if (o.linkedTraceId) showSingleArrow(ctx, o.id);

  const sheet = document.querySelector('#modalObjInfo .sheet');
  sheet.innerHTML = `
    <header>
      <h2>${escapeHtml(o.customName || cat.name)}</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      ${o.customName ? `<div class="info-field"><span class="k">Typ</span><span class="v">${escapeHtml(cat.name)}</span></div>` : ''}
      <div class="info-field"><span class="k">LV-Position</span><span class="v">${escapeHtml(cat.pos || '—')}</span></div>
      <div class="info-field"><span class="k">Anzahl</span><span class="v">${o.qty} ${escapeHtml(cat.unit || 'Stk')}</span></div>
      <div class="info-field"><span class="k">Einzelpreis</span><span class="v">${fmtEur(o.price)}</span></div>
      <div class="info-field"><span class="k">Summe</span><span class="v">${fmtEur((o.qty||0)*(o.price||0))}</span></div>
      ${cat.hasAmp ? `<div class="info-field"><span class="k">Stromstärke</span><span class="v">${o.amps ? o.amps+' A' : '—'}</span></div>` : ''}
      ${cat.hasKw ? `<div class="info-field"><span class="k">Leistung</span><span class="v">${o.kw ? o.kw+' kW' : '—'}</span></div>` : ''}
      <div class="info-field"><span class="k">Verknüpfung</span><span class="v">${renderLinkInfo(o, ctx.state)}</span></div>
      <div class="info-field"><span class="k">Koordinaten</span><span class="v" style="font-family:monospace;font-size:11px">${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}</span></div>
      ${o.note ? `<div style="margin-top:10px;padding:10px;background:var(--bg);border-radius:6px;font-size:12px">${escapeHtml(o.note)}</div>` : ''}
      ${o.photos && o.photos.length ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">${o.photos.map(p => `<img src="${p}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:2px solid var(--navy);cursor:pointer" data-photo="${p}">`).join('')}</div>` : ''}
    </div>
    <div class="foot">
      <button class="secondary" data-act="close">Schließen</button>
      ${ctx.state.uiMode === 'edit' ? `<button class="primary" data-act="edit">✎ Bearbeiten</button>` : ''}
    </div>
  `;

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') { hideSingleArrow(); closeModal('modalObjInfo'); }
    if (act === 'edit') { hideSingleArrow(); closeModal('modalObjInfo'); openObjDialogEdit(id, ctx); }
    if (e.target.dataset.photo) window.open(e.target.dataset.photo, '_blank');
  };

  openModal('modalObjInfo');
}

export function openObjDialogEdit(id, ctx) {
  if (ctx.state.uiMode !== 'edit') return;
  const o = ctx.state.objects.find(x => x.id === id);
  if (!o) return;

  // Pfeil zur Trasse wenn verknüpft
  if (o.linkedTraceId) showSingleArrow(ctx, o.id);

  const sheet = document.querySelector('#modalObj .sheet');
  sheet.innerHTML = `
    <header>
      <h2 id="objTitle">Objekt bearbeiten</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">

      <label>Eigener Name (erscheint als Label unter Pin)</label>
      <input id="objCustomName" placeholder="z.B. Besucherparkplatz Nord">

      <label>Typ ändern</label>
      <select id="objCatSelect"></select>

      <div class="row">
        <div><label>Anzahl</label><input id="objQty" type="number" min="1"></div>
        <div><label>Einzelpreis (€)</label><input id="objPrice" type="number" step="0.01"></div>
      </div>

      <div id="objAmpRow" style="display:none">
        <label>Stromstärke (A)</label>
        <select id="objAmps">
          <option value="">— wählen —</option>
          <option>63</option><option>100</option><option>160</option>
          <option>250</option><option>400</option><option>630</option><option>800</option>
        </select>
      </div>
      <div id="objKwRow" style="display:none">
        <label>Leistung (kW)</label>
        <input id="objKw" type="number" step="0.1" placeholder="z.B. 22">
      </div>

      <label>Verknüpft mit Trasse</label>
      <select id="objLinkedTrace">
        <option value="">— keine —</option>
      </select>
      <div id="objLinkedSegBox" style="display:none">
        <label>Segment auf Trasse</label>
        <select id="objLinkedSeg">
          <option value="">Automatisch (nächster Punkt)</option>
        </select>
      </div>

      <label>Notiz</label>
      <textarea id="objNote" rows="2" placeholder="Bestand, Auffälligkeiten..."></textarea>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px;border-top:1px solid #ddd;padding-top:10px">Darstellung (Override)</h3>
      <label>Darstellungsart</label>
      <select id="objIconType">
        <option value="">— aus Katalog —</option>
        <option value="hybrid">Emoji + Kürzel</option>
        <option value="emoji">Nur Emoji</option>
        <option value="text">Nur Kürzel</option>
      </select>
      <div class="row">
        <div><label>Farbe</label><input id="objColor" type="color"></div>
        <div><label>Form</label><select id="objShape"><option value="">— aus Katalog —</option><option value="shape-circle">Kreis</option><option value="shape-square">Quadrat</option><option value="shape-hex">Abgerundet</option></select></div>
      </div>
      <label>Icon überschreiben (Emoji oder Kürzel, leer = aus Katalog)</label>
      <input id="objIconOverride" maxlength="5" placeholder="">

      <label>Fotos</label>
      <div class="photos" id="objPhotos"></div>

      <div id="objSum" style="margin-top:12px;padding:12px;background:var(--navy);color:#fff;border-radius:6px;font-weight:bold;text-align:right"></div>
    </div>
    <div class="foot">
      <button class="danger" data-act="del">🗑</button>
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Speichern</button>
    </div>
  `;

  const cat = ctx.state.catalog.find(c => c.id === o.catId);
  document.getElementById('objCustomName').value = o.customName || '';

  // Katalog-Auswahl
  const catSel = document.getElementById('objCatSelect');
  catSel.innerHTML = ctx.state.catalog.map(c =>
    `<option value="${c.id}" ${c.id === o.catId ? 'selected' : ''}>${c.defaultEmoji || c.icon} · ${escapeHtml(c.name)}</option>`
  ).join('');
  catSel.onchange = function() {
    o.catId = this.value;
    const nc = ctx.state.catalog.find(c => c.id === o.catId);
    document.getElementById('objPrice').value = nc.price;
    document.getElementById('objAmpRow').style.display = nc.hasAmp ? 'block' : 'none';
    document.getElementById('objKwRow').style.display = nc.hasKw ? 'block' : 'none';
    document.getElementById('objTitle').textContent = nc.name;
    updateObjSum();
  };

  document.getElementById('objQty').value = o.qty;
  document.getElementById('objPrice').value = o.price;
  document.getElementById('objAmpRow').style.display = cat?.hasAmp ? 'block' : 'none';
  document.getElementById('objKwRow').style.display = cat?.hasKw ? 'block' : 'none';
  document.getElementById('objAmps').value = o.amps || '';
  document.getElementById('objKw').value = o.kw || '';
  document.getElementById('objNote').value = o.note || '';

  // Trassen-Select
  const traceSel = document.getElementById('objLinkedTrace');
  traceSel.innerHTML = '<option value="">— keine —</option>' + ctx.state.traces.map((t, i) => {
    const len = t.segments.reduce((s, seg) => s + seg.len, 0);
    return `<option value="${t.id}" ${t.id === o.linkedTraceId ? 'selected' : ''}>Trasse #${i+1} · ${len.toFixed(1)} m · ${t.segments.length} Segmente</option>`;
  }).join('');
  traceSel.onchange = () => {
    // Live: sofort in Objekt schreiben und Pfeil aktualisieren
    o.linkedTraceId = traceSel.value || null;
    if (!o.linkedTraceId) o.linkedSegmentIdx = null;
    updateSegSelect(o, ctx);
    if (o.linkedTraceId) showSingleArrow(ctx, o.id);
    else hideSingleArrow();
  };
  updateSegSelect(o, ctx);

  document.getElementById('objIconType').value = o.iconTypeOverride || '';
  document.getElementById('objColor').value = o.colorOverride || cat?.color || '#1B2D5E';
  document.getElementById('objShape').value = o.shapeOverride || '';
  document.getElementById('objIconOverride').value = o.iconOverride || '';

  if (!o.photos) o.photos = [];
  renderPhotos('objPhotos', o.photos, updateObjSum);

  function updateObjSum() {
    const q = parseFloat(document.getElementById('objQty').value) || 0;
    const p = parseFloat(document.getElementById('objPrice').value) || 0;
    document.getElementById('objSum').textContent = 'Summe: ' + fmtEur(q * p);
  }
  updateObjSum();
  ['objQty','objPrice','objAmps','objKw'].forEach(k => {
    document.getElementById(k).oninput = updateObjSum;
  });

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') { hideSingleArrow(); closeModal('modalObj'); }
    if (act === 'del') { hideSingleArrow(); deleteCurrentObj(id, ctx); }
    if (act === 'save') { hideSingleArrow(); saveCurrentObj(id, ctx); }
  };

  openModal('modalObj');
}

function updateSegSelect(o, ctx) {
  const traceId = document.getElementById('objLinkedTrace').value;
  const segBox = document.getElementById('objLinkedSegBox');
  const segSel = document.getElementById('objLinkedSeg');
  if (!traceId) {
    segBox.style.display = 'none';
    return;
  }
  const t = ctx.state.traces.find(x => x.id === traceId);
  if (!t) {
    segBox.style.display = 'none';
    return;
  }
  segBox.style.display = 'block';
  const ofLabels = { OF0:'unbefestigt', OF1:'Pflaster', OF2:'Beton', OF3:'Asphalt' };
  segSel.innerHTML = '<option value="">Automatisch (nächster Punkt)</option>' + t.segments.map((seg, i) => {
    const lbl = ofLabels[seg.of] || seg.of;
    const sel = (o.linkedSegmentIdx === i && o.linkedTraceId === traceId) ? 'selected' : '';
    return `<option value="${i}" ${sel}>Segment #${i+1} · ${seg.of} ${lbl} · ${seg.len.toFixed(1)} m</option>`;
  }).join('');

  // Live-Update: wenn Segment geändert, Pfeil neu ziehen
  segSel.onchange = () => {
    const v = segSel.value;
    o.linkedSegmentIdx = v === '' ? null : parseInt(v);
    if (o.linkedTraceId) showSingleArrow(ctx, o.id);
  };
}

function saveCurrentObj(id, ctx) {
  const o = ctx.state.objects.find(x => x.id === id);
  if (!o) return;
  if (ctx.pushUndo) ctx.pushUndo();
  o.customName = document.getElementById('objCustomName').value.trim();
  o.catId = document.getElementById('objCatSelect').value;
  o.qty = parseFloat(document.getElementById('objQty').value) || 0;
  o.price = parseFloat(document.getElementById('objPrice').value) || 0;
  o.amps = document.getElementById('objAmps').value;
  o.kw = document.getElementById('objKw').value;
  o.note = document.getElementById('objNote').value;

  const linkedT = document.getElementById('objLinkedTrace').value;
  o.linkedTraceId = linkedT || null;
  const linkedSegStr = document.getElementById('objLinkedSeg').value;
  o.linkedSegmentIdx = (linkedT && linkedSegStr !== '') ? parseInt(linkedSegStr) : null;

  const cat = ctx.state.catalog.find(c => c.id === o.catId);
  const colorVal = document.getElementById('objColor').value;
  o.colorOverride = (colorVal && colorVal.toLowerCase() !== String(cat?.color || '').toLowerCase()) ? colorVal : '';
  o.shapeOverride = document.getElementById('objShape').value;
  o.iconOverride = document.getElementById('objIconOverride').value.trim();
  o.iconTypeOverride = document.getElementById('objIconType').value;

  closeModal('modalObj');
  ctx.render();
}

function deleteCurrentObj(id, ctx) {
  if (!confirm('Objekt wirklich löschen?')) return;
  if (ctx.pushUndo) ctx.pushUndo();
  const idx = ctx.state.objects.findIndex(x => x.id === id);
  if (idx >= 0) ctx.state.objects.splice(idx, 1);
  closeModal('modalObj');
  ctx.render();
}

function renderLinkInfo(o, state) {
  if (!o.linkedTraceId) return '—';
  const t = state.traces.find(x => x.id === o.linkedTraceId);
  if (!t) return '— (Trasse gelöscht)';
  const idx = state.traces.indexOf(t);
  if (o.linkedSegmentIdx != null) {
    return `Trasse #${idx+1} · Segment ${o.linkedSegmentIdx+1}`;
  }
  return `Trasse #${idx+1} · Auto`;
}
