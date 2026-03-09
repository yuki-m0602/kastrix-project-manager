// Initialize Lucide icons
lucide.createIcons();

// Fix for mobile viewport issues
if (window.innerWidth <= 768) {
  document.documentElement.style.setProperty('--tw-min-w-0', '0');
}

// State
let isSidebarCollapsed = false;
let activeMenu = 'overview';
let currentView = 'list';
let isAiOpen = false;
let activeTabId = 'all';
let openTabs = ['all', 'proj-1', 'proj-2'];
let currentTaskView = 'list';
let currentProjectViewMode = 'grid';

// Task data
const tasks = [
  { id: '1', projectId: 'proj-1', title: 'ランディングページ制作', status: 'done', priority: 'high', date: '2023-10-27 11:00', assignee: 'Tanaka', action: 'completed' },
  { id: '2', projectId: 'proj-1', title: 'SEOキーワード選定', status: 'in-progress', priority: 'medium', date: '2023-10-26 09:15', assignee: 'Sato', action: 'started' },
  { id: '3', projectId: 'proj-2', title: 'ログイン画面の実装', status: 'todo', priority: 'high', date: '2023-10-27 11:00', assignee: 'Suzuki', action: 'created' },
  { id: '4', projectId: 'proj-3', title: 'カラーパレット定義', status: 'done', priority: 'low', date: '2023-10-24 16:45', assignee: 'Ito', action: 'completed' },
  { id: '5', projectId: 'proj-2', title: 'APIドキュメント更新', status: 'done', priority: 'medium', date: '2023-10-23 10:30', assignee: 'Suzuki', action: 'completed' }
];

// Tab Management Functions
function setActiveTab(tabId) {
  activeTabId = tabId;
  renderTabs();
  updateContent();
}

function renderTabs() {
  const tabsList = document.getElementById('tabs-list');
  if (!tabsList) return;
  
  tabsList.innerHTML = openTabs.map(tabId => {
    const project = projects.find(p => p.id === tabId);
    const isActive = tabId === activeTabId;
    return `
      <button onclick="setActiveTab('${tabId}')" 
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${isActive ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-white'}">
        ${tabId === 'all' ? 'All Projects' : project?.name || tabId}
      </button>
    `;
  }).join('');
}

function updateContent() {
  const activeProject = document.getElementById('active-project');
  if (activeTabId === 'all') {
    activeProject.textContent = 'All Projects';
  } else {
    const project = projects.find(p => p.id === activeTabId);
    activeProject.textContent = project?.name || activeTabId;
  }
  filterTasks();
}

// View Management
function setTaskView(view) {
  currentTaskView = view;
  const listView = document.getElementById('list-view');
  const kanbanView = document.getElementById('kanban-view');
  const btnList = document.getElementById('btn-task-list');
  const btnKanban = document.getElementById('btn-task-kanban');
  
  if (view === 'list') {
    listView.classList.remove('hidden');
    kanbanView.classList.add('hidden');
    btnList.classList.add('bg-[#30363d]', 'text-white');
    btnList.classList.remove('text-[#8b949e]');
    btnKanban.classList.remove('bg-[#30363d]', 'text-white');
    btnKanban.classList.add('text-[#8b949e]');
  } else {
    listView.classList.add('hidden');
    kanbanView.classList.remove('hidden');
    btnKanban.classList.add('bg-[#30363d]', 'text-white');
    btnKanban.classList.remove('text-[#8b949e]');
    btnList.classList.remove('bg-[#30363d]', 'text-white');
    btnList.classList.add('text-[#8b949e]');
  }
  filterTasks();
}

function setProjectViewMode(mode) {
  currentProjectViewMode = mode;
  const gridView = document.getElementById('projects-grid-view');
  const listView = document.getElementById('projects-list-view');
  const btnGrid = document.getElementById('btn-project-grid');
  const btnList = document.getElementById('btn-project-list');
  
  if (mode === 'grid') {
    gridView.classList.remove('hidden');
    listView.classList.add('hidden');
    btnGrid.classList.add('bg-[#30363d]', 'text-white');
    btnGrid.classList.remove('text-[#8b949e]');
    btnList.classList.remove('bg-[#30363d]', 'text-white');
    btnList.classList.add('text-[#8b949e]');
  } else {
    gridView.classList.add('hidden');
    listView.classList.remove('hidden');
    btnList.classList.add('bg-[#30363d]', 'text-white');
    btnList.classList.remove('text-[#8b949e]');
    btnGrid.classList.remove('bg-[#30363d]', 'text-white');
    btnGrid.classList.add('text-[#8b949e]');
  }
}

// Task Functions
function filterTasks() {
  const statusFilter = document.getElementById('task-status-filter')?.value || 'all';
  const filtered = statusFilter === 'all' ? tasks : tasks.filter(t => t.status === statusFilter);
  
  renderTaskList(filtered);
  renderKanban(filtered);
}

