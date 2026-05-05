// v6/modules/exportExcel.js
// Excel-Export mit neuen Spalten und Sheets

import { calcTotals, totalLen, cableEffectiveLength, cableUnitPrice, cableRangeLength, formatSegRange, aggregateCableMaterials } from './calc.js';
import { showInfo, formatStamp, safeFilename } from './ui.js';

export function doExportExcel(ctx) {
  const state = ctx.state;
  const t = calcTotals(state);
  const wb = XLSX.utils.book_new();

  // ===== Deckblatt =====
  const deck = [
    ['TiefbauPorte Vor-Ort-Check (v6)'],
    [],
    ['WE', state.meta.we],
    ['Liegenschaft', state.meta.loc],
    ['Datum', state.meta.date],
    ['Ersteller', state.meta.author],
    ['Kontamination', state.meta.konta ? `JA (${state.meta.kontaPct}%)` : 'nein'],
    ['Denkmalschutz', state.meta.denk ? `JA (${state.meta.denkPct}%)` : 'nein'],
    ['Bemerkung', state.meta.note],
    [],
    ['Σ Hardware', t.sumObj],
    ['Σ Tiefbau', t.sumTrace],
    ['Aufschlag Konta', t.surchargeKonta],
    ['Aufschlag Denkmal', t.surchargeDenk],
    ['Netto', t.netto],
    ['GK', t.gk],
    ['W+G', t.wg],
    ['GESAMT', t.total]
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(deck), 'Deckblatt');

  // ===== Hardware (erweitert) =====
  const objRows = [[
    '#', 'Kategorie', 'LV-Pos', 'Bezeichnung', 'Eigener Name',
    'A', 'kW', 'Menge', 'Einheit', 'EP', 'Summe',
    'Verknüpft Trasse', 'Verknüpft Segment',
    'Lat', 'Lng', 'Notiz', 'Fotos'
  ]];
  state.objects.forEach((o, i) => {
    const c = state.catalog.find(x => x.id === o.catId) || {};
    let linkedTr = '', linkedSeg = '';
    if (o.linkedTraceId) {
      const tr = state.traces.find(x => x.id === o.linkedTraceId);
      if (tr) {
        const trIdx = state.traces.indexOf(tr);
        linkedTr = `Trasse ${trIdx + 1}`;
        linkedSeg = o.linkedSegmentIdx != null ? `Segment ${o.linkedSegmentIdx + 1}` : 'Auto';
      }
    }
    objRows.push([
      i + 1,
      c.category || '',
      c.pos || '',
      c.name || '',
      o.customName || '',
      o.amps || '',
      o.kw || '',
      o.qty,
      c.unit || '',
      o.price,
      o.qty * o.price,
      linkedTr,
      linkedSeg,
      o.lat,
      o.lng,
      o.note || '',
      (o.photos || []).length
    ]);
  });
  objRows.push([]);
  objRows.push(['', '', '', '', '', '', '', '', '', 'Σ Hardware', t.sumObj]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(objRows), 'Hardware');

  // ===== Trassen (Segmente pro Zeile) =====
  const trRows = [['Trasse #', 'Segment #', 'OF-Code', 'OF-Label', 'Länge (m)', 'Handschachtung', 'Notiz Trasse']];
  state.traces.forEach((tr, i) => {
    tr.segments.forEach((seg, j) => {
      const ofLabels = { OF0:'unbefestigt/Rasen', OF1:'Pflaster', OF2:'Beton', OF3:'Asphalt' };
      trRows.push([i + 1, j + 1, seg.of, ofLabels[seg.of] || '', seg.len, seg.hand ? 'JA' : '', j === 0 ? (tr.note || '') : '']);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trRows), 'Trassen');

  // ===== Kabel (v6.3: Range-basiert) =====
  const cblRows = [[
    'Trasse #', 'LV-Pos', 'Leitungstyp', 'Typ-Kategorie',
    'Bereich (Segmente)', 'Bereich-Länge (m)',
    'Anzahl', 'Reserve-Modus', 'Reserve-Wert',
    'Effektive Länge je Stück (m)', 'Gesamt-Kabelmeter (m)',
    'EP Snapshot', 'EP Override', 'EP Effektiv',
    'Summe'
  ]];
  state.traces.forEach((tr, i) => {
    (tr.cables || []).forEach(cab => {
      const ct = state.cableTypes.find(x => x.id === cab.typeId);
      const kategorie = ct ? (ct.builtin ? 'Standard' : 'Eigen') : '(typ gelöscht)';
      const lvPos = ct?.lvPos || '';
      const baseLen = cableRangeLength(cab, tr);     // ← Range-Länge, nicht Trassen-Gesamt
      const eff = cableEffectiveLength(cab, baseLen);
      const totalCableM = eff * (Number(cab.count) || 0);
      const unitP = cableUnitPrice(cab);
      const cost = totalCableM * unitP;
      cblRows.push([
        i + 1,
        lvPos,
        cab.label,
        kategorie,
        formatSegRange(cab.segIds || []),
        baseLen,
        cab.count,
        cab.reserveMode === 'm' ? 'Meter' : 'Prozent',
        cab.reserveValue,
        eff,
        totalCableM,
        cab.priceSnapshot,
        cab.priceOverride != null ? cab.priceOverride : '',
        unitP,
        cost
      ]);
    });
  });
  // v6.4: Footer-Zeile mit Σ über alle Cable-Zeilen
  if (cblRows.length > 1) {
    let sumBaseLen = 0, sumCount = 0, sumEff = 0, sumTotalCableM = 0, sumCost = 0;
    for (let r = 1; r < cblRows.length; r++) {
      sumBaseLen += Number(cblRows[r][5]) || 0;
      sumCount   += Number(cblRows[r][6]) || 0;
      // Eff je Stück nicht aufsummieren — verschiedene Werte; nur Total-Kabelmeter ist sinnvoll
      sumTotalCableM += Number(cblRows[r][10]) || 0;
      sumCost    += Number(cblRows[r][14]) || 0;
    }
    cblRows.push([
      'Σ', '', '', '', '',
      sumBaseLen,            // Σ Bereich-Längen (informativ)
      sumCount,              // Σ Stück
      '', '',
      '',                    // Eff je Stück sinnlos zu summieren
      sumTotalCableM,        // ← die wichtige Zahl: Gesamt-Kabelmeter
      '', '', '',
      sumCost
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cblRows), 'Kabel');

  // ===== v6.4: Bestellliste — pro Kabeltyp aggregiert über alle Trassen =====
  const bom = aggregateCableMaterials(state);
  const bomRows = [[
    'Kabeltyp', 'LV-Pos', 'EP-Modus', 'Σ Stück',
    'Σ Bestellmeter', 'EP (€/m)', 'Σ Kosten',
    '# Vorkommen (Trassen)'
  ]];
  let bomTotalM = 0, bomTotalCount = 0, bomTotalCost = 0;
  bom.forEach(b => {
    const ct = state.cableTypes.find(x => x.id === b.typeId);
    bomTotalM += b.totalMeters;
    bomTotalCount += b.totalCount;
    bomTotalCost += b.totalCost;
    bomRows.push([
      b.label,
      ct?.lvPos || '',
      b.isOverride ? 'Override' : 'Snapshot',
      b.totalCount,
      b.totalMeters,
      b.unitPrice,
      b.totalCost,
      b.occurrences.length
    ]);
  });
  if (bom.length) {
    bomRows.push(['Σ', '', '', bomTotalCount, bomTotalM, '', bomTotalCost, '']);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bomRows), 'Bestellliste');

  // ===== Kabeltypen-Katalog =====
  const kabTypes = [['ID', 'Bezeichnung', 'Kategorie', 'EP (€/m)', 'LV-Position', 'Farbe', 'Angelegt von']];
  state.cableTypes.forEach(ct => {
    kabTypes.push([
      ct.id,
      ct.label,
      ct.builtin ? 'Standard' : 'Eigen',
      ct.price,
      ct.lvPos || '',
      ct.color || '',
      ct.builtin ? 'System' : 'User'
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kabTypes), 'Kabeltypen');

  XLSX.writeFile(wb, `UnionE_VorOrtCheck_${safeFilename(state.meta.we) || 'WE'}_${formatStamp()}.xlsx`);
  showInfo('Excel exportiert ✓');
}
