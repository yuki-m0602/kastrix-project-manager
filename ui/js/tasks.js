// ── Task View ─────────────────────────────────────────────
function setTaskView(view) {
  currentTaskView = view;
  const listView  = document.getElementById('list-view');
  const kanbanView = document.getElementById('kanban-view');
  const btnList   = document.getElementById('btn-task-list');
  const btnKanban = document.getElementById('btn-task-kanban');
  if (view === 'list') {
    listView.style.display = 'block';
    kanbanView.style.display = 'none';
    btnList?.classList.add('bg-[#30363d]', 'text-white');
    btnList?.classList.remove('text-[#8b949e]');
    btnKanban?.classList.remove('bg-[#30363d]', 'text-white');
    btnKanban?.classList.add('text-[#8b949e]');
  } else {
    listView.style.display = 'none';
    kanbanView.style.display = 'flex';
    btnKanban?.classList.add('bg-[#30363d]', 'text-white');
    btnKanban?.classList.remove('text-[#8b949e]');
    btnList?.classList.remove('bg-[#30363d]', 'text-white');
    btnList?.classList.add('text-[#8b949e]');
  }
  filterTasks();
}

function filterTasks() {
  const statusFilter = document.getElementById('task-status-filter')?.value || 'all';
  const sortBy       = document.getElementById('task-sort')?.value || 'date';
  let filtered = statusFilter === 'all' ? [...tasks] : tasks.filter(t => t.status === statusFilter);
  if (activeTabId && activeTabId !== 'all') {
    filtered = filtered.filter(t => String(t.projectId) === String(activeTabId));
  }
  if (sortBy === 'priority') {
    const order = { high: 0, medium: 1, low: 2 };
    filtered.sort((a, b) => order[a.priority] - order[b.priority]);
  } else if (sortBy === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered.sort((a, b) => {
      const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return tb - ta;
    });
  }
  renderTaskList(filtered);
  renderKanban(filtered);
}

function filterTasksByStatus(v) { filterTasks(); }
function sortTasks(v)           { filterTasks(); }

function renderTaskList(filteredTasks) {
  const tbody = document.getElementById('list-view-body');
  if (!tbody) return;
  const emptyRow = '<tr><td colspan="3" class="px-4 py-12 text-center text-[#8b949e] text-sm">No tasks yet. Click "+ New Task" to create one.</td></tr>';
  const statusMap = {
    'todo':        { border: 'border-slate-400/20', color: 'text-slate-400'   },
    'in-progress': { border: 'border-blue-400/20',  color: 'text-blue-400'    },
    'done':        { border: 'border-emerald-400/20',color: 'text-emerald-400' }
  };
  tbody.innerHTML = filteredTasks.length === 0 ? emptyRow : filteredTasks.map(t => `
    <tr onclick="openTaskModal('${escapeHtml(t.id)}')" class="hover:bg-[#161b22] group cursor-pointer transition-all">
      <td class="p-2 sm:p-4 font-bold text-[#f0f6fc] border-b border-[#30363d]">${escapeHtml(t.title)}</td>
      <td class="p-2 sm:p-4 text-[#8b949e] hidden sm:table-cell border-b border-[#30363d]">${escapeHtml(t.assignee || '')}</td>
      <td class="p-2 sm:p-4 border-b border-[#30363d]">
        <span class="px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${statusMap[t.status].border} ${statusMap[t.status].color}">${t.status.toUpperCase()}</span>
      </td>
    </tr>
  `).join('');
}

function renderKanban(filteredTasks) {
  const priorityColors = {
    high:   'bg-red-500/10 text-red-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    low:    'bg-green-500/10 text-green-500'
  };
  ['todo', 'in-progress', 'done'].forEach(status => {
    const key       = status === 'in-progress' ? 'inprogress' : status;
    const container = document.getElementById('kanban-' + key);
    if (!container) return;
    const statusTasks = filteredTasks.filter(t => t.status === status);
    const countEl = document.getElementById('count-' + key);
    if (countEl) countEl.textContent = statusTasks.length;
    const borderColor = status === 'todo' ? 'slate' : status === 'in-progress' ? 'blue' : 'emerald';

    // Set drop zone attributes
    container.dataset.status = status;
    container.ondragover = _kanbanDragOver;
    container.ondragleave = _kanbanDragLeave;
    container.ondrop = _kanbanDrop;

    container.innerHTML = statusTasks.map(t => `
      <div draggable="true" ondragstart="_kanbanDragStart(event, '${escapeHtml(t.id)}')" onclick="openTaskModal('${escapeHtml(t.id)}')" class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 hover:border-${borderColor}-400/30 transition-all cursor-pointer ${status === 'done' ? 'opacity-60' : ''}">
        <p class="text-white font-bold text-sm leading-tight mb-3 ${status === 'done' ? 'line-through' : ''}">${escapeHtml(t.title)}</p>
        <div class="flex items-center justify-between">
          <div class="w-5 h-5 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-black">${t.assignee ? escapeHtml(t.assignee[0]) : '?'}</div>
          <span class="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${priorityColors[t.priority]}">${t.priority.toUpperCase()}</span>
        </div>
      </div>
    `).join('');
  });
}

