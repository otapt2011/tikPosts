// js/helpers.js
export const helpers = {
  escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } [m]));
  },
  formatNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n?.toString() || '0';
  },
  sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  },
  isUrlExpired(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const urlObj = new URL(url);
      const expires = urlObj.searchParams.get('x-expires');
      if (!expires) return false;
      const expiryTime = parseInt(expires, 10);
      if (isNaN(expiryTime)) return false;
      const now = Math.floor(Date.now() / 1000);
      return now > expiryTime;
    } catch (e) {
      console.warn('isUrlExpired: invalid URL', url, e);
      return false;
    }
  },
  async processCoverImage(url) {
  if (!url) return { data: null, expired: false };
  if (this.isUrlExpired(url)) {
    return { data: null, expired: true };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
  console.warn(`Cover image fetch failed: ${response.status} for ${url}`);
  return { data: null, expired: false };
}
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return { data: null, expired: false };
    // Convert blob to Uint8Array for database storage
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    return { data, expired: false };
  } catch (err) {
    console.warn('Failed to fetch cover image', url, err);
    return { data: null, expired: false };
  }
}
};