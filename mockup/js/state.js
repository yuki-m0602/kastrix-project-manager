// State management
// Note: We don't import from other modules to avoid circular dependencies
// Instead, initialization is handled in index.js after all modules are loaded

export const state = {
  isSidebarCollapsed: false,
  activeMenu: 'overview',
  currentView: 'list',
  isAiOpen: false,
  activeTabId: 'all',
  openTabs: ['all', 'proj-1', 'proj-2'],
  currentTaskView: 'list',
  currentProjectViewMode: 'grid',
  tasks: [],
  projects: [],
  localProjects: [],
  langColors: {
    'javascript': { bg: 'bg-[#f1e05a20]', text: 'text-[#f1e05a]', label: 'JS' },
    'typescript': { bg: 'bg-[#2b748920]', text: 'text-[#2b7489]', label: 'TS' },
    'python': { bg: 'bg-[#3572A520]', text: 'text-[#3572A5]', label: 'PY' },
    'rust': { bg: 'bg-[#dea58420]', text: 'text-[#dea584]', label: 'RS' },
    'go': { bg: 'bg-[#00ADD820]', text: 'text-[#00ADD8]', label: 'GO' }
  },
  languageLabels: {
    'javascript': 'JS',
    'typescript': 'TS',
    'python': 'PY',
    'rust': 'RS',
    'go': 'GO',
    'html': 'HTML',
    'css': 'CSS',
    'java': 'JAVA',
    'shell': 'SH'
  }
};

// Initialize Lucide icons
export function initIcons() {
  lucide.createIcons();
}

// Fix for mobile viewport issues
export function initMobileFix() {
  if (window.innerWidth <= 768) {
    document.documentElement.style.setProperty('--tw-min-w-0', '0');
  }
}

// Event listeners
export function setupEventListeners() {
  // Close project picker when clicking outside
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('project-picker');
    const addBtn = document.getElementById('add-tab-btn');
    if (picker && addBtn && !picker.contains(e.target) && e.target !== addBtn && !addBtn.contains(e.target)) {
      picker.classList.add('hidden');
    }
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('[onclick^="toggleDropdown"]')) {
      document.querySelectorAll('[id^="dd-"]').forEach(el => el.classList.add('hidden'));
    }
  });
  
  // Handle browser back button for modals
  window.addEventListener('popstate', () => {
    const modalHistory = getModalHistory();
    if (modalHistory === 'task') {
      const content = document.getElementById('task-modal-content');
      if (content) {
        content.classList.add('translate-x-full');
        setTimeout(() => document.getElementById('task-modal')?.classList.add('hidden'), 300);
      }
    } else if (modalHistory === 'project') {
      const content = document.getElementById('project-detail-modal-content');
      if (content) {
        content.classList.add('translate-x-full');
        setTimeout(() => document.getElementById('project-detail-modal')?.classList.add('hidden'), 300);
      }
    }
  });
}

// Initialize application
export function init() {
  initIcons();
  initMobileFix();
  setupEventListeners();
  
  // Load initial data
  loadInitialData();
  
  // Setup UI
  setupUI();
  
  // Note: UI initialization (setActiveMenu, etc.) is handled in index.js
  // to avoid circular dependencies between modules
}

// Setup UI - placeholder for UI initialization
export function setupUI() {
  // This can be extended as needed
}

// Load initial data
export function loadInitialData() {
  // Mock data - in real app, this would come from API or file system
  state.tasks = [
    { id: '1', projectId: 'proj-1', title: 'ランディングページ制作', status: 'done', priority: 'high', date: '2023-10-27 11:00', assignee: 'Tanaka', action: 'completed' },
    { id: '2', projectId: 'proj-1', title: 'SEOキーワード選定', status: 'in-progress', priority: 'medium', date: '2023-10-26 09:15', assignee: 'Sato', action: 'started' },
    { id: '3', projectId: 'proj-2', title: 'ログイン画面の実装', status: 'todo', priority: 'high', date: '2023-10-27 11:00', assignee: 'Suzuki', action: 'created' },
    { id: '4', projectId: 'proj-3', title: 'カラーパレット定義', status: 'done', priority: 'low', date: '2023-10-24 16:45', assignee: 'Ito', action: 'completed' },
    { id: '5', projectId: 'proj-2', title: 'APIドキュメント更新', status: 'done', priority: 'medium', date: '2023-10-23 10:30', assignee: 'Suzuki', action: 'completed' }
  ];
  
  state.projects = [
    { id: 'proj-1', name: 'Marketing Web', color: 'indigo', icon: 'M' },
    { id: 'proj-2', name: 'Mobile App', color: 'purple', icon: 'A' },
    { id: 'proj-3', name: 'Design System', color: 'pink', icon: 'D' }
  ];
  
  state.localProjects = [
    { id: 1, name: 'lumina-dashboard', path: 'C:\\Projects\\lumina-dashboard', language: 'typescript', localModified: '2024-01-15 14:30', gitModified: '2024-01-14 09:15', lastCommit: 'feat: add project filtering' },
    { id: 2, name: 'api-gateway', path: 'C:\\Projects\\api-gateway', language: 'rust', localModified: '2024-01-14 18:45', gitModified: '2024-01-14 16:20', lastCommit: 'fix: handle cors headers' },
    { id: 3, name: 'data-processor', path: 'D:\\Workspace\\data-processor', language: 'python', localModified: '2024-01-13 11:20', gitModified: '2024-01-12 15:30', lastCommit: 'refactor: optimize pipeline' },
    { id: 4, name: 'portfolio-site', path: 'C:\\Projects\\portfolio-site', language: 'javascript', localModified: '2024-01-15 09:00', gitModified: '2024-01-15 08:45', lastCommit: 'design: update hero section' },
    { id: 5, name: 'ecommerce-backend', path: 'D:\\Workspace\\ecommerce-backend', language: 'typescript', localModified: '2024-01-14 22:15', gitModified: '2024-01-14 20:00', lastCommit: 'feat: add payment integration' },
    { id: 6, name: 'cli-tools', path: '~/dev/cli-tools', language: 'go', localModified: '2024-01-13 16:30', gitModified: '2024-01-13 14:00', lastCommit: 'chore: update dependencies' }
  ];
}

// Fix for filter icon sizes after lucide renders
export function fixFilterIconSizes() {
  ['task-filter', 'project-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll('svg').forEach(svg => {
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
    });
  });
}

// Modal history for back button support
let _modalHistory = null;

export function pushModalHistory(type) {
  _modalHistory = type;
  history.pushState({ modal: type }, '');
}

export function getModalHistory() {
  return _modalHistory;
}

// Export functions for external use
export { pushModalHistory, getModalHistory, fixFilterIconSizes, setupUI, state };