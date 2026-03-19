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
