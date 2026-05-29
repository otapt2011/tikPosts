// js/events.js
import { DOM } from './DOM.js';
import { state } from './state.js';
import { CONFIG, DEFAULT_DB_FILE_PATH } from './config.js';
import { initConfig, getAppConfig, updateSetting } from './appConfig.js';
import { fetchProfileWithRetry, fetchAvatarBlob } from './api.js';
import { flattenProfileData } from './extractor.js';
import { insertUserJson, insertUserApi, updateStatusDisplay, upsertUserPosts, populateUserSelect, loadOwnerProfiles } from './database.js';
import { renderTable, renderStats, renderProgress, updateButtons, updateColumnWidths, scheduleTableRender, buildColumnToggleUI } from './renderer.js';
import { fetchAllProfiles, fetchAllBlocked, pause, stop, retryFailedProfiles } from './fetcher.js';
import { fetchAllProfilesAndBlocked } from './fetcher.js';
import { downloadProfilesJSON, downloadFollowingJSON, downloadSQLiteDB } from './downloads.js';
import { extractFollowing, extractFollowers, extractBlocked } from './extractor.js';
import { extractPosts } from './posts.js';
import { helpers } from './helpers.js';
import { renderGrid } from './gridRender.js';

// ========== Helper functions for upload (FIX #15) ==========
async function readAndParseJSON(file) {
  const text = await file.text();
  const rawData = JSON.parse(text);
  if (!rawData?.["Profile And Settings"]) throw new Error('Invalid TikTok JSON: "Profile And Settings" not found');
  return rawData;
}

function extractOwnerProfile(jsonData) {
  const profileMap = jsonData["Profile And Settings"]["Profile Info"]["ProfileMap"] || {};
  return {
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
}

function processRelationships(jsonData) {
  const followingResult = extractFollowing(jsonData);
  const followerResult = extractFollowers(jsonData);
  const blockedResult = extractBlocked(jsonData);
  const followerMap = new Map();
  followerResult.list.forEach(f => followerMap.set(f.UserName, f.Date));
  const followingList = followingResult.list.map(item => ({ ...item, followerDate: followerMap.get(item.UserName) || null, friendship: followerMap.has(item.UserName) ? 'friend' : 'following' }));
  return {
    rawTotalFollowing: followingResult.rawTotal,
    filteredFollowing: followingResult.list.length,
    rawTotalFollowers: followerResult.rawTotal,
    filteredFollowers: followerResult.list.length,
    followingList,
    blockedList: blockedResult.list,
    friendsCount: followingList.filter(i => i.friendship === 'friend').length
  };
}

function updateStateAfterUpload(owner, relationships) {
  state.me = owner;
  state.rawTotal = relationships.rawTotalFollowing;
  state.filteredFollowing = relationships.filteredFollowing;
  state.rawFollowers = relationships.rawTotalFollowers;
  state.filteredFollowers = relationships.filteredFollowers;
  state.followingList = relationships.followingList;
  state.blockedList = relationships.blockedList;
  state.friendsCount = relationships.friendsCount;
  state.me.rawFollowingJson = relationships.rawTotalFollowing;
  state.me.cleanFollowingJson = relationships.filteredFollowing;
  state.me.rawFollowerJson = relationships.rawTotalFollowers;
  state.me.cleanFollowersJson = relationships.filteredFollowers;
  state.me.friendsJson = relationships.friendsCount;
}

async function fetchOwnApiAndStore(ownerUsername) {
  try {
    const ownApi = await fetchProfileWithRetry(ownerUsername, { timeout: CONFIG.timeout });
    const ownFlat = flattenProfileData(ownApi, { UserName: ownerUsername, Date: '' });
    ownFlat.status = 'success';
    if (CONFIG.fetchAvatarBlobs) {
      ownFlat.avatar = await fetchAvatarBlob(ownFlat.avatarUrl);
      if (ownFlat.avatar) {
        if (state.userData?.avatarObjectURL) URL.revokeObjectURL(state.userData.avatarObjectURL);
        ownFlat.avatarObjectURL = URL.createObjectURL(ownFlat.avatar);
      }
    }
    state.userData = ownFlat;
    await insertUserApi(ownFlat);
  } catch (err) { console.warn('Own profile fetch failed', err); }
}

function processPostsIfNeeded(jsonData, ownerUsername) {
  const { rawTotalPosts, posts } = extractPosts(jsonData);
  state.rawTotalPosts = rawTotalPosts;
  if (!state.populatePosts) { state.videoList = []; renderGrid(); return; }
  (async () => {
    const sortedPosts = [...posts].sort((a, b) => (b.Likes || 0) - (a.Likes || 0));
    const topPosts = sortedPosts.slice(CONFIG.sliceStart, CONFIG.sliceStart + CONFIG.sliceLength);
    const processedPosts = [];
    for (const post of topPosts) {
      const { data, expired } = await helpers.processCoverImage(post.CoverImage);
      processedPosts.push({ Date: post.Date, Likes: post.Likes, Sound: post.Sound, coverImageData: data, expired });
    }
    state.videoList = processedPosts;
    state.processedLength = processedPosts.length;
    renderStats();
    renderGrid();
    if (ownerUsername) await upsertUserPosts(ownerUsername, processedPosts);
  })();
}

// ========== Settings functions using appConfig (FIX #16) ==========
function openSettings() {
  const cfg = getAppConfig();
  DOM.apiKeyInput.value = cfg.myKey;
  DOM.concurrencyInput.value = cfg.concurrency;
  DOM.timeoutInput.value = cfg.timeout;
  DOM.dbFilePathInput.value = cfg.dbFilePath;
  DOM.fetchAvatarBlobsCheckbox.checked = cfg.fetchAvatarBlobs;
  DOM.populatePostsCheckbox.checked = cfg.populatePosts;
  DOM.sliceStartInput.value = cfg.sliceStart;
  DOM.sliceLengthInput.value = cfg.sliceLength;
  DOM.settingsModal.classList.remove('hidden');
}

function closeSettings() { DOM.settingsModal.classList.add('hidden'); }

function saveSettings() {
  updateSetting('myKey', DOM.apiKeyInput.value.trim());
  updateSetting('concurrency', Math.max(1, parseInt(DOM.concurrencyInput.value) || 8));
  updateSetting('fetchTimeout', Math.max(1000, parseInt(DOM.timeoutInput.value) || 15000));
  updateSetting('fetchAvatarBlobs', DOM.fetchAvatarBlobsCheckbox.checked);
  updateSetting('dbFilePath', DOM.dbFilePathInput.value.trim() || DEFAULT_DB_FILE_PATH);
  updateSetting('sliceStart', Math.max(0, parseInt(DOM.sliceStartInput.value) || 0));
  updateSetting('sliceLength', Math.max(1, parseInt(DOM.sliceLengthInput.value) || 10));
  updateSetting('populatePosts', DOM.populatePostsCheckbox.checked);
  // Also update CONFIG properties (they are getters, so no need)
  closeSettings();
}

export function setupEventListeners() {
  // Settings modal
  DOM.settingsBtn.addEventListener('click', openSettings);
  DOM.closeSettingsBtn.addEventListener('click', closeSettings);
  DOM.modalOverlay.addEventListener('click', closeSettings);
  DOM.saveSettingsBtn.addEventListener('click', saveSettings);

  // Column toggle
  DOM.columnToggleBtn.addEventListener('click', (e) => { e.stopPropagation(); DOM.columnDropdown.classList.toggle('hidden'); if (!DOM.columnDropdown.classList.contains('hidden')) buildColumnToggleUI(); });
  document.addEventListener('click', (e) => { if (!DOM.columnDropdown.contains(e.target) && e.target !== DOM.columnToggleBtn) DOM.columnDropdown.classList.add('hidden'); });
  DOM.columnDropdown.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const col = e.target.dataset.col;
      if (e.target.checked) state.columnVisibility.delete(col);
      else state.columnVisibility.add(col);
      updateColumnWidths();
      renderTable();
    }
  });

  // ========== UPLOAD BUTTON (with refactored helpers) ==========
