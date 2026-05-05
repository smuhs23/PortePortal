// v6/modules/calc.js
// v6.2: Bereich-basierte Kabel-Belegung (segIds-Array pro Cable)

import { OF_DEFS, PRICE_GRABEN, PRICE_HAND } from './constants.js';

export function distMeters(a, b) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function totalLen(trace) {
  let s = 0;
  for (let i = 0; i < trace.segments.length; i++) s += trace.segments[i].len;
  return s;
}

export function recalcSegments(t) {
  while (t.segments.length > t.points.length - 1) t.segments.pop();
  while (t.segments.length < t.points.length - 1) {
    t.segments.push({ of:'OF0', hand:false, len:0 });
  }
  for (let i = 0; i < t.segments.length; i++) {
    t.segments[i].len = distMeters(t.points[i], t.points[i+1]);
  }
}

// Länge eines Kabels = Summe der Längen der Segmente in segIds
export function cableRangeLength(cable, t) {
  if (!cable.segIds || !cable.segIds.length) return 0;
  let s = 0;
  for (const i of cable.segIds) {
    if (i >= 0 && i < t.segments.length) s += t.segments[i].len;
  }
  return s;
}

export function cableEffectiveLength(cable, baseLen) {
  if (cable.reserveMode === 'm') {
    return baseLen + (Number(cable.reserveValue) || 0);
  }
  return baseLen * (1 + (Number(cable.reserveValue) || 0) / 100);
}

export function cableUnitPrice(cable) {
  return cable.priceOverride != null ? Number(cable.priceOverride) : Number(cable.priceSnapshot) || 0;
}

// Hilfs-UID für Migration (im Browser via crypto, sonst Fallback)
function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// === MIGRATION v6.1 → v6.2 ===
// Neue Schema-Version 7. Konvertiert seg.cables (Override) und t.cables (Default) → t.cables mit segIds.
// Idempotent: schon migrierte States bleiben unverändert.
export function migrateState(state) {
  if (!state || !Array.isArray(state.traces)) return state;
  if (state.schemaVersion >= 7) return state;

  state.traces.forEach(t => {
    if (!Array.isArray(t.segments)) t.segments = [];
    const segCount = t.segments.length;
    const newCables = [];

    // Hatte irgendein Segment Override?
    const hasOverride = t.segments.some(s => s.cables !== undefined && s.cables !== null);

    if (!hasOverride) {
      // Reines v6.1-Default: bestehende t.cables decken die ganze Trasse ab
      (t.cables || []).forEach(c => {
        if (segCount === 0) return;
        newCables.push({
          id: makeId(),
          typeId: c.typeId,
          label: c.label,
          priceSnapshot: c.priceSnapshot,
          priceOverride: c.priceOverride ?? null,
          count: c.count,
          reserveMode: c.reserveMode,
          reserveValue: c.reserveValue,
          segIds: Array.from({ length: segCount }, (_, i) => i)
        });
      });
    } else {
      // Mischmodus: pro Segment eigene Cables migrieren
      t.segments.forEach((seg, i) => {
        let cabs;
        if (seg.cables === undefined || seg.cables === null) {
          // erbte Default
          cabs = t.cables || [];
        } else if (Array.isArray(seg.cables) && seg.cables.length === 0) {
          // leer
          cabs = [];
        } else {
          cabs = seg.cables;
        }
        cabs.forEach(c => {
          newCables.push({
            id: makeId(),
            typeId: c.typeId,
            label: c.label,
            priceSnapshot: c.priceSnapshot,
            priceOverride: c.priceOverride ?? null,
            count: c.count,
            reserveMode: c.reserveMode,
            reserveValue: c.reserveValue,
            segIds: [i]
          });
        });
      });
    }

    // seg.cables überall entfernen (war v6.1-Feld)
    t.segments.forEach(seg => { delete seg.cables; });
    t.cables = newCables;
  });

  state.schemaVersion = 7;
  return state;
}

// Welche Cables liegen in einem bestimmten Segment? (Read-Use für Segment-Editor)
export function cablesInSegment(t, segIdx) {
  if (!t || !Array.isArray(t.cables)) return [];
  return t.cables.filter(c => Array.isArray(c.segIds) && c.segIds.includes(segIdx));
}

