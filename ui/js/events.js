// ── UI: Events Module ────────────────────────────────────────
// イベントハンドリング機能

/**
 * すべてのドロップダウンを閉じる
 */
function closeAllDropdowns() {
  document.querySelectorAll('[id^="dd-"]').forEach((el) => {
    if (el) el.classList.add('hidden');
  });
}

/**
 * ドロップダウンの開閉
 */
function toggleDropdown(id) {
  const dd = document.getElementById(id);
  if (!dd) return;
  const wasHidden = dd.classList.contains('hidden');
  closeAllDropdowns();
  if (wasHidden) dd.classList.remove('hidden');
}

/**
 * History API: モバイルの「戻る」でモーダルを閉じる
 */
function _pushModalHistory(type) {
  _modalHistory = type;
  if (history.pushState) history.pushState({ modal: type }, '', window.location.href);
}

// Note: click handler for closing dropdowns on outside click is in main.js

/**
 * Tauri チーム系イベントを1箇所で購読（loadData / refreshTeamUiFromBackend は data.js）
 */
function registerTauriTeamEventListeners() {
  if (!_isTauri || !window.__TAURI__?.event?.listen) return;
  const { listen } = window.__TAURI__.event;
  listen('team-task-updated', async () => {
    await loadData();
    if (typeof filterTasks === 'function') filterTasks();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
  });
  listen('team-unsynced-updated', async () => {
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
  });
  listen('team-subscriptions-restored', async () => {
    await refreshTeamUiFromBackend();
  });
  listen('team-blocked', async () => {
    showAlert('このチームからブロックされました。', 'error');
    await refreshTeamUiFromBackend();
  });
  listen('team-members-updated', async () => {
    // DB 書き込み直後の emit ではまだ読み取りに反映されない場合があるため小ディレイ
    await new Promise(r => setTimeout(r, 80));
    await refreshTeamUiFromBackend();
  });
  listen('team-member-join-broadcast-failed', (e) => {
    const msg = typeof e?.payload === 'string' ? e.payload : '';
    showAlert(
      '承認は保存済みですが、相手端末への gossip 通知に失敗しました。ネットワークを確認し、必要なら再度「承認」を試すか、参加側で再読み込みしてください。 ' +
        (msg || ''),
      'warning',
    );
  });
  listen('team-pending-join-cancelled', async () => {
    await refreshTeamUiFromBackend();
  });
  listen('team-pending-join', async () => {
    await refreshTeamUiFromBackend();
  });
  listen('team-cancelled', async () => {
    await refreshTeamUiFromBackend();
  });
  listen('team-disbanded', async () => {
    showAlert('チームが解散しました。', 'info');
    await refreshTeamUiFromBackend();
  });
  listen('team-left', async () => {
    await refreshTeamUiFromBackend();
  });
  listen('team-iroh-ready', async (e) => {
    if (typeof updateTeamButtonsState === 'function') {
      updateTeamButtonsState(e.payload === true, e.payload === false);
    }
    if (e.payload === true) {
      await refreshTeamUiFromBackend();
    }
  });
  listen('team-update-required', () => {
    showAlert('アプリのアップデートが必要です。最新版をインストールしてください。', 'error');
  });
  listen('team-sync-check-needed', async () => {
    console.warn('team gossip: Lagged 検出 — 再同期を実行します');
    await refreshTeamUiFromBackend();
    await loadData();
    if (typeof filterTasks === 'function') filterTasks();
  });
}

window.closeAllDropdowns = closeAllDropdowns;
window.toggleDropdown = toggleDropdown;
window._pushModalHistory = _pushModalHistory;
window.registerTauriTeamEventListeners = registerTauriTeamEventListeners;
