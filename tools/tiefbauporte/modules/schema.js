// schema.js — Generiert Schemata (SVG) aus dem aktuellen State.
//
// DIN A4 Querformat: 1123 × 794 px (96 dpi, 297 × 210 mm).
// Inhalt wird in einem inneren "stage" gezeichnet und per <g transform="scale()">
// auf die Seite eingepasst, sodass das Schema immer auf eine Seite passt.
//
// Zwei Schema-Typen:
//   1) Energieschema  — Quelle → Verteiler → Verbraucher (Stromkabel)
//   2) Logisches Netzwerkschema — alle Daten-Beziehungen zwischen NWS, Trafo/Schränken,
//      Verbrauchern (LN2/LS2/WA2/WI2) — egal von wo eingespeist.

import { state } from './state.js';
import { computeChainSegments } from './links.js';
import { MAST_PNG, CHARGER_PNG } from './schemaIcons.js';

// ---- Farben ----
const C_LINE_E = '#00B0F0';
const C_LINE_N = '#7030A0';
const C_RED    = '#FF0000';
const C_AMBER  = '#FFC000';
const C_KVS    = '#5A6A7A';
const C_INK    = '#1A1A1A';
const C_INK_2  = '#555555';

// ---- A4 Querformat ----
const PAGE_W = 1123;
const PAGE_H = 794;
const PAGE_PAD = 28;
const HEADER_H = 70;

// ---- Hilfen ----
function escapeXml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function catOf(o){ return state.catalog.find(x => x.id === o.catId); }
function isSource(o){
  const c = catOf(o);
  return !!(c && c.cat === 'Netzanschluss');
}
function isDistributor(o){
  const c = catOf(o);
  if (!c || c.cat !== 'Verteilung') return false;
  return c.id !== 'nws';
}
function isNws(o){
  const c = catOf(o);
  return !!(c && c.id === 'nws');
}
function isConsumer(o){
  const c = catOf(o);
  return !!(c && c.cat === 'Ladeinfrastruktur');
}

function isPowerCable(cableType){
  if (!cableType) return false;
  if (['k1','k2','k3','k4'].includes(cableType.id)) return true;
  const lbl = String(cableType.label||'').toLowerCase();
  if (lbl.includes('strom') || lbl.includes('kw') || lbl.includes('nayy') || lbl.includes('mm²')) {
    if (lbl.includes('daten') || lbl.includes('leerrohr') || lbl.includes('erdung') ||
        lbl.includes('flachband') || lbl.includes('runderder')) return false;
    return true;
  }
  return false;
}
function isDataCable(cableType){
  if (!cableType) return false;
  if (cableType.id === 'd') return true;
  const lbl = String(cableType.label||'').toLowerCase();
  return lbl.includes('daten');
}

function supplyLengthMeters(supply, sourceObj, consumerObj, filter = 'power'){
  if (!supply || !Array.isArray(supply.traceIds) || !supply.traceIds.length) return 0;
  const ct = state.cableTypes.find(c => c.id === supply.cableTypeId);
  if (filter === 'power' && !isPowerCable(ct)) return 0;
  if (filter === 'data'  && !isDataCable(ct))  return 0;
  const segMap = computeChainSegments(supply.traceIds, sourceObj, consumerObj);
  let total = 0;
  supply.traceIds.forEach(tid => {
    const t = state.traces.find(x => x.id === tid);
    if (!t) return;
    const segIds = segMap.get(tid) || [];
    segIds.forEach(i => { total += (t.segments?.[i]?.len || 0); });
  });
  return total;
}

function crossSectionLabel(cableType){
  if (!cableType) return '';
  if (cableType.crossSection) return cableType.crossSection;
  return cableType.label || '';
}

function consumerKw(o){
  const c = catOf(o);
  if (!c?.kw) return '';
  const kw = Number(o.kw)||0;
  const n = Number(o.kwCount)||1;
  if (!kw) return '';
  return n > 1 ? `${n} × ${kw} kW` : `${kw} kW`;
}

function distributorAmps(o){
  const a = Number(o.ampere)||0;
  return a ? `${a} A` : '';
}

function consumerLabel(o, ordinalByCat){
  const c = catOf(o);
  const tag = c?.icon || 'C';
  const idx = Number(o.seqNo)||0 || ordinalByCat.get(o.id);
  return tag + (idx ? '/' + idx : '');
}

function powerSupplyFrom(obj, sourceId){
  return (obj.supplies||[]).find(s => {
    if (s.sourceId !== sourceId) return false;
    const ct = state.cableTypes.find(c => c.id === s.cableTypeId);
    return isPowerCable(ct);
  });
}

function dataSupplyFrom(obj, sourceId){
  return (obj.supplies||[]).find(s => {
    if (s.sourceId !== sourceId) return false;
    const ct = state.cableTypes.find(c => c.id === s.cableTypeId);
    return isDataCable(ct);
  });
}

