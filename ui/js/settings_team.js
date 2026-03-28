// ── Settings: Team ────────────────────────────────────────
// _isTauri は api.js で定義済み

// Expose functions globally
window.renderTeamView = renderTeamView;

async function renderTeamView() {
  console.log('renderTeamView called');
  const container = document.getElementById('team-content');
  if (!container) {
    console.error('team-content not found');
    return;
  }

  // 参加中: members に自分が active としていることのみ（購読だけ残る不整合は Rust 側で修復してから判定）
  let isJoined = false;
  let teamInfo = null;
  let members = [];
  let pendingJoins = [];
  let inviteCodes = [];
  let syncMode = SYNC_MODE_AUTO;
  let unsyncedCount = 0;
  let myRole = 'member';

  if (_isTauri) {
    try {
      await apiTeamRepairOrphanIfNeeded().catch(() => false);

      let membersData = [];
      try {
        membersData = await apiTeamListMembers();
      } catch (e) {
        console.error('Failed to load members:', e);
        membersData = [];
      }

      members = membersData || [];
      const isActiveMember = await apiTeamIsActiveMember().catch(() => false);
      isJoined = isActiveMember;

      if (isJoined) {
        // チーム参加時のデータ取得
        const promises = [
          apiTeamListPendingJoins().catch(() => []),
          apiTeamListInviteCodes().catch(() => []),
          apiTeamGetSyncMode().catch(() => SYNC_MODE_AUTO),
          apiTeamAmIHost().catch(() => false),
          apiGetSetting('team_name').catch(() => 'My Team'),
          apiTeamGetUnsyncedCount().catch(() => 0),
          apiTeamGetMyRole().catch(() => 'member'),
        ];

        const [pendingData, codesData, syncData, amIHost, teamName, unsyncedN, roleStr] =
          await Promise.all(promises);

        pendingJoins = pendingData || [];
        inviteCodes = codesData || [];
        syncMode = syncData || SYNC_MODE_AUTO;
        unsyncedCount =
          typeof unsyncedN === 'number' && !Number.isNaN(unsyncedN) ? Math.max(0, unsyncedN) : 0;
        myRole = roleStr || 'member';

        teamInfo = {
          name: teamName || 'My Team',
          memberCount: members.length,
          host: members.find(m => m.role === 'host')?.display_name || 'Unknown',
          amIHost
        };
      } else {
        // 未参加時のデータ取得
        syncMode = await apiTeamGetSyncMode().catch(() => SYNC_MODE_AUTO);
      }
    } catch (e) {
      console.error('Failed to load team data:', e);
    }
  }

  if (!isJoined) {
    // チーム未参加時のUI
    // チーム準備状態を取得
    const ready = _isTauri ? await apiTeamIsReady().catch(() => false) : false;
  
    container.innerHTML = `
        <!-- Welcome Card -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-8 text-center">
          <div class="max-w-md mx-auto space-y-6">
            <div class="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <i data-lucide="users" size="32" class="text-indigo-400"></i>
            </div>
            <div>
              <h2 class="text-lg font-bold text-white mb-2">チームに参加しましょう</h2>
              <p class="text-sm text-[#8b949e]">チームを作成してメンバーを招待するか、招待コードで既存チームに参加できます。</p>
            </div>
            <div class="flex gap-4 justify-center">
              <button id="btn-team-create" onclick="teamCreate()" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white flex items-center gap-2 ${ready ? '' : 'opacity-60 cursor-not-allowed'}" ${ready ? '' : 'disabled'}>
                <i data-lucide="plus" size="16"></i>
                チーム作成
              </button>
              <button id="btn-team-join-modal" onclick="document.getElementById('team-join-form').scrollIntoView()" class="px-6 py-3 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-sm font-bold text-white flex items-center gap-2">
                <i data-lucide="user-plus" size="16"></i>
                チームに参加
              </button>
            </div>
          </div>
        </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
          <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <i data-lucide="link" size="16"></i>
            招待コードを持っている場合
          </h3>
          <p class="text-xs text-[#8b949e] mb-4">招待コードを入力してチームに参加します。</p>
          <div class="flex gap-2">
            <input id="team-join-code" type="text" placeholder="KASTRIX-..." class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="teamJoin()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">参加</button>
          </div>
          <div id="team-pending-status" class="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mt-3" style="display:none;">
            <span class="text-xs text-amber-400 font-bold">参加申請中…</span>
            <button onclick="teamCancelJoin()" class="px-2 py-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">キャンセル</button>
          </div>
        </div>

        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
          <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <i data-lucide="settings" size="16"></i>
            チーム機能について
          </h3>
          <p class="text-xs text-[#8b949e]">チームに参加すると、メンバーのタスクをリアルタイムで同期できます。</p>
          <div class="mt-4 space-y-2 text-xs text-[#8b949e]">
            <div class="flex items-center gap-2">
              <i data-lucide="check" size="12" class="text-green-400"></i>
              <span>リアルタイム同期</span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="check" size="12" class="text-green-400"></i>
              <span>共同作業</span>
            </div>
            <div class="flex items-center gap-2">
              <i data-lucide="check" size="12" class="text-green-400"></i>
              <span>タスク共有</span>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // チーム参加時のダッシュボードUI
    const memberListHtml = members.map(m => {
      const roleLabel = { host: 'HOST', co_host: 'CO-HOST', member: 'MEMBER' }[m.role] || m.role;
      const avatarLetter = (m.display_name || m.endpoint_id).charAt(0).toUpperCase();
      return `
        <div class="flex items-center gap-3">
          <div class="avatar w-8 h-8 text-sm bg-gradient-to-br from-indigo-500 to-purple-600">${avatarLetter}</div>
          <div class="flex-1">
            <p class="text-sm font-medium text-white">${escapeHtml(m.display_name || 'Unknown')}</p>
            <p class="text-xs text-[#8b949e]">${roleLabel}</p>
          </div>
          <div class="status-online w-2 h-2 rounded-full bg-green-500"></div>
          <span class="px-2 py-1 text-xs font-bold rounded ${m.role === 'host' ? 'bg-amber-500 text-black' : 'bg-indigo-500 text-white'}">${roleLabel}</span>
        </div>
      `;
    }).join('');

    const inviteCodesHtml = inviteCodes.map((code) => {
      const expiresText = code.expires_at ? formatExpiresAt(code.expires_at) : '無期限';
      const isExpired = code.expires_at && formatExpiresAt(code.expires_at) === '期限切れ';
      const expiresClass = isExpired ? 'text-red-400' : 'text-[#8b949e]';
      const copyBtn = code.invite_string
        ? `<button type="button" onclick="teamCopyInviteLink(this)" data-invite="${escapeHtml(code.invite_string)}" class="px-2 py-1 text-[9px] font-bold text-indigo-400 hover:bg-indigo-500/10 rounded-lg">リンクをコピー</button>`
        : '';
      const revokeBtn = teamInfo?.amIHost
        ? `<button type="button" onclick="teamRevokeCode(this)" data-code="${escapeHtml(code.code)}" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">無効化</button>`
        : '';
      return `
      <div class="bg-[#0d1117] border border-[#30363d] rounded-xl p-3">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-xs font-mono text-indigo-400 truncate min-w-0">${escapeHtml(code.code)}</span>
          <span class="text-[9px] font-bold shrink-0 ${expiresClass}">${expiresText}</span>
        </div>
        <div class="flex items-center justify-end gap-1 flex-wrap">
          ${copyBtn}
          ${revokeBtn}
        </div>
      </div>
    `;
    }).join('');

    container.innerHTML = `
      <!-- Team Header -->
      <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 mb-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="avatar w-12 h-12 text-lg bg-gradient-to-br from-indigo-500 to-purple-600">T</div>
            <div>
              <div class="flex items-center gap-2">
                <h2 id="team-name-display" class="text-lg font-bold text-white">${escapeHtml(teamInfo?.name || 'My Team')}</h2>
                ${teamInfo?.amIHost ? `<button onclick="toggleTeamNameEdit()" class="text-[#8b949e] hover:text-white">
                  <i data-lucide="edit-2" size="16"></i>
                </button>` : ''}
              </div>
              <p class="text-sm text-[#8b949e]">${members.length}メンバー • ホスト: ${escapeHtml(teamInfo?.host || 'Unknown')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full">オンライン</span>
          </div>
        </div>

        <!-- チーム名編集フォーム（ホストのみ表示） -->
        <div id="team-name-edit-form" class="hidden mt-4 pt-4 border-t border-[#30363d]">
          <div class="flex gap-2">
            <input id="team-name-input" type="text" value="${escapeHtml(teamInfo?.name || 'My Team')}" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white outline-none focus:border-indigo-500" maxlength="50">
            <button onclick="saveTeamName()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">保存</button>
            <button onclick="cancelTeamNameEdit()" class="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white">キャンセル</button>
          </div>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        <!-- Members -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
          <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <i data-lucide="users" size="16"></i>
            メンバー (${members.length})
          </h3>
          <div class="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
            ${memberListHtml}
          </div>
        </div>

        <!-- Invite Codes -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
          <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <i data-lucide="link" size="16"></i>
            招待コード
          </h3>
          <div class="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
            ${inviteCodes.length > 0 ? inviteCodesHtml : '<p class="text-xs text-[#8b949e]">発行済みコードはありません</p>'}
            <button onclick="teamIssueInvite()" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 mt-3">
              <i data-lucide="plus" size="14"></i>
              新規コード発行
            </button>
          </div>
        </div>

        <!-- Settings -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
          <h3 class="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <i data-lucide="settings" size="16"></i>
            設定
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-white mb-2">同期モード</label>
              <select onchange="saveSyncMode(this.value)" class="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white">
                <option value="auto" ${syncMode !== 'manual' ? 'selected' : ''}>自動同期</option>
                <option value="manual" ${syncMode === 'manual' ? 'selected' : ''}>手動同期</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-white mb-2">自分の表示名</label>
              <input id="team-display-name-input" type="text" placeholder="表示名を入力" class="w-full bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white">
            </div>
            ${syncMode === SYNC_MODE_MANUAL || syncMode === 'manual' ? `
            <div class="pt-2 border-t border-[#30363d] space-y-2">
              <p class="text-xs text-[#8b949e]">手動同期: 未配信 <span class="text-amber-400 font-bold">${unsyncedCount}</span> 件</p>
              <button type="button" onclick="teamPushUnsynced()" class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2">
                <i data-lucide="upload" size="16"></i>
                Push して配信
              </button>
            </div>
            ` : ''}
            <button onclick="teamLeave()" class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-bold text-white">
              チームを抜ける
            </button>
          </div>
        </div>

      </div>

      <!-- 参加申請: HOST/CO-HOST 側は DB+メモリ。承認時は member_join gossip でゲスト含む全員が members を更新 -->
      ${pendingJoins.length > 0 && (myRole === 'host' || myRole === 'co_host') ? `
        <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 mt-6">
          <h3 class="text-sm font-bold text-white mb-4">参加申請 (${pendingJoins.length})</h3>
          <div class="space-y-3">
            ${pendingJoins.map(p => `
              <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="avatar w-8 h-8 text-sm bg-gradient-to-br from-blue-500 to-cyan-600">${(p.display_name || p.endpoint_id).charAt(0).toUpperCase()}</div>
                  <div>
                    <p class="text-sm font-medium text-white">${escapeHtml(p.display_name || 'Unknown')}</p>
                    <p class="text-xs text-[#8b949e]">申請日時: ${p.requested_at || 'Unknown'}</p>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button type="button" onclick="teamApproveJoin(this)" data-endpoint="${escapeHtml(p.endpoint_id)}" data-topic="${escapeHtml(p.topic_id)}" class="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs font-bold text-white">承認</button>
                  <button type="button" onclick="teamRejectJoin(this)" data-endpoint="${escapeHtml(p.endpoint_id)}" data-topic="${escapeHtml(p.topic_id)}" class="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs font-bold text-white">拒否</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Debug -->
      <div class="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 mt-6">
        <button onclick="toggleTeamDebug()" class="text-[10px] text-[#484f58] hover:text-[#8b949e] font-bold">デバッグ情報を表示</button>
        <div id="team-debug-panel" class="hidden mt-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-[10px] font-mono text-[#8b949e]">
          <div id="team-debug-content">...</div>
          <div class="mt-2 text-[8px] text-[#484f58]">最終更新: <span id="team-debug-updated">-</span></div>
        </div>
      </div>
    `;
  }

  lucide.createIcons();
  if (!isJoined) {
    // 未参加時はボタン状態更新
    const readyForButtons = _isTauri ? await apiTeamIsReady().catch(() => false) : false;
    updateTeamButtonsState(readyForButtons, false);
  } else {
    // 参加時は個別レンダリング（ダッシュボードに統合済み）
    renderTeamDisplayNameSection();
    renderTeamPendingStatus();
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
  }
}

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

