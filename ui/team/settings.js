/* eslint-disable no-unused-vars */
// ── Team: Settings Module ────────────────────────────────────────
// チーム設定・脱退機能

/**
 * チーム名編集フォームを表示
 */
function toggleTeamNameEdit() {
  const displayEl = document.getElementById('team-name-display');
  const formEl = document.getElementById('team-name-edit-form');
  if (!displayEl || !formEl) return;

  const isEditing = !formEl.classList.contains('hidden');
  if (isEditing) {
    cancelTeamNameEdit();
  } else {
    formEl.classList.remove('hidden');
    displayEl.style.display = 'none';
    document.getElementById('team-name-input')?.focus();
  }
}

/**
 * チーム名を保存
 */
async function saveTeamName() {
  const inputEl = document.getElementById('team-name-input');
  if (!inputEl) return;

  const newName = inputEl.value.trim();
  if (!newName) {
    alert('チーム名を入力してください');
    return;
  }

  try {
    // APIでチーム名を保存
    await apiTeamUpdateName(newName);

    // 表示を更新
    const displayEl = document.getElementById('team-name-display');
    if (displayEl) displayEl.textContent = escapeHtml(newName);

    cancelTeamNameEdit();
    alert('チーム名を更新しました');

    // UI全体を再レンダリングして同期
    renderTeamView();
  } catch (e) {
    console.error('Failed to save team name:', e);
    alert('チーム名の保存に失敗しました');
  }
}

/**
 * チーム名編集をキャンセル
 */
function cancelTeamNameEdit() {
  const displayEl = document.getElementById('team-name-display');
  const formEl = document.getElementById('team-name-edit-form');
  if (displayEl) displayEl.style.display = '';
  if (formEl) formEl.classList.add('hidden');
}

/**
 * チーム設定モーダルを表示
 */