// =====================================================================
// PAGE WRAPPER — fügt Header und das Stage-SVG mit auto-skalierter Bühne
// in eine A4-Querformat-Seite.
// =====================================================================
function wrapInPage(opts){
  const { stageW, stageH, stageContent, kindLabel, title, projName } = opts;
  const innerW = PAGE_W - 2*PAGE_PAD;
  const innerH = PAGE_H - 2*PAGE_PAD - HEADER_H;
  const scale = Math.min(innerW / stageW, innerH / stageH, 1);
  const stageRenderW = stageW * scale;
  const stageRenderH = stageH * scale;
  const stageX = PAGE_PAD + (innerW - stageRenderW) / 2;
  const stageY = PAGE_PAD + HEADER_H + (innerH - stageRenderH) / 2;

  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
       + `viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}" `
       + `font-family="EON Brix Sans, Helvetica, Arial, sans-serif">\n`;
  svg += `<rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>\n`;
  // Header
  svg += `<text x="${PAGE_PAD}" y="${PAGE_PAD + 28}" font-size="20" font-weight="700" fill="${C_INK}" text-decoration="underline">${escapeXml(kindLabel)}</text>\n`;
  svg += `<text x="${PAGE_PAD}" y="${PAGE_PAD + 56}" font-size="20" fill="${C_AMBER}">${escapeXml(title)} `
       + `<tspan font-style="italic" text-decoration="underline">${escapeXml(projName)}</tspan></text>\n`;
  // Stage
  svg += `<g transform="translate(${stageX} ${stageY}) scale(${scale})">\n${stageContent}\n</g>\n`;
  svg += `</svg>`;
  return svg;
}

// =====================================================================
// ENERGIESCHEMA — Eine Seite pro "Strang":
//   • Pro Quelle (Trafo/HAK) wird ein Strang für Direkteinspeisungen erzeugt
//     (falls Verbraucher direkt von der Quelle gespeist werden), und je
//     ein Strang pro nachgelagertem KVS.
//   • Innerhalb eines Stranges bekommen alle Verbraucher-Leitungen
//     gestaffelte vertikale Spuren (X-Versatz), damit sie nicht alle
//     auf derselben Linie aus dem KVS herauskommen.
// =====================================================================

// Liefert die Liste aller Stränge eines Source-Knotens.
// Jedes Strang-Objekt: {kind:'direct'|'dist', source, distributor?, consumers}
function buildSourceStrands(sourceObj){
  const directConsumers = state.objects
    .filter(o => isConsumer(o) && powerSupplyFrom(o, sourceObj.id));
  const distributors = state.objects
    .filter(o => isDistributor(o) && powerSupplyFrom(o, sourceObj.id));
  const strands = [];
  if (directConsumers.length){
    strands.push({ kind:'direct', source: sourceObj, consumers: directConsumers });
  }
  distributors.forEach(d => {
    const consumers = state.objects.filter(o => isConsumer(o) && powerSupplyFrom(o, d.id));
    strands.push({ kind:'dist', source: sourceObj, distributor: d, consumers });
  });
  return strands;
}

// Globale Nummerierung über alle Verbraucher (kategoriebasiert) — damit
// Nummern in zusammengehörigen Schemata einheitlich bleiben.
function buildGlobalConsumerOrdinal(){
  const ord = new Map();
  const counters = new Map();
  state.objects
    .filter(o => isConsumer(o))
    .forEach(o => {
      const seq = Number(o.seqNo)||0;
      if (seq){ ord.set(o.id, seq); }
    });
  state.objects.filter(isConsumer).forEach(o => {
    if (ord.has(o.id)) return;
    const c = catOf(o);
    const k = c?.icon || c?.id || '';
    const next = (counters.get(k)||0) + 1;
    counters.set(k, next);
    ord.set(o.id, next);
  });
  return ord;
}

