import {
  loadManifest, fetchSeasonFile, fetchLatestAvailable, createTeamNameResolver,
  qs, setStatus, clearStatus, fmtDate,
} from './common.js';

// Only D/L/W are labeled with confidence - D (Division Series) is standard
// public terminology, and W/L are exactly what build_trophies.py used
// (W = World Series winner, L = League Championship Series) earlier in this
// project. Any other code (e.g. a wild-card round) is shown as-is rather
// than guessed at.
const ROUND_NAMES = { D: 'Division Series', L: 'League Championship Series', W: 'World Series' };

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

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
    setStatus(statusEl, `Loading ${year} postseason…`);
    try {
      data = await fetchSeasonFile(manifest, year, 'postseason.json');
    } catch (err) {
      setStatus(statusEl, `Couldn't load the ${year} postseason (${err.message}).`, true);
      return;
    }
  } else {
    const result = await fetchLatestAvailable(manifest, 'postseason.json').catch(() => null);
    if (!result) {
      setStatus(statusEl, "Couldn't find postseason results for any season.", true);
      return;
    }
    year = result.year;
    data = result.data;
  }

  document.title = `Postseason — ${year} — MLB Archive`;
  document.getElementById('postseason-title').textContent = `Postseason — ${year}`;
  renderYearPicker(year);

  if (!data || !Array.isArray(data) || data.length === 0) {
    // A real, known case - 1994's postseason was cancelled by the strike,
    // not a data error - shown plainly either way.
    setStatus(statusEl, `No postseason games found for ${year}.`, true);
    contentEl.hidden = false;
    document.getElementById('postseason-body').innerHTML = '';
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
      : `<a class="accent-link" href="postseason.html?year=${y}">${y}</a>`
  ).join(' · ');
}

async function renderTable(manifest, games) {
  const body = document.getElementById('postseason-body');
  const resolveTeamName = createTeamNameResolver(manifest);

  // same postponed-then-replayed duplicate gamePk possibility as schedule.json
  const finished = games
    .filter(g => g.status === 'Final' || g.status === 'Completed Early')
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (finished.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="left state-msg">No completed games found.</td></tr>`;
    return;
  }

  const rows = [];
  for (const g of finished) {
    const [awayName, homeName] = await Promise.all([
      resolveTeamName(g.awayTeamId),
      resolveTeamName(g.homeTeamId),
    ]);
    const round = ROUND_NAMES[g.gameType] || g.gameType || '—';
    rows.push(`<tr>
      <td class="left">${round}</td>
      <td class="left">${fmtDate(g.date)}</td>
      <td class="left"><a class="team-link" href="team.html?id=${g.awayTeamId}">${awayName}</a></td>
      <td class="left"><a class="team-link" href="team.html?id=${g.homeTeamId}">${homeName}</a></td>
      <td class="num"><a href="game.html?id=${g.gamePk}">${g.awayScore}&ndash;${g.homeScore}</a></td>
    </tr>`);
  }
  body.innerHTML = rows.join('');
}

main();
