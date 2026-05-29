import { loadExistingDB, updateStatusDisplay, populateUserSelect } from './database.js';
import { setupEventListeners } from './events.js';
import { renderTable, updateButtons } from './renderer.js';

(async () => {
  await loadExistingDB();
  updateStatusDisplay();
  populateUserSelect();
  setupEventListeners();
  renderTable();
  updateButtons();
})();