// Render eines einzelnen Stranges als komplette A4-Seite.
function buildEnergySchemaForStrand(strand, opts = {}){
  const projName  = opts.locationName || state.meta?.name || 'Standort';
  const ordinalByCat = opts.ordinalByCat || buildGlobalConsumerOrdinal();
  const sourceObj = strand.source;
  const srcCat    = catOf(sourceObj);

  if (!strand.consumers.length && strand.kind === 'direct') return null;

  // ---- Geometrie ----
  const ROW_H     = 100;
  const COL_SRC_X = 170;
  const KVS_W     = 110;
  const KVS_H     = 70;
  const CHG_W     = 70;
  const CHG_H     = 70;
  // Spalte für Verbraucher rechts; davor liegen die "Spuren" (vertical lanes).
  const COL_CHG_X = 1170;

  // Stage-Höhe an Verbraucher-Anzahl koppeln
  const rows = Math.max(strand.consumers.length, 1);
  const stageH = Math.max(rows * ROW_H + 80, 360);
  const stageW = 1340;

  // Vertikale Mitte der Quelle (Mast)
  const stageContentTop = 40;
  const blockH = rows * ROW_H;
  const srcCenterY = stageContentTop + blockH / 2;
  const mastH = 200;
  const mastW = 156;
  const mastX = COL_SRC_X - mastW/2 + 6;
  const mastY = srcCenterY - mastH/2;
  const srcRightX = mastX + mastW;
  const srcExitSpan = Math.max(0, mastH * 0.45); // wie weit die Austritte am Mast verteilt werden

  let s = '';
  // Quelle (Mast + Beschriftung)
  s += `<image href="${MAST_PNG}" x="${mastX}" y="${mastY}" width="${mastW}" height="${mastH}"/>\n`;
  s += `<text x="${COL_SRC_X}" y="${mastY - 30}" text-anchor="middle" font-size="14" fill="${C_INK}">Netzanschluss</text>\n`;
  s += `<text x="${COL_SRC_X}" y="${mastY - 12}" text-anchor="middle" font-size="13" font-style="italic" fill="${C_AMBER}">${escapeXml(srcCat?.name || '')}</text>\n`;
  const isMS = srcCat?.id === 'trafo';
  s += `<text x="${COL_SRC_X}" y="${mastY + mastH + 26}" text-anchor="middle" font-size="14" font-weight="600" fill="${C_RED}">Anschluss ${isMS ? 'Mittelspannung' : 'Niederspannung'}</text>\n`;

  // Verbraucher rendern + Pfade berechnen
  // Jede Verbraucher-Leitung bekommt eine eigene vertikale Spur (X-Position),
  // sodass die Leitungen gestaffelt aus dem Speisepunkt heraustreten.
  const consumers = strand.consumers;
  const consumerYs = consumers.map((_, i) => stageContentTop + i*ROW_H + ROW_H/2);

  // Speisepunkt-Geometrie:
  //  - direct:  Leitungen treten entlang der rechten Mastkante an EIGENEN
  //             Y-Positionen aus (verteilt um srcCenterY).
  //  - dist:    Leitungen treten entlang der rechten KVS-Kante aus —
  //             jede Leitung hat einen eigenen Austrittspunkt.
  let feedX, feedCenterY, feedKind;
  let exitSpan; // Höhe, über die die Austritte verteilt werden

  if (strand.kind === 'direct'){
    feedKind = 'mast';
    feedX = srcRightX;
    feedCenterY = srcCenterY;
    exitSpan = srcExitSpan;
  } else {
    feedKind = 'kvs';
    const distCY = srcCenterY;
    const COL_KVS_X = 660;
    const kvsTop = distCY - KVS_H/2;
    feedX = COL_KVS_X + KVS_W;
    feedCenterY = distCY;
    exitSpan = KVS_H - 14; // mit Innenabstand

    // KVS-Box
    const dist = strand.distributor;
    const distCat = catOf(dist);
    s += `<rect x="${COL_KVS_X}" y="${kvsTop}" width="${KVS_W}" height="${KVS_H}" rx="4" fill="${C_KVS}"/>\n`;
    s += `<text x="${COL_KVS_X + KVS_W/2}" y="${kvsTop + 28}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${escapeXml(distCat?.icon || 'KVS')}</text>\n`;
    const ampLbl = distributorAmps(dist);
    if (ampLbl){
      s += `<text x="${COL_KVS_X + KVS_W/2}" y="${kvsTop + 50}" text-anchor="middle" font-size="13" fill="#fff">${escapeXml(ampLbl)}</text>\n`;
    }

    // Quelle → KVS (in KVS-Mitte einspeisend)
    const distSupply = powerSupplyFrom(dist, sourceObj.id);
    const distCt = distSupply ? state.cableTypes.find(c => c.id === distSupply.cableTypeId) : null;
    const midX = (srcRightX + COL_KVS_X) / 2;
    s += `<polyline points="${srcRightX},${srcCenterY} ${COL_KVS_X},${srcCenterY}" fill="none" stroke="${C_LINE_E}" stroke-width="2.5"/>\n`;
    s += renderEdgeLabelInline(midX, srcCenterY, distSupply, distCt, sourceObj, dist, 'power');
  }

  // ---------- MINDMAP-ROUTING ----------
  // Verbraucher nach Y-Reihenfolge (von oben nach unten) — sie behalten
  // ihre Reihenfolge, bekommen aber je einen eigenen Austrittspunkt am
  // Speisepunkt UND eine eigene vertikale Lane im Korridor zum Verbraucher.
  const lanesN = consumers.length;

  // Austrittspunkte am Speisepunkt: gleichmäßig über exitSpan verteilt,
  // zentriert um feedCenterY. Reihenfolge entspricht Y-Reihenfolge der
  // Verbraucher → keine Überkreuzungen.
  const exitYForConsumer = new Array(lanesN);
  if (lanesN === 1){
    exitYForConsumer[0] = feedCenterY;
  } else {
    const span = Math.min(exitSpan, lanesN * 14); // mind. 14px zwischen Austritten
    const step = span / (lanesN - 1);
    const top  = feedCenterY - span / 2;
    consumers.forEach((_, i) => { exitYForConsumer[i] = top + i * step; });
  }

  // Lanes (vertikale Korridore) zwischen Speisepunkt und Verbraucher.
  // Jede Verbraucher-Leitung bekommt eine eigene X-Lane → keine Überdeckung.
  // Lane-Reihenfolge: oberster Verbraucher → äußerste Lane (am weitesten
  // links), unterster → ebenfalls äußerste; zur Mitte hin näher am Charger.
  // So entsteht das typische Mindmap-/Kammbild.
  const corridorStart = feedX + 28;
  const corridorEnd   = COL_CHG_X - 28;
  const corridorW     = corridorEnd - corridorStart;

  // Distanz vom Mittelpunkt → Lane-Rang. Verbraucher mit größtem Abstand
  // bekommen die "weiteste" Lane (ganz links), nahe Mitte bekommen die
  // "nächste" Lane (ganz rechts).
  const idxByDistance = consumers
    .map((_, i) => ({ i, d: Math.abs(consumerYs[i] - feedCenterY) }))
    .sort((a, b) => b.d - a.d)
    .map(x => x.i);

  const laneSpacing = lanesN > 0 ? corridorW / (lanesN + 1) : corridorW;
  const laneXForConsumer = new Array(lanesN);
  idxByDistance.forEach((cIdx, rank) => {
    // rank=0 → ganz außen (nahe feed), rank=lanesN-1 → ganz innen (nahe Charger)
    laneXForConsumer[cIdx] = corridorStart + (rank + 1) * laneSpacing;
  });

  // Verbraucher + Leitungen rendern
  consumers.forEach((cons, i) => {
    const cy = consumerYs[i];
    const yTop = cy - CHG_H/2;
    s += renderConsumerInline(cons, COL_CHG_X, yTop, ordinalByCat);

    const supply = strand.kind === 'direct'
      ? powerSupplyFrom(cons, sourceObj.id)
      : powerSupplyFrom(cons, strand.distributor.id);
    const ct = supply ? state.cableTypes.find(c => c.id === supply.cableTypeId) : null;
    const laneX = laneXForConsumer[i];
    const exitY = exitYForConsumer[i];

    // Mindmap-Pfad: vom eigenen Austritt am KVS/Mast horizontal in die
    // Lane, dann vertikal auf Verbraucher-Höhe, dann horizontal zum Charger.
    let pts;
    if (Math.abs(cy - exitY) < 2){
      pts = `${feedX},${exitY} ${COL_CHG_X},${cy}`;
    } else {
      pts = `${feedX},${exitY} ${laneX},${exitY} ${laneX},${cy} ${COL_CHG_X},${cy}`;
    }
    s += `<polyline points="${pts}" fill="none" stroke="${C_LINE_E}" stroke-width="2"/>\n`;

    // Beschriftung mittig auf der horizontalen Strecke zum Charger
    const labelX = (laneX + COL_CHG_X) / 2;
    s += renderEdgeLabelInline(labelX, cy, supply, ct, strand.kind === 'direct' ? sourceObj : strand.distributor, cons, 'power');
  });

  // Strang-Titel im Header
  let title = 'Energieschema';
  if (strand.kind === 'dist'){
    const distCat = catOf(strand.distributor);
    title = `Energieschema · ${distCat?.icon || 'KVS'}`;
    const ampLbl = distributorAmps(strand.distributor);
    if (ampLbl) title += ` ${ampLbl}`;
  } else if (strand.kind === 'direct'){
    title = 'Energieschema · Direkteinspeisung';
  }

  return wrapInPage({
    stageW, stageH, stageContent: s,
    kindLabel: '4. Energie- und Netzwerkschema:',
    title,
    projName,
  });
}