function showTeamSettingsModal() {
  if (!_isTauri) return;

  // モーダルのHTML
  const modalHtml = `
    <div id="team-settings-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-[#161b22] border border-[#30363d] rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-white">チーム設定</h3>
            <button onclick="closeTeamSettingsModal()" class="text-[#8b949e] hover:text-white">
              <i data-lucide="x" size="20"></i>
            </button>
          </div>

          <div class="space-y-4">
            <!-- チーム名変更 -->
            <div>
              <label class="block text-sm font-medium text-white mb-2">チーム名</label>
              <input id="modal-team-name" type="text" placeholder="チーム名を入力" class="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white outline-none focus:border-indigo-500" maxlength="50">
            </div>

            <!-- 同期モード -->
            <div>
              <label class="block text-sm font-medium text-white mb-2">同期モード</label>
              <select id="modal-sync-mode" class="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white">
                <option value="auto">自動同期</option>
                <option value="manual">手動同期</option>
              </select>
            </div>

            <!-- 自分の表示名 -->
            <div>
              <label class="block text-sm font-medium text-white mb-2">自分の表示名</label>
              <input id="modal-display-name" type="text" placeholder="表示名を入力" class="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white outline-none focus:border-indigo-500" maxlength="64">
            </div>

            <!-- 危険ゾーン -->
            <div class="pt-4 border-t border-[#30363d]">
              <h4 class="text-sm font-bold text-red-400 mb-2">危険ゾーン</h4>
              <button onclick="confirmTeamLeave()" class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-bold text-white">
                チームを抜ける
              </button>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button type="button" onclick="saveTeamSettings()" class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white">
              確定
            </button>
            <button type="button" onclick="closeTeamSettingsModal()" class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-sm font-bold text-white">
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // モーダルをbodyに追加
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  lucide.createIcons();

  // 現在の設定を読み込んで入力欄にセット
  loadTeamSettingsIntoModal();
}

/**
 * チーム設定モーダルを閉じる
 */
function closeTeamSettingsModal() {
  const modal = document.getElementById('team-settings-modal');
  if (modal) modal.remove();
}

/**
 * チーム設定をモーダルに読み込み
 */
async function loadTeamSettingsIntoModal() {
  try {
    const [syncMode, displayName] = await Promise.all([
      apiTeamGetSyncMode(),
      apiTeamGetMyDisplayName ? apiTeamGetMyDisplayName() : Promise.resolve('')
    ]);

    const nameEl = document.getElementById('modal-team-name');
    const syncEl = document.getElementById('modal-sync-mode');
    const displayEl = document.getElementById('modal-display-name');

    const teamName = await apiGetSetting('team_name').catch(() => 'My Team');
    if (nameEl) nameEl.value = teamName || 'My Team';
    if (syncEl) syncEl.value = syncMode || 'auto';
    if (displayEl) displayEl.value = displayName || '';
  } catch (e) {
    console.error('Failed to load team settings:', e);
  }
}

/**
 * チーム設定を保存
 */
async function saveTeamSettings() {
  try {
    const name = document.getElementById('modal-team-name')?.value || '';
    const syncMode = document.getElementById('modal-sync-mode')?.value || 'auto';
    const displayName = document.getElementById('modal-display-name')?.value || '';

    // Save team name
    if (name) {
      await apiTeamUpdateName(name);
    }
    // Save sync mode
    await apiTeamSetSyncMode(syncMode);
    // Save display name
    await apiTeamSetMyDisplayName(displayName);

    showAlert('設定を保存しました。', 'success');
    closeTeamSettingsModal();
    renderTeamView(); // UI更新
  } catch (e) {
    console.error('Failed to save team settings:', e);
    alert('設定保存に失敗しました');
  }
}

/**
 * 設定モーダルから脱退（確認は teamLeave 内で1回のみ）
 */
async function confirmTeamLeave() {
  const ok = await teamLeave();
  if (ok) closeTeamSettingsModal();
}

/**
 * 確認1回のあと API で脱退。成功時 true
 */
async function teamLeave() {
  if (!(await confirmAsync('チームを抜けますか？ この操作は取り消せません。'))) {
    return false;
  }
  if (!_isTauri) {
    showAlert('Tauri 環境でのみチームを抜けます。', 'info');
    return false;
  }
  try {
    await apiTeamLeave();
    showAlert('チームを抜けました。', 'success');
    await renderTeamView();
    return true;
  } catch (e) {
    console.error('Failed to leave team:', e);
    showAlert('チームを抜けるのに失敗しました。', 'error');
    return false;
  }
}

/**
 * 表示名セクションを表示
 */
async function renderTeamDisplayNameSection() {
  if (!_isTauri) return;
  const section = document.getElementById('team-display-name-section');
  const input = document.getElementById('team-display-name-input');
  if (!section || !input) return;
  try {
    const [ready, displayName] = await Promise.all([
      apiTeamIsReady(),
      apiTeamGetMyDisplayName(),
    ]);
    if (ready) {
      section.classList.remove('hidden');
      input.value = displayName || '';
    } else {
      section.classList.add('hidden');
    }
  } catch (e) {
    section.classList.add('hidden');
  }
}

async function cancelTeamDisplayNameEdit() {
  if (!_isTauri) return;
  const input = document.getElementById('team-display-name-input');
  if (!input) return;
  try {
    const displayName = await apiTeamGetMyDisplayName();
    input.value = displayName || '';
  } catch (_) {
    input.value = '';
  }
}

/**
 * 表示名を保存
 */
async function teamSaveDisplayName() {
  if (!_isTauri) return;
  const input = document.getElementById('team-display-name-input');
  const name = input?.value?.trim() ?? '';
  try {
    await apiTeamSetMyDisplayName(name);
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    await renderTeamMembers();
    if (typeof renderInbox === 'function') await renderInbox();
    showAlert('表示名を更新しました。', 'success');
  } catch (e) {
    showAlert('表示名の更新に失敗しました: ' + (e?.message || e), 'error');
  }
}

// Expose globally
window.toggleTeamNameEdit = toggleTeamNameEdit;
window.saveTeamName = saveTeamName;
window.cancelTeamNameEdit = cancelTeamNameEdit;
window.showTeamSettingsModal = showTeamSettingsModal;
window.closeTeamSettingsModal = closeTeamSettingsModal;
window.loadTeamSettingsIntoModal = loadTeamSettingsIntoModal;
window.saveTeamSettings = saveTeamSettings;
window.confirmTeamLeave = confirmTeamLeave;
window.teamLeave = teamLeave;
window.renderTeamDisplayNameSection = renderTeamDisplayNameSection;
window.cancelTeamDisplayNameEdit = cancelTeamDisplayNameEdit;
window.teamSaveDisplayName = teamSaveDisplayName;