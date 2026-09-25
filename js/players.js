import {
  loadManifest, fetchCoreIndex, initEntityBrowser, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  setStatus(statusEl, 'Loading players…');

  let manifest, entries;
  try {
    manifest = await loadManifest();
    entries = await fetchCoreIndex(manifest, 'players');
  } catch (err) {
    setStatus(statusEl, `Couldn't load players right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (entries.length === 0) {
    setStatus(statusEl, 'No players found.', true);
    return;
  }

  const grid = document.getElementById('player-grid');
  const search = document.getElementById('player-search');
  search.placeholder = `Search ${entries.length.toLocaleString()} players…`;

  initEntityBrowser({
    entries,
    containerEl: grid,
    searchEl: search,
    hrefFor: (e) => `player.html?id=${e.id}`,
    maxRender: 100, // over 10,000 players total — always search-narrowed, never rendered whole
    emptyMessage: 'No players match your search.',
  });

  clearStatus(statusEl);
  contentEl.hidden = false;
}

main();
