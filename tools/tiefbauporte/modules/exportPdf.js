// v6/modules/exportPdf.js
// PDF-Export inklusive neuer Seiten pro Trasse mit voller Kabel-Belegung

import { calcTotals, totalLen, cableEffectiveLength, cableUnitPrice, cableRangeLength, formatSegRange, aggregateCableMaterials } from './calc.js';
import { showInfo, fmt, fmtEur, formatStamp, safeFilename } from './ui.js';
import { OF_DEFS, PRICE_GRABEN, PRICE_HAND } from './constants.js';

const NAVY = [27, 45, 94];
const GREEN = [120, 181, 26];
const DARK = [26, 26, 26];

// Map-Capture: rasterisiert Karte inklusive Pfeilen (wenn gewünscht)
async function captureMap(ctx, { keepView, withLinks }) {
  const { map } = ctx;
  const wasHw = ctx.state.viz.hw;
  const wasTr = ctx.state.viz.tr;
  const wasLinks = ctx.state.viz.links;
  ctx.state.viz.hw = true;
  ctx.state.viz.tr = true;
  if (withLinks) ctx.state.viz.links = true;
  ctx.render();

  if (!keepView) {
    const pts = [];
    ctx.state.objects.forEach(o => pts.push([o.lat, o.lng]));
    ctx.state.traces.forEach(t => t.points.forEach(p => pts.push(p)));
    if (pts.length > 0) {
      try { map.fitBounds(pts, { padding: [60, 60], maxZoom: 19, animate: false }); } catch (e) {}
    }
  }
  map.invalidateSize();
  await new Promise(r => setTimeout(r, 1500));

  const mapContainer = map.getContainer();
  const size = map.getSize();

  // Overlay-Elemente verstecken
  const hide = document.querySelectorAll('.searchbar, .searchres, .layerctl, .legend, .info, .fab, .sel-badge, .leaflet-control-zoom, .leaflet-control-attribution');
  hide.forEach(el => el.style.visibility = 'hidden');

  // SVG-Overlay-Pane verstecken (wir zeichnen Trassen manuell auf Canvas)
  const overlayPane = mapContainer.querySelector('.leaflet-overlay-pane');
  const oldVis = overlayPane ? overlayPane.style.visibility : '';
  if (overlayPane) overlayPane.style.visibility = 'hidden';

  let result = null;
  try {
    const canvas = await html2canvas(mapContainer, {
      useCORS: true, allowTaint: true, backgroundColor: '#fff', logging: false,
      scale: 1.5, width: size.x, height: size.y,
      windowWidth: size.x, windowHeight: size.y, x: 0, y: 0
    });
    drawTracesOnCanvas(canvas, ctx, withLinks);
    result = { dataUrl: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height };
  } catch (e) {
    console.warn('Map capture failed:', e);
  } finally {
    hide.forEach(el => el.style.visibility = '');
    if (overlayPane) overlayPane.style.visibility = oldVis;
    ctx.state.viz.hw = wasHw;
    ctx.state.viz.tr = wasTr;
    ctx.state.viz.links = wasLinks;
    ctx.render();
  }
  return result;
}