function filterTasksByStatus(status) {
  filterTasks();
}

function sortTasks(sortBy) {
  filterTasks();
}

function renderTaskList(filteredTasks) {
  const tbody = document.getElementById('list-view-body');
  const statusMap = {
    'todo': { border: 'border-slate-400/20', color: 'text-slate-400' },
    'in-progress': { border: 'border-blue-400/20', color: 'text-blue-400' },
    'done': { border: 'border-emerald-400/20', color: 'text-emerald-400' }
  };
  
  tbody.innerHTML = filteredTasks.map(t => `
    <tr onclick="openTaskModal('${t.id}')" class="hover:bg-[#161b22] group cursor-pointer rounded-2xl transition-all">
      <td class="px-4 py-4 font-bold text-[#f0f6fc] first:rounded-l-2xl">${t.title}</td>
      <td class="px-4 py-4 text-[#8b949e]">${t.assignee}</td>
      <td class="px-4 py-4 last:rounded-r-2xl">
        <span class="px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${statusMap[t.status].border} ${statusMap[t.status].color}">${t.status.toUpperCase()}</span>
      </td>
    </tr>
  `).join('');
}

function renderKanban(filteredTasks) {
  const priorityColors = {
    'high': 'bg-red-500/10 text-red-500',
    'medium': 'bg-yellow-500/10 text-yellow-500',
    'low': 'bg-green-500/10 text-green-500'
  };
  
  ['todo', 'in-progress', 'done'].forEach(status => {
    const container = document.getElementById(`kanban-${status === 'in-progress' ? 'inprogress' : status}`);
    const statusTasks = filteredTasks.filter(t => t.status === status);
    document.getElementById(`count-${status === 'in-progress' ? 'inprogress' : status}`).textContent = statusTasks.length;
    
    container.innerHTML = statusTasks.map(t => `
      <div onclick="openTaskModal('${t.id}')" class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 hover:border-${status === 'todo' ? 'slate' : status === 'in-progress' ? 'blue' : 'emerald'}-400/30 transition-all cursor-pointer ${status === 'done' ? 'opacity-60' : ''}">
        <p class="text-white font-bold text-sm leading-tight mb-3 ${status === 'done' ? 'line-through' : ''}">${t.title}</p>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-black">${t.assignee[0]}</div>
          </div>
          <span class="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${priorityColors[t.priority]}">${t.priority.toUpperCase()}</span>
        </div>
      </div>
    `).join('');
  });
}

// Close picker when clicking outside
document.addEventListener('click', (e) => {
  const picker = document.getElementById('project-picker');
  const addBtn = document.getElementById('add-tab-btn');
  if (picker && addBtn && !picker.contains(e.target) && e.target !== addBtn && !addBtn.contains(e.target)) {
    picker.classList.add('hidden');
  }
});

// Projects Data & Functions
const localProjects = [
  { id: 1, name: 'lumina-dashboard', path: 'C:\\Projects\\lumina-dashboard', language: 'typescript', localModified: '2024-01-15 14:30', gitModified: '2024-01-14 09:15', lastCommit: 'feat: add project filtering' },
  { id: 2, name: 'api-gateway', path: 'C:\\Projects\\api-gateway', language: 'rust', localModified: '2024-01-14 18:45', gitModified: '2024-01-14 16:20', lastCommit: 'fix: handle cors headers' },
  { id: 3, name: 'data-processor', path: 'D:\\Workspace\\data-processor', language: 'python', localModified: '2024-01-13 11:20', gitModified: '2024-01-12 15:30', lastCommit: 'refactor: optimize pipeline' },
  { id: 4, name: 'portfolio-site', path: 'C:\\Projects\\portfolio-site', language: 'javascript', localModified: '2024-01-15 09:00', gitModified: '2024-01-15 08:45', lastCommit: 'design: update hero section' },
  { id: 5, name: 'ecommerce-backend', path: 'D:\\Workspace\\ecommerce-backend', language: 'typescript', localModified: '2024-01-14 22:15', gitModified: '2024-01-14 20:00', lastCommit: 'feat: add payment integration' },
  { id: 6, name: 'cli-tools', path: '~/dev/cli-tools', language: 'go', localModified: '2024-01-13 16:30', gitModified: '2024-01-13 14:00', lastCommit: 'chore: update dependencies' }
];

const langColors = {
  'javascript': { bg: 'bg-[#f1e05a20]', text: 'text-[#f1e05a]', label: 'JS' },
  'typescript': { bg: 'bg-[#2b748920]', text: 'text-[#2b7489]', label: 'TS' },
  'python': { bg: 'bg-[#3572A520]', text: 'text-[#3572A5]', label: 'PY' },
  'rust': { bg: 'bg-[#dea58420]', text: 'text-[#dea584]', label: 'RS' },
  'go': { bg: 'bg-[#00ADD820]', text: 'text-[#00ADD8]', label: 'GO' }
};

