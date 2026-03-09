// ── Main Tabs (Projects / Tasks) ──────────────────────────
function switchMainTab(tab) {
  const btnProjects    = document.querySelector('[data-tab="projects"]');
  const btnTasks       = document.querySelector('[data-tab="tasks"]');
  const tasksControls  = document.getElementById('tasks-view-controls');
  const projectsControls = document.getElementById('projects-view-controls');
  const addFolderBtn   = document.getElementById('btn-add-folder');
  const taskFilter     = document.getElementById('task-filter');
  const projectFilter  = document.getElementById('project-filter');
  const listView       = document.getElementById('list-view');
  const kanbanView     = document.getElementById('kanban-view');
  const projectsView   = document.getElementById('view-projects');
  if (!btnProjects || !btnTasks) return;

  if (tab === 'tasks') {
    btnTasks.classList.remove('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    btnTasks.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnProjects.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnProjects.classList.add('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    tasksControls?.classList.remove('hidden');
    projectsControls?.classList.add('hidden');
    projectsControls?.classList.remove('flex');
    addFolderBtn?.classList.add('hidden');
    addFolderBtn?.classList.remove('flex');
    taskFilter?.classList.remove('hidden');
    taskFilter?.classList.add('flex');
    projectFilter?.classList.add('hidden');
    projectFilter?.classList.remove('flex');
    if (currentTaskView === 'list') {
      listView?.classList.remove('hidden');
      kanbanView?.classList.add('hidden');
    } else {
      listView?.classList.add('hidden');
      kanbanView?.classList.remove('hidden');
    }
    projectsView?.classList.add('hidden');
    filterTasks();
  } else {
    btnProjects.classList.remove('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    btnProjects.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnTasks.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnTasks.classList.add('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    tasksControls?.classList.add('hidden');
    projectsControls?.classList.remove('hidden');
    projectsControls?.classList.add('flex');
    addFolderBtn?.classList.remove('hidden');
    addFolderBtn?.classList.add('flex');
    taskFilter?.classList.add('hidden');
    taskFilter?.classList.remove('flex');
    projectFilter?.classList.remove('hidden');
    projectFilter?.classList.add('flex');
    listView?.classList.add('hidden');
    kanbanView?.classList.add('hidden');
    projectsView?.classList.remove('hidden');
    renderProjects();
  }
}

// ── Project Picker / Tabs ─────────────────────────────────
function addProjectTab(projectId) {
  if (!openTabs.includes(projectId)) openTabs.push(projectId);
  setActiveTab(projectId);
  document.getElementById('project-picker')?.classList.add('hidden');
}

function setActiveTab(tabId) {
  activeTabId = tabId;
  renderTabs();
  filterTasks();
}

function renderTabs() {
  const tabsList = document.getElementById('tabs-list');
  if (!tabsList) return;
  tabsList.innerHTML = openTabs.map(tabId => {
    const project = projects.find(p => p.id === tabId);
    const isActive = tabId === activeTabId;
    return `<button onclick="setActiveTab('${tabId}')"
      class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${isActive ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-white'}">
      ${tabId === 'all' ? 'All Projects' : project?.name || tabId}
    </button>`;
  }).join('');
}

function renderProjectPicker() {
  const container = document.getElementById('project-picker-list');
  if (!container) return;
  container.innerHTML = projects.map(p => `
    <button onclick="addProjectTab('${p.id}')" class="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#21262d] transition-all">
      <span class="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-black">${p.icon || (p.name[0] || '?').toUpperCase()}</span>
      <span class="text-xs font-bold text-white">${p.name}</span>
    </button>
  `).join('');
}
