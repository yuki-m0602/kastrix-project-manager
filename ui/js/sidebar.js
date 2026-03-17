// ── Sidebar ───────────────────────────────────────────────
async function updateSidebarUnsyncedBadge() {
  const badge = document.getElementById('sidebar-unsynced-badge');
  const pushSection = document.getElementById('sidebar-push-section');
  const pushCount = document.getElementById('sidebar-push-count');
  if (!badge || !pushSection || !pushCount) return;
  if (!_isTauri || !window.__TAURI__) {
    badge.classList.add('hidden');
    pushSection.classList.add('hidden');
    return;
  }
  try {
    const [syncMode, count] = await Promise.all([
      apiTeamGetSyncMode(),
      apiTeamGetUnsyncedCount(),
    ]);
    const isManual = syncMode === SYNC_MODE_MANUAL;
    if (isManual && count > 0) {
      badge.textContent = String(count);
      badge.classList.remove('hidden');
      pushSection.classList.remove('hidden');
      pushCount.textContent = String(count);
    } else {
      badge.classList.add('hidden');
      if (isManual) {
        pushSection.classList.remove('hidden');
        pushCount.textContent = '0';
      } else {
        pushSection.classList.add('hidden');
      }
    }
  } catch (e) {
    badge.classList.add('hidden');
    pushSection.classList.add('hidden');
  }
}

async function teamPushUnsynced() {
  if (!_isTauri || !window.__TAURI__) return;
  try {
    await apiTeamPushUnsynced();
    await updateSidebarUnsyncedBadge();
  } catch (e) {
    console.error('Push failed:', e);
    showAlert('送信に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function updateSidebarRoomInfo() {
  const roomNameEl = document.getElementById('sidebar-room-name');
  const syncDotEl = document.getElementById('sidebar-sync-dot');
  const syncLabelEl = document.getElementById('sidebar-sync-label');
  if (!roomNameEl || !syncDotEl || !syncLabelEl) return;
  if (!_isTauri || !window.__TAURI__) {
    roomNameEl.textContent = '未参加';
    syncLabelEl.textContent = '未参加';
    syncDotEl.className = 'w-1.5 h-1.5 rounded-full bg-[#484f58]';
    return;
  }
  try {
    const info = await apiTeamGetCurrentRoom();
    roomNameEl.textContent = info.room_name || info.roomName || '未参加';
    syncLabelEl.textContent = info.status || '未参加';
    syncDotEl.title = info.status || '未参加';
    if (info.status === '同期中') {
      syncDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse';
    } else if (info.status === '接続中') {
      syncDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse';
    } else {
      syncDotEl.className = 'w-1.5 h-1.5 rounded-full bg-[#484f58]';
    }
  } catch (e) {
    roomNameEl.textContent = '未参加';
    syncLabelEl.textContent = '未参加';
    syncDotEl.className = 'w-1.5 h-1.5 rounded-full bg-[#484f58]';
  }
  await updateSidebarUnsyncedBadge();
}

function toggleSidebarVisibility() {
  if (window.innerWidth < 1024) {
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar && sidebar.style.transform === 'translateX(0)';
    if (isOpen) closeMobileSidebar();
    else openMobileSidebar();
  } else {
    toggleSidebar();
  }
}

function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  const sidebar    = document.getElementById('sidebar');
  const mainArea   = document.getElementById('main-area');
  const logoText   = document.getElementById('logo-text');
  const roomInfo   = document.getElementById('sidebar-room-info');
  const navLabels  = document.querySelectorAll('.nav-label');
  if (isSidebarCollapsed) {
    sidebar.style.width = '64px';
    mainArea.style.paddingLeft = '80px';
    logoText.style.display = 'none';
    if (roomInfo) roomInfo.style.display = 'none';
    navLabels.forEach(l => l.style.display = 'none');
  } else {
    sidebar.style.width = '224px';
    mainArea.style.paddingLeft = '240px';
    logoText.style.display = '';
    if (roomInfo) roomInfo.style.display = 'flex';
    navLabels.forEach(l => l.style.display = '');
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.transform = 'translateX(0)';
  document.getElementById('mobile-overlay').style.display = '';
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.transform = 'translateX(calc(-100% - 8px))';
  document.getElementById('mobile-overlay').style.display = 'none';
}

function setActiveMenu(menu) {
  // 'projects' はOverviewビュー+Projectsタブへのショートカット
  const isProjects = menu === 'projects';
  const actualView = isProjects ? 'overview' : menu;
  activeMenu = menu;
  const pageTitles = {
    overview:  'Overview',
    projects:  'Projects',
    logs:      'Activity Logs',
    inbox:     'Inbox',
    analytics: 'Analytics',
    settings:  'Settings'
  };
  const titleEl = document.getElementById('mobile-page-title');
  if (titleEl) titleEl.textContent = pageTitles[menu] || '';
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.dataset.menu === menu;
    btn.classList.toggle('bg-[#21262d]',    active);
    btn.classList.toggle('text-white',       active);
    btn.classList.toggle('border-[#484f58]', active);
    btn.classList.toggle('shadow-sm',        active);
  });
  const viewMap = {
    overview:  'view-overview',
    logs:      'view-logs',
    inbox:     'view-inbox',
    analytics: 'view-analytics',
    settings:  'view-settings'
  };
  const displayMap = {
    overview:  'flex',
    logs:      'flex',
    inbox:     'flex',
    analytics: 'flex',
    settings:  'flex'
  };
  document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
  const targetView = document.getElementById(viewMap[actualView]);
  if (targetView) {
    targetView.style.display = displayMap[actualView] || 'flex';
  }
  if (actualView === 'overview' || isProjects) switchMainTab('projects');
  if (actualView === 'logs' && typeof renderLogs === 'function') renderLogs();
  if (actualView === 'settings' && typeof renderSettings === 'function') renderSettings();
  if (actualView === 'analytics' && typeof renderAnalytics === 'function') renderAnalytics();
  if (actualView === 'inbox' && typeof renderInbox === 'function') renderInbox();
  // Logs/Inbox/Analytics/Settings ではメインヘッダーを非表示（各ビューにメニューボタンあり）
  const mainHeader = document.getElementById('main-header');
  if (mainHeader) {
    const hideMainHeader = ['logs', 'inbox', 'analytics', 'settings'].includes(actualView);
    mainHeader.style.display = hideMainHeader ? 'none' : '';
  }
  if (window.innerWidth < 1024) {
    closeMobileSidebar();
  } else {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.transform = '';
  }
}
