// Project functions
export function renderProjects() {
  const gridView = document.getElementById('projects-grid-view');
  const listView = document.getElementById('projects-list-body');
  
  if (gridView) {
    gridView.innerHTML = state.localProjects.map(p => `
      <div class="project-card bg-[#161b22] border border-[#30363d] rounded-2xl p-4 hover:bg-[#21262d] transition-all cursor-pointer" 
           onclick="openProjectDetailModal('${p.id}')">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-center">
            <span class="text-[#8b949e] text-[12px] font-black">${p.language[0].toUpperCase()}</span>
          </div>
          <div class="flex-1">
            <p class="text-sm font-bold text-white">${p.name}</p>
            <p class="text-[9px] text-[#8b949e]">${p.path}</p>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  if (listView) {
    listView.innerHTML = state.localProjects.map(p => `
      <tr onclick="openProjectDetailModal('${p.id}')" class="hover:bg-[#161b22]">
        <td class="p-4">
          <div class="flex items-center gap-3">
            <div class="w-5 h-5 rounded-md bg-[#2b748920] text-[#2b7489] flex items-center justify-center text-[9px] font-black">${p.language[0].toUpperCase()}</div>
            <div>
              <p class="text-sm font-bold text-white">${p.name}</p>
              <p class="text-[8px] text-[#8b949e]">${p.path}</p>
            </div>
          </div>
        </td>
        <td class="p-4 text-right">
          <div class="space-y-0.5 text-right">
            <p class="text-[8px] text-[#8b949e]">Git: ${p.gitModified}</p>
            <p class="text-[8px] text-[#8b949e]">Local: ${p.localModified}</p>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

export function openProjectDetailModal(projectId) {
  const project = state.localProjects.find(p => p.id === parseInt(projectId));
  if (!project) return;
  
  document.getElementById('project-modal-name').textContent = project.name;
  document.getElementById('project-modal-local').textContent = project.localModified;
  document.getElementById('project-modal-git').textContent = project.gitModified;
  document.getElementById('project-modal-path').textContent = project.path;
  
  const langBadge = document.getElementById('project-modal-lang-badge');
  if (langBadge) {
    const langInfo = state.langColors[project.language] || state.langColors['javascript'];
    langBadge.textContent = state.languageLabels[project.language] || 'JS';
    langBadge.className = `px-2 py-0.5 rounded text-[9px] font-black ${langInfo.bg} ${langInfo.text}`;
  }
  
  const modal = document.getElementById('project-detail-modal');
  const content = document.getElementById('project-detail-modal-content');
  modal.classList.remove('hidden');
  setTimeout(() => {
    content.classList.remove('translate-x-full');
  }, 10);
}

export function closeProjectDetailModal() {
  const content = document.getElementById('project-detail-modal-content');
  content.classList.add('translate-x-full');
  setTimeout(() => {
    document.getElementById('project-detail-modal').classList.add('hidden');
  }, 300);
}

export function launchIDE(ide) {
  const project = state.localProjects.find(p => p.id === parseInt(state.activeTabId));
  if (!project) return;
  
  const idePaths = {
    'vscode': 'C:\Users\%USERNAME%\AppData\Local\Programs\Microsoft VS Code\Code.exe',
    'cursor': 'C:\Users\%USERNAME%\AppData\Local\Programs\Cursor\Cursor.exe',
    'opencodes': 'C:\Users\%USERNAME%\AppData\Local\Programs\OpenCode\OpenCode.exe'
  };
  
  const idePath = idePaths[ide];
  if (idePath) {
    const fullPath = project.path.replace('~', process.env.HOME || process.env.USERPROFILE);
    // In real app, would use child_process to launch IDE
    console.log(`Launching ${ide} for ${fullPath}`);
  }
}