function renderConsumerInline(cons, x, yTop, ordMap){
  let s = '';
  s += `<image href="${CHARGER_PNG}" x="${x}" y="${yTop}" width="70" height="70"/>\n`;
  s += `<text x="${x + 70 + 14}" y="${yTop + 26}" font-size="14" font-weight="700" fill="${C_INK}">${escapeXml(consumerLabel(cons, ordMap))}</text>\n`;
  const kw = consumerKw(cons);
  if (kw){
    s += `<text x="${x + 70 + 14}" y="${yTop + 46}" font-size="13" fill="${C_INK_2}">${escapeXml(kw)}</text>\n`;
  }
  return s;
}

function renderEdgeLabelInline(x, y, supply, ct, srcObj, dstObj, filter){
  if (!ct) return '';
  let s = '';
  const cs = crossSectionLabel(ct);
  const cnt = Number(supply?.count)||1;
  const csLabel = (cnt > 1 ? `${cnt} × ` : '') + cs;
  s += `<text x="${x}" y="${y - 10}" text-anchor="middle" font-size="13" fill="${C_INK}">${escapeXml(csLabel)}</text>\n`;
  const lenM = supplyLengthMeters(supply, srcObj, dstObj, filter);
  if (lenM > 0){
    s += `<text x="${x}" y="${y + 24}" text-anchor="middle" font-size="12" fill="${C_INK_2}">${Math.round(lenM)} m</text>\n`;
  }
  return s;
}

