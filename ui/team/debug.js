// ── Team: 開発者向けデバッグ（状態一覧・イベントログ・よく使う操作）────────

let _teamDebugInterval = null;
let _teamDevUnlisteners = [];
const TEAM_DEV_EVENT_LOG_MAX = 120;

const TEAM_DEV_DEBUG_EVENT_NAMES = [
  'team-task-updated',
  'team-unsynced-updated',
  'team-subscriptions-restored',
  'team-blocked',
  'team-members-updated',
  'team-member-join-broadcast-failed',
  'team-pending-join-cancelled',
  'team-pending-join',
  'team-cancelled',
  'team-disbanded',
  'team-left',
  'team-iroh-ready',
  'team-update-required',
  'team-sync-check-needed',
  'team-conflict',
];

/**
 * チーム画面に埋め込む開発者向けブロック（未参加／参加済みで共通）
 */
function getTeamDevDebugSectionHtml() {
  return `
      <div class="bg-[#161b22] border border-amber-500/25 rounded-2xl p-6 mt-6">
        <h3 class="text-xs font-bold text-amber-400/90 mb-1">開発者向けチームデバッグ</h3>
        <p class="text-[10px] text-[#484f58] mb-2">未参加画面では「参加ステータス」と併用。iroh・DB・イベント。イベントログはパネル表示中のみ追記。</p>
        <button type="button" onclick="toggleTeamDebug()" class="text-[10px] text-[#8b949e] hover:text-amber-400 font-bold">デバッグパネルを開く / 閉じる</button>
        <div id="team-debug-panel" class="hidden mt-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-[10px] font-mono text-[#8b949e] space-y-3">
          <div id="team-debug-content">読み込み中...</div>
          <div class="border-t border-[#30363d] pt-2">
            <div class="text-[9px] text-[#484f58] mb-1">チーム系イベント</div>
            <pre id="team-dev-event-log" class="max-h-40 overflow-y-auto custom-scrollbar text-[9px] leading-snug whitespace-pre-wrap break-all text-[#6e7681] bg-[#010409] rounded-lg p-2 border border-[#21262d]">（パネルを開くと記録開始）</pre>
            <button type="button" onclick="teamDevClearEventLog()" class="mt-1 text-[9px] text-[#8b949e] hover:text-white">ログを消去</button>
          </div>
          <div class="flex flex-wrap gap-1.5 border-t border-[#30363d] pt-2">
            <button type="button" onclick="teamDevRefresh()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-[#21262d] border border-[#30363d] text-white hover:bg-[#30363d]">再取得</button>
            <button type="button" onclick="teamDevRequestSync()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-[#21262d] border border-[#30363d] text-amber-300 hover:bg-amber-500/10">member_sync</button>
            <button type="button" onclick="teamDevApplyLocal()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-[#21262d] border border-[#30363d] text-emerald-300 hover:bg-emerald-500/10">apply_local</button>
            <button type="button" onclick="teamDevRepair()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-[#21262d] border border-[#30363d] text-cyan-300 hover:bg-cyan-500/10">repair_orphan</button>
            <button type="button" onclick="teamDevCancelJoin()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-[#21262d] border border-[#30363d] text-orange-300 hover:bg-orange-500/10">cancel_join</button>
            <button type="button" onclick="teamDevLeave()" class="px-2 py-1 text-[9px] font-bold rounded-lg bg-red-900/40 border border-red-500/40 text-red-300 hover:bg-red-500/20">leave</button>
          </div>
          <div class="text-[8px] text-[#484f58]">最終更新: <span id="team-debug-updated">-</span></div>
        </div>
      </div>`;
}

function teamDevAppendEventLog(line) {
  const el = document.getElementById('team-dev-event-log');
  if (!el) return;
  const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  const raw = el.textContent || '';
  const skip =
    raw === '（パネルを開くと記録開始）' || raw === '（記録中）' || raw === '（消去済み）';
  const next = (skip ? '' : raw + '\n') + '[' + ts + '] ' + line;
  const lines = next.split('\n');
  const trimmed = lines.length > TEAM_DEV_EVENT_LOG_MAX ? lines.slice(-TEAM_DEV_EVENT_LOG_MAX).join('\n') : next;
  el.textContent = trimmed;
  el.scrollTop = el.scrollHeight;
}

