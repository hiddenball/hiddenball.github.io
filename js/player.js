import {
  loadManifest, fetchCoreRecord, fetchSeasonFile,
  qs, setStatus, clearStatus, fmtDate, fmtOrDash, fmtAvg, fmtNum,
  setImgWithFallback,
} from './common.js';

const statusEl = document.getElementById('status');
const contentEl = document.getElementById('content');
const statsStatusEl = document.getElementById('stats-status');

const teamNameCache = new Map();

async function teamName(manifest, teamId) {
  if (teamId === null || teamId === undefined) return '—';
  if (teamNameCache.has(teamId)) return teamNameCache.get(teamId);
  try {
    const team = await fetchCoreRecord(manifest, 'teams', teamId);
    // Uses the team's CURRENT name, not its name at the time — a simplification;
    // the team page shows the full name history if the two need reconciling.
    const name = team ? team.currentName : `Team ${teamId}`;
    teamNameCache.set(teamId, name);
    return name;
  } catch (_) {
    return `Team ${teamId}`;
  }
}

/** "123.1" -> 370 outs. Handles the .0/.1/.2 innings-pitched convention. */
function inningsToOuts(ip) {
  if (ip === null || ip === undefined) return 0;
  const s = String(ip);
  const [whole, frac = '0'] = s.split('.');
  const w = parseInt(whole, 10) || 0;
  const f = parseInt(frac, 10) || 0; // 0, 1, or 2
  return w * 3 + f;
}
function outsToInnings(outs) {
  const w = Math.floor(outs / 3);
  const f = outs % 3;
  return `${w}.${f}`;
}

async function main() {
  const id = qs('id');
  if (!id) {
    setStatus(statusEl, 'No player specified. Go back to Players and pick one.', true);
    return;
  }

  let manifest, player;
  try {
    manifest = await loadManifest();
    player = await fetchCoreRecord(manifest, 'players', id);
  } catch (err) {
    setStatus(statusEl, `Couldn't load this player right now (${err.message}). Try refreshing.`, true);
    return;
  }

  if (!player) {
    setStatus(statusEl, `No player found with id "${id}".`, true);
    return;
  }

  renderBio(player);
  clearStatus(statusEl);
  contentEl.hidden = false;

  loadCareerStats(manifest, id, player);
}

function renderBio(p) {
  document.title = `${p.fullName} — MLB Archive`;
  document.getElementById('crumb-name').textContent = p.fullName;
  document.getElementById('player-name').textContent = p.fullName;

  const bats = p.batSide ? `Bats ${p.batSide}` : null;
  const throws = p.pitchHand ? `Throws ${p.pitchHand}` : null;
  document.getElementById('player-meta-line').textContent =
    [bats, throws].filter(Boolean).join(' · ') || 'Player';

  const badges = document.getElementById('player-badges');
  const chips = [];
  if (p.status === 'active') chips.push('<span class="badge badge--active">Active</span>');
  else if (p.status === 'deceased') chips.push('<span class="badge badge--deceased">Deceased</span>');
  else if (p.status) chips.push(`<span class="badge">${p.status[0].toUpperCase()}${p.status.slice(1)}</span>`);
  if (p.hallOfFame && p.hallOfFame.inducted) {
    chips.push(`<span class="badge badge--hof">Hall of Fame ${p.hallOfFame.year || ''}</span>`);
  }
  badges.innerHTML = chips.join(' ');

  const bio = document.getElementById('bio-table');
  const rows = [
    ['Born', fmtDate(p.birthDate)],
    ['Died', p.deathDate ? fmtDate(p.deathDate) : null],
    ['Debut', fmtDate(p.debutDate)],
    ['Last active', fmtOrDash(p.lastActiveSeason)],
    ['Height', fmtOrDash(p.height)],
    ['Weight', p.weight ? `${p.weight} lb` : '—'],
  ].filter(([, v]) => v !== null);
  bio.innerHTML = rows.map(([label, val]) =>
    `<tr><td class="trophy-label">${label}</td><td class="trophy-years">${val}</td></tr>`
  ).join('');
}

