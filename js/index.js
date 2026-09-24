import {
  loadManifest, fetchSeasonFile, fetchLatestAvailable, createTeamNameResolver,
  setStatus, clearStatus, fmtDate,
} from './common.js';

// Confirmed directly from our own fetch parameters (standings?leagueId=103,104):
// 103 = American League, 104 = National League. Division-level ids were never
// used explicitly by us, so standings are grouped by league only, not division,
// rather than guessing a division-id-to-name mapping.
const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };

async function main() {
  const manifest = await loadManifest().catch((err) => {
    document.querySelectorAll('.state-msg').forEach(el => {
      setStatus(el, `Couldn't load the archive right now (${err.message}).`, true);
    });
    return null;
  });
  if (!manifest) return;

  loadStandings(manifest);
  loadRecentGames(manifest);
  loadRecentTransactions(manifest);
}

// --------------------------------------------------------------------------
// Standings glance
// --------------------------------------------------------------------------
async function loadStandings(manifest) {
  const statusEl = document.getElementById('standings-status');
  const wrap = document.getElementById('standings-wrap');
  const heading = document.getElementById('standings-heading');
  setStatus(statusEl, 'Loading standings…');

  const result = await fetchLatestAvailable(manifest, 'standings-splits.json').catch(() => null);
  if (!result || !result.data || !Array.isArray(result.data.teams)) {
    setStatus(statusEl, "Couldn't find standings for any season.", true);
    return;
  }

  heading.textContent = `Standings — ${result.year}`;
  const byLeague = new Map();
  for (const t of result.data.teams) {
    const key = t.lg;
    if (!byLeague.has(key)) byLeague.set(key, []);
    byLeague.get(key).push(t);
  }

  let html = '';
  for (const [lg, teams] of byLeague) {
    teams.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    html += `<h3 style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
      color:var(--text-secondary);margin:18px 0 8px;">${LEAGUE_NAMES[lg] || `League ${lg}`}</h3>`;
    html += `<div class="table-scroll"><table class="ledger"><thead><tr>
      <th class="left">Team</th><th>W</th><th>L</th><th>Pct</th><th>GB</th>
    </tr></thead><tbody>`;
    for (const t of teams) {
      html += `<tr>
        <td class="left"><a class="team-link" href="team.html?id=${t.id}">${t.n || `Team ${t.id}`}</a></td>
        <td class="num">${t.w ?? '—'}</td>
        <td class="num">${t.l ?? '—'}</td>
        <td class="num">${t.pct !== undefined && t.pct !== null ? t.pct : '—'}</td>
        <td class="num">${t.gb ?? '—'}</td>
      </tr>`;
    }
    html += `</tbody></table></div>`;
  }

  wrap.innerHTML = html;
  clearStatus(statusEl);
  wrap.hidden = false;
}

// --------------------------------------------------------------------------
// Recent games
//
// KNOWN GAP: the current season (mlb-data-current) has no season-wide
// schedule file — only individual per-game files, indexed by gamePk with no
// cheap public listing. Until the daily pipeline is extended to also write
// a lightweight index, this section shows the most recent PAST season that
// has a schedule.json, and says so plainly rather than presenting stale
// data as if it were live.
// --------------------------------------------------------------------------
async function loadRecentGames(manifest) {
  const statusEl = document.getElementById('games-status');
  const wrap = document.getElementById('games-wrap');
  const body = document.getElementById('games-body');
  const heading = document.getElementById('games-heading');
  setStatus(statusEl, 'Loading recent games…');

  const thisYear = new Date().getFullYear();
  const result = await fetchLatestAvailable(manifest, 'schedule.json', { startYear: thisYear }).catch(() => null);

  if (!result || !Array.isArray(result.data)) {
    setStatus(statusEl, "Couldn't find a game list for any season.", true);
    return;
  }

  if (result.year < thisYear) {
    heading.textContent = `Recent games — ${result.year} season (most recent indexed)`;
  } else {
    heading.textContent = `Recent games — ${result.year} season`;
  }

  const finished = result.data
    .filter(g => g.status === 'Final' || g.status === 'Completed Early')
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 10);

  if (finished.length === 0) {
    setStatus(statusEl, `No completed games found in ${result.year}.`, true);
    return;
  }

  const resolveTeamName = createTeamNameResolver(manifest);
  const rows = [];
  for (const g of finished) {
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
  clearStatus(statusEl);
  wrap.hidden = false;
}

// --------------------------------------------------------------------------
// Recent transactions
// transactions/{MM}.json exists for every year including the current season
// (it comes from the daily pipeline, not the legacy season-stats push), so
// unlike "recent games" this one is genuinely live.
// --------------------------------------------------------------------------
async function loadRecentTransactions(manifest) {
  const statusEl = document.getElementById('tx-status');
  const list = document.getElementById('tx-list');
  setStatus(statusEl, 'Loading recent transactions…');

  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1-12
  const collected = [];
  let monthsChecked = 0;

  while (monthsChecked < 24 && collected.length < 8) {
    const mm = String(m).padStart(2, '0');
    try {
      const data = await fetchSeasonFile(manifest, y, `transactions/${mm}.json`);
      if (data && Array.isArray(data.tx) && data.tx.length) {
        for (const row of data.tx) collected.push(row);
      }
    } catch (_) { /* skip a bad/missing month, keep walking backward */ }

    monthsChecked++;
    m--;
    if (m === 0) { m = 12; y--; }
    if (y < 1980) break;
  }

  if (collected.length === 0) {
    setStatus(statusEl, 'No recent transactions found.', true);
    return;
  }

  collected.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const top = collected.slice(0, 8);

  // tx row shape: [date, typeCode, playerId, playerName, fromTeamId, toTeamId, description]
  list.innerHTML = top.map(row => {
    const [date, , , playerName, , , description] = row;
    const detail = description || playerName || 'Transaction';
    return `<li><span class="yr">${fmtDate(date)}</span>${detail}</li>`;
  }).join('');

  clearStatus(statusEl);
  list.hidden = false;
}

main();
