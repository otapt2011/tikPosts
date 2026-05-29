// js/owner.js
import { state } from './state.js';

function updateHeader() {
  if (!state.userData) return;
  
  const displayName = state.userData.displayName || state.userData.username || '';
  const avatarUrl = state.userData.avatarUrl || null;
  
  const titleSpan = document.querySelector('#title span');
  if (titleSpan && displayName) {
    titleSpan.textContent = displayName;
  }
  
  const logoContainer = document.getElementById('logo');
  if (!logoContainer) return;
  
  logoContainer.innerHTML = '';
  
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Owner Avatar';
    img.className = 'max-h-full w-auto rounded-full object-cover';
    img.style.width = '40px';
    img.style.height = '40px';
    img.onerror = () => {
      logoContainer.innerHTML = '<i class="fa-brands fa-tiktok text-pink-600 dark:text-pink-400 text-xl"></i>';
    };
    logoContainer.appendChild(img);
  } else {
    logoContainer.innerHTML = '<i class="fa-brands fa-tiktok text-pink-600 dark:text-pink-400 text-xl"></i>';
  }
}

let interval = setInterval(() => {
  if (state.userData) {
    updateHeader();
    clearInterval(interval);
  }
}, 300);