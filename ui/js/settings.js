// ── Settings View ─────────────────────────────────────────

async function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  // Load state
  const [dirs, openaiStatus, anthropicStatus, defaultProvider, syncMode] = await Promise.all([
    apiGetWatchedDirs(),
    apiGetApiKeyStatus('openai'),
    apiGetApiKeyStatus('anthropic'),
    apiGetSetting('ai_provider'),
    _isTauri ? apiTeamGetSyncMode() : Promise.resolve('auto'),
  ]);

  container.innerHTML = `
    <!-- Watched Directories -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">Watched Directories</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">Projects in these directories will be automatically detected.</p>
      <div id="watched-dirs-list" class="space-y-2 mb-3">
        ${dirs.length === 0
          ? '<p class="text-xs text-[#484f58]">No directories configured.</p>'
          : dirs.map(d => `
            <div class="flex items-center justify-between gap-2 p-2 bg-[#0d1117] border border-[#30363d] rounded-xl">
              <div class="flex items-center gap-2 min-w-0">
                <i data-lucide="folder" size="14" class="text-indigo-400 shrink-0"></i>
                <span class="text-xs text-white truncate">${d.path}</span>
              </div>
              <button onclick="removeWatchedDir('${d.id}')" class="p-1 hover:bg-red-500/10 rounded-lg text-[#484f58] hover:text-red-400 transition-all shrink-0">
                <i data-lucide="x" size="14"></i>
              </button>
            </div>
          `).join('')}
      </div>
      <button onclick="addWatchedDirectory()" class="flex items-center gap-1.5 h-8 px-3 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white transition-all">
        <i data-lucide="plus" size="14"></i>
        Add Directory
      </button>
    </section>

    <!-- AI API Keys -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">AI Configuration</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">Configure API keys for the Log Analyzer AI assistant.</p>

      <div class="space-y-3">
        <!-- Default Provider -->
        <div>
          <label class="text-[10px] text-[#484f58] font-bold uppercase tracking-wider block mb-1">Default Provider</label>
          <select id="settings-ai-provider" onchange="saveAiProvider(this.value)" class="w-full sm:w-48 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <option value="openai" ${(defaultProvider || 'openai') === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="anthropic" ${defaultProvider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          </select>
        </div>

        <!-- OpenAI -->
        <div class="p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white">OpenAI</span>
              ${openaiStatus
                ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400">Configured</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#484f5820] text-[#484f58]">Not Set</span>'}
            </div>
            ${openaiStatus ? '<button onclick="deleteKey(\'openai\')" class="text-[10px] text-red-400 hover:text-red-300">Remove</button>' : ''}
          </div>
          <div class="flex gap-2">
            <input id="openai-key-input" type="password" placeholder="sk-..." class="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="saveKey('openai')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white">Save</button>
          </div>
        </div>

        <!-- Anthropic -->
        <div class="p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white">Anthropic</span>
              ${anthropicStatus
                ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400">Configured</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#484f5820] text-[#484f58]">Not Set</span>'}
            </div>
            ${anthropicStatus ? '<button onclick="deleteKey(\'anthropic\')" class="text-[10px] text-red-400 hover:text-red-300">Remove</button>' : ''}
          </div>
          <div class="flex gap-2">
            <input id="anthropic-key-input" type="password" placeholder="sk-ant-..." class="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="saveKey('anthropic')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white">Save</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Team -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">チーム</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">チームを作成してメンバーを招待するか、招待コードで参加できます。</p>

      <div class="space-y-4">
        <div>
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">チーム作成・招待</h3>
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <select id="team-invite-expires" class="h-8 px-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white outline-none focus:border-indigo-500">
              <option value="15">15分</option>
              <option value="60" selected>1時間</option>
              <option value="1440">24時間</option>
              <option value="0">無期限</option>
            </select>
            <button onclick="teamCreate()" class="h-8 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white flex items-center gap-2">
              <i data-lucide="users" size="14"></i>
              チームを作成
            </button>
            <button onclick="teamIssueInvite()" class="h-8 px-4 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white flex items-center gap-2">
              <i data-lucide="link" size="14"></i>
              招待コードを発行
            </button>
          </div>
        </div>

        <div id="team-invite-codes-section" class="hidden">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">発行済みコード一覧</h3>
          <div id="team-invite-codes-list" class="space-y-2"></div>
        </div>

        <div id="team-pending-joins-section" class="hidden">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">参加申請</h3>
          <div id="team-pending-joins-list" class="space-y-2"></div>
        </div>

        <div id="team-members-section" class="hidden">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">メンバー一覧</h3>
          <div id="team-members-list" class="space-y-2"></div>
        </div>

        <div>
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">同期モード</h3>
          <p class="text-[10px] text-[#8b949e] mb-2">変更をチームに配信するタイミングを選択（ローカルのみ保存）</p>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sync-mode" value="auto" class="accent-indigo-500" ${(syncMode || 'auto') === 'auto' ? 'checked' : ''} onchange="saveSyncMode(this.value)">
              <span class="text-xs">自動同期（デフォルト）</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sync-mode" value="manual" class="accent-indigo-500" ${syncMode === 'manual' ? 'checked' : ''} onchange="saveSyncMode(this.value)">
              <span class="text-xs">手動同期</span>
            </label>
          </div>
          <p class="text-[9px] text-[#484f58] mt-1">手動同期時はサイドバーに未配信数を表示し、Pushボタンで一括送信</p>
        </div>

        <div class="pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">チームに参加する</h3>
          <div class="flex gap-2">
            <input id="team-join-code" type="text" placeholder="招待リンクを貼り付け（ホストから共有された文字列）" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white placeholder-[#484f58] font-mono">
            <button onclick="teamJoin()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">参加する</button>
          </div>
        </div>
      </div>
    </section>

    <!-- IDE Preferences -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">IDE Preferences</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">Choose your default IDE for opening projects.</p>
      <select id="settings-default-ide" onchange="saveDefaultIde(this.value)" class="w-full sm:w-48 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-indigo-500">
        <option value="vscode">VS Code</option>
        <option value="cursor">Cursor</option>
        <option value="opencode">OpenCode</option>
      </select>
    </section>
  `;

  // Load saved IDE preference
  const savedIde = await apiGetSetting('default_ide');
  if (savedIde) {
    const sel = document.getElementById('settings-default-ide');
    if (sel) sel.value = savedIde;
  }

  // Load team invite codes, pending joins, members
  await renderTeamInviteCodes();
  await renderTeamPendingJoins();
  await renderTeamMembers();

  lucide.createIcons();
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
    const [members, amIHost] = await Promise.all([
      apiTeamListMembers(),
      apiTeamAmIHost(),
    ]);
    if (members.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    const roleLabel = (r) => ({ host: 'HOST', co_host: 'CO-HOST', member: 'MEMBER' }[r] || r);
    list.innerHTML = members.map((m) => {
      const promoteBtn = amIHost && m.role === 'member'
        ? `<button onclick="teamPromoteToCoHost('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">CO-HOSTに昇格</button>`
        : '';
      return `
        <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs font-mono text-white truncate" title="${escapeHtml(m.endpoint_id)}">${escapeHtml(m.endpoint_id.slice(0, 20))}...</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 shrink-0">${roleLabel(m.role)}</span>
          </div>
          ${promoteBtn}
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load members:', e);
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
    alert('昇格に失敗しました: ' + (e?.message || e));
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

function formatExpiresAt(isoStr) {
  if (!isoStr) return '';
  try {
    // SQLite の "YYYY-MM-DD HH:MM:SS" を ISO 8601 形式に変換（ローカル時刻として解釈）
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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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

async function teamCreate() {
  if (!_isTauri) {
    alert('チーム機能は Tauri 環境で動作します');
    return;
  }
  try {
    const expiresEl = document.getElementById('team-invite-expires');
    const expiresMinutes = expiresEl ? parseInt(expiresEl.value, 10) : 60;
    const result = await apiTeamCreate(expiresMinutes);
    if (result && result.invite_string) {
      await navigator.clipboard.writeText(result.invite_string);
      alert(`チームを作成しました。\n招待コード: ${result.code}\n\n参加する人にこの招待リンクを共有してください（クリップボードにコピー済み）`);
      await renderTeamInviteCodes();
      renderSettings();
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    }
  } catch (e) {
    const errStr = e?.toString?.() || String(e);
    if ((errStr.includes('iroh') || errStr.includes('初期化')) && !window._teamCreateRetried) {
      window._teamCreateRetried = true;
      await new Promise((r) => setTimeout(r, 2000));
      window._teamCreateRetried = false;
      return teamCreate();
    }
    alert('エラー: ' + errStr);
  }
}

async function teamIssueInvite() {
  if (!_isTauri) {
    alert('チーム機能は Tauri 環境で動作します');
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
      alert(msg);
      await renderTeamInviteCodes();
      renderSettings();
    }
  } catch (e) {
    const errStr = e?.toString?.() || String(e);
    if ((errStr.includes('iroh') || errStr.includes('初期化')) && !window._teamIssueInviteRetried) {
      window._teamIssueInviteRetried = true;
      await new Promise((r) => setTimeout(r, 2000));
      window._teamIssueInviteRetried = false;
      return teamIssueInvite();
    }
    alert('エラー: ' + errStr);
  }
}

async function teamJoin() {
  if (!_isTauri) {
    alert('チーム機能は Tauri 環境で動作します');
    return;
  }
  const input = document.getElementById('team-join-code');
  const code = input?.value?.trim();
  if (!code) {
    alert('招待コードを入力してください');
    return;
  }
  try {
    const result = await apiTeamJoin(code);
    if (result && result.message) {
      alert(result.message);
      if (input) input.value = '';
      if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    }
  } catch (e) {
    alert('エラー: ' + (e?.toString?.() || e));
  }
}

async function teamApproveJoin(btn) {
  if (!_isTauri || !btn?.dataset?.endpoint || !btn?.dataset?.topic) return;
  try {
    await apiTeamApproveJoin(btn.dataset.endpoint, btn.dataset.topic);
    await renderTeamPendingJoins();
  } catch (e) {
    alert('エラー: ' + (e?.toString?.() || e));
  }
}

async function teamRejectJoin(btn) {
  if (!_isTauri || !btn?.dataset?.endpoint || !btn?.dataset?.topic) return;
  try {
    await apiTeamRejectJoin(btn.dataset.endpoint, btn.dataset.topic);
    await renderTeamPendingJoins();
  } catch (e) {
    alert('エラー: ' + (e?.toString?.() || e));
  }
}

async function teamCopyInviteLink(btn) {
  const invite = btn?.dataset?.invite;
  if (!invite) return;
  try {
    await navigator.clipboard.writeText(invite);
    alert('招待リンクをクリップボードにコピーしました');
  } catch (e) {
    alert('コピーに失敗しました: ' + (e?.toString?.() || e));
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
    alert('エラー: ' + (e?.toString?.() || e));
  }
}

async function addWatchedDirectory() {
  if (_isTauri) {
    const result = await window.__TAURI__.dialog.open({ directory: true, title: 'Select directory to watch' });
    if (result) {
      await apiAddWatchedDir(result);
      await apiScanDirectory(result);
      await loadData();
      renderProjects();
      renderSettings();
    }
  } else {
    const p = prompt('Enter directory path:');
    if (p) {
      await apiAddWatchedDir(p);
      renderSettings();
    }
  }
}

async function removeWatchedDir(id) {
  await apiRemoveWatchedDir(id);
  await loadData();
  renderProjects();
  renderSettings();
}

async function saveKey(provider) {
  const input = document.getElementById(provider + '-key-input');
  if (!input || !input.value.trim()) return;
  await apiSaveApiKey(provider, input.value.trim());
  input.value = '';
  renderSettings();
}

async function deleteKey(provider) {
  if (!confirm(`Remove ${provider} API key?`)) return;
  await apiDeleteApiKey(provider);
  renderSettings();
}

async function saveAiProvider(value) {
  await apiSetSetting('ai_provider', value);
}

async function saveDefaultIde(value) {
  await apiSetSetting('default_ide', value);
}

// 参加申請イベントをリッスン（ホストがチーム作成済みの場合）
if (_isTauri && window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen('team-pending-join', () => {
    if (typeof renderTeamPendingJoins === 'function') renderTeamPendingJoins();
  });
}
