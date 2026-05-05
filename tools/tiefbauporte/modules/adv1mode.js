// v6/modules/mode.js
// Edit/View Toggle und Map-Mode (pin/trace/drag)

import { showInfo, showViewBanner } from './ui.js';

export function initModeToggle(ctx) {
  const btnEdit = document.getElementById('btnModeEdit');
  const btnView = document.getElementById('btnModeView');

  function applyUiMode(m) {
    ctx.state.uiMode = m;
    document.body.classList.toggle('view-mode', m === 'view');
    btnEdit.classList.toggle('active', m === 'edit');
    btnView.classList.toggle('active', m === 'view');
    showViewBanner(m === 'edit' ? '✎ Bearbeiten aktiv' : '👁 Ansichts-Modus');
    ctx.save();
    ctx.render();
  }

  btnEdit.onclick = () => applyUiMode('edit');
  btnView.onclick = () => applyUiMode('view');

  // Initial aus State
  document.body.classList.toggle('view-mode', ctx.state.uiMode === 'view');
  btnEdit.classList.toggle('active', ctx.state.uiMode === 'edit');
  btnView.classList.toggle('active', ctx.state.uiMode === 'view');

  ctx.applyUiMode = applyUiMode;
}

export function initMapMode(ctx) {
  const btnPin = document.getElementById('btnModePin');
  const btnTrace = document.getElementById('btnModeTrace');
  const btnDrag = document.getElementById('btnModeDrag');

  function setMapMode(m) {
    if (ctx.state.uiMode === 'view') {
      showInfo('Im Ansichts-Modus nicht möglich', 'err');
      return;
    }
    const wasTrace = (ctx.mode === 'trace');
    ctx.mode = m;
    btnPin.classList.toggle('active', m === 'pin');
    btnTrace.classList.toggle('active', m === 'trace');
    btnDrag.classList.toggle('active', m === 'drag');

    if (m === 'trace') {
      ctx.state.viz._hwBefore = ctx.state.viz.hw;
      ctx.state.viz.hw = false;
      document.getElementById('lyrHW').classList.remove('active');
      showInfo('Trasse zeichnen: Punkte tippen → ✓ Fertig');
    } else {
      if (wasTrace && ctx.state.viz._hwBefore !== undefined) {
        ctx.state.viz.hw = ctx.state.viz._hwBefore;
        delete ctx.state.viz._hwBefore;
        document.getElementById('lyrHW').classList.toggle('active', ctx.state.viz.hw);
      }
      ctx.drawLayer.clearLayers();
      ctx.currentTrace = null;
      if (m === 'pin') {
        const c = ctx.state.catalog.find(c => c.id === ctx.state.selectedCat);
        if (c) showInfo(`Aktiv: ${c.name}`);
      }
    }
    ctx.render();
  }

  btnPin.onclick = () => setMapMode('pin');
  btnTrace.onclick = () => setMapMode('trace');
  btnDrag.onclick = () => setMapMode('drag');

  ctx.setMapMode = setMapMode;
}
