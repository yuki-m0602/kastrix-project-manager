// ── Settings: AI Configuration ────────────────────────────

async function fetchAiModels(provider) {
  const sel = document.getElementById(provider + '-model-select');
  if (!sel) return;
  const currentVal = sel.value;
  try {
    sel.disabled = true;
    sel.innerHTML = '<option>取得中...</option>';
    const models = await apiListAiModels(provider);
    sel.innerHTML = models.map((m) =>
      `<option value="${escapeHtml(m)}" ${m === currentVal ? 'selected' : ''}>${escapeHtml(m)}</option>`
    ).join('');
    if (models.length > 0 && !models.includes(currentVal)) {
      await apiSetSetting('ai_model_' + provider, models[0]);
    }
  } catch (e) {
    sel.innerHTML = `<option value="${escapeHtml(currentVal)}">${escapeHtml(currentVal || '(取得失敗)')}</option>`;
    showAlert('モデル一覧の取得に失敗しました: ' + (e?.message || e), 'error');
  } finally {
    sel.disabled = false;
  }
}

async function saveAiModel(provider, model) {
  if (!model) return;
  try {
    await apiSetSetting('ai_model_' + provider, model);
  } catch (e) {
    showAlert('保存に失敗しました: ' + (e?.message || e), 'error');
  }
}

async function saveKey(provider) {
  const input = document.getElementById(provider + '-key-input');
  if (!input || !input.value.trim()) return;
  await apiSaveApiKey(provider, input.value.trim());
  input.value = '';
  renderSettings();
}

async function deleteKey(provider) {
  if (!confirm(`${provider} の API キーを削除しますか？`)) return;
  await apiDeleteApiKey(provider);
  renderSettings();
}

async function saveAiProvider(value) {
  await apiSetSetting('ai_provider', value);
}

let _aiKeyDebugOpen = false;
function toggleAiKeyDebug() {
  const panel = document.getElementById('ai-key-debug-panel');
  if (!panel) return;
  _aiKeyDebugOpen = !_aiKeyDebugOpen;
  panel.classList.toggle('hidden', !_aiKeyDebugOpen);
  if (_aiKeyDebugOpen) refreshAiKeyDebug();
}

async function refreshAiKeyDebug() {
  const content = document.getElementById('ai-key-debug-content');
  if (!content) return;
  if (!_isTauri) {
    content.innerHTML = '<span class="text-[#484f58]">Tauri 環境でのみ利用可能</span>';
    return;
  }
  content.innerHTML = '<span class="text-[#484f58]">確認中...</span>';
  try {
    const [openai, anthropic, openrouter] = await Promise.all([
      apiGetApiKeyStatus('openai'),
      apiGetApiKeyStatus('anthropic'),
      apiGetApiKeyStatus('openrouter'),
    ]);
    const ok = '<span class="text-emerald-400">保存済み・取得OK</span>';
    const ng = '<span class="text-red-400">なし</span>';
    content.innerHTML = `
      <div>OpenAI: ${openai ? ok : ng}</div>
      <div>Anthropic: ${anthropic ? ok : ng}</div>
      <div>OpenRouter: ${openrouter ? ok : ng}</div>
    `;
  } catch (e) {
    content.innerHTML = '<span class="text-red-400">エラー: ' + escapeHtml(String(e?.message || e)) + '</span>';
  }
}
