// v6/modules/exportOther.js
// CSV (Vermesser), GPX und JSON-Backup

import { showInfo, formatStamp, safeFilename } from './ui.js';

export function doExportCSV(ctx) {
  const state = ctx.state;
  const lines = [];
  // CSV bleibt schlank — für Vermesser nur Koordinaten + Kernkennung
  lines.push('ID;Typ;Kategorie;Bezeichnung;Lat;Lng;Stromstärke_A;Leistung_kW;Menge;Notiz');

  state.objects.forEach((o, i) => {
    const c = state.catalog.find(x => x.id === o.catId) || {};
    const cells = [
      'OBJ_' + (i + 1),
      c.icon || '',
      c.category || '',
      (c.name || '').replace(/;/g, ','),
      o.lat.toFixed(7),
      o.lng.toFixed(7),
      o.amps || '',
      o.kw || '',
      o.qty,
      (o.note || '').replace(/[;\n\r]/g, ' ')
    ];
    lines.push(cells.join(';'));
  });

  state.traces.forEach((tr, i) => {
    tr.points.forEach((p, j) => {
      const cells = [
        `TR${i + 1}_P${j + 1}`,
        'TRASSENPUNKT',
        'Trasse',
        `Trasse ${i + 1} · Punkt ${j + 1}`,
        p[0].toFixed(7),
        p[1].toFixed(7),
        '', '', '1',
        (tr.note || '').replace(/[;\n\r]/g, ' ')
      ];
      lines.push(cells.join(';'));
    });
  });

  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  download(blob, `UnionE_Vermesser_${safeFilename(state.meta.we) || 'WE'}_${formatStamp()}.csv`);
  showInfo('CSV exportiert ✓');
}

export function doExportGPX(ctx) {
  const state = ctx.state;
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
  gpx += '<gpx version="1.1" creator="TiefbauPorte · Union E GmbH" xmlns="http://www.topografix.com/GPX/1/1">\n';
  gpx += `  <metadata><name>${esc('WE ' + state.meta.we + ' ' + state.meta.loc)}</name><time>${new Date().toISOString()}</time></metadata>\n`;

  state.objects.forEach((o, i) => {
    const c = state.catalog.find(x => x.id === o.catId) || {};
    const descParts = [c.category, o.amps ? o.amps + 'A' : '', o.kw ? o.kw + 'kW' : '', o.customName ? 'Name: ' + o.customName : '', o.note].filter(Boolean);
    gpx += `  <wpt lat="${o.lat}" lon="${o.lng}">\n`;
    gpx += `    <name>${esc('#' + (i + 1) + ' ' + (c.icon || '') + ' ' + (o.customName || c.name))}</name>\n`;
    gpx += `    <desc>${esc(descParts.join(' · '))}</desc>\n`;
    gpx += `    <sym>${esc(c.category || 'Waypoint')}</sym>\n`;
    gpx += `  </wpt>\n`;
  });

  state.traces.forEach((tr, i) => {
    gpx += `  <trk>\n    <name>${esc('Trasse ' + (i + 1))}</name>\n    <desc>${esc(tr.note || '')}</desc>\n    <trkseg>\n`;
    tr.points.forEach(p => {
      gpx += `      <trkpt lat="${p[0]}" lon="${p[1]}"/>\n`;
    });
    gpx += '    </trkseg>\n  </trk>\n';
  });

  gpx += '</gpx>';
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  download(blob, `UnionE_${safeFilename(state.meta.we) || 'WE'}_${formatStamp()}.gpx`);
  showInfo('GPX exportiert ✓');
}

export function doExportJSON(ctx) {
  const state = ctx.state;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  download(blob, `TiefbauPorte_${safeFilename(state.meta.we) || 'WE'}_${formatStamp()}.json`);
  showInfo('JSON-Backup exportiert ✓');
}

export function doImportJSON(ctx, file) {
  const r = new FileReader();
  r.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      // Basic-Validierung
      if (!imported.schemaVersion || !Array.isArray(imported.objects)) {
        if (!confirm('Datei sieht nicht wie ein v6-Backup aus. Trotzdem importieren?')) return;
      }
      // Vor dem Überschreiben: Undo-Snapshot! Sonst ist versehentlicher Import nicht rückholbar.
      if (ctx.pushUndo) ctx.pushUndo();
      // In-place überschreiben statt Replace (ctx.state ist ein Getter)
      Object.keys(ctx.state).forEach(k => delete ctx.state[k]);
      Object.assign(ctx.state, imported);
      ctx.save();
      ctx.render();
      showInfo('Import erfolgreich ✓');
    } catch (err) {
      alert('Import-Fehler: ' + err.message);
    }
  };
  r.readAsText(file);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
