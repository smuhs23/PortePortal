// BOM / Kalkulation panel
import { state } from './state.js';

export function renderBOM(ctx){
  const el = document.getElementById('bomPanel');

  // Aggregate assets by catalog
  const assetMap = new Map();
  state.objects.forEach(o => {
    const c = state.catalog.find(x => x.id === o.catId);
    if (!c) return;
    const key = c.id;
    const cur = assetMap.get(key) || { name: c.name, pos: c.pos, unit: c.unit, count: 0, sum: 0 };
    cur.count += Number(o.qty)||0;
    cur.sum += (Number(o.qty)||0) * (Number(o.price)||0);
    assetMap.set(key, cur);
  });

  // Aggregate cables
  const cableMap = new Map();
  let trenchTotal = 0;
  let trenchByOF = {};
  state.traces.forEach(t => {
    t.segments.forEach(s => {
      const d = state.OF_DEFS[s.of];
      if (d) trenchTotal += s.len * (d.prOF + d.prWH + (state.PRICE_GRABEN + (s.hand ? state.PRICE_HAND : 0)));
      trenchByOF[s.of] = (trenchByOF[s.of]||0) + s.len;
    });
    (t.cables||[]).forEach(c => {
      const base = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      if (base <= 0) return;
      const eff = c.reserveMode === 'm' ? base + (Number(c.reserveValue)||0) : base * (1 + (Number(c.reserveValue)||0)/100);
      const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
      const meters = eff * (Number(c.count)||0);
      const cur = cableMap.get(c.typeId) || { label: c.label, unitPrice: unit, totalCount: 0, totalMeters: 0, totalCost: 0 };
      cur.totalCount += Number(c.count)||0;
      cur.totalMeters += meters;
      cur.totalCost += meters * unit;
      cableMap.set(c.typeId, cur);
    });
  });

  // Sums
  let assetSum = 0; assetMap.forEach(v => assetSum += v.sum);
  let cableSum = 0; cableMap.forEach(v => cableSum += v.totalCost);
  const subtotal = assetSum + trenchTotal + cableSum;
  const meta = state.meta;
  const konta = meta.konta ? trenchTotal * (Number(meta.kontaPct)||0)/100 : 0;
  const denk  = meta.denk  ? trenchTotal * (Number(meta.denkPct)||0)/100 : 0;
  const netto = subtotal + konta + denk;
  const gk = netto * (Number(meta.gk)||0)/100;
  const wg = (netto + gk) * (Number(meta.wg)||0)/100;
  const total = netto + gk + wg;

  let html = '';

  // Assets
  if (assetMap.size){
    html += `<div class="bom-section">
      <h4>Hardware (${assetMap.size} Typen)</h4>
      <table class="bom-table">
        <thead><tr><th>Pos.</th><th>Beschreibung</th><th class="r">Anzahl</th><th class="r">EP</th><th class="r">Σ</th></tr></thead>
        <tbody>
          ${[...assetMap.values()].map(v => `<tr>
            <td>${escapeHtml(v.pos||'-')}</td>
            <td>${escapeHtml(v.name)}</td>
            <td class="r">${v.count} ${v.unit}</td>
            <td class="r">${fmtEur(v.sum / Math.max(v.count,1))}</td>
            <td class="r">${fmtEur(v.sum)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Σ Hardware</td><td class="r">${fmtEur(assetSum)}</td></tr></tfoot>
      </table>
    </div>`;
  }

  // Tiefbau
  if (state.traces.length){
    html += `<div class="bom-section">
      <h4>Tiefbau (Σ Länge: ${Object.values(trenchByOF).reduce((a,b)=>a+b,0).toFixed(1)} m)</h4>
      <table class="bom-table">
        <thead><tr><th>Oberfläche</th><th class="r">Meter</th><th class="r">€/m</th><th class="r">Σ</th></tr></thead>
        <tbody>
          ${Object.entries(trenchByOF).map(([of, m]) => {
            const d = state.OF_DEFS[of]; if (!d) return '';
            const epM = d.prOF + d.prWH + state.PRICE_GRABEN;
            return `<tr>
              <td><span style="background:${d.color};color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;font-size:9px">${of}</span> ${d.label}</td>
              <td class="r">${m.toFixed(1)}</td>
              <td class="r">${epM.toFixed(2)}</td>
              <td class="r">${fmtEur(m*epM)}</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><td colspan="3">Σ Tiefbau</td><td class="r">${fmtEur(trenchTotal)}</td></tr></tfoot>
      </table>
    </div>`;
  }

  // Cables
  if (cableMap.size){
    html += `<div class="bom-section">
      <h4>Kabel-Bestellliste</h4>
      <table class="bom-table">
        <thead><tr><th>Typ</th><th class="r">Stk</th><th class="r">Meter</th><th class="r">EP</th><th class="r">Σ</th></tr></thead>
        <tbody>
          ${[...cableMap.values()].map(v => `<tr>
            <td>${escapeHtml(v.label)}</td>
            <td class="r">${v.totalCount}</td>
            <td class="r"><b>${v.totalMeters.toFixed(1)}</b></td>
            <td class="r">${v.unitPrice.toFixed(2)}</td>
            <td class="r">${fmtEur(v.totalCost)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td colspan="4">Σ Kabel</td><td class="r">${fmtEur(cableSum)}</td></tr></tfoot>
      </table>
    </div>`;
  }

  // Totals
  html += `<div class="bom-section">
    <h4>Gesamtkalkulation</h4>
    <div class="bom-totals">
      <div class="ln"><span>Hardware</span><b>${fmtEur(assetSum)}</b></div>
      <div class="ln"><span>Tiefbau</span><b>${fmtEur(trenchTotal)}</b></div>
      <div class="ln"><span>Kabel</span><b>${fmtEur(cableSum)}</b></div>
      <div class="ln"><span>Zwischensumme</span><b>${fmtEur(subtotal)}</b></div>
      ${meta.konta ? `<div class="ln"><span>Kontamination ${meta.kontaPct}%</span><b>${fmtEur(konta)}</b></div>` : ''}
      ${meta.denk ? `<div class="ln"><span>Denkmalschutz ${meta.denkPct}%</span><b>${fmtEur(denk)}</b></div>` : ''}
      <div class="ln"><span>Netto</span><b>${fmtEur(netto)}</b></div>
      <div class="ln"><span>GK ${meta.gk||0}%</span><b>${fmtEur(gk)}</b></div>
      <div class="ln"><span>W&amp;G ${meta.wg||0}%</span><b>${fmtEur(wg)}</b></div>
      <div class="ln grand"><span>Σ Brutto</span><b>${fmtEur(total)}</b></div>
    </div>
  </div>

  <div class="bom-section">
    <h4>Aufschläge</h4>
    <div class="field" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="bomKonta" ${meta.konta?'checked':''}>
      <label style="margin:0;flex:1">Kontamination</label>
      <input type="number" id="bomKontaPct" value="${meta.kontaPct||10}" style="width:60px;padding:3px 6px"> %
    </div>
    <div class="field" style="display:flex;align-items:center;gap:8px">
      <input type="checkbox" id="bomDenk" ${meta.denk?'checked':''}>
      <label style="margin:0;flex:1">Denkmalschutz</label>
      <input type="number" id="bomDenkPct" value="${meta.denkPct||5}" style="width:60px;padding:3px 6px"> %
    </div>
    <div class="field-row">
      <div class="field"><label>GK %</label><input type="number" id="bomGK" value="${meta.gk||18}"></div>
      <div class="field"><label>W&amp;G %</label><input type="number" id="bomWG" value="${meta.wg||5}"></div>
    </div>
  </div>`;

  el.innerHTML = html;

  // Wire
  const onMeta = () => {
    state.meta.konta = el.querySelector('#bomKonta').checked;
    state.meta.kontaPct = Number(el.querySelector('#bomKontaPct').value)||0;
    state.meta.denk = el.querySelector('#bomDenk').checked;
    state.meta.denkPct = Number(el.querySelector('#bomDenkPct').value)||0;
    state.meta.gk = Number(el.querySelector('#bomGK').value)||0;
    state.meta.wg = Number(el.querySelector('#bomWG').value)||0;
    ctx.save();
    renderBOM(ctx);
    // Update top total
    let sum = 0;
    state.objects.forEach(o => sum += (Number(o.qty)||0) * (Number(o.price)||0));
    state.traces.forEach(t => {
      t.segments.forEach(s => {
        const d = state.OF_DEFS[s.of];
        if (d) sum += s.len * (d.prOF + d.prWH + (state.PRICE_GRABEN + (s.hand ? state.PRICE_HAND : 0)));
      });
    });
    document.getElementById('topTotal').textContent = fmtEur(total);
  };
  ['bomKonta','bomKontaPct','bomDenk','bomDenkPct','bomGK','bomWG'].forEach(id => {
    const e = el.querySelector('#'+id);
    if (e) e.onchange = onMeta;
  });

  document.getElementById('topTotal').textContent = fmtEur(total);
}

function fmtEur(n){
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n||0);
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
