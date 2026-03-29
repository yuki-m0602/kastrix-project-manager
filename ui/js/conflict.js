// ── UI: Conflict Module ────────────────────────────────────────
// 競合解決ダイアログ機能

let _pendingConflict = null;
let _resolvedConflictTaskIds = new Set();
/** タスクIDごとのデバウンスマップ（別タスクの競合は即表示する） */
let _conflictDebounceMap = new Map();

/**
 * 競合ダイアログを表示
 */
function showConflictDialog(payload) {
  if (!payload) return;
  const tid = payload.task?.id || payload.task_id;
  if (!tid) return;
  const debounceUntil = _conflictDebounceMap.get(tid) || 0;
  if (Date.now() < debounceUntil) return;
  if (_resolvedConflictTaskIds.has(tid)) return;
  if (_pendingConflict) return;

  _pendingConflict = payload;
  const modal = document.getElementById('conflict-modal');
  if (!modal) return;
  const local = payload.local || {};
  const incoming = payload.incoming || {};
  const el = (id) => document.getElementById(id);
  const lt = el('conflict-local-title');
  const ls = el('conflict-local-status');
  const it = el('conflict-incoming-title');
  const is2 = el('conflict-incoming-status');
  if (lt) lt.textContent = local.title || '-';
  if (ls) ls.textContent = [local.status, local.priority].filter(Boolean).join(' / ') || '-';
  if (it) it.textContent = incoming.title || '-';
  if (is2) is2.textContent = [incoming.status, incoming.priority].filter(Boolean).join(' / ') || '-';
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  try {
    lucide.createIcons();
  } catch (err) {
    void err;
  }
}

/**
 * 競合モーダルを閉じる
 */
function closeConflictModal() {
  const modal = document.getElementById('conflict-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('hidden');
  }
  const tid = _pendingConflict?.task?.id || _pendingConflict?.task_id;
  if (tid) {
    _resolvedConflictTaskIds.add(tid);
    _conflictDebounceMap.set(tid, Date.now() + CONFLICT_DEBOUNCE_MS);
  }
  _pendingConflict = null;
}

/**
 * 競合を解決
 */
async function resolveConflict(choice) {
  const saved = _pendingConflict;
  if (!saved) return;
  closeConflictModal();
  if (!_isTauri) return;
  try {
    const seq = saved.seq ?? saved.task?.seq;
    await apiTeamResolveConflict(choice, saved.incoming ?? {}, seq);
    await reloadTasks();
  } catch (e) {
    console.error('resolveConflict failed:', e);
    showAlert('競合の解決に失敗しました', 'error');
  }
}

function initConflictUi() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _pendingConflict) {
      closeConflictModal();
    }
  });
  if (_isTauri && window.__TAURI__?.event?.listen) {
    window.__TAURI__.event.listen('team-conflict', (e) => {
      showConflictDialog(e.payload);
    });
  }
}

initConflictUi();

// Expose globally
window.showConflictDialog = showConflictDialog;
window.closeConflictModal = closeConflictModal;
window.resolveConflict = resolveConflict;