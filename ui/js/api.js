// ── Tauri API Wrapper ────────────────────────────────────
// Tauri 環境ではバックエンドの invoke() を使用、
// ブラウザ開発時はダミーデータにフォールバック
const _isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

async function _invoke(cmd, args) {
  if (!_isTauri) return null;
  return await window.__TAURI__.core.invoke(cmd, args || {});
}

// ── Dialog ───────────────────────────────────────────────
async function confirmAsync(message) {
  if (_isTauri && window.__TAURI__.dialog) {
    return await window.__TAURI__.dialog.confirm(message, { title: 'Kastrix' });
  }
  return confirm(message);
}

async function apiDialogOpen(options) {
  if (_isTauri && window.__TAURI__.dialog) {
    return await window.__TAURI__.dialog.open(options);
  }
  return null;
}

// ── Projects ─────────────────────────────────────────────
async function apiGetProjects() {
  const result = await _invoke('get_projects');
  return result || [...localProjects];
}

async function apiScanDirectory(path) {
  return await _invoke('scan_directory', { path });
}

async function apiScanAllWatchedDirs() {
  return await _invoke('scan_all_watched_dirs') || [];
}

async function apiRemoveProject(id) {
  return await _invoke('remove_project', { id });
}

async function apiGetReadme(path) {
  const result = await _invoke('get_readme', { path });
  return result || 'No README available';
}

async function apiOpenInIde(ide, path) {
  if (_isTauri) {
    await _invoke('open_in_ide', { ide, path });
  } else {
    alert('Open in ' + ide + ': ' + path + '\n(Tauri環境で動作)');
  }
}

// ── Tasks ────────────────────────────────────────────────
async function apiGetTasks(projectId) {
  const result = await _invoke('get_tasks', projectId ? { projectId } : {});
  return result || [...tasks];
}

async function apiCreateTask(input) {
  if (!_isTauri) {
    const newTask = {
      id: String(Date.now()),
      projectId: input.projectId || null,
      title: input.title,
      status: 'todo',
      priority: input.priority || 'medium',
      dueDate: input.dueDate || null,
      assignee: input.assignee || null,
      description: input.description || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    return newTask;
  }
  return await _invoke('create_task', { input });
}

async function apiUpdateTask(id, input) {
  if (!_isTauri) {
    const task = tasks.find(t => t.id === id);
    if (task) Object.assign(task, input, { updatedAt: new Date().toISOString() });
    return task;
  }
  return await _invoke('update_task', { id, input });
}

async function apiDeleteTask(id) {
  if (!_isTauri) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx >= 0) tasks.splice(idx, 1);
    return;
  }
  return await _invoke('delete_task', { id });
}

async function apiUpdateTaskStatus(id, status) {
  if (!_isTauri) {
    const task = tasks.find(t => t.id === id);
    if (task) { task.status = status; task.updatedAt = new Date().toISOString(); }
    return task;
  }
  return await _invoke('update_task_status', { id, status });
}

// ── Logs ─────────────────────────────────────────────────
async function apiGetActivityLogs(projectId) {
  const result = await _invoke('get_activity_logs', projectId ? { projectId } : {});
  return result || [...activityLogs];
}

async function apiExportLogsCsv(projectId) {
  if (!_isTauri) return null;
  return await _invoke('export_logs_csv', projectId ? { projectId } : {});
}

// ── Settings ─────────────────────────────────────────────
async function apiGetWatchedDirs() {
  return (await _invoke('get_watched_dirs')) || [];
}

async function apiAddWatchedDir(path) {
  return await _invoke('add_watched_dir', { path });
}

async function apiRemoveWatchedDir(id) {
  return await _invoke('remove_watched_dir', { id });
}

async function apiGetSetting(key) {
  return await _invoke('get_setting', { key });
}

async function apiSetSetting(key, value) {
  return await _invoke('set_setting', { key, value });
}

// ── AI ───────────────────────────────────────────────────
async function apiSaveApiKey(provider, key) {
  return await _invoke('save_api_key', { provider, key });
}

async function apiGetApiKeyStatus(provider) {
  const result = await _invoke('get_api_key_status', { provider });
  return result || false;
}

async function apiDeleteApiKey(provider) {
  return await _invoke('delete_api_key', { provider });
}

