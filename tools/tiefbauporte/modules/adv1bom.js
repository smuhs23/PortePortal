// v6.4: Material-Bestellliste über alle Trassen
import { aggregateCableMaterials, totalLen } from './calc.js';
import { openModal, closeModal, fmt, fmtEur, escapeHtml } from './ui.js';

export function openBOM(ctx) {
  const bom = aggregateCableMaterials(ctx.state);
  const traces = ctx.state.traces || [];
  const totalLenAll = traces.reduce((s, t) => s + totalLen(t), 0);

  const sheet = document.querySelector('#modalBOM .sheet');
  let bodyHtml;

  if (!bom.length) {
    bodyHtml = `
      <div style="padding:20px;color:#999;text-align:center;font-size:13px;background:var(--bg);border-radius:8px">
        Keine Kabel-Belegung im Projekt.<br>
        <span style="font-size:11px">Erst Trassen mit Kabel-Belegung anlegen — die Bestellmengen werden automatisch über alle Trassen aufaddiert.</span>
      </div>
    `;
  } else {
    const grandMeters = bom.reduce((s, b) => s + b.totalMeters, 0);
    const grandCost   = bom.reduce((s, b) => s + b.totalCost, 0);

    let rowsHtml = '';
    bom.forEach(b => {
      const ct = ctx.state.cableTypes.find(c => c.id === b.typeId);
      const color = ct?.color || '#666';
      const lvPos = ct?.lvPos ? ` · LV ${escapeHtml(ct.lvPos)}` : '';
      const ovr   = b.isOverride ? ' <span class="bom-ovr">Override</span>' : '';
      const occInfo = b.occurrences.length === 1
        ? `1 Vorkommen`
        : `${b.occurrences.length} Vorkommen in ${new Set(b.occurrences.map(o => o.traceId)).size} Trasse${new Set(b.occurrences.map(o => o.traceId)).size === 1 ? '' : 'n'}`;

      // Reserve-Beschreibung sammeln (kann variieren pro Vorkommen)
      const reserves = new Set(b.occurrences.map(o => `${o.reserveValue}${o.reserveMode === 'm' ? 'm' : '%'}`));
      const reserveStr = reserves.size === 1 ? Array.from(reserves)[0] : `gemischt`;

      rowsHtml += `
        <div class="bom-row">
          <div class="bom-color" style="background:${color}"></div>
          <div class="bom-name">
            <div class="bom-lbl">${escapeHtml(b.label)}${ovr}</div>
            <div class="bom-meta">Reserve ${reserveStr} · ${occInfo}${lvPos}</div>
          </div>
          <div class="bom-meters">
            <div class="bom-m"><b>${fmt(b.totalMeters)} m</b></div>
            <div class="bom-cnt">${b.totalCount}× Stk</div>
          </div>
          <div class="bom-price">
            <div class="bom-p">${fmt(b.unitPrice)} €/m</div>
            <div class="bom-cost">${fmtEur(b.totalCost)}</div>
          </div>
        </div>
      `;
    });

    bodyHtml = `
      <div class="bom-stats">
        <div><span>Trassen</span><b>${traces.length}</b></div>
        <div><span>Σ Trassen-Länge</span><b>${fmt(totalLenAll)} m</b></div>
        <div><span>Kabel-Typen</span><b>${bom.length}</b></div>
        <div><span>Σ Kabel-Stück</span><b>${bom.reduce((s, b) => s + b.totalCount, 0)}</b></div>
      </div>
      <div class="bom-list">
        ${rowsHtml}
      </div>
      <div class="bom-grand">
        <div>Σ Bestellmenge (alle Kabel, inkl. Reserve)</div>
        <div class="bom-grand-vals">
          <span class="bom-grand-m">${fmt(grandMeters)} m</span>
          <span class="bom-grand-cost">${fmtEur(grandCost)}</span>
        </div>
      </div>
      <div class="bom-hint">
        💡 Mengen sind <b>genau</b> ausgewiesen (inkl. Reserve, ohne kaufmännische Rundung). Beim Bestellen ggf. auf Trommel-/Rollen-Größen aufrunden.
      </div>
    `;
  }

  sheet.innerHTML = `
    <header>
      <h2>📋 Material-Bestellliste</h2>
      <button class="close" data-act="close">✕</button>
    </header>
    <div class="body">
      ${bodyHtml}
    </div>
    <div class="foot">
      <button class="primary" data-act="close">Schließen</button>
    </div>
  `;

  sheet.onclick = (e) => {
    if (e.target.dataset.act === 'close') closeModal('modalBOM');
  };
  openModal('modalBOM');
}
