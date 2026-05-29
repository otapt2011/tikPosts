// js/state.js
import { DEFAULT_HIDDEN_COLS } from './config.js';
import { getAppConfig } from './appConfig.js';

export const state = {
  rawJsonData: null,
  followingList: [],
  blockedList: [],
  blockedData: [],
  rawTotal: 0,
  filteredFollowing: 0,
  rawFollowers: 0,
  filteredFollowers: 0,
  friendsCount: 0,
  rowTotalPosts: 0,
  processedLength: 0,
  populatePosts: getAppConfig().populatePosts,
  videoList: [],
  me: null,
  userData: null,
  profileData: [],
  fetchState: 'idle',
  currentIndex: 0,
  sqliteDB: null,
  sqliteReady: false,
  currentSort: { col: 'following_date', dir: 'asc' },
  columnVisibility: new Set([...DEFAULT_HIDDEN_COLS]),
};