// v6/modules/render.js
// Zeichnet Pins und Trassen auf die Karte, erstellt Legende

import { OF_DEFS, TRACE_COLOR } from './constants.js';
import { escapeHtml } from './ui.js';

export function getPinStyle(o, state) {
  const cat = state.catalog.find(c => c.id === o.catId) || {};
  const iconType = o.iconTypeOverride || cat.iconType || 'hybrid';
  const emoji = cat.defaultEmoji || '❓';
  const kuerz = cat.icon || '?';

  // iconOverride kann Emoji ODER Textkürzel sein
  let displayIcon = emoji;
  let displayKuerz = kuerz;
  if (o.iconOverride) {
    // Heuristik: wenn iconType emoji/hybrid → override als emoji
    if (iconType === 'text') {
      displayKuerz = o.iconOverride;
    } else {
      displayIcon = o.iconOverride;
    }
  }

  return {
    color: o.colorOverride || cat.color || '#1B2D5E',
    shape: o.shapeOverride || cat.shape || 'shape-hex',
    iconType,
    displayIcon,
    displayKuerz,
    cat
  };
}

function buildPinHtml(o, s) {
  const hasPhoto = (o.photos && o.photos.length > 0);
  const valLabel = [];
  if (s.cat.hasKw && o.kw) valLabel.push(o.kw + 'kW');
  if (s.cat.hasAmp && o.amps) valLabel.push(o.amps + 'A');
  const valHtml = valLabel.length ? `<div class="val">${valLabel.join('·')}</div>` : '';
  const qtyHtml = o.qty > 1 ? `<div class="qty">×${o.qty}</div>` : '';

  let inner;
  if (s.iconType === 'hybrid') {
    inner = `${s.displayIcon}<div class="kuerz">${escapeHtml(s.displayKuerz)}</div>${valHtml}${qtyHtml}`;
  } else if (s.iconType === 'emoji') {
    inner = `${s.displayIcon}${valHtml}${qtyHtml}`;
  } else {
    // text
    inner = `${escapeHtml(s.displayKuerz)}${valHtml}${qtyHtml}`;
  }

  const labelHtml = o.customName
    ? `<div class="pin-label">${escapeHtml(o.customName)}</div>`
    : '';

  return { inner, labelHtml, hasPhoto };
}

function renderPins(ctx) {
  const { state, objLayer, mode } = ctx;
  objLayer.clearLayers();
  if (!state.viz.hw) return;

  state.objects.forEach(o => {
    const s = getPinStyle(o, state);
    if (!s.cat.id) return;

    const { inner, labelHtml, hasPhoto } = buildPinHtml(o, s);
    const cls = `mlabel ${s.shape} ${hasPhoto ? 'has-photo' : ''} icon-${s.iconType} ${mode === 'drag' ? 'draggable-mark' : ''}`;
    const html = `<div class="${cls}" style="background:${s.color}">${inner}</div>${labelHtml}`;

    // v6.1: kleinere Pins per Default; bigPins toggle macht sie wieder größer
    const big = !!state.viz?.bigPins;
    const sz = big ? 48 : 34;
    const icon = L.divIcon({ html, className:'', iconSize:[sz, sz], iconAnchor:[sz/2, sz/2] });
    const m = L.marker([o.lat, o.lng], { icon, draggable: mode === 'drag' }).addTo(objLayer);

    // Einfaches Click-Handling: Tap öffnet Info-Dialog (mit Bearbeiten-Button darin).
    // Im View-Modus ebenfalls Info-Dialog (read-only, ohne Bearbeiten).
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      import('./objects.js').then(mod => mod.openObjDialogInfo(o.id, ctx));
    });

    // Desktop-Rechtsklick = direkt Bearbeiten (Shortcut)
    m.on('contextmenu', (e) => {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      if (state.uiMode === 'edit') {
        import('./objects.js').then(mod => mod.openObjDialogEdit(o.id, ctx));
      }
    });

    m.on('dragend', (e) => {
      const p = e.target.getLatLng();
      o.lat = p.lat; o.lng = p.lng;
      ctx.save();
    });

    // Tooltip — reichhaltig mit allen relevanten Infos
    const tipLines = [];
    if (o.customName) {
      tipLines.push(`<b>${escapeHtml(o.customName)}</b>`);
      tipLines.push(`<span style="color:#aaa;font-size:10px">${escapeHtml(s.cat.name)}</span>`);
    } else {
      tipLines.push(`<b>${escapeHtml(s.cat.name)}</b>`);
    }
    const sub = [];
    if (s.cat.category) sub.push(s.cat.category);
    if (s.cat.pos) sub.push('LV ' + s.cat.pos);
    if (sub.length) tipLines.push(`<span style="color:#ccc;font-size:10px">${escapeHtml(sub.join(' · '))}</span>`);

    const spec = [];
    if (o.qty > 1) spec.push('×' + o.qty);
    if (o.amps) spec.push(o.amps + ' A');
    if (o.kw) spec.push(o.kw + ' kW');
    if (spec.length) tipLines.push(spec.join(' · '));

    if (o.linkedTraceId) {
      const t = ctx.state.traces.find(x => x.id === o.linkedTraceId);
      if (t) {
        const idx = ctx.state.traces.indexOf(t);
        const segInfo = (o.linkedSegmentIdx != null) ? ` · Seg ${o.linkedSegmentIdx + 1}` : ' · Auto';
        tipLines.push(`<span style="color:#FFA000">🚧 Trasse #${idx + 1}${segInfo}</span>`);
      }
    }
    if (o.note) tipLines.push(`<span style="color:#ccc;font-size:10px;font-style:italic">📝 ${escapeHtml(o.note.length > 40 ? o.note.slice(0, 40) + '…' : o.note)}</span>`);

    const tipOff = big ? -26 : -18;
    m.bindTooltip(tipLines.join('<br>'), { direction: 'top', offset: [0, tipOff], className: 'pin-tooltip' });
  });
}

