// ── Lucide Icons ──────────────────────────────────────────
lucide.createIcons();

// ── Responsive ─────────────────────────────────────────────
if (window.innerWidth <= 768) {
  document.documentElement.style.setProperty('--tw-min-w-0', '0');
}

// init / loadData / refreshTeamUiFromBackend / Tauri listen → data.js, init.js, events.js

// Click handler to close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('[onclick^="toggleDropdown"]')) {
    if (typeof closeAllDropdowns === 'function') {
      closeAllDropdowns();
    }
  }
});

window.addEventListener('popstate', () => {
  if (_modalHistory === 'task') {
    _modalHistory = null;
    const modal = document.getElementById('task-modal');
    const content = document.getElementById('task-modal-content');
    modal.style.display = 'none';
    content.classList.add('translate-x-full');
  } else if (_modalHistory === 'project') {
    _modalHistory = null;
    const modal = document.getElementById('project-detail-modal');
    const content = document.getElementById('project-detail-modal-content');
    if (content) {
      modal.style.display = 'none';
      content.classList.add('translate-x-full');
    }
  } else if (_modalHistory === 'task-edit') {
    _modalHistory = null;
    const modal = document.getElementById('task-edit-modal');
    const content = document.getElementById('task-edit-modal-content');
    if (content) {
      modal.style.display = 'none';
      content.classList.add('translate-x-full');
    }
  }
});

// ── Close pickers / search on outside click ──────────────
document.addEventListener('click', e => {
  const picker = document.getElementById('project-picker');
  const addBtn = document.getElementById('add-tab-btn');
  if (picker && addBtn && !picker.contains(e.target) && e.target !== addBtn && !addBtn.contains(e.target)) {
    picker.style.display = 'none';
  }
  const searchResults = document.getElementById('search-results');
  const searchInput = document.getElementById('global-search');
  if (searchResults && searchInput && !searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.add('hidden');
    searchResults.style.removeProperty('display');
  }
});

// ── Search ───────────────────────────────────────────────
function _hideSearchResults() {
  const el = document.getElementById('search-results');
  if (el) {
    el.classList.add('hidden');
    el.style.removeProperty('display');
  }
}

function handleSearch(query) {
  const container = document.getElementById('search-results');
  if (!container) return;
  if (!query || query.length < 1) {
    _hideSearchResults();
    return;
  }
  const q = query.toLowerCase();
  const matchedProjects = localProjects.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 5);
  const matchedTasks = tasks.filter(t => (t.title || '').toLowerCase().includes(q)).slice(0, 5);
  if (matchedProjects.length === 0 && matchedTasks.length === 0) {
    container.innerHTML = '<p class="px-3 py-2 text-xs text-[#8b949e]">No results found</p>';
    container.classList.remove('hidden');
    container.style.removeProperty('display');
    return;
  }
  let html = '';
  if (matchedProjects.length > 0) {
    html += '<div class="px-3 pt-2 pb-1"><span class="text-[9px] font-bold text-[#484f58] uppercase tracking-wider">Projects</span></div>';
    matchedProjects.forEach(p => {
      html += `<button onclick="openProjectDetailModal('${p.id}'); _hideSearchResults(); document.getElementById('global-search').value='';" class="w-full text-left px-3 py-2 hover:bg-[#21262d] transition-all flex items-center gap-2">
        <i data-lucide="folder-git-2" size="14" class="text-indigo-400 shrink-0"></i>
        <span class="text-xs text-white truncate">${p.name}</span>
      </button>`;
    });
  }
  if (matchedTasks.length > 0) {
    html += '<div class="px-3 pt-2 pb-1"><span class="text-[9px] font-bold text-[#484f58] uppercase tracking-wider">Tasks</span></div>';
    matchedTasks.forEach(t => {
      html += `<button onclick="openTaskModal('${t.id}'); _hideSearchResults(); document.getElementById('global-search').value='';" class="w-full text-left px-3 py-2 hover:bg-[#21262d] transition-all flex items-center gap-2">
        <i data-lucide="check-square" size="14" class="text-emerald-400 shrink-0"></i>
        <span class="text-xs text-white truncate">${t.title}</span>
      </button>`;
    });
  }
  container.innerHTML = html;
  container.classList.remove('hidden');
  container.style.removeProperty('display');
  lucide.createIcons();
}

// ── Activity Logs ────────────────────────────────────────
async function renderLogs() {
  const container = document.getElementById('logs-list');
  if (!container) return;
  const logs = await apiGetActivityLogs();
  if (logs.length === 0) {
    container.innerHTML = '<p class="text-[#8b949e] text-sm">No activity logs yet.</p>';
    return;
  }
  const actionConfig = {
    created:   { icon: 'plus-circle',  color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    started:   { icon: 'play-circle',  color: 'text-blue-400',    bg: 'bg-blue-500/10' },
    completed: { icon: 'check-circle', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    updated:   { icon: 'edit',         color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  };
  container.innerHTML = logs.map(log => {
    const cfg = actionConfig[log.action] || actionConfig.updated;
    const taskId = log.taskId;
    const clickable = taskId && typeof openTaskModal === 'function';
    return `
      <div class="flex items-start gap-3 p-3 bg-[#161b22] border border-[#30363d] rounded-xl ${clickable ? 'cursor-pointer hover:border-[#484f58] transition-all' : ''}" ${clickable ? `onclick="openTaskModal('${taskId}')"` : ''}>
        <div class="w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0">
          <i data-lucide="${cfg.icon}" size="16" class="${cfg.color}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white font-medium">${log.taskTitle || 'Unknown Task'}</p>
          <p class="text-[10px] text-[#8b949e]">${log.projectName || ''} · ${log.action}${log.modifiedBy ? ' by ' + log.modifiedBy : ''} · ${log.timestamp || ''}</p>
        </div>
      </div>`;
  }).join('');
  lucide.createIcons();
}

async function exportLogs() {
  const csv = await apiExportLogsCsv();
  if (!csv) {
    showAlert('CSV エクスポートは Tauri 環境でのみ利用できます。', 'info');
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'activity-logs.csv';
  a.click();
  URL.revokeObjectURL(url);
}
