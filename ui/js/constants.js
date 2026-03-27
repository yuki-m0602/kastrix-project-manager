// ── アプリ定数 ────────────────────────────────────────────

const SETTINGS_LOAD_TIMEOUT_MS = 10000;
const TOAST_DURATION_MS = 4500;

const SYNC_MODE_AUTO = 'auto';
const SYNC_MODE_MANUAL = 'manual';

// ── HTML エスケープ（XSS 対策） ──────────────────────────
function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
