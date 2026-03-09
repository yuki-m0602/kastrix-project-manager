// Task functions
export function renderTaskList(filteredTasks) {
  const tbody = document.getElementById('list-view-body');
  if (!tbody) return;
  
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
        <span class="px-2 py-0.5 rounded-md text-[9px] font-black border whitespace-nowrap ${statusMap[t.status].border} ${statusMap[t.status].color}">
          ${t.status.toUpperCase()}
        </span>
      </td>
    </tr>
  `).join('');
}

export function renderKanban(filteredTasks) {
  const priorityColors = {
    'high': 'bg-red-500/10 text-red-500',
    'medium': 'bg-yellow-500/10 text-yellow-500',
    'low': 'bg-green-500/10 text-green-500'
  };
  
  ['todo', 'in-progress', 'done'].forEach(status => {
    const container = document.getElementById(`kanban-${status === 'in-progress' ? 'inprogress' : status}`);
    const statusTasks = filteredTasks.filter(t => t.status === status);
    const countEl = document.getElementById(`count-${status === 'in-progress' ? 'inprogress' : status}`);
    if (countEl) countEl.textContent = statusTasks.length;
    
    if (container) {
      container.innerHTML = statusTasks.map(t => `
        <div onclick="openTaskModal('${t.id}')" class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 hover:border-${status === 'todo' ? 'slate' : status === 'in-progress' ? 'blue' : 'emerald'}-400/30 transition-all cursor-pointer ${status === 'done' ? 'opacity-60' : ''}">
          <p class="text-white font-bold text-sm leading-tight mb-3 ${status === 'done' ? 'line-through' : ''}">${t.title}</p>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-5 h-5 rounded bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[9px] font-black">${t.assignee[0]}</div>
            </div>
            <span class="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter ${priorityColors[t.priority]}">
              ${t.priority.toUpperCase()}
            </span>
          </div>
        </div>
      `).join('');
    }
  });
}

export function openTaskModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  
  document.getElementById('modal-task-title').textContent = task.title;
  document.getElementById('modal-task-status').textContent = task.status.toUpperCase();
  document.getElementById('modal-task-priority').textContent = task.priority.toUpperCase();
  document.getElementById('modal-assignee').textContent = task.assignee;
  document.getElementById('modal-date').textContent = task.date;
  
  const modal = document.getElementById('task-modal');
  const content = document.getElementById('task-modal-content');
  modal.classList.remove('hidden');
  setTimeout(() => {
    content.classList.remove('translate-x-full');
  }, 10);
}

export function closeTaskModal() {
  const content = document.getElementById('task-modal-content');
  content.classList.add('translate-x-full');
  setTimeout(() => {
    document.getElementById('task-modal').classList.add('hidden');
  }, 300);
}

export function createTask(taskData) {
  const newTask = {
    id: Date.now().toString(),
    ...taskData,
    action: 'created'
  };
  state.tasks.push(newTask);
  filterTasks();
  return newTask;
}

export function updateTask(taskId, updates) {
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    Object.assign(task, updates);
    filterTasks();
    return task;
  }
  return null;
}

export function deleteTask(taskId) {
  const index = state.tasks.findIndex(t => t.id === taskId);
  if (index > -1) {
    state.tasks.splice(index, 1);
    filterTasks();
    return true;
  }
  return false;
}