// v6/modules/traces.js
// v6.2: Bereich-basierte Kabelbelegung mit Multi-Select

import { openModal, closeModal, showInfo, uid, fmt, fmtEur, escapeHtml, renderPhotos } from './ui.js';
import {
  distMeters, totalLen, recalcSegments,
  cableEffectiveLength, cableUnitPrice, cableRangeLength,
  cablesInSegment, normalizeCables,
  adjustCablesAfterSegmentDelete,
  formatSegRange,
  aggregateCableMaterials
} from './calc.js';
import { OF_DEFS, TRACE_COLOR, PRICE_GRABEN, PRICE_HAND } from './constants.js';
import { openPickCable, openCableTypesCatalog } from './cableTypes.js';

let currentTraceId = null;
let currentSegIdx = null;

// v6.2: Multi-Select-Zustand für Segment-Auswahl im Trassen-Editor (lokal, nicht in State)
let segSelection = new Set(); // Set<number> aktuell ausgewählter Segment-Indizes

// v6.3: zentraler UI-Refresh für offenen Trassen-Modal (wird auch von render.js bei Drag aufgerufen)
export function refreshTraceUIIfOpen(traceId, ctx) {
  if (!traceId || traceId !== currentTraceId) return;
  const modal = document.getElementById('modalTrace');
  if (!modal || !modal.classList.contains('open')) return;
  const t = ctx.state.traces.find(x => x.id === traceId);
  if (!t) return;
  // Nur die Inhalte neu rendern, NICHT das ganze Sheet — sonst geht User-Input verloren
  renderTraceSegments(t, ctx);
  renderCablesFull(t, ctx);
  renderTracePoints(t, ctx);
  renderTrenchDiagram(t, ctx);
  renderCableBOM(t, ctx);
  updateTraceSum(t);
  // Trassen-Info-Box (Gesamtlänge) auch aktualisieren
  const info = document.getElementById('traceInfo');
  if (info) {
    info.innerHTML = `<b>Gesamtlänge:</b> ${fmt(totalLen(t))} m · ${t.points.length} Punkte · ${t.segments.length} Segmente`;
  }
}

// v6.3: Statistik pro Segment — Stück, Typen, Meter pro Typ und Σ Meter
// Pro Kabel im Segment werden seg.len * count Meter angerechnet (1 Segment, kein Reserve hier — Reserve wird global pro Range gerechnet)
export function segmentCableStats(t, segIdx) {
  const seg = t.segments?.[segIdx];
  const segLen = seg ? (Number(seg.len) || 0) : 0;
  const cabs = cablesInSegment(t, segIdx);
  const types = new Set(cabs.map(c => c.typeId));
  const stueck = cabs.reduce((s, c) => s + (Number(c.count) || 0), 0);
  // Meter pro Typ (in diesem Segment): Σ über alle Cables des Typs (segLen × count)
  const byType = new Map();
  cabs.forEach(c => {
    const cnt = Number(c.count) || 0;
    if (cnt <= 0) return;
    const m = segLen * cnt;
    const cur = byType.get(c.typeId) || { typeId: c.typeId, label: c.label, count: 0, meters: 0 };
    cur.count += cnt;
    cur.meters += m;
    byType.set(c.typeId, cur);
  });
  const meterSum = Array.from(byType.values()).reduce((s, x) => s + x.meters, 0);
  return { typen: types.size, stueck, cabsHere: cabs, byType: Array.from(byType.values()), meterSum, segLen };
}

export function initTraceDrawing(ctx) {
  ctx.currentTrace = null;

  ctx.map.on('click', (e) => {
    if (ctx.state.uiMode === 'view') return;
    // Eat-Click-Guard: Klicks kurz nach Suchergebnis-Auswahl verschlucken
    if (ctx._eatClickUntil && Date.now() < ctx._eatClickUntil) return;
    if (ctx.mode === 'pin') {
      if (!ctx.state.selectedCat) {
        import('./catalog.js').then(m => m.openCatalog(ctx));
        return;
      }
      const cat = ctx.state.catalog.find(c => c.id === ctx.state.selectedCat);
      if (!cat) return;
      const o = {
        id: uid(),
        catId: cat.id,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        qty: 1,
        price: cat.price,
        amps: '', kw: '', note: '', photos: [],
        customName: '',
        iconTypeOverride: '',
        colorOverride: '',
        shapeOverride: '',
        iconOverride: '',
        linkedTraceId: null,
        linkedSegmentIdx: null
      };
      if (ctx.pushUndo) ctx.pushUndo();
      ctx.state.objects.push(o);
      ctx.render();
    } else if (ctx.mode === 'trace') {
      if (!ctx.currentTrace) ctx.currentTrace = { points: [], line: null };
      ctx.currentTrace.points.push([e.latlng.lat, e.latlng.lng]);
      if (ctx.currentTrace.line) ctx.drawLayer.removeLayer(ctx.currentTrace.line);
      ctx.currentTrace.line = L.polyline(ctx.currentTrace.points, {
        color: TRACE_COLOR, weight: 8, dashArray: '10,6', opacity: .9
      }).addTo(ctx.drawLayer);
      L.circleMarker([e.latlng.lat, e.latlng.lng], {
        radius: 6, color: '#fff', fillColor: TRACE_COLOR, fillOpacity: 1, weight: 2
      }).addTo(ctx.drawLayer);
      let len = 0;
      for (let i = 1; i < ctx.currentTrace.points.length; i++) {
        len += distMeters(ctx.currentTrace.points[i-1], ctx.currentTrace.points[i]);
      }
      showInfo(`Trasse · ${ctx.currentTrace.points.length} Pkt · ${fmt(len)} m`);
      showFinishBtn(ctx, true);
    }
  });

  ctx.map.on('dblclick', () => {
    if (ctx.mode === 'trace' && ctx.currentTrace && ctx.currentTrace.points.length >= 2) {
      finishTrace(ctx);
    }
  });
  ctx.map.doubleClickZoom.disable();
}

