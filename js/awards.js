import {
  loadManifest, fetchSeasonFile, fetchLatestAvailable, fetchCoreRecord, createTeamNameResolver,
  qs, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');
const playerNameCache = new Map();

async function resolvePlayerName(manifest, playerId) {
  if (playerId === null || playerId === undefined) return null;
  if (playerNameCache.has(playerId)) return playerNameCache.get(playerId);
  let name;
  try {
    const p = await fetchCoreRecord(manifest, 'players', playerId);
    name = p ? p.fullName : `Player ${playerId}`;
  } catch (_) {
    name = `Player ${playerId}`;
  }
  playerNameCache.set(playerId, name);
  return name;
}

async function main() {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    setStatus(statusEl, `Couldn't load the archive right now (${err.message}).`, true);
    return;
  }

  const requestedYear = qs('year');
  let year, data;

  if (requestedYear) {
    year = parseInt(requestedYear, 10);
    setStatus(statusEl, `Loading ${year} awards…`);
    try {
      data = await fetchSeasonFile(manifest, year, 'awards.json');
    } catch (err) {
      setStatus(statusEl, `Couldn't load the ${year} awards (${err.message}).`, true);
      return;
    }
  } else {
    const result = await fetchLatestAvailable(manifest, 'awards.json').catch(() => null);
    if (!result) {
      setStatus(statusEl, "Couldn't find awards for any season.", true);
      return;
    }
    year = result.year;
    data = result.data;
  }

  document.title = `Awards — ${year} — MLB Archive`;
  document.getElementById('awards-title').textContent = `Awards — ${year}`;
  renderYearPicker(year);

  if (!data || !Array.isArray(data) || data.length === 0) {
    setStatus(statusEl, `No awards found for ${year}.`, true);
    contentEl.hidden = false;
    document.getElementById('awards-table').innerHTML = '';
    return;
  }

  await renderTable(manifest, data);

  clearStatus(statusEl);
  contentEl.hidden = false;
}

function renderYearPicker(activeYear) {
  const picker = document.getElementById('year-picker');
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = 1980; y <= thisYear; y++) years.push(y);

  picker.innerHTML = years.map(y =>
    y === activeYear
      ? `<strong>${y}</strong>`
      : `<a class="accent-link" href="awards.html?year=${y}">${y}</a>`
  ).join(' · ');
}

async function renderTable(manifest, awards) {
  const table = document.getElementById('awards-table');
  const resolveTeamName = createTeamNameResolver(manifest);

  const rows = [];
  for (const a of awards) {
    const parts = [];
    if (a.playerId !== null && a.playerId !== undefined) {
      const name = await resolvePlayerName(manifest, a.playerId);
      parts.push(`<a class="team-link" href="player.html?id=${a.playerId}">${name}</a>`);
    }
    if (a.teamId !== null && a.teamId !== undefined) {
      const teamName = await resolveTeamName(a.teamId);
      parts.push(`<a class="team-link" href="team.html?id=${a.teamId}">${teamName}</a>`);
    }
    const value = parts.length ? parts.join(' — ') : '—';
    rows.push(`<tr><td class="trophy-label">${a.award || '—'}</td><td class="trophy-years">${value}</td></tr>`);
  }
  table.innerHTML = rows.join('');
}

main();
