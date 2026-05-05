// Bottom Timeline — Trasse Längsschnitt with drag-to-assign cables
import { state, pushUndo, uid } from './state.js';

let dragState = null;

export function initTimeline(ctx){
  // closer button is added when needed
}

export function showTimeline(ctx, traceId, segIdx){
  const tl = document.getElementById('timeline');
  tl.hidden = false;
  refreshTimeline(ctx);
}

export function hideTimeline(ctx){
  const tl = document.getElementById('timeline');
  tl.hidden = true;
}

export function refreshTimeline(ctx){
  const tl = document.getElementById('timeline');
  if (tl.hidden) return;
  if (!ctx.selection || ctx.selection.kind !== 'trace'){ tl.hidden = true; return; }
  const t = state.traces.find(x => x.id === ctx.selection.id);
  if (!t){ tl.hidden = true; return; }
  renderTimeline(ctx, t);
}

function renderTimeline(ctx, t){
  const tl = document.getElementById('timeline');
  const totalLen = t.segments.reduce((s,sg)=>s+sg.len,0);
  const segCount = t.segments.length;

  let html = `
    <div class="tl-head">
      <h4>🚧 ${escapeHtml(t.name || 'Trasse #'+(state.traces.indexOf(t)+1))} · ${totalLen.toFixed(1)} m · ${segCount} Segmente</h4>
      <div style="display:flex;gap:6px">
        <button class="closer" id="tlAddCable">+ Kabel</button>
        <button class="closer" id="tlClose">✕ Schließen</button>
      </div>
    </div>
    <div class="tl-track">
      ${t.segments.map((sg,i) => {
        const d = state.OF_DEFS[sg.of];
        const w = (sg.len/totalLen)*100;
        const sel = ctx.selection.segIdx === i;
        return `<div class="tl-seg ${sel?'sel':''}" data-seg="${i}" style="flex-basis:${w}%;background:${d?.color||'#888'}">#${i+1}<br><span style="font-size:8px;font-weight:400">${sg.len.toFixed(1)}m</span></div>`;
      }).join('')}
    </div>
    <div class="tl-cables" id="tlCables"></div>
  `;
  tl.innerHTML = html;

  // Render cable rows
  const cablesEl = document.getElementById('tlCables');
  if (!t.cables || !t.cables.length){
    cablesEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--ink-3);font-size:11px;background:var(--bg-2);border-radius:4px">
      Noch keine Kabel · Klicke "+ Kabel" um eines hinzuzufügen
    </div>`;
  } else {
    t.cables.forEach((cab, ci) => {
      const ct = state.cableTypes.find(x => x.id === cab.typeId);
      const color = ct?.color || '#666';
      const base = (cab.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      const eff = cab.reserveMode === 'm' ? base + (Number(cab.reserveValue)||0) : base * (1 + (Number(cab.reserveValue)||0)/100);
      const meters = eff * (Number(cab.count)||0);

      const row = document.createElement('div');
      row.className = 'tl-cable';
      row.innerHTML = `
        <div class="lbl"><span class="dot" style="background:${color}"></span>${escapeHtml(cab.label)}</div>
        <div class="row-bar" data-cab="${ci}">
          ${t.segments.map((sg,i) => {
            const w = (sg.len/totalLen)*100;
            const on = (cab.segIds||[]).includes(i);
            return `<div class="seg-cell ${on?'on':'off'}" data-seg="${i}" style="flex-basis:${w}%;background:${on?color:'#f3f0e6'}"></div>`;
          }).join('')}
        </div>
        <div class="meta"><b>${meters.toFixed(1)} m</b><br>${cab.count}× +${cab.reserveValue}${cab.reserveMode==='m'?'m':'%'}</div>
        <div class="actions">
          <div class="stepper-mini">
            <button data-act="dec">−</button>
            <span class="v">${cab.count}</span>
            <button data-act="inc">+</button>
          </div>
          <button data-act="del" title="Kabel entfernen">×</button>
        </div>
      `;
      cablesEl.appendChild(row);

      // Drag-to-assign on row-bar
      const bar = row.querySelector('.row-bar');
      bar.querySelectorAll('.seg-cell').forEach(cell => {
        cell.onmousedown = (e) => {
          e.preventDefault();
          pushUndo();
          const seg = Number(cell.dataset.seg);
          const set = new Set(cab.segIds || []);
          const targetOn = !set.has(seg);
          dragState = { cable: cab, targetOn, set };
          toggleSeg(cab, seg, targetOn);
          renderTimeline(ctx, t);
          ctx.refresh();
        };
        cell.onmouseenter = (e) => {
          if (!dragState || dragState.cable !== cab) return;
          const seg = Number(cell.dataset.seg);
          toggleSeg(cab, seg, dragState.targetOn);
          renderTimeline(ctx, t);
          // Don't full refresh while dragging — just update top total
          updateTopTotal();
        };
      });

      row.querySelector('[data-act="inc"]').onclick = () => {
        cab.count = (Number(cab.count)||0) + 1;
        renderTimeline(ctx, t); ctx.refresh(); ctx.save();
      };
      row.querySelector('[data-act="dec"]').onclick = () => {
        cab.count = Math.max(1, (Number(cab.count)||1) - 1);
        renderTimeline(ctx, t); ctx.refresh(); ctx.save();
      };
      row.querySelector('[data-act="del"]').onclick = () => {
        if (!confirm(`Kabel "${cab.label}" entfernen?`)) return;
        pushUndo();
        t.cables.splice(ci, 1);
        renderTimeline(ctx, t); ctx.refresh(); ctx.save();
      };
    });
  }

  // Global mouseup
  document.onmouseup = () => {
    if (dragState){ dragState = null; ctx.save(); ctx.refresh(); }
  };

  // Top track click → select segment
  tl.querySelectorAll('.tl-track .tl-seg').forEach(el => {
    el.onclick = () => {
      ctx.selectTrace(t.id, Number(el.dataset.seg));
    };
  });

  document.getElementById('tlClose').onclick = () => { ctx.clearSelection(); };
  document.getElementById('tlAddCable').onclick = () => openAddCable(ctx, t);
}