let finishBtn = null;
function showFinishBtn(ctx, show) {
  if (show && !finishBtn) {
    finishBtn = document.createElement('button');
    finishBtn.className = 'fab';
    finishBtn.textContent = '✓ Trasse fertig';
    finishBtn.onclick = () => finishTrace(ctx);
    document.getElementById('map').appendChild(finishBtn);
  } else if (!show && finishBtn) {
    finishBtn.remove();
    finishBtn = null;
  }
}

function finishTrace(ctx) {
  if (!ctx.currentTrace || ctx.currentTrace.points.length < 2) {
    showInfo('Mindestens 2 Punkte', 'err');
    return;
  }
  const segments = [];
  for (let i = 0; i < ctx.currentTrace.points.length - 1; i++) {
    segments.push({
      of: 'OF0', hand: false,
      len: distMeters(ctx.currentTrace.points[i], ctx.currentTrace.points[i+1])
    });
  }
  const t = {
    id: uid(),
    points: ctx.currentTrace.points,
    segments,
    cables: [],  // v6: leer starten, User fügt per + Button hinzu (Phase 2)
    note: '', photos: []
  };
  if (ctx.pushUndo) ctx.pushUndo();
  ctx.state.traces.push(t);
  ctx.drawLayer.clearLayers();
  ctx.currentTrace = null;
  showFinishBtn(ctx, false);
  ctx.render();
  openTrace(t.id, ctx);
}

// ===== Trace Detail Dialog (v6.2) =====
export function openTrace(id, ctx) {
  const t = ctx.state.traces.find(x => x.id === id);
  if (!t) return;
  currentTraceId = id;
  recalcSegments(t);
  normalizeCables(t);
  segSelection = new Set();  // bei jedem Öffnen leer

  // Verknüpfte Assets suchen
  const linkedObjs = ctx.state.objects.filter(o => o.linkedTraceId === t.id);

  const sheet = document.querySelector('#modalTrace .sheet');
  const len = totalLen(t);

  sheet.innerHTML = `
    <header>
      <h2>Trasse · Kabelgraben</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <div id="traceInfo" style="background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;font-size:13px">
        <b>Gesamtlänge:</b> ${fmt(len)} m · ${t.points.length} Punkte · ${t.segments.length} Segmente
      </div>

      ${linkedObjs.length ? `
        <div style="background:#eef;border-left:3px solid var(--navy);padding:10px;border-radius:4px;font-size:12px;margin-bottom:10px">
          <b style="color:var(--navy)">Verknüpfte Assets (${linkedObjs.length}):</b><br>
          ${linkedObjs.map(o => {
            const cat = ctx.state.catalog.find(c => c.id === o.catId);
            const icon = cat ? (cat.iconType === 'text' ? cat.icon : (cat.defaultEmoji || cat.icon)) : '?';
            const name = o.customName || (cat ? cat.name : 'Unbekannt');
            const segInfo = (o.linkedSegmentIdx != null) ? ` · Seg ${o.linkedSegmentIdx + 1}` : '';
            return `<span style="display:inline-block;background:#fff;padding:3px 8px;border-radius:10px;margin:2px 2px 0 0;font-size:11px">${icon} ${escapeHtml(name)}${segInfo}</span>`;
          }).join('')}
        </div>
      ` : ''}

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Segmente</h3>
      <small style="color:#666">Klick → Oberfläche/Hand · Strg/Shift+Klick → Mehrfach­auswahl für Kabel-Belegung.</small>
      <div id="trSegSelToolbar" class="seg-sel-toolbar" style="display:none"></div>
      <div id="trSegList" class="seg-list"></div>
      <div id="trSegFooter" class="seg-list-footer"></div>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Leitungs-Belegung</h3>
      <small style="color:#666">Pro Leitung: Typ, Anzahl, Reserve, Preis-Override und <b>Bereich</b> der Segmente.</small>
      <div id="trCables" style="margin-top:4px"></div>
      <button id="trAddCableBtn" class="cbl-add-btn">+ Leitung hinzufügen</button>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Graben-Belegung (Längsschnitt)</h3>
      <small style="color:#666">Wie der Graben pro Segment belegt ist. Klick auf Segment → Detail.</small>
      <div id="trTrenchDiagram" style="margin-top:6px"></div>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Σ Bestellmenge dieser Trasse</h3>
      <small style="color:#666">Pro Kabeltyp aufaddiert — direkt für Bestellung verwendbar.</small>
      <div id="trCableBOM" style="margin-top:6px"></div>

      <label>Notiz</label>
      <textarea id="trNote" rows="2">${escapeHtml(t.note || '')}</textarea>

      <label>Fotos</label>
      <div class="photos" id="trPhotos"></div>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Trassen-Punkte</h3>
      <div id="trPoints" class="pt-list"></div>

      <div id="trSum" style="margin-top:12px;padding:12px;background:var(--navy);color:#fff;border-radius:6px;font-weight:bold;text-align:right;font-size:13px"></div>
    </div>
    <div class="foot">
      <button class="danger" data-act="del">🗑</button>
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Speichern</button>
    </div>
  `;

  renderTraceSegments(t, ctx);
  renderSegSelToolbar(t, ctx);
  renderCablesFull(t, ctx);
  renderTracePoints(t, ctx);
  renderTrenchDiagram(t, ctx);
  renderCableBOM(t, ctx);
  if (!t.photos) t.photos = [];
  renderPhotos('trPhotos', t.photos, () => updateTraceSum(t));
  updateTraceSum(t);

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') closeModal('modalTrace');
    if (act === 'del') deleteCurrentTrace(ctx);
    if (act === 'save') saveCurrentTrace(ctx);
    if (e.target.id === 'trAddCableBtn') {
      openPickCable(ctx, (cableType) => {
        if (!t.cables) t.cables = [];
        // Wenn Multi-Select aktiv: Range = Auswahl, sonst alle Segmente
        const segIds = segSelection.size > 0
          ? Array.from(segSelection).sort((a, b) => a - b)
          : Array.from({ length: t.segments.length }, (_, i) => i);
        t.cables.push({
          id: 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
          typeId: cableType.id,
          label: cableType.label,
          priceSnapshot: cableType.price,
          priceOverride: null,
          count: 1,
          reserveMode: 'pct',
          reserveValue: 10,
          segIds
        });
        // Multi-Select bleibt erhalten — kann der User direkt nochmal nutzen oder verwerfen
        renderCablesFull(t, ctx);
        renderTraceSegments(t, ctx);
        renderTrenchDiagram(t, ctx);
        renderCableBOM(t, ctx);
        updateTraceSum(t);
      });
    }
  };

  openModal('modalTrace');
}

