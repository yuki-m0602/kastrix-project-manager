// ── Team: Invites Module ────────────────────────────────────────
// 招待コード管理機能

/**
 * チーム招待コードの一覧を表示
 */
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

/**
 * クリップボードにコピー
 */
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

/**
 * チームを作成
 */
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

/**
 * 新規招待コードを発行
 */
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

/**
 * チームに参加
 */
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

/**
 * 参加申請をキャンセル
 */
async function teamCancelJoin() {
  if (!_isTauri) return;
  if (!(await confirmAsync('参加申請をキャンセルしますか？'))) return;
  try {
    await apiTeamCancelJoin();
    await renderTeamPendingStatus();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    showAlert('参加申請をキャンセルしました。', 'success');
  } catch (e) {
    showAlert('キャンセルに失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * 参加を承認
 */
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

/**
 * 参加を拒否
 */
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

/**
 * 招待リンクをコピー
 */
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

/**
 * 招待コードを無効化
 */
async function teamRevokeCode(btn) {
  if (!_isTauri || !btn?.dataset?.code) return;
  const code = btn.dataset.code;
  if (!(await confirmAsync(`招待コード ${code} を無効化（削除）しますか？`))) return;
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

/**
 * 参加申請.pending_join一覧を表示
 */
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

const TEAM_PENDING_APPROVAL_POLL_MS = 5000;

function clearTeamPendingApprovalPoll() {
  if (window._teamPendingApprovalPollId) {
    clearInterval(window._teamPendingApprovalPollId);
    window._teamPendingApprovalPollId = null;
  }
}

/**
 * ゲスト: 承認同期（member_join）が届いたかを再確認し、届いていればチーム画面へ
 */
/**
 * ホスト承認済みなのに member_join が届かないとき、ローカル DB だけ参加済みにする（要確認）
 */
async function teamGuestApplyLocalMembershipIfPending() {
  if (!_isTauri) return;
  if (
    !(await confirmAsync(
      'ホストで「承認」済みであることを確認してください。未承認のまま実行すると、表示だけ参加済みになり同期が不整合になることがあります。続行しますか？'
    ))
  ) {
    return;
  }
  try {
    await apiTeamGuestApplyLocalMembershipIfPending();
    clearTeamPendingApprovalPoll();
    if (typeof showAlert === 'function') {
      showAlert('参加状態をこの端末に反映しました。', 'success');
    }
    if (typeof refreshTeamUiFromBackend === 'function') await refreshTeamUiFromBackend();
    else if (typeof window.renderTeamView === 'function') await window.renderTeamView();
  } catch (e) {
    if (typeof showAlert === 'function') {
      showAlert('反映に失敗しました: ' + (e?.toString?.() || e), 'error');
    }
  }
}

async function teamRefreshJoinStatus() {
  if (!_isTauri) return;
  try {
    await apiTeamRepairOrphanIfNeeded().catch(() => false);
    await apiTeamRequestMemberSync().catch(() => false);
    const active = await apiTeamIsActiveMember();
    if (active) {
      clearTeamPendingApprovalPoll();
      if (typeof showAlert === 'function') {
        showAlert('チームへの参加が承認され、同期されました。', 'success');
      }
      if (typeof refreshTeamUiFromBackend === 'function') await refreshTeamUiFromBackend();
      else if (typeof window.renderTeamView === 'function') await window.renderTeamView();
      return;
    }
    if (typeof showAlert === 'function') {
      showAlert(
        'この端末にはまだ承認の同期が届いていません。ホスト承認直後は数十秒かかることがあります。しばらく待ってから「状態を更新」を再度お試しください。',
        'info'
      );
    }
    if (typeof refreshTeamUnjoinedFlowStatus === 'function') await refreshTeamUnjoinedFlowStatus();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert('更新に失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * 参加申請.statusを表示（承認待ちのあいだはポーリングで member_join 受信後に自動でダッシュボードへ）
 */
async function renderTeamPendingStatus() {
  if (!_isTauri) return;
  clearTeamPendingApprovalPoll();
  const form = document.getElementById('team-join-form');
  const status = document.getElementById('team-pending-status');
  if (!form || !status) return;
  try {
    const pending = await apiTeamAmIPending();
    if (!pending) {
      form.style.display = '';
      status.style.display = 'none';
      if (typeof refreshTeamUnjoinedFlowStatus === 'function') await refreshTeamUnjoinedFlowStatus();
      return;
    }
    form.style.display = 'none';
    status.style.display = 'flex';
    window._teamPendingApprovalPollId = setInterval(async () => {
      try {
        await apiTeamRequestMemberSync().catch(() => false);
        const active = await apiTeamIsActiveMember();
        if (!active) return;
        clearTeamPendingApprovalPoll();
        if (typeof showAlert === 'function') {
          showAlert('チームへの参加が承認され、同期されました。', 'success');
        }
        if (typeof refreshTeamUiFromBackend === 'function') await refreshTeamUiFromBackend();
        else if (typeof window.renderTeamView === 'function') await window.renderTeamView();
      } catch (_) {
        /* ignore */
      }
    }, TEAM_PENDING_APPROVAL_POLL_MS);
    if (typeof refreshTeamUnjoinedFlowStatus === 'function') await refreshTeamUnjoinedFlowStatus();
  } catch (e) {
    form.style.display = '';
    status.style.display = 'none';
    if (typeof refreshTeamUnjoinedFlowStatus === 'function') await refreshTeamUnjoinedFlowStatus();
  }
}

/**
 * 有効期限をフォーマット
 */
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

// Expose globally for HTML onclick
window.renderTeamInviteCodes = renderTeamInviteCodes;
window.teamCreate = teamCreate;
window.teamIssueInvite = teamIssueInvite;
window.teamJoin = teamJoin;
window.teamCancelJoin = teamCancelJoin;
window.teamApproveJoin = teamApproveJoin;
window.teamRejectJoin = teamRejectJoin;
window.teamCopyInviteLink = teamCopyInviteLink;
window.teamRevokeCode = teamRevokeCode;
window.renderTeamPendingJoins = renderTeamPendingJoins;
window.renderTeamPendingStatus = renderTeamPendingStatus;
window.teamRefreshJoinStatus = teamRefreshJoinStatus;
window.teamGuestApplyLocalMembershipIfPending = teamGuestApplyLocalMembershipIfPending;
window.formatExpiresAt = formatExpiresAt;