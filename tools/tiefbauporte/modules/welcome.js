// First-time welcome / project setup
import { state, saveState } from './state.js';

export function initWelcome(ctx){}

export function openWelcome(ctx){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="welcome">
      <div class="card">
        <h2>⚡ Willkommen bei TiefbauPorte</h2>
        <p>Tiefbau-Kalkulation für Ladeinfrastruktur. Neues Projekt anlegen oder ein bestehendes laden.</p>

        <div class="welcome-tabs">
          <button class="wtab active" data-wt="new">Neu anlegen</button>
          <button class="wtab" data-wt="import">Aus Backup laden</button>
        </div>

        <div class="wpane active" data-wt="new">
          <div class="row">
            <div>
              <label>Projektname</label>
              <input id="wName" value="${escapeHtml(state.meta.name||'Neues Projekt')}" placeholder="z.B. BImA Bonn-Bad Godesberg">
            </div>
            <div>
              <label>WE-Nr.</label>
              <input id="wWE" value="${escapeHtml(state.meta.we||'')}" placeholder="WE-12345">
            </div>
          </div>
          <div class="row">
            <div style="grid-column:1/3">
              <label>Standort suchen (optional)</label>
              <input id="wLoc" placeholder="Adresse oder Ort eingeben…">
            </div>
          </div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:10px;line-height:1.4">
            <b>Tipps:</b><br>
            • Asset im Katalog wählen → Karte klicken = Pin setzen<br>
            • Trasse-Tool → Punkte klicken → Doppelklick = fertig (snappt an Pins)<br>
            • Trasse anklicken → Timeline unten für Kabel-Belegung<br>
            • Alles wird automatisch lokal gespeichert
          </div>
        </div>

        <div class="wpane" data-wt="import" hidden>
          <div id="wDrop" class="welcome-drop">
            <div class="drop-icon">📥</div>
            <div class="drop-title">JSON-Backup hierher ziehen</div>
            <div class="drop-sub">oder Datei auswählen</div>
            <input type="file" id="wFile" accept=".json,application/json" hidden>
            <button class="secondary" id="wPickBtn">Datei wählen…</button>
          </div>
          <div id="wPreview" class="welcome-preview" hidden></div>
        </div>

        <div class="actions">
          <button id="wSkip">Überspringen</button>
          <button class="primary" id="wStart">Loslegen →</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };
  let importPayload = null;

  // Tabs
  root.querySelectorAll('.wtab').forEach(b => {
    b.onclick = () => {
      root.querySelectorAll('.wtab').forEach(x => x.classList.toggle('active', x === b));
      root.querySelectorAll('.wpane').forEach(p => p.hidden = p.dataset.wt !== b.dataset.wt);
      // Button text
      const startBtn = root.querySelector('#wStart');
      startBtn.textContent = b.dataset.wt === 'import'
        ? (importPayload ? 'Backup laden →' : 'Backup laden →')
        : 'Loslegen →';
    };
  });

  // File-Picker / Drop
  const dropEl = root.querySelector('#wDrop');
  const fileInput = root.querySelector('#wFile');
  root.querySelector('#wPickBtn').onclick = (e) => { e.preventDefault(); fileInput.click(); };
  fileInput.onchange = () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  };
  dropEl.ondragover = (e) => { e.preventDefault(); dropEl.classList.add('over'); };
  dropEl.ondragleave = () => dropEl.classList.remove('over');
  dropEl.ondrop = (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  function handleFile(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object') throw new Error('Ungültiges Format');
        importPayload = data;
        showPreview(data);
      }catch(err){
        ctx.showToast('Datei konnte nicht gelesen werden: ' + err.message, 'err');
      }
    };
    reader.readAsText(file);
  }
  function showPreview(data){
    const preview = root.querySelector('#wPreview');
    const objCount = (data.objects || []).length;
    const trCount = (data.traces || []).length;
    const name = data.meta?.name || '(unbenannt)';
    const we = data.meta?.we || '';
    preview.hidden = false;
    preview.innerHTML = `
      <div class="prev-row"><b>📁 ${escapeHtml(name)}</b>${we ? ' · WE ' + escapeHtml(we) : ''}</div>
      <div class="prev-row">📍 ${objCount} Assets · 🚧 ${trCount} Trassen</div>
      <div class="prev-warn">⚠ Importieren überschreibt das aktuelle Projekt im Browser.</div>
    `;
  }

  root.querySelector('#wSkip').onclick = close;
  root.querySelector('#wStart').onclick = async () => {
    const activeTab = root.querySelector('.wtab.active').dataset.wt;
    if (activeTab === 'import'){
      if (!importPayload){
        ctx.showToast('Bitte zuerst eine Backup-Datei wählen', 'err');
        return;
      }
      try{
        // Apply payload to state — wichtige Felder selektiv übernehmen, statt state-Objekt-Identität zu zerstören
        const fields = ['meta','catalog','cableTypes','objects','traces','viz','favorites','recents','selectedCat','uiMode'];
        fields.forEach(k => {
          if (importPayload[k] !== undefined) state[k] = importPayload[k];
        });
        // Defaults absichern
        if (!state.viz) state.viz = { pins:true, traces:true, labels:false };
        if (!state.favorites) state.favorites = [];
        if (!state.recents) state.recents = [];
        if (!state.objects) state.objects = [];
        if (!state.traces) state.traces = [];
        // Refresh UI
        document.getElementById('projName').value = state.meta?.name || '';
        document.getElementById('projWE').value = state.meta?.we || '';
        saveState();
        ctx.refresh();
        if (state.meta?.center){
          ctx.map.flyTo([state.meta.center[0], state.meta.center[1]], state.meta.zoom || 17);
        }
        ctx.showToast('✅ Projekt geladen', 'ok');
        close();
      }catch(err){
        ctx.showToast('Import fehlgeschlagen: ' + err.message, 'err');
      }
      return;
    }

    // Neu anlegen
    state.meta.name = root.querySelector('#wName').value || 'Neues Projekt';
    state.meta.we = root.querySelector('#wWE').value || '';
    const loc = root.querySelector('#wLoc').value.trim();
    document.getElementById('projName').value = state.meta.name;
    document.getElementById('projWE').value = state.meta.we;
    saveState();
    if (loc){
      try{
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(loc)}&limit=1`);
        const data = await res.json();
        if (data.length){
          ctx.map.flyTo([Number(data[0].lat), Number(data[0].lon)], 18);
        }
      }catch(e){
        ctx.showToast('Standort-Suche fehlgeschlagen', 'err');
      }
    }
    close();
  };
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
