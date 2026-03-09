// View management
export function setTaskView(view) {
  state.currentTaskView = view;
  const listView = document.getElementById('list-view');
  const kanbanView = document.getElementById('kanban-view');
  const btnList = document.getElementById('btn-task-list');
  const btnKanban = document.getElementById('btn-task-kanban');
  
  if (view === 'list') {
    if (listView) listView.classList.remove('hidden');
    if (kanbanView) kanbanView.classList.add('hidden');
    if (btnList) btnList.classList.add('bg-[#30363d]', 'text-white');
    if (btnList) btnList.classList.remove('text-[#8b949e]');
    if (btnKanban) btnKanban.classList.remove('bg-[#30363d]', 'text-white');
    if (btnKanban) btnKanban.classList.add('text-[#8b949e]');
  } else {
    if (listView) listView.classList.add('hidden');
    if (kanbanView) kanbanView.classList.remove('hidden');
    if (btnKanban) btnKanban.classList.add('bg-[#30363d]', 'text-white');
    if (btnKanban) btnKanban.classList.remove('text-[#8b949e]');
    if (btnList) btnList.classList.remove('bg-[#30363d]', 'text-white');
    if (btnList) btnList.classList.add('text-[#8b949e]');
  }
  
  filterTasks();
}

export function setProjectViewMode(mode) {
  state.currentProjectViewMode = mode;
  const gridView = document.getElementById('projects-grid-view');
  const listView = document.getElementById('projects-list-view');
  const btnGrid = document.getElementById('btn-project-grid');
  const btnList = document.getElementById('btn-project-list');
  
  if (mode === 'grid') {
    if (gridView) gridView.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
    if (btnGrid) btnGrid.classList.add('bg-[#30363d]', 'text-white');
    if (btnGrid) btnGrid.classList.remove('text-[#8b949e]');
    if (btnList) btnList.classList.remove('bg-[#30363d]', 'text-white');
    if (btnList) btnList.classList.add('text-[#8b949e]');
  } else {
    if (gridView) gridView.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
    if (btnList) btnList.classList.add('bg-[#30363d]', 'text-white');
    if (btnList) btnList.classList.remove('text-[#8b949e]');
    if (btnGrid) btnGrid.classList.remove('bg-[#30363d]', 'text-white');
    if (btnGrid) btnGrid.classList.add('text-[#8b949e]');
  }
}

export function filterTasks() {
  const statusFilter = document.getElementById('task-status-filter')?.value || 'all';
  const filtered = statusFilter === 'all' ? state.tasks : state.tasks.filter(t => t.status === statusFilter);
  
  renderTaskList(filtered);
  renderKanban(filtered);
}

export function sortTasks(sortBy) {
  // Implement sorting logic here
  filterTasks();
}

export function filterProjectsByLang(lang) {
  // Implement filtering logic here
  renderProjects();
}

export function sortProjects(sortBy) {
  // Implement sorting logic here
  renderProjects();
}

// Dropdown toggle
export function toggleDropdown(id) {
  const dd = document.getElementById(id);
  const isHidden = dd.classList.contains('hidden');
  // Close all dropdowns
  document.querySelectorAll('[id^="dd-"]').forEach(el => el.classList.add('hidden'));
  if (isHidden) dd.classList.remove('hidden');
}

// Task status filter
export function setTaskStatus(value, label) {
  document.getElementById('label-status').textContent = label;
  document.getElementById('dd-status').classList.add('hidden');
  const sel = document.getElementById('task-status-filter');
  if (sel) sel.value = value;
  filterTasks();
}

// Task sort
export function setTaskSort(value, label) {
  document.getElementById('label-sort').textContent = label;
  document.getElementById('dd-sort').classList.add('hidden');
  const sel = document.getElementById('task-sort');
  if (sel) sel.value = value;
  filterTasks();
}

// Project language filter
export function setProjLang(value, label) {
  document.getElementById('label-lang').textContent = label;
  document.getElementById('dd-lang').classList.add('hidden');
  const sel = document.getElementById('project-lang-filter');
  if (sel) sel.value = value;
  renderProjects();
}

// Project sort
export function setProjSort(value, label) {
  document.getElementById('label-proj-sort').textContent = label;
  document.getElementById('dd-proj-sort').classList.add('hidden');
  const sel = document.getElementById('project-sort');
  if (sel) sel.value = value;
  renderProjects();
}