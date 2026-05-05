// Cable-Feed-Workflow: vom Verbraucher (oder Schrank) aus eine Quelle versorgen,
// optional über eine KETTE von Trassen. Schreibt in object.supplies[].
import { state, pushUndo } from './state.js';
import { addSupply, applySupplyToTraces, suggestTraceChain, removeSupply } from './links.js';

let feedMode = null; // { consumerId, editingSupplyId? }

export function isFeedActive(){ return !!feedMode; }
export function getFeedConsumerId(){ return feedMode?.consumerId || null; }

export function startFeed(ctx, consumerId, editingSupplyId = null){
  const consumer = state.objects.find(o => o.id === consumerId);
  if (!consumer) return;
  feedMode = { consumerId, editingSupplyId };
  document.body.classList.add('feed-mode');
  showFeedHint(ctx, '🔌 Quelle wählen: Klicke auf einen Schrank / HAK / Trafo / weiteren Schrank zum Versorgen');
  ctx.showToast('Quelle für Einspeisung auf der Karte wählen', 'ok');
}

export function cancelFeed(ctx){
  if (!feedMode) return;
  feedMode = null;
  document.body.classList.remove('feed-mode');
  hideFeedHint();
}

export function handleFeedPick(ctx, pickedAssetId){
  if (!feedMode) return false;
  if (pickedAssetId === feedMode.consumerId){
    ctx.showToast('Quelle und Verbraucher müssen unterschiedlich sein', 'err');
    return true;
  }
  const consumer = state.objects.find(o => o.id === feedMode.consumerId);
  const source   = state.objects.find(o => o.id === pickedAssetId);
  if (!consumer || !source){ cancelFeed(ctx); return true; }
  const consumerCat = state.catalog.find(c => c.id === consumer.catId);
  const sourceCat   = state.catalog.find(c => c.id === source.catId);
  if (!sourceCat?.supply){
    ctx.showToast(`"${sourceCat?.name||'?'}" ist keine Speisequelle`, 'err');
    return true;
  }
  openFeedDialog(ctx, consumer, source, consumerCat, sourceCat, feedMode.editingSupplyId);
  return true;
}

