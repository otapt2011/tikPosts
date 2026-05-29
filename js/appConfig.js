// js/appConfig.js
// No import from config.js – define DEFAULT_DB_FILE_PATH directly
const DEFAULT_DB_FILE_PATH = '/assets/proxyDB/TikTokProfile.db';

const DEFAULTS = {
  myKey: '',
  concurrency: 8,
  fetchTimeout: 15000,
  fetchAvatarBlobs: false,
  dbFilePath: DEFAULT_DB_FILE_PATH,
  sliceStart: 0,
  sliceLength: 10,
  populatePosts: false,
  theme: 'dark',
  apiBaseUrl: 'https://tik-proxy.vercel.app'
};

export function initConfig() {
  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, defaultValue);
    }
  }
}

export function getAppConfig() {
  return {
    myKey: localStorage.getItem('myKey'),
    concurrency: parseInt(localStorage.getItem('concurrency'), 10),
    timeout: parseInt(localStorage.getItem('fetchTimeout'), 10),
    fetchAvatarBlobs: localStorage.getItem('fetchAvatarBlobs') === 'true',
    dbFilePath: localStorage.getItem('dbFilePath'),
    sliceStart: parseInt(localStorage.getItem('sliceStart'), 10),
    sliceLength: parseInt(localStorage.getItem('sliceLength'), 10),
    populatePosts: localStorage.getItem('populatePosts') === 'true',
    theme: localStorage.getItem('theme'),
    apiBaseUrl: localStorage.getItem('apiBaseUrl')
  };
}

export function updateSetting(key, value) {
  if (!(key in DEFAULTS)) {
    console.warn(`Unknown setting: ${key}`);
    return;
  }
  localStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent('app-config-changed', { detail: { key, value } }));
}