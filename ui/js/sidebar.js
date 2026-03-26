// ── Sidebar ───────────────────────────────────────────────
function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  const sidebar    = document.getElementById('sidebar');
  const logoText   = document.getElementById('logo-text');
  const navLabels  = document.querySelectorAll('.nav-label');
  if (isSidebarCollapsed) {
    sidebar.style.width = '64px';
    logoText.classList.add('hidden');
    navLabels.forEach(l => l.classList.add('hidden'));
  } else {
    sidebar.style.width = '224px';
    logoText.classList.remove('hidden');
    navLabels.forEach(l => l.classList.remove('hidden'));
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.transform = 'translateX(0)';
  document.getElementById('mobile-overlay').classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.style.transform = 'translateX(calc(-100% - 8px))';
  document.getElementById('mobile-overlay').classList.add('hidden');
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
    team:      'Team',
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
    settings:  'view-settings'
  };
  document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
  document.getElementById(viewMap[actualView])?.classList.remove('hidden');
  if (isProjects) switchMainTab('projects');
  if (actualView === 'logs' && typeof renderLogs === 'function') renderLogs();
  if (actualView === 'settings' && typeof renderSettings === 'function') renderSettings();
  if (actualView === 'analytics' && typeof renderAnalytics === 'function') renderAnalytics();
  if (actualView === 'inbox' && typeof renderInbox === 'function') renderInbox();
  if (actualView === 'team' && typeof renderTeamView === 'function') renderTeamView();
  closeMobileSidebar();
}
