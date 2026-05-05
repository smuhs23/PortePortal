// Catalog manager modal — view/edit catalog entries
import { state, pushUndo, uid } from './state.js';
import { renderCatalog } from './catalog.js';

export function initCatalogManager(ctx){}

export function openCatalogManager(ctx){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop" id="cmB">
      <div class="modal" style="max-width:760px">
        <header><h3>Katalog verwalten</h3><button class="close" data-act="x">×</button></header>
        <div class="body" style="max-height:60vh">
          <table class="bom-table">
            <thead><tr><th>Icon</th><th>Name</th><th>Kategorie</th><th>LV</th><th class="r">EP</th><th></th></tr></thead>
            <tbody id="cmBody"></tbody>
          </table>
        </div>
        <div class="foot">
          <button id="cmAdd">+ Neuer Eintrag</button>
          <button data-act="x" class="primary">Schließen</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector('#cmB').onclick = (e) => {
    if (e.target.id === 'cmB' || e.target.dataset.act === 'x') root.innerHTML = '';
  };
  function renderRows(){
    const tbody = root.querySelector('#cmBody');
    tbody.innerHTML = state.catalog.map(c => `
      <tr>
        <td><span style="display:inline-block;width:24px;height:24px;background:${c.color};color:#fff;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:10px">${c.icon}</span></td>
        <td><input data-id="${c.id}" data-f="name" value="${escapeHtml(c.name)}" style="width:100%;padding:3px 5px"></td>
        <td><input data-id="${c.id}" data-f="cat" value="${escapeHtml(c.cat)}" style="width:120px;padding:3px 5px"></td>
        <td><input data-id="${c.id}" data-f="pos" value="${escapeHtml(c.pos||'')}" style="width:60px;padding:3px 5px"></td>
        <td class="r"><input data-id="${c.id}" data-f="price" type="number" step="0.01" value="${c.price}" style="width:80px;padding:3px 5px;text-align:right"></td>
        <td><button data-rm="${c.id}" style="background:transparent;border:1px solid var(--red);color:var(--red);border-radius:3px;width:24px;height:24px;cursor:pointer">×</button></td>
      </tr>
    `).join('');
    tbody.querySelectorAll('input').forEach(inp => {
      inp.oninput = () => {
        const c = state.catalog.find(x => x.id === inp.dataset.id);
        if (!c) return;
        const f = inp.dataset.f;
        c[f] = f === 'price' ? Number(inp.value)||0 : inp.value;
        ctx.save();
      };
    });
    tbody.querySelectorAll('[data-rm]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.rm;
        if (state.objects.some(o => o.catId === id)){
          alert('Eintrag wird noch verwendet — kann nicht gelöscht werden.');
          return;
        }
        if (!confirm('Eintrag wirklich löschen?')) return;
        pushUndo();
        const i = state.catalog.findIndex(x => x.id === id);
        if (i>=0) state.catalog.splice(i,1);
        renderRows();
        renderCatalog(ctx);
        ctx.save();
      };
    });
  }
  renderRows();
  root.querySelector('#cmAdd').onclick = () => {
    pushUndo();
    state.catalog.push({
      id: uid(), name:'Neuer Eintrag', icon:'NEU', pos:'', price:0, unit:'Stk', cat:'Sonstiges', emoji:'❓', color:'#666', shape:'circle'
    });
    renderRows();
    renderCatalog(ctx);
    ctx.save();
  };
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
