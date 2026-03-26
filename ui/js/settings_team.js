// ── Settings: Team ────────────────────────────────────────

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
    section.classList.remove('hidden');
    if (members.length === 0) {
      list.innerHTML =
        '<p class="text-xs text-[#484f58] py-2">まだメンバーはいません。チームに参加するとここに表示されます。</p>';
      return;
    }
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
    section.classList.remove('hidden');
    list.innerHTML = '<p class="text-xs text-red-400">メンバー一覧の取得に失敗しました。</p>';
  }
}

async function renderTeamPendingStatus() {
  if (!_isTauri) return;
  const form = document.getElementById('team-join-form');
  const status = document.getElementById('team-pending-status');
  if (!form || !status) return;
  try {
    const pending = await apiTeamAmIPending();
    if (pending) {
      form.classList.add('hidden');
      status.classList.remove('hidden');
    } else {
      form.classList.remove('hidden');
      status.classList.add('hidden');
    }
  } catch (e) {
    form.classList.remove('hidden');
    status.classList.add('hidden');
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
      if (typeof renderTeamPage === 'function') await renderTeamPage();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    } else if (result && result.code) {
      await navigator.clipboard.writeText(result.code);
      showAlert(`チームを作成しました。\n招待コード: ${result.code}\n（クリップボードにコピーしました）`, 'success');
      await renderTeamInviteCodes();
      if (typeof renderTeamPage === 'function') await renderTeamPage();
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
      if (typeof renderTeamPage === 'function') await renderTeamPage();
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
    await renderTeamMembers();
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
    if (typeof renderTeamPage === 'function') await renderTeamPage();
  } catch (e) {
    showAlert('エラー: ' + (e?.toString?.() || e), 'error');
  }
}

async function fillTeamPageRoomSummary() {
  const wrap = document.getElementById('team-page-room-summary');
  if (!wrap || !_isTauri) return;
  try {
    const room = await apiTeamGetCurrentRoom();
    const name = room.room_name || room.roomName || '未参加';
    const st = room.status || '—';
    wrap.innerHTML = `
      <p class="text-[9px] font-bold uppercase tracking-wider text-[#484f58]">ルーム</p>
      <p class="text-xs font-bold text-white mt-0.5 truncate max-w-[14rem] sm:max-w-[16rem]">${escapeHtml(String(name))}</p>
      <p class="text-[10px] text-[#8b949e] mt-0.5">${escapeHtml(String(st))}</p>
    `;
  } catch (e) {
    wrap.innerHTML = `
      <p class="text-[9px] font-bold uppercase tracking-wider text-[#484f58]">ルーム</p>
      <p class="text-xs text-[#484f58] mt-0.5">状態を取得できませんでした</p>
    `;
  }
}

