import {
  loadManifest, fetchCoreIndex, initEntityBrowser, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  setStatus(statusEl, 'Loading teams…');

  let manifest, entries;
  try {
    manifest = await loadManifest();
    entries = await fetchCoreIndex(manifest, 'teams');
  } catch (err) {
    setStatus(statusEl, `Couldn't load teams right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (entries.length === 0) {
    setStatus(statusEl, 'No teams found.', true);
    return;
  }

  // id 14 is a "no team" placeholder in the source data, not a real
  // franchise - hidden from this browse list only; the data itself is
  // untouched, and it would still be directly reachable at team.html?id=14
  // if something ever needs to link to it.
  const browsable = entries.filter(e => e.id !== 14);

  initEntityBrowser({
    entries: browsable,
    containerEl: document.getElementById('team-grid'),
    searchEl: document.getElementById('team-search'),
    hrefFor: (e) => `team.html?id=${e.id}`,
    maxRender: 200, // there are only 42 teams — this cap is effectively unlimited
    emptyMessage: 'No teams match your search.',
  });

  clearStatus(statusEl);
  contentEl.hidden = false;
}

main();
