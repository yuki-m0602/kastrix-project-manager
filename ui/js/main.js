// ── Lucide Icons ──────────────────────────────────────────
lucide.createIcons();

// ── Window Controls (for frameless window) ───────────────────────
async function initWindowControls() {
  if (!window.__TAURI__) return;
  const { getCurrentWindow } = window.__TAURI__.window;
  const win = getCurrentWindow();
  
  document.getElementById('btn-minimize')?.addEventListener('click', () => win.minimize());
  document.getElementById('btn-maximize')?.addEventListener('click', async () => {
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  document.getElementById('btn-close')?.addEventListener('click', () => win.close());
}
initWindowControls();

function fixFilterIconSizes() {
  ['task-filter', 'project-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('svg').forEach(svg => {
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
    });
  });
}
setTimeout(fixFilterIconSizes, 0);

if (window.innerWidth <= 768) {
  document.documentElement.style.setProperty('--tw-min-w-0', '0');
}

// ── Custom Dropdown ───────────────────────────────────────
function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isHidden = dd.style.display === 'none';
  document.querySelectorAll('[id^="dd-"]').forEach(el => el.style.display = 'none');
  if (isHidden) dd.style.display = '';
}

document.addEventListener('click', e => {
  if (!e.target.closest('[onclick^="toggleDropdown"]')) {
    document.querySelectorAll('[id^="dd-"]').forEach(el => el.style.display = 'none');
  }
});

// ── History API: モバイルの「戻る」でモーダルを閉じる ────────
function _pushModalHistory(type) {
  _modalHistory = type;
  history.pushState({ modal: type }, '');
}

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
    searchResults.style.display = 'none';
  }
});

// ── 衝突ダイアログ (local vs local) ───────────────────────
let _pendingConflict = null;

function showConflictDialog(payload) {
  if (!payload || !(payload.taskId || payload.task_id)) return;
  _pendingConflict = payload;
  const modal = document.getElementById('conflict-modal');
  const localTitle = document.getElementById('conflict-local-title');
  const localStatus = document.getElementById('conflict-local-status');
  const incomingTitle = document.getElementById('conflict-incoming-title');
  const incomingStatus = document.getElementById('conflict-incoming-status');
  if (!modal || !localTitle) return;
  const local = payload.local || {};
  const incoming = payload.incoming || {};
  localTitle.textContent = local.title || '-';
  localStatus.textContent = [local.status, local.priority].filter(Boolean).join(' / ') || '-';
  incomingTitle.textContent = incoming.title || '-';
  incomingStatus.textContent = [incoming.status, incoming.priority].filter(Boolean).join(' / ') || '-';
  modal.style.display = 'flex';
  document.getElementById('conflict-keep-local').onclick = () => resolveConflict('local');
  document.getElementById('conflict-use-incoming').onclick = () => resolveConflict('incoming');
}

function closeConflictModal() {
  _pendingConflict = null;
  const modal = document.getElementById('conflict-modal');
  if (modal) modal.style.display = 'none';
}

async function resolveConflict(choice) {
  if (!_pendingConflict || !_isTauri) return;
  try {
    if (choice === 'incoming' && _pendingConflict.incoming) {
      await apiTeamResolveConflict('incoming', _pendingConflict.incoming);
    }
    closeConflictModal();
    await loadData();
    if (typeof filterTasks === 'function') filterTasks();
  } catch (e) {
    console.error('Conflict resolve failed:', e);
  }
}

// ── Data Loading ─────────────────────────────────────────
async function reloadTasks() {
  const tasksData = await apiGetTasks();
  tasks.length = 0;
  tasks.push(...tasksData);
}