// Toolbar oben über der Segmentliste, zeigt aktuelle Auswahl
function renderSegSelToolbar(t, ctx) {
  const bar = document.getElementById('trSegSelToolbar');
  if (!bar) return;
  if (segSelection.size === 0) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  const ids = Array.from(segSelection).sort((a, b) => a - b);
  const sumLen = ids.reduce((s, i) => s + (t.segments[i]?.len || 0), 0);
  bar.style.display = 'flex';
  bar.innerHTML = `
    <div class="info">
      <b>Auswahl:</b> Seg ${formatSegRange(ids)} · ${fmt(sumLen)} m (${ids.length} Seg.)
    </div>
    <button id="selAddCable" class="primary">+ Kabel auf Auswahl</button>
    <button id="selClear" class="secondary">✕</button>
  `;
  bar.querySelector('#selClear').onclick = () => {
    segSelection.clear();
    renderTraceSegments(t, ctx);
    renderSegSelToolbar(t, ctx);
  };
  bar.querySelector('#selAddCable').onclick = () => {
    openPickCable(ctx, (cableType) => {
      if (!t.cables) t.cables = [];
      const segIds = Array.from(segSelection).sort((a, b) => a - b);
      t.cables.push({
        id: 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        typeId: cableType.id,
        label: cableType.label,
        priceSnapshot: cableType.price,
        priceOverride: null,
        count: 1,
        reserveMode: 'pct',
        reserveValue: 10,
        segIds
      });
      renderCablesFull(t, ctx);
      renderTraceSegments(t, ctx);
      renderTrenchDiagram(t, ctx);
      renderCableBOM(t, ctx);
      updateTraceSum(t);
    });
  };
}

function renderTraceSegments(t, ctx) {
  const c = document.getElementById('trSegList');
  c.innerHTML = '';
  t.segments.forEach((seg, i) => {
    const def = OF_DEFS[seg.of];
    const stats = segmentCableStats(t, i);
    const cabBadge = stats.cabsHere.length
      ? `<div class="seg-cab-badge own" title="${stats.typen} Typen · ${stats.stueck} Kabel-Stück gesamt">⚡ ${stats.typen}T · ${stats.stueck}x</div>`
      : `<div class="seg-cab-badge empty" title="Keine Kabel in diesem Segment">∅</div>`;

    // v6.3: Detailzeile mit Meter pro Kabeltyp + Σ-Wert
    let detailRow = '';
    if (stats.byType.length) {
      const parts = stats.byType.map(b => {
        const ct = ctx.state.cableTypes.find(x => x.id === b.typeId);
        const color = ct?.color || '#666';
        return `<span class="cab-mtr"><span class="dot" style="background:${color}"></span>${escapeHtml(b.label)} · ${b.count}× · <b>${fmt(b.meters)} m</b></span>`;
      }).join('');
      detailRow = `<div class="seg-cab-meters">${parts}<span class="cab-sum">Σ <b>${fmt(stats.meterSum)} m</b></span></div>`;
    }

    const isSel = segSelection.has(i);
    const d = document.createElement('div');
    d.className = 'seg seg-2row' + (isSel ? ' selected' : '');
    d.innerHTML = `
      <div class="seg-head">
        <div class="n">#${i+1}</div>
        <div class="of" style="background:${def?.color || TRACE_COLOR}">${seg.of}</div>
        <div class="len">${escapeHtml(def?.label || '')} · ${fmt(seg.len)} m</div>
        ${seg.hand ? '<div class="hand">HAND</div>' : ''}
        ${cabBadge}
        <button class="seg-aushub" data-aushub="${i}" title="Dieses Segment in AushubPorte öffnen">📤</button>
        <button class="seg-del" data-seg="${i}" title="Segment löschen">🗑</button>
        <div style="color:#999;font-size:16px">›</div>
      </div>
      ${detailRow}
    `;
    d.onclick = (e) => {
      if (e.target.classList.contains('seg-del')) {
        e.stopPropagation();
        deleteSegment(t, i, ctx);
        return;
      }
      if (e.target.classList.contains('seg-aushub')) {
        e.stopPropagation();
        exportSegmentToAushub(t, i, ctx);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        e.preventDefault();
        if (segSelection.has(i)) segSelection.delete(i);
        else segSelection.add(i);
        renderTraceSegments(t, ctx);
        renderSegSelToolbar(t, ctx);
        return;
      }
      openSeg(t.id, i, ctx);
    };
    c.appendChild(d);
  });
  renderSegFooter(t, ctx);
}