// Sicherstellen: Cable-IDs vorhanden, segIds gültig (innerhalb [0, segCount-1], deduped, sortiert)
export function normalizeCables(t) {
  if (!Array.isArray(t.cables)) { t.cables = []; return; }
  const segCount = t.segments?.length || 0;
  t.cables.forEach(c => {
    if (!c.id) c.id = makeId();
    if (!Array.isArray(c.segIds)) c.segIds = [];
    // dedup, filter, sort
    c.segIds = Array.from(new Set(c.segIds))
      .filter(i => Number.isInteger(i) && i >= 0 && i < segCount)
      .sort((a, b) => a - b);
  });
  // Cables ohne segIds werden gelöscht (Range leer = effektiv kein Kabel)
  t.cables = t.cables.filter(c => c.segIds.length > 0);
}

// Index-Anpassung beim Löschen eines Segments: alle segIds entsprechend nachziehen
// deletedIdx ist der Index des entfernten Segments (in der ALTEN Indizierung)
export function adjustCablesAfterSegmentDelete(t, deletedIdx) {
  if (!Array.isArray(t.cables)) return;
  t.cables.forEach(c => {
    if (!Array.isArray(c.segIds)) { c.segIds = []; return; }
    c.segIds = c.segIds
      .filter(i => i !== deletedIdx)             // entferntes Segment raus
      .map(i => i > deletedIdx ? i - 1 : i);     // alle danach um 1 nach unten
  });
  // Cables ohne Segmente entfernen
  t.cables = t.cables.filter(c => c.segIds.length > 0);
}

// Index-Anpassung beim Einfügen eines Segments an Position insertIdx
export function adjustCablesAfterSegmentInsert(t, insertIdx) {
  if (!Array.isArray(t.cables)) return;
  t.cables.forEach(c => {
    if (!Array.isArray(c.segIds)) { c.segIds = []; return; }
    c.segIds = c.segIds.map(i => i >= insertIdx ? i + 1 : i);
  });
}

// Hauptberechnung pro Trasse
function calcTraceCableCost(t) {
  let total = 0;
  let totalMeters = 0;   // v6.3: Summe der Kabelmeter (effLen × count) über alle Cables
  const breakdown = [];
  (t.cables || []).forEach(c => {
    const n = Number(c.count) || 0;
    if (n <= 0) return;
    const baseLen = cableRangeLength(c, t);
    if (baseLen <= 0) return;
    const effLen = cableEffectiveLength(c, baseLen);
    const unitPrice = cableUnitPrice(c);
    const cableMeters = effLen * n;             // Gesamtmeter dieses Cable-Eintrags
    const cost = cableMeters * unitPrice;
    total += cost;
    totalMeters += cableMeters;
    breakdown.push({
      typeId: c.typeId,
      label: c.label,
      count: n,
      reserveMode: c.reserveMode,
      reserveValue: c.reserveValue,
      baseLen,                                   // ← Range-Länge (Σ seg.len)
      effLen,                                    // ← effektive Länge je 1 Stück (mit Reserve)
      cableMeters,                               // ← effLen × count
      unitPrice,
      priceOverride: c.priceOverride,
      cost,
      segIds: c.segIds.slice()
    });
  });
  return { total, totalMeters, breakdown };
}