async function loadCareerStats(manifest, playerId, player) {
  const debutYear = player.debutDate ? parseInt(String(player.debutDate).slice(0, 4), 10) : 1980;
  const endYear = player.lastActiveSeason ? parseInt(player.lastActiveSeason, 10) : new Date().getFullYear();
  const start = Math.max(1980, Math.min(debutYear, endYear));
  const end = Math.min(2025, Math.max(debutYear, endYear));

  const years = [];
  for (let y = start; y <= end; y++) years.push(y);

  setStatus(statsStatusEl, `Loading ${years.length} season${years.length === 1 ? '' : 's'} of stats…`);

  const hitting = [], pitching = [], fielding = [];
  let cursor = 0;
  const CONCURRENCY = 6;

  async function worker() {
    while (cursor < years.length) {
      const y = years[cursor++];
      try {
        const stats = await fetchSeasonFile(manifest, y, 'player-stats.json');
        if (!stats) continue;
        for (const row of stats) {
          if (String(row.playerId) !== String(playerId)) continue;
          if (row.statGroup === 'hitting') hitting.push({ year: y, ...row });
          else if (row.statGroup === 'pitching') pitching.push({ year: y, ...row });
          else if (row.statGroup === 'fielding') fielding.push({ year: y, ...row });
        }
      } catch (_) {
        // a single bad/missing season shouldn't stop the rest of the career
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (hitting.length === 0 && pitching.length === 0 && fielding.length === 0) {
    setStatus(statsStatusEl, 'No season stats found for this player in the archive.', true);
    return;
  }
  clearStatus(statsStatusEl);

  if (hitting.length) await renderHitting(manifest, hitting);
  if (pitching.length) await renderPitching(manifest, pitching);
  if (fielding.length) await renderFielding(manifest, fielding);

  renderPositionPhoto(fielding);
}

/**
 * Uses the player's most recent season's fielding position as a generic
 * avatar (there's no per-player photo, only 10 position-based images).
 * If the player has no fielding rows at all (rare - some DH-only careers),
 * no image request is made at all; the photo stays hidden rather than
 * requesting a file that would just 404.
 */
function renderPositionPhoto(fielding) {
  if (fielding.length === 0) return;
  const mostRecent = fielding.slice().sort((a, b) => b.year - a.year)[0];
  const pos = mostRecent.stat && mostRecent.stat.position ? mostRecent.stat.position.abbreviation : null;
  if (!pos) return;
  setImgWithFallback(document.getElementById('player-photo'), `assets/positions/${pos}.webp`);
}

async function renderHitting(manifest, rows) {
  rows.sort((a, b) => a.year - b.year || (a.teamId ?? 0) - (b.teamId ?? 0));
  const body = document.getElementById('hitting-body');
  const totals = { g: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0 };

  const lines = [];
  for (const row of rows) {
    const s = row.stat || {};
    const name = await teamName(manifest, row.teamId);
    const ab = s.atBats ?? 0, h = s.hits ?? 0;
    totals.g += s.gamesPlayed ?? 0; totals.ab += ab; totals.r += s.runs ?? 0; totals.h += h;
    totals.d += s.doubles ?? 0; totals.t += s.triples ?? 0; totals.hr += s.homeRuns ?? 0;
    totals.rbi += s.rbi ?? 0; totals.bb += s.baseOnBalls ?? 0; totals.so += s.strikeOuts ?? 0;
    totals.sb += s.stolenBases ?? 0;

    lines.push(`<tr>
      <td class="left">${row.year}</td>
      <td class="left"><a class="team-link" href="team.html?id=${row.teamId}">${name}</a></td>
      <td class="num">${fmtOrDash(s.gamesPlayed)}</td>
      <td class="num">${fmtOrDash(s.atBats)}</td>
      <td class="num">${fmtOrDash(s.runs)}</td>
      <td class="num">${fmtOrDash(s.hits)}</td>
      <td class="num">${fmtOrDash(s.doubles)}</td>
      <td class="num">${fmtOrDash(s.triples)}</td>
      <td class="num">${fmtOrDash(s.homeRuns)}</td>
      <td class="num">${fmtOrDash(s.rbi)}</td>
      <td class="num">${fmtOrDash(s.baseOnBalls)}</td>
      <td class="num">${fmtOrDash(s.strikeOuts)}</td>
      <td class="num">${fmtOrDash(s.stolenBases)}</td>
      <td class="num">${ab ? fmtAvg(h / ab) : '—'}</td>
    </tr>`);
  }
  body.innerHTML = lines.join('');

  document.getElementById('hitting-foot').innerHTML = `<tr>
    <td class="left" colspan="2">Career</td>
    <td class="num">${totals.g}</td><td class="num">${totals.ab}</td><td class="num">${totals.r}</td>
    <td class="num">${totals.h}</td><td class="num">${totals.d}</td><td class="num">${totals.t}</td>
    <td class="num">${totals.hr}</td><td class="num">${totals.rbi}</td><td class="num">${totals.bb}</td>
    <td class="num">${totals.so}</td><td class="num">${totals.sb}</td>
    <td class="num">${totals.ab ? fmtAvg(totals.h / totals.ab) : '—'}</td>
  </tr>`;
  document.getElementById('hitting-block').hidden = false;
}

async function renderPitching(manifest, rows) {
  rows.sort((a, b) => a.year - b.year || (a.teamId ?? 0) - (b.teamId ?? 0));
  const body = document.getElementById('pitching-body');
  let outs = 0, er = 0, h = 0, r = 0, bb = 0, so = 0, hr = 0, w = 0, l = 0;

  const lines = [];
  for (const row of rows) {
    const s = row.stat || {};
    const name = await teamName(manifest, row.teamId);
    outs += inningsToOuts(s.inningsPitched);
    er += s.earnedRuns ?? 0; h += s.hits ?? 0; r += s.runs ?? 0;
    bb += s.baseOnBalls ?? 0; so += s.strikeOuts ?? 0; hr += s.homeRuns ?? 0;
    // wins/losses/saves weren't independently confirmed on this stat object when
    // this page was built — shown if present, dash if not, rather than guessed.
    w += s.wins ?? 0; l += s.losses ?? 0;
    const ip = inningsToOuts(s.inningsPitched);
    const era = ip > 0 ? ((s.earnedRuns ?? 0) * 27 / ip) : null;

    lines.push(`<tr>
      <td class="left">${row.year}</td>
      <td class="left"><a class="team-link" href="team.html?id=${row.teamId}">${name}</a></td>
      <td class="num">${fmtOrDash(s.wins)}</td>
      <td class="num">${fmtOrDash(s.losses)}</td>
      <td class="num">${era !== null ? fmtNum(era, 2) : '—'}</td>
      <td class="num">${fmtOrDash(s.inningsPitched)}</td>
      <td class="num">${fmtOrDash(s.hits)}</td>
      <td class="num">${fmtOrDash(s.runs)}</td>
      <td class="num">${fmtOrDash(s.earnedRuns)}</td>
      <td class="num">${fmtOrDash(s.baseOnBalls)}</td>
      <td class="num">${fmtOrDash(s.strikeOuts)}</td>
      <td class="num">${fmtOrDash(s.homeRuns)}</td>
    </tr>`);
  }
  body.innerHTML = lines.join('');

  const careerEra = outs > 0 ? (er * 27 / outs) : null;
  document.getElementById('pitching-foot').innerHTML = `<tr>
    <td class="left" colspan="2">Career</td>
    <td class="num">${w || '—'}</td><td class="num">${l || '—'}</td>
    <td class="num">${careerEra !== null ? fmtNum(careerEra, 2) : '—'}</td>
    <td class="num">${outsToInnings(outs)}</td>
    <td class="num">${h}</td><td class="num">${r}</td><td class="num">${er}</td>
    <td class="num">${bb}</td><td class="num">${so}</td><td class="num">${hr}</td>
  </tr>`;
  document.getElementById('pitching-block').hidden = false;
}

async function renderFielding(manifest, rows) {
  rows.sort((a, b) => a.year - b.year || (a.teamId ?? 0) - (b.teamId ?? 0));
  const body = document.getElementById('fielding-body');

  const lines = [];
  for (const row of rows) {
    const s = row.stat || {};
    const name = await teamName(manifest, row.teamId);
    const pos = s.position ? s.position.abbreviation : '—';
    const poa = (s.putOuts ?? null) !== null || (s.assists ?? null) !== null
      ? `${fmtOrDash(s.putOuts)}/${fmtOrDash(s.assists)}`
      : (s.assists !== undefined ? fmtOrDash(s.assists) : '—');

    lines.push(`<tr>
      <td class="left">${row.year}</td>
      <td class="left"><a class="team-link" href="team.html?id=${row.teamId}">${name}</a></td>
      <td class="left">${pos}</td>
      <td class="num">${fmtOrDash(s.games)}</td>
      <td class="num">${fmtOrDash(s.gamesStarted)}</td>
      <td class="num">${fmtOrDash(s.innings)}</td>
      <td class="num">${poa}</td>
      <td class="num">${fmtOrDash(s.errors)}</td>
      <td class="num">${fmtOrDash(s.fielding)}</td>
    </tr>`);
  }
  body.innerHTML = lines.join('');
  document.getElementById('fielding-block').hidden = false;
}

main();