// =====================================================================
// LOGISCHES NETZWERKSCHEMA — vollständig: alle Daten-Verbindungen
// =====================================================================
//
// Sammelt ALLE Datenkabel-Supplies im Projekt und baut daraus einen Graph.
// Knoten = Quellen + Ziele aller Daten-Supplies (egal ob NWS/Trafo/KVS/LN2/LS2/…).
// Kategorisiert in Spalten:
//   Spalte 0: Quellen-Knoten ohne eingehende Daten (Wurzeln, oft NWS oder Trafo)
//   Spalte 1: Zwischenknoten (eingehend UND ausgehend)
//   Spalte 2: Endknoten (nur eingehend, typ. Verbraucher)
// Knoten ohne Daten-Beziehung werden ignoriert.

function buildLogicalNetworkSchema(opts = {}){
  const projName = opts.locationName || state.meta?.name || 'Standort';

  // 1) Alle Daten-Verbindungen sammeln (kanten)
  const edges = []; // {from, to, supply}
  state.objects.forEach(target => {
    (target.supplies||[]).forEach(supp => {
      const ct = state.cableTypes.find(c => c.id === supp.cableTypeId);
      if (!isDataCable(ct)) return;
      const src = state.objects.find(o => o.id === supp.sourceId);
      if (!src) return;
      edges.push({ from: src, to: target, supply: supp });
    });
  });

  if (!edges.length) return null;

  // 2) Knoten extrahieren
  const nodeMap = new Map();
  edges.forEach(e => {
    nodeMap.set(e.from.id, e.from);
    nodeMap.set(e.to.id,   e.to);
  });
  const nodes = [...nodeMap.values()];

  // In/Out-Grade berechnen (basierend auf Daten-Edges)
  const inDeg = new Map(), outDeg = new Map();
  nodes.forEach(n => { inDeg.set(n.id, 0); outDeg.set(n.id, 0); });
  edges.forEach(e => {
    inDeg.set(e.to.id, (inDeg.get(e.to.id)||0) + 1);
    outDeg.set(e.from.id, (outDeg.get(e.from.id)||0) + 1);
  });

  // 3) Kategorie pro Knoten:
  //    'root'  — out > 0, in == 0
  //    'mid'   — in > 0 UND out > 0
  //    'leaf'  — in > 0, out == 0
  function categoryOf(n){
    const i = inDeg.get(n.id)||0;
    const o = outDeg.get(n.id)||0;
    if (o > 0 && i === 0) return 'root';
    if (i > 0 && o > 0)   return 'mid';
    return 'leaf';
  }

  const roots = nodes.filter(n => categoryOf(n) === 'root');
  const mids  = nodes.filter(n => categoryOf(n) === 'mid');
  const leaves = nodes.filter(n => categoryOf(n) === 'leaf');

  // Verbraucher-Nummerierung über Reihenfolge (für Konsistenz mit Energieschema)
  const ordinalByCat = new Map();
  const counters = new Map();
  nodes.filter(isConsumer).forEach(o => {
    const c = catOf(o);
    const k = c?.icon || c?.id || '';
    const next = (counters.get(k)||0) + 1;
    counters.set(k, next);
    ordinalByCat.set(o.id, next);
  });

  // ---- Stage-Geometrie ----
  // Spalten-X-Positionen abhängig davon, ob "mid" Knoten existieren.
  const hasMid = mids.length > 0;
  const NODE_W = 150;
  const NODE_H = 60;
  const CHG_W  = 64;
  const CHG_H  = 64;
  const ROW_H  = 88;

  const COL_X = hasMid ? [40, 470, 920] : [60, 0, 920];
  // Positionsbestimmung pro Spalte
  function placeColumn(items, xCenter){
    const totalH = items.length * ROW_H;
    return items.map((n, i) => ({
      node: n,
      x: xCenter,
      y: i * ROW_H + ROW_H/2,
      h: ROW_H,
      totalH,
    }));
  }

  const colRoot = placeColumn(roots, COL_X[0] + NODE_W/2);
  const colMid  = placeColumn(mids,  COL_X[1] + NODE_W/2);
  const colLeaf = placeColumn(leaves, COL_X[2]);

  // Vertikales Re-Centering jeder Spalte um die Mitte der höchsten Spalte
  const maxRows = Math.max(roots.length, mids.length, leaves.length, 1);
  const stageH = Math.max(maxRows * ROW_H + 40, 400);
  const stageW = 1280;

  function recenter(col){
    const totalH = col.length * ROW_H;
    const offsetY = (stageH - totalH) / 2;
    col.forEach(p => { p.y += offsetY - ROW_H/2 + ROW_H/2; });
    // simpler: y_new = i*ROW_H + offsetY + ROW_H/2 — aber col already has y = i*ROW_H + ROW_H/2
    // also: shift by (offsetY - 0)
    col.forEach((p, i) => { p.y = offsetY + i * ROW_H + ROW_H/2; });
  }
  recenter(colRoot);
  recenter(colMid);
  recenter(colLeaf);

  const posMap = new Map();
  [...colRoot, ...colMid, ...colLeaf].forEach(p => posMap.set(p.node.id, p));

  let s = '';

  // Knoten rendern
  function nodeLabel(n){
    if (isConsumer(n)){
      return consumerLabel(n, ordinalByCat);
    }
    const c = catOf(n);
    return c?.icon || c?.name || '?';
  }
  function nodeSubtitle(n){
    if (isConsumer(n)){
      return consumerKw(n);
    }
    const c = catOf(n);
    if (isDistributor(n)) return distributorAmps(n) || c?.name || '';
    if (isNws(n)) return n.name || '';
    if (isSource(n)) return c?.name || '';
    return c?.name || '';
  }
  function nodeColor(n){
    if (isNws(n)) return C_LINE_N;
    if (isDistributor(n)) return C_KVS;
    if (isSource(n)) return C_RED;
    return null; // Verbraucher als Charger-Image
  }

  function renderNode(p){
    const n = p.node;
    if (isConsumer(n)){
      // Charger-Image + label
      const x = p.x;
      const y = p.y - CHG_H/2;
      let out = '';
      out += `<image href="${CHARGER_PNG}" x="${x}" y="${y}" width="${CHG_W}" height="${CHG_H}"/>\n`;
      out += `<text x="${x + CHG_W + 12}" y="${y + 26}" font-size="14" font-weight="700" fill="${C_INK}">${escapeXml(nodeLabel(n))}</text>\n`;
      const sub = nodeSubtitle(n);
      if (sub) out += `<text x="${x + CHG_W + 12}" y="${y + 44}" font-size="12" fill="${C_INK_2}">${escapeXml(sub)}</text>\n`;
      return out;
    } else {
      // Box-Knoten
      const fill = nodeColor(n) || C_INK_2;
      const x = p.x - NODE_W/2;
      const y = p.y - NODE_H/2;
      let out = '';
      out += `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="4" fill="${fill}"/>\n`;
      out += `<text x="${x + NODE_W/2}" y="${y + 26}" text-anchor="middle" font-size="14" font-weight="700" fill="#fff">${escapeXml(nodeLabel(n))}</text>\n`;
      const sub = nodeSubtitle(n);
      if (sub) out += `<text x="${x + NODE_W/2}" y="${y + 46}" text-anchor="middle" font-size="12" fill="#fff">${escapeXml(sub)}</text>\n`;
      return out;
    }
  }

  // ---------- MINDMAP-ROUTING für Daten-Edges ----------
  // Edges nach Quelle gruppieren → jede Quelle bekommt mehrere Austritte
  // entlang der rechten Knoten-Kante (Y-sortiert nach Ziel-Y), keine
  // Überlagerung mehr. Genauso für die Eintrittsseite jedes Ziels.
  // Lanes: jede Edge bekommt eine eigene X-Lane im Korridor zwischen
  // Quelle und Ziel — Reihenfolge nach Distanz |from.y - to.y|, größte
  // Distanz → äußerste Lane.

  function exitYsFor(p, count){
    if (count <= 1) return [p.y];
    const span = isConsumer(p.node)
      ? Math.min(CHG_H - 12, count * 10)
      : Math.min(NODE_H - 14, count * 12);
    const step = span / (count - 1);
    const top  = p.y - span/2;
    return Array.from({length: count}, (_, i) => top + i*step);
  }

  function rightAnchorX(p){
    return isConsumer(p.node) ? p.x : p.x + NODE_W/2;
  }
  function leftAnchorX(p){
    return isConsumer(p.node) ? p.x : p.x - NODE_W/2;
  }

  // Outgoing-Edges pro from-Knoten, sortiert nach to.y
  const outByFrom = new Map();
  edges.forEach(e => {
    const list = outByFrom.get(e.from.id) || [];
    list.push(e); outByFrom.set(e.from.id, list);
  });
  outByFrom.forEach(list => list.sort((a,b) => (posMap.get(a.to.id)?.y||0) - (posMap.get(b.to.id)?.y||0)));

  // Incoming-Edges pro to-Knoten, sortiert nach from.y
  const inByTo = new Map();
  edges.forEach(e => {
    const list = inByTo.get(e.to.id) || [];
    list.push(e); inByTo.set(e.to.id, list);
  });
  inByTo.forEach(list => list.sort((a,b) => (posMap.get(a.from.id)?.y||0) - (posMap.get(b.from.id)?.y||0)));

  // Pro Edge: exitY (am from-Knoten) + entryY (am to-Knoten)
  const exitYByEdge = new Map();
  const entryYByEdge = new Map();
  outByFrom.forEach((list, fromId) => {
    const p = posMap.get(fromId);
    const ys = exitYsFor(p, list.length);
    list.forEach((e, i) => exitYByEdge.set(e, ys[i]));
  });
  inByTo.forEach((list, toId) => {
    const p = posMap.get(toId);
    const ys = exitYsFor(p, list.length);
    list.forEach((e, i) => entryYByEdge.set(e, ys[i]));
  });

  // Lane-X pro Edge: gruppiert pro (from-Spalte → to-Spalte)
  // Für jede Spaltenpaarung verteilen wir die Edges auf eigene Lanes
  // im Korridor zwischen rechter Kante from und linker Kante to.
  function colKeyOf(p){
    if (colRoot.includes(p)) return 'root';
    if (colMid.includes(p))  return 'mid';
    return 'leaf';
  }
  const edgesByPair = new Map();
  edges.forEach(e => {
    const a = posMap.get(e.from.id), b = posMap.get(e.to.id);
    if (!a || !b) return;
    const key = colKeyOf(a) + '→' + colKeyOf(b);
    const arr = edgesByPair.get(key) || [];
    arr.push(e); edgesByPair.set(key, arr);
  });
  const laneXByEdge = new Map();
  edgesByPair.forEach((arr, key) => {
    // Korridor: rechtes Ende der from-Spalte … linkes Ende der to-Spalte
    const a0 = posMap.get(arr[0].from.id), b0 = posMap.get(arr[0].to.id);
    const cStart = rightAnchorX(a0) + 24;
    const cEnd   = leftAnchorX(b0) - 24;
    const cW     = Math.max(cEnd - cStart, 60);
    // Sortierung: Edges mit größtem |Δy| → äußerste Lane (nahe from)
    const ranked = arr
      .map(e => ({ e, d: Math.abs((posMap.get(e.to.id)?.y||0) - (posMap.get(e.from.id)?.y||0)) }))
      .sort((x,y) => y.d - x.d);
    const step = cW / (ranked.length + 1);
    ranked.forEach((r, rank) => {
      laneXByEdge.set(r.e, cStart + (rank + 1) * step);
    });
  });

  // Edges zeichnen
  edges.forEach(e => {
    const a = posMap.get(e.from.id);
    const b = posMap.get(e.to.id);
    if (!a || !b) return;
    const Ax = rightAnchorX(a);
    const Bx = leftAnchorX(b);
    const Ay = exitYByEdge.get(e) ?? a.y;
    const By = entryYByEdge.get(e) ?? b.y;
    const laneX = laneXByEdge.get(e) ?? (Ax + Bx) / 2;
    let pts;
    if (Math.abs(Ay - By) < 2){
      pts = `${Ax},${Ay} ${Bx},${By}`;
    } else {
      pts = `${Ax},${Ay} ${laneX},${Ay} ${laneX},${By} ${Bx},${By}`;
    }
    s += `<polyline points="${pts}" fill="none" stroke="${C_LINE_N}" stroke-width="1.8" stroke-dasharray="6,3"/>\n`;
    // Beschriftung mittig auf der horizontalen Strecke zum Ziel
    const ct = state.cableTypes.find(c => c.id === e.supply.cableTypeId);
    const lenM = supplyLengthMeters(e.supply, e.from, e.to, 'data');
    let lbl = ct ? (ct.label || 'Daten') : 'Daten';
    if (lenM > 0) lbl += ` · ${Math.round(lenM)} m`;
    const labelX = (laneX + Bx) / 2;
    s += `<text x="${labelX}" y="${By - 6}" text-anchor="middle" font-size="11" fill="${C_INK}">${escapeXml(lbl)}</text>\n`;
  });

  // Knoten zeichnen
  [...colRoot, ...colMid, ...colLeaf].forEach(p => { s += renderNode(p); });

  return wrapInPage({
    stageW, stageH, stageContent: s,
    kindLabel: '4. Energie- und Netzwerkschema:',
    title: 'Logisches Netzwerkschema',
    projName,
  });
}