function renderProjects() {
  const container = document.getElementById('projects-grid-view');
  if (!container) return;
  
  const sortValue = document.getElementById('project-sort')?.value || 'name';
  let sorted = [...localProjects];
  
  if (sortValue === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortValue === 'modified') sorted.sort((a, b) => new Date(b.localModified) - new Date(a.localModified));
  else if (sortValue === 'git') sorted.sort((a, b) => new Date(b.gitModified) - new Date(a.gitModified));
  
  const langFilter = document.getElementById('project-lang-filter')?.value || 'all';
  if (langFilter !== 'all') {
    sorted = sorted.filter(p => p.language === langFilter);
  }
  
  container.innerHTML = sorted.map(p => {
    const lang = langColors[p.language] || { bg: 'bg-[#8b949e20]', text: 'text-[#8b949e]', label: '?' };
    return `
      <div onclick="openProjectDetailModal(${p.id})" class="bg-[#161b22] border border-[#30363d] rounded-2xl p-3 sm:p-4 hover:border-[#484f58] transition-all cursor-pointer group">
        <div class="flex items-start justify-between mb-2 sm:mb-3">
          <div class="flex items-center gap-2 sm:gap-3 min-w-0">
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#21262d] flex items-center justify-center shrink-0">
              <i data-lucide="folder-git-2" size="18" class="text-indigo-400 sm:w-5 sm:h-5"></i>
            </div>
            <div class="min-w-0">
              <h3 class="font-bold text-white text-sm sm:text-base truncate">${p.name}</h3>
              <p class="text-[9px] sm:text-xs text-[#8b949e] truncate">${p.path}</p>
            </div>
          </div>
          <span class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[10px] font-black ${lang.bg} ${lang.text} shrink-0 ml-2">${lang.label}</span>
        </div>
        <div class="space-y-0.5 sm:space-y-1 text-[9px] sm:text-xs text-[#8b949e]">
          <div class="flex justify-between">
            <span>Local</span>
            <span>${p.localModified}</span>
          </div>
          <div class="flex justify-between">
            <span>Git</span>
            <span>${p.gitModified}</span>
          </div>
        </div>
        <div class="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-[#30363d]">
          <p class="text-[9px] sm:text-xs text-indigo-400 truncate">${p.lastCommit}</p>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

function sortProjects(sortBy) {
  renderProjects();
}

function filterProjectsByLang(lang) {
  renderProjects();
}

function openProjectDetailModal(projectId) {
  const project = localProjects.find(p => p.id === projectId);
  if (!project) return;
  
  document.getElementById('project-modal-name').textContent = project.name;
  document.getElementById('project-modal-lang-badge').textContent = langColors[project.language]?.label || '?';
  document.getElementById('project-modal-local').textContent = project.localModified;
  document.getElementById('project-modal-git').textContent = project.gitModified;
  document.getElementById('project-modal-path').textContent = project.path;
  
  const modal = document.getElementById('project-detail-modal');
  const content = document.getElementById('project-detail-modal-content');
  modal.classList.remove('hidden');
  setTimeout(() => {
    content.classList.remove('translate-x-full');
  }, 10);
}

function closeProjectDetailModal() {
  const content = document.getElementById('project-detail-modal-content');
  content.classList.add('translate-x-full');
  setTimeout(() => {
    document.getElementById('project-detail-modal').classList.add('hidden');
  }, 300);
}

// Sidebar Functions
function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  const sidebar = document.getElementById('sidebar');
  const logoText = document.getElementById('logo-text');
  const navLabels = document.querySelectorAll('.nav-label');
  
  if (isSidebarCollapsed) {
    sidebar.classList.remove('w-56');
    sidebar.classList.add('w-16');
    logoText.classList.add('hidden');
    navLabels.forEach(label => label.classList.add('hidden'));
  } else {
    sidebar.classList.remove('w-16');
    sidebar.classList.add('w-56');
    logoText.classList.remove('hidden');
    navLabels.forEach(label => label.classList.remove('hidden'));
  }
}

function openMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.remove('-translate-x-full');
  sidebar.classList.add('translate-x-0');
  overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  sidebar.classList.add('-translate-x-full');
  sidebar.classList.remove('translate-x-0');
  overlay.classList.add('hidden');
}

function setActiveMenu(menu) {
  activeMenu = menu;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.menu === menu;
    if (isActive) {
      btn.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    } else {
      btn.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    }
  });
  
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

function toggleAiChat() {
  const chat = document.getElementById('ai-chat');
  chat.classList.toggle('hidden');
}

// Initialize
function init() {
  renderTabs();
  updateContent();
  renderProjects();
  setActiveMenu('overview');
  switchMainTab('tasks');
  setTaskView('list');
  setProjectViewMode('grid');
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
