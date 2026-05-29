// js/events.js (original, no owner.js integration)
import { DOM } from './DOM.js';
import { state } from './state.js';
import { CONFIG } from './config.js';

import { fetchProfile, fetchAvatarBlob } from './api.js';
import { flattenProfileData } from './extractor.js';
import { insertUserJson, insertUserApi, updateStatusDisplay, upsertUserPosts, populateUserSelect, loadPostsForOwner } from './database.js';

import { renderTable, renderStats, renderProgress, updateButtons, updateColumnWidths, scheduleTableRender, buildColumnToggleUI } from './renderer.js';
import { fetchAllProfiles, fetchAllBlocked, pause, stop } from './fetcher.js';
import { fetchAllProfilesAndBlocked } from './fetcher.js';
import { downloadProfilesJSON, downloadFollowingJSON, downloadSQLiteDB } from './downloads.js';
import { extractFollowing, extractFollowers, extractBlocked } from './extractor.js';

import { extractPosts } from './posts.js';
import { helpers } from './helpers.js';

import { renderGrid } from './gridRender.js';

function openSettings() {
  DOM.apiKeyInput.value = localStorage.getItem('myKey') || '';
  DOM.concurrencyInput.value = CONFIG.concurrency;
  DOM.timeoutInput.value = CONFIG.timeout;
  DOM.dbFilePathInput.value = CONFIG.dbFilePath;
  DOM.fetchAvatarBlobsCheckbox.checked = CONFIG.fetchAvatarBlobs;
  DOM.populatePostsCheckbox.checked = state.populatePosts;
  DOM.settingsModal.classList.remove('hidden');
  DOM.sliceStartInput.value = CONFIG.sliceStart;
DOM.sliceLengthInput.value = CONFIG.sliceLength;
}

function closeSettings() {
  DOM.settingsModal.classList.add('hidden');
}

function saveSettings() {
  const apiKey = DOM.apiKeyInput.value.trim();
  if (apiKey) {
    localStorage.setItem('myKey', apiKey);
  } else {
    localStorage.removeItem('myKey');
  }
  const concurrency = Math.max(1, parseInt(DOM.concurrencyInput.value) || 8);
  const timeout = Math.max(1000, parseInt(DOM.timeoutInput.value) || 15000);
  const fetchAvatarBlobs = DOM.fetchAvatarBlobsCheckbox.checked;
  const dbFilePath = DOM.dbFilePathInput.value.trim() || DEFAULT_DB_FILE_PATH;
  
  localStorage.setItem('concurrency', concurrency);
  localStorage.setItem('fetchTimeout', timeout);
  localStorage.setItem('fetchAvatarBlobs', fetchAvatarBlobs);
  localStorage.setItem('dbFilePath', dbFilePath);
  state.populatePosts = DOM.populatePostsCheckbox.checked;
localStorage.setItem('populatePosts', state.populatePosts);
  
  CONFIG.concurrency = concurrency;
  CONFIG.timeout = timeout;
  CONFIG.fetchAvatarBlobs = fetchAvatarBlobs;
  CONFIG.dbFilePath = dbFilePath;
  const sliceStart = Math.max(0, parseInt(DOM.sliceStartInput.value) || 0);
const sliceLength = Math.max(1, parseInt(DOM.sliceLengthInput.value) || 10);
localStorage.setItem('sliceStart', sliceStart);
localStorage.setItem('sliceLength', sliceLength);
CONFIG.sliceStart = sliceStart;
CONFIG.sliceLength = sliceLength;
  
  closeSettings();
}