// =====================================================================
// Public API
// =====================================================================

// Liefert alle Stränge des Projekts (über alle Quellen).
export function listAllStrands(){
  const out = [];
  state.objects.filter(isSource).forEach(src => {
    buildSourceStrands(src).forEach(strand => {
      // leere Stränge (KVS ohne Verbraucher) werden trotzdem behalten,
      // damit auch ein leerer Schrank dokumentiert ist; aber direkt-Stränge
      // ohne Verbraucher werden weggelassen.
      if (strand.kind === 'direct' && !strand.consumers.length) return;
      out.push(strand);
    });
  });
  return out;
}

// Beibehalten für Rückwärtskompat — nicht mehr verwendet, ersetzt durch listAllStrands.
export function listSchemaTargets(){
  const sources = state.objects.filter(isSource);
  return sources.filter(src => {
    const hasDirectConsumer = state.objects.some(o => isConsumer(o) && powerSupplyFrom(o, src.id));
    const hasDistributor    = state.objects.some(o => isDistributor(o) && powerSupplyFrom(o, src.id));
    return hasDirectConsumer || hasDistributor;
  });
}

function strandFilenamePart(strand){
  const srcCat = catOf(strand.source);
  const srcLbl = (srcCat?.icon || 'Quelle');
  if (strand.kind === 'direct') return `${srcLbl}_direkt`;
  const distCat = catOf(strand.distributor);
  return `${srcLbl}_${distCat?.icon || 'KVS'}`;
}