// v6.3: Σ-Footer unter Segmentliste — addiert über alle Segmente nach Kabeltyp auf
function renderSegFooter(t, ctx) {
  const f = document.getElementById('trSegFooter');
  if (!f) return;
  const totalsByType = new Map();
  let grand = 0;
  t.segments.forEach((seg, i) => {
    const stats = segmentCableStats(t, i);
    stats.byType.forEach(b => {
      const cur = totalsByType.get(b.typeId) || { typeId: b.typeId, label: b.label, meters: 0 };
      cur.meters += b.meters;
      totalsByType.set(b.typeId, cur);
      grand += b.meters;
    });
  });
  if (totalsByType.size === 0) {
    f.innerHTML = '';
    return;
  }
  const items = Array.from(totalsByType.values())
    .sort((a, b) => b.meters - a.meters)
    .map(x => {
      const ct = ctx.state.cableTypes.find(c => c.id === x.typeId);
      const color = ct?.color || '#666';
      return `<span class="ftr-item"><span class="dot" style="background:${color}"></span>${escapeHtml(x.label)} <b>${fmt(x.meters)} m</b></span>`;
    }).join('');
  f.innerHTML = `
    <div class="seg-footer-row">
      <div class="ftr-label">Σ Kabel-Meter (ohne Reserve)</div>
      <div class="ftr-items">${items}</div>
      <div class="ftr-grand">Σ <b>${fmt(grand)} m</b></div>
    </div>
  `;
}

function renderCablesFull(t, ctx) {
  const c = document.getElementById('trCables');
  if (!t.cables) t.cables = [];
  if (!t.cables.length) {
    c.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine Leitungen im Graben.</div>';
    return;
  }
  const segCount = t.segments.length;
  let html = '<div class="cbl-list">';
  t.cables.forEach((cab, i) => {
    const cableType = ctx.state.cableTypes.find(ct => ct.id === cab.typeId);
    const color = cableType?.color || '#666';
    const isCustom = cableType && !cableType.builtin;
    const iconLabel = cab.typeId.toUpperCase().slice(0, 3);
    const effPrice = cableUnitPrice(cab);
    const showOverride = cab.priceOverride != null;
    const rangeLen = cableRangeLength(cab, t);
    const effLen = cableEffectiveLength(cab, rangeLen);
    const totalMeters = effLen * (Number(cab.count) || 0);
    const rangeStr = formatSegRange(cab.segIds);
    const isFullRange = (cab.segIds || []).length === segCount;
    html += `
      <div class="cbl-row-v6 ${isCustom ? 'custom' : ''}">
        <div class="icn" style="background:${color}">${escapeHtml(iconLabel)}</div>
        <div>
          <div class="name">${escapeHtml(cab.label)}${isCustom ? ' <span class="tag-badge custom">Eigen</span>' : ''}</div>
          <small>${fmt(effPrice)} €/m${showOverride ? ' <b style="color:var(--orange)">· Override</b>' : ''}${cableType?.lvPos ? ' · LV ' + escapeHtml(cableType.lvPos) : ''}</small>
          <div class="cbl-range">
            <button class="cbl-range-bubble ${isFullRange ? 'full' : ''}" data-edit-range="${i}" title="Bereich bearbeiten">
              📍 Seg ${rangeStr} · ${fmt(rangeLen)} m
            </button>
            <span class="cbl-meters" title="Gesamt-Bestellmenge: effektive Länge je Stück × Anzahl">
              📏 ${fmt(effLen)} m/Stk × ${cab.count} = <b>${fmt(totalMeters)} m</b>
            </span>
          </div>
          <div class="inputs">
            <input type="number" min="0" step="1" data-cab-idx="${i}" data-field="count" value="${cab.count}" title="Anzahl">
            <div class="reserve">
              <select data-cab-idx="${i}" data-field="reserveMode">
                <option value="pct" ${cab.reserveMode === 'pct' ? 'selected' : ''}>%</option>
                <option value="m" ${cab.reserveMode === 'm' ? 'selected' : ''}>m</option>
              </select>
              <input type="number" min="0" step="1" data-cab-idx="${i}" data-field="reserveValue" value="${cab.reserveValue}" title="Reserve">
            </div>
          </div>
          <details style="margin-top:6px">
            <summary style="font-size:10px;color:#888;cursor:pointer">Preis-Override</summary>
            <input type="number" min="0" step="0.01" data-cab-idx="${i}" data-field="priceOverride" value="${cab.priceOverride ?? ''}" placeholder="leer = ${fmt(cab.priceSnapshot)} (aus Katalog)" style="margin-top:4px">
          </details>
        </div>
        <button class="del-x" data-del-cab="${i}" title="Leitung entfernen">×</button>
      </div>
    `;
  });
  html += '</div>';
  c.innerHTML = html;

  // Input-Events
  c.querySelectorAll('input, select').forEach(el => {
    const idx = parseInt(el.dataset.cabIdx);
    const field = el.dataset.field;
    if (isNaN(idx) || !field) return;
    el.oninput = () => {
      const cab = t.cables[idx];
      if (!cab) return;
      if (field === 'reserveMode') {
        cab.reserveMode = el.value;
      } else if (field === 'priceOverride') {
        const v = el.value.trim();
        cab.priceOverride = v === '' ? null : parseFloat(v);
      } else {
        cab[field] = parseFloat(el.value) || 0;
      }
      // v6.4: Komplett refreshen — sonst zeigt die Cable-Zeile veraltete Meter,
      // die BOM ändert sich nicht, das Diagramm bleibt stehen.
      // Trick: wir wollen nicht mitten im Tippen den Fokus aus dem Input verlieren,
      // also merken wir uns Cursor-Position + Input-ID, rendern neu, fokussieren wieder.
      const activeId = el.dataset.cabIdx + '|' + el.dataset.field;
      const cursorPos = el.selectionStart;
      renderCablesFull(t, ctx);
      renderTrenchDiagram(t, ctx);
      renderCableBOM(t, ctx);
      renderTraceSegments(t, ctx);
      updateTraceSum(t);
      // Re-focus
      const newEl = document.querySelector(`[data-cab-idx="${el.dataset.cabIdx}"][data-field="${el.dataset.field}"]`);
      if (newEl) {
        newEl.focus();
        if (typeof cursorPos === 'number' && newEl.setSelectionRange) {
          try { newEl.setSelectionRange(cursorPos, cursorPos); } catch(e) {}
        }
      }
    };
    el.onchange = el.oninput;
  });

  // Range-Bubble Klick → Range-Editor
  c.querySelectorAll('[data-edit-range]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.editRange);
      if (isNaN(idx)) return;
      openRangeEditor(t, idx, ctx);
    };
  });

  c.querySelectorAll('[data-del-cab]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delCab);
      if (isNaN(idx)) return;
      if (!confirm(`Leitung "${t.cables[idx].label}" aus dieser Trasse entfernen?`)) return;
      t.cables.splice(idx, 1);
      renderCablesFull(t, ctx);
      renderTraceSegments(t, ctx);
      renderTrenchDiagram(t, ctx);
      renderCableBOM(t, ctx);
      updateTraceSum(t);
    };
  });
}

