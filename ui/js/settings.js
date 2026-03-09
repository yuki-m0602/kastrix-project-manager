// ── Settings View ─────────────────────────────────────────

async function renderSettings() {
  const container = document.getElementById('settings-content');
  if (!container) return;

  // Load state
  const [dirs, openaiStatus, anthropicStatus, defaultProvider] = await Promise.all([
    apiGetWatchedDirs(),
    apiGetApiKeyStatus('openai'),
    apiGetApiKeyStatus('anthropic'),
    apiGetSetting('ai_provider'),
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

  lucide.createIcons();
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