function teamDevClearEventLog() {
  const el = document.getElementById('team-dev-event-log');
  if (el) el.textContent = '（消去済み）';
}

async function _startTeamDevEventLog() {
  _stopTeamDevEventLog();
  if (!_isTauri || !window.__TAURI__?.event?.listen) return;
  const { listen } = window.__TAURI__.event;
  for (let i = 0; i < TEAM_DEV_DEBUG_EVENT_NAMES.length; i++) {
    const name = TEAM_DEV_DEBUG_EVENT_NAMES[i];
    try {
      const un = await listen(name, (e) => {
        let payload = '';
        try {
          const p = e?.payload;
          if (p !== undefined && p !== null) {
            payload = typeof p === 'object' ? JSON.stringify(p).slice(0, 200) : String(p).slice(0, 200);
          }
        } catch (_) {
          payload = '(payload)';
        }
        teamDevAppendEventLog(name + (payload ? ' ' + payload : ''));
      });
      _teamDevUnlisteners.push(un);
    } catch (err) {
      console.warn('team dev listen failed:', name, err);
    }
  }
}

function _stopTeamDevEventLog() {
  _teamDevUnlisteners.forEach((u) => {
    try {
      if (typeof u === 'function') u();
    } catch (_) {}
  });
  _teamDevUnlisteners = [];
}

/**
 * チーム未参加ページ用: 招待入力〜承認の段階を日本語で表示
 */
async function refreshTeamUnjoinedFlowStatus() {
  const body = document.getElementById('team-unjoined-flow-status-body');
  if (!body) return;
  if (!_isTauri) {
    body.innerHTML =
      '<p class="text-[#484f58]">Tauri で起動すると、参加申請の送信状況・承認待ちがここに表示されます。</p>';
    return;
  }
  try {
    const [pending, inTeam, active, ready] = await Promise.all([
      apiTeamAmIPending(),
      apiTeamIsInTeam(),
      apiTeamIsActiveMember(),
      apiTeamIsReady(),
    ]);
    if (active) {
      body.innerHTML =
        '<p class="text-emerald-400 font-bold">承認済み（メンバーとして登録済み）</p>' +
        '<p class="text-[11px] text-[#8b949e] mt-1">通常はこのあとチームダッシュボードに切り替わります。切り替わらない場合はページを再表示するか、下の「状態を更新」を試してください。</p>';
      return;
    }
    if (pending) {
      body.innerHTML =
        '<p class="text-amber-400 font-bold">参加申請を送信済み（ホストの承認待ち）</p>' +
        '<p class="text-[11px] text-[#8b949e] mt-1">招待コードは受け取り、<span class="text-[#c9d1d9]">参加申請</span>まで完了しています。ホストが承認すると <span class="text-[#c9d1d9]">member_join</span> が届き、自動で参加済み画面に切り替わります（数十秒かかることがあります）。</p>' +
        '<p class="text-[10px] text-[#484f58] mt-2">承認されたのに変わらない → 「状態を更新」または開発者向けの <span class="text-[#8b949e]">member_sync</span> / <span class="text-[#8b949e]">apply_local</span></p>';
      return;
    }
    if (inTeam) {
      body.innerHTML =
        '<p class="text-cyan-400 font-bold">チーム購読はあるが、メンバー未登録の可能性</p>' +
        '<p class="text-[11px] text-[#8b949e] mt-1">不整合のときは下の「開発者向けチームデバッグ」で <span class="text-[#c9d1d9]">repair_orphan</span> を試すか、招待からやり直してください。</p>';
      return;
    }
    body.innerHTML =
      '<p class="text-[#c9d1d9] font-bold">未参加</p>' +
      '<p class="text-[11px] text-[#8b949e] mt-1">招待コードを入力して「参加」を押すと、ホストへ参加申請が送られます。</p>' +
      '<p class="text-[10px] text-[#484f58] mt-2">iroh: ' +
      (ready ? '<span class="text-emerald-400">準備OK</span>' : '<span class="text-amber-400">準備中（しばらく待ってから再度お試しください）</span>') +
      '</p>';
  } catch (e) {
    body.innerHTML = '<p class="text-red-400">' + escapeHtml(String(e)) + '</p>';
  }
}