// v6.2: Bereich-Editor pro Cable — Segmente per Klick togglen
function openRangeEditor(t, cabIdx, ctx) {
  const cab = t.cables[cabIdx];
  if (!cab) return;
  const segCount = t.segments.length;
  const sel = new Set(cab.segIds || []);

  // Modal aufbauen — wir nutzen das vorhandene modalSeg-Sheet, da wir nur eines brauchen
  // und um nicht den Trassen-Dialog zu schließen
  const sheet = document.querySelector('#modalSeg .sheet');
  function renderBody() {
    const ids = Array.from(sel).sort((a, b) => a - b);
    const sumLen = ids.reduce((s, i) => s + (t.segments[i]?.len || 0), 0);
    sheet.innerHTML = `
      <header>
        <h2>Bereich · ${escapeHtml(cab.label)}</h2>
        <button class="close" data-act="close">✕</button>
      </header>
      <div class="body">
        <div style="background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;font-size:13px">
          <b>Aktuelle Auswahl:</b> ${ids.length ? 'Seg ' + formatSegRange(ids) + ' · ' + fmt(sumLen) + ' m' : 'leer'}
        </div>
        <div class="rng-actions">
          <button id="rngAll" class="secondary">Alle</button>
          <button id="rngNone" class="secondary">Keine</button>
          <button id="rngInvert" class="secondary">Invertieren</button>
        </div>
        <small style="color:#666;display:block;margin:8px 0">Segmente antippen, um sie ein-/auszuschalten:</small>
        <div class="rng-grid"></div>
      </div>
      <div class="foot">
        <button class="secondary" data-act="cancel">Abbruch</button>
        <button class="primary" data-act="ok">Übernehmen</button>
      </div>
    `;
    const grid = sheet.querySelector('.rng-grid');
    for (let i = 0; i < segCount; i++) {
      const seg = t.segments[i];
      const def = OF_DEFS[seg.of];
      const isOn = sel.has(i);
      const cell = document.createElement('button');
      cell.className = 'rng-cell' + (isOn ? ' on' : '');
      cell.innerHTML = `
        <div class="num">#${i+1}</div>
        <div class="of-mini" style="background:${def?.color || '#666'}">${seg.of}</div>
        <div class="ln">${fmt(seg.len)} m</div>
      `;
      cell.onclick = () => {
        if (sel.has(i)) sel.delete(i); else sel.add(i);
        renderBody();
      };
      grid.appendChild(cell);
    }
    sheet.querySelector('#rngAll').onclick = () => { for (let i = 0; i < segCount; i++) sel.add(i); renderBody(); };
    sheet.querySelector('#rngNone').onclick = () => { sel.clear(); renderBody(); };
    sheet.querySelector('#rngInvert').onclick = () => {
      const newSel = new Set();
      for (let i = 0; i < segCount; i++) if (!sel.has(i)) newSel.add(i);
      sel.clear();
      newSel.forEach(i => sel.add(i));
      renderBody();
    };
    sheet.onclick = (e) => {
      const act = e.target.dataset.act;
      if (act === 'close' || act === 'cancel') closeModal('modalSeg');
      if (act === 'ok') {
        if (sel.size === 0) {
          if (!confirm('Bereich ist leer — Leitung wird aus der Trasse entfernt. Fortfahren?')) return;
          t.cables.splice(cabIdx, 1);
        } else {
          cab.segIds = Array.from(sel).sort((a, b) => a - b);
        }
        closeModal('modalSeg');
        renderCablesFull(t, ctx);
        renderTraceSegments(t, ctx);
        renderTrenchDiagram(t, ctx);
        renderCableBOM(t, ctx);
        updateTraceSum(t);
      }
    };
  }
  renderBody();
  openModal('modalSeg');
}