export function calcTotals(state) {
  let sumObj = 0, sumTrace = 0, sumCable = 0, sumCableMeters = 0, sumOF = 0, sumGraben = 0, sumTrenchM = 0;
  const byCat = {};

  // Hardware
  state.objects.forEach(o => {
    const cat = state.catalog.find(c => c.id === o.catId);
    const name = cat ? cat.name : 'Unbekannt';
    const s = (Number(o.qty) || 0) * (Number(o.price) || 0);
    sumObj += s;
    const key = cat?.category || 'Sonstiges';
    byCat[key] = byCat[key] || [];
    const suffix = [o.amps ? o.amps+'A' : '', o.kw ? o.kw+'kW' : ''].filter(Boolean).join(' · ');
    byCat[key].push({
      name: name + (suffix ? ' · ' + suffix : ''),
      customName: o.customName || '',
      qty: o.qty,
      unit: cat?.unit || 'Stk',
      price: o.price,
      sum: s,
      linkedTraceId: o.linkedTraceId,
      linkedSegmentIdx: o.linkedSegmentIdx
    });
  });

  // Trassen
  const traceRows = [];
  state.traces.forEach(t => {
    let tOF = 0, tWH = 0, tGR = 0;
    const ofBreak = {};
    t.segments.forEach(seg => {
      const def = OF_DEFS[seg.of];
      if (!def) return;
      const sOF = seg.len * def.prOF;
      const sWH = seg.len * def.prWH;
      const sGR = seg.len * (seg.hand ? PRICE_HAND : PRICE_GRABEN);
      tOF += sOF; tWH += sWH; tGR += sGR;
      ofBreak[seg.of] = (ofBreak[seg.of] || 0) + seg.len;
    });
    const len = totalLen(t);

    // v6.2: Range-basierte Kabelberechnung
    const cableResult = calcTraceCableCost(t);
    const tC = cableResult.total;
    const tCableMeters = cableResult.totalMeters;     // v6.3: Summe der Kabelmeter
    const cableBreak = cableResult.breakdown;

    sumOF += tOF + tWH;
    sumGraben += tGR;
    sumCable += tC;
    sumCableMeters += tCableMeters;
    sumTrenchM += len;
    const tTotal = tOF + tWH + tGR + tC;
    sumTrace += tTotal;

    traceRows.push({
      id: t.id,
      len, ofBreak, cableBreak,
      tOF, tWH, tGR, tC,
      tCableMeters,                                    // v6.3: rohe Kabelmeter-Summe
      total: tTotal,
      segments: t.segments,
      note: t.note || '',
      points: t.points
    });
  });

  const tiefbau = sumOF + sumGraben;
  const surchargeKonta = state.meta.konta ? tiefbau * (Number(state.meta.kontaPct)||0) / 100 : 0;
  const surchargeDenk  = state.meta.denk  ? tiefbau * (Number(state.meta.denkPct)||0)  / 100 : 0;
  const netto = sumObj + sumTrace + surchargeKonta + surchargeDenk;
  const gk = netto * (Number(state.meta.gk)||0) / 100;
  const wg = (netto + gk) * (Number(state.meta.wg)||0) / 100;
  const total = netto + gk + wg;

  return {
    sumObj, sumTrace, sumCable, sumCableMeters, sumOF, sumGraben, sumTrenchM,
    byCat, traceRows,
    surchargeKonta, surchargeDenk,
    netto, gk, wg, total
  };
}

// === Hilfen für Anzeige ===

// Range-Notation: [0,1,2] → "1–3", [0,2] → "1, 3", [0,1,2,4] → "1–3, 5"
export function formatSegRange(segIds) {
  if (!Array.isArray(segIds) || !segIds.length) return '—';
  const sorted = [...segIds].sort((a, b) => a - b);
  const groups = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
      continue;
    }
    groups.push(start === prev ? `${start + 1}` : `${start + 1}–${prev + 1}`);
    start = sorted[i];
    prev = sorted[i];
  }
  groups.push(start === prev ? `${start + 1}` : `${start + 1}–${prev + 1}`);
  return groups.join(', ');
}

// === v6.4: Bestellliste — Kabel-Materialmenge aggregiert ===
// Aggregiert pro typeId (+ Preis-Bucket, weil Override unterschiedliche EP ergeben kann)
// über eine ODER mehrere Trassen.
//
// Input: state ODER ein Array von Trassen
// Output: [{ typeId, label, unitPrice, isOverride, totalMeters, totalCount, totalCost, occurrences: [...] }]
//   - sortiert nach typeId, dann unitPrice
export function aggregateCableMaterials(stateOrTraces) {
  const traces = Array.isArray(stateOrTraces)
    ? stateOrTraces
    : (stateOrTraces?.traces || []);

  // Bucket-Key: typeId + unitPrice (auf 4 Nachkommastellen, um JS-Float-Quirks zu meiden)
  const buckets = new Map();
  traces.forEach((tr, traceIdx) => {
    (tr.cables || []).forEach(cab => {
      const n = Number(cab.count) || 0;
      if (n <= 0) return;
      const baseLen = cableRangeLength(cab, tr);
      if (baseLen <= 0) return;
      const eff = cableEffectiveLength(cab, baseLen);
      const cableMeters = eff * n;
      const unitPrice = cableUnitPrice(cab);
      const isOverride = cab.priceOverride != null;
      const key = `${cab.typeId}|${unitPrice.toFixed(4)}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          typeId: cab.typeId,
          label: cab.label,
          unitPrice,
          isOverride,
          totalMeters: 0,
          totalCount: 0,
          totalCost: 0,
          occurrences: []
        });
      }
      const b = buckets.get(key);
      b.totalMeters += cableMeters;
      b.totalCount += n;
      b.totalCost += cableMeters * unitPrice;
      b.occurrences.push({
        traceIdx,
        traceId: tr.id,
        segIds: (cab.segIds || []).slice(),
        baseLen,
        effLen: eff,
        count: n,
        cableMeters,
        reserveMode: cab.reserveMode,
        reserveValue: cab.reserveValue
      });
    });
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.typeId.localeCompare(b.typeId) || a.unitPrice - b.unitPrice);
}