async function copyInviteToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn('clipboard copy failed:', e);
    return false;
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
    const inviteStr = result?.invite_string ?? result?.inviteString;
    const code = result?.code;
    if (result && inviteStr) {
      const copied = await copyInviteToClipboard(inviteStr);
      await apiSetSetting('team_name', 'My Team').catch(() => {});
      showAlert(
        `チームを作成しました。\n招待コード: ${code}\n\n参加する人にこの招待リンクを共有してください${copied ? '（クリップボードにコピー済み）' : '（コピーに失敗しました。手動でコピーしてください）'}`,
        'success'
      );
      if (typeof window.renderTeamView === 'function') await window.renderTeamView();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    } else if (result && code) {
      const copied = await copyInviteToClipboard(code);
      await apiSetSetting('team_name', 'My Team').catch(() => {});
      showAlert(
        `チームを作成しました。\n招待コード: ${code}${copied ? '\n（クリップボードにコピーしました）' : '\n（コピーに失敗しました。手動でコピーしてください）'}`,
        'success'
      );
      if (typeof window.renderTeamView === 'function') await window.renderTeamView();
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
      const link = result.invite_string ?? result.inviteString;
      const toCopy = link || result.code;
      const copied = await copyInviteToClipboard(toCopy);
      const msg = link
        ? `招待リンクを発行しました。\n参加する人にこのリンクを共有してください${copied ? '（クリップボードにコピー済み）' : '（コピーに失敗しました。手動でコピーしてください）'}`
        : `招待コードを発行しました。\n${result.code}${copied ? '\n（クリップボードにコピーしました）' : '\n（コピーに失敗しました。手動でコピーしてください）'}`;
      showAlert(msg, 'success');
      if (typeof window.renderTeamView === 'function') await window.renderTeamView();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
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
    if (typeof showAlert === 'function') showAlert('参加を承認しました。', 'success');
    await renderTeamPendingJoins();
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    if (typeof renderInbox === 'function') await renderInbox();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function teamRejectJoin(btn) {
  if (!_isTauri || !btn?.dataset?.endpoint || !btn?.dataset?.topic) return;
  try {
    await apiTeamRejectJoin(btn.dataset.endpoint, btn.dataset.topic);
    if (typeof showAlert === 'function') showAlert('参加申請を拒否しました。', 'info');
    await renderTeamPendingJoins();
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    if (typeof renderInbox === 'function') await renderInbox();
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
  if (!confirm(`招待コード ${code} を無効化（削除）しますか？`)) return;
  try {
    await apiTeamRevokeInviteCode(code);
    if (typeof showAlert === 'function') showAlert('招待コードを無効化しました。', 'success');
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    await renderTeamInviteCodes();
    if (typeof renderSettings === 'function') renderSettings();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

let _teamDebugInterval = null;
function toggleTeamDebug() {
  const panel = document.getElementById('team-debug-panel');
  if (!panel) return;
  const wasHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (wasHidden) {
    refreshTeamDebug();
    _teamDebugInterval = setInterval(refreshTeamDebug, 2000);
  } else {
    if (_teamDebugInterval) clearInterval(_teamDebugInterval);
    _teamDebugInterval = null;
  }
}

async function refreshTeamDebug() {
  const content = document.getElementById('team-debug-content');
  const updated = document.getElementById('team-debug-updated');
  if (!content) return;
  if (!_isTauri) {
    content.innerHTML = '<span class="text-[#484f58]">Tauri 環境でのみ利用可能</span>';
    return;
  }
  try {
    const s = await apiTeamDebugStatus();
    if (!s) {
      content.innerHTML = '<span class="text-red-400">取得失敗</span>';
      return;
    }
    const ok = '<span class="text-emerald-400">OK</span>';
    const wait = '<span class="text-amber-400">待機中</span>';
    const fail = '<span class="text-red-400">失敗</span>';
    const step1 = s.step1_iroh_node === 'OK' ? ok : s.step1_iroh_node === '待機中' ? wait : fail;
    const step2 = s.step2_node_ticket === 'OK' ? ok : s.step2_node_ticket === '待機中' ? wait : fail;
    const err = s.step2_error ? '<br><span class="text-red-400 text-[9px]">' + s.step2_error + '</span>' : '';
    const ep = s.endpoint_id ? '<div class="text-[#484f58]">EndpointID: ' + s.endpoint_id.slice(0, 16) + '...</div>' : '';
    const subs = (s.team_subscriptions || []).map(x => 'topic=' + x.topic_id.slice(0, 8) + '... is_host=' + x.is_host).join(', ') || 'なし';
    const pending = s.am_i_pending ? '<span class="text-amber-400">true → 参加申請中表示</span>' : '<span class="text-emerald-400">false</span>';
    const apiPending = await apiTeamAmIPending();
    const apiPendingStr = apiPending ? '<span class="text-amber-400">true（← これで表示制御）</span>' : '<span class="text-emerald-400">false</span>';
    content.innerHTML = '<div>Step1: iroh ノード作成 → ' + step1 + '</div><div>Step2: アドレス発見 (node_ticket) → ' + step2 + err + '</div>' + ep +
      '<div class="mt-2 pt-2 border-t border-[#30363d]"><div class="text-[#484f58]">team_subscriptions: ' + subs + '</div><div class="text-[#484f58]">am_i_pending(debug): ' + pending + '</div><div class="text-[#484f58]">apiTeamAmIPending(): ' + apiPendingStr + '</div></div>';
    if (updated) updated.textContent = new Date().toLocaleTimeString('ja-JP');
  } catch (e) {
    content.innerHTML = '<span class="text-red-400">' + (e?.toString?.() || e) + '</span>';
  }
}

function updateTeamButtonsState(ready, failed) {
  const statusEl = document.getElementById('team-buttons-status');
  const createBtn = document.getElementById('btn-team-create');
  const inviteBtn = document.getElementById('btn-team-issue-invite');
  const expiresEl = document.getElementById('team-invite-expires');
  if (!statusEl || !createBtn || !inviteBtn) return;
  if (failed) {
    statusEl.innerHTML = '<span class="text-red-400">チーム機能は利用できません（ネットワーク接続をご確認ください）</span>';
    createBtn.disabled = true;
    inviteBtn.disabled = true;
    if (expiresEl) expiresEl.disabled = true;
    createBtn.className = 'h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 bg-[#21262d] opacity-60 cursor-not-allowed';
    inviteBtn.className = 'h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 bg-[#21262d] opacity-60 cursor-not-allowed border border-[#30363d]';
  } else if (ready) {
    statusEl.innerHTML = '';
    createBtn.disabled = false;
    inviteBtn.disabled = false;
    if (expiresEl) expiresEl.disabled = false;
    createBtn.className = 'h-8 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white flex items-center gap-2';
    inviteBtn.className = 'h-8 px-4 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white flex items-center gap-2';
  } else {
    statusEl.innerHTML = '<span class="text-amber-400">チーム機能を準備中...</span>';
    createBtn.disabled = true;
    inviteBtn.disabled = true;
    if (expiresEl) expiresEl.disabled = true;
    createBtn.className = 'h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 bg-[#21262d] opacity-60 cursor-not-allowed';
    inviteBtn.className = 'h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 bg-[#21262d] opacity-60 cursor-not-allowed border border-[#30363d]';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons?.();
}

/** サイドバー: 手動同期時の未配信バッジ + Push ボタンエリア */
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

/** 未配信 Operation を一括送信（サイドバー / Team 設定の Push から） */
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

window.teamPushUnsynced = teamPushUnsynced;

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

// チーム画面のリアルタイム更新は ui/js/main.js の refreshTeamUiFromBackend（Tauri イベント）に集約
