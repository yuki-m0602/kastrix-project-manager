// ── Settings: Team ────────────────────────────────────────
// _isTauri は api.js で定義済み
// 注意: renderTeamView() の実体は team/view.js に一元化されている。
// ここでは team/view.js 読み込み前のフォールバックとして window.renderTeamView を参照するだけ。



function formatExpiresAt(isoStr) {
  if (!isoStr) return '';
  try {
    const normalized = String(isoStr).replace(' ', 'T');
    const d = new Date(normalized);
    const now = new Date();
    const diff = d - now;
    if (diff <= 0) return '期限切れ';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `残り${mins}分`;
    const hrs = Math.floor(mins / 60);
    return `残り${hrs}時間`;
  } catch (_) {
    return '';
  }
}

async function saveSyncMode(mode) {
  if (!_isTauri || !mode) return;
  try {
    await apiTeamSetSyncMode(mode);
    if (typeof updateSidebarUnsyncedBadge === 'function') updateSidebarUnsyncedBadge();
  } catch (e) {
    console.error('Failed to save sync mode:', e);
  }
}

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

async function teamSaveDisplayName() {
  if (!_isTauri) return;
  const input = document.getElementById('team-display-name-input');
  const name = input?.value?.trim() ?? '';
  try {
    await apiTeamSetMyDisplayName(name);
    await renderTeamMembers();
    if (typeof renderInbox === 'function') await renderInbox();
    showAlert('表示名を保存しました。', 'success');
  } catch (e) {
    showAlert('保存に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function renderTeamPendingJoins() {
  if (!_isTauri) return;
  const section = document.getElementById('team-pending-joins-section');
  const list = document.getElementById('team-pending-joins-list');
  if (!section || !list) return;
  try {
    const pending = await apiTeamListPendingJoins();
    if (pending.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    list.innerHTML = pending.map((p) => `
      <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
        <div class="flex flex-col gap-0.5 min-w-0">
          <span class="text-xs font-mono text-white truncate" title="${escapeHtml(p.endpoint_id)}">${escapeHtml(p.endpoint_id.slice(0, 16))}...</span>
          <span class="text-[9px] text-[#8b949e]">${escapeHtml(p.requested_at)}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button onclick="teamApproveJoin(this)" data-endpoint="${escapeHtml(p.endpoint_id)}" data-topic="${escapeHtml(p.topic_id)}" class="px-2 py-1 text-[9px] font-bold text-green-400 hover:bg-green-500/10 rounded-lg">承認</button>
          <button onclick="teamRejectJoin(this)" data-endpoint="${escapeHtml(p.endpoint_id)}" data-topic="${escapeHtml(p.topic_id)}" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">拒否</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to load pending joins:', e);
    section.classList.add('hidden');
  }
}

async function renderTeamMembers() {
  if (!_isTauri) return;
  const section = document.getElementById('team-members-section');
  const list = document.getElementById('team-members-list');
  if (!section || !list) return;
  try {
    const [members, amIHost, myRole] = await Promise.all([
      apiTeamListMembers(),
      apiTeamAmIHost(),
      apiTeamGetMyRole(),
    ]);
    if (members.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    const roleLabel = (r) => ({ host: 'HOST', co_host: 'CO-HOST', member: 'MEMBER' }[r] || r);
    const canKick = myRole === 'host' || myRole === 'co_host';
    list.innerHTML = members.map((m) => {
      let actions = '';
      if (m.role !== 'host') {
        if (amIHost && m.role === 'member') {
          actions += `<button onclick="teamPromoteToCoHost('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">CO-HOSTに昇格</button>`;
        }
        if (canKick) {
          actions += `<button onclick="teamKick('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">キック</button>`;
        }
        if (amIHost) {
          actions += `<button onclick="teamBlock('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">ブロック</button>`;
        }
      }
      const label = m.display_name || m.endpoint_id.slice(0, 20) + '...';
      return `
        <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs text-white truncate" title="${escapeHtml(m.endpoint_id)}">${escapeHtml(label)}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 shrink-0">${roleLabel(m.role)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">${actions}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load members:', e);
    section.classList.add('hidden');
  }
}

async function renderTeamPendingStatus() {
  if (!_isTauri) return;
  const form = document.getElementById('team-join-form');
  const status = document.getElementById('team-pending-status');
  if (!form || !status) return;
  try {
    const pending = await apiTeamAmIPending();
    form.style.display = pending ? 'none' : '';
    status.style.display = pending ? '' : 'none';
  } catch (e) {
    form.style.display = '';
    status.style.display = 'none';
  }
}

async function renderTeamBlocked() {
  if (!_isTauri) return;
  const section = document.getElementById('team-blocked-section');
  const list = document.getElementById('team-blocked-list');
  if (!section || !list) return;
  try {
    const [blocked, amIHost] = await Promise.all([
      apiTeamListBlocked(),
      apiTeamAmIHost(),
    ]);
    if (blocked.length === 0 || !amIHost) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    list.innerHTML = blocked.map((m) => {
      const label = m.display_name || m.endpoint_id.slice(0, 20) + '...';
      return `
      <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-red-500/30 rounded-xl">
        <span class="text-xs text-[#8b949e] truncate" title="${escapeHtml(m.endpoint_id)}">${escapeHtml(label)}</span>
        <button onclick="teamUnblock('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-lg">ブロック解除</button>
      </div>
    `;
    }).join('');
  } catch (e) {
    console.error('Failed to load blocked:', e);
    section.classList.add('hidden');
  }
}

async function teamPromoteToCoHost(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamPromoteToCoHost(endpointId);
    await renderTeamMembers();
  } catch (e) {
    console.error('Promote failed:', e);
    showAlert('昇格に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function teamKick(endpointId) {
  if (!_isTauri || !endpointId) return;
  if (!confirm('このメンバーをキックしますか？')) return;
  try {
    await apiTeamKick(endpointId);
    await renderTeamMembers();
    await renderTeamBlocked();
  } catch (e) {
    console.error('Kick failed:', e);
    showAlert('キックに失敗しました: ' + (e?.message || e), 'error');
  }
}

async function teamBlock(endpointId) {
  if (!_isTauri || !endpointId) return;
  if (!confirm('このメンバーをブロックしますか？ブロックされたメンバーは新規招待コードでも参加できなくなります。')) return;
  try {
    await apiTeamBlock(endpointId);
    await renderTeamMembers();
    await renderTeamBlocked();
  } catch (e) {
    console.error('Block failed:', e);
    showAlert('ブロックに失敗しました: ' + (e?.message || e), 'error');
  }
}

async function teamUnblock(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamUnblock(endpointId);
    await renderTeamBlocked();
  } catch (e) {
    console.error('Unblock failed:', e);
    showAlert('ブロック解除に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function renderTeamInviteCodes() {
  if (!_isTauri) return;
  const section = document.getElementById('team-invite-codes-section');
  const list = document.getElementById('team-invite-codes-list');
  if (!section || !list) return;
  try {
    const codes = await apiTeamListInviteCodes();
    if (codes.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    list.innerHTML = codes.map(c => {
      const expiresText = c.expires_at ? formatExpiresAt(c.expires_at) : '無期限';
      const isExpired = c.expires_at && formatExpiresAt(c.expires_at) === '期限切れ';
      const expiresClass = isExpired ? 'text-red-400' : 'text-[#8b949e]';
      const copyBtn = c.invite_string
        ? `<button onclick="teamCopyInviteLink(this)" data-invite="${escapeHtml(c.invite_string)}" class="px-2 py-1 text-[9px] font-bold text-indigo-400 hover:bg-indigo-500/10 rounded-lg shrink-0">リンクをコピー</button>`
        : '';
      return `
        <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-mono text-white truncate">${escapeHtml(c.code)}</span>
            <span class="text-[9px] font-bold shrink-0 ${expiresClass}">${expiresText}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${copyBtn}
            <button onclick="teamRevokeCode(this)" data-code="${escapeHtml(c.code)}" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">無効化</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load invite codes:', e);
    section.classList.add('hidden');
  }
}

async function teamCreate() {
  if (!_isTauri) {
    showAlert('チーム機能は Tauri 環境で動作します', 'info');
    return;
  }
  try {
    const expiresEl = document.getElementById('team-invite-expires');
    const expiresMinutes = expiresEl ? parseInt(expiresEl.value, 10) : 60;
    const result = await apiTeamCreate(expiresMinutes);
    if (result && result.invite_string) {
      await navigator.clipboard.writeText(result.invite_string);
      showAlert(`チームを作成しました。\n招待コード: ${result.code}\n\n参加する人にこの招待リンクを共有してください（クリップボードにコピー済み）`, 'success');
      await renderTeamInviteCodes();
      renderSettings();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    } else if (result && result.code) {
      await navigator.clipboard.writeText(result.code);
      showAlert(`チームを作成しました。\n招待コード: ${result.code}\n（クリップボードにコピーしました）`, 'success');
      await renderTeamInviteCodes();
      renderSettings();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    } else {
      console.error('teamCreate unexpected result:', result);
      showAlert('チーム作成に失敗しました。しばらく待ってから再度お試しください。', 'error');
    }
  } catch (e) {
    console.error('teamCreate failed:', e);
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamIssueInvite() {
  if (!_isTauri) {
    showAlert('チーム機能は Tauri 環境で動作します', 'info');
    return;
  }
  try {
    const expiresEl = document.getElementById('team-invite-expires');
    const expiresMinutes = expiresEl ? parseInt(expiresEl.value, 10) : 60;
    const result = await apiTeamIssueInvite(expiresMinutes);
    if (result && result.code) {
      const toCopy = result.invite_string || result.code;
      await navigator.clipboard.writeText(toCopy);
      const msg = result.invite_string
        ? `招待リンクを発行しました。\n参加する人にこのリンクを共有してください（クリップボードにコピー済み）`
        : `招待コードを発行しました。\n${result.code}\n（クリップボードにコピーしました）`;
      showAlert(msg, 'success');
      await renderTeamInviteCodes();
      renderSettings();
    } else {
      console.error('teamIssueInvite unexpected result:', result);
      showAlert('招待コードの発行に失敗しました。しばらく待ってから再度お試しください。', 'error');
    }
  } catch (e) {
    console.error('teamIssueInvite failed:', e);
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamJoin() {
  if (!_isTauri) {
    showAlert('チーム機能は Tauri 環境で動作します', 'info');
    return;
  }
  const input = document.getElementById('team-join-code');
  const code = input?.value?.trim();
  if (!code) {
    showAlert('招待コードを入力してください', 'info');
    return;
  }
  try {
    const result = await apiTeamJoin(code);
    if (result && result.message) {
      showAlert(result.message, 'info');
      if (input) input.value = '';
      await renderTeamPendingStatus();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    }
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamCancelJoin() {
  if (!_isTauri) return;
  if (!confirm('参加申請をキャンセルしますか？')) return;
  try {
    await apiTeamCancelJoin();
    await renderTeamPendingStatus();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    showAlert('参加申請をキャンセルしました。', 'success');
  } catch (e) {
    showAlert('キャンセルに失敗しました: ' + (e?.message || e), 'error');
  }
}

async function teamApproveJoin(btn) {
  if (!_isTauri || !btn?.dataset?.endpoint || !btn?.dataset?.topic) return;
  try {
    await apiTeamApproveJoin(btn.dataset.endpoint, btn.dataset.topic);
    await renderTeamPendingJoins();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamRejectJoin(btn) {
  if (!_isTauri || !btn?.dataset?.endpoint || !btn?.dataset?.topic) return;
  try {
    await apiTeamRejectJoin(btn.dataset.endpoint, btn.dataset.topic);
    await renderTeamPendingJoins();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamCopyInviteLink(btn) {
  const invite = btn?.dataset?.invite;
  if (!invite) return;
  try {
    await navigator.clipboard.writeText(invite);
    showAlert('招待リンクをクリップボードにコピーしました', 'success');
  } catch (e) {
    showAlert('コピーに失敗しました: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamRevokeCode(btn) {
  if (!_isTauri || !btn?.dataset?.code) return;
  const code = btn.dataset.code;
  if (!confirm(`招待コード ${code} を無効化しますか？`)) return;
  try {
    await apiTeamRevokeInviteCode(code);
    await renderTeamInviteCodes();
    renderSettings();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

/** サイドバー Inbox 行の未同期件数（チーム手動同期キュー） */
async function updateSidebarUnsyncedBadge() {
  const el = document.getElementById('sidebar-unsynced-badge');
  if (!el) return;
  if (!_isTauri || typeof apiTeamGetUnsyncedCount !== 'function') {
    el.classList.add('hidden');
    return;
  }
  try {
    const n = await apiTeamGetUnsyncedCount();
    const count = typeof n === 'number' && !Number.isNaN(n) ? Math.max(0, n) : 0;
    el.textContent = String(count);
    el.classList.toggle('hidden', count <= 0);
  } catch (_) {
    el.classList.add('hidden');
  }
}

async function teamApproveJoin(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamApproveJoin(endpointId, '');
    console.log('Approved join for:', endpointId);
    // alert('参加を承認しました。');
    renderTeamView(); // UI更新
  } catch (e) {
    console.error('Failed to approve join:', e);
    alert('参加承認に失敗しました: ' + e);
  }
}

async function teamRejectJoin(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamRejectJoin(endpointId, '');
    console.log('Rejected join for:', endpointId);
    // alert('参加を拒否しました。');
    renderTeamView(); // UI更新
  } catch (e) {
    console.error('Failed to reject join:', e);
    alert('参加拒否に失敗しました: ' + e);
  }
}

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
            <button onclick="saveTeamSettings()" class="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white">
              保存
            </button>
            <button onclick="closeTeamSettingsModal()" class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-sm font-bold text-white">
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

function closeTeamSettingsModal() {
  const modal = document.getElementById('team-settings-modal');
  if (modal) modal.remove();
}

async function loadTeamSettingsIntoModal() {
  try {
    const [syncMode, displayName] = await Promise.all([
      apiTeamGetSyncMode(),
      apiTeamGetMyDisplayName ? apiTeamGetMyDisplayName() : Promise.resolve('')
    ]);

    const nameEl = document.getElementById('modal-team-name');
    const syncEl = document.getElementById('modal-sync-mode');
    const displayEl = document.getElementById('modal-display-name');

    if (nameEl) nameEl.value = 'My Team'; // TODO: APIで取得
    if (syncEl) syncEl.value = syncMode || 'auto';
    if (displayEl) displayEl.value = displayName || '';
  } catch (e) {
    console.error('Failed to load team settings:', e);
  }
}

async function saveTeamSettings() {
  try {
    const name = document.getElementById('modal-team-name')?.value || '';
    const syncMode = document.getElementById('modal-sync-mode')?.value || 'auto';
    const displayName = document.getElementById('modal-display-name')?.value || '';

    // TODO: APIコールで保存
    // await apiTeamUpdateSettings({ name, syncMode, displayName });

    alert('設定を保存しました（実装予定）');
    closeTeamSettingsModal();
    renderTeamView(); // UI更新
  } catch (e) {
    console.error('Failed to save team settings:', e);
    alert('設定保存に失敗しました');
  }
}

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

function cancelTeamNameEdit() {
  const displayEl = document.getElementById('team-name-display');
  const formEl = document.getElementById('team-name-edit-form');
  if (displayEl) displayEl.style.display = '';
  if (formEl) formEl.classList.add('hidden');
}

async function teamCreate() {
  if (!_isTauri) {
    alert('Tauri環境でのみ利用可能です');
    return;
  }

  const expiresSelect = document.getElementById('team-invite-expires');
  const expiresMinutes = expiresSelect ? parseInt(expiresSelect.value) : 60;

  try {
    const result = await apiTeamCreate(expiresMinutes);

    // チーム名を保存
    await apiSetSetting('team_name', 'My Team');

    console.log('Team created:', result);
    alert(`チームを作成しました！\n招待コード: ${result.code}\n招待リンク: ${result.inviteString}`);

    // UI更新 - ダッシュボードを表示
    renderTeamView();
  } catch (e) {
    console.error('Failed to create team:', e);
    alert('チーム作成に失敗しました: ' + e);
  }
}

async function teamIssueInvite() {
  if (!_isTauri) return;

  const expiresSelect = document.getElementById('team-invite-expires');
  const expiresMinutes = expiresSelect ? parseInt(expiresSelect.value) : 60;

  try {
    const result = await apiTeamIssueInvite(expiresMinutes);

    console.log('Invite issued:', result);
    alert(`招待コードを発行しました！\nコード: ${result.code}\nリンク: ${result.inviteString}`);

    // UI更新
    renderTeamView();
  } catch (e) {
    console.error('Failed to issue invite:', e);
    alert('招待コード発行に失敗しました: ' + e);
  }
}

function confirmTeamLeave() {
  if (confirm('チームを抜けますか？ この操作は取り消せません。')) {
    teamLeave();
    closeTeamSettingsModal();
  }
}

async function teamLeave() {
  if (!_isTauri || !confirm('チームを抜けますか？ この操作は取り消せません。')) return;
  try {
    await apiTeamLeave();
    alert('チームを抜けました。');
    renderTeamView(); // UI更新
  } catch (e) {
    console.error('Failed to leave team:', e);
    alert('チームを抜けるのに失敗しました。');
  }
}

// イベントリスナーは events.js に一元化されている。
// 二重登録（renderTeamView が複数回並行実行される問題）を避けるため、
// ここではリスナーを登録しない。
