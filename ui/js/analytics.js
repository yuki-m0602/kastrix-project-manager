// ── Analytics View ────────────────────────────────────────

async function renderAnalytics() {
  const container = document.getElementById('analytics-content');
  if (!container) return;

  const [tasks, projects, logs] = await Promise.all([
    apiGetTasks(),
    apiGetProjects(),
    apiGetActivityLogs(),
  ]);

  // Task stats
  const todo = tasks.filter(t => t.status === 'todo').length;
  const inProgress = tasks.filter(t => t.status === 'in-progress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length || 1;

  // Priority breakdown
  const high = tasks.filter(t => t.priority === 'high').length;
  const medium = tasks.filter(t => t.priority === 'medium').length;
  const low = tasks.filter(t => t.priority === 'low').length;

  // Language stats from projects
  const langMap = {};
  projects.forEach(p => {
    const lang = p.language || 'unknown';
    langMap[lang] = (langMap[lang] || 0) + 1;
  });
  const langEntries = Object.entries(langMap).sort((a, b) => b[1] - a[1]);
  const maxLang = langEntries.length > 0 ? langEntries[0][1] : 1;

  // Recent activity (last 7 days)
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentLogs = logs.filter(l => new Date(l.timestamp).getTime() > weekAgo);

  container.innerHTML = `
    <!-- Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      ${_statCard('Total Projects', projects.length, 'folder', 'indigo')}
      ${_statCard('Total Tasks', tasks.length, 'list-checks', 'cyan')}
      ${_statCard('Completed', done, 'check-circle', 'emerald')}
      ${_statCard('Activity (7d)', recentLogs.length, 'activity', 'amber')}
    </div>

    <!-- Task Status -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-4">Task Status</h2>
      <div class="space-y-3">
        ${_barRow('Todo', todo, total, 'bg-[#484f58]')}
        ${_barRow('In Progress', inProgress, total, 'bg-amber-500')}
        ${_barRow('Done', done, total, 'bg-emerald-500')}
      </div>
    </section>

    <!-- Priority Breakdown -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-4">Priority Breakdown</h2>
      <div class="space-y-3">
        ${_barRow('High', high, total, 'bg-red-500')}
        ${_barRow('Medium', medium, total, 'bg-amber-500')}
        ${_barRow('Low', low, total, 'bg-blue-500')}
      </div>
    </section>

    <!-- Language Distribution -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-4">Language Distribution</h2>
      ${langEntries.length === 0
        ? '<p class="text-xs text-[#484f58]">No projects found.</p>'
        : `<div class="space-y-3">${langEntries.map(([lang, cnt]) =>
            _barRow(lang, cnt, maxLang, 'bg-indigo-500')
          ).join('')}</div>`}
    </section>
  `;

  lucide.createIcons();
}

function _statCard(label, value, icon, color) {
  return `
    <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 flex flex-col gap-1">
      <div class="flex items-center gap-2">
        <i data-lucide="${icon}" size="14" class="text-${color}-400"></i>
        <span class="text-[10px] text-[#484f58] font-bold uppercase tracking-wider">${label}</span>
      </div>
      <span class="text-2xl font-black text-white">${value}</span>
    </div>`;
}

function _barRow(label, value, max, colorClass) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-[#c9d1d9]">${label}</span>
        <span class="text-[#484f58]">${value}</span>
      </div>
      <div class="w-full h-2 bg-[#0d1117] rounded-full overflow-hidden">
        <div class="${colorClass} h-full rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>`;
}