function renderTracePoints(t, ctx) {
  const c = document.getElementById('trPoints');
  c.innerHTML = '';
  t.points.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pt';
    d.innerHTML = `
      <div class="n">${i+1}</div>
      <div class="coords">${p[0].toFixed(6)}, ${p[1].toFixed(6)}</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'del';
    btn.textContent = '🗑';
    btn.onclick = () => {
      if (t.points.length <= 2) { alert('Mindestens 2 Punkte erforderlich'); return; }
      if (!confirm(`Punkt #${i+1} löschen?`)) return;
      // Welches Segment fällt weg?
      let removedSegIdx;
      if (i === 0) removedSegIdx = 0;
      else if (i >= t.points.length - 1) removedSegIdx = t.segments.length - 1;
      else removedSegIdx = i - 1;
      t.points.splice(i, 1);
      t.segments.splice(removedSegIdx, 1);
      // v6.2: Cables-Indizes nachziehen
      adjustCablesAfterSegmentDelete(t, removedSegIdx);
      // Multi-Select aufräumen
      const newSel = new Set();
      segSelection.forEach(si => {
        if (si === removedSegIdx) return;
        newSel.add(si > removedSegIdx ? si - 1 : si);
      });
      segSelection = newSel;
      recalcSegments(t);
      renderTracePoints(t, ctx);
      renderTraceSegments(t, ctx);
      renderCablesFull(t, ctx);
      renderTrenchDiagram(t, ctx);
      renderCableBOM(t, ctx);
      renderSegSelToolbar(t, ctx);
      updateTraceSum(t);
      ctx.render();
    };
    d.appendChild(btn);
    c.appendChild(d);
  });
}

function deleteSegment(t, idx, ctx) {
  if (t.segments.length <= 1) { alert('Letztes Segment kann nicht gelöscht werden. Ganze Trasse löschen?'); return; }
  if (!confirm(`Segment #${idx+1} löschen? Die verbleibenden Punkte werden neu verbunden.`)) return;
  if (ctx.pushUndo) ctx.pushUndo();
  // Endpunkt des Segments entfernen
  const pointToRemove = idx + 1; // segment idx endet am Punkt idx+1
  if (pointToRemove >= t.points.length) return;
  t.points.splice(pointToRemove, 1);
  t.segments.splice(idx, 1);
  // v6.2: Cables nachziehen (Indizes korrigieren, Cables ohne segIds entfernen)
  adjustCablesAfterSegmentDelete(t, idx);
  // v6.2: Multi-Select-State aufräumen
  const newSel = new Set();
  segSelection.forEach(i => {
    if (i === idx) return;
    newSel.add(i > idx ? i - 1 : i);
  });
  segSelection = newSel;
  recalcSegments(t);
  renderTraceSegments(t, ctx);
  renderTracePoints(t, ctx);
  renderCablesFull(t, ctx);
  renderTrenchDiagram(t, ctx);
  renderCableBOM(t, ctx);
  renderSegSelToolbar(t, ctx);
  updateTraceSum(t);
  ctx.render();
}

function updateTraceSum(t) {
  let sumTiefbau = 0;
  t.segments.forEach(seg => {
    const def = OF_DEFS[seg.of]; if (!def) return;
    sumTiefbau += seg.len * (def.prOF + def.prWH + (seg.hand ? PRICE_HAND : PRICE_GRABEN));
  });

  // v6.2/v6.3: Range-basierte Kabelkosten + Meter-Summe
  let sumCable = 0;
  let sumMeters = 0;
  (t.cables || []).forEach(c => {
    const n = Number(c.count) || 0;
    if (n <= 0) return;
    const baseLen = cableRangeLength(c, t);
    if (baseLen <= 0) return;
    const eff = cableEffectiveLength(c, baseLen);
    sumMeters += eff * n;
    sumCable += eff * n * cableUnitPrice(c);
  });

  const total = sumTiefbau + sumCable;
  const sumEl = document.getElementById('trSum');
  if (sumEl) {
    sumEl.innerHTML = `Tiefbau: ${fmtEur(sumTiefbau)} · Kabel: ${fmtEur(sumCable)} · <span style="opacity:.85">${fmt(sumMeters)} Kabelmeter</span><br><span style="font-size:16px">Σ Trasse: ${fmtEur(total)}</span>`;
  }
}

