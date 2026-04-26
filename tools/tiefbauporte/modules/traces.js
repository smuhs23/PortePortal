// v6/modules/traces.js
// PHASE 1 STUB — Basis-Handling für Trassen-Zeichnung und einfachen Segment-Dialog
// Vollständige Überarbeitung in Phase 2 (dynamische Kabel-Belegung, Custom-Typen).

import { openModal, closeModal, showInfo, uid, fmt, fmtEur, escapeHtml, renderPhotos } from './ui.js';
import { distMeters, totalLen, recalcSegments, cableEffectiveLength, cableUnitPrice, getEffectiveCablesForSegment, hasSegmentOverrides } from './calc.js';
import { OF_DEFS, TRACE_COLOR, PRICE_GRABEN, PRICE_HAND } from './constants.js';
import { openPickCable, openCableTypesCatalog } from './cableTypes.js';

let currentTraceId = null;
let currentSegIdx = null;

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

// ===== Trace Detail Dialog (v6 vollständig) =====
export function openTrace(id, ctx) {
  const t = ctx.state.traces.find(x => x.id === id);
  if (!t) return;
  currentTraceId = id;
  recalcSegments(t);

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

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Segmente (Oberfläche pro Abschnitt)</h3>
      <small style="color:#666">Segment antippen → Oberfläche wechseln. 🗑 löscht Segment.</small>
      <div id="trSegList" class="seg-list"></div>

      <h3 style="color:var(--navy);font-size:13px;margin:14px 0 4px">Leitungs-Belegung im Graben</h3>
      <small style="color:#666">Typ, Anzahl, Reserve (% oder m), Preis-Override pro Leitung.</small>
      <div id="trCables" style="margin-top:4px"></div>
      <button id="trAddCableBtn" class="cbl-add-btn">+ Leitung hinzufügen</button>

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
  renderCablesFull(t, ctx);
  renderTracePoints(t, ctx);
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
        t.cables.push({
          typeId: cableType.id,
          label: cableType.label,
          priceSnapshot: cableType.price,
          priceOverride: null,
          count: 1,
          reserveMode: 'pct',
          reserveValue: 10
        });
        renderCablesFull(t, ctx);
        updateTraceSum(t);
      });
    }
  };

  openModal('modalTrace');
}

function renderTraceSegments(t, ctx) {
  const c = document.getElementById('trSegList');
  c.innerHTML = '';
  t.segments.forEach((seg, i) => {
    const def = OF_DEFS[seg.of];
    // v6.1: Kabelbelegungs-Badge
    let cabBadge = '';
    if (seg.cables === undefined || seg.cables === null) {
      cabBadge = `<div class="seg-cab-badge inherit" title="Erbt Trassen-Default">↪</div>`;
    } else if (Array.isArray(seg.cables) && seg.cables.length === 0) {
      cabBadge = `<div class="seg-cab-badge empty" title="Keine Kabel in diesem Segment">∅</div>`;
    } else {
      cabBadge = `<div class="seg-cab-badge own" title="Eigene Belegung (${seg.cables.length})">⚙ ${seg.cables.length}</div>`;
    }

    const d = document.createElement('div');
    d.className = 'seg';
    d.innerHTML = `
      <div class="n">#${i+1}</div>
      <div class="of" style="background:${def?.color || TRACE_COLOR}">${seg.of}</div>
      <div class="len">${escapeHtml(def?.label || '')} · ${fmt(seg.len)} m</div>
      ${seg.hand ? '<div class="hand">HAND</div>' : ''}
      ${cabBadge}
      <button class="seg-del" data-seg="${i}" title="Segment löschen">🗑</button>
      <div style="color:#999;font-size:16px">›</div>
    `;
    d.onclick = (e) => {
      if (e.target.classList.contains('seg-del')) {
        e.stopPropagation();
        deleteSegment(t, i, ctx);
        return;
      }
      openSeg(t.id, i, ctx);
    };
    c.appendChild(d);
  });
}