// ── Kanban Drag & Drop ───────────────────────────────────
function _kanbanDragStart(e, taskId) {
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.4';
  setTimeout(() => { e.currentTarget.style.opacity = ''; }, 0);
}

function _kanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('bg-[#21262d]', 'rounded-xl');
}

function _kanbanDragLeave(e) {
  e.currentTarget.classList.remove('bg-[#21262d]', 'rounded-xl');
}

async function _kanbanDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('bg-[#21262d]', 'rounded-xl');
  const taskId = e.dataTransfer.getData('text/plain');
  const newStatus = e.currentTarget.dataset.status;
  if (!taskId || !newStatus) return;
  const task = tasks.find(t => String(t.id) === taskId);
  if (!task || task.status === newStatus) return;
  await apiUpdateTaskStatus(taskId, newStatus);
  if (_isTauri) await reloadTasks();
  filterTasks();
}

// Task filter setters
function setTaskStatus(value, label) {
  document.getElementById('label-status').textContent = label;
  document.getElementById('dd-status')?.classList.add('hidden');
  const sel = document.getElementById('task-status-filter');
  if (sel) sel.value = value;
  filterTasks();
}

function setTaskSort(value, label) {
  document.getElementById('label-sort').textContent = label;
  document.getElementById('dd-sort')?.classList.add('hidden');
  const sel = document.getElementById('task-sort');
  if (sel) sel.value = value;
  filterTasks();
}

async function openTaskModal(taskId) {
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  document.getElementById('modal-task-title').textContent    = task.title;
  document.getElementById('modal-task-status').textContent   = task.status.toUpperCase();
  document.getElementById('modal-task-priority').textContent = task.priority.toUpperCase();
  const visEl = document.getElementById('modal-task-visibility');
  if (visEl) visEl.classList.toggle('hidden', task.isPublic !== false);
  document.getElementById('modal-assignee').textContent      = task.assignee || '-';
  document.getElementById('modal-date').textContent          = task.dueDate || '-';
  document.getElementById('modal-task-desc').textContent     = task.description || '-';
  const proj = projects.find(p => String(p.id) === String(task.projectId));
  const projName = proj ? proj.name : (localProjects.find(p => String(p.id) === String(task.projectId))?.name || '-');
  document.getElementById('modal-project-name').textContent  = projName;
  const iconEl = document.getElementById('modal-project-icon');
  if (iconEl) iconEl.textContent = projName !== '-' ? projName[0].toUpperCase() : '?';
  _currentTaskId = task.id;
  const delBtn = document.getElementById('btn-delete-task');
  if (delBtn) {
    if (_isTauri && typeof apiTaskCanDelete === 'function') {
      try {
        delBtn.style.display = (await apiTaskCanDelete(task.id)) ? '' : 'none';
      } catch {
        delBtn.style.display = '';
      }
    } else {
      delBtn.style.display = '';
    }
  }
  const modal   = document.getElementById('task-modal');
  const content = document.getElementById('task-modal-content');
  modal.style.display = '';
  content.classList.remove('translate-x-full');
  _pushModalHistory('task');
}

function closeTaskModal() {
  const modal = document.getElementById('task-modal');
  const content = document.getElementById('task-modal-content');
  modal.style.display = 'none';
  content.classList.add('translate-x-full');
  if (_modalHistory === 'task') {
    _modalHistory = null;
    history.back();
  }
}

