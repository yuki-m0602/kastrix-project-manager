// Sidebar management
export function toggleSidebar() {
  state.isSidebarCollapsed = !state.isSidebarCollapsed;
  const sidebar = document.getElementById('sidebar');
  const logoText = document.getElementById('logo-text');
  const navLabels = document.querySelectorAll('.nav-label');
  
  if (state.isSidebarCollapsed) {
    sidebar.style.width = '64px';
    sidebar.style.minWidth = '64px';
    logoText.classList.add('hidden');
    navLabels.forEach(label => label.classList.add('hidden'));
  } else {
    sidebar.style.width = '224px';
    sidebar.style.minWidth = '224px';
    logoText.classList.remove('hidden');
    navLabels.forEach(label => label.classList.remove('hidden'));
  }
}

export function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.style.transform = 'translateX(0)';
  overlay.classList.remove('hidden');
}

export function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.style.transform = 'translateX(-100%)';
  overlay.classList.add('hidden');
}

export function setActiveMenu(menu) {
  state.activeMenu = menu;
  
  // Update sidebar button states
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.menu === menu;
    if (isActive) {
      btn.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    } else {
      btn.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    }
  });
  
  // Update mobile page title
  const titleEl = document.getElementById('mobile-page-title');
  if (titleEl) {
    const pageTitles = {
      overview: 'Overview',
      logs: 'Activity Logs',
      inbox: 'Inbox',
      analytics: 'Analytics',
      settings: 'Settings'
    };
    titleEl.textContent = pageTitles[menu] || '';
  }
  
  // Update PC page title
  const pcTitleEl = document.getElementById('pc-page-title');
  if (pcTitleEl) {
    const pageTitles = {
      overview: 'Overview',
      logs: 'Activity Logs',
      inbox: 'Inbox',
      analytics: 'Analytics',
      settings: 'Settings'
    };
    pcTitleEl.textContent = pageTitles[menu] || '';
  }
  
  // Show/hide view sections
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.add('hidden');
  });
  
  const viewMap = {
    'overview': 'view-overview',
    'logs': 'view-logs',
    'inbox': 'view-inbox',
    'analytics': 'view-analytics',
    'settings': 'view-settings'
  };
  
  const targetView = document.getElementById(viewMap[menu]);
  if (targetView) {
    targetView.classList.remove('hidden');
  }
}

export function toggleAiChat() {
  const chat = document.getElementById('ai-chat');
  chat.classList.toggle('hidden');
}