export function downloadSchemas(){
  const strands = listAllStrands();
  if (!strands.length){
    alert('Keine Quelle (Trafo/HAK) mit nachgelagerter Versorgung gefunden.\n\nSetze einen Netzanschluss auf der Karte und verbinde ihn per Stromkabel mit Verbrauchern oder einem KVS.');
    return 0;
  }
  const projName = state.meta?.name || 'Projekt';
  const ord = buildGlobalConsumerOrdinal();
  let count = 0;
  strands.forEach((strand, i) => {
    const svg = buildEnergySchemaForStrand(strand, { locationName: projName, ordinalByCat: ord });
    if (!svg) return;
    const part = strandFilenamePart(strand);
    const fname = strands.length > 1
      ? `Energieschema_${slug(projName)}_${slug(part)}.svg`
      : `Energieschema_${slug(projName)}.svg`;
    download(svg, fname);
    count++;
  });
  return count;
}

export function downloadNetworkSchema(){
  const svg = buildLogicalNetworkSchema({ locationName: state.meta?.name || 'Projekt' });
  if (!svg){
    alert('Keine Datenkabel-Verbindungen im Projekt gefunden.\n\nVerbinde Verbraucher (oder NWS↔NWS) per Datenkabel-Einspeisung, dann erscheint ein Netzwerkschema.');
    return 0;
  }
  const projName = state.meta?.name || 'Projekt';
  download(svg, `Netzwerkschema_${slug(projName)}.svg`);
  return 1;
}

