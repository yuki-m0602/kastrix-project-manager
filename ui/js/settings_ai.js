// ── Settings: AI Configuration ────────────────────────────

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