export function setupEventListeners() {
  // Settings modal
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeSettingsBtn.addEventListener('click', closeSettings);
  DOM.modalOverlay.addEventListener('click', closeSettings);
  DOM.saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Column toggle
  DOM.columnToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.columnDropdown.classList.toggle('hidden');
    if (!DOM.columnDropdown.classList.contains('hidden')) {
      buildColumnToggleUI();
    }
  });
  document.addEventListener('click', (e) => {
    if (!DOM.columnDropdown.contains(e.target) && e.target !== DOM.columnToggleBtn) {
      DOM.columnDropdown.classList.add('hidden');
    }
  });
  DOM.columnDropdown.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const col = e.target.dataset.col;
      if (e.target.checked) {
        state.columnVisibility.delete(col);
      } else {
        state.columnVisibility.add(col);
      }
      updateColumnWidths();
      renderTable();
    }
  });
  
  // Upload button
  DOM.uploadBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      state.profileData = [];
      state.blockedData = [];
      DOM.downloadProfilesBtn.disabled = true;
      DOM.downloadFollowingBtn.disabled = true;
      DOM.fetchBlockedBtn.disabled = true;
      
      // --- show loading animation ---
      DOM.loadingOverlay.classList.remove('hidden');
      
      try {
        const text = await file.text();
        state.rawJsonData = JSON.parse(text);
        
        if (!state.rawJsonData?.["Profile And Settings"]) {
          throw new Error('Invalid TikTok JSON: "Profile And Settings" not found');
        }
        
        
        const profileMap = state.rawJsonData?.["Profile And Settings"]?.["Profile Info"]?.["ProfileMap"] || {};
        state.me = {
          userName: (profileMap.userName || '').trim().replace(/^@+/, ''),
          accountRegion: profileMap.accountRegion || '',
          birthDate: profileMap.birthDate || '',
          displayName: profileMap.displayName || '',
          emailAddress: profileMap.emailAddress || '',
          profilePhoto: profileMap.profilePhoto || '',
          telephoneNumber: profileMap.telephoneNumber || '',
          followerCount: profileMap.followerCount || 0,
          followingCount: profileMap.followingCount || 0,
          likesReceived: profileMap.likesReceived || 0,
        };
        
        const followingResult = extractFollowing(state.rawJsonData);
        state.rawTotal = followingResult.rawTotal;
        state.filteredFollowing = followingResult.list.length;
        
        const followerResult = extractFollowers(state.rawJsonData);
        state.rawFollowers = followerResult.rawTotal;
        state.filteredFollowers = followerResult.list.length;
        
        const blockedResult = extractBlocked(state.rawJsonData);
        state.blockedList = blockedResult.list;
        DOM.fetchBlockedBtn.disabled = (blockedResult.list.length === 0);
        
        const followerMap = new Map();
        followerResult.list.forEach(f => followerMap.set(f.UserName, f.Date));
        state.followingList = followingResult.list.map(item => {
          const followerDate = followerMap.get(item.UserName) || null;
          return { ...item, followerDate, friendship: followerDate ? 'friend' : 'following' };
        });
        state.friendsCount = state.followingList.filter(i => i.friendship === 'friend').length;
        
        state.me.rawFollowingJson = state.rawTotal;
        state.me.cleanFollowingJson = state.filteredFollowing;
        state.me.rawFollowerJson = state.rawFollowers;
        state.me.cleanFollowersJson = state.filteredFollowers;
        state.me.friendsJson = state.friendsCount;
        
      

// After extracting posts
const { rawTotalPosts, posts } = extractPosts(state.rawJsonData);
state.rawTotalPosts = rawTotalPosts;

if (state.populatePosts) {
  // Process cover images for top 10 liked posts (non-blocking)
  (async () => {
    const sortedPosts = [...posts].sort((a, b) => (b.Likes || 0) - (a.Likes || 0));
    //const topPosts = sortedPosts.slice(0, 10);
    const topPosts = sortedPosts.slice(CONFIG.sliceStart, CONFIG.sliceStart + CONFIG.sliceLength);
    const processedPosts = [];
    for (const post of topPosts) {
      const { data, expired } = await helpers.processCoverImage(post.CoverImage);
      processedPosts.push({
        Date: post.Date,
        Likes: post.Likes,
        Sound: post.Sound,
        coverImageData: data,
        expired: expired
      });
    }
    state.videoList = processedPosts;
    state.processedLength = processedPosts.length;
    renderGrid();
    if (state.me.userName) {
      await upsertUserPosts(state.me.userName, processedPosts);
    }
  
  })(); // no await – runs in background
} else {
  state.videoList = [];
renderGrid();
}
// The loading overlay can close right away.

        insertUserJson(state.me);
        populateUserSelect();
        
        if (state.me.userName) {
          try {
            const ownApi = await fetchProfile(state.me.userName, { timeout: CONFIG.timeout });
            const ownFlat = flattenProfileData(ownApi, { UserName: state.me.userName, Date: '' });
            ownFlat.status = 'success';
            if (CONFIG.fetchAvatarBlobs) {
              ownFlat.avatar = await fetchAvatarBlob(ownFlat.avatarUrl);
              if (ownFlat.avatar) {
                ownFlat.avatarObjectURL = URL.createObjectURL(ownFlat.avatar);
              }
            }
            state.userData = ownFlat;
            await insertUserApi(ownFlat);
          } catch (err) {
            console.warn('Own profile fetch failed', err);
          }
        }
        
        renderStats();
        renderTable();
        updateButtons();
        DOM.progressBar.style.width = '0%';
        DOM.progressText.textContent = '';
        state.fetchState = 'idle';
        updateButtons();
      } catch (err) {
        alert('Error: ' + helpers.escapeHtml(err.message));
      } finally {
        // --- hide loading animation ---
        DOM.loadingOverlay.classList.add('hidden');
      }
    };
    input.click();
  });
  
  // Fetch / pause / stop
  DOM.fetchAllBtn.addEventListener('click', async () => {
    if (state.fetchState !== 'idle') return;
    DOM.downloadProfilesBtn.disabled = true;
    await fetchAllProfilesAndBlocked();
    if (state.profileData.length) DOM.downloadProfilesBtn.disabled = false;
  });
  
  DOM.fetchBlockedBtn.addEventListener('click', async () => {
    if (!state.blockedList.length || state.fetchState !== 'idle') return;
    await fetchAllBlocked();
  });
  
  DOM.pauseBtn.addEventListener('click', pause);
  DOM.stopBtn.addEventListener('click', stop);
  
  // Downloads
  DOM.downloadProfilesBtn.addEventListener('click', downloadProfilesJSON);
  DOM.downloadFollowingBtn.addEventListener('click', downloadFollowingJSON);
  DOM.downloadSQLiteBtn.addEventListener('click', downloadSQLiteDB);
  
  // Sorting
  DOM.profileTableHead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-col]');
    if (!th) return;
    const col = th.dataset.col;
    if (state.currentSort.col === col) {
      state.currentSort.dir = state.currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.currentSort.col = col;
      state.currentSort.dir = 'desc';
    }
    renderTable();
  });
  
  // Extra buttons
  DOM.switchBlockBtn.addEventListener('click', () => {
    DOM.fetchBlock.classList.toggle('hidden');
    DOM.failedBlock.classList.toggle('hidden');
  });
  
  DOM.getFailedBtn.addEventListener('click', () => {
    const failed = state.profileData.filter(r => r.status === 'failed').map(r => r.username);
    DOM.failedPre.textContent = JSON.stringify(failed, null, 2);
  });
  
  DOM.compareUserBtn.addEventListener('click', () => {
    if (!state.sqliteReady || !state.sqliteDB) {
      DOM.comparePre.textContent = 'SQLite database not ready.';
      return;
    }
    if (!state.me?.userName) {
      DOM.comparePre.textContent = 'No owner uploaded.';
      return;
    }
    try {
      // Show blocked users for this owner who do NOT have is_following = 1
      const rows = state.sqliteDB.jaferAll(`
        SELECT username, displayName
        FROM profiles
        WHERE owner_username = ?
          AND is_blocked = 1 AND is_following = 0
      `, [state.me.userName]);
      DOM.comparePre.textContent = JSON.stringify(rows, null, 2);
    } catch (err) {
      DOM.comparePre.textContent = 'Error: ' + err.message;
    }
  });
  
  DOM.compareBlockedBtn.addEventListener('click', () => {
    const failedUsernames = state.profileData
      .filter(r => r.status === 'failed')
      .map(r => r.username);
    const blockedUsernames = state.blockedList.map(i => i.UserName);
    const intersection = failedUsernames.filter(u => blockedUsernames.includes(u));
    DOM.blockedPre.textContent = JSON.stringify(intersection, null, 2);
  });
  
  // User selection change
