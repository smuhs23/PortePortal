// Export: PDF, Excel/CSV, JSON, Energieschema (SVG)
import { state, pushUndo } from './state.js';
import { downloadSchemas, openSchemaPreview, listSchemaTargets, downloadNetworkSchema } from './schema.js';

function clearAllPlacedItems(ctx){
  pushUndo();
  state.objects = [];
  state.traces = [];
  ctx.selection = null;
  ctx.refresh();
  ctx.save();
  ctx.showToast('🗑 Alle Assets und Trassen gelöscht (↶ zum Wiederherstellen)', 'ok');
}

export function initExport(ctx){}

export function openExportDialog(ctx){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="eB">
      <div class="modal">
        <header><h3>Export</h3><button class="close" data-act="x">×</button></header>
        <div class="body">
          <p style="margin:0 0 14px;color:var(--ink-2);font-size:12px">Exportiere deine Kalkulation in verschiedenen Formaten.</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="export-btn" data-fmt="csv" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">📊</span>
              <div>
                <b>CSV (für Excel)</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Hardware + Tiefbau + Kabel als Tabelle</div>
              </div>
            </button>
            <button class="export-btn" data-fmt="pdf" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">📄</span>
              <div>
                <b>PDF (Druck-Vorschau)</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Öffnet Druckdialog – als PDF speichern</div>
              </div>
            </button>
            <button class="export-btn" data-fmt="schema-preview" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">⚡</span>
              <div style="flex:1">
                <b>Energieschema (Vorschau)</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Pro Verteiler ein Schema – im neuen Fenster anzeigen &amp; drucken</div>
              </div>
              <span id="schemaCount" style="font-size:11px;color:var(--ink-3);align-self:center"></span>
            </button>
            <button class="export-btn" data-fmt="schema-svg" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">⬇</span>
              <div>
                <b>Energieschema als SVG</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">SVG-Datei pro Quelle (Trafo/HAK) – in PowerPoint einfügen &amp; bearbeiten</div>
              </div>
            </button>
            <button class="export-btn" data-fmt="network-svg" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">🌐</span>
              <div>
                <b>Logisches Netzwerkschema (SVG)</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">NWS ↔ Verbraucher (Datenleitungen) – in PowerPoint einfügen &amp; bearbeiten</div>
              </div>
            </button>
            <button class="export-btn" data-fmt="json" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">💾</span>
              <div>
                <b>JSON (Backup)</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Komplettes Projekt als Datei</div>
              </div>
            </button>
            <label class="export-btn" style="display:flex;gap:10px;padding:14px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:13px">
              <span style="font-size:24px">📥</span>
              <div style="flex:1">
                <b>JSON importieren</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Backup wieder einlesen</div>
              </div>
              <input type="file" accept="application/json" style="display:none" id="impFile">
            </label>

            <hr style="border:none;border-top:1px solid var(--line);margin:6px 0">

            <button class="export-btn" data-fmt="clear" style="display:flex;gap:10px;padding:14px;background:#fff5f5;border:1px solid var(--red);border-radius:5px;cursor:pointer;text-align:left;font-size:13px;color:var(--red)">
              <span style="font-size:24px">🗑</span>
              <div>
                <b>Alle Assets &amp; Trassen löschen</b>
                <div style="font-size:11px;color:var(--ink-3);margin-top:2px">Setzt nur Pins und Trassen zurück — Katalog &amp; Projekt-Daten bleiben erhalten</div>
              </div>
            </button>
          </div>
        </div>
        <div class="foot"><button data-act="x">Schließen</button></div>
      </div>
    </div>
  `;
  root.querySelector('#eB').onclick = (e) => {
    if (e.target.id === 'eB' || e.target.dataset.act === 'x') root.innerHTML = '';
  };
  // Anzahl Verteiler einblenden
  try {
    const n = listSchemaTargets().length;
    const lbl = root.querySelector('#schemaCount');
    if (lbl) lbl.textContent = n ? `${n} Verteiler` : 'kein Verteiler';
  } catch(e){}
  root.querySelectorAll('.export-btn[data-fmt]').forEach(b => {
    b.onclick = () => {
      const fmt = b.dataset.fmt;
      if (fmt === 'csv') exportCSV();
      if (fmt === 'pdf') exportPDF(ctx);
      if (fmt === 'json') exportJSON();
      if (fmt === 'schema-preview'){ openSchemaPreview(); root.innerHTML=''; return; }
      if (fmt === 'schema-svg'){
        const n = downloadSchemas();
        if (n) ctx.showToast?.(`✓ ${n} Energieschema${n>1?'ta':''} heruntergeladen`, 'ok');
        root.innerHTML=''; return;
      }
      if (fmt === 'network-svg'){
        const n = downloadNetworkSchema();
        if (n) ctx.showToast?.(`✓ Logisches Netzwerkschema heruntergeladen`, 'ok');
        root.innerHTML=''; return;
      }
      if (fmt === 'clear'){
        if (!confirm('Wirklich ALLE gesetzten Assets und Trassen löschen?\n\nDer Katalog und die Projektdaten (Name, WE-Nr.) bleiben erhalten.\n\nDieser Schritt kann mit ↶ rückgängig gemacht werden.')) return;
        clearAllPlacedItems(ctx);
        root.innerHTML = '';
        return;
      }
      root.innerHTML = '';
    };
  });
  root.querySelector('#impFile').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try{
        const data = JSON.parse(r.result);
        if (!confirm('Aktuelles Projekt wird überschrieben. Fortfahren?')) return;
        Object.keys(state).forEach(k => { if (k!=='OF_DEFS' && k!=='PRICE_GRABEN' && k!=='PRICE_HAND') delete state[k]; });
        Object.assign(state, data);
        state.OF_DEFS = state.OF_DEFS || {};
        ctx.save();
        ctx.refresh();
        root.innerHTML = '';
        ctx.showToast('✓ Projekt importiert', 'ok');
      }catch(err){
        alert('Import fehlgeschlagen: ' + err.message);
      }
    };
    r.readAsText(f);
  };
}

function exportCSV(){
  const lines = [];
  lines.push(['# Projekt', state.meta.name, '', '', ''].join(';'));
  lines.push(['# WE', state.meta.we, '', '', ''].join(';'));
  lines.push('');
  lines.push(['# HARDWARE'].join(';'));
  lines.push(['Pos.','Beschreibung','Anzahl','Einheit','EP','Σ'].join(';'));
  state.objects.forEach(o => {
    const c = state.catalog.find(x => x.id === o.catId);
    if (!c) return;
    lines.push([c.pos||'', c.name, o.qty, c.unit, num(o.price), num((o.qty||0)*(o.price||0))].join(';'));
  });

  lines.push('');
  lines.push(['# TIEFBAU'].join(';'));
  lines.push(['Trasse','Segment','OF','Länge (m)','Hand','€/m','Σ'].join(';'));
  state.traces.forEach((t,ti) => {
    t.segments.forEach((s,i) => {
      const d = state.OF_DEFS[s.of]; if (!d) return;
      const ep = d.prOF + d.prWH + (state.PRICE_GRABEN + (s.hand ? state.PRICE_HAND : 0));
      lines.push([`#${ti+1}`, `Seg ${i+1}`, s.of, num(s.len), s.hand?'Ja':'Nein', num(ep), num(s.len*ep)].join(';'));
    });
  });

  lines.push('');
  lines.push(['# KABEL'].join(';'));
  lines.push(['Trasse','Typ','Stk','Segmente','Basis (m)','Reserve','Σ Meter','EP','Σ'].join(';'));
  state.traces.forEach((t,ti) => {
    (t.cables||[]).forEach(c => {
      const base = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      const eff = c.reserveMode === 'm' ? base + (Number(c.reserveValue)||0) : base * (1 + (Number(c.reserveValue)||0)/100);
      const meters = eff * (Number(c.count)||0);
      const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
      lines.push([`#${ti+1}`, c.label, c.count, (c.segIds||[]).map(x=>x+1).join('+'), num(base), `${c.reserveValue}${c.reserveMode==='m'?'m':'%'}`, num(meters), num(unit), num(meters*unit)].join(';'));
    });
  });

  const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
  download(blob, (state.meta.name||'Projekt')+'.csv');
}

