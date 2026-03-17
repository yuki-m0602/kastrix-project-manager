// ── Settings View (オーケストレーター) ────────────────────
// 監視ディレクトリ: settings_watched_dirs.js
// AI: settings_ai.js
// チーム: settings_team.js
// IDE: settings_ide.js

async function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  container.innerHTML = '<p class="text-[#8b949e] text-xs">読み込み中...</p>';

  let dirs = [], openaiStatus = false, anthropicStatus = false, defaultProvider = 'openai', syncMode = SYNC_MODE_AUTO, teamReady = false;
  try {
    const loadPromise = Promise.all([
      apiGetWatchedDirs(),
      apiGetApiKeyStatus('openai'),
      apiGetApiKeyStatus('anthropic'),
      apiGetSetting('ai_provider'),
      _isTauri ? apiTeamGetSyncMode() : Promise.resolve(SYNC_MODE_AUTO),
      _isTauri ? apiTeamIsReady() : Promise.resolve(false),
    ]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('タイムアウト（10秒）')), SETTINGS_LOAD_TIMEOUT_MS)
    );
    [dirs, openaiStatus, anthropicStatus, defaultProvider, syncMode, teamReady] = await Promise.race([loadPromise, timeoutPromise]);
  } catch (e) {
    console.error('renderSettings load failed:', e);
    container.innerHTML = '<p class="text-red-400 text-xs p-4">設定の読み込みに失敗しました。' + (e?.message || String(e)) + '</p><button onclick="renderSettings()" class="mt-2 px-3 py-1 bg-[#21262d] rounded text-xs text-white">再試行</button>';
    return;
  }

  container.innerHTML = `
    <!-- 監視ディレクトリ -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">監視ディレクトリ</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">これらのディレクトリ内のプロジェクトが自動検出されます。</p>
      <div id="watched-dirs-list" class="space-y-2 mb-3">
        ${dirs.length === 0
          ? '<p class="text-xs text-[#484f58]">ディレクトリが設定されていません。</p>'
          : dirs.map(d => `
            <div class="flex items-center justify-between gap-2 p-2 bg-[#0d1117] border border-[#30363d] rounded-xl">
              <div class="flex items-center gap-2 min-w-0">
                <i data-lucide="folder" size="14" class="text-indigo-400 shrink-0"></i>
                <span class="text-xs text-white truncate">${escapeHtml(d.path)}</span>
              </div>
              <button onclick="removeWatchedDir('${escapeHtml(d.id)}')" class="p-1 hover:bg-red-500/10 rounded-lg text-[#484f58] hover:text-red-400 transition-all shrink-0">
                <i data-lucide="x" size="14"></i>
              </button>
            </div>
          `).join('')}
      </div>
      <button onclick="addWatchedDirectory()" class="flex items-center gap-1.5 h-8 px-3 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-xl text-xs font-bold text-white transition-all">
        <i data-lucide="plus" size="14"></i>
        ディレクトリを追加
      </button>
    </section>

    <!-- AI API キー -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">AI 設定</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">ログ分析 AI アシスタント用の API キーを設定します。</p>

      <div class="space-y-3">
        <!-- デフォルトプロバイダ -->
        <div>
          <label class="text-[10px] text-[#484f58] font-bold uppercase tracking-wider block mb-1">デフォルトプロバイダ</label>
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
                ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400">設定済み</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#484f5820] text-[#484f58]">未設定</span>'}
            </div>
            ${openaiStatus ? '<button onclick="deleteKey(\'openai\')" class="text-[10px] text-red-400 hover:text-red-300">削除</button>' : ''}
          </div>
          <div class="flex gap-2">
            <input id="openai-key-input" type="password" placeholder="sk-..." class="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="saveKey('openai')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white">保存</button>
          </div>
        </div>

        <!-- Anthropic -->
        <div class="p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white">Anthropic</span>
              ${anthropicStatus
                ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400">設定済み</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#484f5820] text-[#484f58]">未設定</span>'}
            </div>
            ${anthropicStatus ? '<button onclick="deleteKey(\'anthropic\')" class="text-[10px] text-red-400 hover:text-red-300">削除</button>' : ''}
          </div>
          <div class="flex gap-2">
            <input id="anthropic-key-input" type="password" placeholder="sk-ant-..." class="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="saveKey('anthropic')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white">保存</button>
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
          <div id="team-buttons-status" class="text-[10px] text-[#8b949e] mb-2 min-h-[14px]">${!_isTauri ? '' : teamReady ? '' : '<span class="text-amber-400">チーム機能を準備中...</span>'}</div>
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <select id="team-invite-expires" class="h-8 px-3 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white outline-none focus:border-indigo-500" ${!teamReady && _isTauri ? 'disabled' : ''}>
              <option value="15">15分</option>
              <option value="60" selected>1時間</option>
              <option value="1440">24時間</option>
              <option value="0">無期限</option>
            </select>
            <button id="btn-team-create" onclick="teamCreate()" class="h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${teamReady ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-[#21262d] opacity-60 cursor-not-allowed'}" ${!teamReady && _isTauri ? 'disabled' : ''}>
              <i data-lucide="users" size="14"></i>
              チームを作成
            </button>
            <button id="btn-team-issue-invite" onclick="teamIssueInvite()" class="h-8 px-4 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${teamReady ? 'bg-[#21262d] hover:bg-[#30363d] border border-[#30363d]' : 'bg-[#21262d] opacity-60 cursor-not-allowed border border-[#30363d]'}" ${!teamReady && _isTauri ? 'disabled' : ''}>
              <i data-lucide="link" size="14"></i>
              招待コードを発行
            </button>
          </div>
        </div>

        <div id="team-display-name-section" class="hidden">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">自分の表示名</h3>
          <p class="text-[10px] text-[#8b949e] mb-2">チーム内でメンバー一覧に表示される名前（64文字以内）</p>
          <div class="flex gap-2">
            <input id="team-display-name-input" type="text" placeholder="表示名を入力" maxlength="64" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white placeholder-[#484f58]">
            <button onclick="teamSaveDisplayName()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">保存</button>
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

        <div id="team-blocked-section" class="hidden">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">ブロック済み（HOST のみ表示）</h3>
          <div id="team-blocked-list" class="space-y-2"></div>
        </div>

        <div>
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">同期モード</h3>
          <p class="text-[10px] text-[#8b949e] mb-2">変更をチームに配信するタイミングを選択（ローカルのみ保存）</p>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sync-mode" value="${SYNC_MODE_AUTO}" class="accent-indigo-500" ${(syncMode || SYNC_MODE_AUTO) === SYNC_MODE_AUTO ? 'checked' : ''} onchange="saveSyncMode(this.value)">
              <span class="text-xs">自動同期（デフォルト）</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sync-mode" value="${SYNC_MODE_MANUAL}" class="accent-indigo-500" ${syncMode === SYNC_MODE_MANUAL ? 'checked' : ''} onchange="saveSyncMode(this.value)">
              <span class="text-xs">手動同期</span>
            </label>
          </div>
          <p class="text-[9px] text-[#484f58] mt-1">手動同期時はサイドバーに未配信数を表示し、Pushボタンで一括送信</p>
        </div>

        <div class="pt-4 border-t border-[#30363d]">
          <h3 class="text-[10px] font-bold text-[#484f58] uppercase mb-2">チームに参加する</h3>
          <div id="team-join-form" class="flex gap-2">
            <input id="team-join-code" type="text" placeholder="招待リンクを貼り付け（ホストから共有された文字列）" class="flex-1 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white placeholder-[#484f58] font-mono">
            <button onclick="teamJoin()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">参加する</button>
          </div>
          <div id="team-pending-status" class="hidden flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <span class="text-xs text-amber-200">参加申請中です。ホストの承認をお待ちください。</span>
            <button onclick="teamCancelJoin()" class="px-3 py-1 text-[10px] font-bold text-amber-400 hover:bg-amber-500/20 rounded-lg">参加申請をキャンセル</button>
          </div>
        </div>

        <div class="pt-4 border-t border-[#30363d]">
          <button id="team-debug-toggle" onclick="toggleTeamDebug()" class="flex items-center gap-2 text-[10px] font-bold text-[#8b949e] hover:text-white uppercase tracking-wider">
            <i data-lucide="bug" size="12"></i>
            デバッグ（どこで止まってるか確認）
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

    <!-- IDE 設定 -->
    <section class="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 sm:p-6">
      <h2 class="text-sm font-bold text-white mb-1">IDE 設定</h2>
      <p class="text-[10px] text-[#8b949e] mb-4">プロジェクトを開くデフォルトの IDE を選択します。</p>
      <select id="settings-default-ide" onchange="saveDefaultIde(this.value)" class="w-full sm:w-48 bg-[#0d1117] border border-[#30363d] rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-indigo-500">
        <option value="vscode">VS Code</option>
        <option value="cursor">Cursor</option>
        <option value="opencode">OpenCode</option>
      </select>
    </section>
  `;

  try {
    const savedIde = await apiGetSetting('default_ide');
    if (savedIde) {
      const sel = document.getElementById('settings-default-ide');
      if (sel) sel.value = savedIde;
    }
    await renderTeamInviteCodes();
    await renderTeamDisplayNameSection();
    await renderTeamPendingJoins();
    await renderTeamMembers();
    await renderTeamBlocked();
    await renderTeamPendingStatus();
  } catch (e) {
    console.error('renderSettings post-load failed:', e);
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
