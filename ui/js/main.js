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
// Tailwind の .hidden は display:none。style.display だけでは開閉できないため class で制御する。
function closeAllDropdowns() {
  document.querySelectorAll('[id^="dd-"]').forEach((el) => {
    el.classList.add('hidden');
    el.style.removeProperty('display');
  });
}

function toggleDropdown(id) {
  const dd = document.getElementById(id);
  if (!dd) return;
  const opening = dd.classList.contains('hidden');
  closeAllDropdowns();
  if (opening) dd.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('[onclick^="toggleDropdown"]')) {
    closeAllDropdowns();
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
  const backdrop = document.getElementById('project-picker-backdrop');
  const addBtn = document.getElementById('add-tab-btn');
  if (picker && picker.style.display === 'block' && typeof closeProjectPicker === 'function') {
    const inPicker = picker.contains(e.target);
    const inBackdrop = backdrop?.contains(e.target);
    const inAdd = addBtn && (e.target === addBtn || addBtn.contains(e.target));
    if (!inPicker && !inBackdrop && !inAdd) {
      closeProjectPicker();
    }
  }
  const searchResults = document.getElementById('search-results');
  const searchInput = document.getElementById('global-search');
  if (searchResults && searchInput && !searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.add('hidden');
    searchResults.style.removeProperty('display');
  }
});

// ── 衝突ダイアログ (local vs local) ───────────────────────
let _pendingConflict = null;
let _conflictDebounceUntil = 0;

/** Tauri event.listen の第1引数が { payload } なのか、ペイロード単体なのかを吸収 */
function unwrapTeamConflictArg(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  if (
    Object.prototype.hasOwnProperty.call(raw, 'payload') &&
    raw.payload != null &&
    typeof raw.payload === 'object' &&
    !Array.isArray(raw.payload)
  ) {
    return raw.payload;
  }
  return raw;
}

/** ペイロード内の Task（文字列化・キー揺れ対応） */
function coerceConflictTask(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return typeof v === 'object' ? v : null;
}

/** 表示用: Rust の camelCase と snake_case の両方を読む */
function conflictTaskSummary(t) {
  const o = coerceConflictTask(t);
  if (!o) {
    return { title: '-', detail: '-' };
  }
  const title =
    o.title ||
    o.Title ||
    (o.id != null && o.id !== '' ? String(o.id) : '') ||
    (o.Id != null && o.Id !== '' ? String(o.Id) : '') ||
    '-';
  const status = o.status ?? o.Status;
  const priority = o.priority ?? o.Priority;
  const detail =
    [status, priority].filter((x) => x != null && String(x) !== '').join(' / ') || '-';
  return { title, detail };
}

