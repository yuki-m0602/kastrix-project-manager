// ── Settings View (オーケストレーター) ────────────────────
// 監視ディレクトリ: settings_watched_dirs.js
// AI: settings_ai.js
// チーム: settings_team.js
// IDE: settings_ide.js

async function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;
  container.innerHTML = '<p class="text-[#8b949e] text-xs">読み込み中...</p>';

  let dirs = [], openaiStatus = false, anthropicStatus = false, openrouterStatus = false, defaultProvider = 'openai';
  let aiModelOpenai = '', aiModelAnthropic = '', aiModelOpenrouter = '';
  try {
    const loadPromise = Promise.all([
      apiGetWatchedDirs(),
      apiGetApiKeyStatus('openai'),
      apiGetApiKeyStatus('anthropic'),
      apiGetApiKeyStatus('openrouter'),
      apiGetSetting('ai_provider'),
      apiGetSetting('ai_model_openai'),
      apiGetSetting('ai_model_anthropic'),
      apiGetSetting('ai_model_openrouter'),
    ]);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('タイムアウト（10秒）')), SETTINGS_LOAD_TIMEOUT_MS)
    );
    const loaded = await Promise.race([loadPromise, timeoutPromise]);
    [dirs, openaiStatus, anthropicStatus, openrouterStatus, defaultProvider, aiModelOpenai, aiModelAnthropic, aiModelOpenrouter] = loaded;
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

    <section class="bg-[#161b22]/50 border border-[#30363d] rounded-2xl p-3 sm:p-4">
      <p class="text-[11px] text-[#8b949e] leading-relaxed">チームの作成・招待コード・参加申請・メンバー一覧は、サイドバーの <span class="text-[#c9d1d9] font-bold">チーム</span> から行えます。</p>
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
            <option value="openrouter" ${defaultProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
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
          <div class="mt-2 flex items-center gap-2">
            <label class="text-[10px] text-[#484f58] shrink-0">モデル</label>
            <select id="openai-model-select" onchange="saveAiModel('openai', this.value)" class="flex-1 min-w-0 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
              <option value="${aiModelOpenai || 'gpt-4o-mini'}" selected>${aiModelOpenai || 'gpt-4o-mini'}</option>
            </select>
            <button onclick="fetchAiModels('openai')" class="px-2 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg text-[10px] font-bold text-white shrink-0">取得</button>
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
          <div class="mt-2 flex items-center gap-2">
            <label class="text-[10px] text-[#484f58] shrink-0">モデル</label>
            <select id="anthropic-model-select" onchange="saveAiModel('anthropic', this.value)" class="flex-1 min-w-0 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
              <option value="claude-sonnet-4-20250514" ${(aiModelAnthropic || 'claude-sonnet-4-20250514') === 'claude-sonnet-4-20250514' ? 'selected' : ''}>claude-sonnet-4-20250514</option>
              <option value="claude-3-5-sonnet-20241022" ${aiModelAnthropic === 'claude-3-5-sonnet-20241022' ? 'selected' : ''}>claude-3-5-sonnet-20241022</option>
              <option value="claude-3-opus-20240229" ${aiModelAnthropic === 'claude-3-opus-20240229' ? 'selected' : ''}>claude-3-opus-20240229</option>
              <option value="claude-3-haiku-20240307" ${aiModelAnthropic === 'claude-3-haiku-20240307' ? 'selected' : ''}>claude-3-haiku-20240307</option>
            </select>
            <button onclick="fetchAiModels('anthropic')" class="px-2 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg text-[10px] font-bold text-white shrink-0" title="Anthropicは固定リスト">取得</button>
          </div>
        </div>

        <!-- OpenRouter -->
        <div class="p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white">OpenRouter</span>
              ${openrouterStatus
                ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500/10 text-emerald-400">設定済み</span>'
                : '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#484f5820] text-[#484f58]">未設定</span>'}
            </div>
            ${openrouterStatus ? '<button onclick="deleteKey(\'openrouter\')" class="text-[10px] text-red-400 hover:text-red-300">削除</button>' : ''}
          </div>
          <div class="flex gap-2">
            <input id="openrouter-key-input" type="password" placeholder="sk-or-..." class="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
            <button onclick="saveKey('openrouter')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[10px] font-bold text-white">保存</button>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <label class="text-[10px] text-[#484f58] shrink-0">モデル</label>
            <select id="openrouter-model-select" onchange="saveAiModel('openrouter', this.value)" class="flex-1 min-w-0 bg-[#161b22] border border-[#30363d] rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500">
              <option value="${aiModelOpenrouter || 'openai/gpt-4o-mini'}" selected>${aiModelOpenrouter || 'openai/gpt-4o-mini'}</option>
            </select>
            <button onclick="fetchAiModels('openrouter')" class="px-2 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg text-[10px] font-bold text-white shrink-0">取得</button>
          </div>
        </div>

        <!-- APIキー デバッグ -->
        <div class="pt-4 border-t border-[#30363d]">
          <button onclick="toggleAiKeyDebug()" class="flex items-center gap-2 text-[10px] font-bold text-[#8b949e] hover:text-white uppercase tracking-wider">
            <i data-lucide="bug" size="12"></i>
            APIキー デバッグ（保存・取得の確認）
          </button>
          <div id="ai-key-debug-panel" class="hidden mt-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-xl font-mono text-[10px]">
            <div id="ai-key-debug-content" class="space-y-1 text-[#8b949e]">読み込み中...</div>
            <button onclick="refreshAiKeyDebug()" class="mt-2 px-2 py-1 bg-[#21262d] hover:bg-[#30363d] rounded text-[10px] text-white">更新</button>
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
  } catch (e) {
    console.error('renderSettings post-load failed:', e);
  }
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
