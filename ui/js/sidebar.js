// ── Sidebar ───────────────────────────────────────────────
/** lg 未満ではドロワー、lg 以上では常時表示（Tailwind lg:translate-x-0）。インライン transform はクラスより優先されるため、PC で closeMobileSidebar が走るとサイドバーが消える。 */
function isMobileSidebarLayout() {
  return window.matchMedia('(max-width: 1023px)').matches;
}

/** 左 fixed バー: left-2(8px) + sidebar幅 + コンテンツ前余白(8px) */
const _SIDEBAR_LEFT = 8;
const _SIDEBAR_GAP = 8;
const _SIDEBAR_WIDTH_EXPANDED = 224;
const _SIDEBAR_WIDTH_COLLAPSED = 64;

function applyMainAreaSidebarInset() {
  const main = document.getElementById('main-area');
  if (!main) return;
  if (isMobileSidebarLayout()) {
    main.style.removeProperty('padding-left');
    return;
  }
  const w = isSidebarCollapsed ? _SIDEBAR_WIDTH_COLLAPSED : _SIDEBAR_WIDTH_EXPANDED;
  const px = _SIDEBAR_LEFT + w + _SIDEBAR_GAP;
  main.style.setProperty('padding-left', `${px}px`);
}

/** 折りたたみ時はナビアイコンを拡大（CSS #sidebar.sidebar-collapsed）。モバイルドロワーでは付けない */
function syncSidebarCollapsedClass() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const collapsedChrome = isSidebarCollapsed && !isMobileSidebarLayout();
  sidebar.classList.toggle('sidebar-collapsed', collapsedChrome);
}

function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  const sidebar    = document.getElementById('sidebar');
  const logoText   = document.getElementById('logo-text');
  const navLabels  = document.querySelectorAll('.nav-label');
  const roomInfo   = document.getElementById('sidebar-room-info');
  if (isSidebarCollapsed) {
    sidebar.style.width = `${_SIDEBAR_WIDTH_COLLAPSED}px`;
    logoText.classList.add('hidden');
    navLabels.forEach(l => l.classList.add('hidden'));
    if (roomInfo) roomInfo.style.display = 'none';
  } else {
    sidebar.style.width = `${_SIDEBAR_WIDTH_EXPANDED}px`;
    logoText.classList.remove('hidden');
    navLabels.forEach(l => l.classList.remove('hidden'));
    if (roomInfo) roomInfo.style.removeProperty('display');
  }
  syncSidebarCollapsedClass();
  applyMainAreaSidebarInset();
  try {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (_) { /* noop */ }
}

function openMobileSidebar() {
  if (!isMobileSidebarLayout()) return;
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (sidebar) sidebar.style.transform = 'translateX(0)';
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.style.removeProperty('display');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (sidebar) {
    if (isMobileSidebarLayout()) {
      sidebar.style.transform = 'translateX(calc(-100% - 8px))';
    } else {
      sidebar.style.removeProperty('transform');
    }
  }
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
  }
}

/** ハンバーガー: 狭い幅でのみドロワー開閉 */
function toggleSidebarVisibility() {
  if (!isMobileSidebarLayout()) return;
  const overlay = document.getElementById('mobile-overlay');
  if (!overlay) return;
  const closed = overlay.style.display === 'none';
  if (closed) openMobileSidebar();
  else closeMobileSidebar();
}

function setActiveMenu(menu) {
  console.log('setActiveMenu called with:', menu);
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
    team:      'Team',
    ai:        'AI',
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
    team:      'view-team',
    settings:  'view-settings',
    ai:        'view-ai'
  };
  // ネストした .view-section（例: view-projects）まで一括で触ると壊れるため、メイン画面だけ制御。インライン style と .hidden の競合も避ける。
  Object.values(viewMap).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    el.classList.add('hidden');
  });
  const targetEl = document.getElementById(viewMap[actualView]);
  if (targetEl) {
    targetEl.style.display = 'flex';
    targetEl.classList.remove('hidden');
  }
  if (actualView === 'overview') {
    if (isProjects) switchMainTab('projects');
    else {
      const tasksBtn = document.querySelector('[data-tab="tasks"]');
      const useTasks = tasksBtn && tasksBtn.classList.contains('bg-[#21262d]');
      switchMainTab(useTasks ? 'tasks' : 'projects');
    }
  }
  if (actualView === 'logs' && typeof renderLogs === 'function') renderLogs();
  if (actualView === 'settings' && typeof renderSettings === 'function') renderSettings();
  if (actualView === 'analytics' && typeof renderAnalytics === 'function') renderAnalytics();
  if (actualView === 'inbox' && typeof renderInbox === 'function') renderInbox();
  if (actualView === 'team' && typeof window.renderTeamView === 'function') window.renderTeamView();
  if (actualView === 'ai' && typeof initAiView === 'function') initAiView();
  closeMobileSidebar();
}

function _initSidebarLayout() {
  syncSidebarCollapsedClass();
  applyMainAreaSidebarInset();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initSidebarLayout);
} else {
  _initSidebarLayout();
}
window.addEventListener('resize', () => {
  syncSidebarCollapsedClass();
  applyMainAreaSidebarInset();
});
