// ── Inbox View ────────────────────────────────────────────

async function renderInbox() {
  const container = document.getElementById('inbox-content');
  if (!container) return;

  const [tasks, logs, pendingJoins, myRole] = await Promise.all([
    apiGetTasks(),
    apiGetActivityLogs(),
    _isTauri && typeof apiTeamListPendingJoins === 'function' ? apiTeamListPendingJoins().catch(() => []) : Promise.resolve([]),
    _isTauri && typeof apiTeamGetMyRole === 'function' ? apiTeamGetMyRole().catch(() => 'member') : Promise.resolve('member'),
  ]);

  const canApprove = myRole === 'host' || myRole === 'co_host';
  const pending = Array.isArray(pendingJoins) ? pendingJoins : [];
  const notifications = [];

  // Overdue tasks
  const now = new Date();
  tasks.forEach(t => {
    const dueStr = t.dueDate || t.due_date;
    if (dueStr && t.status !== 'done') {
      const due = new Date(dueStr);
      if (due < now) {
        notifications.push({
          type: 'overdue',
          taskId: t.id,
          icon: 'alert-circle',
          color: 'red',
          title: 'Overdue Task',
          message: `"${t.title}" was due ${_relativeTime(due)}`,
          time: due,
        });
      } else {
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        if (diffDays <= 3) {
          notifications.push({
            type: 'upcoming',
            taskId: t.id,
            icon: 'clock',
            color: 'amber',
            title: 'Due Soon',
            message: `"${t.title}" is due in ${diffDays} day${diffDays > 1 ? 's' : ''}`,
            time: due,
          });
        }
      }
    }
  });

  // Recent activity (last 24h)
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  logs.forEach(l => {
    const ts = new Date(l.timestamp);
    if (ts.getTime() > dayAgo) {
      const msg = [l.taskTitle, l.projectName].filter(Boolean).join(' in ');
      notifications.push({
        type: 'activity',
        icon: 'info',
        color: 'blue',
        title: l.action,
        message: msg || 'Activity',
        time: ts,
      });
    }
  });

  // Sort newest first
  notifications.sort((a, b) => b.time - a.time);

  const joinSection = canApprove && pending.length > 0
    ? `
      <div class="mb-4">
        <h3 class="text-[10px] font-bold text-[#8b949e] uppercase mb-2 flex items-center gap-2">
          <i data-lucide="user-plus" size="12"></i>
          参加申請 <span class="text-indigo-400">[${pending.length}件]</span>
        </h3>
        <div class="space-y-2">
          ${pending.map((p) => `
            <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl gap-3">
              <div class="min-w-0">
                <span class="text-xs font-bold text-white font-mono truncate block">${escapeHtml(p.endpoint_id.slice(0, 16))}...</span>
                <span class="text-[9px] text-[#484f58]">申請日時: ${escapeHtml(p.requested_at)}</span>
              </div>
              <div class="flex gap-1 shrink-0">
                <button onclick="inboxApproveJoin('${escapeHtml(p.endpoint_id)}','${escapeHtml(p.topic_id)}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[9px] font-bold text-white">承認</button>
                <button onclick="inboxRejectJoin('${escapeHtml(p.endpoint_id)}','${escapeHtml(p.topic_id)}')" class="px-3 py-1.5 bg-[#30363d] hover:bg-[#484f58] rounded-lg text-[9px] font-bold text-white">拒否</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  const hasAny = joinSection || notifications.length > 0;
  container.innerHTML = !hasAny
    ? '<div class="flex flex-col items-center gap-3 pt-8 text-center"><i data-lucide="inbox" size="40" class="text-[#30363d]"></i><p class="text-xs text-[#484f58]">No notifications</p></div>'
    : joinSection + (notifications.length > 0 ? `<h3 class="text-[10px] font-bold text-[#8b949e] uppercase mb-2 mt-4">通知</h3>` + notifications.map(n => {
      const clickable = n.taskId && typeof openTaskModal === 'function';
      return `
      <div class="flex items-start gap-3 p-3 bg-[#161b22] border border-[#30363d] rounded-xl ${clickable ? 'cursor-pointer hover:border-[#484f58] transition-all' : ''}" ${clickable ? `onclick="openTaskModal('${n.taskId}')"` : ''}>
        <div class="w-8 h-8 rounded-lg bg-${n.color}-500/10 flex items-center justify-center shrink-0">
          <i data-lucide="${n.icon}" size="14" class="text-${n.color}-400"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <span class="text-xs font-bold text-white">${n.title}</span>
            <span class="text-[9px] text-[#484f58]">${_relativeTime(n.time)}</span>
          </div>
          <p class="text-[11px] text-[#8b949e] truncate">${n.message}</p>
        </div>
      </div>
    `;
    }).join('') : '');

  lucide.createIcons();
}

async function inboxApproveJoin(endpointId, topicId) {
  if (!_isTauri || !endpointId || !topicId) return;
  try {
    await apiTeamApproveJoin(endpointId, topicId);
    if (typeof renderInbox === 'function') await renderInbox();
  } catch (e) {
    alert('承認に失敗しました: ' + (e?.message || e));
  }
}

async function inboxRejectJoin(endpointId, topicId) {
  if (!_isTauri || !endpointId || !topicId) return;
  try {
    await apiTeamRejectJoin(endpointId, topicId);
    if (typeof renderInbox === 'function') await renderInbox();
  } catch (e) {
    alert('拒否に失敗しました: ' + (e?.message || e));
  }
}

function _relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