function toggleSeg(cab, seg, on){
  cab.segIds = cab.segIds || [];
  const i = cab.segIds.indexOf(seg);
  if (on && i < 0) cab.segIds.push(seg);
  if (!on && i >= 0) cab.segIds.splice(i,1);
  cab.segIds.sort((a,b)=>a-b);
}

function updateTopTotal(){
  let sum = 0;
  state.objects.forEach(o => sum += (Number(o.qty)||0) * (Number(o.price)||0));
  state.traces.forEach(t => {
    t.segments.forEach(s => {
      const d = state.OF_DEFS[s.of];
      if (d) sum += s.len * (d.prOF + d.prWH + (s.hand ? state.PRICE_HAND : state.PRICE_GRABEN));
    });
    (t.cables||[]).forEach(c => {
      const base = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      const eff = c.reserveMode === 'm' ? base + (Number(c.reserveValue)||0) : base * (1 + (Number(c.reserveValue)||0)/100);
      const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
      sum += eff * (Number(c.count)||0) * unit;
    });
  });
  document.getElementById('topTotal').textContent = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(sum);
}

function openAddCable(ctx, t){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="mB">
      <div class="modal">
        <header><h3>Kabel hinzufügen</h3><button class="close" data-act="x">×</button></header>
        <div class="body">
          <p style="margin:0 0 10px;color:var(--ink-2);font-size:12px">Wähle einen Kabeltyp – das Kabel wird auf alle Segmente gelegt. Du kannst es danach pro Segment ein-/ausschalten.</p>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${state.cableTypes.map(c => `
              <button class="cable-pick" data-id="${c.id}" style="display:flex;align-items:center;gap:8px;padding:8px;background:#fafbfc;border:1px solid var(--line);border-radius:5px;cursor:pointer;text-align:left;font-size:12px">
                <div style="width:20px;height:20px;border-radius:3px;background:${c.color};flex-shrink:0"></div>
                <div style="flex:1">
                  <b>${escapeHtml(c.label)}</b>
                  ${c.lvPos ? `<span style="color:var(--ink-3);font-size:10px;margin-left:6px">LV ${c.lvPos}</span>` : ''}
                </div>
                <div style="color:var(--navy);font-weight:700">${c.price.toFixed(2)} €/m</div>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="foot"><button data-act="x">Abbruch</button></div>
      </div>
    </div>
  `;
  root.querySelector('#mB').onclick = (e) => {
    if (e.target.id === 'mB' || e.target.dataset.act === 'x') root.innerHTML = '';
  };
  root.querySelectorAll('.cable-pick').forEach(b => {
    b.onclick = () => {
      const ct = state.cableTypes.find(c => c.id === b.dataset.id);
      if (!ct) return;
      pushUndo();
      t.cables = t.cables || [];
      t.cables.push({
        id: uid(),
        typeId: ct.id,
        label: ct.label,
        priceSnapshot: ct.price,
        priceOverride: null,
        count: 1,
        reserveMode: 'pct',
        reserveValue: 10,
        segIds: Array.from({length: t.segments.length}, (_,i)=>i),
      });
      root.innerHTML = '';
      renderTimeline(ctx, t);
      ctx.refresh();
      ctx.save();
    };
  });
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
