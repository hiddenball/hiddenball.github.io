import {
  loadManifest, fetchSeasonFile,
  qs, setStatus, clearStatus, fmtDate,
  setImgWithFallback,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');

async function main() {
  const gamePk = qs('id');
  const year = qs('year');

  if (!gamePk || !year) {
    setStatus(statusEl, 'A game id and year are both required, e.g. game.html?id=413649&year=2015 '
      + '(the year is needed to know which repo the game lives in).', true);
    return;
  }

  let manifest, game;
  try {
    manifest = await loadManifest();
    game = await fetchSeasonFile(manifest, year, `games/${gamePk}.json`);
  } catch (err) {
    setStatus(statusEl, `Couldn't load this game right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (!game) {
    setStatus(statusEl, `No game found with id "${gamePk}" in ${year}.`, true);
    return;
  }

  renderHeader(game);
  renderLinescore(game);
  renderBoxScore(game);
  renderWinProbability(game);
  renderPlayByPlay(game);

  clearStatus(statusEl);
  contentEl.hidden = false;
}

// --------------------------------------------------------------------------
// Header
// --------------------------------------------------------------------------
function renderHeader(game) {
  const away = game.box && game.box.a;
  const home = game.box && game.box.h;
  const awayName = away ? away.name : 'Away';
  const homeName = home ? home.name : 'Home';
  const awayScore = game.ls ? game.ls.a[0] : '—';
  const homeScore = game.ls ? game.ls.h[0] : '—';

  document.title = `${awayName} @ ${homeName} — MLB Archive`;
  document.getElementById('game-date').textContent = fmtDate(game.date);

  const matchup = document.getElementById('game-matchup');
  matchup.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:10px;">
      <img class="team-logo-sm" id="hdr-logo-away" alt="" style="width:36px;height:36px;">
      <a href="team.html?id=${away ? away.id : ''}" style="color:inherit;">${awayName}</a>
      <span style="color:var(--text-tertiary);font-weight:400;">${awayScore} &ndash; ${homeScore}</span>
      <a href="team.html?id=${home ? home.id : ''}" style="color:inherit;">${homeName}</a>
      <img class="team-logo-sm" id="hdr-logo-home" alt="" style="width:36px;height:36px;">
    </span>`;

  if (away) setImgWithFallback(document.getElementById('hdr-logo-away'), `assets/logos/${away.id}.webp`, 'assets/logos/default.webp');
  if (home) setImgWithFallback(document.getElementById('hdr-logo-home'), `assets/logos/${home.id}.webp`, 'assets/logos/default.webp');
}

// --------------------------------------------------------------------------
// Linescore
// --------------------------------------------------------------------------
function cellOrBlank(v) {
  return (v === null || v === undefined) ? '' : v;
}

function renderLinescore(game) {
  const table = document.getElementById('linescore-table');
  if (!game.ls) { table.innerHTML = ''; return; }

  const away = game.box && game.box.a;
  const home = game.box && game.box.h;
  const innings = game.ls.inn || [];

  let head = `<thead><tr><th class="left">Team</th>`;
  for (let i = 0; i < innings.length; i++) head += `<th>${i + 1}</th>`;
  head += `<th>R</th><th>H</th><th>E</th><th>LOB</th></tr></thead>`;

  function row(teamName, teamId, idx, totals, logoId) {
    let cells = `<td class="left"><img class="team-logo-sm" id="${logoId}" alt="">
      <a class="team-link" href="team.html?id=${teamId || ''}">${teamName}</a></td>`;
    for (const inn of innings) cells += `<td class="num">${cellOrBlank(inn[idx])}</td>`;
    for (const t of totals) cells += `<td class="num">${cellOrBlank(t)}</td>`;
    return `<tr>${cells}</tr>`;
  }

  const body = `<tbody>
    ${row(away ? away.name : 'Away', away ? away.id : null, 0, game.ls.a || [], 'ls-logo-away')}
    ${row(home ? home.name : 'Home', home ? home.id : null, 4, game.ls.h || [], 'ls-logo-home')}
  </tbody>`;

  table.innerHTML = head + body;

  if (away) setImgWithFallback(document.getElementById('ls-logo-away'), `assets/logos/${away.id}.webp`, 'assets/logos/default.webp');
  if (home) setImgWithFallback(document.getElementById('ls-logo-home'), `assets/logos/${home.id}.webp`, 'assets/logos/default.webp');
}

// --------------------------------------------------------------------------
// Box score
// --------------------------------------------------------------------------
const BAT_COLS = [
  ['pos', 'Pos'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['d', '2B'], ['t', '3B'],
  ['hr', 'HR'], ['rbi', 'RBI'], ['bb', 'BB'], ['k', 'K'], ['sb', 'SB'],
];
const PIT_COLS = [
  ['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['bb', 'BB'], ['k', 'K'], ['hr', 'HR'],
];

function renderTeamBox(team, containerId, logoIdPrefix, gameInfoHtml) {
  const container = document.getElementById(containerId);
  if (!team) { container.innerHTML = ''; return; }

  let html = `<h3 style="font-size:0.95rem;font-weight:600;display:flex;align-items:center;margin:8px 0 10px;">
    <img class="team-logo-sm" id="${logoIdPrefix}-header" alt="">
    <a class="team-link" href="team.html?id=${team.id}">${team.name}</a>
  </h3>`;

  if (gameInfoHtml) html += gameInfoHtml;

  // batting
  html += `<div class="table-scroll"><table class="ledger"><thead><tr><th class="left">Player</th>`;
  for (const [, label] of BAT_COLS) html += `<th>${label}</th>`;
  html += `</tr></thead><tbody>`;
  for (const p of team.bat || []) {
    html += `<tr><td class="left"><a class="team-link" href="player.html?id=${p.id}">${p.n || '—'}</a></td>`;
    for (const [key] of BAT_COLS) html += `<td class="num">${cellOrBlank(p[key])}</td>`;
    html += `</tr>`;
  }
  if (team.tot) {
    html += `<tr><td class="left" style="font-weight:600;">Total</td>`;
    for (const [key] of BAT_COLS) html += `<td class="num" style="font-weight:600;">${key === 'pos' ? '' : cellOrBlank(team.tot[key])}</td>`;
    html += `</tr>`;
  }
  html += `</tbody></table></div>`;

  // pitching
  if (team.pit && team.pit.length) {
    html += `<div class="table-scroll" style="margin-top:14px;"><table class="ledger"><thead><tr><th class="left">Pitcher</th>`;
    for (const [, label] of PIT_COLS) html += `<th>${label}</th>`;
    html += `</tr></thead><tbody>`;
    for (const p of team.pit) {
      const noteText = p.note ? ` <span style="color:var(--text-tertiary);">${p.note}</span>` : '';
      html += `<tr><td class="left"><a class="team-link" href="player.html?id=${p.id}">${p.n || '—'}</a>${noteText}</td>`;
      for (const [key] of PIT_COLS) html += `<td class="num">${cellOrBlank(p[key])}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
  }

  // notes (2B/3B/HR/SB etc. narrative lines), if present
  if (team.notes && Object.keys(team.notes).length) {
    html += `<div style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary);">`;
    for (const [title, rows] of Object.entries(team.notes)) {
      const line = rows.map(r => Array.isArray(r) ? r.join(' ') : String(r)).join('; ');
      html += `<div><strong>${title}:</strong> ${line}</div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
  setImgWithFallback(document.getElementById(`${logoIdPrefix}-header`), `assets/logos/${team.id}.webp`, 'assets/logos/default.webp');
}

function renderBoxScore(game) {
  if (!game.box) return;

  // The page contract has no dedicated slot for game-wide info (attendance,
  // time of game, umpires) - it only defines linescore / boxscore-away /
  // boxscore-home / winprob / play-by-play sections. Since this information
  // applies to the whole game, not one team, it's shown once at the top of
  // the AWAY box score section (the first one rendered) rather than
  // repeated or arbitrarily attached to the home team instead.
  let gameInfoHtml = '';
  const infoRows = (game.box.info || []).filter(([label, value]) => label || value);
  const offRows = game.box.off || [];
  if (infoRows.length || offRows.length) {
    gameInfoHtml = `<div style="font-size:0.85rem;color:var(--text-tertiary);margin-bottom:16px;">`;
    if (infoRows.length) {
      gameInfoHtml += infoRows.map(([label, value]) => `${label}: ${value}`).join(' &middot; ');
    }
    if (offRows.length) {
      if (infoRows.length) gameInfoHtml += '<br>';
      gameInfoHtml += 'Umpires: ' + offRows.map(([pos, name]) => `${pos} - ${name}`).join(', ');
    }
    gameInfoHtml += `</div>`;
  }

  renderTeamBox(game.box.a, 'boxscore-away', 'box-away', gameInfoHtml);
  renderTeamBox(game.box.h, 'boxscore-home', 'box-home', '');
}

// --------------------------------------------------------------------------
// Win probability - self-contained inline SVG line chart, no external
// charting library. The homeTeamWinProbability field's scale (0-1 vs 0-100)
// was never independently confirmed in this project, so this normalizes
// automatically: if any value exceeds 1, the data is already 0-100 and is
// left as-is; otherwise it's treated as a 0-1 fraction and scaled up.
// --------------------------------------------------------------------------
function renderWinProbability(game) {
  const container = document.getElementById('winprob-chart');
  const points = (game.wp || []).filter(p => p[1] !== null && p[1] !== undefined);

  if (points.length < 2) {
    container.innerHTML = '<p class="state-msg">No win probability data available for this game.</p>';
    return;
  }

  const maxRaw = Math.max(...points.map(p => p[1]));
  const scale = maxRaw > 1 ? 1 : 100;

  const W = 700, H = 200, PAD = 24;
  const n = points.length;
  const xFor = (i) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const yFor = (pct) => PAD + (1 - pct / 100) * (H - 2 * PAD);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p[1] * scale).toFixed(1)}`)
    .join(' ');

  const homeName = (game.box && game.box.h && game.box.h.name) || 'Home';
  const awayName = (game.box && game.box.a && game.box.a.name) || 'Away';

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-width:700px;" role="img"
         aria-label="Home team win probability over the course of the game">
      <line x1="${PAD}" y1="${yFor(50)}" x2="${W - PAD}" y2="${yFor(50)}"
            stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="4 4"/>
      <path d="${pathD}" fill="none" stroke="var(--accent-hover)" stroke-width="2"/>
      <text x="${PAD}" y="${PAD - 8}" fill="var(--text-tertiary)" font-size="11">100% ${homeName}</text>
      <text x="${PAD}" y="${H - PAD + 16}" fill="var(--text-tertiary)" font-size="11">100% ${awayName}</text>
      <text x="${W - PAD}" y="${yFor(50) - 6}" fill="var(--text-tertiary)" font-size="11" text-anchor="end">50%</text>
    </svg>`;
}

// --------------------------------------------------------------------------
// Play by play
// --------------------------------------------------------------------------
function formatPitch(pt) {
  const [call, type, speed] = pt;
  let s = call || '?';
  if (type) s += ` ${type}`;
  if (speed !== null && speed !== undefined) s += ` ${speed}mph`;
  return s;
}

function formatHitData(hd) {
  if (!hd || hd.length === 0) return null;
  const [speed, angle, distance, trajectory] = hd;
  const parts = [];
  if (speed !== null && speed !== undefined) parts.push(`${speed} mph`);
  if (angle !== null && angle !== undefined) parts.push(`${angle}\u00b0`);
  if (distance !== null && distance !== undefined) parts.push(`${distance} ft`);
  if (trajectory !== null && trajectory !== undefined) parts.push(trajectory);
  return parts.length ? parts.join(', ') : null;
}

function renderPlayByPlay(game) {
  const container = document.getElementById('playbyplay-list');
  const plays = game.plays || [];
  const names = game.names || {};
  const away = game.box && game.box.a;
  const home = game.box && game.box.h;

  if (plays.length === 0) {
    container.innerHTML = '<p class="state-msg">No play-by-play data available for this game.</p>';
    return;
  }

  const items = plays.map((p, idx) => {
    const battingTeam = p.t === 0 ? away : home; // top of inning = away batting
    const half = p.t === 0 ? 'Top' : 'Bottom';
    const batterName = names[p.bt] || `Player ${p.bt}`;
    const pitcherName = names[p.p] || `Player ${p.p}`;
    const scoring = p.sc ? ' <span class="badge" style="border-color:var(--accent-hover);color:var(--accent-hover);">Scoring play</span>' : '';

    let extra = '';
    if (p.pt && p.pt.length) {
      extra += `<div style="font-size:0.8rem;color:var(--text-tertiary);margin-top:2px;">
        Pitches: ${p.pt.map(formatPitch).join(', ')}</div>`;
    }
    if (p.hd) {
      const hit = formatHitData(p.hd);
      if (hit) extra += `<div style="font-size:0.8rem;color:var(--text-tertiary);">Batted ball: ${hit}</div>`;
    }
    if (p.ac && p.ac.length) {
      extra += `<div style="font-size:0.8rem;color:var(--text-tertiary);">${p.ac.join(' &middot; ')}</div>`;
    }

    return `<li>
      <span class="yr" style="display:inline-flex;align-items:center;gap:4px;">
        <img class="team-logo-sm" id="pbp-logo-${idx}" alt="" style="width:16px;height:16px;">
        ${half} ${p.in}
      </span>
      <a class="team-link" href="player.html?id=${p.bt}">${batterName}</a> vs
      <a class="team-link" href="player.html?id=${p.p}">${pitcherName}</a>${scoring}
      <div>${p.d || p.ev || ''}</div>
      ${extra}
    </li>`;
  });

  container.innerHTML = `<ul class="timeline">${items.join('')}</ul>`;

  plays.forEach((p, idx) => {
    const team = p.t === 0 ? away : home;
    if (team) {
      setImgWithFallback(document.getElementById(`pbp-logo-${idx}`), `assets/logos/${team.id}.webp`, 'assets/logos/default.webp');
    }
  });
}

main();
