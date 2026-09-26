import {
  loadManifest, fetchCoreIndex, initEntityBrowser, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  setStatus(statusEl, 'Loading ballparks…');

  let manifest, entries;
  try {
    manifest = await loadManifest();
    entries = await fetchCoreIndex(manifest, 'ballparks');
  } catch (err) {
    setStatus(statusEl, `Couldn't load ballparks right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (entries.length === 0) {
    setStatus(statusEl, 'No ballparks found.', true);
    return;
  }

  // Only 76 ballparks total — no search box in this page's contract, so
  // every entry is rendered (maxRender set well above the real count).
  initEntityBrowser({
    entries,
    containerEl: document.getElementById('ballpark-grid'),
    searchEl: null,
    hrefFor: (e) => `ballpark.html?id=${e.id}`,
    maxRender: 200,
    emptyMessage: 'No ballparks found.',
  });

  clearStatus(statusEl);
  contentEl.hidden = false;
}

main();
