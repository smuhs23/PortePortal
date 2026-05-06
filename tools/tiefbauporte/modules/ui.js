// UI helpers
let toastTimer = null;

export function showToast(msg, kind){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