async function apiAnalyzeLogs(prompt, provider) {
  if (!_isTauri) return 'AI analysis requires Tauri environment with an API key configured.';
  return await _invoke('analyze_logs', { prompt, provider });
}

// ── Team ─────────────────────────────────────────────────
async function apiTeamIsReady() {
  return await _invoke('team_is_ready') ?? false;
}

async function apiTeamGetSyncMode() {
  return await _invoke('team_get_sync_mode') ?? 'auto';
}

async function apiTeamSetSyncMode(mode) {
  return await _invoke('team_set_sync_mode', { mode });
}

async function apiTeamGetUnsyncedCount() {
  return await _invoke('team_get_unsynced_count') ?? 0;
}

async function apiTeamDebugStatus() {
  return await _invoke('team_debug_status');
}

async function apiTeamGetCurrentRoom() {
  return await _invoke('team_get_current_room');
}

async function apiTeamGetEndpointId() {
  return await _invoke('team_get_endpoint_id');
}

async function apiTeamCreate(expiresMinutes) {
  return await _invoke('team_create', { expiresMinutes: expiresMinutes ?? null });
}

async function apiTeamIssueInvite(expiresMinutes) {
  return await _invoke('team_issue_invite', { expiresMinutes: expiresMinutes ?? null });
}

async function apiTeamJoin(code) {
  return await _invoke('team_join', { code });
}

async function apiTeamLeave() {
  return await _invoke('team_leave');
}

async function apiTeamIsInTeam() {
  return await _invoke('team_is_in_team') ?? false;
}

async function apiTeamIsActiveMember() {
  return await _invoke('team_is_active_member') ?? false;
}

async function apiTeamRepairOrphanIfNeeded() {
  return await _invoke('team_repair_orphan_if_needed') ?? false;
}

async function apiTeamListMembers() {
  return await _invoke('team_list_members') ?? [];
}

async function apiTeamListBlocked() {
  return await _invoke('team_list_blocked') ?? [];
}

async function apiTeamListPendingJoins() {
  return await _invoke('team_list_pending_joins') ?? [];
}

async function apiTeamAmIPending() {
  return await _invoke('team_am_i_pending') ?? false;
}

/** ゲスト: 承認済みだが member_join 未着のときホストへ再送依頼（gossip） */
async function apiTeamRequestMemberSync() {
  return await _invoke('team_request_member_sync') ?? false;
}

/** 承認済みだが gossip 未着のとき、参加申請中ならローカルだけ active にする救済 */
async function apiTeamGuestApplyLocalMembershipIfPending() {
  return await _invoke('team_guest_apply_local_membership_if_pending');
}

async function apiTeamCancelJoin() {
  return await _invoke('team_cancel_join');
}

async function apiTeamApproveJoin(endpointId, topicId) {
  return await _invoke('team_approve_join', { endpointId, topicId });
}

async function apiTeamRejectJoin(endpointId, topicId) {
  return await _invoke('team_reject_join', { endpointId, topicId });
}

async function apiTeamKick(endpointId) {
  return await _invoke('team_kick', { endpointId });
}

async function apiTeamBlock(endpointId) {
  return await _invoke('team_block', { endpointId });
}

async function apiTeamUnblock(endpointId) {
  return await _invoke('team_unblock', { endpointId });
}

async function apiTeamPromoteToCoHost(endpointId) {
  return await _invoke('team_promote_to_co_host', { endpointId });
}

async function apiTeamAmIHost() {
  return await _invoke('team_am_i_host') ?? false;
}

async function apiTeamGetMyRole() {
  return await _invoke('team_get_my_role') ?? '';
}

async function apiTeamSetMyDisplayName(displayName) {
  return await _invoke('team_set_my_display_name', { displayName });
}

async function apiTeamGetMyDisplayName() {
  return await _invoke('team_get_my_display_name') ?? '';
}

async function apiTeamListInviteCodes() {
  return await _invoke('team_list_invite_codes') ?? [];
}

async function apiTeamRevokeInviteCode(code) {
  return await _invoke('team_revoke_invite_code', { code });
}

async function apiTeamResolveConflict(choice, incoming, seq) {
  return await _invoke('team_resolve_conflict', { input: { choice, incoming, seq: seq ?? null } });
}

async function apiTeamUpdateName(newName) {
  return await _invoke('team_update_name', { newName });
}

async function apiTeamPushUnsynced() {
  return await _invoke('team_push_unsynced');
}
