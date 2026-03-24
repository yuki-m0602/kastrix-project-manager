// ── Project View ──────────────────────────────────────────
function setProjectViewMode(mode) {
  currentProjectViewMode = mode;
  const gridView = document.getElementById('projects-grid-view');
  const listView = document.getElementById('projects-list-view');
  const btnGrid  = document.getElementById('btn-project-grid');
  const btnList  = document.getElementById('btn-project-list');
  if (mode === 'grid') {
    gridView.style.display = '';
    if (listView) listView.style.display = 'none';
    btnGrid?.classList.add('bg-[#30363d]', 'text-white');
    btnGrid?.classList.remove('text-[#8b949e]');
    btnList?.classList.remove('bg-[#30363d]', 'text-white');
    btnList?.classList.add('text-[#8b949e]');
  } else {
    if (gridView) gridView.style.display = 'none';
    if (listView) listView.style.display = 'block';
    btnList?.classList.add('bg-[#30363d]', 'text-white');
    btnList?.classList.remove('text-[#8b949e]');
    btnGrid?.classList.remove('bg-[#30363d]', 'text-white');
    btnGrid?.classList.add('text-[#8b949e]');
  }
}

function renderProjects() {
  const container = document.getElementById('projects-grid-view');
  if (!container) return;
  const sortValue  = document.getElementById('project-sort')?.value || 'modified';
  const langFilter = document.getElementById('project-lang-filter')?.value || 'all';
  let sorted = [...(localProjects || [])];
  if (sortValue === 'name')          sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortValue === 'git')      sorted.sort((a, b) => new Date(b.gitModified) - new Date(a.gitModified));
  else if (sortValue === 'language') sorted.sort((a, b) => (a.language || '').localeCompare(b.language || ''));
  else                               sorted.sort((a, b) => new Date(b.localModified) - new Date(a.localModified));
  if (langFilter !== 'all')     sorted = sorted.filter(p => (p.language || '').toLowerCase() === langFilter);

  const emptyHtml = `
    <div class="col-span-full flex flex-col items-center justify-center py-16 px-4 text-center">
      <i data-lucide="folder-plus" size="48" class="text-[#484f58] mb-4"></i>
      <p class="text-sm font-bold text-white mb-1">No projects yet</p>
      <p class="text-xs text-[#8b949e] mb-4">Add a folder to scan for Git projects</p>
      <button onclick="addProjectFolder()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white">
        <i data-lucide="folder-plus" size="14" class="inline mr-1"></i> Add Folder
      </button>
    </div>`;
  container.innerHTML = sorted.length === 0 ? emptyHtml : sorted.map(p => {
    const lang = langColors[(p.language || '').toLowerCase()] || { bg: 'bg-[#8b949e20]', text: 'text-[#8b949e]', label: '?' };
    return `
      <div onclick="openProjectDetailModal('${escapeHtml(p.id)}')" class="bg-[#161b22] border border-[#30363d] rounded-2xl p-3 sm:p-4 hover:border-[#484f58] transition-all cursor-pointer">
        <div class="flex items-start justify-between mb-2 sm:mb-3">
          <div class="flex items-center gap-2 sm:gap-3 min-w-0">
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#21262d] flex items-center justify-center shrink-0">
              <i data-lucide="folder-git-2" size="18" class="text-indigo-400"></i>
            </div>
            <div class="min-w-0">
              <h3 class="font-bold text-white text-sm sm:text-base truncate">${escapeHtml(p.name)}</h3>
              <p class="text-[9px] sm:text-xs text-[#8b949e] truncate">${escapeHtml(p.path || '')}</p>
            </div>
          </div>
          <span class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[10px] font-black ${lang.bg} ${lang.text} shrink-0 ml-2">${escapeHtml(lang.label)}</span>
        </div>
        <div class="space-y-0.5 sm:space-y-1 text-[9px] sm:text-xs text-[#8b949e]">
          <div class="flex justify-between"><span>Local</span><span>${escapeHtml(p.localModified || '')}</span></div>
          <div class="flex justify-between"><span>Git</span><span>${escapeHtml(p.gitModified || '')}</span></div>
        </div>
        <div class="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-[#30363d]">
          <p class="text-[9px] sm:text-xs text-indigo-400 truncate">${escapeHtml(p.lastCommit || '')}</p>
        </div>
      </div>`;
  }).join('');

  // リストビューも動的描画
  const listBody = document.getElementById('projects-list-body');
  if (listBody) {
    listBody.innerHTML = sorted.length === 0
      ? '<tr><td colspan="2" class="p-8 text-center text-[#8b949e] text-sm">No projects yet. Add a folder to get started.</td></tr>'
      : sorted.map(p => {
      const lang = langColors[(p.language || '').toLowerCase()] || { bg: 'bg-[#8b949e20]', text: 'text-[#8b949e]', label: '?' };
      return `
        <tr onclick="openProjectDetailModal('${escapeHtml(p.id)}')" class="hover:bg-[#161b22] cursor-pointer">
          <td class="p-2 sm:p-4 border-b border-[#30363d]">
            <div class="flex items-center gap-2 sm:gap-3">
              <div class="w-5 h-5 rounded-md ${lang.bg} ${lang.text} flex items-center justify-center text-[9px] font-black">${escapeHtml(p.name ? p.name[0] : '?')}</div>
              <div>
                <p class="text-sm font-bold text-white">${escapeHtml(p.name)}</p>
                <p class="text-[8px] sm:text-[9px] text-[#8b949e]">${escapeHtml(p.path || '')}</p>
              </div>
            </div>
          </td>
          <td class="p-2 sm:p-4 text-right border-b border-[#30363d]">
            <div class="space-y-0.5 sm:space-y-1 text-right">
              <p class="text-[8px] sm:text-[9px] text-[#8b949e]">Git: ${escapeHtml(p.gitModified || '')}</p>
              <p class="text-[8px] sm:text-[9px] text-[#8b949e]">Local: ${escapeHtml(p.localModified || '')}</p>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  lucide.createIcons();
}

function sortProjects(_v)           { renderProjects(); }
function filterProjectsByLang(_v)   { renderProjects(); }

// Add project folder — registers as watched dir and scans
async function addProjectFolder() {
  if (_isTauri) {
    const result = await window.__TAURI__.dialog.open({ directory: true, title: 'Select projects folder' });
    if (result) {
      await apiAddWatchedDir(result);
      await apiScanDirectory(result);
      await loadData();
      renderProjects();
    }
  } else {
    const p = prompt('Enter projects directory path:');
    if (p) showAlert('フォルダスキャンは Tauri 環境でのみ利用できます。', 'info');
  }
}

// Project filter setters
function setProjLang(value, label) {
  document.getElementById('label-lang').textContent = label;
  document.getElementById('dd-lang')?.classList.add('hidden');
  const sel = document.getElementById('project-lang-filter');
  if (sel) sel.value = value;
  renderProjects();
}

function setProjSort(value, label) {
  document.getElementById('label-proj-sort').textContent = label;
  document.getElementById('dd-proj-sort')?.classList.add('hidden');
  const sel = document.getElementById('project-sort');
  if (sel) sel.value = value;
  renderProjects();
}

function openProjectDetailModal(projectId) {
  const project = localProjects.find(p => String(p.id) === String(projectId));
  if (!project) return;
  const lang = langColors[(project.language || '').toLowerCase()] || { label: '?' };
  document.getElementById('project-modal-name').textContent      = project.name;
  document.getElementById('project-modal-lang-badge').textContent = lang.label;
  document.getElementById('project-modal-local').textContent     = project.localModified;
  document.getElementById('project-modal-git').textContent       = project.gitModified;
  document.getElementById('project-modal-path').textContent      = project.path;
  const readmeEl = document.getElementById('project-modal-readme');
  if (readmeEl) {
    readmeEl.innerHTML = '<p class="text-[#8b949e] text-xs">Loading...</p>';
    apiGetReadme(project.path).then(content => {
      readmeEl.innerHTML = typeof renderMarkdown === 'function' ? renderMarkdown(content) : `<pre class="text-sm text-[#c9d1d9] whitespace-pre-wrap font-mono">${escapeHtml(content || '')}</pre>`;
    }).catch(() => {
      readmeEl.innerHTML = '<p class="text-[#8b949e] text-xs">README not available</p>';
    });
  }
  const modal   = document.getElementById('project-detail-modal');
  const content = document.getElementById('project-detail-modal-content');
  if (modal && content) {
    modal.style.display = '';
    content.classList.remove('translate-x-full');
    _pushModalHistory('project');
  }
}

function closeProjectDetailModal() {
  const modal = document.getElementById('project-detail-modal');
  const content = document.getElementById('project-detail-modal-content');
  if (content) {
    modal.style.display = 'none';
    content.classList.add('translate-x-full');
  }
  if (_modalHistory === 'project') {
    _modalHistory = null;
    history.back();
  }
}

function openProjectModal(projectId) {
  // Try direct match first (backend UUIDs), fallback to dummy data conversion
  const direct = localProjects.find(p => String(p.id) === String(projectId));
  if (direct) {
    openProjectDetailModal(direct.id);
    return;
  }
  const num = parseInt(projectId.replace('proj-', ''));
  if (!isNaN(num)) openProjectDetailModal(num);
}

async function launchIDE(ide) {
  const pathEl = document.getElementById('project-modal-path');
  const path = pathEl?.textContent?.trim() || null;
  await apiOpenInIde(ide, path);
}
