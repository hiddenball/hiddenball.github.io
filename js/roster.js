import {
  loadManifest, fetchCoreRecord, fetchSeasonFile,
  qs, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  const teamId = qs('team');
  const year = qs('year');

  if (!teamId || !year) {
    setStatus(statusEl, 'A team and year are required, e.g. roster.html?team=108&year=2015.', true);
    return;
  }

  let manifest, team, rosters;
  try {
    manifest = await loadManifest();
    [team, rosters] = await Promise.all([
      fetchCoreRecord(manifest, 'teams', teamId),
      fetchSeasonFile(manifest, year, 'rosters.json'),
    ]);
  } catch (err) {
    setStatus(statusEl, `Couldn't load this roster right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (!team) {
    setStatus(statusEl, `No team found with id "${teamId}".`, true);
    return;
  }

  const teamName = team.currentName;
  document.getElementById('crumb-team').textContent = teamName;
  document.getElementById('crumb-year').textContent = year;

  if (!rosters || !rosters.teams || !rosters.teams[teamId]) {
    setStatus(statusEl, `No roster found for the ${teamName} in ${year}.`, true);
    return;
  }

  const players = rosters.teams[teamId];
  renderRoster(teamName, year, players);

  clearStatus(statusEl);
  contentEl.hidden = false;
}

function renderRoster(teamName, year, players) {
  document.title = `${teamName} ${year} roster — MLB Archive`;
  document.getElementById('roster-title').textContent = `${teamName} — ${year} roster`;

  const body = document.getElementById('roster-body');
  // rosters.json row shape: [playerId, fullName, jerseyNumber, position, statusCode]
  const rows = players.map(([id, name, jersey, pos, statusCode]) => `<tr>
    <td class="num">${jersey || '—'}</td>
    <td class="left"><a class="team-link" href="player.html?id=${id}">${name}</a></td>
    <td class="left">${pos || '—'}</td>
    <td class="left">${statusCode || '—'}</td>
  </tr>`);
  body.innerHTML = rows.join('');
}

main();
