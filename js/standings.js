import {
  loadManifest, fetchSeasonFile, fetchLatestAvailable,
  qs, setStatus, clearStatus,
} from './common.js';

// Confirmed from our own fetch parameters (standings?leagueId=103,104):
// 103 = American League, 104 = National League.
const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };

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
    try {
      data = await fetchSeasonFile(manifest, year, 'standings-splits.json');
    } catch (err) {
      setStatus(statusEl, `Couldn't load standings for ${year} (${err.message}).`, true);
      return;
    }
    if (!data) {
      setStatus(statusEl, `No standings found for ${year}.`, true);
      renderYearPicker(year);
      contentEl.hidden = false;
      clearStatus(statusEl);
      document.getElementById('standings-body-wrap').innerHTML = '';
      return;
    }
  } else {
    const result = await fetchLatestAvailable(manifest, 'standings-splits.json').catch(() => null);
    if (!result) {
      setStatus(statusEl, "Couldn't find standings for any season.", true);
      return;
    }
    year = result.year;
    data = result.data;
  }

  document.title = `Standings — ${year} — MLB Archive`;
  document.getElementById('standings-title').textContent = `Standings — ${year}`;
  renderYearPicker(year);
  renderStandings(data);

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
      : `<a class="accent-link" href="standings.html?year=${y}">${y}</a>`
  ).join(' · ');
}

function renderStandings(data) {
  const wrap = document.getElementById('standings-body-wrap');
  if (!data || !Array.isArray(data.teams)) {
    wrap.innerHTML = '';
    return;
  }

  const byLeague = new Map();
  for (const t of data.teams) {
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
}

main();