// ── Task CRUD ────────────────────────────────────────────────
async function openCreateTaskModal() {
  document.getElementById('task-edit-id').value = '';
  document.getElementById('task-edit-title').value = '';
  document.getElementById('task-edit-project').value = '';
  document.getElementById('task-edit-priority').value = 'medium';
  document.getElementById('task-edit-due').value = '';
  const assigneeEl = document.getElementById('task-edit-assignee');
  const displayName = typeof apiTeamGetMyDisplayName === 'function' ? await apiTeamGetMyDisplayName() : null;
  assigneeEl.value = displayName || '';
  document.getElementById('task-edit-desc').value = '';
  document.getElementById('task-edit-public').checked = true;
  document.getElementById('task-edit-modal-title').textContent = 'New Task';
  _populateProjectDropdown();
  const modal = document.getElementById('task-edit-modal');
  const content = document.getElementById('task-edit-modal-content');
  modal.style.display = '';
  content.classList.remove('translate-x-full');
  _pushModalHistory('task-edit');
}

function openEditTaskModal(taskId) {
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  document.getElementById('task-edit-id').value = task.id;
  document.getElementById('task-edit-title').value = task.title;
  document.getElementById('task-edit-priority').value = task.priority;
  document.getElementById('task-edit-due').value = task.dueDate ? task.dueDate.split(' ')[0] : '';
  document.getElementById('task-edit-assignee').value = task.assignee || '';
  document.getElementById('task-edit-desc').value = task.description || '';
  document.getElementById('task-edit-public').checked = task.isPublic !== false;
  document.getElementById('task-edit-modal-title').textContent = 'Edit Task';
  _populateProjectDropdown();
  document.getElementById('task-edit-project').value = task.projectId || '';
  const modal = document.getElementById('task-edit-modal');
  const content = document.getElementById('task-edit-modal-content');
  modal.style.display = '';
  content.classList.remove('translate-x-full');
  _pushModalHistory('task-edit');
}

function _populateProjectDropdown() {
  const sel = document.getElementById('task-edit-project');
  sel.innerHTML = '<option value="">None</option>';
  projects.forEach(p => {
    sel.innerHTML += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`;
  });
}

function closeTaskEditModal() {
  const modal = document.getElementById('task-edit-modal');
  const content = document.getElementById('task-edit-modal-content');
  if (content) {
    modal.style.display = 'none';
    content.classList.add('translate-x-full');
  }
  if (_modalHistory === 'task-edit') {
    _modalHistory = null;
    history.back();
  }
}

async function submitTaskForm() {
  const id = document.getElementById('task-edit-id').value;
  const input = {
    title: document.getElementById('task-edit-title').value.trim(),
    projectId: document.getElementById('task-edit-project').value || null,
    priority: document.getElementById('task-edit-priority').value,
    dueDate: document.getElementById('task-edit-due').value || null,
    assignee: document.getElementById('task-edit-assignee').value.trim() || null,
    description: document.getElementById('task-edit-desc').value.trim() || null,
    isPublic: document.getElementById('task-edit-public').checked,
  };
  if (!input.title) return;
  try {
    let savedTask;
    if (id) {
      savedTask = await apiUpdateTask(id, input);
    } else {
      savedTask = await apiCreateTask(input);
    }
    if (_isTauri) {
      try {
        await reloadTasks();
      } catch (e) {
        console.error('reloadTasks failed:', e);
        if (savedTask) {
          const idx = tasks.findIndex(t => String(t.id) === String(savedTask.id));
          if (idx >= 0) tasks[idx] = savedTask; else tasks.unshift(savedTask);
        }
      }
    } else if (savedTask) {
      const idx = tasks.findIndex(t => String(t.id) === String(savedTask.id));
      if (idx >= 0) tasks[idx] = savedTask; else tasks.unshift(savedTask);
    }
    if (typeof switchMainTab === 'function') switchMainTab('tasks');
    closeTaskEditModal();
    filterTasks();
  } catch (e) {
    console.error('Failed to save task:', e);
    showAlert('タスクの保存に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function deleteCurrentTask() {
  if (!_currentTaskId) return;
  if (!confirm('このタスクを削除しますか？')) return;
  try {
    await apiDeleteTask(_currentTaskId);
    if (_isTauri) await reloadTasks();
    _currentTaskId = null;
    closeTaskModal();
    filterTasks();
  } catch (e) {
    console.error('Failed to delete task:', e);
    if (typeof showAlert === 'function') {
      showAlert('削除に失敗しました: ' + (e?.message || e), 'error');
    }
  }
}
