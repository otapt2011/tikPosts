import { DEFAULT_HIDDEN_COLS } from './config.js';

const savedPopulatePosts = localStorage.getItem('populatePosts');

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
  populatePosts: savedPopulatePosts !== null ? savedPopulatePosts === 'true' : false,
  videoList: [],
  me: null,
  userData: null,
  profileData: [],
  fetchState: 'idle', // 'idle' | 'running' | 'paused' | 'stopped'
  currentIndex: 0,
  sqliteDB: null,
  sqliteReady: false,
  currentSort: { col: 'following_date', dir: 'asc' },
  columnVisibility: new Set([...DEFAULT_HIDDEN_COLS]),
};