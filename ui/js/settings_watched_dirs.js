// ── Settings: Watched Directories ─────────────────────────

async function addWatchedDirectory() {
  if (_isTauri) {
    const result = await window.__TAURI__.dialog.open({ directory: true, title: '監視するディレクトリを選択' });
    if (result) {
      await apiAddWatchedDir(result);
      await apiScanDirectory(result);
      await loadData();
      renderProjects();
      renderSettings();
    }
  } else {
    const p = prompt('ディレクトリパスを入力:');
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
