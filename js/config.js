// js/config.js
import { getAppConfig } from './appConfig.js';

// Static constant – not user configurable
export const DEFAULT_HIDDEN_COLS = ['username', 'followingCount', 'follower_date', 'friendship'];

// Default DB path – used as fallback
export const DEFAULT_DB_FILE_PATH = '/assets/proxyDB/TikTokProfile.db';

// Dynamic config read from localStorage via appConfig
export const CONFIG = {
  get apiBaseUrl() { return getAppConfig().apiBaseUrl; },
  get concurrency() { return getAppConfig().concurrency; },
  get timeout() { return getAppConfig().timeout; },
  get fetchAvatarBlobs() { return getAppConfig().fetchAvatarBlobs; },
  get dbFilePath() { return getAppConfig().dbFilePath; },
  get sliceStart() { return getAppConfig().sliceStart; },
  get sliceLength() { return getAppConfig().sliceLength; }
};