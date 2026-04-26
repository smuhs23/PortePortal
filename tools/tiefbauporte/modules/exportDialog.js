// v6/modules/exportDialog.js
// Export-Dialog (Auswahl aller Export-Formate)

import { openModal, closeModal } from './ui.js';
import { doExportExcel } from './exportExcel.js';
import { doExportPDF } from './exportPdf.js';
import { doExportCSV, doExportGPX, doExportJSON, doImportJSON } from './exportOther.js';

export function openExport(ctx) {
  const sheet = document.querySelector('#modalExport .sheet');
  sheet.innerHTML = `
    <header>
      <h2>Export & Daten</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      <div style="background:var(--bg);padding:12px;border-radius:8px;margin-bottom:12px">
        <label style="margin:0;display:flex;align-items:center;cursor:pointer">
          <input type="checkbox" id="expKeepView" style="width:auto;margin-right:8px">
          <span style="font-size:13px">Aktuellen Kartenausschnitt verwenden (kein Auto-Zoom)</span>
        </label>
        <small style="color:#666;display:block;margin-top:4px;margin-left:24px">Wenn aktiv, wird der aktuelle Zoom für die Karte im PDF übernommen.</small>

        <label style="margin:10px 0 0;display:flex;align-items:center;cursor:pointer">
          <input type="checkbox" id="expWithTracePages" style="width:auto;margin-right:8px" checked>
          <span style="font-size:13px">Kabel-Belegungsseiten je Trasse im PDF anhängen</span>
        </label>
        <small style="color:#666;display:block;margin-top:4px;margin-left:24px">Eine eigene Seite pro Trasse mit voller Kabel-Belegung (Tiefbau + Kabel).</small>
      </div>

      <button data-act="pdf" style="width:100%;padding:14px;background:var(--navy);color:#fff;border:none;border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px">📄 PDF-Protokoll (Querformat, Karte + Fotos)</button>
      <button data-act="excel" style="width:100%;padding:14px;background:var(--green);color:var(--navy);border:none;border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px">📊 Excel exportieren</button>

      <hr style="margin:16px 0">
      <label style="margin-bottom:8px;font-size:12px;color:var(--navy);font-weight:bold">VERMESSER-EXPORT</label>
      <button data-act="csv" style="width:100%;padding:13px;background:#fff;color:var(--navy);border:2px solid var(--navy);border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px">📍 GPS-CSV (Vermesser)</button>
      <button data-act="gpx" style="width:100%;padding:13px;background:#fff;color:var(--navy);border:2px solid var(--navy);border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px">🛰 GPX-Datei (GPS-Geräte)</button>

      <hr style="margin:16px 0">
      <button data-act="json" style="width:100%;padding:13px;background:#fff;color:var(--navy);border:2px solid var(--navy);border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:8px">💾 JSON-Backup</button>
      <label style="display:block;margin-top:8px">JSON-Backup importieren</label>
      <input type="file" id="importFile" accept=".json">
      <hr style="margin:16px 0">
      <button data-act="resetTr" style="width:100%;padding:13px;background:#fff;color:var(--orange);border:2px solid var(--orange);border-radius:8px;font-weight:bold;cursor:pointer;margin-bottom:8px">🚧 Alle Trassen löschen</button>
      <button data-act="resetAll" style="width:100%;padding:13px;background:#fff;color:var(--red);border:2px solid var(--red);border-radius:8px;font-weight:bold;cursor:pointer">🗑 Alle Aufnahmen löschen (HW + Trassen)</button>
    </div>
    <div class="foot">
      <button class="secondary" data-act="close" style="flex:1">Schließen</button>
    </div>
  `;

  sheet.onclick = async (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    if (act === 'close') { closeModal('modalExport'); return; }
    if (act === 'pdf') {
      const keepView = document.getElementById('expKeepView').checked;
      const withTracePages = document.getElementById('expWithTracePages').checked;
      closeModal('modalExport');
      await doExportPDF(ctx, { keepView, withTracePages });
      return;
    }
    if (act === 'excel') { doExportExcel(ctx); return; }
    if (act === 'csv') { doExportCSV(ctx); return; }
    if (act === 'gpx') { doExportGPX(ctx); return; }
    if (act === 'json') { doExportJSON(ctx); return; }
    if (act === 'resetTr') {
      if (ctx.state.traces.length === 0) { alert('Keine Trassen vorhanden'); return; }
      if (!confirm(`Wirklich alle ${ctx.state.traces.length} Trassen löschen?`)) return;
      ctx.state.traces = [];
      closeModal('modalExport');
      ctx.render();
      return;
    }
    if (act === 'resetAll') {
      if (!confirm('ALLE Aufnahmen löschen? (Katalog & Projekt bleiben)')) return;
      ctx.state.objects = [];
      ctx.state.traces = [];
      closeModal('modalExport');
      ctx.render();
      return;
    }
  };

  const importInput = sheet.querySelector('#importFile');
  if (importInput) {
    importInput.onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      doImportJSON(ctx, f);
      closeModal('modalExport');
    };
  }

  openModal('modalExport');
}
