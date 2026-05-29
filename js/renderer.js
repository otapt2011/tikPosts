// js/renderer.js
import { state } from './state.js';
import { helpers } from './helpers.js';
import { DOM } from './DOM.js';

let renderTimeout = null;
let tablePage = 0;
const PAGE_SIZE = 100;

export function updateColumnWidths() {
  const ths = DOM.profileTableHead.querySelectorAll('th[data-orig-width]');
  ths.forEach(th => {
    const col = th.dataset.col;
    if (col && state.columnVisibility.has(col)) {
      th.style.width = '0%';
      th.classList.add('hidden-col');
    } else {
      th.style.width = th.dataset.origWidth + '%';
      th.classList.remove('hidden-col');
    }
  });
}

export function renderStats() {
  DOM.rawTotalStat.textContent = helpers.formatNumber(state.rawTotal);
  DOM.rawTotalPosts.textContent = helpers.formatNumber(state.rawTotalPosts);
  DOM.processedPosts.textContent = helpers.formatNumber(state.processedLength);
  DOM.filteredStat.textContent = helpers.formatNumber(state.filteredFollowing);
  DOM.rawFollowersStat.textContent = helpers.formatNumber(state.rawFollowers);
  DOM.validFollowersStat.textContent = helpers.formatNumber(state.filteredFollowers);
  DOM.friendsCountStat.textContent = helpers.formatNumber(state.friendsCount);
  DOM.blockedCountStat.textContent = helpers.formatNumber(state.blockedList.length);
}

export function scheduleTableRender() {
  if (renderTimeout) clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => { renderTable(); renderTimeout = null; }, 100);
}

export function renderTable(resetPage = true) {
  if (resetPage) tablePage = 0;
  if (!state.profileData.length) {
    DOM.tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-gray-500 dark:text-gray-400 p-4">No data to display</td></tr>';
    updateSortIndicators();
    return;
  }

  let rows = [...state.profileData];
  if (state.fetchState === 'idle') {
    const col = state.currentSort.col;
    const dir = state.currentSort.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let valA = a[col], valB = b[col];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA == null) valA = '';
      if (valB == null) valB = '';
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
  }

  const start = tablePage * PAGE_SIZE;
  const paginatedRows = rows.slice(start, start + PAGE_SIZE);
  DOM.tableBody.innerHTML = paginatedRows.map(row => {
    const avatarHtml = row.avatarObjectURL ?
      `<img src="${helpers.escapeHtml(row.avatarObjectURL)}" class="w-8 h-8 rounded-full object-cover" loading="lazy" onerror="this.style.display='none'" alt="">` :
      (row.avatarUrl ? `<img src="${helpers.escapeHtml(row.avatarUrl)}" class="w-8 h-8 rounded-full object-cover" loading="lazy" onerror="this.style.display='none'" alt="">` : '<i class="fa-solid fa-user text-gray-400"></i>');
    return `<tr class="hover:bg-gray-100 dark:hover:bg-gray-800"><td class="p-1 avatar-col">${avatarHtml}</td><td class="text-left p-1 truncate ${state.columnVisibility.has('username') ? 'hidden-col' : ''}">@${helpers.escapeHtml(row.username || '')}</td><td class="text-left p-1 truncate ${state.columnVisibility.has('displayName') ? 'hidden-col' : ''}">${helpers.escapeHtml(row.displayName || '')}</td><td class="text-center p-1 truncate ${state.columnVisibility.has('followerCount') ? 'hidden-col' : ''}">${helpers.formatNumber(row.followerCount)}</td><td class="text-center p-1 truncate ${state.columnVisibility.has('followingCount') ? 'hidden-col' : ''}">${helpers.formatNumber(row.followingCount)}</td><td class="text-center p-1 truncate ${state.columnVisibility.has('heartCount') ? 'hidden-col' : ''}">${helpers.formatNumber(row.heartCount)}</td><td class="text-center p-1 truncate ${state.columnVisibility.has('videoCount') ? 'hidden-col' : ''}">${helpers.formatNumber(row.videoCount)}</td><td class="p-1 truncate ${state.columnVisibility.has('following_date') ? 'hidden-col' : ''}">${helpers.escapeHtml(row.following_date || '')}</td><td class="text-right p-1 truncate ${state.columnVisibility.has('follower_date') ? 'hidden-col' : ''}">${helpers.escapeHtml(row.follower_date || '')}</td><td class="text-center p-1 truncate ${state.columnVisibility.has('friendship') ? 'hidden-col' : ''}">${helpers.escapeHtml(row.friendship || '')}</td></tr>`;
  }).join('');

  if (rows.length > (tablePage + 1) * PAGE_SIZE) {
    const loadMoreRow = `<tr id="loadMoreRow"><td colspan="10" class="text-center p-2"><button id="loadMoreBtn" class="text-xs bg-pink-600 hover:bg-pink-700 text-white px-3 py-1 rounded">Load More (${rows.length - (tablePage+1)*PAGE_SIZE} remaining)</button></td></tr>`;
    DOM.tableBody.insertAdjacentHTML('beforeend', loadMoreRow);
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => { tablePage++; renderTable(false); });
  }
  updateSortIndicators();
}

function updateSortIndicators() {
  const ths = DOM.profileTableHead.querySelectorAll('th[data-col]');
  ths.forEach(th => {
    const col = th.dataset.col;
    const span = th.querySelector('.sort-indicator');
    if (!span) return;
    if (col === state.currentSort.col) span.textContent = state.currentSort.dir === 'asc' ? '▲' : '▼';
    else span.textContent = '';
  });
}

export function renderProgress(current, total, message) {
  DOM.progressBar.style.width = total ? ((current / total) * 100) + '%' : '0%';
  DOM.progressText.textContent = message;
}

export function updateButtons() {
  const idle = state.fetchState === 'idle';
  const hasData = state.followingList.length > 0 || state.blockedList.length > 0;
  DOM.fetchAllBtn.disabled = !(idle && hasData);
  DOM.pauseBtn.disabled = state.fetchState !== 'running';
  DOM.stopBtn.disabled = state.fetchState === 'idle';
  DOM.downloadProfilesBtn.disabled = !(state.profileData.length > 0 && idle);
  DOM.downloadFollowingBtn.disabled = state.followingList.length === 0;
  DOM.downloadSQLiteBtn.disabled = !state.sqliteReady;
  DOM.fetchBlockedBtn.disabled = !(state.blockedList.length > 0 && idle);
  if (DOM.retryFailedBtn) DOM.retryFailedBtn.disabled = !(state.profileData.some(p => p.status === 'failed') && idle);
}

export function buildColumnToggleUI() {
  const dropdown = DOM.columnDropdown;
  const allCols = [
    { key: 'username', label: 'Username' }, { key: 'displayName', label: 'Name' }, { key: 'followerCount', label: 'Followers' },
    { key: 'followingCount', label: 'Following' }, { key: 'heartCount', label: 'Likes' }, { key: 'videoCount', label: 'Videos' },
    { key: 'following_date', label: 'Following Date' }, { key: 'follower_date', label: 'Follower Date' }, { key: 'friendship', label: 'Friendship' }
  ];
  dropdown.innerHTML = allCols.map(col => `<label class="flex items-center space-x-2 py-1 text-xs"><input type="checkbox" data-col="${col.key}" ${!state.columnVisibility.has(col.key) ? 'checked' : ''}><span>${col.label}</span></label>`).join('');
}