function drawTracesOnCanvas(canvas, ctx, withLinks) {
  if (ctx.state.traces.length === 0 && (!withLinks || ctx.state.objects.length === 0)) return;
  const { map } = ctx;
  const size = map.getSize();
  const sx = canvas.width / size.x;
  const sy = canvas.height / size.y;
  const c = canvas.getContext('2d');

  // Trassen zeichnen
  c.save();
  c.lineWidth = 9 * sx;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 4 * sx;
  c.shadowOffsetY = 1 * sx;

  ctx.state.traces.forEach(t => {
    for (let i = 0; i < t.segments.length; i++) {
      const seg = t.segments[i];
      const col = OF_DEFS[seg.of]?.color || '#D32F2F';
      const a = map.latLngToContainerPoint(L.latLng(t.points[i][0], t.points[i][1]));
      const b = map.latLngToContainerPoint(L.latLng(t.points[i+1][0], t.points[i+1][1]));
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(a.x * sx, a.y * sy);
      c.lineTo(b.x * sx, b.y * sy);
      c.stroke();
    }
  });

  // Vertex-Punkte ohne Schatten
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  ctx.state.traces.forEach(t => {
    t.points.forEach((pt, i) => {
      const col = i < t.segments.length
        ? (OF_DEFS[t.segments[i].of]?.color || '#D32F2F')
        : (i > 0 ? OF_DEFS[t.segments[i-1].of]?.color || '#D32F2F' : '#D32F2F');
      const p = map.latLngToContainerPoint(L.latLng(pt[0], pt[1]));
      c.beginPath();
      c.fillStyle = '#fff';
      c.arc(p.x * sx, p.y * sy, 6 * sx, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = col;
      c.beginPath();
      c.arc(p.x * sx, p.y * sy, 4 * sx, 0, Math.PI * 2);
      c.fill();
    });
  });
  c.restore();

  // Asset-Pfeile zur Trasse (wenn withLinks)
  if (withLinks) {
    c.save();
    c.strokeStyle = '#F57C00';
    c.lineWidth = 2.5 * sx;
    c.setLineDash([8 * sx, 5 * sx]);
    ctx.state.objects.forEach(o => {
      if (!o.linkedTraceId) return;
      const t = ctx.state.traces.find(x => x.id === o.linkedTraceId);
      if (!t) return;
      let target = null;
      if (o.linkedSegmentIdx != null && t.segments[o.linkedSegmentIdx]) {
        const a = t.points[o.linkedSegmentIdx];
        const b = t.points[o.linkedSegmentIdx + 1];
        if (a && b) target = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      } else {
        let best = null;
        let bestD = Infinity;
        t.points.forEach(p => {
          const dL = p[0] - o.lat, dG = p[1] - o.lng;
          const d = dL * dL + dG * dG;
          if (d < bestD) { bestD = d; best = p; }
        });
        target = best;
      }
      if (!target) return;
      const from = map.latLngToContainerPoint(L.latLng(o.lat, o.lng));
      const to = map.latLngToContainerPoint(L.latLng(target[0], target[1]));
      c.beginPath();
      c.moveTo(from.x * sx, from.y * sy);
      c.lineTo(to.x * sx, to.y * sy);
      c.stroke();
      // Pfeilspitze
      c.save();
      c.setLineDash([]);
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const ah = 10 * sx;
      c.fillStyle = '#F57C00';
      c.beginPath();
      c.moveTo(to.x * sx, to.y * sy);
      c.lineTo(to.x * sx - ah * Math.cos(angle - Math.PI / 6), to.y * sy - ah * Math.sin(angle - Math.PI / 6));
      c.lineTo(to.x * sx - ah * Math.cos(angle + Math.PI / 6), to.y * sy - ah * Math.sin(angle + Math.PI / 6));
      c.closePath();
      c.fill();
      c.restore();
    });
    c.restore();
  }
}

function drawHeader(doc, title) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 297, 18, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(0, 18, 297, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('TiefbauPorte · Vor-Ort-Check', 14, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Union E GmbH · Die HPM Mobilmacher', 14, 16);
  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, 283, 11, { align: 'right' });
  }
}

function drawFooter(doc) {
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Union E GmbH · Vinckeweg 15 · 47119 Duisburg · Tel. 0203/996 26 0 · info@union-e.de', 14, 204);
}