export function openSchemaPreview(){
  const projName = state.meta?.name || 'Projekt';
  const strands = listAllStrands();
  const netSvg = buildLogicalNetworkSchema({ locationName: projName });

  if (!strands.length && !netSvg){
    alert('Kein Schema generierbar.\n\nFür ein Energieschema: mind. ein Netzanschluss (Trafo/HAK) mit Verbrauchern.\nFür ein Netzwerkschema: mind. eine Datenkabel-Verbindung.');
    return;
  }

  const w = window.open('', '_blank');
  if (!w){ alert('Pop-up wurde blockiert.'); return; }

  const ord = buildGlobalConsumerOrdinal();
  const energyPages = strands.map((strand, i) => {
    const svg = buildEnergySchemaForStrand(strand, { locationName: projName, ordinalByCat: ord });
    if (!svg) return '';
    let label = 'Energieschema';
    if (strand.kind === 'direct') label += ' · Direkteinspeisung';
    else {
      const distCat = catOf(strand.distributor);
      label += ` · ${distCat?.icon || 'KVS'}`;
    }
    return `<section class="page"><div class="kind">${escapeXml(label)} (${i+1}/${strands.length})</div>${svg}</section>`;
  }).join('\n');

  const netPage = netSvg ? `<section class="page"><div class="kind">Logisches Netzwerkschema</div>${netSvg}</section>` : '';

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Schemata – ${escapeXml(projName)}</title>
    <style>
      @page { size: A4 landscape; margin: 0; }
      body{margin:0;padding:24px;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif}
      .toolbar{position:sticky;top:0;background:#fff;border:1px solid #e6e6e6;padding:10px;border-radius:5px;margin-bottom:16px;display:flex;gap:8px;z-index:10}
      .toolbar button{padding:8px 14px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:12px}
      .toolbar button.primary{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
      .page{background:#fff;border:1px solid #e6e6e6;border-radius:4px;padding:0;margin:0 auto 16px;page-break-after:always;width:1123px;height:794px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden;position:relative}
      .page svg{display:block;width:1123px;height:794px}
      .kind{position:absolute;top:6px;left:14px;font-size:10px;color:#888}
      @media print { body{background:#fff;padding:0} .toolbar{display:none} .page{border:none;padding:0;margin:0;width:1123px;height:794px} .kind{display:none} }
    </style></head><body>
    <div class="toolbar">
      <button class="primary" onclick="window.print()">📄 Drucken / als PDF (A4 quer)</button>
      <span style="flex:1"></span>
      <span style="font-size:11px;color:#888;align-self:center">${strands.length} Energieschema${strands.length===1?'':'ta'}${netSvg?' · 1 Netzwerkschema':''} · ${escapeXml(projName)}</span>
    </div>
    ${energyPages}
    ${netPage}
  </body></html>`);
  w.document.close();
}

function download(svg, name){
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function slug(str){
  return String(str||'').replace(/[^a-z0-9äöüÄÖÜß_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'schema';
}
