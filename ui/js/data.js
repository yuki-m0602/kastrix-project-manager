// ── UI: Data Module ────────────────────────────────────────
// アプリのデータ取得・再読込・チームUI整合（ロジックの単一入口）

/**
 * タスクのみ再読み込み（競合解決後など）
 */
async function reloadTasks() {
  const tasksData = await apiGetTasks();
  const safe = Array.isArray(tasksData) ? tasksData : [];
  tasks.length = 0;
  tasks.push(...safe);
  if (typeof filterTasks === 'function') filterTasks();
}

/**
 * プロジェクト＋タスクを DB から再取得（ディレクトリスキャンなし）
 * チーム同期の task_update 後に使用。loadData 先頭の scan が失敗・遅延すると一覧が更新されないのを避ける。
 */
async function reloadTasksAndProjects() {
  try {
    const [projectsData, tasksData] = await Promise.all([
      apiGetProjects(),
      apiGetTasks()
    ]);
    const safeProjects = Array.isArray(projectsData) ? projectsData : [];
    const safeTasks = Array.isArray(tasksData) ? tasksData : [];
    localProjects.length = 0;
    localProjects.push(...safeProjects);
    tasks.length = 0;
    tasks.push(...safeTasks);
    projects.length = 0;
    localProjects.forEach(p => {
      projects.push({ id: p.id, name: p.name, color: 'indigo', icon: (p.name[0] || '?').toUpperCase() });
    });
    if (typeof renderProjectPicker === 'function') renderProjectPicker();
    if (typeof filterTasks === 'function') filterTasks();
    if (typeof renderProjects === 'function') renderProjects();
  } catch (e) {
    console.error('reloadTasksAndProjects failed:', e);
  }
}

/**
 * プロジェクト・タスクを読み込み、タブ用 projects を再構築
 */
async function loadData() {
  try {
    if (_isTauri) await apiScanAllWatchedDirs();
    const [projectsData, tasksData] = await Promise.all([
      apiGetProjects(),
      apiGetTasks()
    ]);
    const safeProjects = Array.isArray(projectsData) ? projectsData : [];
    const safeTasks = Array.isArray(tasksData) ? tasksData : [];
    localProjects.length = 0;
    localProjects.push(...safeProjects);
    tasks.length = 0;
    tasks.push(...safeTasks);
    projects.length = 0;
    localProjects.forEach(p => {
      projects.push({ id: p.id, name: p.name, color: 'indigo', icon: (p.name[0] || '?').toUpperCase() });
    });
    openTabs = ['all'];
    activeTabId = 'all';
    if (typeof renderProjectPicker === 'function') renderProjectPicker();
    if (typeof filterTasks === 'function') filterTasks();
    if (typeof renderProjects === 'function') renderProjects();
  } catch (e) {
    console.error('Failed to load data:', e);
  }
}

/**
 * チーム関連イベント後に Team 画面・メンバー一覧・サイドバー・Inbox を整合
 */
let _refreshTeamUiBusy = false;
async function refreshTeamUiFromBackend() {
  if (_refreshTeamUiBusy) return;          // 排他: 並行実行を防ぐ
  _refreshTeamUiBusy = true;
  try {
    if (typeof window.renderTeamView === 'function') {
      try {
        await window.renderTeamView();
      } catch (e) {
        console.error('renderTeamView failed:', e);
      }
    }
    if (typeof renderTeamMembers === 'function') await renderTeamMembers();
    if (typeof renderTeamPendingJoins === 'function') await renderTeamPendingJoins();
    if (typeof renderTeamPendingStatus === 'function') await renderTeamPendingStatus();
    if (typeof renderTeamBlocked === 'function') await renderTeamBlocked();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
    if (typeof renderInbox === 'function') await renderInbox();
  } finally {
    _refreshTeamUiBusy = false;
  }
}

window.reloadTasks = reloadTasks;
window.reloadTasksAndProjects = reloadTasksAndProjects;
window.loadData = loadData;
window.refreshTeamUiFromBackend = refreshTeamUiFromBackend;