const userSelect = document.getElementById('users');
if (userSelect) {
  userSelect.addEventListener('change', async (e) => {
    const selectedUsername = e.target.value;
    if (!selectedUsername) return;
    
    // Load posts for this owner
    const posts = loadPostsForOwner(selectedUsername);
    state.videoList = posts;
    state.processedLength = posts.length;
    
    // Update stats display
    if (DOM.processedPosts) {
      DOM.processedPosts.textContent = helpers.formatNumber(state.processedLength);
    }
    
    // Render grid (if grid is visible) or just store for later
    renderGrid();
    
    // Optional: Also load owner's profile data into state.me and state.userData
    // This would require more work – but you can also switch the profiles table view.
    // For now, just update the posts grid.
  });
}
  
  updateColumnWidths();
  updateButtons();
  
  
  // Toggle between grid and table views
const toggleGridBtn = document.getElementById('toggleGrid');
const toggleTableBtn = document.getElementById('toggleTable');
const gridContainer = document.getElementById('gridContainer');
const tableContainer = document.getElementById('tableContainer');

function showGrid() {
  if (gridContainer) gridContainer.classList.remove('hidden');
  if (tableContainer) tableContainer.classList.add('hidden');
}

function showTable() {
  if (gridContainer) gridContainer.classList.add('hidden');
  if (tableContainer) tableContainer.classList.remove('hidden');
  renderTable(); // ensure table is up to date
}

if (toggleGridBtn) toggleGridBtn.addEventListener('click', showGrid);
if (toggleTableBtn) toggleTableBtn.addEventListener('click', showTable);

}