/** チーム専用ページ（サイドバー「チーム」）の描画。設定からチーム UI はここへ集約。 */
async function renderTeamPage() {
  const container = document.getElementById('team-page-content');
  if (!container) return;
  if (!_isTauri) {
    container.innerHTML =
      '<p class="text-[#8b949e] text-sm">チーム機能はデスクトップアプリ（Tauri）でのみ利用できます。</p>';
    return;
  }

  container.innerHTML = '<p class="text-[#8b949e] text-xs">読み込み中...</p>';

  let syncMode = SYNC_MODE_AUTO;
  let teamReady = false;
  try {
    const loadPromise = Promise.all([apiTeamGetSyncMode(), apiTeamIsReady()]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('タイムアウト（10秒）')), SETTINGS_LOAD_TIMEOUT_MS)
    );
    [syncMode, teamReady] = await Promise.race([loadPromise, timeoutPromise]);
  } catch (e) {
    console.error('renderTeamPage load failed:', e);
    container.innerHTML =
      '<p class="text-red-400 text-xs p-4">読み込みに失敗しました。' +
      (e?.message || String(e)) +
      '</p><button onclick="renderTeamPage()" class="mt-2 px-3 py-1 bg-[#21262d] rounded text-xs text-white">再試行</button>';
    return;
  }

  container.innerHTML = `
    <div class="max-w-3xl mx-auto space-y-5 pb-8">
      <!-- メンバー確認をページのベース -->
      <section class="bg-[#161b22] border border-indigo-500/25 rounded-2xl p-5 sm:p-7 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-5">
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-white tracking-tight">メンバー</h2>
            <p class="text-[11px] text-[#8b949e] mt-1.5 leading-relaxed">いま参加しているメンバーとロールです。ホスト・CO-HOST は承認・キックなどの操作ができます。</p>
          </div>
          <div id="team-page-room-summary" class="shrink-0 rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-2.5 sm:text-right min-w-[9rem]">
            <p class="text-[9px] font-bold uppercase tracking-wider text-[#484f58]">ルーム</p>
            <p class="text-xs font-bold text-white mt-0.5 truncate max-w-[14rem] sm:max-w-[16rem]">読み込み中…</p>
            <p class="text-[10px] text-[#8b949e] mt-0.5">—</p>
          </div>
        </div>
        <div id="team-members-section" class="rounded-xl border border-[#30363d] bg-[#010409] p-3 sm:p-4 min-h-[4.5rem]">
          <div id="team-members-list" class="space-y-2"></div>
        </div>
      </section>

      <!-- 招待・参加（運用） -->
      <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
        <h2 class="text-sm font-bold text-white mb-1">招待・参加</h2>
        <p class="text-[10px] text-[#8b949e] mb-4">チームの作成、招待コードの発行、他メンバーの承認、参加リクエストまでをまとめて扱います。</p>
        <div>
          <div id="team-buttons-status" class="text-[10px] text-[#8b949e] mb-2 min-h-[14px]">${teamReady ? '' : '<span class="text-amber-400">チーム機能を準備中...</span>'}</div>
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <select id="team-invite-expires" class="h-8 px-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white outline-none focus:border-indigo-500" ${!teamReady ? 'disabled' : ''}>
              <option value="15">15分</option>
              <option value="60" selected>1時間</option>
              <option value="1440">24時間</option>
              <option value="0">無期限</option>
            </select>
            <button id="btn-team-create" onclick="teamCreate()" class="h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${teamReady ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-[#21262d] opacity-60 cursor-not-allowed'}" ${!teamReady ? 'disabled' : ''}>
              <i data-lucide="users" size="14"></i>
              チームを作成
            </button>
            <button id="btn-team-issue-invite" onclick="teamIssueInvite()" class="h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${teamReady ? 'bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]' : 'bg-[#21262d] opacity-60 cursor-not-allowed border border-[#30363d]'}" ${!teamReady ? 'disabled' : ''}>
              <i data-lucide="link" size="14"></i>
              招待コードを発行
            </button>
          </div>
        </div>

        <div id="team-invite-codes-section" class="hidden mt-4 pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">発行済みコード</h3>
          <div id="team-invite-codes-list" class="space-y-2"></div>
        </div>

        <div id="team-pending-joins-section" class="hidden mt-4 pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">参加申請（承認待ち）</h3>
          <p class="text-[10px] text-[#8b949e] mb-2">ホスト・CO-HOST が承認または拒否できます。</p>
          <div id="team-pending-joins-list" class="space-y-2"></div>
        </div>

        <div id="team-blocked-section" class="hidden mt-4 pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">ブロック済み（HOST のみ）</h3>
          <div id="team-blocked-list" class="space-y-2"></div>
        </div>

        <div class="mt-4 pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">コード・リンクで参加</h3>
          <p class="text-[10px] text-[#8b949e] mb-2">ホストから共有された招待を貼り付けてください。</p>
          <div id="team-join-form" class="flex flex-col sm:flex-row gap-2">
            <input id="team-join-code" type="text" placeholder="招待リンクまたはコード" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white placeholder-[#484f58] font-mono">
            <button onclick="teamJoin()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shrink-0">参加する</button>
          </div>
          <div id="team-pending-status" class="hidden mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <span class="text-xs text-amber-200">参加申請中です。ホストの承認をお待ちください。</span>
            <button onclick="teamCancelJoin()" class="px-3 py-1 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20 rounded-lg shrink-0">申請をキャンセル</button>
          </div>
        </div>
      </section>

      <!-- 設定系を1カードに集約 -->
      <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
        <h2 class="text-sm font-bold text-white mb-1">チーム設定</h2>
        <p class="text-[10px] text-[#8b949e] mb-5">この端末だけに保存されるオプションです。</p>

        <div class="space-y-5">
          <div>
            <h3 class="text-[10px] font-bold text-[#484f58] uppercase tracking-wider mb-2">同期モード</h3>
            <p class="text-[10px] text-[#8b949e] mb-2">タスクの変更をチームに送るタイミング</p>
            <div class="flex flex-col sm:flex-row sm:gap-6 gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sync-mode" value="${SYNC_MODE_AUTO}" class="accent-indigo-500" ${(syncMode || SYNC_MODE_AUTO) === SYNC_MODE_AUTO ? 'checked' : ''} onchange="saveSyncMode(this.value)">
                <span class="text-xs">自動同期（デフォルト）</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sync-mode" value="${SYNC_MODE_MANUAL}" class="accent-indigo-500" ${syncMode === SYNC_MODE_MANUAL ? 'checked' : ''} onchange="saveSyncMode(this.value)">
                <span class="text-xs">手動同期</span>
              </label>
            </div>
            <p class="text-[9px] text-[#484f58] mt-2">手動のときはサイドバーに未配信数が出ます。Push で一括送信します。</p>
          </div>

          <div class="pt-5 border-t border-[#30363d]">
            <h3 class="text-[10px] font-bold text-[#484f58] uppercase tracking-wider mb-2">自分の表示名</h3>
            <p class="text-[10px] text-[#8b949e] mb-2">メンバー一覧に出る名前（64文字以内）</p>
            <div id="team-display-name-section" class="hidden">
              <div class="flex flex-col sm:flex-row gap-2">
                <input id="team-display-name-input" type="text" placeholder="表示名を入力" maxlength="64" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white placeholder-[#484f58]">
                <button onclick="teamSaveDisplayName()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shrink-0">保存</button>
              </div>
            </div>
          </div>

          <div class="pt-5 border-t border-[#30363d]">
            <h3 class="text-[10px] font-bold text-[#484f58] uppercase tracking-wider mb-2">デバッグ</h3>
            <p class="text-[10px] text-[#8b949e] mb-2">接続・ノードの状態を確認します（開発・トラブル時用）</p>
            <button type="button" id="team-debug-toggle" onclick="toggleTeamDebug()" class="flex items-center gap-2 text-[10px] font-bold text-[#8b949e] hover:text-white uppercase tracking-wider">
              <i data-lucide="bug" size="12"></i>
              詳細を表示
            </button>
            <div id="team-debug-panel" class="hidden mt-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl font-mono text-[10px]">
              <div id="team-debug-content" class="space-y-1 text-[#8b949e]">読み込み中...</div>
              <div class="mt-2 flex gap-2">
                <button onclick="refreshTeamDebug()" class="px-2 py-1 bg-[#21262d] hover:bg-[#30363d] rounded text-[10px] text-white">更新</button>
                <span id="team-debug-updated" class="text-[#484f58]"></span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  try {
    await fillTeamPageRoomSummary();
    await renderTeamMembers();
    await renderTeamInviteCodes();
    await renderTeamDisplayNameSection();
    await renderTeamPendingJoins();
    await renderTeamBlocked();
    await renderTeamPendingStatus();
    if (teamReady) {
      updateTeamButtonsState(true, false);
    } else {
      try {
        const ready = await apiTeamIsReady();
        updateTeamButtonsState(ready, false);
      } catch (_) {
        updateTeamButtonsState(false, true);
      }
    }
  } catch (e) {
    console.error('renderTeamPage post-load failed:', e);
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
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

if (_isTauri && window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen('team-pending-join', () => {
    if (typeof renderTeamPendingJoins === 'function') renderTeamPendingJoins();
  });
  window.__TAURI__.event.listen('team-iroh-ready', (e) => {
    updateTeamButtonsState(e.payload === true, e.payload === false);
  });
}
