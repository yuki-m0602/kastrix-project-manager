// ── AI Chat (永続化・複数チャット切り替え) ────────────────────
let _aiCurrentChatId = null;
let _aiMessages = [];
let _aiModels = [];
let _aiModelDropdownOpen = false;
let _aiDropdownCloseBound = false;
let _aiPendingReply = false; // 返答待ち中は "..." を表示

function initAiView() {
  _loadAiProviderAndModels();
  _setupAiModelDropdownClose();
  _loadChatList();
  _restoreOrCreateCurrentChat();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function _restoreOrCreateCurrentChat() {
  if (!_isTauri) return;
  const saved = await apiGetSetting('ai_current_chat_id');
  const chats = await apiAiListChats();
  if (saved && chats.some((c) => c.id === saved)) {
    _aiCurrentChatId = saved;
  } else if (chats.length > 0) {
    _aiCurrentChatId = chats[0].id;
    await apiSetSetting('ai_current_chat_id', _aiCurrentChatId);
  } else {
    const chat = await apiAiCreateChat();
    if (chat) {
      _aiCurrentChatId = chat.id;
      await apiSetSetting('ai_current_chat_id', chat.id);
      await _loadChatList();
    }
  }
  await _loadCurrentChatMessages();
  _renderChatList();
}

async function _loadChatList() {
  if (!_isTauri) return;
  _renderChatList();
}

function _renderChatList() {
  const container = document.getElementById('ai-chat-list-items');
  if (!container) return;
  apiAiListChats().then((chats) => {
    container.innerHTML = chats
      .map(
        (c) =>
          `<div class="group flex items-center gap-1 rounded-xl ${
            c.id === _aiCurrentChatId ? 'bg-[#21262d]' : 'hover:bg-[#161b22]'
          }">
            <button type="button" class="ai-chat-item flex-1 min-w-0 text-left px-3 py-2 rounded-xl text-[10px] truncate transition-all ${
              c.id === _aiCurrentChatId ? 'text-white' : 'text-[#8b949e] group-hover:text-white'
            }" data-chat-id="${escapeHtml(c.id)}" onclick="switchAiChat(this.dataset.chatId)" title="${escapeHtml(c.title)}">
              <span class="block truncate">${escapeHtml(c.title)}</span>
            </button>
            <button type="button" class="p-1.5 rounded-lg text-[#484f58] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0" data-chat-id="${escapeHtml(c.id)}" onclick="event.stopPropagation(); deleteAiChat(this.dataset.chatId)" title="削除">
              <i data-lucide="trash-2" size="12"></i>
            </button>
          </div>`
      )
      .join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
}

async function createNewAiChat() {
  if (!_isTauri) return;
  const chat = await apiAiCreateChat();
  if (!chat) return;
  _aiCurrentChatId = chat.id;
  await apiSetSetting('ai_current_chat_id', chat.id);
  _aiMessages = [];
  _aiPendingReply = false;
  await _loadChatList();
  _renderAiMessages();
  _renderChatList();
}

async function switchAiChat(chatId) {
  if (!_isTauri || chatId === _aiCurrentChatId) return;
  _aiCurrentChatId = chatId;
  await apiSetSetting('ai_current_chat_id', chatId);
  await _loadCurrentChatMessages();
  _renderAiMessages();
  _renderChatList();
}

async function deleteAiChat(chatId) {
  if (!_isTauri) return;
  if (!(await confirmAsync('このチャットを削除しますか？'))) return;
  await apiAiDeleteChat(chatId);
  const chats = await apiAiListChats();
  if (chatId === _aiCurrentChatId) {
    _aiCurrentChatId = chats.length > 0 ? chats[0].id : null;
    await apiSetSetting('ai_current_chat_id', _aiCurrentChatId || '');
    await _loadCurrentChatMessages();
    _renderAiMessages();
  }
  _renderChatList();
}

async function _loadCurrentChatMessages() {
  if (!_isTauri || !_aiCurrentChatId) {
    _aiMessages = [];
    return;
  }
  const msgs = await apiAiGetChatMessages(_aiCurrentChatId);
  _aiMessages = msgs.map((m) => ({ role: m.role, content: m.content }));
}

function _setupAiModelDropdownClose() {
  if (_aiDropdownCloseBound) return;
  _aiDropdownCloseBound = true;
  document.addEventListener('click', function (e) {
    const dd = document.getElementById('ai-model-dropdown');
    const trigger = document.getElementById('ai-model-trigger');
    if (!_aiModelDropdownOpen || !dd || !trigger) return;
    if (!dd.contains(e.target) && !trigger.contains(e.target)) {
      _aiModelDropdownOpen = false;
      dd.classList.add('hidden');
    }
  });
}

async function _loadAiProviderAndModels() {
  const provider = await apiGetSetting('ai_provider');
  const sel = document.getElementById('ai-provider-select');
  if (sel && provider) sel.value = provider;
  await _fetchModelsForProvider(sel?.value || 'openai');
  _updateModelLabel();
}

async function onAiProviderChange() {
  const sel = document.getElementById('ai-provider-select');
  const provider = sel?.value || 'openai';
  await apiSetSetting('ai_provider', provider);
  await _fetchModelsForProvider(provider);
  _updateModelLabel();
  filterAiModels();
}

async function _fetchModelsForProvider(provider) {
  if (!_isTauri) {
    _aiModels = [];
    return;
  }
  try {
    _aiModels = await apiListAiModelsExtended(provider);
  } catch (e) {
    _aiModels = [];
    console.error('Failed to fetch AI models:', e);
  }
}

function _updateModelLabel() {
  const provider = document.getElementById('ai-provider-select')?.value || 'openai';
  const key = 'ai_model_' + provider;
  apiGetSetting(key).then((model) => {
    const label = document.getElementById('ai-model-label');
    if (label) label.textContent = model || 'モデル選択';
  });
}

async function toggleAiModelDropdown() {
  _aiModelDropdownOpen = !_aiModelDropdownOpen;
  const dd = document.getElementById('ai-model-dropdown');
  if (!dd) return;
  dd.classList.toggle('hidden', !_aiModelDropdownOpen);
  if (_aiModelDropdownOpen) {
    if (_aiModels.length === 0) await _fetchModelsForProvider(document.getElementById('ai-provider-select')?.value || 'openai');
    filterAiModels();
    setTimeout(() => document.getElementById('ai-model-search')?.focus(), 50);
  }
}

function filterAiModels() {
  const search = (document.getElementById('ai-model-search')?.value || '').trim().toLowerCase();
  const freeOnly = document.getElementById('ai-free-only')?.checked || false;
  const provider = document.getElementById('ai-provider-select')?.value || 'openai';

  let filtered = _aiModels;
  if (freeOnly) filtered = filtered.filter((m) => m.is_free);
  if (search) filtered = filtered.filter((m) => m.id.toLowerCase().includes(search));

  const listEl = document.getElementById('ai-model-list');
  if (!listEl) return;

  apiGetSetting('ai_model_' + provider).then((currentModel) => {
    listEl.innerHTML = filtered.length === 0
      ? '<div class="p-3 text-[10px] text-[#484f58]">該当なし</div>'
      : filtered
          .map(
            (m) =>
              `<button type="button" class="w-full text-left px-3 py-2 text-[10px] hover:bg-[#21262d] transition-all flex items-center justify-between gap-2 ${
                m.id === currentModel ? 'bg-indigo-500/20 text-indigo-400' : 'text-[#c9d1d9]'
              }" data-model-id="${escapeHtml(m.id)}" onclick="selectAiModel(this.dataset.modelId)">
                <span class="truncate">${escapeHtml(m.id)}</span>
                ${m.is_free ? '<span class="text-[8px] text-emerald-400 shrink-0">無料</span>' : ''}
              </button>`
          )
          .join('');
    const dd = document.getElementById('ai-model-dropdown');
    if (dd) dd.classList.toggle('hidden', !_aiModelDropdownOpen);
  });
}

function selectAiModel(modelId) {
  const provider = document.getElementById('ai-provider-select')?.value || 'openai';
  apiSetSetting('ai_model_' + provider, modelId).then(() => {
    _updateModelLabel();
    _aiModelDropdownOpen = false;
    document.getElementById('ai-model-dropdown')?.classList.add('hidden');
  });
}

function _renderAiMessages() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;
  const display = [..._aiMessages];
  if (_aiPendingReply) display.push({ role: 'assistant', content: '...' });
  if (display.length === 0 && !_aiPendingReply) {
    container.innerHTML = '<p class="text-[#484f58] text-xs py-8 text-center">メッセージを送信して会話を始めましょう</p>';
    return;
  }
  container.innerHTML = display
    .map((m) => {
      const isUser = m.role === 'user';
      return `
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] px-4 py-2 rounded-2xl ${
          isUser ? 'bg-indigo-600 text-white' : 'bg-[#161b22] border border-[#30363d] text-[#c9d1d9]'
        }">${_escapeHtmlChat(m.content)}</div>
      </div>`;
    })
    .join('');
  container.scrollTop = container.scrollHeight;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _escapeHtmlChat(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

async function handleAiSend(e) {
  e.preventDefault();
  const input = document.getElementById('ai-chat-input');
  const msg = input.value.trim();
  if (!msg) return;

  input.value = '';

  if (!_isTauri) return;
  if (!_aiCurrentChatId) {
    const chat = await apiAiCreateChat();
    if (chat) {
      _aiCurrentChatId = chat.id;
      await apiSetSetting('ai_current_chat_id', chat.id);
      await _loadChatList();
      _renderChatList();
    }
  }

  await apiAiAddChatMessage(_aiCurrentChatId, 'user', msg);
  _aiMessages.push({ role: 'user', content: msg });
  _aiPendingReply = true;
  _renderAiMessages();

  const provider = document.getElementById('ai-provider-select')?.value || 'openai';

  try {
    const reply = await apiAnalyzeLogs(msg, provider);
    await apiAiAddChatMessage(_aiCurrentChatId, 'assistant', reply);
    _aiMessages.push({ role: 'assistant', content: reply });
  } catch (err) {
    const errMsg = 'Error: ' + (err.message || err);
    await apiAiAddChatMessage(_aiCurrentChatId, 'assistant', errMsg);
    _aiMessages.push({ role: 'assistant', content: errMsg });
  }
  _aiPendingReply = false;
  _renderAiMessages();
  _renderChatList();
}
