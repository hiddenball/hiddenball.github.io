import {
  loadManifest, fetchCoreRecord, fetchSeasonFile, createTeamNameResolver,
  qs, setStatus, clearStatus, fmtDate,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  const id = qs('id');
  if (!id) {
    setStatus(statusEl, 'No ballpark specified. Go back to Ballparks and pick one.', true);
    return;
  }

  let manifest, ballpark;
  try {
    manifest = await loadManifest();
    ballpark = await fetchCoreRecord(manifest, 'ballparks', id);
  } catch (err) {
    setStatus(statusEl, `Couldn't load this ballpark right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (!ballpark) {
    setStatus(statusEl, `No ballpark found with id "${id}".`, true);
    return;
  }

  renderBallpark(ballpark);
  clearStatus(statusEl);
  contentEl.hidden = false;

  document.getElementById('load-games-btn').addEventListener('click', (e) => {
    loadGamesHosted(manifest, id);
    e.target.disabled = true;
  });
}

function renderBallpark(bp) {
  document.title = `${bp.currentName} — MLB Archive`;
  document.getElementById('crumb-name').textContent = bp.currentName;
  document.getElementById('ballpark-name').textContent = bp.currentName;

  renderNameHistory(bp.nameHistory || [], bp.currentName);
}

function renderNameHistory(history, currentName) {
  const list = document.getElementById('name-history');
  const block = document.getElementById('history-block');

  const entries = history
    .slice()
    .sort((a, b) => (a.throughYear || 0) - (b.throughYear || 0))
    .map(h => ({ name: h.name, label: `through ${h.throughYear}` }));
  entries.push({ name: currentName, label: 'present' });

  if (entries.length <= 1) {
    block.hidden = true;
    return;
  }

  list.innerHTML = entries
    .map(e => `<li><span class="yr">${e.label}</span>${e.name}</li>`)
    .join('');
}

/**
 * Checks every season's schedule.json for games at this ballpark. Same
 * known gap as elsewhere in this site: the current season (2026+) has no
 * season-wide schedule file yet, only individual per-game files with no
 * cheap listing — so this will only ever find games through 2025 until
 * that's addressed. Says so plainly rather than silently under-reporting.
 */
async function loadGamesHosted(manifest, ballparkId) {
  const statusEl2 = document.getElementById('games-status');
  const wrap = document.getElementById('games-wrap');
  const body = document.getElementById('games-body');
  setStatus(statusEl2, 'Checking seasons 1980–2025 for games at this ballpark…');

  const years = [];
  for (let y = 1980; y <= 2025; y++) years.push(y);

  const found = [];
  let checked = 0;
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < years.length) {
      const y = years[cursor++];
      checked++;
      if (checked % 10 === 0) {
        statusEl2.textContent = `Checking seasons 1980–2025 for games at this ballpark… (${checked}/46)`;
      }
      try {
        const schedule = await fetchSeasonFile(manifest, y, 'schedule.json');
        if (!schedule) continue;
        for (const g of schedule) {
          if (String(g.ballparkId) === String(ballparkId) &&
              (g.status === 'Final' || g.status === 'Completed Early')) {
            found.push(g);
          }
        }
      } catch (_) {
        // one missing/broken season file shouldn't stop the others
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (found.length === 0) {
    setStatus(statusEl2, 'No completed games found at this ballpark in 1980–2025. '
      + '(The current season isn\u2019t indexed for this lookup yet.)', true);
    return;
  }

  found.sort((a, b) => (a.date < b.date ? 1 : -1));
  const resolveTeamName = createTeamNameResolver(manifest);

  const rows = [];
  for (const g of found) {
    const [awayName, homeName] = await Promise.all([
      resolveTeamName(g.awayTeamId),
      resolveTeamName(g.homeTeamId),
    ]);
    rows.push(`<tr>
      <td class="left">${fmtDate(g.date)}</td>
      <td class="left"><a class="team-link" href="team.html?id=${g.awayTeamId}">${awayName}</a></td>
      <td class="left"><a class="team-link" href="team.html?id=${g.homeTeamId}">${homeName}</a></td>
      <td class="num"><a href="game.html?id=${g.gamePk}">${g.awayScore}&ndash;${g.homeScore}</a></td>
    </tr>`);
  }
  body.innerHTML = rows.join('');

  clearStatus(statusEl2);
  wrap.hidden = false;
}

main();
