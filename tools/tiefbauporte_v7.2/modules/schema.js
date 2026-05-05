// schema.js — Generiert ein Energieschema (SVG) aus dem aktuellen State.
// Layout: 3 Spalten — Quelle (Netzanschluss) | Verteiler (KVS/MWS/ZAS) | Verbraucher (Ladesäulen)
// Längen pro Leitung kommen aus computeChainSegments() + segments[].len.

import { state } from './state.js';
import { computeChainSegments } from './links.js';
import { MAST_PNG, CHARGER_PNG } from './schemaIcons.js';

// ---- Farben (aus PPTX-Original) ----
const C_LINE   = '#00B0F0';
const C_RED    = '#FF0000';
const C_AMBER  = '#FFC000';
const C_KVS    = '#CCCBCA';
const C_INK    = '#1A1A1A';
const C_INK_2  = '#555555';

// ---- Hilfen ----
function escapeXml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function isSource(o){
  const c = state.catalog.find(x => x.id === o.catId);
  return c && c.cat === 'Netzanschluss';
}
function isDistributor(o){
  const c = state.catalog.find(x => x.id === o.catId);
  return c && c.cat === 'Verteilung';
}
function isConsumer(o){
  const c = state.catalog.find(x => x.id === o.catId);
  return c && c.cat === 'Ladeinfrastruktur';
}
function catOf(o){ return state.catalog.find(x => x.id === o.catId); }

// Prüft, ob ein Kabeltyp eine Energie-/Stromleitung ist (keine Daten/Leerrohre)
function isPowerCable(cableType){
  if (!cableType) return false;
  // Whitelist: builtin Stromkabel-IDs k1..k4 (siehe state.js)
  if (['k1','k2','k3','k4'].includes(cableType.id)) return true;
  // Heuristik für custom cables: Label enthält "Strom" oder "kW"
  const lbl = String(cableType.label||'').toLowerCase();
  if (lbl.includes('strom') || lbl.includes('kw') || lbl.includes('nayy') || lbl.includes('mm²')) {
    // ausschließen: Daten / Leerrohr / Erdung
    if (lbl.includes('daten') || lbl.includes('leerrohr') || lbl.includes('erdung') ||
        lbl.includes('flachband') || lbl.includes('runderder')) return false;
    return true;
  }
  return false;
}