function renderTraces(ctx) {
  const { state, traceLayer, mode } = ctx;
  traceLayer.clearLayers();
  if (!state.viz.tr) return;

  state.traces.forEach(t => {
    for (let i = 0; i < t.segments.length; i++) {
      const seg = t.segments[i];
      const a = t.points[i], b = t.points[i+1];
      const col = OF_DEFS[seg.of]?.color || TRACE_COLOR;
      const pl = L.polyline([a, b], { color:col, weight:9, opacity:.95, lineCap:'round' }).addTo(traceLayer);

      pl.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (state.uiMode !== 'edit') return;
        import('./traces.js').then(mod => {
          if (e.originalEvent && e.originalEvent.shiftKey) mod.openTrace(t.id, ctx);
          else mod.openSeg(t.id, i, ctx);
        });
      });
      pl.bindTooltip(
        `Seg ${i+1}: ${seg.of} ${OF_DEFS[seg.of]?.label||''}${seg.hand?' · Hand':''} · ${seg.len.toFixed(1)} m`,
        { sticky: true }
      );
    }

    // Vertex-Punkte
    const big = !!state.viz?.bigPins;
    const vSize = big ? 24 : 18;
    const vFont = big ? 10 : 9;
    const vBorder = big ? 3 : 2;
    t.points.forEach((p, i) => {
      if (mode === 'drag' && state.uiMode === 'edit') {
        const col = i < t.segments.length
          ? (OF_DEFS[t.segments[i].of]?.color || TRACE_COLOR)
          : (i > 0 ? OF_DEFS[t.segments[i-1].of]?.color || TRACE_COLOR : TRACE_COLOR);
        const vm = L.marker(p, {
          icon: L.divIcon({
            html: `<div style="background:#fff;border:${vBorder}px solid ${col};border-radius:50%;width:${vSize}px;height:${vSize}px;margin-left:-${vSize/2}px;margin-top:-${vSize/2}px;box-shadow:0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:${vFont}px;color:${col};font-weight:bold">${i+1}</div>`,
            className: '', iconSize:[vSize,vSize]
          }),
          draggable: true
        }).addTo(traceLayer);

        let lastTap = 0;
        vm.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          const now = Date.now();
          if (now - lastTap < 500) {
            if (t.points.length <= 2) {
              import('./ui.js').then(m => m.showInfo('Mindestens 2 Punkte erforderlich', 'err'));
              return;
            }
            if (confirm(`Punkt #${i+1} löschen?`)) {
              t.points.splice(i, 1);
              if (i === 0) t.segments.splice(0, 1);
              else if (i === t.points.length) t.segments.splice(i-1, 1);
              else t.segments.splice(i-1, 1);
              import('./calc.js').then(m => {
                m.recalcSegments(t);
                ctx.save();
                ctx.render();
              });
            }
          }
          lastTap = now;
        });
        vm.on('drag', (e) => {
          const np = e.target.getLatLng();
          t.points[i] = [np.lat, np.lng];
          renderTraces(ctx);
        });
        vm.on('dragend', () => {
          import('./calc.js').then(m => {
            m.recalcSegments(t);
            ctx.save();
            ctx.render();
            // v6.3: offenes Trassen-Modal mit aktualisieren
            import('./traces.js').then(tr => tr.refreshTraceUIIfOpen(t.id, ctx));
          });
        });
      } else {
        const col = i < t.segments.length
          ? (OF_DEFS[t.segments[i].of]?.color || TRACE_COLOR)
          : (i > 0 ? OF_DEFS[t.segments[i-1].of]?.color || TRACE_COLOR : TRACE_COLOR);
        L.circleMarker(p, { radius:4, color:'#fff', fillColor:col, fillOpacity:1, weight:2 }).addTo(traceLayer);
      }
    });

    // ===== v6.1: Block-Drag-Griff (Trasse als Ganzes verschieben) =====
    if (mode === 'drag' && state.uiMode === 'edit' && t.points.length >= 2) {
      const mid = traceMidpoint(t.points);
      const handleSize = 28;
      const blockHandle = L.marker(mid, {
        icon: L.divIcon({
          html: `<div title="Trasse als Ganzes verschieben" style="background:#F57C00;color:#fff;border:2px solid #fff;border-radius:50%;width:${handleSize}px;height:${handleSize}px;margin-left:-${handleSize/2}px;margin-top:-${handleSize/2}px;box-shadow:0 2px 6px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;cursor:move">✥</div>`,
          className: '', iconSize:[handleSize, handleSize]
        }),
        draggable: true,
        autoPan: true
      }).addTo(traceLayer);

      let dragOrigin = null;
      let pointsSnapshot = null;

      blockHandle.on('dragstart', (e) => {
        dragOrigin = e.target.getLatLng();
        pointsSnapshot = t.points.map(p => [p[0], p[1]]);
        if (ctx.pushUndo) ctx.pushUndo();
      });

      blockHandle.on('drag', (e) => {
        if (!dragOrigin || !pointsSnapshot) return;
        const cur = e.target.getLatLng();
        const dLat = cur.lat - dragOrigin.lat;
        const dLng = cur.lng - dragOrigin.lng;
        // Alle Punkte entsprechend verschieben
        for (let i = 0; i < t.points.length; i++) {
          t.points[i] = [pointsSnapshot[i][0] + dLat, pointsSnapshot[i][1] + dLng];
        }
        // Live re-draw der Polylines (ohne Pins/Legende neu zu rechnen)
        renderTraces(ctx);
      });

      blockHandle.on('dragend', () => {
        dragOrigin = null;
        pointsSnapshot = null;
        // Segment-Längen neu berechnen, save & full render
        import('./calc.js').then(m => {
          m.recalcSegments(t);
          ctx.save();
          ctx.render();
          // v6.3: offenes Trassen-Modal mit aktualisieren
          import('./traces.js').then(tr => tr.refreshTraceUIIfOpen(t.id, ctx));
        });
      });
    }
  });
}

