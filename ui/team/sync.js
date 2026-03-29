// ── Team: Sync Module ────────────────────────────────────────
// 同期モード管理機能

/**
 * 同期モードを保存
 */
async function saveSyncMode(mode) {
  if (!_isTauri || !mode) return;
  try {
    await apiTeamSetSyncMode(mode);
    if (typeof updateSidebarUnsyncedBadge === 'function') updateSidebarUnsyncedBadge();
  } catch (e) {
    console.error('Failed to save sync mode:', e);
  }
}

/**
 * サイドバー: 手動同期時の未配信バッジ + Push ボタンエリア
 */
async function updateSidebarUnsyncedBadge() {
  const badge = document.getElementById('sidebar-unsynced-badge');
  const pushSection = document.getElementById('sidebar-push-section');
  const pushCount = document.getElementById('sidebar-push-count');
  if (!_isTauri || typeof apiTeamGetUnsyncedCount !== 'function') {
    badge?.classList.add('hidden');
    pushSection?.classList.add('hidden');
    return;
  }
  try {
    const [n, mode, active] = await Promise.all([
      apiTeamGetUnsyncedCount(),
      apiTeamGetSyncMode().catch(() => SYNC_MODE_AUTO),
      typeof apiTeamIsActiveMember === 'function' ? apiTeamIsActiveMember().catch(() => false) : Promise.resolve(false),
    ]);
    const count = typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, n) : 0;
    const manual = mode === SYNC_MODE_MANUAL || mode === 'manual';

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle('hidden', !(manual && count > 0));
    }
    if (pushSection && pushCount) {
      pushCount.textContent = String(count);
      pushSection.classList.toggle('hidden', !(manual && active));
    }
  } catch (_) {
    badge?.classList.add('hidden');
    pushSection?.classList.add('hidden');
  }
}

/**
 * 未配信 Operation を一括送信（サイドバー / Team 設定の Push から）
 */
async function teamPushUnsynced() {
  if (!_isTauri || typeof apiTeamPushUnsynced !== 'function') return;
  try {
    const n = await apiTeamPushUnsynced();
    const sent = typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, n) : 0;
    if (typeof showAlert === 'function') {
      showAlert(
        sent > 0 ? `${sent} 件を配信しました。` : '未配信の変更はありません。',
        sent > 0 ? 'success' : 'info'
      );
    }
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert('Push に失敗しました: ' + (e?.message || e), 'error');
  }
}

// Expose globally
window.saveSyncMode = saveSyncMode;
window.updateSidebarUnsyncedBadge = updateSidebarUnsyncedBadge;
window.teamPushUnsynced = teamPushUnsynced;