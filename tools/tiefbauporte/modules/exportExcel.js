// v6/modules/exportExcel.js
// Excel-Export mit neuen Spalten und Sheets

import { calcTotals, totalLen, cableEffectiveLength, cableUnitPrice } from './calc.js';
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

  // ===== Kabel (komplett überarbeitet) =====
  const cblRows = [[
    'Trasse #', 'LV-Pos', 'Leitungstyp', 'Typ-Kategorie',
    'Anzahl', 'Reserve-Modus', 'Reserve-Wert',
    'Trassenlänge (m)', 'Effektive Länge (m)',
    'EP Snapshot', 'EP Override', 'EP Effektiv',
    'Summe'
  ]];
  state.traces.forEach((tr, i) => {
    const len = totalLen(tr);
    (tr.cables || []).forEach(cab => {
      const ct = state.cableTypes.find(x => x.id === cab.typeId);
      const kategorie = ct ? (ct.builtin ? 'Standard' : 'Eigen') : '(typ gelöscht)';
      const lvPos = ct?.lvPos || '';
      const eff = cableEffectiveLength(cab, len);
      const unitP = cableUnitPrice(cab);
      const cost = eff * cab.count * unitP;
      cblRows.push([
        i + 1,
        lvPos,
        cab.label,
        kategorie,
        cab.count,
        cab.reserveMode === 'm' ? 'Meter' : 'Prozent',
        cab.reserveValue,
        len,
        eff,
        cab.priceSnapshot,
        cab.priceOverride != null ? cab.priceOverride : '',
        unitP,
        cost
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cblRows), 'Kabel');

  // ===== Kabeltypen-Katalog (neu) =====
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
