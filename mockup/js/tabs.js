// Tab management
export function setActiveTab(tabId) {
  state.activeTabId = tabId;
  renderTabs();
  updateContent();
}

export function renderTabs() {
  const tabsList = document.getElementById('tabs-list');
  if (!tabsList) return;
  
  tabsList.innerHTML = state.openTabs.map(tabId => {
    const project = state.projects.find(p => p.id === tabId);
    const isActive = tabId === state.activeTabId;
    return `
      <button onclick="setActiveTab('${tabId}')" 
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${isActive ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-white'}">
        ${tabId === 'all' ? 'All Projects' : project?.name || tabId}
      </button>
    `;
  }).join('');
}

export function updateContent() {
  const activeProject = document.getElementById('active-project');
  if (state.activeTabId === 'all') {
    activeProject.textContent = 'All Projects';
  } else {
    const project = state.projects.find(p => p.id === state.activeTabId);
    activeProject.textContent = project?.name || state.activeTabId;
  }
  filterTasks();
}

export function addProjectTab(projectId) {
  if (!state.openTabs.includes(projectId)) {
    state.openTabs.push(projectId);
    setActiveTab(projectId);
  }
}

export function removeProjectTab(projectId) {
  if (state.openTabs.length > 1) {
    const index = state.openTabs.indexOf(projectId);
    if (index > -1) {
      state.openTabs.splice(index, 1);
      setActiveTab(state.openTabs[state.openTabs.length - 1] || 'all');
    }
  }
}

export function switchMainTab(tab) {
  const btnProjects = document.querySelector('[data-tab="projects"]');
  const btnTasks = document.querySelector('[data-tab="tasks"]');
  const tasksControls = document.getElementById('tasks-view-controls');
  const projectsControls = document.getElementById('projects-view-controls');
  const taskFilter = document.getElementById('task-filter');
  const projectFilter = document.getElementById('project-filter');
  const listView = document.getElementById('list-view');
  const kanbanView = document.getElementById('kanban-view');
  const projectsView = document.getElementById('view-projects');
  
  if (!btnProjects || !btnTasks) return;
  
  if (tab === 'tasks') {
    btnTasks.classList.remove('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    btnTasks.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnProjects.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnProjects.classList.add('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    
    if (tasksControls) tasksControls.classList.remove('hidden');
    if (projectsControls) projectsControls.classList.add('hidden');
    
    if (taskFilter) {
      taskFilter.classList.remove('hidden');
      taskFilter.classList.add('flex');
    }
    if (projectFilter) {
      projectFilter.classList.add('hidden');
      projectFilter.classList.remove('flex');
    }
    
    if (state.currentTaskView === 'list') {
      if (listView) listView.classList.remove('hidden');
      if (kanbanView) kanbanView.classList.add('hidden');
    } else {
      if (listView) listView.classList.add('hidden');
      if (kanbanView) kanbanView.classList.remove('hidden');
    }
    
    if (projectsView) projectsView.classList.add('hidden');
    
    filterTasks();
  } else {
    btnProjects.classList.remove('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    btnProjects.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnTasks.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
    btnTasks.classList.add('text-[#8b949e]', 'bg-transparent', 'border-transparent');
    
    if (tasksControls) tasksControls.classList.add('hidden');
    if (projectsControls) projectsControls.classList.remove('hidden');
    
    if (taskFilter) {
      taskFilter.classList.add('hidden');
      taskFilter.classList.remove('flex');
    }
    if (projectFilter) {
      projectFilter.classList.remove('hidden');
      projectFilter.classList.add('flex');
    }
    
    if (listView) listView.classList.add('hidden');
    if (kanbanView) kanbanView.classList.add('hidden');
    
    if (projectsView) projectsView.classList.remove('hidden');
    
    renderProjects();
  }
}