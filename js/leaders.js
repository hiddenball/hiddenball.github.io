import {
  loadManifest, fetchSeasonFile, fetchCoreRecord,
  qs, setStatus, clearStatus,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

// Deliberately limited to simple counting stats (higher = better, summed
// directly) whose field names were independently confirmed elsewhere in
// this project - the exact fields our own slim game/box-score schema
// pulled via _pick(stats, BAT_FIELDS/PIT_FIELDS). Rate stats (AVG, ERA)
// are NOT included: they need a minimum-plate-appearances/innings
// qualifying threshold to be meaningful, which is real, untested logic
// this page doesn't attempt yet rather than guess at.
const STAT_DEFS = {
  homeRuns:     { group: 'hitting',  field: 'homeRuns',    label: 'Home Runs' },
  hits:         { group: 'hitting',  field: 'hits',        label: 'Hits' },
  runs:         { group: 'hitting',  field: 'runs',        label: 'Runs' },
  rbi:          { group: 'hitting',  field: 'rbi',         label: 'RBI' },
  stolenBases:  { group: 'hitting',  field: 'stolenBases', label: 'Stolen Bases' },
  strikeOutsP:  { group: 'pitching', field: 'strikeOuts',  label: 'Strikeouts (Pitching)' },
  inningsPitched: { group: 'pitching', field: 'inningsPitched', label: 'Innings Pitched', isInnings: true },
};
const TOP_N = 25;

function inningsToOuts(ip) {
  if (ip === null || ip === undefined) return 0;
  const [whole, frac = '0'] = String(ip).split('.');
  return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac, 10) || 0);
}
function outsToInnings(outs) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

async function main() {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    setStatus(statusEl, `Couldn't load the archive right now (${err.message}).`, true);
    return;
  }

  const thisYear = new Date().getFullYear();
  const statKey = qs('stat') && STAT_DEFS[qs('stat')] ? qs('stat') : 'homeRuns';
  // Default range is a SINGLE recent year, not the full archive - summing
  // player-stats.json across many years means many season-file fetches,
  // and this page should not do that expensively by default. A wide
  // range only happens when explicitly requested via the URL.
  const from = qs('from') ? parseInt(qs('from'), 10) : thisYear - 1;
  const to = qs('to') ? parseInt(qs('to'), 10) : thisYear - 1;

  renderControls(statKey, from, to);

  const years = [];
  for (let y = Math.min(from, to); y <= Math.max(from, to); y++) years.push(y);

  if (years.length > 15) {
    setStatus(statusEl, `That's a ${years.length}-year range - this page fetches one file per year, `
      + `so a narrower range (or waiting a bit) will load faster.`, false);
  } else {
    setStatus(statusEl, `Loading ${years.length} season${years.length === 1 ? '' : 's'}…`);
  }

  const def = STAT_DEFS[statKey];
  const totals = new Map(); // playerId -> summed value (or summed outs, for innings)

  let checked = 0;
  let cursor = 0;
  const CONCURRENCY = 6;

  async function worker() {
    while (cursor < years.length) {
      const y = years[cursor++];
      checked++;
      if (checked % 5 === 0) {
        statusEl.textContent = `Loading season ${checked} of ${years.length}…`;
      }
      try {
        const stats = await fetchSeasonFile(manifest, y, 'player-stats.json');
        if (!stats) continue;
        for (const row of stats) {
          if (row.statGroup !== def.group) continue;
          const raw = (row.stat || {})[def.field];
          if (raw === null || raw === undefined) continue;
          const add = def.isInnings ? inningsToOuts(raw) : (Number(raw) || 0);
          totals.set(row.playerId, (totals.get(row.playerId) || 0) + add);
        }
      } catch (_) {
        // one missing/broken season shouldn't stop the others
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (totals.size === 0) {
    setStatus(statusEl, `No ${def.label.toLowerCase()} data found for ${years.length === 1 ? years[0] : `${from}\u2013${to}`}.`, true);
    contentEl.hidden = false;
    document.getElementById('leaders-body').innerHTML = '';
    return;
  }

  // Rank BEFORE resolving names, and only resolve names for the top N -
  // a full season can have 800+ unique players, and there's no reason to
  // fetch a bio file for anyone outside the leaderboard actually shown.
  const ranked = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);

  const rows = [];
  let rank = 1;
  for (const [playerId, value] of ranked) {
    let name;
    try {
      const p = await fetchCoreRecord(manifest, 'players', playerId);
      name = p ? p.fullName : `Player ${playerId}`;
    } catch (_) {
      name = `Player ${playerId}`;
    }
    const displayValue = def.isInnings ? outsToInnings(value) : value;
    rows.push(`<tr>
      <td class="num">${rank}</td>
      <td class="left"><a class="team-link" href="player.html?id=${playerId}">${name}</a></td>
      <td class="num">${displayValue}</td>
    </tr>`);
    rank++;
  }
  document.getElementById('leaders-body').innerHTML = rows.join('');

  clearStatus(statusEl);
  contentEl.hidden = false;
}

function renderControls(activeStat, from, to) {
  const controls = document.getElementById('leader-controls');
  const options = Object.entries(STAT_DEFS)
    .map(([key, def]) => `<option value="${key}" ${key === activeStat ? 'selected' : ''}>${def.label}</option>`)
    .join('');

  controls.innerHTML = `
    <form id="leader-form" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px;">
      <select id="stat-select" name="stat">${options}</select>
      <input type="number" id="from-year" value="${from}" min="1980" max="2026" style="width:80px;">
      <span>to</span>
      <input type="number" id="to-year" value="${to}" min="1980" max="2026" style="width:80px;">
      <button class="btn" type="submit">Show leaders</button>
    </form>`;

  document.getElementById('leader-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const stat = document.getElementById('stat-select').value;
    const f = document.getElementById('from-year').value;
    const t = document.getElementById('to-year').value;
    window.location.href = `leaders.html?stat=${stat}&from=${f}&to=${t}`;
  });
}

main();