function openFeedDialog(ctx, consumer, source, consumerCat, sourceCat, editingSupplyId){
  const editing = editingSupplyId ? (consumer.supplies||[]).find(s => s.id === editingSupplyId) : null;
  const suggestedChain = editing?.traceIds?.length ? editing.traceIds : suggestTraceChain(source, consumer);

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="mFB">
      <div class="modal" style="max-width:560px">
        <header><h3>🔌 Kabel-Einspeisung ${editing?'(bearbeiten)':''}</h3><button class="close" data-act="x">×</button></header>
        <div class="body">
          <div style="background:var(--bg-2);padding:10px;border-radius:6px;font-size:12px;line-height:1.6;margin-bottom:12px">
            <div><b style="color:var(--navy)">${sourceCat.icon} ${escapeHtml(source.customName || sourceCat.name)}</b> <span style="color:var(--ink-3)">(Quelle)</span></div>
            <div style="color:var(--ink-3);font-size:11px;margin:2px 0">⬇ versorgt über Trassen-Kette ⬇</div>
            <div><b style="color:var(--navy)">${consumerCat.icon} ${escapeHtml(consumer.customName || consumerCat.name)}</b> <span style="color:var(--ink-3)">(Verbraucher)</span></div>
          </div>

          <label style="display:block;font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin-bottom:4px">Trassen-Kette (Reihenfolge: Quelle → Verbraucher)</label>
          <div id="fdChain" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px"></div>
          <select id="fdAddTrace" style="width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:4px;font-size:12px">
            <option value="">+ Trasse hinzufügen…</option>
          </select>
          <div style="font-size:10px;color:var(--ink-3);margin-top:4px;line-height:1.4">
            💡 Mehrere Trassen verketten, wenn die Verbindung über mehrere Trassen-Abschnitte läuft (z.B. MWS → KVS → Wallbox).
          </div>

          <label style="display:block;font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.4px;font-weight:600;margin:14px 0 4px">Kabeltyp</label>
          <div id="fdCableList" style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto"></div>

          <div style="display:flex;align-items:center;gap:10px;margin-top:14px;font-size:12px;color:var(--ink);font-weight:600">
            <label style="display:flex;align-items:center;gap:4px">Anzahl
              <input type="number" id="fdCount" value="${editing?.count ?? 1}" min="1" step="1" style="width:60px;padding:4px;border:1px solid var(--line);border-radius:4px">
            </label>
            <label style="display:flex;align-items:center;gap:4px;margin-left:auto">Reserve:
              <input type="number" id="fdReserve" value="${editing?.reserveValue ?? 10}" min="0" step="0.5" style="width:70px;padding:4px;border:1px solid var(--line);border-radius:4px">
              <select id="fdReserveMode" style="padding:4px;border:1px solid var(--line);border-radius:4px">
                <option value="pct" ${editing?.reserveMode!=='m'?'selected':''}>%</option>
                <option value="m" ${editing?.reserveMode==='m'?'selected':''}>m</option>
              </select>
            </label>
          </div>
        </div>
        <div class="foot">
          <button data-act="x">Abbruch</button>
          <button class="primary" id="fdConfirm">✓ ${editing?'Aktualisieren':'Einspeisen'}</button>
        </div>
      </div>
    </div>
  `;

  // Chain rendering
  const chainEl = document.getElementById('fdChain');
  const addTraceSel = document.getElementById('fdAddTrace');
  let chain = [...(suggestedChain || [])];

  function renderChain(){
    chainEl.innerHTML = chain.length
      ? chain.map((tid, i) => {
          const t = state.traces.find(x => x.id === tid);
          if (!t) return '';
          const idx = state.traces.indexOf(t);
          const len = t.segments.reduce((s,sg)=>s+sg.len,0);
          const name = t.name?.trim() || `Trasse ${idx+1}`;
          return `<div style="display:flex;align-items:center;gap:6px;background:#eef0fa;border:1px solid var(--navy);border-radius:5px;padding:6px 8px;font-size:12px">
            <span style="color:var(--ink-3);font-weight:700;width:18px">${i+1}.</span>
            <b style="flex:1;color:var(--navy)">${escapeHtml(name)}</b>
            <span style="color:var(--ink-3)">${len.toFixed(1)} m</span>
            <button data-rm="${i}" style="background:#fff;border:1px solid var(--line);border-radius:3px;width:22px;height:22px;cursor:pointer;font-size:14px;line-height:1">×</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--ink-3);font-style:italic;font-size:11px;padding:6px">Keine Trasse — bitte mind. eine hinzufügen oder als reine Logik-Verknüpfung speichern.</div>`;
    chainEl.querySelectorAll('[data-rm]').forEach(b => {
      b.onclick = () => { chain.splice(Number(b.dataset.rm), 1); renderChain(); renderAddOptions(); };
    });
  }

  function renderAddOptions(){
    const remaining = state.traces.filter(t => !chain.includes(t.id));
    addTraceSel.innerHTML = '<option value="">+ Trasse hinzufügen…</option>' + remaining.map(t => {
      const idx = state.traces.indexOf(t);
      const len = t.segments.reduce((s,sg)=>s+sg.len,0);
      const name = t.name?.trim() || `Trasse ${idx+1}`;
      return `<option value="${t.id}">${escapeHtml(name)} · ${len.toFixed(1)} m</option>`;
    }).join('');
  }
  addTraceSel.onchange = (e) => {
    const tid = e.target.value;
    if (tid && !chain.includes(tid)){ chain.push(tid); renderChain(); renderAddOptions(); }
    e.target.value = '';
  };

  renderChain();
  renderAddOptions();

  // Cable list
  const list = document.getElementById('fdCableList');
  let pickedCableId = editing?.cableTypeId || state.cableTypes[0]?.id;
  function renderCableList(){
    list.innerHTML = state.cableTypes.map(c => `
      <button data-id="${c.id}" class="fd-cable ${c.id===pickedCableId?'sel':''}" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid ${c.id===pickedCableId?'var(--navy)':'var(--line)'};background:${c.id===pickedCableId?'#eef0fa':'#fafbfc'};border-radius:5px;cursor:pointer;text-align:left;font-size:12px">
        <div style="width:18px;height:18px;border-radius:3px;background:${c.color};flex-shrink:0"></div>
        <div style="flex:1"><b>${escapeHtml(c.label)}</b>${c.lvPos?` <span style="color:var(--ink-3);font-size:10px">LV ${c.lvPos}</span>`:''}</div>
        <div style="color:var(--navy);font-weight:700">${c.price.toFixed(2)} €/m</div>
      </button>
    `).join('');
    list.querySelectorAll('.fd-cable').forEach(b => {
      b.onclick = () => { pickedCableId = b.dataset.id; renderCableList(); };
    });
  }
  renderCableList();

  const close = () => { root.innerHTML = ''; cancelFeed(ctx); };
  root.querySelector('#mFB').onclick = (e) => {
    if (e.target.id === 'mFB' || e.target.dataset.act === 'x') close();
  };

  document.getElementById('fdConfirm').onclick = () => {
    pushUndo();
    const reserveValue = Math.max(0, Number(document.getElementById('fdReserve').value)||0);
    const reserveMode  = document.getElementById('fdReserveMode').value === 'm' ? 'm' : 'pct';
    const count = Math.max(1, Number(document.getElementById('fdCount').value)||1);

    let supply;
    if (editing){
      supply = editing;
      supply.sourceId = source.id;
      supply.traceIds = [...chain];
      supply.cableTypeId = pickedCableId;
      supply.count = count;
      supply.reserveValue = reserveValue;
      supply.reserveMode = reserveMode;
    } else {
      supply = addSupply(consumer, {
        sourceId: source.id,
        traceIds: [...chain],
        cableTypeId: pickedCableId,
        count, reserveValue, reserveMode,
      });
    }

    // Spiegelfelder fuer Rueckwaertskompat
    consumer.supplyFromId = source.id;
    consumer.supplyCable = chain.length > 0;
    if (chain.length === 1) consumer.linkedTraceId = chain[0];

    applySupplyToTraces(supply, source, consumer);

    cancelFeed(ctx);
    root.innerHTML = '';
    ctx.refresh(); ctx.save();
    ctx.selectObject(consumer.id);
    ctx.showToast(`🔌 ${state.cableTypes.find(c=>c.id===pickedCableId)?.label||'Kabel'} ${editing?'aktualisiert':'eingespeist'} (${chain.length} Trasse${chain.length!==1?'n':''})`, 'ok');
  };
}

let hintEl = null;
function showFeedHint(ctx, text){
  hideFeedHint();
  hintEl = document.createElement('div');
  hintEl.className = 'feed-hint-banner';
  hintEl.innerHTML = `<span>${text}</span><button id="feedCancel">Abbrechen (Esc)</button>`;
  document.getElementById('map').appendChild(hintEl);
  document.getElementById('feedCancel').onclick = () => cancelFeed(ctx);
  const onKey = (e) => { if (e.key === 'Escape'){ cancelFeed(ctx); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}
function hideFeedHint(){
  if (hintEl){ hintEl.remove(); hintEl = null; }
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