DOM.uploadBtn.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Reset state before upload
    state.profileData = [];
    state.blockedData = [];
    state.videoList = [];
    state.processedLength = 0;
    DOM.downloadProfilesBtn.disabled = true;
    DOM.downloadFollowingBtn.disabled = true;
    DOM.fetchBlockedBtn.disabled = true;
    
    // ---------- SHOW SPINNER ----------
    DOM.loadingOverlay.classList.remove('hidden');
    
    try {
      // 1. Read and parse JSON
      const rawData = await readAndParseJSON(file);
      
      // 2. Extract owner profile
      const owner = extractOwnerProfile(rawData);
      
      // 3. Process following/follower/blocked relationships
      const relationships = processRelationships(rawData);
      updateStateAfterUpload(owner, relationships);
      
      // 4. Insert owner into DB and populate dropdown
      insertUserJson(state.me);
      populateUserSelect();
      
      // 5. Fetch owner's own API data (optional, non-critical)
      await fetchOwnApiAndStore(state.me.userName);
      
      // 6. Process posts and cover images (this may take time)
      //    We'll await it so spinner stays until grid is ready
      await processPostsWithSpinner(rawData, state.me.userName);
      
      // 7. Render UI
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
      // ---------- HIDE SPINNER ----------
      DOM.loadingOverlay.classList.add('hidden');
    }
  };
  
  input.click();
});

