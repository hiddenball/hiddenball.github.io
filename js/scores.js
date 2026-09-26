import {
  loadManifest, fetchSeasonFile, fetchLatestAvailable, createTeamNameResolver,
  qs, setStatus, clearStatus, fmtDate,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

let allGames = [];
let resolveTeamName = null;

async function main() {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    setStatus(statusEl, `Couldn't load the archive right now (${err.message}).`, true);
    return;
  }
  resolveTeamName = createTeamNameResolver(manifest);

  const requestedYear = qs('year');
  let year, data;

  if (requestedYear) {
    year = parseInt(requestedYear, 10);
    setStatus(statusEl, `Loading ${year} schedule…`);
    try {
      data = await fetchSeasonFile(manifest, year, 'schedule.json');
    } catch (err) {
      setStatus(statusEl, `Couldn't load the ${year} schedule (${err.message}).`, true);
      return;
    }
    if (!data) {
      renderYearPicker(year);
      contentEl.hidden = false;
      // Known gap: the current season has no season-wide schedule file yet
      // (see BUILD_GUIDE.md) - only individual per-game files exist for it.
      const thisYear = new Date().getFullYear();
      setStatus(statusEl, year >= thisYear
        ? `No season-wide schedule is available yet for ${year} (this season isn't indexed for browsing this way yet).`
        : `No schedule found for ${year}.`, true);
      return;
    }
  } else {
    const result = await fetchLatestAvailable(manifest, 'schedule.json').catch(() => null);
    if (!result) {
      setStatus(statusEl, "Couldn't find a schedule for any season.", true);
      return;
    }
    year = result.year;
    data = result.data;
  }

  document.title = `Scores — ${year} — MLB Archive`;
  renderYearPicker(year);

  allGames = (Array.isArray(data) ? data : [])
    .filter(g => g.status === 'Final' || g.status === 'Completed Early')
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const dateInput = document.getElementById('date-filter');
  const requestedDate = qs('date');
  if (requestedDate) dateInput.value = requestedDate;
  dateInput.addEventListener('input', () => renderTable(dateInput.value));

  await renderTable(dateInput.value);

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
      : `<a class="accent-link" href="scores.html?year=${y}">${y}</a>`
  ).join(' · ');
}

/**
 * A game's `date` field is UTC (see BUILD_GUIDE.md), so this filter matches
 * against the UTC calendar date. A handful of late-night US games can land
 * on the following UTC day - this is a known, minor imprecision, not a bug
 * in the filtering logic itself.
 */
async function renderTable(dateFilter) {
  const body = document.getElementById('scores-body');
  const filtered = dateFilter
    ? allGames.filter(g => g.date && g.date.slice(0, 10) === dateFilter)
    : allGames;

  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="left state-msg">No games match this date.</td></tr>`;
    return;
  }

  const rows = [];
  for (const g of filtered) {
    const [awayName, homeName] = await Promise.all([
      resolveTeamName(g.awayTeamId),
      resolveTeamName(g.homeTeamId),
    ]);
    rows.push(`<tr>
      <td class="left">${fmtDate(g.date)}</td>
      <td class="left"><a class="team-link" href="team.html?id=${g.awayTeamId}">${awayName}</a></td>
      <td class="left"><a class="team-link" href="team.html?id=${g.homeTeamId}">${homeName}</a></td>
      <td class="num"><a href="game.html?id=${g.gamePk}">${g.awayScore}&ndash;${g.homeScore}</a></td>
      <td class="left">${g.status}</td>
    </tr>`);
  }
  body.innerHTML = rows.join('');
}

main();
