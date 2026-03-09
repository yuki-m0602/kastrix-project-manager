// ── AI Chat ───────────────────────────────────────────────
let _aiMessages = [];

function toggleAiChat() {
  const el = document.getElementById('ai-chat');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    _initAiChat();
  }
}

async function _initAiChat() {
  // Set provider dropdown from saved preference
  const provider = await apiGetSetting('ai_provider');
  if (provider) {
    const sel = document.getElementById('ai-provider-select');
    if (sel) sel.value = provider;
  }
  // Show welcome if empty
  if (_aiMessages.length === 0) {
    _aiMessages.push({ role: 'assistant', content: 'Activity log analysis ready. Ask me anything about your project activity.' });
    _renderAiMessages();
  }
}

function _renderAiMessages() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;
  container.innerHTML = _aiMessages.map(m => {
    const isUser = m.role === 'user';
    return `
      <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] px-4 py-2 rounded-2xl ${isUser
          ? 'bg-indigo-600 text-white'
          : 'bg-[#0d1117] border border-[#30363d] text-[#c9d1d9]'}">${_escapeHtmlChat(m.content)}</div>
      </div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
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
  _aiMessages.push({ role: 'user', content: msg });
  _aiMessages.push({ role: 'assistant', content: '...' });
  _renderAiMessages();

  const provider = document.getElementById('ai-provider-select')?.value || 'openai';

  try {
    const reply = await apiAnalyzeLogs(msg, provider);
    _aiMessages[_aiMessages.length - 1].content = reply;
  } catch (err) {
    _aiMessages[_aiMessages.length - 1].content = 'Error: ' + (err.message || err);
  }
  _renderAiMessages();
}