// Summiert nur Energieleitungs-Längen (filtert Daten/Leerrohr aus)
function supplyLengthMeters(supply, sourceObj, consumerObj){
  if (!supply || !Array.isArray(supply.traceIds) || !supply.traceIds.length) return 0;
  // Nur werten, wenn das Supply selbst eine Energieleitung ist
  const ct = state.cableTypes.find(c => c.id === supply.cableTypeId);
  if (!isPowerCable(ct)) return 0;
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

// Gibt einen lesbaren Querschnitt-String zurück (Fallback auf cableType.label)
function crossSectionLabel(cableType){
  if (!cableType) return '';
  if (cableType.crossSection) return cableType.crossSection;
  return cableType.label || '';
}

// Index-basierter Verbrauchsname: LN2/1, LN2/2 ...
function consumerLabel(o, ordinalByCat){
  const c = catOf(o);
  const tag = c?.icon || 'C';
  // Bevorzugt globale seqNo (vergeben beim Setzen), Fallback Reihenfolge im Schema
  const idx = Number(o.seqNo)||0 || ordinalByCat.get(o.id);
  return tag + (idx ? '/' + idx : '');
}

// kW-Beschriftung "n × kW"
function consumerKw(o){
  const c = catOf(o);
  if (!c?.kw) return '';
  const kw = Number(o.kw)||0;
  const n = Number(o.kwCount)||1;
  if (!kw) return '';
  return n > 1 ? `${n} × ${kw} kW` : `${kw} kW`;
}

// Ampere-Label für Verteiler
function distributorAmps(o){
  const a = Number(o.ampere)||0;
  return a ? `${a} A` : '';
}

// ============================================================
// Hauptfunktion: SVG für einen Verteiler-Knoten generieren
// ============================================================
function buildSchemaForDistributor(distributor, opts = {}){
  const projName = opts.locationName || state.meta?.name || 'Standort';

  // 1) Quelle suchen — supplies des Verteilers selbst
  const distSupplies = distributor.supplies || [];
  const sourceObj = distSupplies.length
    ? state.objects.find(o => o.id === distSupplies[0].sourceId)
    : null;
  const sourceSupply = distSupplies[0] || null;

  // 2) Verbraucher suchen — alle Objekte, deren supplies[].sourceId == distributor.id
  const consumers = state.objects.filter(o =>
    isConsumer(o) && (o.supplies||[]).some(s => s.sourceId === distributor.id)
  );

  // Verbraucher pro Katalog-Typ durchnummerieren
  const ordinalByCat = new Map();
  const counters = new Map();
  consumers.forEach(o => {
    const c = catOf(o);
    const k = c?.icon || c?.id || '';
    const next = (counters.get(k)||0) + 1;
    counters.set(k, next);
    ordinalByCat.set(o.id, next);
  });

  // 3) Geometrie
  const W = 1400;
  const rowH = 120;
  const topPad = 80;
  const headerH = 70;
  const minH = 480;
  const H = Math.max(minH, topPad + headerH + Math.max(consumers.length, 1) * rowH + 80);

  const COL_SRC_X    = 155;          // Mast-Mitte
  const COL_KVS_X    = 740;          // KVS-Box left
  const KVS_W        = 100;
  const KVS_H        = 64;
  const COL_CHG_X    = 1180;         // Charger image left
  const CHG_W        = 66;
  const CHG_H        = 66;

  // Vertikale Mitten
  const kvsCY = topPad + headerH + Math.floor(consumers.length / 2) * rowH + rowH/2 - 8;
  const kvsTop = kvsCY - KVS_H/2;
  const kvsBottom = kvsCY + KVS_H/2;

  // Mast-Bereich vertikal an KVS ausrichten
  const mastH = 194;
  const mastW = 151;
  const mastX = 80;
  const mastY = kvsCY - mastH/2 + 30;
  const mastFeedY = kvsCY;

  // 4) SVG bauen
  let svg = '';
  svg += `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
       + `viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="EON Brix Sans, Helvetica, Arial, sans-serif">\n`;

  // Header — Section + Titel
  svg += `<text x="40" y="42" font-size="22" font-weight="700" fill="${C_INK}" text-decoration="underline">4. Energie- und Netzwerkschema:</text>\n`;
  svg += `<text x="40" y="78" font-size="22" fill="${C_AMBER}">Energieschema `
       + `<tspan font-style="italic" text-decoration="underline">Parkplatz ${escapeXml(projName)}</tspan></text>\n`;

  // Source: Mast + Beschriftung
  if (sourceObj){
    const srcCat = catOf(sourceObj);
    svg += `<image href="${MAST_PNG}" x="${mastX}" y="${mastY}" width="${mastW}" height="${mastH}"/>\n`;
    svg += `<text x="${COL_SRC_X}" y="${mastY - 28}" text-anchor="middle" font-size="13" fill="${C_INK}">Netzanschluss</text>\n`;
    svg += `<text x="${COL_SRC_X}" y="${mastY - 12}" text-anchor="middle" font-size="12" font-style="italic" fill="${C_AMBER}">${escapeXml(srcCat?.name || '')}</text>\n`;
    svg += `<text x="${COL_SRC_X}" y="${mastY + mastH + 24}" text-anchor="middle" font-size="13" fill="${C_RED}">Anschluss ${srcCat?.id === 'trafo' ? 'Mittelspannung' : 'Niederspannung'}</text>\n`;
  }

  // KVS box
  const ampLbl = distributorAmps(distributor);
  const distCat = catOf(distributor);
  svg += `<rect x="${COL_KVS_X}" y="${kvsTop}" width="${KVS_W}" height="${KVS_H}" rx="6" fill="${C_KVS}"/>\n`;
  svg += `<text x="${COL_KVS_X + KVS_W/2}" y="${kvsTop + 26}" text-anchor="middle" font-size="12" fill="#fff">${escapeXml(distCat?.icon || 'KVS')}</text>\n`;
  if (ampLbl){
    svg += `<text x="${COL_KVS_X + KVS_W/2}" y="${kvsTop + 46}" text-anchor="middle" font-size="12" fill="#fff">${escapeXml(ampLbl)}</text>\n`;
  }

  // Source → KVS line + label
  if (sourceObj && sourceSupply){
    const ct = state.cableTypes.find(c => c.id === sourceSupply.cableTypeId);
    const cs = crossSectionLabel(ct);
    const cnt = Number(sourceSupply.count)||1;
    const lenM = supplyLengthMeters(sourceSupply, sourceObj, distributor);
    const csLabel = (cnt > 1 ? `${cnt} × ` : '') + cs;
    svg += `<line x1="${mastX + mastW}" y1="${mastFeedY}" x2="${COL_KVS_X}" y2="${kvsCY}" stroke="${C_LINE}" stroke-width="2"/>\n`;
    const midX = (mastX + mastW + COL_KVS_X) / 2;
    svg += `<text x="${midX}" y="${mastFeedY - 12}" text-anchor="middle" font-size="12" fill="${C_INK}">${escapeXml(csLabel)}</text>\n`;
    if (lenM > 0){
      svg += `<text x="${midX}" y="${mastFeedY + 24}" text-anchor="middle" font-size="12" fill="${C_INK}">${Math.round(lenM)} m</text>\n`;
    }
  }

  // Verbraucher rendern
  consumers.forEach((cons, i) => {
    const yTop = topPad + headerH + i * rowH + 10;
    const cx = COL_CHG_X;
    const cy = yTop + CHG_H/2;
    svg += `<image href="${CHARGER_PNG}" x="${cx}" y="${yTop}" width="${CHG_W}" height="${CHG_H}"/>\n`;
    svg += `<text x="${cx + CHG_W + 14}" y="${yTop + 25}" font-size="12" fill="${C_INK}">${escapeXml(consumerLabel(cons, ordinalByCat))}</text>\n`;
    const kw = consumerKw(cons);
    if (kw){
      svg += `<text x="${cx + CHG_W + 14}" y="${yTop + 43}" font-size="12" fill="${C_INK}">${escapeXml(kw)}</text>\n`;
    }

    // Linie KVS → Verbraucher (orthogonal: aus KVS rechts, dann horizontal, dann vertikal)
    const supply = (cons.supplies||[]).find(s => s.sourceId === distributor.id);
    const ct = supply ? state.cableTypes.find(c => c.id === supply.cableTypeId) : null;

    // KVS-Austrittspunkt: oben/Mitte/unten je nach Position relativ zur KVS
    let kvsExitX, kvsExitY;
    if (cy < kvsTop - 4){
      kvsExitX = COL_KVS_X + KVS_W * 0.5;
      kvsExitY = kvsTop;
    } else if (cy > kvsBottom + 4){
      kvsExitX = COL_KVS_X + KVS_W * 0.5;
      kvsExitY = kvsBottom;
    } else {
      kvsExitX = COL_KVS_X + KVS_W;
      kvsExitY = kvsCY;
    }

    // Manhattan: horizontale Knickstelle bei x = mid
    const midX = (kvsExitX + cx) / 2;
    let pts;
    if (Math.abs(cy - kvsCY) < 4){
      // gerade Verbindung von rechts
      pts = `${kvsExitX},${cy} ${cx},${cy}`;
    } else if (cy < kvsTop - 4){
      // nach oben austretend
      pts = `${kvsExitX},${kvsExitY} ${kvsExitX},${cy} ${cx},${cy}`;
    } else if (cy > kvsBottom + 4){
      pts = `${kvsExitX},${kvsExitY} ${kvsExitX},${cy} ${cx},${cy}`;
    } else {
      pts = `${kvsExitX},${kvsExitY} ${midX},${kvsExitY} ${midX},${cy} ${cx},${cy}`;
    }
    svg += `<polyline points="${pts}" fill="none" stroke="${C_LINE}" stroke-width="2"/>\n`;

    // Beschriftung mittig (Querschnitt + Länge)
    const labelX = (kvsExitX + cx) / 2;
    const labelY = cy - 10;
    if (ct){
      const cs = crossSectionLabel(ct);
      const cnt = Number(supply?.count)||1;
      const csLabel = (cnt > 1 ? `${cnt} × ` : '') + cs;
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12" fill="${C_INK}">${escapeXml(csLabel)}</text>\n`;
    }
    const lenM = supply ? supplyLengthMeters(supply, distributor, cons) : 0;
    if (lenM > 0){
      svg += `<text x="${labelX}" y="${labelY + 26}" text-anchor="middle" font-size="11" fill="${C_INK_2}">${Math.round(lenM)} m</text>\n`;
    }
  });

  if (!consumers.length){
    svg += `<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="14" fill="${C_INK_2}" font-style="italic">Keine Verbraucher mit Versorgung von diesem Verteiler.</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}

// ============================================================
// Public API
// ============================================================

// Liefert Liste aller Verteiler-Knoten, für die ein Schema generiert werden kann
export function listSchemaTargets(){
  return state.objects.filter(isDistributor);
}

// Liefert ein einzelnes SVG für einen Verteiler
export function generateSchemaSvg(distributorId, opts){
  const d = state.objects.find(o => o.id === distributorId);
  if (!d) return null;
  return buildSchemaForDistributor(d, opts);
}

// Lädt das/die Schemata herunter (1 oder mehrere Dateien)
export function downloadSchemas(){
  const targets = listSchemaTargets();
  if (!targets.length){
    alert('Kein Verteiler (KVS/MWS/ZAS) im Projekt gesetzt.\n\nSetze einen Verteiler auf der Karte und verbinde Verbraucher per Versorgung-Beziehung.');
    return 0;
  }
  const projName = state.meta?.name || 'Projekt';
  targets.forEach((d, i) => {
    const svg = buildSchemaForDistributor(d, { locationName: projName });
    const fname = targets.length > 1
      ? `Energieschema_${slug(projName)}_${i+1}.svg`
      : `Energieschema_${slug(projName)}.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });
  return targets.length;
}

