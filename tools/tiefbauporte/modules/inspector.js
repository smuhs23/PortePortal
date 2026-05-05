// Inspector — right panel with live-edit fields
import { state, pushUndo } from './state.js';
import { recalcSegments } from './render.js';

export function renderInspector(ctx){
  const el = document.getElementById('inspector');
  if (!ctx.selection){
    el.innerHTML = `<div class="insp-empty">Klicke ein Asset oder eine Trasse auf der Karte, um sie hier zu bearbeiten.</div>`;
    return;
  }
  if (ctx.selection.kind === 'object'){
    renderObjectInspector(ctx, el);
  } else if (ctx.selection.kind === 'trace'){
    renderTraceInspector(ctx, el);
  }
}

function renderObjectInspector(ctx, el){
  const o = state.objects.find(x => x.id === ctx.selection.id);
  if (!o){ el.innerHTML = `<div class="insp-empty">Nicht gefunden</div>`; return; }
  const cat = state.catalog.find(c => c.id === o.catId);
  if (!cat){ el.innerHTML = `<div class="insp-empty">Katalog-Eintrag fehlt</div>`; return; }
  const sumPrice = (Number(o.qty)||0) * (Number(o.price)||0);

  el.innerHTML = `
    <div class="insp-title">
      <div class="ico" style="background:${o.colorOverride||cat.color}">${cat.icon}</div>
      <input id="iName" placeholder="${escapeHtml(cat.name)}" value="${escapeHtml(o.customName||'')}">
    </div>

    <div class="insp-h">Stamm</div>
    <div class="field">
      <label>Typ</label>
      <select id="iCatId">
        ${state.catalog.map(c => `<option value="${c.id}" ${c.id===o.catId?'selected':''}>${c.icon} · ${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Anzahl</label>
        <div class="stepper">
          <button data-step="-1">−</button>
          <input id="iQty" type="number" min="1" value="${o.qty}">
          <button data-step="1">+</button>
        </div>
      </div>
      <div class="field">
        <label>Einzelpreis (€)</label>
        <input id="iPrice" type="number" step="0.01" value="${o.price}">
      </div>
    </div>
    ${cat.amp ? `<div class="field"><label>Stromstärke (A)</label>
      <select id="iAmps">
        <option value="">— wählen —</option>
        ${[63,100,160,250,400,630,800].map(a=>`<option ${o.amps==a?'selected':''}>${a}</option>`).join('')}
      </select></div>` : ''}
    ${cat.kw ? `<div class="field"><label>Leistung (kW)</label>
      <input id="iKw" type="number" step="0.1" value="${o.kw||''}" placeholder="z.B. 22"></div>` : ''}

    <div class="insp-h">Verknüpfung</div>
    <div class="field">
      <label>Mit Trasse verknüpfen</label>
      <select id="iLinkedTrace">
        <option value="">— keine —</option>
        ${state.traces.map((t,i) => {
          const len = t.segments.reduce((s,sg)=>s+sg.len,0);
          return `<option value="${t.id}" ${o.linkedTraceId===t.id?'selected':''}>Trasse #${i+1} · ${len.toFixed(1)} m</option>`;
        }).join('')}
      </select>
    </div>

    <div class="insp-h">Notiz</div>
    <div class="field">
      <textarea id="iNote" rows="3" placeholder="Bestand, Auffälligkeiten...">${escapeHtml(o.note||'')}</textarea>
    </div>

    <div class="insp-h">Fotos</div>
    <div class="photo-grid" id="iPhotos"></div>

    <div class="insp-h">Position</div>
    <div class="field-row">
      <div class="field"><label>Lat</label><input type="text" value="${o.lat.toFixed(6)}" readonly></div>
      <div class="field"><label>Lng</label><input type="text" value="${o.lng.toFixed(6)}" readonly></div>
    </div>

    <div class="insp-h">Σ Position</div>
    <div style="background:var(--navy);color:#fff;padding:10px 12px;border-radius:6px;text-align:right;font-weight:700;font-size:14px">${fmtEur(sumPrice)}</div>

    <button class="danger-btn" id="iDelete">🗑 Asset löschen</button>
  `;

  // Wire inputs
  const nameEl = el.querySelector('#iName');
  nameEl.oninput = () => { o.customName = nameEl.value; ctx.refresh(); ctx.save(); };
  el.querySelector('#iCatId').onchange = (e) => {
    pushUndo();
    o.catId = e.target.value;
    const nc = state.catalog.find(c => c.id === o.catId);
    if (nc) o.price = nc.price;
    ctx.refresh(); ctx.save();
  };
  el.querySelectorAll('[data-step]').forEach(b => {
    b.onclick = () => {
      const v = Math.max(1, (Number(o.qty)||1) + Number(b.dataset.step));
      o.qty = v;
      ctx.refresh(); ctx.save();
    };
  });
  el.querySelector('#iQty').oninput = (e) => { o.qty = Math.max(1, Number(e.target.value)||1); updateTotals(ctx); ctx.save(); };
  el.querySelector('#iPrice').oninput = (e) => { o.price = Number(e.target.value)||0; updateTotals(ctx); ctx.save(); };
  if (cat.amp) el.querySelector('#iAmps').onchange = (e) => { o.amps = e.target.value; ctx.save(); };
  if (cat.kw) el.querySelector('#iKw').oninput = (e) => { o.kw = e.target.value; ctx.save(); };
  el.querySelector('#iLinkedTrace').onchange = (e) => {
    o.linkedTraceId = e.target.value || null;
    ctx.save();
  };
  el.querySelector('#iNote').oninput = (e) => { o.note = e.target.value; ctx.save(); };
  el.querySelector('#iDelete').onclick = () => {
    if (!confirm('Asset wirklich löschen?')) return;
    pushUndo();
    const i = state.objects.findIndex(x => x.id === o.id);
    if (i>=0) state.objects.splice(i,1);
    ctx.selection = null;
    ctx.refresh(); ctx.save();
  };

  // Photos
  renderPhotoGrid(o, el.querySelector('#iPhotos'), ctx);
}

function updateTotals(ctx){
  const totalEl = document.getElementById('topTotal');
  // Re-render BOM and total quickly
  ctx.refreshBOM();
  // Recompute top total
  let sum = 0;
  state.objects.forEach(o => sum += (Number(o.qty)||0) * (Number(o.price)||0));
  state.traces.forEach(t => {
    t.segments.forEach(seg => {
      const def = state.OF_DEFS[seg.of];
      if (def) sum += seg.len * (def.prOF + def.prWH + (state.PRICE_GRABEN + (seg.hand ? state.PRICE_HAND : 0)));
    });
    (t.cables||[]).forEach(c => {
      const baseLen = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
      const eff = c.reserveMode === 'm' ? baseLen + (Number(c.reserveValue)||0) : baseLen * (1 + (Number(c.reserveValue)||0)/100);
      const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
      sum += eff * (Number(c.count)||0) * unit;
    });
  });
  totalEl.textContent = fmtEur(sum);
}

function renderPhotoGrid(obj, container, ctx){
  const photos = obj.photos = obj.photos || [];
  let html = '';
  photos.forEach((p, i) => {
    html += `<div class="photo-thumb" style="background-image:url('${p}')" data-idx="${i}"><div class="x" data-rm="${i}">×</div></div>`;
  });
  html += `<label class="photo-add">+<input type="file" accept="image/*" capture="environment" multiple style="display:none"></label>`;
  container.innerHTML = html;
  container.querySelectorAll('.photo-thumb').forEach(el => {
    el.querySelector('.x').onclick = (e) => {
      e.stopPropagation();
      const i = Number(el.querySelector('.x').dataset.rm);
      photos.splice(i,1);
      renderPhotoGrid(obj, container, ctx);
      ctx.save();
    };
    el.onclick = () => {
      const idx = Number(el.dataset.idx);
      const w = window.open('', '_blank');
      w.document.write(`<img src="${photos[idx]}" style="max-width:100%;max-height:100vh;display:block;margin:auto">`);
    };
  });
  const inp = container.querySelector('input[type=file]');
  inp.onchange = async (e) => {
    for (const file of e.target.files){
      const dataUrl = await readFileAsDataURL(file);
      // Resize to ~1024px max
      const small = await resizeImage(dataUrl, 1024);
      photos.push(small);
    }
    renderPhotoGrid(obj, container, ctx);
    ctx.save();
  };
}

function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function resizeImage(dataUrl, maxDim){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let {width, height} = img;
      const ratio = Math.min(maxDim/width, maxDim/height, 1);
      const w = Math.round(width*ratio), h = Math.round(height*ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = dataUrl;
  });
}

function renderTraceInspector(ctx, el){
  const t = state.traces.find(x => x.id === ctx.selection.id);
  if (!t){ el.innerHTML = `<div class="insp-empty">Trasse nicht gefunden</div>`; return; }
  const totalLen = t.segments.reduce((s,sg)=>s+sg.len,0);
  const segIdx = ctx.selection.segIdx;

  // OF summary
  const ofSum = {};
  t.segments.forEach(s => { ofSum[s.of] = (ofSum[s.of]||0) + s.len; });

  // Tiefbau cost
  let tiefbau = 0;
  t.segments.forEach(s => {
    const d = state.OF_DEFS[s.of];
    if (d) tiefbau += s.len * (d.prOF + d.prWH + (state.PRICE_GRABEN + (s.hand ? state.PRICE_HAND : 0)));
  });

  // Kabel cost
  let kabel = 0;
  (t.cables||[]).forEach(c => {
    const base = (c.segIds||[]).reduce((s,i) => s + (t.segments[i]?.len||0), 0);
    const eff = c.reserveMode === 'm' ? base + (Number(c.reserveValue)||0) : base * (1 + (Number(c.reserveValue)||0)/100);
    const unit = c.priceOverride != null ? Number(c.priceOverride) : Number(c.priceSnapshot)||0;
    kabel += eff * (Number(c.count)||0) * unit;
  });

  const i = state.traces.indexOf(t);
  el.innerHTML = `
    <div class="insp-title">
      <div class="ico" style="background:#D32F2F">🚧</div>
      <input id="iTraceName" placeholder="Trasse #${i+1}" value="${escapeHtml(t.name||'')}">
    </div>

    <div class="insp-h">Übersicht</div>
    <div style="background:var(--bg-2);padding:8px 10px;border-radius:5px;font-size:11px;line-height:1.5">
      <b>${totalLen.toFixed(1)} m</b> · ${t.points.length} Punkte · ${t.segments.length} Segmente<br>
      ${Object.keys(ofSum).map(of => {
        const d = state.OF_DEFS[of]; if (!d) return '';
        return `<span style="display:inline-block;background:${d.color};color:#fff;padding:1px 6px;border-radius:3px;margin:1px 2px 0 0;font-weight:600">${of} ${ofSum[of].toFixed(1)}m</span>`;
      }).join('')}
    </div>

    ${segIdx != null ? renderSegmentEditor(t, segIdx) : ''}

    <div class="insp-h">Punkte / Segmente</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="iAddPointEnd" style="flex:1;min-width:120px;padding:6px 10px;border:1px solid var(--line);background:#fff;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">+ Punkt am Ende</button>
      <button id="iAddPointStart" style="flex:1;min-width:120px;padding:6px 10px;border:1px solid var(--line);background:#fff;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">+ Punkt am Anfang</button>
      ${segIdx != null ? `<button id="iSplitSeg" style="flex:1;min-width:120px;padding:6px 10px;border:1px solid var(--navy);background:var(--navy);color:#fff;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">⎘ Segment #${segIdx+1} teilen</button>` : ''}
    </div>

    <div class="insp-h">Notiz</div>
    <div class="field">
      <textarea id="iTNote" rows="2">${escapeHtml(t.note||'')}</textarea>
    </div>

    <div class="insp-h">Σ Trasse</div>
    <div style="background:var(--navy);color:#fff;padding:10px 12px;border-radius:6px;font-size:12px;line-height:1.5">
      Tiefbau: ${fmtEur(tiefbau)}<br>
      Kabel: ${fmtEur(kabel)}<br>
      <span style="font-size:15px;font-weight:700;color:#A5D34F">Σ ${fmtEur(tiefbau+kabel)}</span>
    </div>

    <div style="margin-top:10px;font-size:11px;color:var(--ink-3);text-align:center">
      💡 Kabel-Belegung in der Timeline unten
    </div>

    <button class="danger-btn" id="iTDelete">🗑 Trasse löschen</button>
  `;

  el.querySelector('#iTraceName').oninput = (e) => { t.name = e.target.value; ctx.save(); };
  el.querySelector('#iTNote').oninput = (e) => { t.note = e.target.value; ctx.save(); };

  // Punkte/Segmente Buttons
  const addEnd = el.querySelector('#iAddPointEnd');
  if (addEnd) addEnd.onclick = () => {
    pushUndo();
    const last = t.points[t.points.length-1];
    const sec = t.points[t.points.length-2] || last;
    // 30 m vom letzten Punkt weg in Richtung der letzten Linie
    const newPt = [last[0] + (last[0]-sec[0])*0.5 || last[0]+0.0003, last[1] + (last[1]-sec[1])*0.5 || last[1]+0.0003];
    t.points.push(newPt);
    t.segments.push({ of:'OF0', hand:false, len:0 });
    recalcSegments(t);
    ctx.refresh(); ctx.save();
    ctx.showToast('Punkt am Ende hinzugefügt — verschieben zum Positionieren', 'ok');
  };
  const addStart = el.querySelector('#iAddPointStart');
  if (addStart) addStart.onclick = () => {
    pushUndo();
    const first = t.points[0];
    const sec = t.points[1] || first;
    const newPt = [first[0] + (first[0]-sec[0])*0.5 || first[0]+0.0003, first[1] + (first[1]-sec[1])*0.5 || first[1]+0.0003];
    t.points.unshift(newPt);
    t.segments.unshift({ of:'OF0', hand:false, len:0 });
    // Cable segIds shiften
    (t.cables||[]).forEach(c => { c.segIds = (c.segIds||[]).map(i => i+1); });
    recalcSegments(t);
    ctx.refresh(); ctx.save();
    ctx.showToast('Punkt am Anfang hinzugefügt', 'ok');
  };
  const splitBtn = el.querySelector('#iSplitSeg');
  if (splitBtn && segIdx != null) splitBtn.onclick = () => {
    pushUndo();
    const a = t.points[segIdx], b = t.points[segIdx+1];
    if (!a || !b) return;
    const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2];
    t.points.splice(segIdx+1, 0, mid);
    // Segment duplizieren mit gleicher Oberfläche/Hand
    const orig = t.segments[segIdx];
    t.segments.splice(segIdx+1, 0, { of: orig.of, hand: orig.hand, len: 0 });
    // Cable segIds nach segIdx+1 verschieben
    (t.cables||[]).forEach(c => {
      c.segIds = (c.segIds||[]).map(i => i > segIdx ? i+1 : i);
      // wenn segIdx im Cable war: neuer Halb-Segment auch dem Cable zuordnen
      if (c.segIds.includes(segIdx)) c.segIds.push(segIdx+1);
      c.segIds.sort((x,y)=>x-y);
    });
    recalcSegments(t);
    ctx.selection = { kind:'trace', id:t.id, segIdx };
    ctx.refresh(); ctx.save();
    ctx.showToast(`Segment #${segIdx+1} geteilt`, 'ok');
  };

  el.querySelector('#iTDelete').onclick = () => {
    if (!confirm('Trasse wirklich löschen?')) return;
    pushUndo();
    const idx = state.traces.findIndex(x => x.id === t.id);
    if (idx>=0) state.traces.splice(idx,1);
    ctx.selection = null;
    ctx.refresh(); ctx.save();
  };

  if (segIdx != null){
    el.querySelector('#iSegOF').onchange = (e) => {
      pushUndo();
      t.segments[segIdx].of = e.target.value;
      ctx.refresh(); ctx.save();
    };
    el.querySelector('#iSegHand').onchange = (e) => {
      pushUndo();
      t.segments[segIdx].hand = e.target.checked;
      ctx.refresh(); ctx.save();
    };
  }
}

function renderSegmentEditor(t, segIdx){
  const seg = t.segments[segIdx];
  if (!seg) return '';
  const def = state.OF_DEFS[seg.of];
  return `
    <div class="insp-h">Segment #${segIdx+1} (${seg.len.toFixed(1)} m)</div>
    <div class="field">
      <label>Oberfläche</label>
      <select id="iSegOF">
        ${Object.entries(state.OF_DEFS).map(([k,d]) =>
          `<option value="${k}" ${seg.of===k?'selected':''}>${k} · ${d.label} · ${(d.prOF+d.prWH).toFixed(2)} €/m</option>`
        ).join('')}
      </select>
    </div>
    <div class="field">
      <label style="display:flex;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-weight:600;color:var(--ink)">
        <input type="checkbox" id="iSegHand" ${seg.hand?'checked':''} style="width:auto;margin:0">
        Handschachtung (+89,10 €/m zusätzlich zum Graben)
      </label>
    </div>
  `;
}

function fmtEur(n){
  return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n||0);
}
function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function selectObject(){}
export function selectTrace(){}
export function clearSelection(){}