// ===== v6.3: Graben-Belegungs-Diagramm (Längsschnitt) =====
function renderTrenchDiagram(t, ctx) {
  const c = document.getElementById('trTrenchDiagram');
  if (!c) return;

  const segs = t.segments || [];
  const cables = (t.cables || []).slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''));

  if (!segs.length) {
    c.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Trasse hat keine Segmente.</div>';
    return;
  }
  if (!cables.length) {
    c.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine Kabel-Belegung — füge Kabel hinzu, um den Belegungsverlauf zu sehen.</div>';
    return;
  }

  const totalLenM = segs.reduce((s, sg) => s + sg.len, 0);
  if (totalLenM <= 0) { c.innerHTML = ''; return; }

  // Geometrie
  const W = Math.max(c.clientWidth || 600, 320);
  const stripeH = 8;
  const padTop = 24;       // Platz für Segment-Nummer
  const gapAboveStack = 4;
  const labelRowH = 34;    // Platz für Stück + Typen
  const segNumberRowH = 16;
  const sepW = 1;          // Trennlinie zwischen Segmenten

  // Pro Segment: Stack-Höhe = Σ über alle Cables (count * stripeH)
  const segStackHeights = segs.map((_, i) => {
    return cables
      .filter(c => Array.isArray(c.segIds) && c.segIds.includes(i))
      .reduce((s, c) => s + (Number(c.count) || 0) * stripeH, 0);
  });
  const maxStack = Math.max(stripeH, ...segStackHeights, stripeH);  // mind. eine Zeile

  const H = padTop + segNumberRowH + maxStack + gapAboveStack + labelRowH + 8;

  // Spaltenbreiten proportional zur Segmentlänge
  const usableW = W - (segs.length - 1) * sepW;
  const cumX = [0];
  for (let i = 0; i < segs.length; i++) {
    cumX.push(cumX[i] + (segs[i].len / totalLenM) * usableW + (i < segs.length - 1 ? sepW : 0));
  }

  // SVG bauen
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;background:#f9fafb;border-radius:6px;border:1px solid #e3e6ed">`;

  // Hintergrund-Spalten + Klick-Areas
  for (let i = 0; i < segs.length; i++) {
    const x = cumX[i];
    const w = cumX[i+1] - cumX[i] - (i < segs.length - 1 ? sepW : 0);
    const ofCol = OF_DEFS[segs[i].of]?.color || TRACE_COLOR;
    // OF-Streifen oben (Segment-Header)
    svg += `<rect x="${x}" y="${padTop}" width="${w}" height="${segNumberRowH}" fill="${ofCol}" opacity="0.85" />`;
    svg += `<text x="${x + w/2}" y="${padTop + segNumberRowH - 4}" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff">#${i+1}</text>`;
    // Klick-Area (transparent, ganzes Segment)
    svg += `<rect class="trench-seg-hit" data-seg="${i}" x="${x}" y="0" width="${w}" height="${H}" fill="rgba(0,0,0,0)" style="cursor:pointer" />`;
    if (i < segs.length - 1) {
      svg += `<rect x="${x + w}" y="${padTop}" width="${sepW}" height="${segNumberRowH + maxStack}" fill="#fff" />`;
    }
  }

  // Cable-Stacks pro Segment
  const stackBaseY = padTop + segNumberRowH + maxStack;
  for (let i = 0; i < segs.length; i++) {
    const x = cumX[i];
    const w = cumX[i+1] - cumX[i] - (i < segs.length - 1 ? sepW : 0);
    let y = stackBaseY;
    cables.forEach(cab => {
      if (!cab.segIds || !cab.segIds.includes(i)) return;
      const cnt = Number(cab.count) || 0;
      if (cnt <= 0) return;
      const ct = ctx.state.cableTypes.find(x => x.id === cab.typeId);
      const color = ct?.color || '#666';
      const blockH = cnt * stripeH;
      y -= blockH;
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${blockH}" fill="${color}" stroke="#fff" stroke-width="0.5" />`;
      // Label nur wenn genug Platz
      if (w > 28 && blockH >= 10) {
        svg += `<text x="${x + 4}" y="${y + blockH/2 + 3}" font-size="8" fill="#fff" font-weight="bold" pointer-events="none">${escapeHtml(cab.typeId)}×${cnt}</text>`;
      }
    });
  }

  // Zahlenreihen unten: Stück + Typen
  const numRowY1 = stackBaseY + gapAboveStack + 12;
  const numRowY2 = numRowY1 + 14;
  for (let i = 0; i < segs.length; i++) {
    const x = cumX[i];
    const w = cumX[i+1] - cumX[i] - (i < segs.length - 1 ? sepW : 0);
    const stats = segmentCableStats(t, i);
    const cx = x + w/2;
    if (stats.cabsHere.length) {
      svg += `<text x="${cx}" y="${numRowY1}" text-anchor="middle" font-size="11" font-weight="bold" fill="#1B2D5E" pointer-events="none">${stats.stueck} St.</text>`;
      svg += `<text x="${cx}" y="${numRowY2}" text-anchor="middle" font-size="9" fill="#666" pointer-events="none">${stats.typen} Typ${stats.typen===1?'':'en'}</text>`;
    } else {
      svg += `<text x="${cx}" y="${numRowY1}" text-anchor="middle" font-size="11" fill="#bbb" pointer-events="none">∅</text>`;
    }
  }

  svg += '</svg>';
  c.innerHTML = svg;

  // Klicks binden
  c.querySelectorAll('.trench-seg-hit').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.seg);
      if (Number.isFinite(idx)) openSeg(t.id, idx, ctx);
    });
  });
}

// ===== v6.4: Bestellmengen-Tabelle für eine Trasse =====
function renderCableBOM(t, ctx) {
  const c = document.getElementById('trCableBOM');
  if (!c) return;

  const bom = aggregateCableMaterials([t]);
  if (!bom.length) {
    c.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine Kabel — Bestellmengen erscheinen, sobald Kabel hinzugefügt wurden.</div>';
    return;
  }

  let totalM = 0, totalCost = 0, totalCount = 0;
  let rows = '';
  bom.forEach(b => {
    totalM += b.totalMeters;
    totalCost += b.totalCost;
    totalCount += b.totalCount;
    const ct = ctx.state.cableTypes.find(x => x.id === b.typeId);
    const color = ct?.color || '#666';
    rows += `
      <tr>
        <td><span class="bom-dot" style="background:${color}"></span>${escapeHtml(b.label)}${b.isOverride ? ' <span class="bom-tag">EP-Override</span>' : ''}</td>
        <td class="r">${b.totalCount} St.</td>
        <td class="r"><b>${fmt(b.totalMeters)} m</b></td>
        <td class="r">${fmt(b.unitPrice)} €/m</td>
        <td class="r">${fmtEur(b.totalCost)}</td>
      </tr>`;
  });

  c.innerHTML = `
    <table class="cbl-bom">
      <thead>
        <tr>
          <th>Kabeltyp</th>
          <th class="r">Stück</th>
          <th class="r">Bestellmeter</th>
          <th class="r">EP</th>
          <th class="r">Σ Kosten</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td><b>Σ</b></td>
          <td class="r"><b>${totalCount}</b></td>
          <td class="r"><b>${fmt(totalM)} m</b></td>
          <td class="r">—</td>
          <td class="r"><b>${fmtEur(totalCost)}</b></td>
        </tr>
      </tfoot>
    </table>
  `;
}