// Öffnet eine Vorschau aller Schemata in einem neuen Fenster (Preview + Druck)
export function openSchemaPreview(){
  const targets = listSchemaTargets();
  if (!targets.length){
    alert('Kein Verteiler im Projekt — bitte mind. eine KVS/MWS/ZAS setzen.');
    return;
  }
  const projName = state.meta?.name || 'Projekt';
  const w = window.open('', '_blank');
  if (!w){ alert('Pop-up wurde blockiert.'); return; }
  const pages = targets.map(d => {
    const svg = buildSchemaForDistributor(d, { locationName: projName });
    return `<section class="page">${svg}</section>`;
  }).join('\n');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Energieschema – ${escapeXml(projName)}</title>
    <style>
      body{margin:0;padding:24px;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif}
      .toolbar{position:sticky;top:0;background:#fff;border:1px solid #e6e6e6;padding:10px;border-radius:5px;margin-bottom:16px;display:flex;gap:8px}
      .toolbar button{padding:8px 14px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;font-size:12px}
      .toolbar button.primary{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
      .page{background:#fff;border:1px solid #e6e6e6;border-radius:4px;padding:20px;margin-bottom:16px;page-break-after:always}
      svg{display:block;width:100%;height:auto}
      @media print { body{background:#fff;padding:0} .toolbar{display:none} .page{border:none;padding:0;margin:0} }
    </style></head><body>
    <div class="toolbar">
      <button class="primary" onclick="window.print()">📄 Drucken / als PDF</button>
      <span style="flex:1"></span>
      <span style="font-size:11px;color:#888;align-self:center">${targets.length} Schema${targets.length>1?'ta':''} · ${escapeXml(projName)}</span>
    </div>
    ${pages}
  </body></html>`);
  w.document.close();
}

function slug(s){
  return String(s||'').replace(/[^a-z0-9äöüÄÖÜß_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'schema';
}
