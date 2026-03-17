// ── Settings: IDE Preferences ─────────────────────────────

async function saveDefaultIde(value) {
  await apiSetSetting('default_ide', value);
}