function showConflictDialog(rawArg) {
  const payload = unwrapTeamConflictArg(rawArg);
  if (!payload || typeof payload !== 'object') return;

  const incomingObj = coerceConflictTask(payload.incoming ?? payload.Incoming);
  const localObj = coerceConflictTask(payload.local ?? payload.Local);
  const tid =
    payload.taskId ||
    payload.task_id ||
    (incomingObj && (incomingObj.id || incomingObj.Id)) ||
    (localObj && (localObj.id || localObj.Id));
  if (!tid) return;
  if (Date.now() < _conflictDebounceUntil) return;
  if (_pendingConflict) return;

  initConflictModal();

  // 競合表示時はタスク系モーダルを畳む（z 順・ゴーストクリックで残ったオーバーレイを防ぐ）
  if (typeof closeTaskEditModal === 'function') {
    try {
      closeTaskEditModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeTaskModal === 'function') {
    try {
      closeTaskModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeProjectDetailModal === 'function') {
    try {
      closeProjectDetailModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeProjectPicker === 'function') {
    try {
      closeProjectPicker();
    } catch (err) {
      void err;
    }
  }

  _pendingConflict = payload;
  const modal = document.getElementById('conflict-modal');
  if (!modal) return;
  const localSum = conflictTaskSummary(localObj);
  const incomingSum = conflictTaskSummary(incomingObj);
  const el = (id) => document.getElementById(id);
  const lt = el('conflict-local-title');
  const ls = el('conflict-local-status');
  const it = el('conflict-incoming-title');
  const is2 = el('conflict-incoming-status');
  if (lt) lt.textContent = localSum.title;
  if (ls) ls.textContent = localSum.detail;
  if (it) it.textContent = incomingSum.title;
  if (is2) is2.textContent = incomingSum.detail;
  modal.style.display = 'flex';
  modal.style.pointerEvents = 'auto';
}

/** ゴーストクリックで「+ New Task」等にイベントが落ちないよう、短時間だけメインを無効化 */
function brieflyBlockMainPointerEvents(ms) {
  const main = document.getElementById('main-area');
  const sidebar = document.getElementById('sidebar');
  if (main) main.style.pointerEvents = 'none';
  if (sidebar) sidebar.style.pointerEvents = 'none';
  window.setTimeout(() => {
    if (main) main.style.pointerEvents = '';
    if (sidebar) sidebar.style.pointerEvents = '';
  }, ms);
}
window.brieflyBlockMainPointerEvents = brieflyBlockMainPointerEvents;

function closeConflictModal() {
  const modal = document.getElementById('conflict-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.style.pointerEvents = 'none';
  }
  _pendingConflict = null;
  _conflictDebounceUntil = Date.now() + 3000;
}

async function resolveConflict(choice) {
  const saved = _pendingConflict;
  brieflyBlockMainPointerEvents(500);
  closeConflictModal();
  if (typeof closeTaskEditModal === 'function') {
    try {
      closeTaskEditModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeTaskModal === 'function') {
    try {
      closeTaskModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeProjectDetailModal === 'function') {
    try {
      closeProjectDetailModal();
    } catch (err) {
      void err;
    }
  }
  if (typeof closeProjectPicker === 'function') {
    try {
      closeProjectPicker();
    } catch (err) {
      void err;
    }
  }
  if (!saved) return;
  try {
    const incoming = saved.incoming ?? saved.Incoming;
    if (_isTauri && incoming) {
      const seq = saved.conflictSeq || saved.conflict_seq || null;
      await apiTeamResolveConflict(choice, incoming, seq);
    }
  } catch (e) {
    console.error('Conflict resolve failed:', e);
  }
  try {
    await loadData();
    if (typeof filterTasks === 'function') filterTasks();
  } catch (err) {
    void err;
  }
}

let _conflictModalWired = false;

/**
 * 競合モーダルは #conflict-modal へ capture で委譲（子要素差し替えや WebView でもクリックを拾う）
 */
function initConflictModal() {
  if (_conflictModalWired) return;
  const modal = document.getElementById('conflict-modal');
  if (!modal) return;
  _conflictModalWired = true;
  modal.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('#conflict-keep-local')) {
        e.preventDefault();
        e.stopPropagation();
        void resolveConflict('local');
        return;
      }
      if (t.closest('#conflict-use-incoming')) {
        e.preventDefault();
        e.stopPropagation();
        void resolveConflict('incoming');
        return;
      }
      if (t.id === 'conflict-modal-backdrop') {
        e.preventDefault();
        e.stopPropagation();
        brieflyBlockMainPointerEvents(500);
        closeConflictModal();
      }
    },
    true
  );
}

window.closeConflictModal = closeConflictModal;
window.resolveConflict = resolveConflict;
/** 取り残しオーバーレイの応急解除（開発者コンソールから `__kastrixResetModals()`） */
window.__kastrixResetModals = function __kastrixResetModals() {
  brieflyBlockMainPointerEvents(50);
  closeConflictModal();
  if (typeof closeTaskEditModal === 'function') {
    try {
      closeTaskEditModal();
    } catch (_) {
      /* ignore */
    }
  }
  if (typeof closeTaskModal === 'function') {
    try {
      closeTaskModal();
    } catch (_) {
      /* ignore */
    }
  }
  if (typeof closeProjectDetailModal === 'function') {
    try {
      closeProjectDetailModal();
    } catch (_) {
      /* ignore */
    }
  }
  if (typeof closeProjectPicker === 'function') {
    try {
      closeProjectPicker();
    } catch (_) {
      /* ignore */
    }
  }
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const picker = document.getElementById('project-picker');
    if (picker && picker.style.display === 'block' && typeof closeProjectPicker === 'function') {
      closeProjectPicker();
      return;
    }
  }
  if (e.key === 'Escape' && _pendingConflict) {
    brieflyBlockMainPointerEvents(500);
    closeConflictModal();
  }
});

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

// ── Initialize ────────────────────────────────────────────
async function init() {
  initConflictModal();
  if (typeof initProjectDetailModalDelegation === 'function') {
    initProjectDetailModalDelegation();
  }
  if (typeof initProjectPickerDelegation === 'function') {
    initProjectPickerDelegation();
  }
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

/** 原因調査: localStorage `kastrixDebugTeamEvents=1` または `window.__KASTRIX_DEBUG_TEAM_EVENTS = true` で team-conflict の生データを console に出す */
function _kastrixTeamConflictDebugEnabled() {
  try {
    if (window.__KASTRIX_DEBUG_TEAM_EVENTS === true) return true;
    return localStorage.getItem('kastrixDebugTeamEvents') === '1';
  } catch {
    return false;
  }
}

function _logTeamConflictEventForDebug(raw) {
  if (!_kastrixTeamConflictDebugEnabled()) return;
  try {
    console.info('[kastrix debug] team-conflict listener: raw argument =', raw);
    const unwrapped = typeof unwrapTeamConflictArg === 'function' ? unwrapTeamConflictArg(raw) : raw;
    console.info('[kastrix debug] team-conflict unwrapped JSON:\n', JSON.stringify(unwrapped, null, 2));
  } catch (err) {
    console.warn('[kastrix debug] team-conflict log failed', err);
  }
}

/** 原因調査: コンソールで `__kastrixDumpModalState()` — 主要モーダルの display / pointer-events / z-index */
window.__kastrixDumpModalState = function __kastrixDumpModalState() {
  const ids = [
    'task-modal',
    'task-edit-modal',
    'project-detail-modal',
    'conflict-modal',
    'project-picker',
    'project-picker-backdrop',
  ];
  const rows = ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) {
      return { id, found: false };
    }
    const cs = window.getComputedStyle(el);
    return {
      id,
      found: true,
      styleDisplay: el.style.display || '',
      computedDisplay: cs.display,
      stylePointerEvents: el.style.pointerEvents || '',
      computedPointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
    };
  });
  if (typeof console.table === 'function') {
    console.table(rows);
  } else {
    console.info('[kastrix] modal state', rows);
  }
  return rows;
};

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
    _logTeamConflictEventForDebug(e);
    if (typeof showConflictDialog === 'function') showConflictDialog(e);
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
