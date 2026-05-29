// js/gridRender.js
import { state } from './state.js';
import { helpers } from './helpers.js';

let currentBlobURLs = [];

function revokeAllBlobURLs() {
  for (const url of currentBlobURLs) URL.revokeObjectURL(url);
  currentBlobURLs = [];
}

export function renderGrid() {
  const container = document.getElementById('gridContainer');
  if (!container) return;
  revokeAllBlobURLs();
  if (!state.videoList || state.videoList.length === 0) {
    container.innerHTML = '<div class="col-span-3 text-center text-gray-500 p-4">No posts processed (enable in Settings and re-upload)</div>';
    return;
  }
  const items = state.videoList.map((post, index) => {
    let imgSrc = '';
    if (post.coverImageData && post.coverImageData.length > 0) {
      const blob = new Blob([post.coverImageData], { type: 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      currentBlobURLs.push(blobUrl);
      imgSrc = blobUrl;
    }
    const likes = helpers.formatNumber(post.Likes || 0);
    let date = '';
    if (post.Date) { const d = new Date(post.Date); if (!isNaN(d.getTime())) date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    return `<div class="flex items-center justify-center"><div class="grd bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-full z-10 p-1 border border-gray-200 dark:border-gray-700 relative"><img src="${imgSrc}" alt="Cover" class="w-full h-full object-cover rounded" style="aspect-ratio:3/4;"><div class="absolute bottom-0 left-0 width-auto bg-black/50 text-white text-[10px] p-0 pl-1 pr-1 truncate rounded-lg">❤️ ${likes}</div>${date ? `<div class="absolute top-0 right-0 width-auto bg-black/50 text-white text-[8px] p-0 pl-1 pr-1 rounded-lg">${date}</div>` : ''}</div></div>`;
  }).join('');
  container.innerHTML = items;
}