function renderCablesFull(t, ctx) {
  const c = document.getElementById('trCables');
  if (!t.cables) t.cables = [];
  if (!t.cables.length) {
    c.innerHTML = '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine Leitungen im Graben.</div>';
    return;
  }
  let html = '<div class="cbl-list">';
  t.cables.forEach((cab, i) => {
    const cableType = ctx.state.cableTypes.find(ct => ct.id === cab.typeId);
    const color = cableType?.color || '#666';
    const isCustom = cableType && !cableType.builtin;
    const iconLabel = cab.typeId.toUpperCase().slice(0, 3);
    const effPrice = cableUnitPrice(cab);
    const showOverride = cab.priceOverride != null;
    html += `
      <div class="cbl-row-v6 ${isCustom ? 'custom' : ''}">
        <div class="icn" style="background:${color}">${escapeHtml(iconLabel)}</div>
        <div>
          <div class="name">${escapeHtml(cab.label)}${isCustom ? ' <span class="tag-badge custom">Eigen</span>' : ''}</div>
          <small>${fmt(effPrice)} €/m${showOverride ? ' <b style="color:var(--orange)">· Override</b>' : ''}${cableType?.lvPos ? ' · LV ' + escapeHtml(cableType.lvPos) : ''}</small>
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
      updateTraceSum(t);
    };
    el.onchange = el.oninput;
  });

  c.querySelectorAll('[data-del-cab]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delCab);
      if (isNaN(idx)) return;
      if (!confirm(`Leitung "${t.cables[idx].label}" aus dieser Trasse entfernen?`)) return;
      t.cables.splice(idx, 1);
      renderCablesFull(t, ctx);
      updateTraceSum(t);
    };
  });
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
      t.points.splice(i, 1);
      if (i === 0) t.segments.splice(0, 1);
      else if (i >= t.points.length) t.segments.splice(i-1, 1);
      else t.segments.splice(i-1, 1);
      recalcSegments(t);
      renderTracePoints(t, ctx);
      renderTraceSegments(t, ctx);
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
  recalcSegments(t);
  renderTraceSegments(t, ctx);
  renderTracePoints(t, ctx);
  updateTraceSum(t);
  ctx.render();
}

function updateTraceSum(t) {
  const len = totalLen(t);
  let sumTiefbau = 0;
  t.segments.forEach(seg => {
    const def = OF_DEFS[seg.of]; if (!def) return;
    sumTiefbau += seg.len * (def.prOF + def.prWH + (seg.hand ? PRICE_HAND : PRICE_GRABEN));
  });

  // v6.1: Kabel-Kosten im Mischmodus (Segment-Overrides berücksichtigen)
  let sumCable = 0;
  const overrides = hasSegmentOverrides(t);
  if (!overrides) {
    (t.cables || []).forEach(c => {
      const n = Number(c.count) || 0;
      if (n <= 0) return;
      sumCable += cableEffectiveLength(c, len) * n * cableUnitPrice(c);
    });
  } else {
    t.segments.forEach(seg => {
      const { cables } = getEffectiveCablesForSegment(t, seg);
      cables.forEach(c => {
        const n = Number(c.count) || 0;
        if (n <= 0) return;
        sumCable += cableEffectiveLength(c, seg.len) * n * cableUnitPrice(c);
      });
    });
  }

  const total = sumTiefbau + sumCable;
  const sumEl = document.getElementById('trSum');
  if (sumEl) {
    sumEl.innerHTML = `Tiefbau: ${fmtEur(sumTiefbau)} · Kabel: ${fmtEur(sumCable)}<br><span style="font-size:16px">Σ Trasse: ${fmtEur(total)}</span>`;
  }
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

// ===== Segment Editor =====
export function openSeg(traceId, segIdx, ctx) {
  const t = ctx.state.traces.find(x => x.id === traceId);
  if (!t) return;
  currentTraceId = traceId;
  currentSegIdx = segIdx;
  const seg = t.segments[segIdx];

  // Aktuellen Belegungsmodus bestimmen
  const cabMode = (seg.cables === undefined || seg.cables === null) ? 'inherit'
                : (Array.isArray(seg.cables) && seg.cables.length === 0) ? 'empty'
                : 'own';

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
      <h3 style="color:var(--navy);font-size:13px;margin:0 0 6px">Leitungs-Belegung in diesem Segment</h3>
      <small style="color:#666;display:block;margin-bottom:8px">Wählen, wie dieses Segment mit Kabeln belegt ist:</small>

      <div class="seg-cab-mode">
        <label class="seg-cab-radio ${cabMode==='inherit'?'on':''}">
          <input type="radio" name="segCabMode" value="inherit" ${cabMode==='inherit'?'checked':''}>
          <span class="ttl">↪ Aus Trasse erben</span>
          <span class="dsc">Default-Belegung der Trasse gilt auch hier</span>
        </label>
        <label class="seg-cab-radio ${cabMode==='own'?'on':''}">
          <input type="radio" name="segCabMode" value="own" ${cabMode==='own'?'checked':''}>
          <span class="ttl">⚙ Eigene Belegung</span>
          <span class="dsc">Nur in diesem Segment liegen diese Kabel</span>
        </label>
        <label class="seg-cab-radio ${cabMode==='empty'?'on':''}">
          <input type="radio" name="segCabMode" value="empty" ${cabMode==='empty'?'checked':''}>
          <span class="ttl">∅ Keine Kabel hier</span>
          <span class="dsc">In diesem Segment liegt nichts</span>
        </label>
      </div>

      <div id="segCabBox" style="margin-top:10px"></div>

      <hr style="margin:16px 0">
      <button id="segOpenTrace" style="width:100%;padding:13px;background:var(--green);color:var(--navy);border:none;border-radius:8px;font-weight:bold;font-size:13px;cursor:pointer">→ Zur Trassen-Default-Belegung</button>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close">Abbruch</button>
      <button class="primary" data-act="save">Übernehmen</button>
    </div>
  `;

  // Initial render der Kabel-Box je nach Modus
  renderSegCabBox(t, seg, ctx);

  // Radio-Events: bei Wechsel die Box neu rendern
  sheet.querySelectorAll('input[name="segCabMode"]').forEach(r => {
    r.onchange = () => {
      const mode = r.value;
      // Klassen umschalten für visuelles Feedback
      sheet.querySelectorAll('.seg-cab-radio').forEach(lbl => lbl.classList.remove('on'));
      r.closest('.seg-cab-radio').classList.add('on');
      // Modus auf Segment anwenden (sofort, lokal in t.segments)
      if (mode === 'inherit') {
        delete seg.cables;
      } else if (mode === 'empty') {
        seg.cables = [];
      } else if (mode === 'own') {
        // Beim Umschalten auf "own": Default aus Trasse übernehmen, dann editierbar
        if (!Array.isArray(seg.cables) || seg.cables.length === 0) {
          seg.cables = JSON.parse(JSON.stringify(t.cables || []));
        }
      }
      renderSegCabBox(t, seg, ctx);
    };
  });

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

// Render der Kabel-Box im Segment-Editor je nach Modus
function renderSegCabBox(t, seg, ctx) {
  const box = document.getElementById('segCabBox');
  if (!box) return;

  const mode = (seg.cables === undefined || seg.cables === null) ? 'inherit'
             : (Array.isArray(seg.cables) && seg.cables.length === 0) ? 'empty'
             : 'own';

  if (mode === 'inherit') {
    const list = t.cables || [];
    if (!list.length) {
      box.innerHTML = `<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Trasse hat (noch) keine Default-Belegung. Bitte erst Default in der Trasse setzen.</div>`;
      return;
    }
    box.innerHTML = `
      <div style="padding:8px;background:#eef;border-left:3px solid var(--navy);border-radius:4px;font-size:12px">
        <b style="color:var(--navy)">Geerbte Belegung (read-only):</b>
        <ul style="margin:6px 0 0 18px;padding:0">
          ${list.map(c => `<li>${escapeHtml(c.label)} · ${c.count}× · Reserve ${c.reserveValue}${c.reserveMode==='m'?'m':'%'}</li>`).join('')}
        </ul>
      </div>
    `;
    return;
  }

  if (mode === 'empty') {
    box.innerHTML = `<div style="padding:10px;color:#999;font-size:12px;background:#fff3e0;border-radius:6px;text-align:center;border:1px solid #ffd180">Keine Kabel in diesem Segment.</div>`;
    return;
  }

  // own
  let html = '<div class="cbl-list">';
  if (!seg.cables.length) {
    html += '<div style="padding:10px;color:#999;font-size:12px;background:var(--bg);border-radius:6px;text-align:center">Noch keine Leitungen. Hinzufügen mit + unten.</div>';
  } else {
    seg.cables.forEach((cab, i) => {
      const cableType = ctx.state.cableTypes.find(ct => ct.id === cab.typeId);
      const color = cableType?.color || '#666';
      const isCustom = cableType && !cableType.builtin;
      const iconLabel = cab.typeId.toUpperCase().slice(0, 3);
      const effPrice = cableUnitPrice(cab);
      const showOverride = cab.priceOverride != null;
      html += `
        <div class="cbl-row-v6 ${isCustom ? 'custom' : ''}">
          <div class="icn" style="background:${color}">${escapeHtml(iconLabel)}</div>
          <div>
            <div class="name">${escapeHtml(cab.label)}${isCustom ? ' <span class="tag-badge custom">Eigen</span>' : ''}</div>
            <small>${fmt(effPrice)} €/m${showOverride ? ' <b style="color:var(--orange)">· Override</b>' : ''}${cableType?.lvPos ? ' · LV ' + escapeHtml(cableType.lvPos) : ''}</small>
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
  }
  html += '</div>';
  html += '<button id="segAddCableBtn" class="cbl-add-btn">+ Leitung hinzufügen</button>';
  box.innerHTML = html;

  // Input-Events
  box.querySelectorAll('input, select').forEach(el => {
    const idx = parseInt(el.dataset.cabIdx);
    const field = el.dataset.field;
    if (isNaN(idx) || !field) return;
    el.oninput = () => {
      const cab = seg.cables[idx];
      if (!cab) return;
      if (field === 'reserveMode') {
        cab.reserveMode = el.value;
      } else if (field === 'priceOverride') {
        const v = el.value.trim();
        cab.priceOverride = v === '' ? null : parseFloat(v);
      } else {
        cab[field] = parseFloat(el.value) || 0;
      }
    };
    el.onchange = el.oninput;
  });

  box.querySelectorAll('[data-del-cab]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delCab);
      if (isNaN(idx)) return;
      if (!confirm(`Leitung "${seg.cables[idx].label}" aus diesem Segment entfernen?`)) return;
      seg.cables.splice(idx, 1);
      renderSegCabBox(t, seg, ctx);
    };
  });

  const addBtn = document.getElementById('segAddCableBtn');
  if (addBtn) addBtn.onclick = () => {
    openPickCable(ctx, (cableType) => {
      seg.cables.push({
        typeId: cableType.id,
        label: cableType.label,
        priceSnapshot: cableType.price,
        priceOverride: null,
        count: 1,
        reserveMode: 'pct',
        reserveValue: 10
      });
      renderSegCabBox(t, seg, ctx);
    });
  };
}

function saveCurrentSeg(ctx, keepOpen) {
  const t = ctx.state.traces.find(x => x.id === currentTraceId);
  if (!t) return;
  const seg = t.segments[currentSegIdx];
  seg.of = document.getElementById('segOF').value;
  seg.hand = document.getElementById('segHand').checked;
  // Mode wird live in seg.cables geschrieben (durch Radio-Handler), daher hier nichts mehr nötig
  if (!keepOpen) closeModal('modalSeg');
  ctx.render();
}
