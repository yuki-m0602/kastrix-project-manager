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

  const setActive = (active, inactive) => {
    [active, inactive].forEach((el) => {
      if (!el) return;
      if (el === active) {
        el.classList.remove('text-[#8b949e]', 'bg-transparent', 'border-transparent');
        el.classList.add('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
      } else {
        el.classList.remove('bg-[#21262d]', 'text-white', 'border-[#484f58]', 'shadow-sm');
        el.classList.add('text-[#8b949e]', 'bg-transparent', 'border-transparent');
      }
    });
  };

  if (tab === 'tasks') {
    setActive(btnTasks, btnProjects);
    tasksControls.style.display = 'flex';
    projectsControls.style.display = 'none';
    addFolderBtn.style.display = 'none';
    taskFilter.style.display = 'flex';
    projectFilter.style.display = 'none';
    listView.style.display = currentTaskView === 'list' ? 'block' : 'none';
    kanbanView.style.display = currentTaskView === 'list' ? 'none' : 'flex';
    projectsView.style.display = 'none';
    filterTasks();
  } else {
    setActive(btnProjects, btnTasks);
    tasksControls.style.display = 'none';
    projectsControls.style.display = 'flex';
    addFolderBtn.style.display = 'flex';
    taskFilter.style.display = 'none';
    projectFilter.style.display = 'flex';
    listView.style.display = 'none';
    kanbanView.style.display = 'none';
    projectsView.style.display = 'block';
    renderProjects();
  }
}

// ── Project Picker / Tabs ─────────────────────────────────
function closeProjectPicker() {
  const p = document.getElementById('project-picker');
  const b = document.getElementById('project-picker-backdrop');
  if (p) {
    p.style.display = 'none';
    p.style.pointerEvents = 'none';
  }
  if (b) {
    b.style.display = 'none';
    b.style.pointerEvents = 'none';
  }
}

function openProjectPicker() {
  initProjectPickerDelegation();
  renderProjectPicker();
  const p = document.getElementById('project-picker');
  const b = document.getElementById('project-picker-backdrop');
  if (b) {
    b.style.display = 'block';
    b.style.pointerEvents = 'auto';
  }
  if (p) {
    p.style.display = 'block';
    p.style.pointerEvents = 'auto';
  }
}

function toggleProjectPicker() {
  const p = document.getElementById('project-picker');
  if (!p) return;
  const open = p.style.display === 'block';
  if (open) {
    if (typeof window.brieflyBlockMainPointerEvents === 'function') {
      window.brieflyBlockMainPointerEvents(300);
    }
    closeProjectPicker();
  } else {
    openProjectPicker();
  }
}

let _projectPickerDelegationWired = false;

function initProjectPickerDelegation() {
  if (_projectPickerDelegationWired) return;
  const panel = document.getElementById('project-picker');
  const backdrop = document.getElementById('project-picker-backdrop');
  if (!panel) return;
  _projectPickerDelegationWired = true;

  backdrop?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.brieflyBlockMainPointerEvents === 'function') {
        window.brieflyBlockMainPointerEvents(300);
      }
      closeProjectPicker();
    },
    true
  );

  panel.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.js-project-picker-close')) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.brieflyBlockMainPointerEvents === 'function') {
          window.brieflyBlockMainPointerEvents(300);
        }
        closeProjectPicker();
        return;
      }
      const item = t.closest('.js-project-picker-item');
      const pid = item?.getAttribute('data-project-id');
      if (item && pid) {
        e.preventDefault();
        e.stopPropagation();
        addProjectTab(pid);
      }
    },
    true
  );

  const addBtn = document.getElementById('add-tab-btn');
  addBtn?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleProjectPicker();
    },
    true
  );
}

function addProjectTab(projectId) {
  if (!openTabs.includes(projectId)) openTabs.push(projectId);
  setActiveTab(projectId);
  closeProjectPicker();
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
    <button type="button" data-project-id="${escapeHtml(p.id)}" class="js-project-picker-item w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#21262d] transition-all text-left">
      <span class="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-black">${escapeHtml(p.icon || (p.name[0] || '?').toUpperCase())}</span>
      <span class="text-xs font-bold text-white">${escapeHtml(p.name)}</span>
    </button>
  `).join('');
}