async function loadData() {
  try {
    // 起動時に全 watched directories をスキャンして最新化
    if (_isTauri) await apiScanAllWatchedDirs();
    const [projectsData, tasksData] = await Promise.all([
      apiGetProjects(),
      apiGetTasks()
    ]);
    const safeProjects = Array.isArray(projectsData) ? projectsData : [];
    const safeTasks = Array.isArray(tasksData) ? tasksData : [];
    localProjects.length = 0;
    localProjects.push(...safeProjects);
    tasks.length = 0;
    tasks.push(...safeTasks);
    // Rebuild projects array for tabs/picker
    projects.length = 0;
    localProjects.forEach(p => {
      projects.push({ id: p.id, name: p.name, color: 'indigo', icon: (p.name[0] || '?').toUpperCase() });
    });
    openTabs = ['all'];
    activeTabId = 'all';
    if (typeof renderProjectPicker === 'function') renderProjectPicker();
    if (typeof filterTasks === 'function') filterTasks();
    if (typeof renderProjects === 'function') renderProjects();
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

// ── Search ───────────────────────────────────────────────
function handleSearch(query) {
  const container = document.getElementById('search-results');
  if (!container) return;
  if (!query || query.length < 1) {
    container.style.display = 'none';
    return;
  }
  const q = query.toLowerCase();
  const matchedProjects = localProjects.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  const matchedTasks = tasks.filter(t => t.title.toLowerCase().includes(q)).slice(0, 5);
  if (matchedProjects.length === 0 && matchedTasks.length === 0) {
    container.innerHTML = '<p class="px-3 py-2 text-xs text-[#8b949e]">No results found</p>';
    container.style.display = '';
    return;
  }
  let html = '';
  if (matchedProjects.length > 0) {
    html += '<div class="px-3 pt-2 pb-1"><span class="text-[9px] font-bold text-[#484f58] uppercase tracking-wider">Projects</span></div>';
    matchedProjects.forEach(p => {
      html += `<button onclick="openProjectDetailModal('${p.id}'); document.getElementById('search-results').style.display='none'; document.getElementById('global-search').value='';" class="w-full text-left px-3 py-2 hover:bg-[#21262d] transition-all flex items-center gap-2">
        <i data-lucide="folder-git-2" size="14" class="text-indigo-400 shrink-0"></i>
        <span class="text-xs text-white truncate">${p.name}</span>
      </button>`;
    });
  }
  if (matchedTasks.length > 0) {
    html += '<div class="px-3 pt-2 pb-1"><span class="text-[9px] font-bold text-[#484f58] uppercase tracking-wider">Tasks</span></div>';
    matchedTasks.forEach(t => {
      html += `<button onclick="openTaskModal('${t.id}'); document.getElementById('search-results').style.display='none'; document.getElementById('global-search').value='';" class="w-full text-left px-3 py-2 hover:bg-[#21262d] transition-all flex items-center gap-2">
        <i data-lucide="check-square" size="14" class="text-emerald-400 shrink-0"></i>
        <span class="text-xs text-white truncate">${t.title}</span>
      </button>`;
    });
  }
  container.innerHTML = html;
  container.style.display = '';
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

// ── Initialize ────────────────────────────────────────────
async function init() {
  try {
    await loadData();
  } catch (e) {
    console.error('loadData failed:', e);
  }
  setTaskView('list');
  setProjectViewMode('grid');
  switchMainTab('projects');
  lucide.createIcons();
  fixFilterIconSizes();
  if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
  // iroh 復元が遅い場合のリトライ（1s, 2s, 3s 後）
  if (_isTauri && typeof updateSidebarRoomInfo === 'function') {
    [1000, 2000, 3000].forEach((ms) => {
      setTimeout(() => updateSidebarRoomInfo(), ms);
    });
  }
}

// チーム同期でタスクが更新されたら再読み込み
if (_isTauri && window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen('team-task-updated', async () => {
    await loadData();
    if (typeof filterTasks === 'function') filterTasks();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
  });
  window.__TAURI__.event.listen('team-unsynced-updated', async () => {
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
  });
  window.__TAURI__.event.listen('team-conflict', (e) => {
    if (typeof showConflictDialog === 'function') showConflictDialog(e.payload);
  });
  window.__TAURI__.event.listen('team-subscriptions-restored', async () => {
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
  });
  window.__TAURI__.event.listen('team-blocked', async () => {
    showAlert('このチームからブロックされました。', 'error');
  });
  window.__TAURI__.event.listen('team-members-updated', async () => {
    if (typeof renderTeamMembers === 'function') await renderTeamMembers();
    if (typeof renderTeamBlocked === 'function') await renderTeamBlocked();
  });
  window.__TAURI__.event.listen('team-pending-join-cancelled', async () => {
    if (typeof renderTeamPendingJoins === 'function') await renderTeamPendingJoins();
    if (typeof renderInbox === 'function') await renderInbox();
  });
  window.__TAURI__.event.listen('team-pending-join', async () => {
    if (typeof renderTeamPendingJoins === 'function') await renderTeamPendingJoins();
    if (typeof renderInbox === 'function') await renderInbox();
  });
  window.__TAURI__.event.listen('team-cancelled', async () => {
    if (typeof renderTeamPendingStatus === 'function') await renderTeamPendingStatus();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
  });
  window.__TAURI__.event.listen('team-update-required', () => {
    showAlert('アプリのアップデートが必要です。最新版をインストールしてください。', 'error');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
