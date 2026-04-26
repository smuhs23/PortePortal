// v6/modules/ui.js
// Modal-Handling, Info-Banner, View-Banner, Format-Helpers

export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

export function showInfo(text, type) {
  const el = document.getElementById('infoBanner');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  el.classList.toggle('err', type === 'err');
  clearTimeout(showInfo._t);
  showInfo._t = setTimeout(() => el.classList.remove('show'), 3200);
}

export function showViewBanner(text) {
  let el = document.querySelector('.view-banner');
  if (!el) {
    el = document.createElement('div');
    el.className = 'view-banner';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showViewBanner._t);
  showViewBanner._t = setTimeout(() => el.classList.remove('show'), 2500);
}

export function uid() {
  return 'id_' + Math.random().toString(36).slice(2, 10);
}

// Einheitlicher Timestamp für Export-Dateinamen: 2026-04-23_1415
export function formatStamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Entfernt problematische Zeichen aus WE-Nummern / Namen für Dateinamen.
export function safeFilename(s) {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 60);
}

export function fmt(v) {
  return (Number(v) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtEur(v) {
  return fmt(v) + ' €';
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Foto-Kompression (aus v5 übernommen)
export function compressImage(file, maxSize = 900, quality = 0.6) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
      else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = rej;
    const r = new FileReader();
    r.onload = e => img.src = e.target.result;
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function renderPhotos(containerId, photos, onChange) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  (photos || []).forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'ph';
    const img = document.createElement('img');
    img.src = p;
    img.onclick = () => window.open(p, '_blank');
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = (e) => {
      e.stopPropagation();
      photos.splice(i, 1);
      renderPhotos(containerId, photos, onChange);
      onChange && onChange();
    };
    d.appendChild(img);
    d.appendChild(btn);
    c.appendChild(d);
  });
  const add = document.createElement('label');
  add.className = 'photo-add';
  add.innerHTML = '+';
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.capture = 'environment';
  inp.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = await compressImage(f);
      photos.push(data);
      renderPhotos(containerId, photos, onChange);
      onChange && onChange();
    } catch (err) {
      alert('Foto-Fehler: ' + err.message);
    }
  };
  add.appendChild(inp);
  c.appendChild(add);
}
