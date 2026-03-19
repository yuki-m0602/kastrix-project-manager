// ── Tauri API Wrapper ────────────────────────────────────
// Tauri 環境ではバックエンドの invoke() を使用、
// ブラウザ開発時はダミーデータにフォールバック
const _isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined;

/** XSS対策: ユーザー入力を innerHTML に挿入する前にエスケープ（属性値内の ' も対応） */
function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML.replace(/'/g, '&#39;');
}

async function _invoke(cmd, args) {
  if (!_isTauri) return null;
  return await window.__TAURI__.core.invoke(cmd, args || {});
}

/** invoke を try-catch でラップし、失敗時に defaultVal を返す */
async function _invokeWithDefault(cmd, args, defaultVal, options = {}) {
  const { asArray = false, logLabel } = options;
  try {
    const result = await _invoke(cmd, args || {});
    if (asArray) return Array.isArray(result) ? result : defaultVal;
    return result ?? defaultVal;
  } catch (e) {
    if (logLabel) console.error(logLabel + ' failed:', e);
    return defaultVal;
  }
}

// ── Projects ─────────────────────────────────────────────
async function apiGetProjects() {
  const fallback = [...(localProjects || [])];
  return await _invokeWithDefault('get_projects', {}, fallback, { asArray: true, logLabel: 'apiGetProjects' });
}

async function apiScanDirectory(path) {
  return await _invoke('scan_directory', { path });
}

async function apiScanAllWatchedDirs() {
  return await _invokeWithDefault('scan_all_watched_dirs', {}, [], { asArray: true });
}

async function apiRemoveProject(id) {
  return await _invoke('remove_project', { id });
}

async function apiGetReadme(path) {
  return await _invokeWithDefault('get_readme', { path }, 'No README available');
}

async function apiOpenInIde(ide, path) {
  if (_isTauri) {
    try {
      await _invoke('open_in_ide', { ide, path: path || null });
    } catch (e) {
      console.error('Failed to open IDE:', e);
      showAlert('IDE を開けませんでした: ' + e, 'error');
    }
  } else {
    showAlert(ide + ' で開く\n(Tauri 環境で動作)', 'info');
  }
}

// ── Tasks ────────────────────────────────────────────────
async function apiGetTasks(projectId) {
  const fallback = [...(tasks || [])];
  const args = projectId ? { projectId } : {};
  return await _invokeWithDefault('get_tasks', args, fallback, { asArray: true, logLabel: 'apiGetTasks' });
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
  const fallback = [...(activityLogs || [])];
  const args = projectId ? { projectId } : {};
  return await _invokeWithDefault('get_activity_logs', args, fallback, { asArray: true });
}

async function apiExportLogsCsv(projectId) {
  if (!_isTauri) return null;
  return await _invoke('export_logs_csv', projectId ? { projectId } : {});
}

// ── Settings ─────────────────────────────────────────────
async function apiGetWatchedDirs() {
  return await _invokeWithDefault('get_watched_dirs', {}, [], { asArray: true });
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
  return await _invokeWithDefault('get_api_key_status', { provider }, false);
}

async function apiDeleteApiKey(provider) {
  return await _invoke('delete_api_key', { provider });
}

async function apiListAiModels(provider) {
  if (!_isTauri) return [];
  return await _invokeWithDefault('list_ai_models', { provider }, [], { asArray: true });
}

/** モデル一覧（id + is_free）。OpenRouter で無料判定に使用 */
async function apiListAiModelsExtended(provider) {
  if (!_isTauri) return [];
  return await _invokeWithDefault('list_ai_models_extended', { provider }, [], { asArray: true });
}

async function apiAnalyzeLogs(prompt, provider) {
  if (!_isTauri) return 'AI analysis requires Tauri environment with an API key configured.';
  return await _invoke('analyze_logs', { prompt, provider });
}

// ── AI Chat Logs (永続化・複数チャット) ────────────────────
async function apiAiCreateChat() {
  if (!_isTauri) return null;
  return await _invokeWithDefault('ai_create_chat', {}, null);
}

async function apiAiListChats() {
  if (!_isTauri) return [];
  return await _invokeWithDefault('ai_list_chats', {}, [], { asArray: true });
}

async function apiAiGetChatMessages(chatId) {
  if (!_isTauri) return [];
  return await _invokeWithDefault('ai_get_chat_messages', { chatId }, [], { asArray: true });
}

async function apiAiAddChatMessage(chatId, role, content) {
  if (!_isTauri) return;
  await _invoke('ai_add_chat_message', { chatId, role, content });
}

async function apiAiDeleteChat(chatId) {
  if (!_isTauri) return;
  await _invoke('ai_delete_chat', { chatId });
}

// ── Team ─────────────────────────────────────────────────
async function apiTeamIsReady() {
  if (!_isTauri) return false;
  const r = await _invokeWithDefault('team_is_ready', {}, false);
  return r === true;
}

async function apiTeamDebugStatus() {
  if (!_isTauri) return null;
  const fallback = { step1_iroh_node: 'エラー', step2_node_ticket: '-', step2_error: null, endpoint_id: null };
  try {
    return await _invoke('team_debug_status', {});
  } catch (e) {
    return { ...fallback, step2_error: String(e) };
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
  return await _invokeWithDefault('team_list_invite_codes', {}, [], { asArray: true });
}

async function apiTeamRevokeInviteCode(code) {
  return await _invoke('team_revoke_invite_code', { code });
}

async function apiTeamListPendingJoins() {
  return await _invokeWithDefault('team_list_pending_joins', {}, [], { asArray: true });
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
  return await _invokeWithDefault('team_list_blocked', {}, [], { asArray: true });
}

async function apiTeamGetCurrentRoom() {
  const fallback = { roomName: '未参加', status: '未参加' };
  return await _invokeWithDefault('team_get_current_room', {}, fallback, { logLabel: 'apiTeamGetCurrentRoom' });
}

async function apiTeamGetSyncMode() {
  return await _invokeWithDefault('team_get_sync_mode', {}, SYNC_MODE_AUTO);
}

async function apiTeamSetSyncMode(mode) {
  return await _invoke('team_set_sync_mode', { mode });
}

async function apiTeamGetUnsyncedCount() {
  return await _invokeWithDefault('team_get_unsynced_count', {}, 0);
}

async function apiTeamPushUnsynced() {
  return await _invoke('team_push_unsynced', {});
}

async function apiTeamGetMyRole() {
  return await _invokeWithDefault('team_get_my_role', {}, 'member');
}

async function apiTeamAmIHost() {
  return await _invokeWithDefault('team_am_i_host', {}, false);
}

async function apiTeamSetMyDisplayName(displayName) {
  return await _invoke('team_set_my_display_name', { displayName });
}

async function apiTeamGetMyDisplayName() {
  return await _invokeWithDefault('team_get_my_display_name', {}, null);
}

async function apiTeamAmIPending() {
  return await _invokeWithDefault('team_am_i_pending', {}, false);
}

async function apiTeamCancelJoin() {
  return await _invoke('team_cancel_join', {});
}

async function apiTeamListMembers() {
  return await _invokeWithDefault('team_list_members', {}, [], { asArray: true });
}

async function apiTeamPromoteToCoHost(endpointId) {
  return await _invoke('team_promote_to_co_host', { endpointId });
}

async function apiTeamResolveConflict(choice, incoming) {
  return await _invoke('team_resolve_conflict', { choice, incoming });
}