// ===== v6.3: Export ein Segment zu AushubPorte =====
function exportSegmentToAushub(t, segIdx, ctx) {
  const seg = t.segments[segIdx];
  if (!seg) return;
  const stats = segmentCableStats(t, segIdx);
  const meta = ctx.state.meta || {};

  const payload = {
    from: 'tiefbauporte',
    to: 'aushubporte',
    createdAt: new Date().toISOString(),
    segment: {
      idx: segIdx,
      len: seg.len,
      of: seg.of,
      hand: !!seg.hand,
      typen: stats.typen,
      stueck: stats.stueck,
      cables: stats.cabsHere.map(c => ({
        typeId: c.typeId, label: c.label, count: c.count
      }))
    },
    trace: {
      id: t.id,
      we: meta.we || '',
      loc: meta.loc || ''
    }
  };

  try {
    localStorage.setItem('porteportal.handoff', JSON.stringify(payload));
  } catch (e) {
    showInfo('Speichern fehlgeschlagen: ' + e.message, 'err');
    return;
  }

  showInfo(`📤 Segment #${segIdx+1} → AushubPorte (${stats.stueck} Kabel, ${fmt(seg.len)} m)`);
  // Kurz warten, damit Banner sichtbar ist, dann springen
  setTimeout(() => {
    window.location.href = '../aushubporte/';
  }, 600);
}

function saveCurrentTrace(ctx) {
  const t = ctx.state.traces.find(x => x.id === currentTraceId);
  if (!t) return;
  t.note = document.getElementById('trNote').value;
  closeModal('modalTrace');
  ctx.render();
}

function deleteCurrentTrace(ctx) {
  if (!confirm('Trasse wirklich löschen?')) return;
  if (ctx.pushUndo) ctx.pushUndo();
  ctx.state.traces = ctx.state.traces.filter(x => x.id !== currentTraceId);
  closeModal('modalTrace');
  ctx.render();
}

// ===== Segment Editor (v6.2) =====
// Belegung wird jetzt in der Trasse pro Cable per Range gemacht.
// Hier nur noch Oberfläche, Hand, und read-only "Welche Kabel liegen hier?"
export function openSeg(traceId, segIdx, ctx) {
  const t = ctx.state.traces.find(x => x.id === traceId);
  if (!t) return;
  currentTraceId = traceId;
  currentSegIdx = segIdx;
  const seg = t.segments[segIdx];

  const cabsHere = cablesInSegment(t, segIdx);

  const sheet = document.querySelector('#modalSeg .sheet');
  sheet.innerHTML = `
    <header>
      <h2>Segment #${segIdx+1}</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <div style="background:var(--bg);padding:10px;border-radius:6px;margin-bottom:10px;font-size:13px">
        <b>Länge:</b> ${fmt(seg.len)} m · Aktuell: ${seg.of}${seg.hand?' (Hand)':''}
      </div>
      <label>Oberfläche</label>
      <select id="segOF">
        <option value="OF0" ${seg.of==='OF0'?'selected':''}>🟢 OF0 · unbefestigt / Rasen · 38,50 + 28,60 €/m</option>
        <option value="OF1" ${seg.of==='OF1'?'selected':''}>🟡 OF1 · Pflaster · 50,60 + 28,60 €/m</option>
        <option value="OF2" ${seg.of==='OF2'?'selected':''}>🟠 OF2 · Beton · 291,61 + 35,20 €/m</option>
        <option value="OF3" ${seg.of==='OF3'?'selected':''}>🔴 OF3 · Asphalt · 187,00 + 35,20 €/m</option>
      </select>
      <label><input type="checkbox" id="segHand" style="width:auto;margin-right:6px" ${seg.hand?'checked':''}>In Handschachtung (89,10 €/m statt 159,50 €/m)</label>

      <hr style="margin:16px 0">
      <h3 style="color:var(--navy);font-size:13px;margin:0 0 6px">Kabel in diesem Segment</h3>
      <small style="color:#666;display:block;margin-bottom:8px">Belegung wird in der Trasse über Bereiche verwaltet (Strg/Shift-Klick auf Segmente).</small>

      <div class="seg-cabs-here">
        ${cabsHere.length
          ? cabsHere.map(c => {
              const ct = ctx.state.cableTypes.find(x => x.id === c.typeId);
              const color = ct?.color || '#666';
              return `<div class="seg-cab-row">
                <div class="dot" style="background:${color}"></div>
                <div class="lbl">${escapeHtml(c.label)}</div>
                <div class="meta">${c.count}× · Reserve ${c.reserveValue}${c.reserveMode==='m'?'m':'%'}</div>
                <div class="meta">Bereich: Seg ${formatSegRange(c.segIds)}</div>
              </div>`;
            }).join('')
          : `<div style="padding:10px;color:#999;font-size:12px;background:#fff3e0;border-radius:6px;text-align:center;border:1px solid #ffd180">∅ In diesem Segment liegen keine Kabel.</div>`
        }
      </div>

      <hr style="margin:16px 0">
      <button id="segOpenTrace" style="width:100%;padding:13px;background:var(--green);color:var(--navy);border:none;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer">→ Zur Trassen-Belegung</button>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Übernehmen</button>
    </div>
  `;

  sheet.onclick = (e) => {
    const act = e.target.dataset.act;
    if (act === 'close') closeModal('modalSeg');
    if (act === 'save') saveCurrentSeg(ctx);
    if (e.target.id === 'segOpenTrace') {
      saveCurrentSeg(ctx, true);
      openTrace(currentTraceId, ctx);
    }
  };
  openModal('modalSeg');
}

function saveCurrentSeg(ctx, keepOpen) {
  const t = ctx.state.traces.find(x => x.id === currentTraceId);
  if (!t) return;
  const seg = t.segments[currentSegIdx];
  seg.of = document.getElementById('segOF').value;
  seg.hand = document.getElementById('segHand').checked;
  if (!keepOpen) closeModal('modalSeg');
  ctx.render();
}
