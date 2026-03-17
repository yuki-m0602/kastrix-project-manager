// ── Toast Notifications ───────────────────────────────────
// alert の代替としてトースト表示（非ブロッキング）

function showAlert(message, type) {
  if (message == null) return;
  const t = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${t} animate-in`;
  el.setAttribute('role', 'alert');
  const bg = t === 'error' ? 'bg-red-500/90' : t === 'success' ? 'bg-emerald-500/90' : 'bg-[#21262d]';
  const safe = escapeHtml(String(message)).replace(/\n/g, '<br>');
  el.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 rounded-xl ${bg} border border-[#30363d] shadow-lg text-sm text-white">${safe}</div>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    el.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => el.remove(), 200);
  }, TOAST_DURATION_MS);
}
