import {
  loadManifest, fetchCoreRecord, fetchSeasonFile,
  qs, setStatus, clearStatus, fmtOrDash,
  setImgWithFallback, setHeroBanner,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

const TROPHY_ROWS = [
  ['worldSeries', 'World Series'],
  ['pennants', 'Pennants'],
  ['divisionTitles', 'Division titles'],
  ['wildCards', 'Wild cards'],
];

async function main() {
  const id = qs('id');
  if (!id) {
    setStatus(statusEl, 'No team specified. Go back to Teams and pick one.', true);
    return;
  }

  let manifest, team;
  try {
    manifest = await loadManifest();
    team = await fetchCoreRecord(manifest, 'teams', id);
  } catch (err) {
    setStatus(statusEl, `Couldn't load this team right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (!team) {
    setStatus(statusEl, `No team found with id "${id}".`, true);
    return;
  }

  renderTeam(team);
  clearStatus(statusEl);
  contentEl.hidden = false;

  document.getElementById('load-seasons-btn').addEventListener('click', (e) => {
    loadSeasonRecord(manifest, id);
    e.target.disabled = true;
  });
}

function renderTeam(team) {
  document.title = `${team.currentName} — MLB Archive`;
  document.getElementById('crumb-name').textContent = team.currentName;
  document.getElementById('team-name').textContent = team.currentName;
  document.getElementById('team-league').textContent = team.league || '—';
  document.getElementById('team-division').textContent = team.division || '—';

  setImgWithFallback(
    document.getElementById('team-logo'),
    `assets/logos/${team.id}.webp`,
    'assets/logos/default.webp'
  );
  setHeroBanner(document.getElementById('hero'), `assets/banners/${team.id}.webp`);

  renderTrophies(team.trophies || {});
  renderNameHistory(team.nameHistory || [], team.currentName);
}

function renderTrophies(trophies) {
  const table = document.getElementById('trophy-table');
  table.innerHTML = '';
  for (const [key, label] of TROPHY_ROWS) {
    const years = (trophies[key] || []).slice().sort((a, b) => a - b);
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.className = 'trophy-label';
    tdLabel.textContent = label;

    const tdYears = document.createElement('td');
    tdYears.className = 'trophy-years';
    if (years.length === 0) {
      tdYears.innerHTML = '<span class="trophy-empty">none</span>';
    } else {
      tdYears.innerHTML = years.map(y => `<span class="year">${y}</span>`).join(', ');
    }

    tr.append(tdLabel, tdYears);
    table.appendChild(tr);
  }
}

function renderNameHistory(history, currentName) {
  const list = document.getElementById('name-history');
  const block = document.getElementById('history-block');

  // build a full chronological list: past names (with their end year) + the current name (open-ended)
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

async function loadSeasonRecord(manifest, teamId) {
  const statusEl2 = document.getElementById('seasons-status');
  const wrap = document.getElementById('seasons-wrap');
  const body = document.getElementById('seasons-body');
  setStatus(statusEl2, 'Checking 46 seasons for this team…');

  const years = [];
  for (let y = 1980; y <= 2025; y++) years.push(y);

  const rows = [];
  let checked = 0;
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < years.length) {
      const y = years[cursor++];
      checked++;
      if (checked % 10 === 0) {
        statusEl2.textContent = `Checking 46 seasons for this team… (${checked}/46)`;
      }
      try {
        const stats = await fetchSeasonFile(manifest, y, 'team-stats.json');
        if (!stats) continue;
        const row = stats.find(r => String(r.teamId) === String(teamId));
        if (row) rows.push({ year: y, row });
      } catch (_) {
        // one missing/broken season file shouldn't stop the others
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (rows.length === 0) {
    setStatus(statusEl2, "No season-level records found for this team in 1980–2025.", true);
    return;
  }

  rows.sort((a, b) => a.year - b.year);
  body.innerHTML = rows.map(({ year, row }) => {
    // Field names beyond teamId/divisionAtTheTime weren't independently confirmed
    // when this was built — check a few common conventions and fall back to a dash
    // rather than guess. Adjust these lookups if the real key names differ.
    const wins = row.wins ?? row.w ?? null;
    const losses = row.losses ?? row.l ?? null;
    const pct = row.winningPercentage ?? row.pct ?? null;
    return `<tr>
      <td class="left"><a class="team-link" href="standings.html?year=${year}">${year}</a></td>
      <td class="left">${fmtOrDash(row.leagueAtTheTime)}</td>
      <td class="left">${fmtOrDash(row.divisionAtTheTime)}</td>
      <td class="num">${fmtOrDash(wins)}</td>
      <td class="num">${fmtOrDash(losses)}</td>
      <td class="num">${pct !== null ? String(pct) : '—'}</td>
    </tr>`;
  }).join('');

  clearStatus(statusEl2);
  wrap.hidden = false;
}

main();
