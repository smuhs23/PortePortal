// v6/modules/calc.js
// Berechnungen: Distanzen, Segment-Längen, Gesamt-Totals

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

export function cableEffectiveLength(cable, traceLen) {
  if (cable.reserveMode === 'm') {
    return traceLen + (Number(cable.reserveValue) || 0);
  }
  return traceLen * (1 + (Number(cable.reserveValue) || 0) / 100);
}

export function cableUnitPrice(cable) {
  return cable.priceOverride != null ? Number(cable.priceOverride) : Number(cable.priceSnapshot) || 0;
}

export function calcTotals(state) {
  let sumObj = 0, sumTrace = 0, sumCable = 0, sumOF = 0, sumGraben = 0;
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

    let tC = 0;
    const cableBreak = [];
    (t.cables || []).forEach(c => {
      const n = Number(c.count) || 0;
      if (n <= 0) return;
      const effLen = cableEffectiveLength(c, len);
      const unitPrice = cableUnitPrice(c);
      const cost = effLen * n * unitPrice;
      tC += cost;
      cableBreak.push({
        typeId: c.typeId,
        label: c.label,
        count: n,
        reserveMode: c.reserveMode,
        reserveValue: c.reserveValue,
        effLen,
        unitPrice,
        priceOverride: c.priceOverride,
        cost
      });
    });

    sumOF += tOF + tWH;
    sumGraben += tGR;
    sumCable += tC;
    const tTotal = tOF + tWH + tGR + tC;
    sumTrace += tTotal;

    traceRows.push({
      id: t.id,
      len, ofBreak, cableBreak,
      tOF, tWH, tGR, tC,
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
    sumObj, sumTrace, sumCable, sumOF, sumGraben,
    byCat, traceRows,
    surchargeKonta, surchargeDenk,
    netto, gk, wg, total
  };
}
