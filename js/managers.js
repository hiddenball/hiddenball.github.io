import {
  loadManifest, fetchCoreIndex, initEntityBrowser, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  setStatus(statusEl, 'Loading managers…');

  let manifest, entries;
  try {
    manifest = await loadManifest();
    entries = await fetchCoreIndex(manifest, 'managers');
  } catch (err) {
    setStatus(statusEl, `Couldn't load managers right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (entries.length === 0) {
    setStatus(statusEl, 'No managers found.', true);
    return;
  }

  initEntityBrowser({
    entries,
    containerEl: document.getElementById('manager-grid'),
    searchEl: document.getElementById('manager-search'),
    hrefFor: (e) => `manager.html?id=${e.id}`,
    maxRender: 300, // only 264 managers total — effectively unlimited
    emptyMessage: 'No managers match your search.',
  });

  clearStatus(statusEl);
  contentEl.hidden = false;
}

main();