export async function doExportPDF(ctx, options = {}) {
  const withTracePages = options.withTracePages !== false;
  const keepView = options.keepView || false;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const t = calcTotals(ctx.state);
  const W = 297, H = 210, ML = 14, MR = 14;
  const CW = W - ML - MR;
  const state = ctx.state;

  // ===== Seite 1: Deckblatt =====
  drawHeader(doc, 'Deckblatt');
  doc.setTextColor(...DARK);
  let y = 26;
  const leftX = ML;
  const rightX = W / 2 + 5;
  const colW = (W - ML - MR - 10) / 2;

  doc.setFillColor(...GREEN);
  doc.rect(leftX, y, colW, 6, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Projektdaten', leftX + 2, y + 4.3);
  y += 10;
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = [
    ['WE-Nummer:', state.meta.we || '-'],
    ['Liegenschaft:', state.meta.loc || '-'],
    ['Datum:', state.meta.date || '-'],
    ['Ersteller:', state.meta.author || '-']
  ];
  if (state.meta.konta || state.meta.denk) {
    const f = [];
    if (state.meta.konta) f.push(`Konta +${state.meta.kontaPct}%`);
    if (state.meta.denk) f.push(`Denkmal +${state.meta.denkPct}%`);
    lines.push(['Standort:', f.join(' · ')]);
  }
  lines.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(k, leftX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(v), leftX + 32, y);
    y += 5;
  });
  if (state.meta.note) {
    y += 1;
    doc.setFont('helvetica', 'bold');
    doc.text('Bemerkung:', leftX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const nl = doc.splitTextToSize(state.meta.note, colW - 4);
    doc.text(nl, leftX, y);
    y += nl.length * 4.5;
  }

  // Gesamt-Box rechts
  let ry = 26 + 10;
  doc.setFillColor(...NAVY);
  doc.rect(rightX, 26, colW, H - 40, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(rightX, 26, colW, 6, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Kalkulation Gesamt', rightX + 2, 30.3);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  ry += 4;
  const kl = [['Σ Hardware', fmtEur(t.sumObj)], ['Σ Tiefbau', fmtEur(t.sumTrace)]];
  if (t.surchargeKonta > 0) kl.push(['+ Kontamination ' + state.meta.kontaPct + '%', fmtEur(t.surchargeKonta)]);
  if (t.surchargeDenk > 0) kl.push(['+ Denkmalschutz ' + state.meta.denkPct + '%', fmtEur(t.surchargeDenk)]);
  kl.push(['Netto', fmtEur(t.netto)]);
  if (state.meta.gk > 0) kl.push(['+ GK ' + state.meta.gk + '%', fmtEur(t.gk)]);
  if (state.meta.wg > 0) kl.push(['+ W+G ' + state.meta.wg + '%', fmtEur(t.wg)]);
  kl.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.text(k, rightX + 3, ry);
    doc.setFont('helvetica', 'bold');
    doc.text(v, rightX + colW - 3, ry, { align: 'right' });
    ry += 6;
  });
  ry += 3;
  doc.setFillColor(...GREEN);
  doc.rect(rightX + 2, ry - 4, colW - 4, 10, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('GESAMT', rightX + 4, ry + 2.5);
  doc.text(fmtEur(t.total), rightX + colW - 4, ry + 2.5, { align: 'right' });

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let statY = H - 30;
  doc.setFont('helvetica', 'bold');
  doc.text('Erfassung:', leftX, statY);
  statY += 5;
  doc.setFont('helvetica', 'normal');
  const totalM = state.traces.reduce((s, tr) => s + totalLen(tr), 0);
  doc.text(`${state.objects.length} Hardware · ${state.traces.length} Trassen · ${totalM.toFixed(1)} m`, leftX, statY);
  drawFooter(doc);

  // ===== Seite 2: Karte mit Verbindungen =====
  showInfo('PDF: Karte wird aufgenommen...');
  const cap = await captureMap(ctx, { keepView, withLinks: true });
  doc.addPage();
  drawHeader(doc, 'Karten-Auszug');
  if (cap) {
    const maxW = CW, maxH = H - 30;
    const srcA = cap.width / cap.height, boxA = maxW / maxH;
    let imgW, imgH;
    if (srcA > boxA) { imgW = maxW; imgH = maxW / srcA; }
    else { imgH = maxH; imgW = maxH * srcA; }
    const imgX = ML + (maxW - imgW) / 2;
    const imgY = 24 + (maxH - imgH) / 2;
    try {
      doc.addImage(cap.dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.3);
      doc.rect(imgX, imgY, imgW, imgH);
      doc.setTextColor(...NAVY);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(`${state.meta.loc || 'Liegenschaft'} · ${state.objects.length} Objekte · ${state.traces.length} Trassen`, W / 2, H - 8, { align: 'center' });
    } catch (e) {
      doc.text('Karten-Screenshot fehlgeschlagen', W / 2, H / 2, { align: 'center' });
    }
  } else {
    doc.setTextColor(...DARK);
    doc.setFontSize(11);
    doc.text('Karte konnte nicht aufgenommen werden', W / 2, H / 2, { align: 'center' });
  }
  drawFooter(doc);

  // ===== Hardware Details (pro Kategorie) =====
  if (state.objects.length > 0) {
    doc.addPage();
    drawHeader(doc, 'Asset-Aufschlüsselung · Hardware');
    const order = ['Ladeinfrastruktur', 'Verteilung', 'Netzanschluss', 'Ausstattung', 'Erdung', 'Durchbruch', 'Sonstiges'];
    const byCat = {};
    state.objects.forEach((o, idx) => {
      const c = state.catalog.find(x => x.id === o.catId) || {};
      (byCat[c.category || 'Sonstiges'] = byCat[c.category || 'Sonstiges'] || []).push({ o, c, idx: idx + 1 });
    });
    let ay = 25;
    order.filter(k => byCat[k]).forEach(cat => {
      if (ay > H - 30) { doc.addPage(); drawHeader(doc, 'Hardware (Forts.)'); ay = 25; }
      doc.setFillColor(...GREEN);
      doc.rect(ML, ay, CW, 6, 'F');
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(cat, ML + 2, ay + 4.2);
      ay += 8;
      const rows = byCat[cat].map(it => {
        const suf = [it.o.amps ? it.o.amps + 'A' : '', it.o.kw ? it.o.kw + 'kW' : ''].filter(Boolean).join(' · ');
        const baseName = (it.c.name || '') + (suf ? ' · ' + suf : '');
        const custom = it.o.customName ? it.o.customName : '—';
        // Verknüpfung
        let linked = '—';
        if (it.o.linkedTraceId) {
          const tr = state.traces.find(x => x.id === it.o.linkedTraceId);
          if (tr) {
            const trIdx = state.traces.indexOf(tr) + 1;
            linked = it.o.linkedSegmentIdx != null ? `Tr${trIdx}·S${it.o.linkedSegmentIdx + 1}` : `Tr${trIdx}·Auto`;
          }
        }
        return [
          '#' + it.idx,
          it.c.icon || '',
          baseName,
          custom,
          it.c.pos || '',
          it.o.qty + ' ' + (it.c.unit || ''),
          fmt(it.o.price),
          fmt(it.o.qty * it.o.price),
          linked,
          `${it.o.lat.toFixed(6)}, ${it.o.lng.toFixed(6)}`,
          it.o.note || '',
          (it.o.photos && it.o.photos.length) ? `📷${it.o.photos.length}` : ''
        ];
      });
      doc.autoTable({
        startY: ay,
        head: [['#', 'Typ', 'Bezeichnung', 'Eigener Name', 'LV', 'Menge', 'EP', 'Summe', 'Verknüpft', 'GPS', 'Notiz', 'Foto']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 7, cellPadding: 1.5 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 9, halign: 'center' },
          1: { cellWidth: 12, fontStyle: 'bold', halign: 'center' },
          2: { cellWidth: 48 },
          3: { cellWidth: 36, fontStyle: 'bold' },
          4: { cellWidth: 11, halign: 'center' },
          5: { cellWidth: 15, halign: 'right' },
          6: { cellWidth: 17, halign: 'right' },
          7: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
          8: { cellWidth: 22, halign: 'center', fontSize: 7 },
          9: { cellWidth: 30, fontSize: 6 },
          10: { cellWidth: 36, fontSize: 6 },
          11: { cellWidth: 13, halign: 'center' }
        },
        margin: { left: ML, right: MR }
      });
      ay = doc.lastAutoTable.finalY + 5;
    });
    drawFooter(doc);
  }

  // ===== Trassen-Übersicht =====
  if (state.traces.length > 0) {
    doc.addPage();
    drawHeader(doc, 'Trassen-Übersicht');
    const rows = t.traceRows.map((r, i) => {
      const ofText = Object.entries(r.ofBreak).map(([k, v]) => `${k}:${fmt(v)}m`).join(', ');
      const cables = r.cableBreak.map(c => `${c.count}× ${c.label}`).join('\n') || '—';
      const tr = state.traces.find(x => x.id === r.id);
      const start = tr.points[0];
      const end = tr.points[tr.points.length - 1];
      return [
        '#' + (i + 1),
        fmt(r.len) + ' m',
        ofText,
        cables,
        fmt(r.total),
        `${start[0].toFixed(5)},${start[1].toFixed(5)} →\n${end[0].toFixed(5)},${end[1].toFixed(5)}`,
        r.note || ''
      ];
    });
    doc.autoTable({
      startY: 25,
      head: [['#', 'Länge', 'OF-Aufteilung', 'Kabel-Belegung', 'Summe (€)', 'GPS Start → Ende', 'Notiz']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 2, valign: 'top' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
        2: { cellWidth: 32, fontSize: 7 },
        3: { cellWidth: 62, fontSize: 7 },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 48, fontSize: 6 },
        6: { cellWidth: 55, fontSize: 7 }
      },
      margin: { left: ML, right: MR }
    });
    drawFooter(doc);
  }

  // ===== NEU: Kabel-Belegungsseiten je Trasse =====
  if (withTracePages && state.traces.length > 0) {
    state.traces.forEach((tr, ti) => {
      const row = t.traceRows.find(r => r.id === tr.id);
      if (!row) return;

      doc.addPage();
      drawHeader(doc, `Trasse #${ti + 1} · Kabel-Belegung`);

      // Stammdaten + Verknüpfungen nebeneinander
      let boxY = 25;
      doc.setFillColor(...GREEN);
      doc.rect(ML, boxY, CW, 6, 'F');
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Trassen-Stammdaten', ML + 2, boxY + 4.2);
      boxY += 8;

      const colLeft = ML;
      const colRight = W / 2 + 3;
      const colW2 = (W - ML - MR - 6) / 2;
      const stamm = [
        ['Länge gesamt', fmt(row.len) + ' m'],
        ['Punkte', String(tr.points.length)],
        ['Segmente', String(tr.segments.length)],
        ['OF-Aufteilung', Object.entries(row.ofBreak).map(([k, v]) => `${k}:${fmt(v)}m`).join(' · ')],
        ['GPS Start', `${tr.points[0][0].toFixed(6)}, ${tr.points[0][1].toFixed(6)}`],
        ['GPS Ende', `${tr.points[tr.points.length-1][0].toFixed(6)}, ${tr.points[tr.points.length-1][1].toFixed(6)}`]
      ];
      doc.setTextColor(...DARK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let sy = boxY;
      stamm.forEach(([k, v]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(k + ':', colLeft, sy);
        doc.setFont('helvetica', 'normal');
        doc.text(String(v), colLeft + 28, sy, { maxWidth: colW2 - 28 });
        sy += 5;
      });

      // Verknüpfte Assets rechts
      const linked = state.objects.filter(o => o.linkedTraceId === tr.id);
      let ry = boxY;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...NAVY);
      doc.text(`Verknüpfte Assets (${linked.length})`, colRight, ry);
      ry += 5;
      doc.setTextColor(...DARK);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      if (linked.length === 0) {
        doc.text('— keine Assets verknüpft —', colRight, ry);
      } else {
        linked.forEach(o => {
          if (ry > boxY + 30) return; // Safety
          const cat = state.catalog.find(c => c.id === o.catId);
          const icon = cat ? (cat.defaultEmoji || cat.icon) : '?';
          const name = o.customName || cat?.name || 'Unbekannt';
          const segInfo = o.linkedSegmentIdx != null ? ` · Seg ${o.linkedSegmentIdx + 1}` : '';
          doc.text(`${icon}  ${name}${segInfo}`, colRight, ry);
          ry += 4;
        });
      }

      let tableY = Math.max(sy, ry) + 4;

      // Segment-Aufschlüsselung
      doc.setFillColor(...GREEN);
      doc.rect(ML, tableY, CW, 6, 'F');
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Segment-Aufschlüsselung (Tiefbau)', ML + 2, tableY + 4.2);
      tableY += 8;

      const segRows = tr.segments.map((seg, i) => {
        const def = OF_DEFS[seg.of];
        const gr = (seg.hand ? PRICE_HAND : PRICE_GRABEN);
        const sumSeg = seg.len * ((def?.prOF || 0) + (def?.prWH || 0) + gr);
        return [
          String(i + 1),
          seg.of + ' · ' + (def?.label || ''),
          fmt(seg.len) + ' m',
          seg.hand ? '✓' : '—',
          fmt(def?.prOF || 0),
          fmt(def?.prWH || 0),
          fmt(gr),
          fmt(sumSeg)
        ];
      });
      segRows.push(['', '', '', '', '', '', 'Σ Tiefbau', fmt(row.tOF + row.tWH + row.tGR)]);
      doc.autoTable({
        startY: tableY,
        head: [['#', 'Oberfläche', 'Länge', 'Hand', 'Aufn./m', 'WH/m', 'Graben/m', 'Summe €']],
        body: segRows,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 55 },
          2: { cellWidth: 22, halign: 'right' },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 24, halign: 'right' },
          7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: ML, right: MR }
      });
      tableY = doc.lastAutoTable.finalY + 5;

      // Kabel-Belegung
      doc.setFillColor(...GREEN);
      doc.rect(ML, tableY, CW, 6, 'F');
      doc.setTextColor(...NAVY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Kabel-Belegung · vollständig', ML + 2, tableY + 4.2);
      tableY += 8;

      const cableRows = row.cableBreak.map(c => {
        const ct = state.cableTypes.find(x => x.id === c.typeId);
        const isCustom = ct && !ct.builtin;
        const reserveStr = c.reserveMode === 'm' ? `${c.reserveValue} m` : `${c.reserveValue} %`;
        return [
          ct?.lvPos || '—',
          c.label + (isCustom ? ' · Eigen' : ''),
          formatSegRange(c.segIds || []),
          c.count + '×',
          reserveStr,
          fmt(c.baseLen) + ' m',
          fmt(c.effLen) + ' m',
          fmt(c.cableMeters) + ' m',
          fmt(c.unitPrice) + (c.priceOverride != null ? ' *' : ''),
          fmt(c.cost)
        ];
      });
      if (cableRows.length > 0) {
        cableRows.push(['', '', '', '', '', '', '', fmt(row.tCableMeters) + ' m', 'Σ Kabel', fmt(row.tC)]);
      } else {
        cableRows.push(['', 'Keine Leitungen erfasst', '', '', '', '', '', '', '', '0,00']);
      }
      doc.autoTable({
        startY: tableY,
        head: [['LV', 'Leitungstyp', 'Bereich', 'Anzahl', 'Reserve', 'Bereich-L.', 'Eff. L. /Stk', 'Gesamt m', '€/m', 'Summe €']],
        body: cableRows,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center' },
          1: { cellWidth: 60 },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 26, halign: 'right' },
          5: { cellWidth: 26, halign: 'right' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: ML, right: MR }
      });
      tableY = doc.lastAutoTable.finalY + 3;
      if (row.cableBreak.some(c => c.priceOverride != null)) {
        doc.setFontSize(7);
        doc.setTextColor(...DARK);
        doc.text('* = Preis-Override aus dem Katalog', ML, tableY + 3);
      }
      tableY += 6;

      // Trassen-Gesamt
      if (tableY < H - 30) {
        doc.setFillColor(...NAVY);
        doc.rect(W - MR - 60, tableY, 60, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Σ Trasse #${ti + 1}:`, W - MR - 57, tableY + 5.5);
        doc.text(fmtEur(row.total), W - MR - 3, tableY + 5.5, { align: 'right' });
      }

      if (tr.note) {
        doc.setTextColor(...DARK);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.text('Notiz: ' + tr.note, ML, H - 14, { maxWidth: CW });
      }
      drawFooter(doc);
    });
  }

  // ===== v6.4: Kabel-Bestellliste (aggregiert über alle Trassen) =====
  const bom = aggregateCableMaterials(state);
  if (bom.length > 0) {
    doc.addPage();
    drawHeader(doc, 'Kabel-Bestellliste (Σ pro Typ über alle Trassen)');
    let bomTotalM = 0, bomTotalCount = 0, bomTotalCost = 0;
    const bomBody = bom.map(b => {
      const ct = state.cableTypes.find(x => x.id === b.typeId);
      bomTotalM += b.totalMeters;
      bomTotalCount += b.totalCount;
      bomTotalCost += b.totalCost;
      return [
        b.label,
        ct?.lvPos || '',
        b.isOverride ? 'Override' : 'Snapshot',
        String(b.totalCount),
        fmt(b.totalMeters) + ' m',
        fmt(b.unitPrice) + ' €/m',
        fmtEur(b.totalCost),
        String(b.occurrences.length)
      ];
    });
    bomBody.push([
      'Σ', '', '',
      String(bomTotalCount),
      fmt(bomTotalM) + ' m',
      '', fmtEur(bomTotalCost), ''
    ]);
    doc.autoTable({
      startY: 26,
      head: [['Kabeltyp', 'LV-Pos', 'EP-Modus', 'Σ Stück', 'Σ Bestellmeter', 'EP', 'Σ Kosten', '# Vorkommen']],
      body: bomBody,
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      footStyles: { fillColor: [240, 245, 230], textColor: NAVY, fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: ML, right: MR },
      didParseCell: (d) => {
        if (d.row.index === bomBody.length - 1) {
          d.cell.styles.fillColor = [240, 245, 230];
          d.cell.styles.fontStyle = 'bold';
          d.cell.styles.textColor = NAVY;
        }
      }
    });
    drawFooter(doc);
  }

  // ===== Fotos =====
  const allPhotos = [];
  state.objects.forEach((o, idx) => {
    const c = state.catalog.find(x => x.id === o.catId);
    (o.photos || []).forEach(p => {
      const label = (o.customName || c?.name || '') + (o.note ? ' · ' + o.note : '');
      allPhotos.push({ label: `#${idx + 1} ${label}`.substring(0, 60), data: p });
    });
  });
  state.traces.forEach((tr, i) => {
    (tr.photos || []).forEach(p => allPhotos.push({ label: `Trasse #${i + 1}${tr.note ? ' · ' + tr.note : ''}`.substring(0, 60), data: p }));
  });
  if (allPhotos.length > 0) {
    doc.addPage();
    drawHeader(doc, 'Fotodokumentation');
    const photoW = 85, photoH = 64, gap = 8;
    const startX = ML + 5, startY = 26, cols = 3;
    let px = startX, py = startY, col = 0;
    allPhotos.forEach(p => {
      if (py + photoH + 10 > H - 10) {
        doc.addPage();
        drawHeader(doc, 'Fotodokumentation (Forts.)');
        px = startX; py = startY; col = 0;
      }
      try {
        doc.addImage(p.data, 'JPEG', px, py, photoW, photoH);
        doc.setDrawColor(...NAVY);
        doc.setLineWidth(0.2);
        doc.rect(px, py, photoW, photoH);
        doc.setTextColor(...NAVY);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(p.label, px, py + photoH + 4, { maxWidth: photoW });
      } catch (e) {}
      col++;
      if (col >= cols) { col = 0; px = startX; py += photoH + gap + 6; }
      else { px += photoW + gap; }
    });
    drawFooter(doc);
  }

  // Seitenzahlen
  const pc = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pc; i++) {
    doc.setPage(i);
    doc.setTextColor(...NAVY);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Seite ${i}/${pc}`, 283, 204, { align: 'right' });
  }
  doc.save(`UnionE_VorOrtCheck_${safeFilename(state.meta.we) || 'WE'}_${formatStamp()}.pdf`);
  showInfo('PDF fertig ✓');
}