// Mittelpunkt einer Polyline (entlang der Bogenlänge auf halbem Weg)
function traceMidpoint(pts) {
  if (pts.length < 2) return pts[0];
  let total = 0;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i+1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(d);
    total += d;
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    if (acc + segs[i] >= half) {
      const t = (half - acc) / segs[i];
      const a = pts[i], b = pts[i+1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    acc += segs[i];
  }
  return pts[Math.floor(pts.length / 2)];
}

export function renderLegend(state) {
  const el = document.getElementById('legend');
  if (!el) return;

  // Assets nach Typ gruppieren und zählen
  const catStats = {}; // cat.id → { cat, count, color, displayIcon }
  state.objects.forEach(o => {
    const cat = state.catalog.find(c => c.id === o.catId);
    if (!cat) return;
    const iconType = o.iconTypeOverride || cat.iconType || 'hybrid';
    const disp = iconType === 'text' ? cat.icon : (cat.defaultEmoji || cat.icon);
    const key = cat.id;
    if (!catStats[key]) {
      catStats[key] = { cat, count: 0, color: o.colorOverride || cat.color, displayIcon: disp };
    }
    catStats[key].count += (Number(o.qty) || 1);
  });

  // Oberflächen-Summen
  const ofSum = {};
  state.traces.forEach(t => {
    t.segments.forEach(seg => {
      ofSum[seg.of] = (ofSum[seg.of] || 0) + seg.len;
    });
  });

  const hasTraces = state.traces.length > 0;
  const hasObjects = Object.keys(catStats).length > 0;

  el.style.display = 'block';
  let html = '';
  if (hasObjects) {
    html += '<div class="title">Assets</div>';
    Object.values(catStats).forEach(s => {
      html += `<div class="row"><div class="sw" style="background:${s.color}"></div>${escapeHtml(s.displayIcon)} · ${escapeHtml(s.cat.name)} <b style="margin-left:auto;color:var(--navy)">×${s.count}</b></div>`;
    });
  }
  if (hasTraces) {
    if (hasObjects) html += '<hr>';
    html += '<div class="title">Kabelgräben (Oberfläche)</div>';
    Object.entries(OF_DEFS).forEach(([k, d]) => {
      const m = ofSum[k] || 0;
      if (m <= 0) return; // nicht genutzt = nicht anzeigen
      html += `<div class="row"><div class="sw line" style="background:${d.color};height:5px"></div>${k} ${d.label} <b style="margin-left:auto;color:var(--navy)">${m.toFixed(1)} m</b></div>`;
    });
  }
  if (!hasObjects && !hasTraces) {
    html += '<div style="font-size:10px;color:#999">Noch keine Objekte erfasst</div>';
  }
  html += '<button class="lgBtn" id="lgCatalogBtn">📋 Katalog öffnen</button>';
  el.innerHTML = html;
  L.DomEvent.disableClickPropagation(el);

  const btn = document.getElementById('lgCatalogBtn');
  if (btn) btn.onclick = () => document.getElementById('btnCatalog').click();
}

export function render(ctx) {
  renderPins(ctx);
  renderTraces(ctx);
  renderLegend(ctx.state);
  // Alle Link-Pfeile neu zeichnen wenn Toggle aktiv
  import('./links.js').then(m => m.renderAllLinks(ctx));
  ctx.updateTotal();
  ctx.save();
}
