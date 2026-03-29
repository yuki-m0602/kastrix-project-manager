// ── UI: Init Module ────────────────────────────────────────
// 起動・ウィンドウ制御（ロジックの初期化入口はこのファイルのみ）

/** Tauri v2: `window.__TAURI__.window` は WebviewWindow インスタンスではない。公式 API は invoke。 */
function getTauriWindowLabel() {
  try {
    const w = window.__TAURI_INTERNALS__?.metadata?.currentWindow;
    if (w && typeof w.label === 'string' && w.label.length > 0) return w.label;
  } catch (_) {
    /* ignore */
  }
  return 'main';
}

function invokeTauriWindow(cmd) {
  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== 'function') {
    return Promise.reject(new Error('Tauri core.invoke unavailable'));
  }
  return invoke(`plugin:window|${cmd}`, { label: getTauriWindowLabel() });
}

async function initWindowControls() {
  if (!window.__TAURI__?.core?.invoke) return;
  const closeBtn = document.getElementById('btn-close');
  const minBtn = document.getElementById('btn-minimize');
  const maxBtn = document.getElementById('btn-maximize');
  const bind = (el, fn) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void fn().catch((err) => console.error('titlebar control failed:', err));
    });
  };
  try {
    bind(closeBtn, () => invokeTauriWindow('close'));
    bind(minBtn, () => invokeTauriWindow('minimize'));
    bind(maxBtn, () => invokeTauriWindow('toggle_maximize'));
  } catch (e) {
    console.error('initWindowControls failed:', e);
  }
}

function fixFilterIconSizes() {
  ['task-filter', 'project-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const icon = el.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('width', '14');
      icon.setAttribute('height', '14');
    }
  });
}

/**
 * アプリ起動時の単一初期化（DOMContentLoaded / 即時の両方で同じ関数）
 */
async function init() {
  try {
    await initWindowControls();
    closeAllDropdowns();
    await loadData();
    setTaskView('list');
    setProjectViewMode('grid');
    switchMainTab('projects');
    lucide.createIcons();
    fixFilterIconSizes();
    if (typeof updateSidebarRoomInfo === 'function') await updateSidebarRoomInfo();
    if (typeof updateSidebarUnsyncedBadge === 'function') await updateSidebarUnsyncedBadge();
    if (_isTauri && typeof updateSidebarRoomInfo === 'function') {
      [1000, 2000, 3000].forEach((ms) => {
        setTimeout(() => updateSidebarRoomInfo(), ms);
      });
    }
    if (_isTauri && typeof updateSidebarUnsyncedBadge === 'function') {
      [500, 2000].forEach((ms) => {
        setTimeout(() => updateSidebarUnsyncedBadge(), ms);
      });
    }
    window.addEventListener('resize', () => {
      if (typeof syncSidebarCollapsedClass === 'function') syncSidebarCollapsedClass();
    });
    if (typeof registerTauriTeamEventListeners === 'function') {
      registerTauriTeamEventListeners();
    }
    console.log('Kastrix initialized');
  } catch (e) {
    console.error('init failed:', e);
  }
}

function boot() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
    });
  } else {
    init();
  }
}

boot();

window.init = init;
window.initWindowControls = initWindowControls;
window.fixFilterIconSizes = fixFilterIconSizes;
