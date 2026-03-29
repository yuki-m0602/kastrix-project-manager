// ── Team: View Module ────────────────────────────────────────
// チーム画面メイン表示

/**
 * チーム画面を表示
 */
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
          <div id="team-join-form" class="flex gap-2">
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
    const canKick = myRole === 'host' || myRole === 'co_host';
    const memberListHtml = members.map((m) => {
      const roleLabel = { host: 'HOST', co_host: 'CO-HOST', member: 'MEMBER' }[m.role] || m.role;
      const avatarLetter = (m.display_name || m.endpoint_id).charAt(0).toUpperCase();
      const ep = escapeHtml(m.endpoint_id);
      let actions = '';
      if (m.role !== 'host') {
        if (teamInfo?.amIHost && m.role === 'member') {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamPromoteToCoHost(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">CO-HOSTに昇格</button>`;
        }
        if (canKick) {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamKick(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">キック</button>`;
        }
        if (teamInfo?.amIHost) {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamBlock(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">ブロック</button>`;
        }
      }
      return `
        <div class="flex flex-col gap-2 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center gap-3 min-w-0">
            <div class="avatar w-8 h-8 text-sm bg-gradient-to-br from-indigo-500 to-purple-600 shrink-0">${avatarLetter}</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-white truncate" title="${ep}">${escapeHtml(m.display_name || 'Unknown')}</p>
              <p class="text-xs text-[#8b949e]">${roleLabel}</p>
            </div>
            <span class="px-2 py-1 text-[9px] font-bold rounded shrink-0 ${m.role === 'host' ? 'bg-amber-500 text-black' : 'bg-indigo-500 text-white'}">${roleLabel}</span>
          </div>
          ${actions ? `<div class="flex flex-wrap items-center gap-1 justify-end">${actions}</div>` : ''}
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
            <button type="button" onclick="saveTeamName()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">確定</button>
            <button type="button" onclick="cancelTeamNameEdit()" class="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white">キャンセル</button>
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
            <div id="team-display-name-section" class="hidden">
              <label class="block text-sm font-medium text-white mb-2">自分の表示名</label>
              <div class="flex gap-2 flex-wrap items-stretch sm:items-center">
                <input id="team-display-name-input" type="text" placeholder="表示名を入力" maxlength="64" class="flex-1 min-w-[8rem] bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-sm text-white outline-none focus:border-indigo-500">
                <button type="button" onclick="teamSaveDisplayName()" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shrink-0">確定</button>
                <button type="button" onclick="cancelTeamDisplayNameEdit()" class="px-3 py-2 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white shrink-0">キャンセル</button>
              </div>
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
              チームを抜く
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
    // 未参加時はボタン状態更新 + 参加申請中バナー（team_am_i_pending）
    const readyForButtons = _isTauri ? await apiTeamIsReady().catch(() => false) : false;
    updateTeamButtonsState(readyForButtons, false);
    await renderTeamPendingStatus();
  } else {
    // 参加時は個別レンダリング（ダッシュボードに統合済み）
    renderTeamDisplayNameSection();
    renderTeamPendingStatus();
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
  }
}

// Expose globally
window.renderTeamView = renderTeamView;