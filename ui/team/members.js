// ── Team: Members Module ────────────────────────────────────────
// メンバー管理機能

/**
 * チームメンバーの一覧を表示
 */
async function renderTeamMembers() {
  if (!_isTauri) return;
  const section = document.getElementById('team-members-section');
  const list = document.getElementById('team-members-list');
  if (!section || !list) return;
  try {
    const [members, amIHost, myRole] = await Promise.all([
      apiTeamListMembers(),
      apiTeamAmIHost(),
      apiTeamGetMyRole(),
    ]);
    if (members.length === 0) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    const roleLabel = (r) => ({ host: 'HOST', co_host: 'CO-HOST', member: 'MEMBER' }[r] || r);
    const canKick = myRole === 'host' || myRole === 'co_host';
    list.innerHTML = members.map((m) => {
      let actions = '';
      if (m.role !== 'host') {
        const ep = escapeHtml(m.endpoint_id);
        if (amIHost && m.role === 'member') {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamPromoteToCoHost(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">CO-HOSTに昇格</button>`;
        }
        if (canKick) {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamKick(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-amber-400 hover:bg-amber-500/10 rounded-lg">キック</button>`;
        }
        if (amIHost) {
          actions += `<button type="button" data-endpoint="${ep}" onclick="teamBlock(this.dataset.endpoint)" class="px-2 py-1 text-[9px] font-bold text-red-400 hover:bg-red-500/10 rounded-lg">ブロック</button>`;
        }
      }
      const label = m.display_name || m.endpoint_id.slice(0, 20) + '...';
      return `
        <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-[#30363d] rounded-xl">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xs text-white truncate" title="${escapeHtml(m.endpoint_id)}">${escapeHtml(label)}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 shrink-0">${roleLabel(m.role)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">${actions}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load members:', e);
    section.classList.add('hidden');
  }
}

/**
 * メンバーをCO-HOSTに昇格
 */
async function teamPromoteToCoHost(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamPromoteToCoHost(endpointId);
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    await renderTeamMembers();
  } catch (e) {
    console.error('Promote failed:', e);
    showAlert('昇格に失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * メンバーをキック
 */
async function teamKick(endpointId) {
  if (!_isTauri || !endpointId) return;
  if (!(await confirmAsync('このメンバーをキックしますか？'))) return;
  try {
    await apiTeamKick(endpointId);
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    await renderTeamMembers();
    await renderTeamBlocked();
  } catch (e) {
    console.error('Kick failed:', e);
    showAlert('キックに失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * メンバーをブロック
 */
async function teamBlock(endpointId) {
  if (!_isTauri || !endpointId) return;
  if (!(await confirmAsync('このメンバーをブロックしますか？ブロックされたメンバーは新規招待コードでも参加できなくなります。'))) return;
  try {
    await apiTeamBlock(endpointId);
    if (typeof window.renderTeamView === 'function') await window.renderTeamView();
    await renderTeamMembers();
    await renderTeamBlocked();
  } catch (e) {
    console.error('Block failed:', e);
    showAlert('ブロックに失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * ブロックを解除
 */
async function teamUnblock(endpointId) {
  if (!_isTauri || !endpointId) return;
  try {
    await apiTeamUnblock(endpointId);
    await renderTeamBlocked();
  } catch (e) {
    console.error('Unblock failed:', e);
    showAlert('ブロック解除に失敗しました: ' + (e?.message || e), 'error');
  }
}

/**
 * ブロック一覧を表示
 */
async function renderTeamBlocked() {
  if (!_isTauri) return;
  const section = document.getElementById('team-blocked-section');
  const list = document.getElementById('team-blocked-list');
  if (!section || !list) return;
  try {
    const [blocked, amIHost] = await Promise.all([
      apiTeamListBlocked(),
      apiTeamAmIHost(),
    ]);
    if (blocked.length === 0 || !amIHost) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    list.innerHTML = blocked.map((m) => {
      const label = m.display_name || m.endpoint_id.slice(0, 20) + '...';
      return `
      <div class="flex items-center justify-between p-3 bg-[#0d1117] border border-red-500/30 rounded-xl">
        <span class="text-xs text-[#8b949e] truncate" title="${escapeHtml(m.endpoint_id)}">${escapeHtml(label)}</span>
        <button onclick="teamUnblock('${escapeHtml(m.endpoint_id)}')" class="px-2 py-1 text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-lg">ブロック解除</button>
      </div>
    `;
    }).join('');
  } catch (e) {
    console.error('Failed to load blocked:', e);
    section.classList.add('hidden');
  }
}

// Expose globally for HTML onclick
window.renderTeamMembers = renderTeamMembers;
window.teamPromoteToCoHost = teamPromoteToCoHost;
window.teamKick = teamKick;
window.teamBlock = teamBlock;
window.teamUnblock = teamUnblock;
window.renderTeamBlocked = renderTeamBlocked;