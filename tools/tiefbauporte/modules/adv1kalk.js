// v6/modules/kalk.js
// Kalkulations-Übersicht — zeigt Zusammenfassung aller Kosten

import { calcTotals, totalLen, formatSegRange, cableRangeLength, cableEffectiveLength, cableUnitPrice } from './calc.js';
import { openModal, closeModal, fmt, fmtEur, escapeHtml } from './ui.js';
import { OF_DEFS } from './constants.js';

export function openKalk(ctx) {
  const { state } = ctx;
  const t = calcTotals(state);
  const sheet = document.querySelector('#modalKalk .sheet');

  const meta = state.meta;
  const we = meta.we ? `WE ${meta.we}` : '—';
  const loc = meta.loc || '—';

  // ===== Hardware-Tabelle =====
  let hwHtml = '';
  const cats = Object.keys(t.byCat);
  if (cats.length === 0) {
    hwHtml = '<p style="color:#888;font-size:13px;text-align:center;padding:12px">Keine Hardware erfasst</p>';
  } else {
    cats.forEach(cat => {
      hwHtml += `<div class="kalk-cat-label">${escapeHtml(cat)}</div>`;
      t.byCat[cat].forEach(row => {
        const nameStr = row.customName
          ? `${escapeHtml(row.name)} <span style="color:#78B51A;font-size:11px">(${escapeHtml(row.customName)})</span>`
          : escapeHtml(row.name);
        hwHtml += `
          <div class="kalk-row">
            <span class="kalk-desc">${nameStr}</span>
            <span class="kalk-num">${row.qty} ${escapeHtml(row.unit)}</span>
            <span class="kalk-num">${fmtEur(row.price)}</span>
            <span class="kalk-num kalk-sum">${fmtEur(row.sum)}</span>
          </div>`;
      });
    });
  }

  // ===== Trassen-Tabelle =====
  let trHtml = '';
  if (t.traceRows.length === 0) {
    trHtml = '<p style="color:#888;font-size:13px;text-align:center;padding:12px">Keine Trassen erfasst</p>';
  } else {
    t.traceRows.forEach((tr, i) => {
      const lenM = tr.len.toFixed(1);
      const note = tr.note ? ` · <span style="color:#888;font-size:11px">${escapeHtml(tr.note)}</span>` : '';

      // OF-Aufschlüsselung
      let ofHtml = '';
      Object.entries(tr.ofBreak).forEach(([of, m]) => {
        const def = OF_DEFS[of];
        if (!def) return;
        ofHtml += `<span class="kalk-chip" style="background:${def.color}22;color:${def.color};border:1px solid ${def.color}44">${of}: ${m.toFixed(0)} m</span>`;
      });

      // Kabel-Aufschlüsselung
      let cabHtml = '';
      if (tr.cableBreak && tr.cableBreak.length > 0) {
        tr.cableBreak.forEach(c => {
          cabHtml += `<div class="kalk-sub-row">
            <span class="kalk-desc">⚡ ${escapeHtml(c.label)} × ${c.count} · ${formatSegRange(c.segIds)}</span>
            <span class="kalk-num">${c.cableMeters.toFixed(0)} m</span>
            <span class="kalk-num">${fmtEur(c.unitPrice)}/m</span>
            <span class="kalk-num kalk-sum">${fmtEur(c.cost)}</span>
          </div>`;
        });
      }

      trHtml += `
        <div class="kalk-trace-header">
          <span>Trasse ${i + 1}${note} · ${lenM} m</span>
          <span class="kalk-num kalk-sum">${fmtEur(tr.total)}</span>
        </div>
        <div class="kalk-row kalk-sub-row">
          <span class="kalk-desc">🚧 Tiefbau (OF + Graben)</span>
          <span></span>
          <span></span>
          <span class="kalk-num">${fmtEur(tr.tOF + tr.tWH + tr.tGR)}</span>
        </div>
        ${cabHtml}
        ${ofHtml ? `<div style="padding:2px 8px 6px 8px">${ofHtml}</div>` : ''}
      `;
    });
  }

  // ===== Aufschläge =====
  const surchargeHtml = `
    ${t.surchargeKonta > 0 ? `
    <div class="kalk-row">
      <span class="kalk-desc">☣ Kontamination (${meta.kontaPct}% auf Tiefbau)</span>
      <span></span><span></span>
      <span class="kalk-num kalk-sum">${fmtEur(t.surchargeKonta)}</span>
    </div>` : ''}
    ${t.surchargeDenk > 0 ? `
    <div class="kalk-row">
      <span class="kalk-desc">🛡 Denkmalschutz (${meta.denkPct}% auf Tiefbau)</span>
      <span></span><span></span>
      <span class="kalk-num kalk-sum">${fmtEur(t.surchargeDenk)}</span>
    </div>` : ''}
  `;

  sheet.innerHTML = `
    <header>
      <h2>💰 Kalkulation</h2>
      <button class="close" onclick="document.getElementById('modalKalk').classList.remove('open')">✕</button>
    </header>
    <div class="body">

      <div class="kalk-meta">
        <span>${escapeHtml(we)}</span>
        <span style="color:#888">${escapeHtml(loc)}</span>
        ${meta.date ? `<span style="color:#888">${meta.date}</span>` : ''}
      </div>

      <div class="kalk-section-label">Hardware</div>
      ${hwHtml}
      <div class="kalk-total-row">
        <span>Σ Hardware</span>
        <span class="kalk-num kalk-sum">${fmtEur(t.sumObj)}</span>
      </div>

      <div class="kalk-section-label" style="margin-top:16px">Trassen & Kabel</div>
      ${trHtml}
      <div class="kalk-total-row">
        <span>Σ Trassen (Tiefbau + Kabel)</span>
        <span class="kalk-num kalk-sum">${fmtEur(t.sumTrace)}</span>
      </div>
      ${t.sumCableMeters > 0 ? `<div style="font-size:11px;color:#888;padding:2px 0 6px 0">📏 Gesamt Kabelmeter: ${Math.round(t.sumCableMeters)} m</div>` : ''}

      ${surchargeHtml}

      <div class="kalk-divider"></div>

      <div class="kalk-total-row kalk-netto">
        <span>Netto</span>
        <span class="kalk-num kalk-sum">${fmtEur(t.netto)}</span>
      </div>
      ${meta.gk > 0 ? `
      <div class="kalk-row">
        <span class="kalk-desc">GK (${meta.gk}%)</span>
        <span></span><span></span>
        <span class="kalk-num">${fmtEur(t.gk)}</span>
      </div>` : ''}
      ${meta.wg > 0 ? `
      <div class="kalk-row">
        <span class="kalk-desc">W+G (${meta.wg}%)</span>
        <span></span><span></span>
        <span class="kalk-num">${fmtEur(t.wg)}</span>
      </div>` : ''}

      <div class="kalk-divider"></div>
      <div class="kalk-total-row kalk-gesamt">
        <span>GESAMT</span>
        <span class="kalk-num kalk-sum kalk-gesamt-val">${fmtEur(t.total)}</span>
      </div>

    </div>
    <div class="foot">
      <button class="primary" onclick="document.getElementById('modalKalk').classList.remove('open')">Schließen</button>
    </div>
  `;

  // Inline-Styles für Kalk-spezifische Elemente
  if (!document.getElementById('kalk-styles')) {
    const style = document.createElement('style');
    style.id = 'kalk-styles';
    style.textContent = `
      .kalk-meta { display:flex; gap:12px; font-size:13px; font-weight:600; color:var(--navy); margin-bottom:12px; flex-wrap:wrap; }
      .kalk-section-label { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--navy); opacity:.6; padding:4px 0 6px; }
      .kalk-cat-label { font-size:12px; font-weight:600; color:var(--navy); padding:6px 0 2px; opacity:.75; }
      .kalk-row { display:grid; grid-template-columns:1fr auto auto auto; gap:4px 8px; align-items:baseline; padding:3px 0; font-size:13px; }
      .kalk-sub-row { grid-template-columns:1fr auto auto auto; font-size:12px; opacity:.85; padding:2px 8px; }
      .kalk-desc { color:var(--dark); }
      .kalk-num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; min-width:60px; }
      .kalk-sum { color:var(--navy); font-weight:600; }
      .kalk-trace-header { display:flex; justify-content:space-between; align-items:baseline; font-size:13px; font-weight:600; color:var(--navy); padding:6px 0 2px; border-top:1px solid var(--border); margin-top:4px; }
      .kalk-total-row { display:flex; justify-content:space-between; align-items:baseline; font-size:14px; font-weight:700; color:var(--navy); padding:8px 0; }
      .kalk-netto { font-size:15px; }
      .kalk-gesamt { font-size:17px; }
      .kalk-gesamt-val { font-size:19px; color:var(--green); }
      .kalk-divider { border:none; border-top:2px solid var(--navy); margin:8px 0; opacity:.2; }
      .kalk-chip { display:inline-block; font-size:11px; padding:1px 6px; border-radius:4px; margin:2px 3px 2px 0; }
    `;
    document.head.appendChild(style);
  }

  openModal('modalKalk');
}