// ========== Helper: processPostsWithSpinner (ensures spinner stays until grid ready) ==========
async function processPostsWithSpinner(jsonData, ownerUsername) {
  const { rawTotalPosts, posts } = extractPosts(jsonData);
  state.rawTotalPosts = rawTotalPosts;
  
  if (!state.populatePosts) {
    state.videoList = [];
    state.processedLength = 0;
    renderStats(); // update display (will show 0)
    renderGrid();
    return;
  }
  
  // Process cover images – but we will await it
  const sortedPosts = [...posts].sort((a, b) => (b.Likes || 0) - (a.Likes || 0));
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
  
  // Update stats display immediately after setting processedLength
  renderStats();
  
  // Render the grid with covers
  renderGrid();
  
  // Store in DB (fire and forget – don't await)
  if (ownerUsername) {
    upsertUserPosts(ownerUsername, processedPosts).catch(console.warn);
  }
}

  // Fetch / pause / stop
  DOM.fetchAllBtn.addEventListener('click', async () => {
    if (state.fetchState !== 'idle') return;
    DOM.downloadProfilesBtn.disabled = true;
    await fetchAllProfilesAndBlocked();
    if (state.profileData.length) DOM.downloadProfilesBtn.disabled = false;
  });
  DOM.fetchBlockedBtn.addEventListener('click', async () => { if (!state.blockedList.length || state.fetchState !== 'idle') return; await fetchAllBlocked(); });
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
    if (state.currentSort.col === col) state.currentSort.dir = state.currentSort.dir === 'asc' ? 'desc' : 'asc';
    else { state.currentSort.col = col; state.currentSort.dir = 'desc'; }
    renderTable();
  });

  // Extra buttons
  DOM.switchBlockBtn.addEventListener('click', () => { DOM.fetchBlock.classList.toggle('hidden'); DOM.failedBlock.classList.toggle('hidden'); });
  DOM.getFailedBtn.addEventListener('click', () => { const failed = state.profileData.filter(r => r.status === 'failed').map(r => r.username); DOM.failedPre.textContent = JSON.stringify(failed, null, 2); });
  DOM.compareUserBtn.addEventListener('click', () => {
    if (!state.sqliteReady || !state.sqliteDB) { DOM.comparePre.textContent = 'SQLite database not ready.'; return; }
    if (!state.me?.userName) { DOM.comparePre.textContent = 'No owner uploaded.'; return; }
    try { const rows = state.sqliteDB.jaferAll(`SELECT username, displayName FROM profiles WHERE owner_username = ? AND is_blocked = 1 AND is_following = 0`, [state.me.userName]); DOM.comparePre.textContent = JSON.stringify(rows, null, 2); }
    catch (err) { DOM.comparePre.textContent = 'Error: ' + err.message; }
  });
  DOM.compareBlockedBtn.addEventListener('click', () => { const failedUsernames = state.profileData.filter(r => r.status === 'failed').map(r => r.username); const blockedUsernames = state.blockedList.map(i => i.UserName); const intersection = failedUsernames.filter(u => blockedUsernames.includes(u)); DOM.blockedPre.textContent = JSON.stringify(intersection, null, 2); });

  // Owner selection change (FIX #2)
  const userSelect = document.getElementById('users');
  if (userSelect) {
    userSelect.addEventListener('change', async (e) => {
      const selectedUsername = e.target.value;
      if (!selectedUsername) return;
      const posts = loadPostsForOwner(selectedUsername);
      state.videoList = posts;
      state.processedLength = posts.length;
      renderStats();
      renderGrid();
      const ownerData = await loadOwnerProfiles(selectedUsername);
      if (ownerData) {
        state.profileData = ownerData.profileData;
        state.followingList = ownerData.followingList;
        state.blockedList = ownerData.blockedList;
        state.rawTotal = ownerData.rawTotal;
        state.filteredFollowing = ownerData.filteredFollowing;
        state.rawFollowers = ownerData.rawFollowers;
        state.filteredFollowers = ownerData.filteredFollowers;
        state.friendsCount = ownerData.friendsCount;
        state.me = ownerData.me;
        renderStats();
        renderTable();
        updateButtons();
      }
    });
  }

  // Retry failed button (FIX #7)
  if (DOM.retryFailedBtn) DOM.retryFailedBtn.addEventListener('click', async () => { if (state.fetchState !== 'idle') { alert('Please wait, a fetch is already in progress.'); return; } await retryFailedProfiles(); });

  updateColumnWidths();
  updateButtons();

  // Toggle grid/table
  const toggleGridBtn = document.getElementById('toggleGrid');
  const toggleTableBtn = document.getElementById('toggleTable');
  const gridContainer = document.getElementById('gridContainer');
  const tableContainer = document.getElementById('tableContainer');
  function showGrid() { if (gridContainer) gridContainer.classList.remove('hidden'); if (tableContainer) tableContainer.classList.add('hidden'); }
  function showTable() { if (gridContainer) gridContainer.classList.add('hidden'); if (tableContainer) tableContainer.classList.remove('hidden'); renderTable(); }
  if (toggleGridBtn) toggleGridBtn.addEventListener('click', showGrid);
  if (toggleTableBtn) toggleTableBtn.addEventListener('click', showTable);
}

// Initialize config (FIX #16)
initConfig();