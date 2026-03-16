// ── Tauri API Wrapper ────────────────────────────────────
// Tauri 環境ではバックエンドの invoke() を使用、
// ブラウザ開発時はダミーデータにフォールバック
const _isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

async function _invoke(cmd, args) {
  if (!_isTauri) return null;
  return await window.__TAURI__.core.invoke(cmd, args || {});
}

// ── Projects ─────────────────────────────────────────────
async function apiGetProjects() {
  try {
    const result = await _invoke('get_projects');
    return Array.isArray(result) ? result : [...(localProjects || [])];
  } catch (e) {
    console.error('apiGetProjects failed:', e);
    return [...(localProjects || [])];
  }
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
    try {
      await _invoke('open_in_ide', { ide, path: path || null });
    } catch (e) {
      console.error('Failed to open IDE:', e);
      alert('Failed to open IDE: ' + e);
    }
  } else {
    alert('Open in ' + ide + '\n(Tauri環境で動作)');
  }
}

// ── Tasks ────────────────────────────────────────────────
async function apiGetTasks(projectId) {
  try {
    const result = await _invoke('get_tasks', projectId ? { projectId } : {});
    return Array.isArray(result) ? result : [...(tasks || [])];
  } catch (e) {
    console.error('apiGetTasks failed:', e);
    return [...(tasks || [])];
  }
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
  if (!_isTauri) return false;
  try {
    const r = await _invoke('team_is_ready', {});
    return r === true;
  } catch {
    return false;
  }
}

async function apiTeamDebugStatus() {
  if (!_isTauri) return null;
  try {
    return await _invoke('team_debug_status', {});
  } catch (e) {
    return { step1_iroh_node: 'エラー', step2_node_ticket: '-', step2_error: String(e), endpoint_id: null };
  }
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

async function apiTeamListInviteCodes() {
  const result = await _invoke('team_list_invite_codes', {});
  return Array.isArray(result) ? result : [];
}

async function apiTeamRevokeInviteCode(code) {
  return await _invoke('team_revoke_invite_code', { code });
}

async function apiTeamListPendingJoins() {
  const result = await _invoke('team_list_pending_joins', {});
  return Array.isArray(result) ? result : [];
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

async function apiTeamListBlocked() {
  const result = await _invoke('team_list_blocked', {});
  return Array.isArray(result) ? result : [];
}

async function apiTeamGetCurrentRoom() {
  try {
    return await _invoke('team_get_current_room', {});
  } catch (e) {
    console.error('apiTeamGetCurrentRoom failed:', e);
    return { roomName: '未参加', status: '未参加' };
  }
}

async function apiTeamGetSyncMode() {
  try {
    return (await _invoke('team_get_sync_mode', {})) || 'auto';
  } catch (e) {
    return 'auto';
  }
}

async function apiTeamSetSyncMode(mode) {
  return await _invoke('team_set_sync_mode', { mode });
}

async function apiTeamGetUnsyncedCount() {
  try {
    return (await _invoke('team_get_unsynced_count', {})) || 0;
  } catch (e) {
    return 0;
  }
}

async function apiTeamPushUnsynced() {
  return await _invoke('team_push_unsynced', {});
}

async function apiTeamGetMyRole() {
  try {
    return (await _invoke('team_get_my_role', {})) || 'member';
  } catch {
    return 'member';
  }
}

async function apiTeamAmIHost() {
  try {
    return (await _invoke('team_am_i_host', {})) || false;
  } catch (e) {
    return false;
  }
}

async function apiTeamSetMyDisplayName(displayName) {
  return await _invoke('team_set_my_display_name', { displayName });
}

async function apiTeamGetMyDisplayName() {
  try {
    return (await _invoke('team_get_my_display_name', {})) || null;
  } catch (e) {
    return null;
  }
}

async function apiTeamAmIPending() {
  try {
    return (await _invoke('team_am_i_pending', {})) || false;
  } catch (e) {
    return false;
  }
}

async function apiTeamCancelJoin() {
  return await _invoke('team_cancel_join', {});
}

async function apiTeamListMembers() {
  try {
    const result = await _invoke('team_list_members', {});
    return Array.isArray(result) ? result : [];
  } catch (e) {
    return [];
  }
}

async function apiTeamPromoteToCoHost(endpointId) {
  return await _invoke('team_promote_to_co_host', { endpointId });
}

async function apiTeamResolveConflict(choice, incoming) {
  return await _invoke('team_resolve_conflict', { choice, incoming });
}