function exportPDF(ctx){
  // Re-render BOM in a print window
  const w = window.open('', '_blank');
  w.document.write(`
    <html><head><title>${escapeHtml(state.meta.name||'Projekt')} – Kalkulation</title>
    <style>
      body{font-family:sans-serif;padding:30px;color:#1a1a1a}
      h1{color:#1B2D5E}
      h2{color:#1B2D5E;border-bottom:1px solid #1B2D5E;padding-bottom:4px;margin-top:30px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{text-align:left;background:#1B2D5E;color:#fff;padding:6px 8px}
      td{padding:5px 8px;border-bottom:1px solid #ddd}
      tfoot td{border-top:2px solid #1B2D5E;font-weight:bold}
      .r{text-align:right}
      .grand{font-size:20px;color:#5A8A12;font-weight:bold;text-align:right;border-top:3px solid #1B2D5E;padding-top:10px;margin-top:10px}
    </style></head><body>
    <h1>${escapeHtml(state.meta.name||'Projekt')}</h1>
    <p>WE-Nr.: ${escapeHtml(state.meta.we||'-')}</p>
    ${document.getElementById('bomPanel').innerHTML.replace(/<button[^>]*>.*?<\/button>/g,'').replace(/<input[^>]*>/g,m => {
      const v = m.match(/value="([^"]*)"/);
      return v ? `<b>${v[1]}</b>` : '';
    })}
    <script>setTimeout(()=>window.print(), 500);</script>
    </body></html>
  `);
  w.document.close();
}

function exportJSON(){
  const data = {...state};
  delete data.OF_DEFS; delete data.PRICE_GRABEN; delete data.PRICE_HAND;
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  download(blob, (state.meta.name||'Projekt')+'.json');
}

function download(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function num(n){ return String(Number(n||0).toFixed(2)).replace('.', ','); }
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