function toggleTeamDebug() {
  const panel = document.getElementById('team-debug-panel');
  if (!panel) return;
  const wasHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (wasHidden) {
    refreshTeamDebug();
    _teamDebugInterval = setInterval(refreshTeamDebug, 3000);
    teamDevClearEventLog();
    const logEl = document.getElementById('team-dev-event-log');
    if (logEl) logEl.textContent = '（記録中）';
    _startTeamDevEventLog();
  } else {
    if (_teamDebugInterval) clearInterval(_teamDebugInterval);
    _teamDebugInterval = null;
    _stopTeamDevEventLog();
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
    const wait = '<span class="text-amber-400">待機</span>';
    const fail = '<span class="text-red-400">失敗</span>';
    const step1 = s.step1_iroh_node === 'OK' ? ok : s.step1_iroh_node === '待機中' ? wait : fail;
    const step2 = s.step2_node_ticket === 'OK' ? ok : s.step2_node_ticket === '待機中' ? wait : fail;
    const err = s.step2_error ? '<br><span class="text-red-400 text-[9px]">' + escapeHtml(String(s.step2_error)) + '</span>' : '';
    const epFull = s.endpoint_id ? String(s.endpoint_id) : '';
    const ep =
      epFull
        ? '<div class="text-[#8b949e] mt-1">EndpointID <button type="button" class="text-indigo-400 hover:underline" onclick="teamDevCopyEndpoint()">コピー</button></div><div class="text-[9px] text-[#6e7681] break-all">' +
          escapeHtml(epFull) +
          '</div>'
        : '';

    const subs =
      (s.team_subscriptions || [])
        .map(function (x) {
          return 'topic=' + escapeHtml(String(x.topic_id || '').slice(0, 12)) + '… is_host=' + x.is_host;
        })
        .join(' | ') || 'なし';

    const pendingDbg = s.am_i_pending ? '<span class="text-amber-400">true</span>' : '<span class="text-emerald-400">false</span>';
    const apiPending = await apiTeamAmIPending();
    const apiPendingStr = apiPending ? '<span class="text-amber-400">true</span>' : '<span class="text-emerald-400">false</span>';

    let roomLine = '';
    let flagsLine = '';
    try {
      const room = await apiTeamGetCurrentRoom();
      const rname = room && (room.room_name ?? room.roomName) != null ? room.room_name ?? room.roomName : '';
      const st = room && (room.status ?? '') !== '' ? room.status : '';
      roomLine =
        '<div class="mt-2 pt-2 border-t border-[#30363d] text-[#8b949e]">room: ' +
        escapeHtml(String(rname)) +
        ' / status: ' +
        escapeHtml(String(st)) +
        '</div>';
    } catch (e) {
      roomLine = '<div class="text-red-400 text-[9px]">team_get_current_room: ' + escapeHtml(String(e)) + '</div>';
    }

    try {
      const [inTeam, active, unsynced, syncMode, amHost] = await Promise.all([
        apiTeamIsInTeam(),
        apiTeamIsActiveMember(),
        apiTeamGetUnsyncedCount(),
        apiTeamGetSyncMode(),
        apiTeamAmIHost(),
      ]);
      flagsLine =
        '<div class="mt-1 space-y-0.5 text-[#8b949e]">' +
        '<div>in_team: ' +
        (inTeam ? 'true' : 'false') +
        ' | active_member: ' +
        (active ? 'true' : 'false') +
        ' | am_i_host: ' +
        (amHost ? 'true' : 'false') +
        '</div>' +
        '<div>sync_mode: ' +
        escapeHtml(String(syncMode || '')) +
        ' | unsynced_task_ops: ' +
        String(unsynced ?? 0) +
        '</div></div>';
    } catch (e2) {
      flagsLine = '<div class="text-red-400 text-[9px]">' + escapeHtml(String(e2)) + '</div>';
    }

    content.innerHTML =
      '<div class="space-y-1">' +
      '<div>① iroh ノード → ' +
      step1 +
      '</div>' +
      '<div>② node_ticket → ' +
      step2 +
      err +
      '</div>' +
      ep +
      '<div class="mt-2 pt-2 border-t border-[#30363d]"><span class="text-[#6e7681]">subscriptions:</span> ' +
      subs +
      '</div>' +
      '<div><span class="text-[#6e7681]">am_i_pending (debug/api):</span> ' +
      pendingDbg +
      ' / ' +
      apiPendingStr +
      '</div>' +
      roomLine +
      flagsLine +
      '</div>';

    if (updated) updated.textContent = new Date().toLocaleTimeString('ja-JP');
    if (epFull) window._teamDevEndpointFull = epFull;
    if (document.getElementById('team-unjoined-flow-status-body') && typeof refreshTeamUnjoinedFlowStatus === 'function') {
      await refreshTeamUnjoinedFlowStatus();
    }
  } catch (e) {
    content.innerHTML = '<span class="text-red-400">' + escapeHtml(e?.toString?.() || String(e)) + '</span>';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function teamDevCopyEndpoint() {
  const t = window._teamDevEndpointFull || '';
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    if (typeof showAlert === 'function') showAlert('EndpointID をコピーしました', 'success');
  } catch (_) {
    if (typeof showAlert === 'function') showAlert('コピーに失敗しました', 'error');
  }
}

async function teamDevRefresh() {
  await refreshTeamDebug();
  if (typeof refreshTeamUnjoinedFlowStatus === 'function') await refreshTeamUnjoinedFlowStatus();
}

async function teamDevRequestSync() {
  if (!_isTauri) return;
  try {
    const r = await apiTeamRequestMemberSync();
    if (typeof showAlert === 'function') showAlert('team_request_member_sync: ' + String(r), 'info');
    await refreshTeamDebug();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert(String(e), 'error');
  }
}

async function teamDevApplyLocal() {
  if (!_isTauri) return;
  try {
    await apiTeamGuestApplyLocalMembershipIfPending();
    if (typeof renderTeamView === 'function') await renderTeamView();
    if (typeof showAlert === 'function') showAlert('apply_local 実行済み', 'success');
    await refreshTeamDebug();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert(String(e), 'error');
  }
}

async function teamDevRepair() {
  if (!_isTauri) return;
  try {
    const r = await apiTeamRepairOrphanIfNeeded();
    if (typeof showAlert === 'function') showAlert('repair_orphan: ' + String(r), 'info');
    if (typeof renderTeamView === 'function') await renderTeamView();
    await refreshTeamDebug();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert(String(e), 'error');
  }
}

async function teamDevCancelJoin() {
  if (!_isTauri) return;
  try {
    await apiTeamCancelJoin();
    if (typeof renderTeamView === 'function') await renderTeamView();
    if (typeof showAlert === 'function') showAlert('cancel_join 実行済み', 'info');
    await refreshTeamDebug();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert(String(e), 'error');
  }
}

async function teamDevLeave() {
  if (!_isTauri) return;
  if (typeof confirmAsync === 'function' && !(await confirmAsync('チームから抜けますか？'))) return;
  try {
    await apiTeamLeave();
    if (typeof renderTeamView === 'function') await renderTeamView();
    if (typeof showAlert === 'function') showAlert('leave 実行済み', 'info');
    await refreshTeamDebug();
  } catch (e) {
    if (typeof showAlert === 'function') showAlert(String(e), 'error');
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

window.getTeamDevDebugSectionHtml = getTeamDevDebugSectionHtml;
window.refreshTeamUnjoinedFlowStatus = refreshTeamUnjoinedFlowStatus;
window.toggleTeamDebug = toggleTeamDebug;
window.refreshTeamDebug = refreshTeamDebug;
window.updateTeamButtonsState = updateTeamButtonsState;
window.teamDevClearEventLog = teamDevClearEventLog;
window.teamDevCopyEndpoint = teamDevCopyEndpoint;
window.teamDevRefresh = teamDevRefresh;
window.teamDevRequestSync = teamDevRequestSync;
window.teamDevApplyLocal = teamDevApplyLocal;
window.teamDevRepair = teamDevRepair;
window.teamDevCancelJoin = teamDevCancelJoin;
window.teamDevLeave = teamDevLeave;
