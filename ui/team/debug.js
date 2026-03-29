// ── Team: Debug Module ────────────────────────────────────────
// チームデバッグ機能

let _teamDebugInterval = null;

/**
 * デバッグパネルの表示を切り替え
 */
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

/**
 * デバッグ情報を更新
 */
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

/**
 * チームボタン状態更新
 */
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

// Expose globally
window.toggleTeamDebug = toggleTeamDebug;
window.refreshTeamDebug = refreshTeamDebug;
window.updateTeamButtonsState = updateTeamButtonsState;