// ==========================================================================
// MLB Archive — merged application bundle
// Auto-assembled from common.js + all 18 page scripts, each wrapped in its
// own function so their internal consts (statusEl, CONCURRENCY, main, etc.)
// never collide with each other. One <script> tag per page loads this same
// file; a small dispatcher at the bottom detects which page is loaded (by
// checking for an id unique to that page's HTML) and runs only that page's
// function - every other page's code sits inert and untouched.
// ==========================================================================

// ---- shared helpers (from common.js) ----
// ==========================================================================
// MLB Archive — shared helpers
// Every page-specific script imports from here. Keep this the single place
// that knows how the manifest / repo URLs work, so a repo rename only
// requires editing manifest.json itself, never this file.
// ==========================================================================

const MANIFEST_URL = 'https://cdn.jsdelivr.net/gh/hiddenball/mlb-data-core@main/manifest.json';
const MANIFEST_CACHE_KEY = 'mlb-archive:manifest';
const MANIFEST_CACHE_MAX_AGE_MS = 1000 * 60 * 60; // 1 hour — data is historical, current-year repo updates once/day

let manifestPromise = null;

/**
 * Fetches manifest.json once per page load (module-level cache), and once
 * per hour across visits (localStorage cache) since it almost never changes.
 */
function loadManifest() {
  if (manifestPromise) return manifestPromise;

  manifestPromise = (async () => {
    try {
      const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
      if (cached) {
        const { at, data } = JSON.parse(cached);
        if (Date.now() - at < MANIFEST_CACHE_MAX_AGE_MS) return data;
      }
    } catch (_) { /* localStorage unavailable or corrupt cache — fall through to fetch */ }

    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Could not load manifest.json (${res.status})`);
    const data = await res.json();

    try {
      localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch (_) { /* storage full/unavailable — non-fatal */ }

    return data;
  })();

  return manifestPromise;
}

/** Base CDN URL (no trailing slash) for the repo that holds a given season. */
function seasonBaseUrl(manifest, year) {
  const y = String(year);
  const repo = manifest.seasons[y] || (Number(year) >= manifest.current.from_year ? manifest.current.repo : null);
  if (!repo) return null;
  return manifest.season_repos[repo] || manifest.current.url;
}

/** Base CDN URL for the core repo (players/teams/managers/ballparks). */
function coreBaseUrl(manifest) {
  return manifest.core.url;
}

/**
 * Fetches JSON and returns null on 404 (a legitimately absent file, e.g. a
 * team that didn't exist that year) instead of throwing, so callers can
 * skip missing years cleanly. Any other failure still throws.
 */
async function fetchJSONOrNull(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

async function fetchCoreRecord(manifest, folder, id) {
  const url = `${coreBaseUrl(manifest)}/data/${folder}/${id}.json`;
  return fetchJSONOrNull(url);
}

async function fetchSeasonFile(manifest, year, filename) {
  const base = seasonBaseUrl(manifest, year);
  if (!base) return null;
  return fetchJSONOrNull(`${base}/data/seasons/${year}/${filename}`);
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Builds a link to game.html. The year is required because each season's data lives in a different repo.
function gameHref(g) {
  const year = g.season || (g.date ? String(g.date).slice(0, 4) : '');
  return `game.html?id=${g.gamePk}&year=${year}`;
}

function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** First-pitch time for a scheduled (not yet started) game, in the viewer's local time. */
function fmtGameTime(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtOrDash(v) {
  return v === null || v === undefined || v === '' ? '—' : v;
}

/** .300 style average from a 0-1 decimal, MLB convention drops the leading 0. */
function fmtAvg(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.');
}

function fmtNum(v, digits = 0) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? '—' : n.toFixed(digits);
}

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.className = 'state-msg' + (isError ? ' state-msg--error' : '');
  el.hidden = false;
}

function clearStatus(el) {
  el.hidden = true;
  el.textContent = '';
}

/** Groups an array of stat rows by a key, preserving first-seen order. */
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

// --------------------------------------------------------------------------
// Shared team-name lookups (used by any page that lists games/standings/etc
// by team id and wants a readable name instead of a bare number).
// --------------------------------------------------------------------------

/**
 * Returns a lookup function bound to one cache, so repeated calls for the
 * same team id across one page load only fetch that team's file once.
 * Uses the team's CURRENT name, not its name at the time of play — a
 * deliberate simplification; the team page itself shows full name history.
 */
function createTeamNameResolver(manifest) {
  const cache = new Map();
  return async function resolveTeamName(teamId) {
    if (teamId === null || teamId === undefined) return '—';
    if (cache.has(teamId)) return cache.get(teamId);
    let name;
    try {
      const team = await fetchCoreRecord(manifest, 'teams', teamId);
      name = team ? team.currentName : `Team ${teamId}`;
    } catch (_) {
      name = `Team ${teamId}`;
    }
    cache.set(teamId, name);
    return name;
  };
}

/**
 * Walks backward year by year from `startYear` (defaults to today) until it
 * finds a season that actually has the requested file, and returns both the
 * year and the parsed data. Returns null if nothing is found down to
 * `floorYear` (default 1980). Used for "latest available" widgets, since the
 * most recent year doesn't always have every file yet (e.g. the current
 * season has no season-wide schedule file — see index.js for the specific
 * case this matters for).
 *
 * `validate(data)` - optional; defaults to "any truthy data counts". Pass
 * one when a file can exist but still be the wrong shape to use - a bad shape
 * is then treated the same as a missing file, and the walk keeps going to
 * the previous year.
 * `transform(data)` - optional; runs on the fetched data (if any) BEFORE
 * validate, so a file that's readable but in a different raw shape can be
 * converted into the shape callers expect (e.g. normalizeStandings below)
 * instead of being rejected outright.
 */
async function fetchLatestAvailable(manifest, filename, { startYear, floorYear = 1980, validate, transform } = {}) {
  let year = startYear || new Date().getFullYear();
  while (year >= floorYear) {
    try {
      let data = await fetchSeasonFile(manifest, year, filename);
      if (transform) data = transform(data);
      if (data && (!validate || validate(data))) return { year, data };
    } catch (_) { /* try the previous year */ }
    year--;
  }
  return null;
}

/** Shape guard for standings-splits.json: must have the flattened {teams:[...]} form. */
function isStandingsShape(data) {
  return !!data && Array.isArray(data.teams);
}

/**
 * standings-splits.json comes in two shapes depending on where it was
 * written: the batch/historical pipeline writes the flattened
 * {v, year, teams:[{id,n,lg,w,l,pct,gb,...}]} shape every page already reads;
 * the LIVE current-season pipeline (mlb-data-current) instead writes MLB's
 * raw Stats API standings response untouched - {copyright, records:[{league,
 * teamRecords:[{team,wins,losses,winningPercentage,gamesBack,...}]}]} - which
 * has no top-level "teams" array at all. Without this, the current season's
 * real standings can never be shown: every reader here checks for
 * Array.isArray(data.teams), so the raw shape looks "unusable" and callers
 * silently fall back to last season's (already-correct) data instead.
 * This converts the raw shape into the same {teams:[...]} shape used
 * everywhere else, so the current season's live standings actually render.
 * Already-flattened data (or a shape matching neither) passes through
 * unchanged (null stays null, so callers' existing "no data" handling still
 * applies).
 */
function normalizeStandings(data) {
  if (isStandingsShape(data)) return data;
  if (!data || !Array.isArray(data.records)) return data;

  const teams = [];
  for (const rec of data.records) {
    const lg = rec.league && rec.league.id;
    for (const tr of rec.teamRecords || []) {
      const team = tr.team || {};
      if (team.id === null || team.id === undefined) continue;
      const lr = tr.leagueRecord || {};
      teams.push({
        id: team.id,
        n: team.name || `Team ${team.id}`,
        ab: team.abbreviation ?? null,
        lg,
        w: tr.wins ?? lr.wins ?? null,
        l: tr.losses ?? lr.losses ?? null,
        pct: tr.winningPercentage ?? lr.pct ?? null,
        gb: tr.gamesBack ?? null,
        wcgb: tr.wildCardGamesBack ?? null,
        gp: tr.gamesPlayed ?? null,
        rd: tr.runDifferential ?? null,
      });
    }
  }
  return teams.length ? { teams } : null;
}

// --------------------------------------------------------------------------
// Browse/index pages (Teams, Players, Managers, Ballparks)
// --------------------------------------------------------------------------

/** Fetches one of the small [{id,name},...] lookup files in mlb-data-core. */
async function fetchCoreIndex(manifest, name) {
  const url = `${coreBaseUrl(manifest)}/data/index/${name}.json`;
  const data = await fetchJSONOrNull(url);
  return data || [];
}

/**
 * Wires a search-filtered grid of links from a [{id,name},...] index.
 * Renders at most `maxRender` entries at a time (the players index alone has
 * over 10,000 rows — never render all of them as DOM nodes at once).
 *
 * options:
 *   entries      - the [{id,name}, ...] array (already fetched by the caller)
 *   containerEl  - element to fill with .entity-card links
 *   searchEl     - the <input>, or null/undefined if the page has no search box
 *   hrefFor(e)   - (entry) => href string
 *   logoFor(e)   - optional; (entry) => team id to show a logo card for, or null for none
 *   maxRender    - cap on rendered cards (default 100)
 *   emptyMessage - shown when a search matches nothing
 */
function initEntityBrowser({ entries, containerEl, searchEl, hrefFor, logoFor, maxRender = 100, emptyMessage = 'No matches.' }) {
  function render(query) {
    const q = (query || '').trim().toLowerCase();
    const matches = q ? entries.filter(e => e.name.toLowerCase().includes(q)) : entries;
    const shown = matches.slice(0, maxRender);

    if (shown.length === 0) {
      containerEl.innerHTML = `<p class="state-msg" style="padding:12px 0;">${emptyMessage}</p>`;
      return;
    }

    containerEl.innerHTML = shown.map(e => `
      <a class="entity-card${logoFor ? ' entity-card--logo' : ''}" href="${hrefFor(e)}">
        ${logoFor ? teamLogoCardHtml(logoFor(e)) : ''}
        <span class="entity-card__name">${e.name}</span>
      </a>`).join('');

    if (matches.length > maxRender) {
      containerEl.insertAdjacentHTML('beforeend',
        `<p class="state-msg" style="padding:12px 0;width:100%;">Showing ${maxRender} of ${matches.length} matches — keep typing to narrow it down.</p>`);
    }
  }

  render('');

  if (searchEl) {
    let debounceTimer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => render(searchEl.value), 120);
    });
  }
}

// --------------------------------------------------------------------------
// Logo / image fallback
// Not every id has a custom image (e.g. historical/Negro League team ids
// that predate the 30 active franchises). Tries the specific file first;
// if it 404s, swaps to a single shared default instead of showing a
// browser's broken-image icon. If the default ALSO fails, hides the
// element entirely rather than looping.
// --------------------------------------------------------------------------
function setImgWithFallback(imgEl, primarySrc, fallbackSrc) {
  let triedFallback = false;
  imgEl.classList.remove('is-visible');
  imgEl.onerror = () => {
    if (!triedFallback && fallbackSrc) {
      triedFallback = true;
      imgEl.src = fallbackSrc;
    } else {
      imgEl.onerror = null;
      imgEl.classList.remove('is-visible');
      imgEl.removeAttribute('src');
    }
  };
  imgEl.onload = () => imgEl.classList.add('is-visible');
  imgEl.src = primarySrc;
}

/**
 * Sets a hero's background image with a fixed dark overlay layered on top,
 * so the hero's text stays readable regardless of how bright or busy the
 * banner image is underneath. If the banner 404s, only the (harmless)
 * gradient renders - no broken-image icon is possible with a CSS background.
 */
function setHeroBanner(heroEl, bannerSrc) {
  heroEl.style.backgroundImage =
    `linear-gradient(rgba(10,14,20,0.55), rgba(10,14,20,0.88)), url("${bannerSrc}")`;
}


// --------------------------------------------------------------------------
// Team logo card
// Small rounded square card holding the team's logo, drawn from
// assets/logos/{teamId}.webp. No default.webp placeholder is shipped, so a
// missing logo (the historical/Negro League team ids, and id 14) just hides
// the image cleanly on 404 instead of showing a broken-image icon.
// teamLinkHtml() renders: [logo card] Team Name, as one link to the team page.
// --------------------------------------------------------------------------
function teamLogoCardHtml(teamId) {
  return `<span class="team-logo-card"><img src="assets/logos/${teamId}.webp" alt="" ` +
    `onerror="this.onerror=null;this.style.display='none';"></span>`;
}

// League logo card: assets/leagues/al.webp (American) / nl.webp (National).
// Same look as the team logo cards. Unknown league ids get no card, and a
// missing image file just hides the image instead of showing a broken icon.
const LEAGUE_LOGO_FILES = { 103: 'al', 104: 'nl' };

function leagueLogoCardHtml(leagueId) {
  const file = LEAGUE_LOGO_FILES[leagueId];
  if (!file) return '';
  return `<span class="team-logo-card league-logo-card"><img src="assets/leagues/${file}.webp" alt="" ` +
    `onerror="this.onerror=null;this.style.display='none';"></span>`;
}

// Nickname only ("Seattle Mariners" -> "Mariners"), shown on vertical/narrow screens.
// Two-word nicknames are listed explicitly; everything else is the last word.
const TWO_WORD_NICKNAMES = ['Red Sox', 'White Sox', 'Blue Jays', 'Devil Rays'];
function shortTeamName(name) {
  const n = String(name ?? '').trim();
  if (!n || /^Team \d+$/.test(n)) return n;            // unknown team placeholder: leave as is
  for (const nick of TWO_WORD_NICKNAMES) {
    if (n === nick || n.endsWith(` ${nick}`)) return nick;
  }
  if (/\bAngels\b/.test(n)) return 'Angels';           // e.g. "Los Angeles Angels of Anaheim"
  const parts = n.split(/\s+/);
  return parts[parts.length - 1];
}

function teamLinkHtml(teamId, name) {
  if (teamId === null || teamId === undefined || teamId === '') return `${name}`;
  const short = shortTeamName(name);
  const label = short && short !== name
    ? `<span class="tn-full">${name}</span><span class="tn-short">${short}</span>`
    : `${name}`;
  return `<a class="team-link team-chip" href="team.html?id=${teamId}">` +
    `${teamLogoCardHtml(teamId)}<span class="team-chip__name">${label}</span></a>`;
}


// --------------------------------------------------------------------------
// Divisions (East / Central / West)
// Standings data is grouped by league only, so the division is worked out from
// the team id + season using MLB's real alignment for each era:
//   1980-1993  two divisions per league (East, West)
//   1994-1997  three divisions (East, Central, West)
//   1998-2012  Brewers move to NL Central; Astros stay in NL Central
//   2013+      Astros move to AL West (5 teams per division)
// A team that isn't in the map for that year lands in an "Other" group at the
// end instead of disappearing.
// --------------------------------------------------------------------------
const DIVISION_ERAS = [
  { from: 1980, to: 1993,
    East:    [110, 111, 114, 116, 158, 147, 141, 112, 121, 143, 134, 138, 120, 146],
    Central: [],
    West:    [108, 118, 142, 133, 136, 140, 145, 144, 113, 117, 119, 135, 137, 115] },
  { from: 1994, to: 1997,
    East:    [110, 111, 147, 141, 116, 144, 120, 121, 143, 146],
    Central: [145, 114, 118, 142, 158, 112, 113, 117, 134, 138],
    West:    [108, 133, 136, 140, 115, 119, 135, 137] },
  { from: 1998, to: 2012,
    East:    [110, 111, 147, 139, 141, 144, 146, 121, 143, 120],
    Central: [145, 114, 116, 118, 142, 112, 113, 117, 134, 138, 158],
    West:    [108, 133, 136, 140, 109, 115, 119, 135, 137] },
  { from: 2013, to: 9999,
    East:    [110, 111, 147, 139, 141, 144, 146, 121, 143, 120],
    Central: [145, 114, 116, 118, 142, 112, 113, 134, 138, 158],
    West:    [108, 117, 133, 136, 140, 109, 115, 119, 135, 137] },
];

function divisionFor(teamId, year) {
  const y = Number(year);
  const era = DIVISION_ERAS.find(e => y >= e.from && y <= e.to);
  if (!era) return null;
  const id = Number(teamId);
  for (const name of ['East', 'Central', 'West']) {
    if (era[name].includes(id)) return name;
  }
  return null;
}

// --------------------------------------------------------------------------
// Last five games (index page standings)
// Built from the season's schedule.json: each team's five most recent
// finished regular-season games, oldest -> newest (rightmost = latest).
// Each result is a W / L chip linking to that game's page.
// --------------------------------------------------------------------------

// gameType codes that are NOT regular-season games (postseason rounds,
// spring training, exhibition, all-star, intrasquad). A game with no
// gameType, or 'R', counts as regular season.
const NON_REGULAR_GAME_TYPES = new Set(['S', 'E', 'A', 'I']); // Spring Training, Exhibition, All-Star, Intrasquad — real postseason rounds (F/D/L/W/P/C) count

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Fallback for seasons that have no schedule.json in the data repos (the
 * current season). Asks MLB's public schedule API for every game that
 * season (regular + postseason + exhibition/spring training/all-star) and
 * converts each finished game into the same shape schedule.json uses, so
 * buildLastFive() treats both sources identically. gamePk is the same id the
 * game pages use. Throws on any network / HTTP problem.
 */
async function fetchScheduleFromStatsApi(year) {
  const fields = 'dates,games,gamePk,gameDate,gameType,status,detailedState,teams,away,home,team,id,score';
  // No gameType filter: pulls regular season AND postseason (and anything
  // else scheduled that year). NON_REGULAR_GAME_TYPES below is what actually
  // decides which of these count as a "real" game for Last 5 / Latest game -
  // filtering here too would silently hide postseason results once the
  // regular season ends, which is the bug this fixes.
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${encodeURIComponent(year)}` +
    `&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching MLB schedule for ${year}`);
  const data = await res.json();

  const games = [];
  for (const day of (data && data.dates) || []) {
    for (const g of day.games || []) {
      const state = (g.status && g.status.detailedState) || '';
      // Only games that were actually played to a finish (not Postponed / Suspended / Scheduled)
      if (!/^(Final|Completed Early|Game Over)/.test(state)) continue;
      const away = g.teams && g.teams.away, home = g.teams && g.teams.home;
      if (!away || !home || !away.team || !home.team) continue;
      games.push({
        gamePk: g.gamePk,
        date: g.gameDate,
        status: 'Final',
        gameType: g.gameType,
        awayTeamId: away.team.id,
        homeTeamId: home.team.id,
        awayScore: away.score,
        homeScore: home.score,
      });
    }
  }
  return games;
}

/**
 * Turns a season's schedule.json array into Map<teamId(string), result[]>,
 * where each list holds that team's last five finished games (oldest first).
 * result = { gamePk, date, outcome: 'W'|'L'|'T', us, them, oppId, home }
 */
function buildLastFive(schedule) {
  const byPk = new Map();
  for (const g of schedule) {
    if (!g || g.gamePk === null || g.gamePk === undefined) continue;
    if (g.status !== 'Final' && g.status !== 'Completed Early') continue;
    if (g.gameType && NON_REGULAR_GAME_TYPES.has(g.gameType)) continue;
    if (g.homeTeamId === null || g.homeTeamId === undefined ||
        g.awayTeamId === null || g.awayTeamId === undefined) continue;
    if (g.homeScore === null || g.homeScore === undefined ||
        g.awayScore === null || g.awayScore === undefined) continue;
    if (Number.isNaN(Number(g.homeScore)) || Number.isNaN(Number(g.awayScore))) continue;
    // a postponed-then-replayed game can share a gamePk: keep only one copy (the latest)
    const prev = byPk.get(String(g.gamePk));
    if (!prev || String(g.date) >= String(prev.date)) byPk.set(String(g.gamePk), g);
  }

  const games = [...byPk.values()].sort((a, b) => {
    const ta = Date.parse(a.date), tb = Date.parse(b.date);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    if (a.date !== b.date) return String(a.date) < String(b.date) ? -1 : 1;
    return Number(a.gamePk) - Number(b.gamePk); // doubleheaders: game 1 first
  });

  const teams = new Map();
  const push = (teamId, entry) => {
    const key = String(teamId);
    if (!teams.has(key)) teams.set(key, []);
    teams.get(key).push(entry);
  };
  for (const g of games) {
    const aw = Number(g.awayScore), hm = Number(g.homeScore);
    const base = { gamePk: g.gamePk, date: g.date };
    push(g.awayTeamId, { ...base, outcome: aw > hm ? 'W' : aw < hm ? 'L' : 'T',
      us: aw, them: hm, oppId: g.homeTeamId, home: false });
    push(g.homeTeamId, { ...base, outcome: hm > aw ? 'W' : hm < aw ? 'L' : 'T',
      us: hm, them: aw, oppId: g.awayTeamId, home: true });
  }
  for (const [key, list] of teams) teams.set(key, list.slice(-5));
  return teams;
}

/**
 * Full list of finished games for one season, from whichever source is freshest.
 * The current season is read from MLB's schedule API FIRST, because a
 * schedule.json that exists for it in the data repo can be days behind (that is
 * what made "Last 5" look old). If the API is unreachable, schedule.json is the
 * fallback. Older seasons read schedule.json, with the API only as a last resort
 * for last season. Returns an array, or null if nothing could be loaded.
 */
async function fetchSeasonSchedule(manifest, year) {
  const thisYear = new Date().getFullYear();

  if (Number(year) >= thisYear) {
    try {
      const fresh = await fetchScheduleFromStatsApi(year);
      if (Array.isArray(fresh) && fresh.length > 0) return fresh;
    } catch (_) { /* fall through to schedule.json */ }
  }

  let schedule = null;
  try {
    schedule = await fetchSeasonFile(manifest, year, 'schedule.json');
  } catch (_) { /* fall through to the MLB schedule API below */ }

  if (!Array.isArray(schedule) && Number(year) >= thisYear - 1) {
    try {
      schedule = await fetchScheduleFromStatsApi(year);
    } catch (_) { schedule = null; }
  }
  return Array.isArray(schedule) ? schedule : null;
}

// --------------------------------------------------------------------------
// Live games
// A small, cheap request (yesterday..tomorrow, so a few dozen games) that lists
// every game being played right now. Used by the index Last 5 column, the team
// page (pinned live card + Last 5 cards) and polled every LIVE_POLL_MS.
// --------------------------------------------------------------------------
const LIVE_POLL_MS = 30000;

function liveStateLabel(detailedState, linescore) {
  if (/delay/i.test(detailedState || '')) return 'Delayed';
  const ls = linescore || {};
  if (ls.currentInningOrdinal && ls.inningState) return `${ls.inningState} ${ls.currentInningOrdinal}`;
  if (ls.currentInningOrdinal) return `${ls.currentInningOrdinal} inning`;
  return 'In progress';
}

/**
 * Games in progress right now (regular season + postseason; never spring
 * training / exhibition / all-star). Throws on a network / HTTP problem so
 * callers can keep whatever they were already showing.
 * -> [{ gamePk, season, date, gameType, awayTeamId, homeTeamId, awayScore, homeScore, label }]
 */
async function fetchLiveGames() {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const fields = 'dates,games,gamePk,season,gameDate,gameType,status,abstractGameState,detailedState,' +
    'teams,away,home,team,id,score,linescore,currentInning,currentInningOrdinal,inningState';
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${day(-1)}&endDate=${day(1)}` +
    `&hydrate=linescore&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching live MLB games`);
  const data = await res.json();

  const out = [];
  for (const d of (data && data.dates) || []) {
    for (const g of d.games || []) {
      const st = g.status || {};
      const state = st.detailedState || '';
      if (st.abstractGameState !== 'Live') continue;
      if (/^(Final|Game Over|Completed Early|Postponed|Suspended|Cancelled|Pre-Game|Warmup|Scheduled)/i.test(state)) continue;
      if (g.gameType && NON_REGULAR_GAME_TYPES.has(g.gameType)) continue;
      const away = g.teams && g.teams.away, home = g.teams && g.teams.home;
      if (!away || !home || !away.team || !home.team) continue;
      const ls = g.linescore || {};
      const inning = Number(ls.currentInning);
      if (Number.isFinite(inning) && inning < 1) continue; // not actually underway yet
      const date = g.gameDate;
      const season = Number(g.season) || new Date(date).getUTCFullYear() || new Date().getFullYear();
      out.push({
        gamePk: g.gamePk,
        season,
        date,
        gameType: g.gameType,
        awayTeamId: away.team.id,
        homeTeamId: home.team.id,
        awayScore: Number(away.score) || 0,
        homeScore: Number(home.score) || 0,
        label: liveStateLabel(state, ls),
      });
    }
  }
  return out;
}

/**
 * Every one of today's games that isn't finished yet (regular season + postseason;
 * never spring training / exhibition / all-star): live ones (with score + inning)
 * and ones that haven't started yet (with their scheduled first-pitch time). Used
 * by the index page's pinned "Today's games" box. Throws on a network / HTTP
 * problem so callers can keep whatever they were already showing.
 * -> [{ gamePk, season, gameType, awayTeamId, homeTeamId, awayScore, homeScore,
 *       state: 'live'|'preview'|'final', label, gameDate }]
 */
async function fetchTodaysGames() {
  const today = new Date().toISOString().slice(0, 10);
  const fields = 'dates,games,gamePk,season,gameDate,gameType,status,abstractGameState,detailedState,' +
    'teams,away,home,team,id,score,linescore,currentInning,currentInningOrdinal,inningState';
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=linescore&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching today's MLB games`);
  const data = await res.json();

  const out = [];
  for (const d of (data && data.dates) || []) {
    for (const g of d.games || []) {
      if (g.gameType && NON_REGULAR_GAME_TYPES.has(g.gameType)) continue;
      const away = g.teams && g.teams.away, home = g.teams && g.teams.home;
      if (!away || !home || !away.team || !home.team) continue;
      const st = g.status || {};
      const abstract = st.abstractGameState;
      const state = abstract === 'Live' ? 'live' : (abstract === 'Final' ? 'final' : 'preview');
      const ls = g.linescore || {};
      const season = Number(g.season) || new Date(g.gameDate).getUTCFullYear() || new Date().getFullYear();
      out.push({
        gamePk: g.gamePk,
        season,
        gameType: g.gameType,
        awayTeamId: away.team.id,
        homeTeamId: home.team.id,
        awayScore: Number(away.score) || 0,
        homeScore: Number(home.score) || 0,
        state,
        label: state === 'live' ? liveStateLabel(st.detailedState, ls) : null,
        gameDate: g.gameDate,
      });
    }
  }
  return out;
}

/** Map<teamId(string), { gamePk, season, date, outcome:'LIVE', us, them, oppId, home, label }> */
function liveByTeam(list) {
  const m = new Map();
  for (const g of list || []) {
    const base = { gamePk: g.gamePk, season: g.season, date: g.date, outcome: 'LIVE', label: g.label };
    m.set(String(g.awayTeamId), { ...base, us: g.awayScore, them: g.homeScore, oppId: g.homeTeamId, home: false });
    m.set(String(g.homeTeamId), { ...base, us: g.homeScore, them: g.awayScore, oppId: g.awayTeamId, home: true });
  }
  return m;
}

/** Cheap "did anything change?" fingerprints, so a poll only re-renders when it has to. */
function liveSig(entry) {
  return entry ? `${entry.gamePk}|${entry.us}|${entry.them}|${entry.label}` : '';
}
function liveListSig(list) {
  return (list || []).map(g => `${g.gamePk}|${g.awayScore}|${g.homeScore}|${g.label}`).sort().join(',');
}

/**
 * Playoff format for a season: how many teams per league get in.
 * perDivision = teams taken from each division (1 = winner only),
 * wildCards   = extra teams per league from everyone left over.
 * Returns null for seasons with no normal postseason (1981 split season, 1994 strike).
 */
function playoffFormat(year) {
  const y = Number(year);
  if (y === 1981 || y === 1994) return null;
  if (y < 1995) return { perDivision: 1, wildCards: 0 };   // 1980-1993: division winners only
  if (y < 2012) return { perDivision: 1, wildCards: 1 };   // 1995-2011: + 1 wild card
  if (y === 2020) return { perDivision: 2, wildCards: 2 }; // 2020: top 2 per division + 2 wild cards
  if (y < 2022) return { perDivision: 1, wildCards: 2 };   // 2012-2021: + 2 wild cards
  return { perDivision: 1, wildCards: 3 };                 // 2022+: + 3 wild cards
}

/** Win percentage used for ranking: the stored pct, or W / (W + L) if pct is missing. */
function standingsWinPct(t) {
  const p = Number(t.pct);
  if (t.pct !== null && t.pct !== undefined && t.pct !== '' && Number.isFinite(p)) return p;
  const w = Number(t.w), l = Number(t.l);
  return Number.isFinite(w) && Number.isFinite(l) && w + l > 0 ? w / (w + l) : null;
}

/**
 * Works out which teams are in a playoff position for the WHOLE season list
 * (both leagues together). Returns Map<teamId(string), 'division' | 'runnerup' | 'wildcard'>.
 * Playoff spots: best team(s) of each division, then the best remaining teams
 * in the league by win percentage. Tiebreak games aren't modelled.
 */
function computePlayoffSpots(allTeams, year) {
  const spot = new Map();
  const fmt = playoffFormat(year);
  if (!fmt) return spot;

  const scored = allTeams
    .map(t => ({ t, p: standingsWinPct(t) }))
    .filter(x => x.p !== null)
    .sort((a, b) => b.p - a.p);

  for (const rows of groupBy(scored, x => x.t.lg).values()) {
    const taken = new Set();
    const inDivision = rows.filter(x => divisionFor(x.t.id, year));
    for (const divRows of groupBy(inDivision, x => divisionFor(x.t.id, year)).values()) {
      divRows.slice(0, fmt.perDivision).forEach((x, i) => {
        spot.set(String(x.t.id), i === 0 ? 'division' : 'runnerup');
        taken.add(x);
      });
    }
    rows.filter(x => !taken.has(x)).slice(0, fmt.wildCards)
      .forEach(x => spot.set(String(x.t.id), 'wildcard'));
  }
  return spot;
}

const PLAYOFF_SPOT_LABELS = {
  division: 'Playoff spot: division leader',
  runnerup: 'Playoff spot: division runner-up',
  wildcard: 'Playoff spot: wild card',
};

/** Soft yellow dot shown before a team name (an invisible placeholder for non-playoff teams so logos line up). */
function playoffDotHtml(teamId, spots) {
  const spot = spots.get(String(teamId));
  return spot
    ? `<span class="po-dot" role="img" title="${PLAYOFF_SPOT_LABELS[spot]}" aria-label="${PLAYOFF_SPOT_LABELS[spot]}"></span>`
    : `<span class="po-dot po-dot--none" aria-hidden="true"></span>`;
}

/**
 * Pct colouring rule (index standings only): looks at a team's last five
 * finished games. 3+ wins -> 'hot' (green), 3+ losses -> 'cold' (red).
 * Returns null (no colour) unless the last-five data is ready and the team
 * has a full five games, so partial data never shows a misleading colour.
 */
function pctTrend(teamId, last5) {
  if (!last5 || last5.status !== 'ready') return null;
  const list = last5.byTeam.get(String(teamId));
  if (!list || list.length < 5) return null;
  const wins = list.filter(r => r.outcome === 'W').length;
  const losses = list.filter(r => r.outcome === 'L').length;
  if (wins >= 3) return { cls: 'pct-hot', tip: `Won ${wins} of last 5` };
  if (losses >= 3) return { cls: 'pct-cold', tip: `Lost ${losses} of last 5` };
  return null;
}

/**
 * One "Last 5" table cell. state = { status: 'pending'|'unavailable'|'ready', byTeam, names, live }
 * state.live (optional) is a Map<teamId, live entry>: a game in progress takes the newest
 * (rightmost) slot as a pulsing red dot, so the strip shows the 4 latest finished games + the live one.
 */
function lastFiveCellHtml(teamId, year, state) {
  if (!state || state.status === 'pending') return `<td class="l5-cell"><span class="dim">…</span></td>`;
  let list = state.status === 'ready' ? state.byTeam.get(String(teamId)) : null;
  const liveEntry = state.status === 'ready' && state.live ? state.live.get(String(teamId)) : null;
  if ((!list || list.length === 0) && !liveEntry) return `<td class="l5-cell"><span class="dim">—</span></td>`;
  list = list || [];
  if (liveEntry) list = list.slice(-4);

  let liveChip = '';
  if (liveEntry) {
    const opp = state.names.get(String(liveEntry.oppId)) || `Team ${liveEntry.oppId}`;
    const label = `LIVE ${liveEntry.us}\u2013${liveEntry.them} ${liveEntry.home ? 'vs.' : '@'} ${opp}, ${liveEntry.label}`;
    liveChip = `<a class="l5 l5--live" href="game.html?id=${encodeURIComponent(liveEntry.gamePk)}&year=${encodeURIComponent(year)}" ` +
      `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="live-dot" aria-hidden="true"></span></a>`;
  }

  const chips = list.map(r => {
    const opp = state.names.get(String(r.oppId)) || `Team ${r.oppId}`;
    const day = new Date(r.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    const label = `${r.outcome} ${r.us}\u2013${r.them} ${r.home ? 'vs.' : '@'} ${opp}, ${day}`;
    const cls = r.outcome === 'W' ? 'l5--w' : r.outcome === 'L' ? 'l5--l' : 'l5--t';
    return `<a class="l5 ${cls}" href="game.html?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}" ` +
      `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${r.outcome}</a>`;
  }).join('');
  return `<td class="l5-cell"><span class="l5-strip">${chips}${liveChip}</span></td>`;
}

// Same rule the stylesheet uses for "vertical screens" (nicknames + compact table).
const VERTICAL_SCREEN_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 900px)';

// Column order after the Team column.
const STANDINGS_PLAIN_COLUMNS = ['w', 'l', 'pct', 'gb'];
const STANDINGS_WIDE_COLUMNS = ['pl', 'w', 'l', 'pct', 'gb', 'last5'];       // desktop / landscape
const STANDINGS_VERTICAL_COLUMNS = ['last5', 'w', 'l', 'pl', 'pct', 'gb'];   // vertical screens

const STANDINGS_LABELS = { pl: 'PL', w: 'W', l: 'L', pct: 'Pct', gb: 'GB' };
const STANDINGS_TITLES = { pl: 'games played', w: 'wins', l: 'losses', pct: 'win percentage', gb: 'games behind' };

// Sorting. Default is best win percentage on top. The first click on a column
// puts the "best" value on top (most wins, fewest losses, closest to the lead);
// clicking the same column again reverses it.
const STANDINGS_DEFAULT_SORT = { key: 'pct', dir: 'desc' };
const STANDINGS_FIRST_DIR = { pl: 'desc', w: 'desc', l: 'asc', pct: 'desc', gb: 'asc' };

function nextStandingsSort(current, key) {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: STANDINGS_FIRST_DIR[key] || 'desc' };
}

function standingsNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function standingsSortValue(t, key) {
  switch (key) {
    case 'w': return standingsNum(t.w);
    case 'l': return standingsNum(t.l);
    case 'pl': {
      const w = standingsNum(t.w), l = standingsNum(t.l);
      return w === null || l === null ? null : w + l;
    }
    case 'pct': return standingsWinPct(t);
    case 'gb': {
      const raw = String(t.gb ?? '').trim();
      if (raw === '-' || raw === '\u2013' || raw === '\u2014') return 0;   // division leader
      if (raw.startsWith('+')) { const n = standingsNum(raw.slice(1)); return n === null ? null : -n; } // "+2.5" = 2.5 games AHEAD
      return standingsNum(raw);
    }
    default: return null;
  }
}

/** Returns a sorted copy. Missing values always go last; ties fall back to the better record. */
function sortStandingsTeams(teams, sort) {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...teams].sort((a, b) => {
    const va = standingsSortValue(a, sort.key), vb = standingsSortValue(b, sort.key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && va !== vb) return (va - vb) * mul;
    const pa = standingsWinPct(a) ?? -1, pb = standingsWinPct(b) ?? -1;
    if (pa !== pb) return pb - pa;
    return (standingsNum(b.w) ?? 0) - (standingsNum(a.w) ?? 0);
  });
}

/**
 * `group` (optional) is the data-sort button's data-group attribute: which
 * table this header belongs to, so a click handler can tell which one to
 * re-sort without touching any other table on the page (see standingsTableHtml).
 */
function standingsHeaderHtml(key, sort, group) {
  if (key === 'last5') return '<th class="l5-col">Last 5</th>';
  const active = sort.key === key;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = active ? `<span class="sort-arrow" aria-hidden="true">${sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>` : '';
  const groupAttr = group ? ` data-group="${escapeHtml(group)}"` : '';
  return `<th class="sortable" aria-sort="${ariaSort}">` +
    `<button type="button" class="sort-btn" data-sort="${key}"${groupAttr} title="Sort by ${STANDINGS_TITLES[key]}">` +
    `${STANDINGS_LABELS[key]}${arrow}</button></th>`;
}

/**
 * Takes one league's standings rows and returns the HTML for its divisions: a
 * small East / Central / West heading followed by that division's table. Each
 * division is sorted by opts.sort (default: win percentage, best on top).
 * Column headers are clickable buttons (data-sort="<key>"); the page
 * re-renders with the new sort.
 *
 * opts.extended = true adds PL (games played) and "Last 5".
 * opts.vertical = true uses the vertical-screen column order
 *   (Last 5, W, L, PL, Pct, GB) instead of (PL, W, L, Pct, GB, Last 5).
 * opts.last5 = { status, byTeam, names } feeds the Last 5 column.
 * opts.spots = computePlayoffSpots(...) adds a soft yellow dot before playoff teams.
 * opts.flat = true skips the East/Central/West grouping and renders every team
 *   passed in as one single table (used by AL.html / NL.html's whole-league view).
 * opts.leagueId, together with each division's name (or 'All' when opts.flat),
 *   forms that table's sort "group" key (e.g. "103:East"). opts.sortByGroup, a
 *   Map<groupKey, {key,dir}>, gives each table its OWN current sort, so clicking
 *   a column header in one division/table never reorders any other one on the
 *   page - a table with no entry in that map (or no map at all) falls back to
 *   opts.sort (or the overall default, best win % on top).
 * Without opts.extended the table is the plain Team / W / L / Pct / GB layout
 * (standings.html relies on that).
 */
function standingsTableHtml(teams, year, opts = {}) {
  const extended = !!opts.extended;
  const fallbackSort = opts.sort || STANDINGS_DEFAULT_SORT;
  const columns = !extended ? STANDINGS_PLAIN_COLUMNS
    : (opts.vertical ? STANDINGS_VERTICAL_COLUMNS : STANDINGS_WIDE_COLUMNS);

  const cell = (key, t) => {
    switch (key) {
      case 'pl': {
        const ok = t.w !== null && t.w !== undefined && t.l !== null && t.l !== undefined &&
          Number.isFinite(Number(t.w)) && Number.isFinite(Number(t.l));
        return `<td class="num">${ok ? Number(t.w) + Number(t.l) : '—'}</td>`;
      }
      case 'w': return `<td class="num">${t.w ?? '—'}</td>`;
      case 'l': return `<td class="num">${t.l ?? '—'}</td>`;
      case 'pct': {
        const val = t.pct !== undefined && t.pct !== null ? t.pct : '—';
        const trend = extended ? pctTrend(t.id, opts.last5) : null;
        if (!trend) return `<td class="num">${val}</td>`;
        return `<td class="num ${trend.cls}" title="${escapeHtml(trend.tip)}">${val}</td>`;
      }
      case 'gb': return `<td class="num">${t.gb ?? '—'}</td>`;
      case 'last5': return lastFiveCellHtml(t.id, year, opts.last5);
      default: return '';
    }
  };

  let groups;
  if (opts.flat) {
    groups = new Map([['All', teams]]);
  } else {
    groups = new Map([['East', []], ['Central', []], ['West', []], ['Other', []]]);
    for (const t of teams) {
      groups.get(divisionFor(t.id, year) || 'Other').push(t);
    }
  }

  let html = '';
  for (const [division, rows] of groups) {
    if (rows.length === 0) continue;
    const groupKey = `${opts.leagueId ?? 'x'}:${division}`;
    const sort = (opts.sortByGroup && opts.sortByGroup.get(groupKey)) || fallbackSort;
    if (!opts.flat) html += `<div class="division-label">${division}</div>`;
    html += `<div class="table-scroll"><table class="ledger${extended ? ' ledger--standings' : ''}"><thead><tr>` +
      `<th class="left">Team</th>${columns.map(k => standingsHeaderHtml(k, sort, groupKey)).join('')}` +
      `</tr></thead><tbody>`;
    for (const t of sortStandingsTeams(rows, sort)) {
      const teamCell = teamLinkHtml(t.id, t.n || `Team ${t.id}`);
      const teamTd = opts.spots
        ? `<span class="team-cell">${playoffDotHtml(t.id, opts.spots)}${teamCell}</span>`
        : teamCell;
      html += `<tr><td class="left">${teamTd}</td>` +
        `${columns.map(k => cell(k, t)).join('')}</tr>`;
    }
    html += `</tbody></table></div>`;
  }
  return html;
}


// ---- index.js ----
function runIndexPage() {

  // Confirmed directly from our own fetch parameters (standings?leagueId=103,104):
  // 103 = American League, 104 = National League. Division-level ids were never
  // used explicitly by us, so standings are grouped by league only, not division,
  // rather than guessing a division-id-to-name mapping.
  const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };
  const LEAGUE_PAGES = { 103: 'AL.html', 104: 'NL.html' };

  async function main() {
    const manifest = await loadManifest().catch((err) => {
      document.querySelectorAll('.state-msg').forEach(el => {
        setStatus(el, `Couldn't load the archive right now (${err.message}).`, true);
      });
      return null;
    });
    if (!manifest) return;

    loadTodaysGames(manifest);
    loadStandings(manifest);
    loadRecentTransactions(manifest);
  }

  // --------------------------------------------------------------------------
  // Today's games (pinned)
  // Live games (score + inning) and today's remaining scheduled games (start
  // time only, no score yet) - finished games aren't shown here, that's what
  // the standings' Last 5 column is for. Polled every LIVE_POLL_MS so a
  // scheduled game flips to live, and a live one updates its score, without a
  // page refresh.
  // --------------------------------------------------------------------------
  async function loadTodaysGames(manifest) {
    const statusEl = document.getElementById('today-status');
    const wrap = document.getElementById('today-wrap');
    setStatus(statusEl, "Loading today's games…");

    const resolveTeamName = createTeamNameResolver(manifest);

    function sortGames(games) {
      return [...games].sort((a, b) => {
        if ((a.state === 'live') !== (b.state === 'live')) return a.state === 'live' ? -1 : 1;
        return new Date(a.gameDate) - new Date(b.gameDate);
      });
    }

    async function render(games) {
      if (games.length === 0) {
        wrap.hidden = true;
        setStatus(statusEl, 'No games today.');
        return;
      }
      const rows = [];
      for (const g of games) {
        const [awayName, homeName] = await Promise.all([
          resolveTeamName(g.awayTeamId),
          resolveTeamName(g.homeTeamId),
        ]);
        const live = g.state === 'live';
        const when = live
          ? `<span class="live-dot" aria-hidden="true"></span> LIVE · ${escapeHtml(g.label || 'In progress')}`
          : fmtGameTime(g.gameDate);
        const scoreCell = live
          ? `<a class="gm-score gm--live" href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a>`
          : `<span class="gm-score gm-score--pending">&ndash;</span>`;
        rows.push(`<div class="gm">
          <div class="gm-when">${when}</div>
          <div class="gm-main">
            <div class="gm-team gm-team--away">${teamLinkHtml(g.awayTeamId, awayName)}</div>
            ${scoreCell}
            <div class="gm-team gm-team--home">${teamLinkHtml(g.homeTeamId, homeName)}</div>
          </div>
        </div>`);
      }
      wrap.innerHTML = `<div class="gm-list">${rows.join('')}</div>`;
      clearStatus(statusEl);
      wrap.hidden = false;
    }

    let current;
    try {
      current = sortGames((await fetchTodaysGames()).filter(g => g.state !== 'final'));
    } catch (err) {
      setStatus(statusEl, `Couldn't load today's games (${err.message}).`, true);
      return;
    }
    await render(current);

    let busy = false;
    setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        current = sortGames((await fetchTodaysGames()).filter(g => g.state !== 'final'));
        await render(current);
      } catch (_) { /* a failed refresh keeps what is already on screen */ }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }

  // --------------------------------------------------------------------------
  // Standings glance
  // --------------------------------------------------------------------------
  async function loadStandings(manifest) {
    const statusEl = document.getElementById('standings-status');
    const wrap = document.getElementById('standings-wrap');
    const heading = document.getElementById('standings-heading');
    setStatus(statusEl, 'Loading standings…');

    const result = await fetchLatestAvailable(manifest, 'standings-splits.json', { transform: normalizeStandings, validate: isStandingsShape }).catch(() => null);
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
    for (const teams of byLeague.values()) {
      teams.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    }

    // team id -> name, used for the hover text on each last-five result
    const names = new Map();
    for (const t of result.data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);

    // rank + playoff spots are worked out once from the full season list (both leagues)
    const spots = computePlayoffSpots(result.data.teams, result.year);
    // Each division's own sort ("103:East", "104:West", ...) - see standingsTableHtml -
    // so clicking a column header in one division only ever re-sorts that division.
    const sortByGroup = new Map();

    const verticalMql = window.matchMedia(VERTICAL_SCREEN_QUERY);
    let currentLast5 = { status: 'pending' };

    function render(last5) {
      currentLast5 = last5;
      let html = '';
      if (last5.status === 'unavailable') {
        html += `<p class="l5-note">Last 5 results couldn't be loaded for ${result.year}.</p>`;
      }
      for (const [lg, teams] of byLeague) {
        const page = LEAGUE_PAGES[lg];
        const name = LEAGUE_NAMES[lg] || `League ${lg}`;
        const heading = page
          ? `<a class="league-heading-link" href="${page}">${leagueLogoCardHtml(lg)}<span>${name}</span></a>`
          : `${leagueLogoCardHtml(lg)}<span>${name}</span>`;
        html += `<h3 class="league-heading" style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
          color:var(--text-secondary);margin:18px 0 8px;">${heading}</h3>`;
        html += standingsTableHtml(teams, result.year, { extended: true, last5, vertical: verticalMql.matches, spots, leagueId: lg, sortByGroup });
      }
      wrap.innerHTML = html;
    }

    // Click a column header to sort by it; click again to reverse. Only the
    // division/table that button belongs to (its data-group) is affected.
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn || !wrap.contains(btn)) return;
      const group = btn.dataset.group;
      const current = sortByGroup.get(group) || STANDINGS_DEFAULT_SORT;
      sortByGroup.set(group, nextStandingsSort(current, btn.dataset.sort));
      render(currentLast5);
    });

    // Re-order the columns if the screen flips between vertical and wide (e.g. rotating a phone).
    const onScreenShapeChange = () => render(currentLast5);
    if (verticalMql.addEventListener) verticalMql.addEventListener('change', onScreenShapeChange);
    else if (verticalMql.addListener) verticalMql.addListener(onScreenShapeChange);

    // Show the standings immediately, then fill in Last 5 once the schedule arrives.
    render({ status: 'pending' });
    clearStatus(statusEl);
    wrap.hidden = false;

    // Finished games (freshest source for the current season) + games being played right now.
    const seasonIsCurrent = Number(result.year) >= new Date().getFullYear();
    const [schedule, liveInitial] = await Promise.all([
      fetchSeasonSchedule(manifest, result.year),
      seasonIsCurrent ? fetchLiveGames().catch(() => []) : Promise.resolve([]),
    ]);

    if (!(Array.isArray(schedule) && schedule.length > 0)) {
      render({ status: 'unavailable' });
      return;
    }

    let finishedByTeam = buildLastFive(schedule);
    let liveList = liveInitial;
    render({ status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) });

    // Keep live games up to date. Only for the current season; an older season has nothing live.
    if (!seasonIsCurrent) return;
    let busy = false;
    let finishedRetries = 0; // after a game ends, re-read the finished list a few times until it shows up there
    setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await fetchLiveGames();
        const ended = liveList.some(p => !next.some(n => String(n.gamePk) === String(p.gamePk)));
        const changed = liveListSig(next) !== liveListSig(liveList);
        if (ended) finishedRetries = 3;

        let refetched = false;
        if (finishedRetries > 0) {
          finishedRetries--;
          const fresh = await fetchSeasonSchedule(manifest, result.year);
          if (Array.isArray(fresh) && fresh.length > 0) { finishedByTeam = buildLastFive(fresh); refetched = true; }
        }

        liveList = next;
        if (changed || refetched) {
          render({ status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) });
        }
      } catch (_) { /* a failed refresh keeps what is already on screen */ }
      finally { busy = false; }
    }, LIVE_POLL_MS);
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

}

// ---- team.js ----
function runTeamPage() {

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

    // not awaited: the rest of the page is already visible while this loads
    loadRecentGames(manifest, id, team.currentName);

    // tabs: Games / Squad / Standings / Trophies
    initTeamTabs(manifest, id);
  }

  function renderTeam(team) {
    document.title = `${team.currentName} — MLB Archive`;
    document.getElementById('crumb-name').textContent = team.currentName;
    document.getElementById('team-name').textContent = team.currentName;
    document.getElementById('team-league').textContent = team.league || '—';
    document.getElementById('team-division').textContent = team.division || '—';

    setImgWithFallback(
      document.getElementById('team-logo'),
      `assets/logos/${team.id}.webp`);
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

  /**
   * Last five games for this team, oldest -> newest (the latest is on the far right). Each card shows the OPPONENT's
   * logo with this team's score underneath (this team's runs first): green if
   * this team won, red if it lost. A game being played right now takes the last (far right)
   * card (pulsing red dot, red score) and is also pinned in the "Latest game"
   * block above; the other 4 cards are the latest finished games.
   * Starts at the current year and walks back until a season has games for
   * this team (early in a year, or for a defunct franchise, the newest season
   * may have none). The current season is read from MLB's schedule API first
   * (see fetchSeasonSchedule), and live games are re-checked every LIVE_POLL_MS.
   */
  async function loadRecentGames(manifest, teamId, teamName) {
    const statusEl2 = document.getElementById('recent-status');
    const grid = document.getElementById('recent-games');
    const heading = document.getElementById('recent-heading');
    setStatus(statusEl2, 'Loading recent games\u2026');

    const resolveTeamName = createTeamNameResolver(manifest);
    let found = null;      // { year, list } finished games, oldest -> newest
    let liveEntry = null;  // this team's game in progress, or null
    let busy = false;
    let finishedRetries = 0;

    async function findFinished() {
      const thisYear = new Date().getFullYear();
      for (let y = thisYear; y >= 1980; y--) {
        const schedule = await fetchSeasonSchedule(manifest, y);
        if (Array.isArray(schedule) && schedule.length > 0) {
          const list = buildLastFive(schedule).get(String(teamId));
          if (list && list.length > 0) return { year: y, list };
        }
      }
      return null;
    }

    function finishedCardHtml(r, oppName, year) {
      const cls = r.outcome === 'W' ? 'rg--w' : r.outcome === 'L' ? 'rg--l' : 'rg--t';
      const verb = r.outcome === 'W' ? 'Won' : r.outcome === 'L' ? 'Lost' : 'Tied';
      const day = new Date(r.date).toLocaleDateString('en-US',
        { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
      const label = `${verb} ${r.us}\u2013${r.them} ${r.home ? 'vs.' : '@'} ${oppName}, ${day}`;
      const href = `game.html?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}`;
      return `<a class="rg-card ${cls}" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="rg-logo">` +
          `<img src="assets/logos/${encodeURIComponent(r.oppId)}.webp" alt="" ` +
            `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
          `<span class="rg-logo__fb" hidden>${escapeHtml(shortTeamName(oppName))}</span>` +
        `</span>` +
        `<span class="rg-score">${r.us}&ndash;${r.them}</span>` +
      `</a>`;
    }

    function liveCardHtml(l, oppName) {
      const label = `LIVE: ${l.us}\u2013${l.them} ${l.home ? 'vs.' : '@'} ${oppName}, ${l.label}`;
      const href = `game.html?id=${encodeURIComponent(l.gamePk)}&year=${encodeURIComponent(l.season)}`;
      return `<a class="rg-card rg--live" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="live-dot rg-live-dot" aria-hidden="true"></span>` +
        `<span class="rg-logo">` +
          `<img src="assets/logos/${encodeURIComponent(l.oppId)}.webp" alt="" ` +
            `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
          `<span class="rg-logo__fb" hidden>${escapeHtml(shortTeamName(oppName))}</span>` +
        `</span>` +
        `<span class="rg-score">${l.us}&ndash;${l.them}</span>` +
      `</a>`;
    }

    async function render() {
      if (!found && !liveEntry) return;
      const liveYear = liveEntry ? Number(liveEntry.season) : null;
      // never mix a live game of a NEW season with finished games of the previous one
      const mix = !!(liveEntry && found && Number(found.year) === liveYear);
      const finished = (found && (!liveEntry || mix)) ? found.list.slice().reverse() : []; // newest first
      const year = liveEntry ? liveYear : found.year;

      const [names, liveOpp] = await Promise.all([
        Promise.all(finished.map(r => resolveTeamName(r.oppId))),
        liveEntry ? resolveTeamName(liveEntry.oppId) : Promise.resolve(null),
      ]);

      // left -> right = oldest -> newest, so the latest game (or the live one) is on the far right
      const cards = [];
      const room = liveEntry ? 4 : 5;
      for (let i = Math.min(room, finished.length) - 1; i >= 0; i--) cards.push(finishedCardHtml(finished[i], names[i], year));
      if (liveEntry) cards.push(liveCardHtml(liveEntry, liveOpp));
      grid.innerHTML = cards.join('');

      heading.textContent = `Last 5 games \u2014 ${year} season`;
      clearStatus(statusEl2);
      grid.hidden = false;

      // the pinned block above: the live game if there is one, otherwise the newest finished game
      if (liveEntry) renderLiveMatchup(teamId, teamName, liveEntry, liveOpp);
      else if (finished.length > 0) renderLatestMatchup(manifest, teamId, teamName, found.year, finished[0], names[0]);
    }

    async function tick() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = liveByTeam(await fetchLiveGames()).get(String(teamId)) || null;
        const changed = liveSig(next) !== liveSig(liveEntry);
        if (liveEntry && !next) finishedRetries = 3; // it just ended: pick up the final result

        let refetched = false;
        if (finishedRetries > 0) {
          finishedRetries--;
          const f = await findFinished();
          if (f) { found = f; refetched = true; }
        }

        liveEntry = next;
        if (changed || refetched) await render();
      } catch (_) { /* a failed refresh keeps what is already on screen */ }
      finally { busy = false; }
    }

    try {
      const [f, liveList] = await Promise.all([
        findFinished(),
        fetchLiveGames().catch(() => []),
      ]);
      found = f;
      liveEntry = liveByTeam(liveList).get(String(teamId)) || null;

      if (!found && !liveEntry) {
        setStatus(statusEl2, 'No completed games found for this team in the archive.');
      } else {
        await render();
      }
    } catch (err) {
      setStatus(statusEl2, `Couldn't load recent games (${err.message}).`, true);
      return;
    }

    setInterval(tick, LIVE_POLL_MS);
  }

  // --------------------------------------------------------------------------
  // Pinned live game (replaces the "Latest game" card while this team is playing).
  // Same card, with a LIVE strip on top and the current score; no dimmed loser,
  // no stat lines (the game isn't over). Clicking it opens game.html (live view).
  // --------------------------------------------------------------------------
  function setLatestLive(isLive) {
    const block = document.getElementById('latest-block');
    const link = document.getElementById('latest-link');
    if (link) link.classList.toggle('matchup--live', isLive);
    const h = block && block.querySelector('h1, h2, h3, .block__heading');
    if (h) {
      if (h.dataset.liveOrig === undefined) h.dataset.liveOrig = h.textContent;
      if (/^\s*latest game\s*$/i.test(h.dataset.liveOrig)) h.textContent = isLive ? 'Live now' : h.dataset.liveOrig;
    }
  }

  function renderLiveMatchup(teamId, teamName, l, oppName) {
    try {
      const block = document.getElementById('latest-block');
      const link = document.getElementById('latest-link');
      if (!block || !link) return;

      setLatestLive(true);
      link.href = `game.html?id=${encodeURIComponent(l.gamePk)}&year=${encodeURIComponent(l.season)}`;
      link.setAttribute('aria-label',
        `Live: ${teamName} ${l.us} to ${l.them} ${l.home ? 'vs.' : '@'} ${oppName}, ${l.label} \u2014 open game`);
      link.innerHTML =
        `<div class="mu-live"><span class="live-dot" aria-hidden="true"></span>` +
          `<span class="mu-live__tag">LIVE</span><span class="mu-live__state">${escapeHtml(l.label)}</span></div>` +
        `<div class="mu-top">` +
          latestTeamHtml(teamId, teamName) +
          `<div class="mu-score"><span>${l.us}</span><span class="mu-dash">&ndash;</span><span>${l.them}</span></div>` +
          latestTeamHtml(l.oppId, oppName) +
        `</div>` +
        `<div class="mu-stats" hidden></div>`;
      block.hidden = false;
    } catch (_) { /* the matchup card is an extra; never let it break the page */ }
  }

  // --------------------------------------------------------------------------
  // Latest game: this team vs the last opponent it played.
  // Two logo cards with the nickname under each, the score between them (the
  // loser's number is faded to 50%), then three stat lines comparing the teams.
  // The whole block is one link to that game's page.
  // --------------------------------------------------------------------------
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Three comparison stats for one game; side is 'a' (away) or 'h' (home). Skips any stat the game file lacks. */
  function latestGameStats(game, usSide, themSide) {
    const box = game.box || {};
    const ls = game.ls || {};

    const batTotal = (side, key) => {
      const t = box[side];
      if (!t) return null;
      if (t.tot && numOrNull(t.tot[key]) !== null) return numOrNull(t.tot[key]);
      if (Array.isArray(t.bat) && t.bat.length) return t.bat.reduce((sum, p) => sum + (numOrNull(p[key]) || 0), 0);
      return null;
    };
    const hits = (side) => {
      const fromLine = Array.isArray(ls[side]) ? numOrNull(ls[side][1]) : null; // linescore totals: R, H, E, LOB
      return fromLine !== null ? fromLine : batTotal(side, 'h');
    };
    const pitchingK = (side) => {
      const t = box[side];
      if (!t || !Array.isArray(t.pit) || t.pit.length === 0) return null;
      return t.pit.reduce((sum, p) => sum + (numOrNull(p.k) || 0), 0);
    };

    const defs = [
      ['Hits', hits],
      ['Home runs', (side) => batTotal(side, 'hr')],
      ['Pitching strikeouts', pitchingK],
    ];
    const out = [];
    for (const [label, fn] of defs) {
      const us = fn(usSide), them = fn(themSide);
      if (us !== null && them !== null) out.push({ label, us, them });
    }
    return out;
  }

  function latestStatRowHtml({ label, us, them }) {
    const lead = us > them ? 'us' : them > us ? 'them' : null;
    const segCls = (side) => lead === null ? '' : (lead === side ? ' is-lead' : ' is-trail');
    const total = us + them;
    const usGrow = total > 0 ? us : 1;
    const themGrow = total > 0 ? them : 1;
    const aria = `${label}: ${us} to ${them}`;
    return `<div class="mu-stat">` +
      `<div class="mu-stat__row">` +
        `<span class="mu-stat__v${lead === 'us' ? ' is-lead' : ''}">${us}</span>` +
        `<span class="mu-stat__label">${escapeHtml(label)}</span>` +
        `<span class="mu-stat__v${lead === 'them' ? ' is-lead' : ''}">${them}</span>` +
      `</div>` +
      `<div class="mu-bar" role="img" aria-label="${escapeHtml(aria)}">` +
        `<span class="mu-bar__seg${segCls('us')}" style="flex:${usGrow} 1 0;"></span>` +
        `<span class="mu-bar__seg${segCls('them')}" style="flex:${themGrow} 1 0;"></span>` +
      `</div>` +
    `</div>`;
  }

  function latestTeamHtml(teamId, name) {
    return `<div class="mu-team">` +
      `<span class="mu-logo"><img src="assets/logos/${encodeURIComponent(teamId)}.webp" alt="" ` +
        `onerror="this.onerror=null;this.style.display='none';"></span>` +
      `<span class="mu-name">${escapeHtml(shortTeamName(name))}</span>` +
    `</div>`;
  }

  async function renderLatestMatchup(manifest, teamId, teamName, year, r, oppName) {
    try {
      setLatestLive(false);
      const block = document.getElementById('latest-block');
      const link = document.getElementById('latest-link');
      if (!block || !link || !r) return;

      const usDim = r.outcome === 'L' ? ' class="mu-dim"' : '';
      const themDim = r.outcome === 'W' ? ' class="mu-dim"' : '';

      link.href = `game.html?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}`;
      link.setAttribute('aria-label',
        `${teamName} ${r.us} to ${r.them} ${r.home ? 'vs.' : '@'} ${oppName} \u2014 open game`);
      link.innerHTML =
        `<div class="mu-top">` +
          latestTeamHtml(teamId, teamName) +
          `<div class="mu-score"><span${usDim}>${r.us}</span><span class="mu-dash">&ndash;</span><span${themDim}>${r.them}</span></div>` +
          latestTeamHtml(r.oppId, oppName) +
        `</div>` +
        `<div class="mu-stats" hidden></div>`;
      block.hidden = false;

      // the stat lines come from the full game file; if it can't be loaded the card simply stays without them
      const game = await fetchSeasonFile(manifest, year, `games/${r.gamePk}.json`);
      if (!game || !game.box) return;
      const stats = latestGameStats(game, r.home ? 'h' : 'a', r.home ? 'a' : 'h');
      if (stats.length === 0) return;
      const statsEl = link.querySelector('.mu-stats');
      statsEl.innerHTML = stats.map(latestStatRowHtml).join('');
      statsEl.hidden = false;
    } catch (_) { /* the matchup card is an extra; never let it break the page */ }
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

  // --------------------------------------------------------------------------
  // Tabs: Games / Squad / Standings / Trophies
  // One season dropdown (shared by Games, Squad and Standings) picks the year.
  // Each tab loads on demand and only re-loads when the season changed.
  // The Trophies tab simply holds the existing #trophy-table.
  // --------------------------------------------------------------------------
  const TAB_FIRST_YEAR = 1980;
  const TAB_LEAGUES = {
    103: { name: 'American League', abbr: 'AL' },
    104: { name: 'National League', abbr: 'NL' },
  };
  const TAB_ROUNDS = { F: 'Wild Card', D: 'Division Series', L: 'League Championship', W: 'World Series' };
  const TAB_POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'DH'];

  function tabOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function initTeamTabs(manifest, teamId) {
    const thisYear = new Date().getFullYear();
    const byId = (id) => document.getElementById(id);
    const tabBtns = Array.from(document.querySelectorAll('#tabs-block .tab'));
    const panels = {
      games: byId('panel-games'),
      squad: byId('panel-squad'),
      standings: byId('panel-standings'),
      trophies: byId('panel-trophies'),
    };
    const seasonBar = byId('season-bar');
    const select = byId('season-select');
    if (!select || tabBtns.length === 0) return;

    const resolveName = createTeamNameResolver(manifest);
    const scheduleCache = new Map();                       // year -> Promise<schedule|null>
    const loadedYear = { games: null, squad: null, standings: null };
    const tokens = { games: 0, squad: 0, standings: 0 };   // ignore answers that arrive after a newer request
    let activeTab = 'games';
    let season = thisYear;

    let options = '';
    for (let y = thisYear; y >= TAB_FIRST_YEAR; y--) options += `<option value="${y}">${y}</option>`;
    select.innerHTML = options;

    function getSchedule(year) {
      if (!scheduleCache.has(year)) {
        const p = fetchSeasonSchedule(manifest, year);
        p.then((r) => { if (!r) scheduleCache.delete(year); }, () => scheduleCache.delete(year));
        scheduleCache.set(year, p);
      }
      return scheduleCache.get(year);
    }

    /** This team's finished games from a season schedule, newest first (spring training / exhibition / all-star left out). */
    function teamGames(schedule) {
      if (!Array.isArray(schedule)) return [];
      const byPk = new Map();
      for (const g of schedule) {
        if (!g || g.gamePk === null || g.gamePk === undefined) continue;
        if (g.status !== 'Final' && g.status !== 'Completed Early') continue;
        if (g.gameType && NON_REGULAR_GAME_TYPES.has(g.gameType)) continue;
        if (String(g.homeTeamId) !== String(teamId) && String(g.awayTeamId) !== String(teamId)) continue;
        if (g.homeScore === null || g.homeScore === undefined ||
            g.awayScore === null || g.awayScore === undefined) continue;
        if (Number.isNaN(Number(g.homeScore)) || Number.isNaN(Number(g.awayScore))) continue;
        const prev = byPk.get(String(g.gamePk));
        if (!prev || String(g.date) >= String(prev.date)) byPk.set(String(g.gamePk), g);
      }
      return [...byPk.values()].sort((a, b) => {
        const ta = Date.parse(a.date), tb = Date.parse(b.date);
        if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
        return Number(b.gamePk) - Number(a.gamePk);
      });
    }

    /** "Mon, Apr 6, 2026 · 7:05 PM GMT+1" in the viewer's time zone (date only if the data has no time). */
    function gameWhen(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      if (!/T\d\d:\d\d/.test(String(iso))) return d.toLocaleDateString('en-US', { ...dateOpts, timeZone: 'UTC' });
      return d.toLocaleDateString('en-US', dateOpts) + ' \u00b7 ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    }

    function gameRowHtml(g, year, names) {
      const home = String(g.homeTeamId) === String(teamId);
      const us = Number(home ? g.homeScore : g.awayScore);
      const them = Number(home ? g.awayScore : g.homeScore);
      const outcome = us > them ? 'W' : us < them ? 'L' : 'T';
      const verb = outcome === 'W' ? 'Won' : outcome === 'L' ? 'Lost' : 'Tied';
      const awayName = names.get(String(g.awayTeamId)) || `Team ${g.awayTeamId}`;
      const homeName = names.get(String(g.homeTeamId)) || `Team ${g.homeTeamId}`;
      const label = `${verb} ${us}\u2013${them} ${home ? 'vs.' : '@'} ${home ? awayName : homeName}`;
      const href = `game.html?id=${encodeURIComponent(g.gamePk)}&year=${encodeURIComponent(year)}`;
      const round = g.gameType && g.gameType !== 'R' ? (TAB_ROUNDS[g.gameType] || 'Postseason') : '';
      return `<div class="gm">` +
        `<div class="gm-when">${escapeHtml(gameWhen(g.date))}` +
          (round ? `<span class="gm-tag">${escapeHtml(round)}</span>` : '') + `</div>` +
        `<div class="gm-main">` +
          `<div class="gm-team gm-team--away${home ? '' : ' is-me'}">${teamLinkHtml(g.awayTeamId, awayName)}</div>` +
          `<a class="gm-score gm--${outcome.toLowerCase()}" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
            `<span>${g.awayScore}&ndash;${g.homeScore}</span><span class="gm-res">${outcome}</span></a>` +
          `<div class="gm-team gm-team--home${home ? ' is-me' : ''}">${teamLinkHtml(g.homeTeamId, homeName)}</div>` +
        `</div></div>`;
    }

    // ---- Games tab ----------------------------------------------------------
    async function loadGames() {
      const my = ++tokens.games, year = season;
      const status = byId('games-status'), list = byId('games-list');
      list.innerHTML = '';
      setStatus(status, `Loading ${year} games\u2026`);

      let games;
      const names = new Map();
      try {
        games = teamGames(await getSchedule(year));
        const ids = [...new Set(games.flatMap(g => [g.awayTeamId, g.homeTeamId]))];
        await Promise.all(ids.map(async (id) => { names.set(String(id), await resolveName(id)); }));
      } catch (err) {
        if (my !== tokens.games) return;
        loadedYear.games = null;
        setStatus(status, `Couldn't load games for ${year} (${err.message}).`, true);
        return;
      }
      if (my !== tokens.games) return;

      if (games.length === 0) {
        setStatus(status, `No completed games found for this team in ${year}.`);
        return;
      }
      list.innerHTML = `<p class="tab-note">${games.length} games \u00b7 newest first</p>` +
        `<div class="gm-list">${games.map(g => gameRowHtml(g, year, names)).join('')}</div>`;
      clearStatus(status);
    }

    // ---- Squad tab (manager + players) -------------------------------------
    async function loadSquad() {
      const my = ++tokens.squad, year = season;
      const status = byId('squad-status'), body = byId('squad-body');
      body.innerHTML = '';
      setStatus(status, `Loading ${year} squad\u2026`);

      let rosters, managers;
      try {
        let managerRows;
        [rosters, managerRows] = await Promise.all([
          fetchSeasonFile(manifest, year, 'rosters.json'),
          fetchSeasonFile(manifest, year, 'manager-stats.json').catch(() => null),
        ]);
        const seen = new Set();
        const mine = (Array.isArray(managerRows) ? managerRows : []).filter((r) => {
          if (!r || String(r.teamId) !== String(teamId) || r.managerId === null || r.managerId === undefined) return false;
          if (seen.has(String(r.managerId))) return false;
          seen.add(String(r.managerId));
          return true;
        });
        managers = await Promise.all(mine.map(async (r) => {
          const rec = await fetchCoreRecord(manifest, 'managers', r.managerId).catch(() => null);
          return {
            id: r.managerId,
            name: rec && rec.fullName ? rec.fullName : `Manager ${r.managerId}`,
            w: r.wins ?? r.w ?? null,
            l: r.losses ?? r.l ?? null,
          };
        }));
      } catch (err) {
        if (my !== tokens.squad) return;
        loadedYear.squad = null;
        setStatus(status, `Couldn't load the ${year} squad (${err.message}).`, true);
        return;
      }
      if (my !== tokens.squad) return;

      // rosters.json row shape: [playerId, fullName, jerseyNumber, position, statusCode]
      const players = rosters && rosters.teams && Array.isArray(rosters.teams[teamId]) ? rosters.teams[teamId].slice() : [];
      if (players.length === 0 && managers.length === 0) {
        setStatus(status, `No squad found for this team in ${year}.`);
        return;
      }

      const posRank = (p) => { const i = TAB_POS_ORDER.indexOf(p); return i === -1 ? 99 : i; };
      const jersey = (j) => { const n = parseInt(j, 10); return Number.isNaN(n) ? 999 : n; };
      players.sort((a, b) =>
        posRank(a[3]) - posRank(b[3]) || jersey(a[2]) - jersey(b[2]) || String(a[1]).localeCompare(String(b[1])));

      let html = `<h3 class="sub-heading">${managers.length > 1 ? 'Managers' : 'Manager'}</h3>`;
      if (managers.length) {
        html += `<ul class="staff-list">` + managers.map((m) => {
          const rec = m.w !== null && m.l !== null ? `<span class="dim">${escapeHtml(m.w)}\u2013${escapeHtml(m.l)}</span>` : '';
          return `<li><a class="team-link" href="manager.html?id=${encodeURIComponent(m.id)}">${escapeHtml(m.name)}</a>${rec}</li>`;
        }).join('') + `</ul>`;
      } else {
        html += `<p class="tab-note">No manager listed for ${year}.</p>`;
      }

      html += `<h3 class="sub-heading">Players (${players.length})</h3>`;
      if (players.length) {
        html += `<div class="table-scroll"><table class="ledger"><thead><tr>` +
          `<th class="left">#</th><th class="left">Player</th><th class="left">Pos</th><th class="left">Status</th>` +
          `</tr></thead><tbody>` +
          players.map(([id, name, num, pos, code]) => `<tr>` +
            `<td class="num">${escapeHtml(num || '\u2014')}</td>` +
            `<td class="left"><a class="team-link" href="player.html?id=${encodeURIComponent(id)}">${escapeHtml(name || `Player ${id}`)}</a></td>` +
            `<td class="left">${escapeHtml(pos || '\u2014')}</td>` +
            `<td class="left">${escapeHtml(code === 'A' ? 'Active' : (code || '\u2014'))}</td>` +
          `</tr>`).join('') +
          `</tbody></table></div>`;
      } else {
        html += `<p class="tab-note">No player roster found for ${year}.</p>`;
      }
      body.innerHTML = html;
      clearStatus(status);
    }

    // ---- Standings tab (this team's league, team highlighted) --------------
    async function loadStandings() {
      const my = ++tokens.standings, year = season;
      const status = byId('stand-status'), body = byId('stand-body');
      body.innerHTML = '';
      setStatus(status, `Loading ${year} standings\u2026`);

      let data;
      try {
        data = normalizeStandings(await fetchSeasonFile(manifest, year, 'standings-splits.json'));
      } catch (err) {
        if (my !== tokens.standings) return;
        loadedYear.standings = null;
        setStatus(status, `Couldn't load the ${year} standings (${err.message}).`, true);
        return;
      }
      if (my !== tokens.standings) return;

      const rows = data && Array.isArray(data.teams) ? data.teams : null;
      if (!rows) {
        setStatus(status, `No standings found for ${year}.`);
        return;
      }
      const me = rows.find(t => String(t.id) === String(teamId));
      if (!me) {
        setStatus(status, `This team isn't in the ${year} standings.`);
        return;
      }

      const league = TAB_LEAGUES[me.lg] || null;
      const leagueName = league ? league.name : `League ${me.lg}`;
      const leagueRows = sortStandingsTeams(rows.filter(t => String(t.lg) === String(me.lg)), STANDINGS_DEFAULT_SORT);
      const rank = leagueRows.findIndex(t => String(t.id) === String(teamId)) + 1;

      let divText = '';
      const myDiv = divisionFor(me.id, year);
      if (myDiv) {
        const divRank = leagueRows.filter(t => divisionFor(t.id, year) === myDiv)
          .findIndex(t => String(t.id) === String(teamId)) + 1;
        if (divRank > 0) divText = ` \u00b7 ${tabOrdinal(divRank)} in the ${league ? league.abbr + ' ' : ''}${myDiv}`;
      }

      const trs = leagueRows.map((t, i) => {
        const isMe = String(t.id) === String(teamId);
        return `<tr${isMe ? ' class="row-me" aria-current="true"' : ''}>` +
          `<td class="num">${i + 1}</td>` +
          `<td class="left">${teamLinkHtml(t.id, t.n || `Team ${t.id}`)}</td>` +
          `<td class="left">${divisionFor(t.id, year) || '\u2014'}</td>` +
          `<td class="num">${t.w ?? '\u2014'}</td>` +
          `<td class="num">${t.l ?? '\u2014'}</td>` +
          `<td class="num">${t.pct ?? '\u2014'}</td>` +
        `</tr>`;
      }).join('');

      body.innerHTML =
        `<p class="tab-note"><strong class="rank-pill">${tabOrdinal(rank)}</strong> of ${leagueRows.length} in the ${escapeHtml(leagueName)}${divText} \u00b7 ${year}</p>` +
        `<div class="table-scroll"><table class="ledger ledger--standings"><thead><tr>` +
          `<th class="left">#</th><th class="left">Team</th><th class="left">Div</th>` +
          `<th title="wins">W</th><th title="losses">L</th><th title="win percentage">Pct</th>` +
        `</tr></thead><tbody>${trs}</tbody></table></div>`;
      clearStatus(status);
    }

    // ---- Tab switching ------------------------------------------------------
    function ensureLoaded() {
      if (activeTab === 'trophies' || loadedYear[activeTab] === season) return;
      loadedYear[activeTab] = season;
      if (activeTab === 'games') loadGames();
      else if (activeTab === 'squad') loadSquad();
      else if (activeTab === 'standings') loadStandings();
    }

    function showTab(name) {
      activeTab = name;
      tabBtns.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      for (const [key, el] of Object.entries(panels)) if (el) el.hidden = key !== name;
      seasonBar.hidden = name === 'trophies';
      ensureLoaded();
    }

    /** Newest season (looking back up to 10 years) in which this team actually played. */
    async function pickDefaultSeason() {
      const floor = Math.max(TAB_FIRST_YEAR, thisYear - 10);
      for (let y = thisYear; y >= floor; y--) {
        try {
          if (teamGames(await getSchedule(y)).length > 0) return y;
        } catch (_) { /* try the previous season */ }
      }
      return thisYear;
    }

    tabBtns.forEach((b) => { b.disabled = true; });
    select.disabled = true;
    setStatus(byId('games-status'), 'Loading games\u2026');

    (async () => {
      try {
        season = await pickDefaultSeason();
        select.value = String(season);
      } finally {
        tabBtns.forEach((b) => { b.disabled = false; });
        select.disabled = false;
      }

      tabBtns.forEach((b) => {
        b.addEventListener('click', () => showTab(b.dataset.tab));
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const n = tabBtns.length;
          const next = tabBtns[(tabBtns.indexOf(b) + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
          next.focus();
          showTab(next.dataset.tab);
          e.preventDefault();
        });
      });
      select.addEventListener('change', () => {
        season = Number(select.value);
        ensureLoaded();
      });
      showTab('games');
    })();
  }

  main();

}

// ---- teams.js ----
function runTeamsPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  async function main() {
    setStatus(statusEl, 'Loading teams…');

    let manifest, entries;
    try {
      manifest = await loadManifest();
      entries = await fetchCoreIndex(manifest, 'teams');
    } catch (err) {
      setStatus(statusEl, `Couldn't load teams right now (${err.message}). Try refreshing.`, true);
      return;
    }

    if (entries.length === 0) {
      setStatus(statusEl, 'No teams found.', true);
      return;
    }

    // id 14 is a "no team" placeholder in the source data, not a real
    // franchise - hidden from this browse list only; the data itself is
    // untouched, and it would still be directly reachable at team.html?id=14
    // if something ever needs to link to it.
    const browsable = entries.filter(e => e.id !== 14);

    initEntityBrowser({
      entries: browsable,
      containerEl: document.getElementById('team-grid'),
      searchEl: document.getElementById('team-search'),
      hrefFor: (e) => `team.html?id=${e.id}`,
      logoFor: (e) => e.id,
      maxRender: 200, // there are only 42 teams — this cap is effectively unlimited
      emptyMessage: 'No teams match your search.',
    });

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  main();

}

// ---- player.js ----
function runPlayerPage() {

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

    const extrasPromise = loadExtras(id).catch(() => null);
    const statsPromise = loadCareerStats(manifest, id, player)
      .catch(() => ({ hitting: [], pitching: [], fielding: [] }));
    initPlayerTabs(manifest, id, player, statsPromise, extrasPromise);

    // Once both are in: country, team, position, status rows + awards.
    Promise.all([statsPromise, extrasPromise]).then(async ([rows, api]) => {
      const extra = await buildExtra(manifest, rows, api);
      renderBio(player, extra);
      renderAwards(api);
    }).catch(() => {});
  }

  function renderBio(p, extra) {
    const api = extra && extra.api ? extra.api : null;
    document.title = `${p.fullName} — MLB Archive`;
    document.getElementById('crumb-name').textContent = p.fullName;
    document.getElementById('player-name').textContent = p.fullName;

    const bats = p.batSide ? `Bats ${p.batSide}` : null;
    const throws = p.pitchHand ? `Throws ${p.pitchHand}` : null;
    const posName = api && api.primaryPosition && api.primaryPosition.name ? api.primaryPosition.name : null;
    document.getElementById('player-meta-line').textContent =
      [posName, bats, throws].filter(Boolean).join(' · ') || 'Player';

    const badges = document.getElementById('player-badges');
    const chips = [];
    if (p.status === 'active') chips.push('<span class="badge badge--active">Active</span>');
    else if (p.status === 'deceased') chips.push('<span class="badge badge--deceased">Deceased</span>');
    else if (p.status) chips.push(`<span class="badge">${p.status[0].toUpperCase()}${p.status.slice(1)}</span>`);
    if (p.hallOfFame && p.hallOfFame.inducted) {
      chips.push(`<span class="badge badge--hof">Hall of Fame ${p.hallOfFame.year || ''}</span>`);
    }
    badges.innerHTML = chips.join(' ');

    const birthplace = api
      ? [api.birthCity, api.birthStateProvince].filter(Boolean).join(', ')
      : '';
    let statusText = null;
    if (p.status) statusText = `${p.status[0].toUpperCase()}${p.status.slice(1)}`;
    else if (api && typeof api.active === 'boolean') statusText = api.active ? 'Active' : 'Retired';

    const bio = document.getElementById('bio-table');
    const rows = [
      ['Country', api && api.birthCountry ? escapeHtml(api.birthCountry) : null],
      ['Born', fmtDate(p.birthDate)],
      ['Birthplace', birthplace ? escapeHtml(birthplace) : null],
      ['Died', p.deathDate ? fmtDate(p.deathDate) : null],
      ['Position', posName ? escapeHtml(posName) : null],
      [extra && extra.teamLabel ? extra.teamLabel : 'Team', extra && extra.teamHtml ? extra.teamHtml : null],
      ['Status', statusText ? escapeHtml(statusText) : null],
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
      return { hitting, pitching, fielding };
    }
    clearStatus(statsStatusEl);

    if (hitting.length) await renderHitting(manifest, hitting);
    if (pitching.length) await renderPitching(manifest, pitching);
    if (fielding.length) await renderFielding(manifest, fielding);

    renderPositionPhoto(fielding);
    return { hitting, pitching, fielding };
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
        <td class="left">${teamLinkHtml(row.teamId, name)}</td>
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
        <td class="left">${teamLinkHtml(row.teamId, name)}</td>
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
        <td class="left">${teamLinkHtml(row.teamId, name)}</td>
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

  // ==========================================================================
  // MLB Stats API extras (country, current team, awards) + player tabs
  // The archive repos hold season stats; birthplace, awards and per-game logs
  // come from MLB's public Stats API (same host the live-game code already uses).
  // ==========================================================================
  const STATSAPI = 'https://statsapi.mlb.com/api/v1';
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  async function apiJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    return res.json();
  }

  /** Person record from the Stats API (null if unavailable). Retries without hydrations if they are rejected. */
  async function loadExtras(playerId) {
    const base = `${STATSAPI}/people/${encodeURIComponent(playerId)}`;
    let data;
    try {
      data = await apiJson(`${base}?hydrate=currentTeam,awards`);
    } catch (_) {
      data = await apiJson(base);
    }
    return data && Array.isArray(data.people) && data.people[0] ? data.people[0] : null;
  }

  /** Date-only string -> "Apr 1" without timezone shifting. */
  function fmtShortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return fmtOrDash(iso);
    return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
  }

  /** [2008, 2009, 2010, 2013] -> "2008–2010, 2013" */
  function yearRanges(years) {
    const ys = [...new Set(years)].sort((a, b) => a - b);
    const out = [];
    let start = ys[0], prev = ys[0];
    for (let i = 1; i <= ys.length; i++) {
      const y = ys[i];
      if (y === prev + 1) { prev = y; continue; }
      out.push(start === prev ? `${start}` : `${start}\u2013${prev}`);
      start = y; prev = y;
    }
    return out.join(', ');
  }

  /** Works out the "Team" bio row: current team if active, else the last team in the archive. */
  async function buildExtra(manifest, rows, api) {
    const extra = { api, teamLabel: null, teamHtml: null };
    const cur = api && api.currentTeam;
    if (api && api.active && cur && cur.id !== null && cur.id !== undefined && cur.name) {
      extra.teamLabel = 'Team';
      extra.teamHtml = teamLinkHtml(cur.id, escapeHtml(cur.name));
      return extra;
    }
    const all = [...(rows.hitting || []), ...(rows.pitching || []), ...(rows.fielding || [])]
      .filter((r) => r.teamId !== null && r.teamId !== undefined);
    if (all.length) {
      const maxYear = Math.max(...all.map((r) => r.year));
      const last = all.filter((r) => r.year === maxYear).sort((a, b) => b.teamId - a.teamId)[0];
      const name = await teamName(manifest, last.teamId);
      extra.teamLabel = 'Last team';
      extra.teamHtml = teamLinkHtml(last.teamId, escapeHtml(name));
    }
    return extra;
  }

  // ---- Trophies & awards ---------------------------------------------------
  const AWARD_PRIORITY = /(MVP|Most Valuable|Cy Young|Rookie of the Year|World Series|Hall of Fame|Gold Glove|Silver Slugger|All-Star|Triple Crown|Batting Title|Home Run Leader)/i;

  function renderAwards(api) {
    const block = document.getElementById('awards-block');
    const table = document.getElementById('awards-table');
    const note = document.getElementById('awards-note');
    table.innerHTML = '';
    note.hidden = true;

    if (!api || !Array.isArray(api.awards)) {
      block.hidden = false;
      note.textContent = 'Awards are unavailable right now.';
      note.hidden = false;
      return;
    }
    if (api.awards.length === 0) { block.hidden = true; return; }

    const groups = new Map(); // award name -> { count, years:Set }
    for (const a of api.awards) {
      const name = a && (a.name || a.id);
      if (!name) continue;
      if (!groups.has(name)) groups.set(name, { count: 0, years: new Set() });
      const g = groups.get(name);
      g.count++;
      const y = a.season || (a.date ? String(a.date).slice(0, 4) : '');
      if (y) g.years.add(String(y));
    }
    if (groups.size === 0) { block.hidden = true; return; }

    const entries = [...groups.entries()].sort((a, b) => {
      const pa = AWARD_PRIORITY.test(a[0]) ? 0 : 1, pb = AWARD_PRIORITY.test(b[0]) ? 0 : 1;
      return pa - pb || a[0].localeCompare(b[0]);
    });

    table.innerHTML = entries.map(([name, g]) => {
      const years = [...g.years].sort();
      let when = years.join(', ');
      if (years.length > 12) when = `${years[0]}\u2013${years[years.length - 1]}`;
      const times = g.count > 1 ? `${g.count}\u00d7` : '';
      const value = [times, when].filter(Boolean).join(' \u00b7 ');
      return `<tr><td class="trophy-label">${escapeHtml(name)}</td><td class="trophy-years">${escapeHtml(value || '\u2014')}</td></tr>`;
    }).join('');
    block.hidden = false;
  }

  // ---- Tabs ----------------------------------------------------------------
  function initPlayerTabs(manifest, playerId, player, statsPromise, extrasPromise) {
    const btns = Array.from(document.querySelectorAll('#player-tabs .tab'));
    const panels = {
      overview: document.getElementById('panel-overview'),
      games: document.getElementById('panel-games'),
      career: document.getElementById('panel-career'),
      heatmap: document.getElementById('panel-heatmap'),
    };
    const started = {};
    let heatmap = null;

    function show(name) {
      btns.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      for (const [key, el] of Object.entries(panels)) if (el) el.hidden = key !== name;
      if (started[name]) {
        if (name === 'heatmap' && heatmap) heatmap.redraw(); // the canvas can't be sized while its tab is hidden
        return;
      }
      started[name] = true;
      if (name === 'games') initGamesTab(manifest, playerId, statsPromise, extrasPromise);
      else if (name === 'career') renderCareerTab(manifest, player, statsPromise, extrasPromise);
      else if (name === 'heatmap') heatmap = initHeatmapTab(manifest, playerId, statsPromise, extrasPromise);
    }

    btns.forEach((b) => {
      b.addEventListener('click', () => show(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = btns.length;
        const next = btns[(btns.indexOf(b) + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
        next.focus();
        show(next.dataset.tab);
        e.preventDefault();
      });
    });
  }

  // ---- Games tab -----------------------------------------------------------
  // Team dropdown -> season dropdown (only seasons played for that team) ->
  // every game that season from MLB's per-player game log.
  function initGamesTab(manifest, playerId, statsPromise, extrasPromise) {
    const byId = (x) => document.getElementById(x);
    const teamSel = byId('games-team');
    const seasonSel = byId('games-season');
    const groupSel = byId('games-group');
    const groupLabel = byId('games-group-label');
    const status = byId('games-status');
    const list = byId('games-list');

    const HIT_COLS = [['AB', 'atBats'], ['R', 'runs'], ['H', 'hits'], ['2B', 'doubles'], ['3B', 'triples'],
      ['HR', 'homeRuns'], ['RBI', 'rbi'], ['BB', 'baseOnBalls'], ['SO', 'strikeOuts'], ['SB', 'stolenBases']];
    const PIT_COLS = [['IP', 'inningsPitched'], ['H', 'hits'], ['R', 'runs'], ['ER', 'earnedRuns'],
      ['BB', 'baseOnBalls'], ['SO', 'strikeOuts'], ['HR', 'homeRuns']];
    const GROUP_NAMES = { hitting: 'Hitting', pitching: 'Pitching' };

    const logCache = new Map(); // "year|group" -> Promise<splits[]>
    let token = 0;
    let teams = [];             // [{ id, name, years: Map(year -> Set(groups)) }]
    let defaultGroup = 'hitting';

    function splitsOf(data) {
      return data && Array.isArray(data.stats) && data.stats[0] && Array.isArray(data.stats[0].splits)
        ? data.stats[0].splits : [];
    }

    function fetchGameLog(year, group) {
      const key = `${year}|${group}`;
      if (logCache.has(key)) return logCache.get(key);
      const p = (async () => {
        const base = `${STATSAPI}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=${group}&season=${year}`;
        let regData;
        try { regData = await apiJson(`${base}&gameType=R`); } catch (_) { regData = await apiJson(base); }
        const regular = splitsOf(regData);
        let post = [];
        try {
          post = splitsOf(await apiJson(`${base}&gameType=P`)).map((s) => ({ ...s, _post: true }));
        } catch (_) { /* postseason is a bonus; regular season still shows */ }
        return regular.concat(post);
      })();
      logCache.set(key, p);
      p.catch(() => logCache.delete(key));
      return p;
    }

    const currentTeam = () => teams.find((t) => String(t.id) === teamSel.value);

    function fillTeams() {
      teamSel.innerHTML = teams.map((t) => {
        const ys = [...t.years.keys()].sort((a, b) => a - b);
        const span = ys[0] === ys[ys.length - 1] ? `${ys[0]}` : `${ys[0]}\u2013${ys[ys.length - 1]}`;
        return `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} (${span})</option>`;
      }).join('');
    }

    function fillSeasons() {
      const ys = [...currentTeam().years.keys()].sort((a, b) => b - a);
      seasonSel.innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join('');
      seasonSel.value = String(ys[0]);
    }

    function fillGroups() {
      const set = currentTeam().years.get(Number(seasonSel.value)) || new Set();
      const avail = ['hitting', 'pitching'].filter((g) => set.has(g));
      if (avail.length === 0) avail.push('hitting');
      const prev = groupSel.value;
      groupSel.innerHTML = avail.map((g) => `<option value="${g}">${GROUP_NAMES[g]}</option>`).join('');
      groupSel.value = avail.includes(prev) ? prev : (avail.includes(defaultGroup) ? defaultGroup : avail[0]);
      groupSel.hidden = avail.length < 2;
      groupLabel.hidden = avail.length < 2;
    }

    function renderLog(games, group, year) {
      const isPit = group === 'pitching';
      const cols = isPit ? PIT_COLS : HIT_COLS;
      const tot = {};
      let outs = 0, postCount = 0;

      const body = games.map((s) => {
        const st = s.stat || {};
        if (s._post) postCount++;
        for (const [, k] of cols) {
          if (k === 'inningsPitched') outs += inningsToOuts(st[k]);
          else tot[k] = (tot[k] || 0) + (Number(st[k]) || 0);
        }
        const gamePk = s.game && s.game.gamePk;
        const dateTxt = fmtShortDate(s.date);
        const dateCell = gamePk
          ? `<a class="team-link" href="${gameHref({ gamePk, season: year })}">${dateTxt}</a>`
          : dateTxt;
        const tag = s._post ? ' <span class="gm-tag">Post</span>' : '';
        const myTeam = s.team || {};
        const opp = s.opponent || {};
        const res = s.isWin === true ? '<span class="pg-res pg-res--w">W</span>'
          : s.isWin === false ? '<span class="pg-res pg-res--l">L</span>' : '\u2014';
        let dec = '';
        if (isPit) {
          const d = st.wins === 1 ? 'W' : st.losses === 1 ? 'L' : st.saves === 1 ? 'SV' : st.holds === 1 ? 'H' : '';
          dec = `<td class="num">${d || '\u2014'}</td>`;
        }
        const cells = cols.map(([, k]) => `<td class="num">${fmtOrDash(st[k])}</td>`).join('');
        return `<tr>` +
          `<td class="left">${dateCell}${tag}</td>` +
          `<td class="left">${teamLinkHtml(myTeam.id, escapeHtml(myTeam.name || 'Team'))}</td>` +
          `<td class="left">${s.isHome === true ? 'vs' : '@'}</td>` +
          `<td class="left">${teamLinkHtml(opp.id, escapeHtml(opp.name || 'Opponent'))}</td>` +
          `<td class="num">${res}</td>${dec}${cells}</tr>`;
      }).join('');

      const head = `<th class="left">Date</th><th class="left">Team</th><th class="left"></th>` +
        `<th class="left">Opponent</th><th>Res</th>${isPit ? '<th>Dec</th>' : ''}` +
        cols.map(([label]) => `<th>${label}</th>`).join('');
      const foot = `<td class="left" colspan="5">Totals</td>${isPit ? '<td></td>' : ''}` +
        cols.map(([, k]) => `<td class="num">${k === 'inningsPitched' ? outsToInnings(outs) : (tot[k] || 0)}</td>`).join('');

      let summary;
      if (isPit) {
        summary = outs > 0 ? `${fmtNum((tot.earnedRuns || 0) * 27 / outs, 2)} ERA` : '\u2014 ERA';
      } else {
        summary = `${tot.atBats ? fmtAvg((tot.hits || 0) / tot.atBats) : '\u2014'} AVG`;
      }
      const note = `${games.length} game${games.length === 1 ? '' : 's'}` +
        `${postCount ? ` (${postCount} postseason)` : ''} \u00b7 ${summary}`;

      return `<p class="tab-note">${note}</p>` +
        `<div class="table-scroll"><table class="ledger"><thead><tr>${head}</tr></thead>` +
        `<tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table></div>`;
    }

    async function load() {
      const my = ++token;
      const year = Number(seasonSel.value), group = groupSel.value, team = currentTeam();
      list.innerHTML = '';
      setStatus(status, `Loading ${year} games\u2026`);
      let splits;
      try {
        splits = await fetchGameLog(year, group);
      } catch (err) {
        if (my !== token) return;
        setStatus(status, `Couldn't load games for ${year} (${err.message}).`, true);
        return;
      }
      if (my !== token) return;

      const games = splits
        .filter((s) => s.team && String(s.team.id) === String(team.id))
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      if (games.length === 0) {
        setStatus(status, `No ${GROUP_NAMES[group].toLowerCase()} games found for ${team.name} in ${year}.`);
        return;
      }
      clearStatus(status);
      list.innerHTML = renderLog(games, group, year);
    }

    async function start() {
      setStatus(status, 'Loading seasons\u2026');
      const [rows, api] = await Promise.all([statsPromise, extrasPromise]);

      const byTeam = new Map();
      function add(teamId, year, group) {
        const key = String(teamId);
        if (!byTeam.has(key)) byTeam.set(key, { id: key, name: key, years: new Map() });
        const t = byTeam.get(key);
        if (!t.years.has(year)) t.years.set(year, new Set());
        if (group) t.years.get(year).add(group);
      }
      for (const g of ['hitting', 'pitching', 'fielding']) {
        for (const r of rows[g] || []) {
          if (r.teamId === null || r.teamId === undefined) continue;
          add(r.teamId, r.year, g === 'fielding' ? null : g);
        }
      }

      // The archive stops at 2025; add the current season for active players.
      const thisYear = new Date().getFullYear();
      const cur = api && api.currentTeam;
      const pos = api && api.primaryPosition ? api.primaryPosition.abbreviation : null;
      const maxYear = Math.max(0, ...[...byTeam.values()].flatMap((t) => [...t.years.keys()]));
      if (api && api.active && cur && cur.id !== null && cur.id !== undefined && maxYear < thisYear) {
        if (pos === 'P') add(cur.id, thisYear, 'pitching');
        else if (pos === 'TWP') { add(cur.id, thisYear, 'hitting'); add(cur.id, thisYear, 'pitching'); }
        else add(cur.id, thisYear, 'hitting');
      }

      teams = [...byTeam.values()];
      if (teams.length === 0) {
        setStatus(status, 'No seasons found for this player in the archive.', true);
        teamSel.disabled = seasonSel.disabled = true;
        return;
      }
      await Promise.all(teams.map(async (t) => { t.name = await teamName(manifest, t.id); }));
      teams.sort((a, b) => Math.max(...b.years.keys()) - Math.max(...a.years.keys()));

      if (pos === 'P') defaultGroup = 'pitching';
      else if (pos) defaultGroup = 'hitting';
      else defaultGroup = (rows.pitching || []).length > (rows.hitting || []).length ? 'pitching' : 'hitting';

      fillTeams();
      teamSel.value = teams[0].id;
      fillSeasons();
      fillGroups();

      teamSel.addEventListener('change', () => { fillSeasons(); fillGroups(); load(); });
      seasonSel.addEventListener('change', () => { fillGroups(); load(); });
      groupSel.addEventListener('change', load);
      load();
    }

    start().catch((err) => {
      setStatus(status, `Couldn't load games (${err.message}).`, true);
    });
  }

  // ---- Career tab ----------------------------------------------------------
  async function renderCareerTab(manifest, player, statsPromise, extrasPromise) {
    const status = document.getElementById('career-status');
    const body = document.getElementById('career-body');
    setStatus(status, 'Loading career\u2026');

    let rows, api;
    try {
      [rows, api] = await Promise.all([statsPromise, extrasPromise]);
    } catch (err) {
      setStatus(status, `Couldn't load the career (${err.message}).`, true);
      return;
    }
    const hitting = rows.hitting || [], pitching = rows.pitching || [], fielding = rows.fielding || [];
    if (hitting.length + pitching.length + fielding.length === 0) {
      setStatus(status, 'No career data found for this player in the archive.', true);
      return;
    }
    clearStatus(status);

    // teams: years played + games per season
    const teamMap = new Map();
    for (const [grp, list] of [['hitting', hitting], ['pitching', pitching], ['fielding', fielding]]) {
      for (const r of list) {
        if (r.teamId === null || r.teamId === undefined) continue;
        const k = String(r.teamId);
        if (!teamMap.has(k)) teamMap.set(k, { id: r.teamId, years: new Set(), g: new Map() });
        const t = teamMap.get(k);
        t.years.add(r.year);
        const s = r.stat || {};
        const g = Number(grp === 'fielding' ? s.games : (s.gamesPlayed ?? s.gamesPitched)) || 0;
        t.g.set(r.year, Math.max(t.g.get(r.year) || 0, g));
      }
    }
    const teamList = [...teamMap.values()].sort((a, b) => Math.min(...a.years) - Math.min(...b.years));
    const names = await Promise.all(teamList.map((t) => teamName(manifest, t.id)));

    const teamRows = teamList.map((t, i) => {
      const games = [...t.g.values()].reduce((a, b) => a + b, 0);
      return `<tr>` +
        `<td class="left">${teamLinkHtml(t.id, escapeHtml(names[i]))}</td>` +
        `<td class="left">${yearRanges([...t.years])}</td>` +
        `<td class="num">${t.years.size}</td>` +
        `<td class="num">${games ? games.toLocaleString('en-US') : '\u2014'}</td></tr>`;
    }).join('');

    // career totals (same summing rules as the Overview tables)
    const seasons = new Set([...hitting, ...pitching, ...fielding].map((r) => r.year));
    const hit = { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, sb: 0 };
    for (const r of hitting) {
      const s = r.stat || {};
      hit.g += s.gamesPlayed ?? 0; hit.ab += s.atBats ?? 0; hit.h += s.hits ?? 0;
      hit.hr += s.homeRuns ?? 0; hit.rbi += s.rbi ?? 0; hit.sb += s.stolenBases ?? 0;
    }
    const pit = { w: 0, l: 0, er: 0, outs: 0, so: 0 };
    for (const r of pitching) {
      const s = r.stat || {};
      pit.w += s.wins ?? 0; pit.l += s.losses ?? 0; pit.er += s.earnedRuns ?? 0;
      pit.outs += inningsToOuts(s.inningsPitched); pit.so += s.strikeOuts ?? 0;
    }
    const posGames = new Map();
    for (const r of fielding) {
      const s = r.stat || {};
      const ab = s.position && s.position.abbreviation;
      if (ab) posGames.set(ab, (posGames.get(ab) || 0) + (Number(s.games) || 0));
    }
    const positions = [...posGames.entries()].sort((a, b) => b[1] - a[1])
      .map(([ab, g]) => `${escapeHtml(ab)} (${g.toLocaleString('en-US')} G)`).join(', ');

    const first = Math.min(...seasons), last = Math.max(...seasons);
    const summary = [
      ['Seasons', `${seasons.size} (${first === last ? first : `${first}\u2013${last}`})`],
      ['Teams', String(teamList.length)],
      ['MLB debut', player.debutDate ? fmtDate(player.debutDate) : null],
      ['Last active', player.lastActiveSeason ? escapeHtml(player.lastActiveSeason) : null],
      ['Positions', positions || null],
      ['Hitting', hit.ab > 0
        ? `${hit.g.toLocaleString('en-US')} G \u00b7 ${hit.h.toLocaleString('en-US')} H \u00b7 ${hit.hr} HR \u00b7 ${hit.rbi} RBI \u00b7 ${hit.sb} SB \u00b7 ${fmtAvg(hit.h / hit.ab)} AVG`
        : null],
      ['Pitching', pit.outs > 0
        ? `${pit.w || '\u2014'}\u2013${pit.l || '\u2014'} \u00b7 ${fmtNum(pit.er * 27 / pit.outs, 2)} ERA \u00b7 ${outsToInnings(pit.outs)} IP \u00b7 ${pit.so} SO`
        : null],
      ['Awards', api && Array.isArray(api.awards) && api.awards.length ? String(api.awards.length) : null],
      ['Hall of Fame', player.hallOfFame && player.hallOfFame.inducted
        ? `Inducted${player.hallOfFame.year ? ` ${escapeHtml(player.hallOfFame.year)}` : ''}` : null],
    ].filter(([, v]) => v !== null);

    body.innerHTML =
      `<section class="block"><h2 class="block__heading">Career summary</h2>` +
      `<table class="trophy-table">${summary.map(([label, val]) =>
        `<tr><td class="trophy-label">${label}</td><td class="trophy-years">${val}</td></tr>`).join('')}</table></section>` +
      `<section class="block"><h2 class="block__heading">Teams</h2><div class="table-scroll">` +
      `<table class="ledger"><thead><tr><th class="left">Team</th><th class="left">Years</th><th>Seasons</th><th>G</th></tr></thead>` +
      `<tbody>${teamRows}</tbody></table></div></section>`;
  }

  // ==========================================================================
  // Heat Map tab
  // Batted-ball locations for one player on a baseball field. Locations come
  // from MLB's play-by-play feed (hitData.coordinates, Gameday coordinates),
  // one request per game, so everything is cached (memory + localStorage),
  // loaded only when the tab is opened, and fetched in small parallel batches.
  // ==========================================================================
  const HM_VERSION = 1;
  // The field is drawn in feet: home plate (0,0), +y toward center field, +x toward right field.
  const HM_W = 520, HM_H = 460, HM_X0 = -260, HM_Y1 = 430;
  const HM_FIELDS = 'allPlays,result,eventType,matchup,batter,pitcher,id,batSide,code,' +
    'playEvents,details,isInPlay,hitData,launchSpeed,launchAngle,totalDistance,coordinates,coordX,coordY';
  const HM_EVENT_RES = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  const HM_RES_COLORS = { OUT: '#9aa4b2', '1B': '#4ade80', '2B': '#38bdf8', '3B': '#c084fc', HR: '#facc15' };
  const HM_RES_NAMES = { OUT: 'Out / error', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' };
  // Plays that can never end on a batted ball (used only if a feed lacks details.isInPlay).
  const HM_NON_BIP = new Set(['strikeout', 'strikeout_double_play', 'strikeout_triple_play', 'walk', 'intent_walk',
    'hit_by_pitch', 'catcher_interf', 'batter_interference', 'balk', 'wild_pitch', 'passed_ball', 'pickoff_1b',
    'pickoff_2b', 'pickoff_3b', 'stolen_base_2b', 'stolen_base_3b', 'caught_stealing_2b', 'caught_stealing_3b']);
  const HM_EVENT_LABELS = {
    single: 'Single', double: 'Double', triple: 'Triple', home_run: 'Home run', field_out: 'Field out',
    force_out: 'Force out', grounded_into_double_play: 'Grounded into DP', double_play: 'Double play',
    triple_play: 'Triple play', sac_fly: 'Sac fly', sac_fly_double_play: 'Sac fly DP', sac_bunt: 'Sac bunt',
    sac_bunt_double_play: 'Sac bunt DP', fielders_choice: "Fielder's choice", fielders_choice_out: "Fielder's choice out",
    field_error: 'Reached on error',
  };
  const HM_STOPS = [
    [0.00, [59, 130, 246, 0]], [0.12, [59, 130, 246, 95]], [0.32, [34, 211, 238, 150]],
    [0.52, [74, 222, 128, 185]], [0.72, [250, 204, 21, 210]], [0.88, [249, 115, 22, 225]], [1.00, [239, 68, 68, 240]],
  ];
  const HM_LUT = (function buildLut() {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 1;
      while (k < HM_STOPS.length - 1 && t > HM_STOPS[k][0]) k++;
      const [t0, c0] = HM_STOPS[k - 1], [t1, c1] = HM_STOPS[k];
      const f = t1 === t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      for (let c = 0; c < 4; c++) lut[i * 4 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
    }
    return lut;
  })();
  let hmUseFields = true; // flipped off for good if the API ever rejects the `fields` filter

  const hmNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const hmSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hmSplits = (data) => (data && Array.isArray(data.stats) && data.stats[0] && Array.isArray(data.stats[0].splits)
    ? data.stats[0].splits : []);
  const hmPlays = (d) => (d && Array.isArray(d.allPlays) ? d.allPlays
    : d && d.liveData && d.liveData.plays && Array.isArray(d.liveData.plays.allPlays) ? d.liveData.plays.allPlays : []);

  function hmEventLabel(t) {
    if (HM_EVENT_LABELS[t]) return HM_EVENT_LABELS[t];
    return t ? String(t).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Batted ball';
  }

  /** Runs fn over items with at most `limit` in flight; stops picking up new items once cancelled() is true. */
  async function hmPool(items, limit, fn, cancelled) {
    let i = 0;
    const worker = async () => {
      while (i < items.length) {
        if (cancelled && cancelled()) return;
        await fn(items[i++]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  /** Play-by-play for one game (small, field-filtered; retries; falls back to the unfiltered feed). */
  async function hmFetchPlays(gamePk) {
    const base = `${STATSAPI}/game/${encodeURIComponent(gamePk)}/playByPlay`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (hmUseFields) {
          const res = await fetch(`${base}?fields=${HM_FIELDS}`);
          if (res.ok) {
            const d = await res.json();
            if (hmPlays(d).length || (d && Array.isArray(d.allPlays))) return d;
            hmUseFields = false; // unexpected shape from the filter: stop using it
          } else if (res.status === 404) {
            const e = new Error('404'); e.noRetry = true; throw e;
          } else if (res.status === 429 || res.status >= 500) {
            throw new Error(String(res.status));
          } else {
            hmUseFields = false; // 400 etc: the filter itself was refused
          }
        }
        const res2 = await fetch(base);
        if (res2.status === 404) { const e = new Error('404'); e.noRetry = true; throw e; }
        if (!res2.ok) throw new Error(String(res2.status));
        return await res2.json();
      } catch (e) {
        lastErr = e;
        if (e && e.noRetry) break;
        await hmSleep(500 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  /** Every game a player appeared in for a season (regular + postseason), oldest first. */
  async function hmFetchGames(playerId, year, group) {
    const base = `${STATSAPI}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=${group}&season=${year}`;
    let reg;
    try { reg = await apiJson(`${base}&gameType=R`); } catch (_) { reg = await apiJson(base); }
    let post = null;
    try { post = await apiJson(`${base}&gameType=P`); } catch (_) { /* postseason is optional */ }
    const seen = new Set(), out = [];
    const take = (data, isPost) => {
      for (const s of hmSplits(data)) {
        const pk = s.game && s.game.gamePk;
        if (!pk || seen.has(pk)) continue;
        seen.add(pk);
        out.push({ gamePk: pk, date: s.date || '', post: isPost });
      }
    };
    take(reg, false);
    take(post, true);
    out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return out;
  }

  /**
   * One game's plays -> this player's batted balls. Gameday coordinates are converted to feet
   * (home plate at 125.42, 198.27 on the 250x250 grid, 2.5 ft per unit). Only the pitch that ended the
   * plate appearance counts, so foul balls and strikeouts never show up.
   */
  function hmExtract(feed, playerId, group, g) {
    const hits = [];
    let pa = 0;
    const pid = String(playerId);
    for (const play of hmPlays(feed)) {
      const m = play.matchup || {};
      const who = group === 'pitching' ? m.pitcher : m.batter;
      if (!who || String(who.id) !== pid) continue;
      pa++;
      const et = play.result && play.result.eventType ? play.result.eventType : '';
      const evs = Array.isArray(play.playEvents) ? play.playEvents : [];
      let hd = null;
      for (let i = evs.length - 1; i >= 0; i--) {
        const e = evs[i];
        const co = e && e.hitData && e.hitData.coordinates;
        if (!co || co.coordX === null || co.coordX === undefined || co.coordY === null || co.coordY === undefined) continue;
        if ((e.details && e.details.isInPlay === true) || (!e.details && !HM_NON_BIP.has(et))) { hd = e.hitData; break; }
      }
      if (!hd) continue;
      const x = 2.5 * (Number(hd.coordinates.coordX) - 125.42);
      const y = 2.5 * (198.27 - Number(hd.coordinates.coordY));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      hits.push({
        x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
        v: hmNum(hd.launchSpeed), a: hmNum(hd.launchAngle), d: hmNum(hd.totalDistance),
        r: HM_EVENT_RES[et] || 'OUT', t: et, p: g.post ? 1 : 0,
        s: m.batSide && m.batSide.code ? m.batSide.code : null, g: g.gamePk, dt: g.date,
      });
    }
    return { hits, pa };
  }

  /** The ballpark: generic 330 ft lines / 400 ft center field, drawn in feet and flipped so +y is up. */
  function hmFieldSvg() {
    const d = 233, b = 63.64, r45 = Math.SQRT1_2;
    const ring = (r) => `<path d="M${(-r * r45).toFixed(1)} ${(r * r45).toFixed(1)} A${r} ${r} 0 0 0 ${(r * r45).toFixed(1)} ${(r * r45).toFixed(1)}" ` +
      `fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1" stroke-dasharray="4 5"/>`;
    const ringLabel = (r) => `<text x="${(-r * Math.sin(0.62)).toFixed(1)}" y="${(-r * Math.cos(0.62)).toFixed(1)}" ` +
      `fill="rgba(255,255,255,0.38)" font-size="10" text-anchor="middle">${r} ft</text>`;
    const base = (x, y) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" fill="#f9f8f4" transform="rotate(45 ${x} ${y})"/>`;
    return `<svg class="hm-svg" viewBox="${HM_X0} ${-HM_Y1} ${HM_W} ${HM_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
      `<defs><clipPath id="hm-wedge"><path d="M0 0 L-460 460 L460 460 Z"/></clipPath></defs>` +
      `<g transform="scale(1,-1)">` +
        `<path d="M0 0 L${-d} ${d} Q0 567 ${d} ${d} Z" fill="#12301f"/>` +
        `<path d="M${-d} ${d} Q0 567 ${d} ${d}" fill="none" stroke="#6b4f2e" stroke-opacity="0.55" stroke-width="12"/>` +
        `<g clip-path="url(#hm-wedge)"><circle cx="0" cy="60.5" r="95" fill="#5a4128" fill-opacity="0.6"/></g>` +
        `<circle cx="0" cy="0" r="13" fill="#5a4128" fill-opacity="0.6"/>` +
        `<path d="M0 20 L${-44} ${b} L0 ${2 * b - 20} L44 ${b} Z" fill="#17402a"/>` +
        `<path d="M0 0 L${b} ${b} L0 ${2 * b} L${-b} ${b} Z" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>` +
        `<path d="M0 0 L${-d} ${d} M0 0 L${d} ${d}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>` +
        ring(150) + ring(250) + ring(350) +
        `<circle cx="0" cy="60.5" r="8" fill="#6b4f2e"/>` +
        base(b, b) + base(0, 2 * b) + base(-b, b) +
        `<path d="M-4.5 8 L4.5 8 L4.5 4 L0 0 L-4.5 4 Z" fill="#f9f8f4"/>` +
      `</g>` +
      ringLabel(150) + ringLabel(250) + ringLabel(350) +
    `</svg>`;
  }

  function initHeatmapTab(manifest, playerId, statsPromise, extrasPromise) {
    const byId = (x) => document.getElementById(x);
    const seasonSel = byId('hm-season'), groupSel = byId('hm-group'), groupLabel = byId('hm-group-label');
    const gamesSel = byId('hm-games'), spreadEl = byId('hm-spread'), spreadWrap = byId('hm-spread-wrap');
    const status = byId('hm-status'), progress = byId('hm-progress'), bar = byId('hm-progress-bar');
    const field = byId('hm-field'), side = byId('hm-side');
    const thisYear = new Date().getFullYear();

    field.innerHTML = hmFieldSvg() + '<canvas class="hm-canvas" id="hm-canvas"></canvas><div class="hm-tip" id="hm-tip" hidden></div>';
    const canvas = byId('hm-canvas'), tip = byId('hm-tip');
    const heatCanvas = document.createElement('canvas');

    const state = { all: [], shown: [], view: 'heat', filter: 'all', group: 'hitting', label: '', loading: false, spread: Number(spreadEl.value) || 22 };
    const yearsBy = { hitting: [], pitching: [] };
    let token = 0, rafId = 0, hoverIdx = -1;

    // ---- cache (per player / role / season) --------------------------------
    const cacheKey = (year, group) => `mlb-archive:hm:v${HM_VERSION}:${playerId}:${group}:${year}`;
    function readCache(year, group) {
      try {
        const raw = localStorage.getItem(cacheKey(year, group));
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!c || !Array.isArray(c.hits)) return null;
        if (year >= thisYear && Date.now() - c.at > 3 * 3600 * 1000) return null; // current season keeps growing
        return c;
      } catch (_) { return null; }
    }
    function writeCache(year, group, payload) {
      try { localStorage.setItem(cacheKey(year, group), JSON.stringify({ at: Date.now(), ...payload })); } catch (_) { /* full or unavailable */ }
    }

    // ---- data --------------------------------------------------------------
    async function loadSeason(year, group, my, onProgress) {
      const cached = readCache(year, group);
      if (cached) { onProgress(cached.games, cached.games); return cached; }

      const games = await hmFetchGames(playerId, year, group);
      const out = { hits: [], games: games.length, failed: 0, noData: false };
      let done = 0, pa = 0;
      const cancelled = () => my !== token;
      const doGame = async (g) => {
        try {
          const r = hmExtract(await hmFetchPlays(g.gamePk), playerId, group, g);
          pa += r.pa;
          for (const h of r.hits) out.hits.push(h);
        } catch (_) { out.failed++; }
        done++;
        if (!cancelled()) onProgress(done, games.length);
      };

      // Probe a few games first: seasons without tracked locations stop here instead of fetching ~160 empty games.
      const probe = Math.min(6, games.length);
      await hmPool(games.slice(0, probe), 6, doGame, cancelled);
      if (cancelled()) return null;
      if (games.length > probe && out.failed === 0 && pa >= 15 && out.hits.length === 0) {
        out.noData = true;
        writeCache(year, group, out);
        onProgress(games.length, games.length);
        return out;
      }
      await hmPool(games.slice(probe), 8, doGame, cancelled);
      if (cancelled()) return null;
      out.hits.sort((a, b) => String(a.dt).localeCompare(String(b.dt)));
      if (out.failed === 0) writeCache(year, group, out);
      return out;
    }

    async function load() {
      const my = ++token;
      const group = groupSel.value, sel = seasonSel.value;
      const years = sel === 'all' ? yearsBy[group].slice() : [Number(sel)];
      state.group = group;
      state.label = sel === 'all' ? 'Career' : `${sel} season`;
      state.all = [];
      state.loading = true;
      hoverIdx = -1; tip.hidden = true;
      apply();
      progress.hidden = false;
      bar.style.width = '0%';
      clearStatus(status);

      let acc = [], failed = 0, games = 0, empty = 0;
      try {
        for (let k = 0; k < years.length; k++) {
          const y = years[k];
          setStatus(status, years.length > 1 ? `Loading ${y} (${k + 1} of ${years.length})\u2026` : `Loading ${y} games\u2026`);
          const res = await loadSeason(y, group, my, (done, total) => {
            if (my !== token) return;
            const frac = (k + (total ? done / total : 1)) / years.length;
            bar.style.width = `${Math.round(frac * 100)}%`;
            setStatus(status, years.length > 1
              ? `Loading ${y} (${k + 1} of ${years.length}) \u00b7 ${done}/${total} games\u2026`
              : `Loading ${y} games\u2026 ${done}/${total}`);
          });
          if (my !== token || !res) return;
          acc = acc.concat(res.hits);
          failed += res.failed; games += res.games;
          if (res.noData || (res.games && res.hits.length === 0)) empty++;
          state.all = acc;
          apply();
        }
      } catch (err) {
        if (my !== token) return;
        state.loading = false;
        progress.hidden = true;
        setStatus(status, `Couldn't load batted balls (${err.message}). Try again in a moment.`, true);
        apply();
        return;
      }
      if (my !== token) return;
      state.loading = false;
      progress.hidden = true;
      if (!acc.length) {
        setStatus(status, games === 0
          ? `No games found for ${state.label.toLowerCase()}.`
          : `No batted-ball locations found for the ${state.label.toLowerCase()}. MLB only has hit-location data for more recent seasons.`);
      } else if (failed > 0) {
        setStatus(status, `${failed} game${failed === 1 ? '' : 's'} couldn't be loaded, so the map may be slightly incomplete. Switch season and back to retry.`, true);
      } else if (empty > 0 && years.length > 1) {
        setStatus(status, `${empty} season${empty === 1 ? '' : 's'} had no location data and ${empty === 1 ? 'is' : 'are'} not included.`);
      } else {
        clearStatus(status);
      }
      apply();
    }

    // ---- filtering + stats -------------------------------------------------
    function apply() {
      const f = state.filter, g = gamesSel.value;
      state.shown = state.all.filter((p) => {
        if (g === 'R' && p.p) return false;
        if (g === 'P' && !p.p) return false;
        if (f === 'hit') return p.r !== 'OUT';
        if (f === 'hr') return p.r === 'HR';
        if (f === 'out') return p.r === 'OUT';
        return true;
      });
      hoverIdx = -1; tip.hidden = true;
      renderSide();
      scheduleDraw();
    }

    function computeStats(pts, isPit) {
      const s = { n: pts.length, hits: 0, hr: 0, evN: 0, evSum: 0, evMax: 0, hard: 0, laN: 0, laSum: 0, dN: 0, dSum: 0, z: [0, 0, 0] };
      for (const p of pts) {
        if (p.r !== 'OUT') s.hits++;
        if (p.r === 'HR') s.hr++;
        if (p.v !== null) { s.evN++; s.evSum += p.v; if (p.v > s.evMax) s.evMax = p.v; if (p.v >= 95) s.hard++; }
        if (p.a !== null) { s.laN++; s.laSum += p.a; }
        if (p.d !== null && p.d > 0) { s.dN++; s.dSum += p.d; }
        const ang = Math.atan2(p.x, p.y) * 180 / Math.PI; // 0 = straight to center, negative = left field
        if (isPit) {
          s.z[ang < -15 ? 0 : ang > 15 ? 2 : 1]++;
        } else {
          const lefty = p.s === 'L';
          if (Math.abs(ang) <= 15) s.z[1]++;
          else if ((ang < 0) !== lefty) s.z[0]++; // pull side
          else s.z[2]++;                          // opposite field
        }
      }
      return s;
    }

    function renderSide() {
      const isPit = state.group === 'pitching';
      const s = computeStats(state.shown, isPit);
      const tile = (val, lbl) => `<div class="hm-tile"><div class="hm-tile__val">${val}</div><div class="hm-tile__lbl">${lbl}</div></div>`;
      const dash = '\u2014';
      const tiles = [
        tile(s.n.toLocaleString('en-US'), isPit ? 'Balls in play against' : 'Batted balls'),
        tile(s.n ? s.hits.toLocaleString('en-US') : dash, isPit ? 'Hits allowed' : 'Hits'),
        tile(s.n ? s.hr.toLocaleString('en-US') : dash, isPit ? 'HR allowed' : 'Home runs'),
        tile(s.evN ? `${(s.evSum / s.evN).toFixed(1)}<small> mph</small>` : dash, 'Avg exit velo'),
        tile(s.evN ? `${s.evMax.toFixed(1)}<small> mph</small>` : dash, 'Max exit velo'),
        tile(s.evN ? `${Math.round(s.hard * 100 / s.evN)}%` : dash, 'Hard hit (95+ mph)'),
        tile(s.laN ? `${(s.laSum / s.laN).toFixed(1)}\u00b0` : dash, 'Avg launch angle'),
        tile(s.dN ? `${Math.round(s.dSum / s.dN)}<small> ft</small>` : dash, 'Avg distance'),
      ].join('');

      const names = isPit ? ['Left', 'Center', 'Right'] : ['Pull', 'Center', 'Oppo'];
      const cols = ['#38bdf8', '#a3b1c6', '#fb923c'];
      const tot = s.z[0] + s.z[1] + s.z[2];
      const pct = (n) => (tot ? Math.round(n * 100 / tot) : 0);
      const spray = tot
        ? `<div class="hm-spray">${s.z.map((n, i) => `<span style="width:${(n * 100 / tot).toFixed(2)}%;background:${cols[i]}"></span>`).join('')}</div>` +
          `<div class="hm-spray__lbl">${s.z.map((n, i) => `<span><i style="background:${cols[i]}"></i>${names[i]} ${pct(n)}%</span>`).join('')}</div>`
        : `<p class="hm-note">${dash}</p>`;

      const legend = state.view === 'heat'
        ? `<div class="hm-grad"></div><div class="hm-grad__lbl"><span>Fewer</span><span>More balls</span></div>`
        : `<div class="hm-legend">${Object.keys(HM_RES_COLORS).map((k) =>
            `<span><i style="background:${HM_RES_COLORS[k]}"></i>${HM_RES_NAMES[k]}</span>`).join('')}</div>`;

      const sub = state.loading ? 'Loading\u2026'
        : state.all.length === state.shown.length ? `${state.all.length.toLocaleString('en-US')} ${isPit ? 'balls in play against' : 'batted balls'}`
        : `${state.shown.length.toLocaleString('en-US')} of ${state.all.length.toLocaleString('en-US')} shown`;

      side.innerHTML =
        `<h3 class="hm-side__title">${escapeHtml(state.label || 'Heat map')}</h3><p class="hm-side__sub">${sub}</p>` +
        `<div class="hm-tiles">${tiles}</div>` +
        `<h4 class="hm-side__h">${isPit ? 'Where hitters hit it' : 'Spray'}</h4>${spray}` +
        `<h4 class="hm-side__h">Legend</h4>${legend}` +
        `<p class="hm-note">Only balls put in play are shown (no foul balls or strikeouts). The field outline is generic: 330 ft lines, 400 ft to center. Real parks differ.</p>`;
    }

    // ---- drawing -----------------------------------------------------------
    function metrics() {
      const cssW = field.clientWidth;
      if (!cssW) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cssW * dpr), h = Math.round(cssW * HM_H / HM_W * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return { cssW, w, h, k: w / HM_W };
    }

    function drawHeat(ctx, m, pts) {
      const CELL = 4, gw = HM_W / CELL, gh = HM_H / CELL;
      const grid = new Float32Array(gw * gh);
      const sigma = state.spread / 2;
      const reach = Math.ceil(sigma * 2.6 / CELL);
      const inv = 1 / (2 * sigma * sigma);
      for (const p of pts) {
        const ci = Math.floor((p.x - HM_X0) / CELL), cj = Math.floor((HM_Y1 - p.y) / CELL);
        for (let j = Math.max(0, cj - reach); j <= Math.min(gh - 1, cj + reach); j++) {
          const dy = HM_Y1 - (j + 0.5) * CELL - p.y;
          for (let i = Math.max(0, ci - reach); i <= Math.min(gw - 1, ci + reach); i++) {
            const dx = HM_X0 + (i + 0.5) * CELL - p.x;
            grid[j * gw + i] += Math.exp(-(dx * dx + dy * dy) * inv);
          }
        }
      }
      let max = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
      const denom = Math.max(max, 5); // a handful of balls never shows as "red hot"
      heatCanvas.width = gw; heatCanvas.height = gh;
      const hctx = heatCanvas.getContext('2d');
      const img = hctx.createImageData(gw, gh);
      for (let i = 0; i < grid.length; i++) {
        const idx = Math.min(255, Math.floor(Math.pow(grid[i] / denom, 0.8) * 255)) * 4;
        img.data[i * 4] = HM_LUT[idx]; img.data[i * 4 + 1] = HM_LUT[idx + 1];
        img.data[i * 4 + 2] = HM_LUT[idx + 2]; img.data[i * 4 + 3] = HM_LUT[idx + 3];
      }
      hctx.putImageData(img, 0, 0);
      ctx.save();
      ctx.beginPath(); // keep the glow inside the foul lines
      ctx.moveTo((0 - HM_X0) * m.k, (HM_Y1 + 8) * m.k);
      ctx.lineTo((-460 - HM_X0) * m.k, (HM_Y1 - 452) * m.k);
      ctx.lineTo((460 - HM_X0) * m.k, (HM_Y1 - 452) * m.k);
      ctx.closePath(); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(heatCanvas, 0, 0, gw, gh, 0, 0, m.w, m.h);
      ctx.restore();
    }

    function drawDots(ctx, m, pts) {
      const r = Math.max(2.4 * (m.w / m.cssW), m.w / 190);
      const order = ['OUT', '1B', '2B', '3B', 'HR'];
      ctx.lineWidth = Math.max(1, r / 4);
      ctx.strokeStyle = 'rgba(10,14,20,0.85)';
      for (const res of order) {
        ctx.fillStyle = HM_RES_COLORS[res];
        ctx.globalAlpha = res === 'OUT' ? 0.8 : 0.95;
        const rr = res === 'HR' ? r * 1.35 : r;
        for (const p of pts) {
          if (p.r !== res) continue;
          ctx.beginPath();
          ctx.arc((p.x - HM_X0) * m.k, (HM_Y1 - p.y) * m.k, rr, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (hoverIdx >= 0 && state.shown[hoverIdx]) {
        const p = state.shown[hoverIdx];
        ctx.beginPath();
        ctx.arc((p.x - HM_X0) * m.k, (HM_Y1 - p.y) * m.k, r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#f9f8f4'; ctx.lineWidth = Math.max(1.5, r / 3); ctx.stroke();
      }
    }

    function draw() {
      rafId = 0;
      const m = metrics();
      if (!m) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, m.w, m.h);
      if (!state.shown.length) return;
      if (state.view === 'heat') drawHeat(ctx, m, state.shown);
      else drawDots(ctx, m, state.shown);
    }
    function scheduleDraw() {
      if (rafId) return;
      rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(draw) : (draw(), 0);
    }

    // ---- hover / click on dots ----------------------------------------------
    function nearest(ev) {
      const rect = canvas.getBoundingClientRect();
      const k = rect.width / HM_W;
      if (!k) return null;
      const fx = (ev.clientX - rect.left) / k + HM_X0, fy = HM_Y1 - (ev.clientY - rect.top) / k;
      const maxD = 10 / k; // ~10 screen px, in feet
      let best = -1, bd = maxD * maxD;
      for (let i = 0; i < state.shown.length; i++) {
        const p = state.shown[i];
        const d = (p.x - fx) * (p.x - fx) + (p.y - fy) * (p.y - fy);
        if (d <= bd) { bd = d; best = i; }
      }
      return { idx: best, rect };
    }
    canvas.addEventListener('pointermove', (ev) => {
      if (state.view !== 'dots') return;
      const hit = nearest(ev);
      if (!hit) return;
      if (hit.idx === hoverIdx) return;
      hoverIdx = hit.idx;
      canvas.style.cursor = hoverIdx >= 0 ? 'pointer' : 'default';
      if (hoverIdx < 0) tip.hidden = true;
      else {
        const p = state.shown[hoverIdx];
        const bits = [p.v !== null ? `${p.v.toFixed(1)} mph` : null, p.a !== null ? `${p.a.toFixed(0)}\u00b0` : null,
          p.d !== null && p.d > 0 ? `${Math.round(p.d)} ft` : null].filter(Boolean).join(' \u00b7 ');
        tip.innerHTML = `<strong>${escapeHtml(hmEventLabel(p.t))}</strong>${p.p ? ' <span class="gm-tag">Post</span>' : ''}<br>` +
          `${escapeHtml(fmtDate(p.dt))}${bits ? `<br>${bits}` : ''}`;
        tip.hidden = false;
        const fw = field.clientWidth;
        const left = ev.clientX - hit.rect.left + 14, top = ev.clientY - hit.rect.top + 14;
        tip.style.left = `${Math.max(4, Math.min(left, fw - tip.offsetWidth - 4))}px`;
        tip.style.top = `${Math.max(4, top)}px`;
      }
      scheduleDraw();
    });
    canvas.addEventListener('pointerleave', () => {
      if (hoverIdx !== -1) { hoverIdx = -1; tip.hidden = true; scheduleDraw(); }
    });
    canvas.addEventListener('click', (ev) => {
      if (state.view !== 'dots') return;
      const hit = nearest(ev);
      const p = hit && hit.idx >= 0 ? state.shown[hit.idx] : null;
      if (p && p.g) window.location.href = gameHref({ gamePk: p.g, date: p.dt });
    });

    // ---- controls ----------------------------------------------------------
    function bindSeg(id, onPick) {
      const el = byId(id);
      const btns = Array.from(el.querySelectorAll('.hm-seg__btn'));
      btns.forEach((b) => b.addEventListener('click', () => {
        btns.forEach((x) => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        onPick(b.dataset.v);
      }));
    }
    bindSeg('hm-view', (v) => {
      state.view = v;
      spreadWrap.hidden = v !== 'heat';
      hoverIdx = -1; tip.hidden = true;
      canvas.style.cursor = 'default';
      renderSide();
      scheduleDraw();
    });
    bindSeg('hm-filter', (v) => { state.filter = v; apply(); });
    spreadEl.addEventListener('input', () => { state.spread = Number(spreadEl.value) || 22; scheduleDraw(); });
    gamesSel.addEventListener('change', apply);
    window.addEventListener('resize', scheduleDraw);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => scheduleDraw()).observe(field);

    // ---- start-up: which seasons / roles exist for this player ---------------
    async function start() {
      setStatus(status, 'Loading seasons\u2026');
      const [rows, api] = await Promise.all([statsPromise, extrasPromise]);
      const sets = { hitting: new Set(), pitching: new Set() };
      for (const g of ['hitting', 'pitching']) for (const r of rows[g] || []) sets[g].add(r.year);

      // The archive stops before the current season, so active players get it added.
      const cur = api && api.currentTeam;
      const pos = api && api.primaryPosition ? api.primaryPosition.abbreviation : null;
      const maxYear = Math.max(0, ...sets.hitting, ...sets.pitching);
      if (api && api.active && cur && cur.id !== null && cur.id !== undefined && maxYear < thisYear) {
        if (pos === 'P') sets.pitching.add(thisYear);
        else if (pos === 'TWP') { sets.hitting.add(thisYear); sets.pitching.add(thisYear); }
        else sets.hitting.add(thisYear);
      }
      yearsBy.hitting = [...sets.hitting].sort((a, b) => b - a);
      yearsBy.pitching = [...sets.pitching].sort((a, b) => b - a);

      const groups = ['hitting', 'pitching'].filter((g) => yearsBy[g].length);
      if (!groups.length) {
        setStatus(status, 'No seasons found for this player in the archive.', true);
        seasonSel.disabled = true; gamesSel.disabled = true;
        renderSide();
        return;
      }
      const def = pos === 'P' && groups.includes('pitching') ? 'pitching' : groups.includes('hitting') ? 'hitting' : groups[0];
      groupSel.innerHTML = groups.map((g) => `<option value="${g}">${g === 'hitting' ? 'Batting' : 'Pitching'}</option>`).join('');
      groupSel.value = def;
      groupSel.hidden = groups.length < 2;
      groupLabel.hidden = groups.length < 2;

      function fillSeasons() {
        const ys = yearsBy[groupSel.value];
        seasonSel.innerHTML = ys.map((y) => `<option value="${y}">${y}</option>`).join('') +
          (ys.length > 1 ? '<option value="all">All seasons</option>' : '');
        seasonSel.value = String(ys[0]);
      }
      fillSeasons();
      groupSel.addEventListener('change', () => { fillSeasons(); load(); });
      seasonSel.addEventListener('change', load);
      load();
    }

    start().catch((err) => setStatus(status, `Couldn't start the heat map (${err.message}).`, true));
    renderSide();

    return { redraw: scheduleDraw };
  }

  main();

}

// ---- players.js ----
function runPlayersPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  async function main() {
    setStatus(statusEl, 'Loading players…');

    let manifest, entries;
    try {
      manifest = await loadManifest();
      entries = await fetchCoreIndex(manifest, 'players');
    } catch (err) {
      setStatus(statusEl, `Couldn't load players right now (${err.message}). Try refreshing.`, true);
      return;
    }

    if (entries.length === 0) {
      setStatus(statusEl, 'No players found.', true);
      return;
    }

    const grid = document.getElementById('player-grid');
    const search = document.getElementById('player-search');
    search.placeholder = `Search ${entries.length.toLocaleString()} players…`;

    initEntityBrowser({
      entries,
      containerEl: grid,
      searchEl: search,
      hrefFor: (e) => `player.html?id=${e.id}`,
      maxRender: 100, // over 10,000 players total — always search-narrowed, never rendered whole
      emptyMessage: 'No players match your search.',
    });

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  main();

}

// ---- manager.js ----
function runManagerPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  async function main() {
    const id = qs('id');
    if (!id) {
      setStatus(statusEl, 'No manager specified. Go back to Managers and pick one.', true);
      return;
    }

    let manifest, manager;
    try {
      manifest = await loadManifest();
      manager = await fetchCoreRecord(manifest, 'managers', id);
    } catch (err) {
      setStatus(statusEl, `Couldn't load this manager right now (${err.message}). Try refreshing.`, true);
      return;
    }

    if (!manager) {
      setStatus(statusEl, `No manager found with id "${id}".`, true);
      return;
    }

    renderBio(manager);
    clearStatus(statusEl);
    contentEl.hidden = false;

    loadCareerRecord(manifest, id, manager);
  }

  function renderBio(m) {
    document.title = `${m.fullName} — MLB Archive`;
    document.getElementById('crumb-name').textContent = m.fullName;
    document.getElementById('manager-name').textContent = m.fullName;

    const first = m.firstSeasonManaged, last = m.lastSeasonManaged;
    document.getElementById('manager-meta-line').textContent =
      (first || last) ? `Managed ${fmtOrDash(first)}\u2013${fmtOrDash(last)}` : 'Manager';

    const badges = document.getElementById('manager-badges');
    const chips = [];
    if (m.status === 'active') chips.push('<span class="badge badge--active">Active</span>');
    else if (m.status === 'deceased') chips.push('<span class="badge badge--deceased">Deceased</span>');
    else if (m.status) chips.push(`<span class="badge">${m.status[0].toUpperCase()}${m.status.slice(1)}</span>`);
    // hallOfFame was never confirmed to exist on manager records — only shown if actually present
    if (m.hallOfFame && m.hallOfFame.inducted) {
      chips.push(`<span class="badge badge--hof">Hall of Fame ${m.hallOfFame.year || ''}</span>`);
    }
    badges.innerHTML = chips.join(' ');

    const bio = document.getElementById('bio-table');
    const rows = [
      ['First season', fmtOrDash(first)],
      ['Last season', fmtOrDash(last)],
    ];
    bio.innerHTML = rows.map(([label, val]) =>
      `<tr><td class="trophy-label">${label}</td><td class="trophy-years">${val}</td></tr>`
    ).join('');

    // Optional - added after the original page contract. Not every build of
    // manager.html will have this element yet, and that's fine: only touch it
    // if it exists, so this never breaks a page that predates this addition.
    const photoEl = document.getElementById('manager-photo');
    if (photoEl) {
      setImgWithFallback(photoEl, `assets/managers/${m.id}.webp`, 'assets/managers/default.webp');
    }
  }

  async function loadCareerRecord(manifest, managerId, manager) {
    const statusEl2 = document.getElementById('stats-status');
    const block = document.getElementById('record-block');
    const body = document.getElementById('record-body');

    const thisYear = new Date().getFullYear();
    const start = manager.firstSeasonManaged ? parseInt(manager.firstSeasonManaged, 10) : 1980;
    const end = manager.lastSeasonManaged ? parseInt(manager.lastSeasonManaged, 10) : thisYear;
    const from = Math.max(1980, Math.min(start, end));
    const to = Math.min(thisYear, Math.max(start, end));

    const years = [];
    for (let y = from; y <= to; y++) years.push(y);

    setStatus(statusEl2, `Loading ${years.length} season${years.length === 1 ? '' : 's'}…`);

    const rows = [];
    let cursor = 0;
    const CONCURRENCY = 6;

    async function worker() {
      while (cursor < years.length) {
        const y = years[cursor++];
        try {
          const stats = await fetchSeasonFile(manifest, y, 'manager-stats.json');
          if (!stats) continue;
          const matches = stats.filter(r => String(r.managerId) === String(managerId));
          for (const row of matches) rows.push({ year: y, row });
        } catch (_) {
          // one missing/broken season shouldn't stop the rest of the career
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    if (rows.length === 0) {
      setStatus(statusEl2, 'No season-level record found for this manager in 1980–2025.', true);
      return;
    }
    clearStatus(statusEl2);

    rows.sort((a, b) => a.year - b.year || (a.row.teamId ?? 0) - (b.row.teamId ?? 0));

    const resolveTeamName = createTeamNameResolver(manifest);
    let totalW = 0, totalL = 0, anyRecordField = false;

    const lines = [];
    for (const { year, row } of rows) {
      const name = await resolveTeamName(row.teamId);
      // wins/losses/pct field names on manager-stats.json weren't independently
      // confirmed when this was built — check common conventions, dash otherwise.
      const wins = row.wins ?? row.w ?? null;
      const losses = row.losses ?? row.l ?? null;
      const pct = row.winningPercentage ?? row.pct ?? null;
      if (wins !== null) { totalW += Number(wins) || 0; anyRecordField = true; }
      if (losses !== null) { totalL += Number(losses) || 0; anyRecordField = true; }

      lines.push(`<tr>
        <td class="left">${year}</td>
        <td class="left">${teamLinkHtml(row.teamId, name)}</td>
        <td class="num">${fmtOrDash(wins)}</td>
        <td class="num">${fmtOrDash(losses)}</td>
        <td class="num">${pct !== null ? String(pct) : '—'}</td>
      </tr>`);
    }
    body.innerHTML = lines.join('');

    const foot = document.getElementById('record-foot');
    if (anyRecordField) {
      const totalPct = (totalW + totalL) > 0 ? (totalW / (totalW + totalL)) : null;
      foot.innerHTML = `<tr>
        <td class="left" colspan="2">Career</td>
        <td class="num">${totalW}</td>
        <td class="num">${totalL}</td>
        <td class="num">${totalPct !== null ? totalPct.toFixed(3).replace(/^0\./, '.') : '—'}</td>
      </tr>`;
    }

    block.hidden = false;
  }

  main();

}

// ---- managers.js ----
function runManagersPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  async function main() {
    setStatus(statusEl, 'Loading managers…');

    let manifest, entries;
    try {
      manifest = await loadManifest();
      entries = await fetchCoreIndex(manifest, 'managers');
    } catch (err) {
      setStatus(statusEl, `Couldn't load managers right now (${err.message}). Try refreshing.`, true);
      return;
    }

    if (entries.length === 0) {
      setStatus(statusEl, 'No managers found.', true);
      return;
    }

    initEntityBrowser({
      entries,
      containerEl: document.getElementById('manager-grid'),
      searchEl: document.getElementById('manager-search'),
      hrefFor: (e) => `manager.html?id=${e.id}`,
      maxRender: 300, // only 264 managers total — effectively unlimited
      emptyMessage: 'No managers match your search.',
    });

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  main();

}

// ---- ballpark.js ----
function runBallparkPage() {

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
        <td class="left">${teamLinkHtml(g.awayTeamId, awayName)}</td>
        <td class="left">${teamLinkHtml(g.homeTeamId, homeName)}</td>
        <td class="num"><a href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a></td>
      </tr>`);
    }
    body.innerHTML = rows.join('');

    clearStatus(statusEl2);
    wrap.hidden = false;
  }

  main();

}

// ---- ballparks.js ----
function runBallparksPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  async function main() {
    setStatus(statusEl, 'Loading ballparks…');

    let manifest, entries;
    try {
      manifest = await loadManifest();
      entries = await fetchCoreIndex(manifest, 'ballparks');
    } catch (err) {
      setStatus(statusEl, `Couldn't load ballparks right now (${err.message}). Try refreshing.`, true);
      return;
    }

    if (entries.length === 0) {
      setStatus(statusEl, 'No ballparks found.', true);
      return;
    }

    // Only 76 ballparks total — no search box in this page's contract, so
    // every entry is rendered (maxRender set well above the real count).
    initEntityBrowser({
      entries,
      containerEl: document.getElementById('ballpark-grid'),
      searchEl: null,
      hrefFor: (e) => `ballpark.html?id=${e.id}`,
      maxRender: 200,
      emptyMessage: 'No ballparks found.',
    });

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  main();

}

// ---- standings.js ----
function runStandingsPage() {

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
        data = normalizeStandings(await fetchSeasonFile(manifest, year, 'standings-splits.json'));
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
      const result = await fetchLatestAvailable(manifest, 'standings-splits.json', { transform: normalizeStandings, validate: isStandingsShape }).catch(() => null);
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
    renderStandings(data, year);

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

  // Each division's own sort ("103:East", "104:West", ...) - see standingsTableHtml -
  // so clicking a column header in one division only ever re-sorts that division.
  const sortByGroup = new Map();
  let shown = null; // { data, year } currently on screen, so a header click can re-render it

  function renderStandings(data, year) {
    const wrap = document.getElementById('standings-body-wrap');
    shown = { data, year };
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

    const spots = computePlayoffSpots(data.teams, year);

    let html = '';
    for (const [lg, teams] of byLeague) {
      teams.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
      html += `<h3 class="league-heading" style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
        color:var(--text-secondary);margin:18px 0 8px;">${leagueLogoCardHtml(lg)}<span>${LEAGUE_NAMES[lg] || `League ${lg}`}</span></h3>`;
      html += standingsTableHtml(teams, year, { spots, leagueId: lg, sortByGroup });
    }

    wrap.innerHTML = html;
  }

  // Click a column header to sort by it; click again to reverse. Only the
  // division/table that button belongs to (its data-group) is affected.
  document.getElementById('standings-body-wrap').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn || !shown) return;
    const group = btn.dataset.group;
    const current = sortByGroup.get(group) || STANDINGS_DEFAULT_SORT;
    sortByGroup.set(group, nextStandingsSort(current, btn.dataset.sort));
    renderStandings(shown.data, shown.year);
  });

  main();

}

// ---- league.js (AL.html / NL.html) ----
// A flat, whole-league ranking - all 15 teams of one league in a single table,
// no East/Central/West split. Which league (103 = American, 104 = National) is
// read from <body data-league>, so this one function serves both pages.
function runLeaguePage() {

  const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };
  const leagueId = Number(document.body.dataset.league);

  async function main() {
    const manifest = await loadManifest().catch((err) => {
      setStatus(document.getElementById('league-status'), `Couldn't load the archive right now (${err.message}).`, true);
      return null;
    });
    if (!manifest) return;
    loadStandings(manifest);
  }

  async function loadStandings(manifest) {
    const statusEl = document.getElementById('league-status');
    const wrap = document.getElementById('league-wrap');
    const heading = document.getElementById('league-heading');
    setStatus(statusEl, 'Loading standings…');

    const result = await fetchLatestAvailable(manifest, 'standings-splits.json', { transform: normalizeStandings, validate: isStandingsShape }).catch(() => null);
    if (!result || !result.data || !Array.isArray(result.data.teams)) {
      setStatus(statusEl, "Couldn't find standings for any season.", true);
      return;
    }

    const leagueName = LEAGUE_NAMES[leagueId] || `League ${leagueId}`;
    const teams = result.data.teams.filter(t => String(t.lg) === String(leagueId));
    document.title = `${leagueName} — MLB Archive`;
    heading.textContent = `${leagueName} — ${result.year}`;

    const names = new Map();
    for (const t of result.data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);

    // Playoff spots are worked out from the FULL season list (both leagues) -
    // computePlayoffSpots groups by league internally, so this league's teams
    // still land in the right division/wild-card slots either way.
    const spots = computePlayoffSpots(result.data.teams, result.year);
    let sortState = STANDINGS_DEFAULT_SORT; // one flat table here, so one sort is correct

    const verticalMql = window.matchMedia(VERTICAL_SCREEN_QUERY);
    let currentLast5 = { status: 'pending' };

    function render(last5) {
      currentLast5 = last5;
      let html = '';
      if (last5.status === 'unavailable') {
        html += `<p class="l5-note">Last 5 results couldn't be loaded for ${result.year}.</p>`;
      }
      html += standingsTableHtml(teams, result.year, {
        extended: true, last5, vertical: verticalMql.matches, spots, sort: sortState, flat: true, leagueId,
      });
      wrap.innerHTML = html;
    }

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn || !wrap.contains(btn)) return;
      sortState = nextStandingsSort(sortState, btn.dataset.sort);
      render(currentLast5);
    });

    const onScreenShapeChange = () => render(currentLast5);
    if (verticalMql.addEventListener) verticalMql.addEventListener('change', onScreenShapeChange);
    else if (verticalMql.addListener) verticalMql.addListener(onScreenShapeChange);

    render({ status: 'pending' });
    clearStatus(statusEl);
    wrap.hidden = false;

    const seasonIsCurrent = Number(result.year) >= new Date().getFullYear();
    const [schedule, liveInitial] = await Promise.all([
      fetchSeasonSchedule(manifest, result.year),
      seasonIsCurrent ? fetchLiveGames().catch(() => []) : Promise.resolve([]),
    ]);

    if (!(Array.isArray(schedule) && schedule.length > 0)) {
      render({ status: 'unavailable' });
      return;
    }

    let finishedByTeam = buildLastFive(schedule);
    let liveList = liveInitial;
    render({ status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) });

    if (!seasonIsCurrent) return;
    let busy = false;
    let finishedRetries = 0;
    setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await fetchLiveGames();
        const ended = liveList.some(p => !next.some(n => String(n.gamePk) === String(p.gamePk)));
        const changed = liveListSig(next) !== liveListSig(liveList);
        if (ended) finishedRetries = 3;

        let refetched = false;
        if (finishedRetries > 0) {
          finishedRetries--;
          const fresh = await fetchSeasonSchedule(manifest, result.year);
          if (Array.isArray(fresh) && fresh.length > 0) { finishedByTeam = buildLastFive(fresh); refetched = true; }
        }

        liveList = next;
        if (changed || refetched) {
          render({ status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) });
        }
      } catch (_) { /* a failed refresh keeps what is already on screen */ }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }

  main();

}

// ---- scores.js ----
function runScoresPage() {

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
        <td class="left">${teamLinkHtml(g.awayTeamId, awayName)}</td>
        <td class="left">${teamLinkHtml(g.homeTeamId, homeName)}</td>
        <td class="num"><a href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a></td>
        <td class="left">${g.status}</td>
      </tr>`);
    }
    body.innerHTML = rows.join('');
  }

  main();

}

// ---- roster.js ----
function runRosterPage() {

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

}

// ---- postseason.js ----
function runPostseasonPage() {

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
        <td class="left">${teamLinkHtml(g.awayTeamId, awayName)}</td>
        <td class="left">${teamLinkHtml(g.homeTeamId, homeName)}</td>
        <td class="num"><a href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a></td>
      </tr>`);
    }
    body.innerHTML = rows.join('');
  }

  main();

}

// ---- awards.js ----
function runAwardsPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const playerNameCache = new Map();

  async function resolvePlayerName(manifest, playerId) {
    if (playerId === null || playerId === undefined) return null;
    if (playerNameCache.has(playerId)) return playerNameCache.get(playerId);
    let name;
    try {
      const p = await fetchCoreRecord(manifest, 'players', playerId);
      name = p ? p.fullName : `Player ${playerId}`;
    } catch (_) {
      name = `Player ${playerId}`;
    }
    playerNameCache.set(playerId, name);
    return name;
  }

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
      setStatus(statusEl, `Loading ${year} awards…`);
      try {
        data = await fetchSeasonFile(manifest, year, 'awards.json');
      } catch (err) {
        setStatus(statusEl, `Couldn't load the ${year} awards (${err.message}).`, true);
        return;
      }
    } else {
      const result = await fetchLatestAvailable(manifest, 'awards.json').catch(() => null);
      if (!result) {
        setStatus(statusEl, "Couldn't find awards for any season.", true);
        return;
      }
      year = result.year;
      data = result.data;
    }

    document.title = `Awards — ${year} — MLB Archive`;
    document.getElementById('awards-title').textContent = `Awards — ${year}`;
    renderYearPicker(year);

    if (!data || !Array.isArray(data) || data.length === 0) {
      setStatus(statusEl, `No awards found for ${year}.`, true);
      contentEl.hidden = false;
      document.getElementById('awards-table').innerHTML = '';
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
        : `<a class="accent-link" href="awards.html?year=${y}">${y}</a>`
    ).join(' · ');
  }

  async function renderTable(manifest, awards) {
    const table = document.getElementById('awards-table');
    const resolveTeamName = createTeamNameResolver(manifest);

    const rows = [];
    for (const a of awards) {
      const parts = [];
      if (a.playerId !== null && a.playerId !== undefined) {
        const name = await resolvePlayerName(manifest, a.playerId);
        parts.push(`<a class="team-link" href="player.html?id=${a.playerId}">${name}</a>`);
      }
      if (a.teamId !== null && a.teamId !== undefined) {
        const teamName = await resolveTeamName(a.teamId);
        parts.push(`${teamLinkHtml(a.teamId, teamName)}`);
      }
      const value = parts.length ? parts.join(' — ') : '—';
      rows.push(`<tr><td class="trophy-label">${a.award || '—'}</td><td class="trophy-years">${value}</td></tr>`);
    }
    table.innerHTML = rows.join('');
  }

  main();

}

// ---- draft.js ----
function runDraftPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');

  /**
   * draft/{year}.json lives at data/draft/{year}.json in each season repo -
   * a sibling of data/seasons/, not inside it - so it needs its own fetch
   * helper rather than reusing fetchSeasonFile (which builds paths under
   * data/seasons/{year}/...).
   */
  async function fetchDraftFile(manifest, year) {
    const repoName = manifest.seasons[String(year)];
    const repoUrl = repoName
      ? manifest.season_repos[repoName]
      : (year >= manifest.current.from_year ? manifest.current.url : null);
    if (!repoUrl) return null;

    const res = await fetch(`${repoUrl}/data/draft/${year}.json`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} fetching draft/${year}.json`);
    return res.json();
  }

  async function findLatestDraft(manifest) {
    let year = new Date().getFullYear();
    while (year >= 1980) {
      try {
        const data = await fetchDraftFile(manifest, year);
        if (data) return { year, data };
      } catch (_) { /* try the previous year */ }
      year--;
    }
    return null;
  }

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
      setStatus(statusEl, `Loading ${year} draft…`);
      try {
        data = await fetchDraftFile(manifest, year);
      } catch (err) {
        setStatus(statusEl, `Couldn't load the ${year} draft (${err.message}).`, true);
        return;
      }
    } else {
      const result = await findLatestDraft(manifest);
      if (!result) {
        setStatus(statusEl, "Couldn't find draft results for any season.", true);
        return;
      }
      year = result.year;
      data = result.data;
    }

    document.title = `Draft — ${year} — MLB Archive`;
    document.getElementById('draft-title').textContent = `Draft — ${year}`;
    renderYearPicker(year);

    if (!data || !Array.isArray(data.picks) || data.picks.length === 0) {
      setStatus(statusEl, `No draft results found for ${year}.`, true);
      contentEl.hidden = false;
      document.getElementById('draft-body').innerHTML = '';
      return;
    }

    await renderTable(manifest, data.picks);

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
        : `<a class="accent-link" href="draft.html?year=${y}">${y}</a>`
    ).join(' · ');
  }

  async function renderTable(manifest, picks) {
    const body = document.getElementById('draft-body');
    const resolveTeamName = createTeamNameResolver(manifest);

    // pick row shape (our own confirmed schema): [round, pickNumber, teamId,
    // playerId, fullName, position, school, birthDate, height, weight,
    // batSide, pitchHand, hometown]
    const rows = [];
    for (const pick of picks) {
      const [round, pickNumber, teamId, playerId, fullName, position, school] = pick;
      const teamName = (teamId !== null && teamId !== undefined) ? await resolveTeamName(teamId) : '—';
      const playerCell = playerId
        ? `<a class="team-link" href="player.html?id=${playerId}">${fullName || `Player ${playerId}`}</a>`
        : (fullName || '—');
      rows.push(`<tr>
        <td class="num">${round ?? '—'}</td>
        <td class="num">${pickNumber ?? '—'}</td>
        <td class="left">${playerCell}</td>
        <td class="left">${position || '—'}</td>
        <td class="left">${school || '—'}</td>
        <td class="left">${teamLinkHtml(teamId, teamName)}</td>
      </tr>`);
    }
    body.innerHTML = rows.join('');
  }

  main();

}

// ---- transactions.js ----
function runTransactionsPage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  async function findLatestTransactions(manifest) {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    let checked = 0;

    while (checked < 36) {
      const mm = String(m).padStart(2, '0');
      try {
        const data = await fetchSeasonFile(manifest, y, `transactions/${mm}.json`);
        if (data && Array.isArray(data.tx) && data.tx.length > 0) {
          return { year: y, month: mm, data };
        }
      } catch (_) { /* try the previous month */ }

      checked++;
      m--;
      if (m === 0) { m = 12; y--; }
      if (y < 1980) break;
    }
    return null;
  }

  async function main() {
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      setStatus(statusEl, `Couldn't load the archive right now (${err.message}).`, true);
      return;
    }

    const requestedYear = qs('year');
    const requestedMonth = qs('month');
    let year, month, data;

    if (requestedYear && requestedMonth) {
      year = parseInt(requestedYear, 10);
      month = requestedMonth.padStart(2, '0');
      setStatus(statusEl, `Loading ${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}…`);
      try {
        data = await fetchSeasonFile(manifest, year, `transactions/${month}.json`);
      } catch (err) {
        setStatus(statusEl, `Couldn't load transactions for ${month}/${year} (${err.message}).`, true);
        return;
      }
    } else {
      setStatus(statusEl, 'Finding the most recent transactions…');
      const found = await findLatestTransactions(manifest);
      if (!found) {
        setStatus(statusEl, "Couldn't find transactions for any recent month.", true);
        return;
      }
      year = found.year;
      month = found.month;
      data = found.data;
    }

    const monthLabel = MONTH_NAMES[parseInt(month, 10) - 1] || month;
    document.title = `Transactions — ${monthLabel} ${year} — MLB Archive`;
    document.getElementById('tx-title').textContent = `Transactions — ${monthLabel} ${year}`;

    renderYearPicker(year, month);
    renderMonthPicker(year, month);
    renderList(data);

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  function renderYearPicker(activeYear, currentMonth) {
    const picker = document.getElementById('year-picker');
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = 1980; y <= thisYear; y++) years.push(y);

    picker.innerHTML = years.map(y =>
      y === activeYear
        ? `<strong>${y}</strong>`
        : `<a class="accent-link" href="transactions.html?year=${y}&month=${currentMonth}">${y}</a>`
    ).join(' · ');
  }

  function renderMonthPicker(activeYear, activeMonth) {
    const picker = document.getElementById('month-picker');
    picker.innerHTML = MONTH_NAMES.map((name, i) => {
      const mm = String(i + 1).padStart(2, '0');
      return mm === activeMonth
        ? `<strong>${name}</strong>`
        : `<a class="accent-link" href="transactions.html?year=${activeYear}&month=${mm}">${name}</a>`;
    }).join(' · ');
  }

  function renderList(data) {
    const list = document.getElementById('tx-list');
    const rows = (data && Array.isArray(data.tx)) ? data.tx : [];

    if (rows.length === 0) {
      list.innerHTML = '<li>No transactions found for this month.</li>';
      return;
    }

    const sorted = rows.slice().sort((a, b) => (a[0] < b[0] ? 1 : -1));
    // tx row shape: [date, typeCode, playerId, playerName, fromTeamId, toTeamId, description]
    list.innerHTML = sorted.map(row => {
      const [date, , , playerName, , , description] = row;
      const detail = description || playerName || 'Transaction';
      return `<li><span class="yr">${fmtDate(date)}</span>${detail}</li>`;
    }).join('');
  }

  main();

}

// ---- leaders.js ----
function runLeadersPage() {

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

}

// ---- game.js ----
function runGamePage() {

  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const byId = (id) => document.getElementById(id);
  const esc = escapeHtml;

  const GAME_POLL_MS = 8000;       // live games refresh this often (pitch by pitch feel)
  const WP_EVERY = 4;              // win probability is a heavier request: re-read it every 4th refresh
  const TAB_KEYS = ['summary', 'box', 'stats', 'plays', 'winprob'];

  // UI state that has to survive the live repaints (tab, team toggle, play filters, opened pitch lists).
  const ui = { tab: 'summary', boxSide: 'a', playFilter: 'all', playInning: 'all', playOrder: null, openPlays: new Set() };
  let current = null;   // the game object on screen
  let view = null;      // its derived view (see buildView)
  let tabsReady = false;

  // --------------------------------------------------------------------------
  // Small helpers
  // --------------------------------------------------------------------------
  const numOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const n0 = (v) => { const n = numOrNull(v); return n === null ? 0 : n; };
  const cellOrBlank = (v) => (v === null || v === undefined ? '' : v);
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], r = n % 100;
    return n + (s[(r - 20) % 10] || s[r] || s[0]);
  };
  const prettyKey = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const halfLabel = (t, inning) => {
    const n = numOrNull(inning);
    return `${t === 0 ? 'Top' : 'Bottom'} ${n === null ? '' : ordinal(n)}`.trim();
  };
  const section = (title, body) =>
    `<section class="block"><h2 class="block__heading">${title}</h2>${body}</section>`;
  const emptyMsg = (text) => `<p class="state-msg" style="padding:20px 0;">${esc(text)}</p>`;
  const playerLink = (id, name) => (id === null || id === undefined || id === ''
    ? esc(name)
    : `<a class="team-link" href="player.html?id=${encodeURIComponent(id)}">${esc(name)}</a>`);

  function ipToOuts(ip) {
    if (ip === null || ip === undefined || ip === '') return 0;
    const [whole, frac = '0'] = String(ip).split('.');
    return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac, 10) || 0);
  }
  function outsToIp(outs) { return `${Math.floor(outs / 3)}.${outs % 3}`; }

  /** Runs a render step; one broken section never blanks the whole page. */
  function safe(label, fn) {
    try { fn(); } catch (err) {
      console.error(`Game page: ${label} failed`, err);
      const el = byId(label);
      if (el) el.innerHTML = emptyMsg("Couldn't display this section.");
    }
  }

  // --------------------------------------------------------------------------
  // Loading
  // --------------------------------------------------------------------------
  async function main() {
    const gamePk = qs('id');
    let year = qs('year');

    if (!gamePk) {
      setStatus(statusEl, 'A game id is required, e.g. game.html?id=413649&year=2015', true);
      return;
    }

    let manifest, game;
    let liveFeed = null;
    try {
      manifest = await loadManifest();

      // A current-season game may be in progress (or just finished and not archived yet):
      // MLB's live feed knows about it. Older seasons skip this and read the archive only.
      if (!year || Number(year) >= new Date().getFullYear()) {
        liveFeed = await fetchLiveFeed(gamePk).catch(() => null);
        if (liveFeed && feedState(liveFeed) === 'live') {
          await showLive(gamePk, liveFeed);
          return;
        }
      }

      if (year) {
        game = await fetchSeasonFile(manifest, year, `games/${gamePk}.json`);
      } else {
        // No year in the link: search seasons (newest first) until the game turns up.
        setStatus(statusEl, 'Looking up this game…');
        const thisYear = new Date().getFullYear();
        const years = [];
        for (let y = thisYear; y >= 1980; y--) years.push(y);
        let cursor = 0;
        const CONCURRENCY = 6;
        async function worker() {
          while (cursor < years.length && !game) {
            const y = years[cursor++];
            try {
              const g = await fetchSeasonFile(manifest, y, `games/${gamePk}.json`);
              if (g && !game) { game = g; year = y; }
            } catch (_) { /* skip seasons that fail */ }
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }
    } catch (err) {
      setStatus(statusEl, `Couldn't load this game right now (${err.message}). Try refreshing.`, true);
      return;
    }

    // Not in the archive (yet): fall back to MLB's feed for a finished game, or say it hasn't started.
    if (!game && liveFeed) {
      const st = feedState(liveFeed);
      if (st === 'final') {
        game = feedToGame(liveFeed, await fetchWinProb(gamePk));
      } else if (st === 'preview') {
        setStatus(statusEl, "This game hasn't started yet. Check back once it's underway.");
        return;
      } else if (st === 'other') {
        setStatus(statusEl, 'This game was postponed, suspended or cancelled.');
        return;
      }
    }

    if (!game) {
      setStatus(statusEl, `No game found with id "${gamePk}"${year ? ` in ${year}` : ''}.`, true);
      return;
    }

    paintGame(game);

    clearStatus(statusEl);
    contentEl.hidden = false;
  }

  // --------------------------------------------------------------------------
  // Live games
  // The archive only has finished games. A game from the current season is
  // first looked up in MLB's live feed: if it is in progress the page is built
  // from that feed (same sections as an archived game, plus LIVE markers) and
  // refreshed every GAME_POLL_MS until the game ends. A game that just finished
  // and isn't in the archive yet is built from the same feed, without the badge.
  // --------------------------------------------------------------------------
  async function fetchLiveFeed(gamePk) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchWinProb(gamePk) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${encodeURIComponent(gamePk)}/winProbability`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }

  /** 'live' | 'final' | 'preview' | 'other' (postponed / suspended / cancelled) */
  function feedState(feed) {
    const st = (feed && feed.gameData && feed.gameData.status) || {};
    const d = st.detailedState || '';
    if (/^(Final|Game Over|Completed Early)/i.test(d)) return 'final';
    if (/Postponed|Cancelled|Suspended/i.test(d)) return 'other';
    if (st.abstractGameState === 'Live') return 'live';
    if (st.abstractGameState === 'Final') return 'final';
    return 'preview';
  }

  /** Turns MLB's live feed into the same game object the archive files use, so every render function is shared. */
  function feedToGame(feed, wpRaw) {
    const gd = feed.gameData || {};
    const ld = feed.liveData || {};
    const ls = ld.linescore || {};
    const bx = ld.boxscore || {};
    const teams = gd.teams || {};
    const state = feedState(feed);
    const num = (v) => (v === undefined || v === null || v === '') ? null : v;

    const names = {};
    for (const key of Object.keys(gd.players || {})) {
      const p = gd.players[key];
      if (p && p.id !== undefined && p.id !== null) names[p.id] = p.fullName;
    }

    function teamBox(side) {
      const t = bx.teams && bx.teams[side];
      const meta = teams[side] || (t && t.team);
      if (!t || !meta) return null;
      const pl = t.players || {};
      const get = (id) => pl['ID' + id];

      const bat = (t.batters || []).map(get)
        .filter(p => p && p.person && p.battingOrder !== undefined && p.battingOrder !== null)
        .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
        .map(p => {
          const b = (p.stats && p.stats.batting) || {};
          return { id: p.person.id, n: p.person.fullName, pos: p.position && p.position.abbreviation,
            ab: b.atBats, r: b.runs, h: b.hits, d: b.doubles, t: b.triples, hr: b.homeRuns,
            rbi: b.rbi, bb: b.baseOnBalls, k: b.strikeOuts, sb: b.stolenBases };
        });

      const tb = (t.teamStats && t.teamStats.batting) || null;
      const tot = tb ? { ab: tb.atBats, r: tb.runs, h: tb.hits, d: tb.doubles, t: tb.triples, hr: tb.homeRuns,
        rbi: tb.rbi, bb: tb.baseOnBalls, k: tb.strikeOuts, sb: tb.stolenBases } : null;

      const pit = (t.pitchers || []).map(get)
        .filter(p => p && p.person)
        .map(p => {
          const s = (p.stats && p.stats.pitching) || {};
          return { id: p.person.id, n: p.person.fullName, ip: s.inningsPitched, h: s.hits, r: s.runs,
            er: s.earnedRuns, bb: s.baseOnBalls, k: s.strikeOuts, hr: s.homeRuns, note: s.note };
        });

      // team-level notes (2B / HR / SB / errors ...), same { title: [[label, text], ...] } shape the archive uses
      const notes = {};
      for (const sec of (t.info || [])) {
        if (!sec || !sec.title || !Array.isArray(sec.fieldList)) continue;
        const rows = sec.fieldList.filter(f => f && f.label)
          .map(f => [f.label, String(f.value === undefined || f.value === null ? '' : f.value).replace(/\.\s*$/, '')]);
        if (rows.length) notes[sec.title] = rows;
      }

      return { id: meta.id, name: meta.name, bat, tot, pit, notes };
    }

    const lsTot = (side) => {
      const t = (ls.teams && ls.teams[side]) || {};
      return [num(t.runs) ?? 0, num(t.hits) ?? 0, num(t.errors) ?? 0, num(t.leftOnBase) ?? 0];
    };
    const inn = (ls.innings || []).map(i =>
      [i.away ? num(i.away.runs) : null, null, null, null, i.home ? num(i.home.runs) : null]);

    // oldest -> newest (the Plays tab decides which way to show them)
    const plays = ((ld.plays && ld.plays.allPlays) || [])
      .filter(p => p && p.about && p.result)
      .map(p => {
        const evs = p.playEvents || [];
        const pt = evs.filter(e => e && e.isPitch).map(e => [
          (e.details && e.details.call && e.details.call.description) || '',
          (e.details && e.details.type && e.details.type.description) || '',
          e.pitchData && e.pitchData.startSpeed !== undefined ? e.pitchData.startSpeed : null,
        ]);
        const ac = evs.filter(e => e && e.type === 'action' && e.details && e.details.description)
          .map(e => e.details.description);
        const hitEv = evs.find(e => e && e.hitData);
        const hd = hitEv ? [num(hitEv.hitData.launchSpeed), num(hitEv.hitData.launchAngle),
          num(hitEv.hitData.totalDistance), num(hitEv.hitData.trajectory)] : null;
        const top = p.about.isTopInning !== undefined ? !!p.about.isTopInning : p.about.halfInning === 'top';
        return {
          t: top ? 0 : 1,
          in: p.about.inning,
          bt: p.matchup && p.matchup.batter ? p.matchup.batter.id : null,
          p: p.matchup && p.matchup.pitcher ? p.matchup.pitcher.id : null,
          d: p.result.description || (p.about.isComplete === false ? 'At bat in progress' : (p.result.event || '')),
          ev: p.result.event,
          sc: !!p.about.isScoringPlay,
          ok: p.about.isComplete !== false,
          pt, hd, ac,
        };
      });

    const status = gd.status || {};
    const dt = gd.datetime || {};
    return {
      date: dt.dateTime || dt.officialDate || null,
      live: state === 'live' ? { label: liveStateLabel(status.detailedState, ls), sit: liveSituation(feed) } : null,
      box: {
        a: teamBox('away'),
        h: teamBox('home'),
        info: (bx.info || []).filter(i => i && i.label && i.value).map(i => [i.label, i.value]),
        off: (bx.officials || []).filter(o => o && o.official).map(o => [o.officialType, o.official.fullName]),
      },
      ls: { a: lsTot('away'), h: lsTot('home'), inn },
      wp: (Array.isArray(wpRaw) ? wpRaw : [])
        .map((e, i) => [i, e ? e.homeTeamWinProbability : null])
        .filter(p => p[1] !== null && p[1] !== undefined),
      plays,
      names,
    };
  }

  /** Cheap fingerprint of what is on screen, so a poll only repaints when something changed. */
  function sigOf(g) {
    const plays = Array.isArray(g.plays) ? g.plays : [];
    const last = plays.length ? plays[plays.length - 1] : null;
    return [
      g.live ? g.live.label : 'final',
      g.ls ? JSON.stringify([g.ls.a, g.ls.h]) : '',
      plays.length,
      last ? `${last.d || ''}|${Array.isArray(last.pt) ? last.pt.length : 0}` : '',
      (g.wp || []).length,
      g.live && g.live.sit ? JSON.stringify(g.live.sit) : '',
    ].join('#');
  }

  async function showLive(gamePk, feed) {
    let wp = await fetchWinProb(gamePk);
    let tick = 0;
    const first = feedToGame(feed, wp);
    paintGame(first);
    let lastSig = sigOf(first);
    clearStatus(statusEl);
    contentEl.hidden = false;

    let busy = false;
    const timer = setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await fetchLiveFeed(gamePk);
        if (!next) return;
        const state = feedState(next);
        tick++;
        if (state !== 'live' || tick % WP_EVERY === 0) wp = await fetchWinProb(gamePk);
        const g = feedToGame(next, wp);
        const sig = sigOf(g);
        if (sig !== lastSig) { paintGame(g); lastSig = sig; }
        if (state !== 'live') clearInterval(timer); // the game ended: that was the final repaint
      } catch (_) { /* a failed refresh keeps what is already on screen */ }
      finally { busy = false; }
    }, GAME_POLL_MS);
  }

  // --------------------------------------------------------------------------
  // View model: everything the renderers need, worked out once per paint
  // --------------------------------------------------------------------------
  function buildView(game) {
    const box = game.box || {};
    const mkTeam = (side, fallback) => {
      const t = box[side] || null;
      const name = t && t.name ? String(t.name) : fallback;
      return { side, id: t && t.id !== undefined ? t.id : null, name, nick: shortTeamName(name), data: t };
    };
    const away = mkTeam('a', 'Away');
    const home = mkTeam('h', 'Home');

    const ls = game.ls || null;
    const inn = ls && Array.isArray(ls.inn) ? ls.inn : [];
    const lsTot = (side) => (ls && Array.isArray(ls[side]) ? ls[side] : []);
    const runsOf = (side) => {
      const r = numOrNull(lsTot(side)[0]);
      if (r !== null) return r;
      const t = box[side] && box[side].tot;
      return t ? numOrNull(t.r) : null;
    };
    const runs = { a: runsOf('a'), h: runsOf('h') };

    const live = !!game.live;
    let winner = null;
    if (!live && runs.a !== null && runs.h !== null && runs.a !== runs.h) winner = runs.a > runs.h ? 'a' : 'h';

    // game-wide facts (venue, weather, attendance ...)
    const info = new Map();
    for (const row of (Array.isArray(box.info) ? box.info : [])) {
      if (!Array.isArray(row)) continue;
      const [label, value] = row;
      if (label && value) info.set(String(label).trim(), String(value).replace(/\.\s*$/, '').trim());
    }

    // `i` is the play's position in the feed: the win-probability list lines up with it
    const plays = (Array.isArray(game.plays) ? game.plays : []).map((p, i) => ({ ...p, i }));

    return {
      away, home, runs, live, winner, inn, innings: inn.length, lsTot, info, plays,
      names: game.names || {},
      officials: (Array.isArray(box.off) ? box.off : []).filter(Array.isArray),
    };
  }

  /** Score after a half-inning (half 0 = top, 1 = bottom), from the linescore. */
  function scoreAfter(v, inning, half) {
    let a = 0, h = 0;
    for (let i = 0; i < v.inn.length && i < inning; i++) {
      const row = v.inn[i] || [];
      a += n0(row[0]);
      if (i < inning - 1 || half === 1) h += n0(row[4]);
    }
    return [a, h];
  }

  // --------------------------------------------------------------------------
  // Live view (only while a game is in progress)
  // Mirrors the TV graphics: score bug with the bases / count / outs under the
  // score, then a strike zone with every pitch of the at-bat (batter, catcher
  // and pitcher named), a field showing where the ball went and who is on
  // base, and a live play-by-play. Built from MLB's live feed by
  // liveSituation(); drawn by renderLive() and sitBugHtml().
  // --------------------------------------------------------------------------
  const ZONE_HALF_W = 17 / 24;   // home plate is 17 in wide -> half-width in feet

  function pickPerson(p, players) {
    if (!p || p.id === undefined || p.id === null) return null;
    const meta = (players && players['ID' + p.id]) || {};
    const full = String(p.fullName || meta.fullName || '').trim();
    const parts = full ? full.split(/\s+/) : [];
    const last = String(meta.lastName || (parts.length ? parts[parts.length - 1] : '') || '').trim();
    return {
      id: p.id,
      n: full || last || 'Player',
      ln: last || full || 'Player',
      bats: (meta.batSide && meta.batSide.code) || null,
      throws: (meta.pitchHand && meta.pitchHand.code) || null,
    };
  }

  /** Everything the live view needs, as plain data (also used as the repaint fingerprint). */
  function liveSituation(feed) {
    const gd = feed.gameData || {};
    const ld = feed.liveData || {};
    const ls = ld.linescore || {};
    const off = ls.offense || {};
    const def = ls.defense || {};
    const players = gd.players || {};
    const P = (p) => pickPerson(p, players);

    const innState = String(ls.inningState || '');
    const brk = /^(Middle|End)$/i.test(innState);          // between half-innings
    const top = ls.isTopInning !== undefined ? !!ls.isTopInning : /^Top$/i.test(innState);

    const cp = ld.plays && ld.plays.currentPlay ? ld.plays.currentPlay : null;
    const ab = { live: false, batter: null, pitcher: null, pitches: [], zTop: null, zBot: null, result: null, hit: null, next: null };

    if (cp && cp.matchup && cp.matchup.batter) {
      const m = cp.matchup;
      ab.live = !(cp.about && cp.about.isComplete === true);
      ab.batter = P(m.batter);
      ab.pitcher = P(m.pitcher);
      if (ab.batter && m.batSide && m.batSide.code) ab.batter.bats = m.batSide.code;
      if (ab.pitcher && m.pitchHand && m.pitchHand.code) ab.pitcher.throws = m.pitchHand.code;

      const evs = Array.isArray(cp.playEvents) ? cp.playEvents : [];
      const pitchEvs = evs.filter((e) => e && e.isPitch);
      ab.pitches = pitchEvs.map((e, i) => {
        const d = e.details || {};
        const pd = e.pitchData || {};
        const co = pd.coordinates || {};
        const pn = numOrNull(e.pitchNumber);
        return {
          n: pn === null ? i + 1 : pn,
          call: (d.call && d.call.description) || '',
          type: (d.type && d.type.description) || '',
          mph: numOrNull(pd.startSpeed),
          x: numOrNull(co.pX),
          z: numOrNull(co.pZ),
          cls: d.isInPlay ? 'play' : (d.isStrike ? 'strike' : (d.isBall ? 'ball' : 'other')),
          b: e.count ? numOrNull(e.count.balls) : null,
          s: e.count ? numOrNull(e.count.strikes) : null,
        };
      });
      for (const e of pitchEvs) {
        const pd = e.pitchData || {};
        const t = numOrNull(pd.strikeZoneTop), b = numOrNull(pd.strikeZoneBottom);
        if (t !== null && b !== null) { ab.zTop = t; ab.zBot = b; }
      }
      const lastEv = pitchEvs.length ? pitchEvs[pitchEvs.length - 1] : null;
      if (lastEv && lastEv.hitData) {
        const hd = lastEv.hitData;
        const co = hd.coordinates || {};
        ab.hit = {
          x: numOrNull(co.coordX), y: numOrNull(co.coordY),
          mph: numOrNull(hd.launchSpeed), ang: numOrNull(hd.launchAngle), dist: numOrNull(hd.totalDistance),
          traj: hd.trajectory ? String(hd.trajectory) : null,
          inPlay: !!(lastEv.details && lastEv.details.isInPlay),
        };
      }
      if (!ab.live && cp.result) ab.result = { ev: cp.result.event || '', d: cp.result.description || '' };
      if (!ab.live) {
        const nb = P(off.batter);
        if (nb && (!ab.batter || String(nb.id) !== String(ab.batter.id))) ab.next = nb;
      }
    } else {
      ab.live = true;                         // no pitch thrown yet: the batter is up, the zone is empty
      ab.batter = P(off.batter);
      ab.pitcher = P(def.pitcher);
    }

    return {
      brk, top,
      inn: numOrNull(ls.currentInning),
      ord: ls.currentInningOrdinal || '',
      state: innState,
      balls: n0(ls.balls), strikes: n0(ls.strikes), outs: n0(ls.outs),
      off: brk ? null : (top ? 'a' : 'h'),                    // batting side: 'a' away, 'h' home
      runners: brk ? { 1: null, 2: null, 3: null } : { 1: P(off.first), 2: P(off.second), 3: P(off.third) },
      field: { P: P(def.pitcher), C: P(def.catcher), '1B': P(def.first), '2B': P(def.second), '3B': P(def.third),
               SS: P(def.shortstop), LF: P(def.left), CF: P(def.center), RF: P(def.right) },
      onDeck: brk ? null : P(off.onDeck),
      inHole: brk ? null : P(off.inHole),
      ab,
    };
  }

  const batsText = (c) => (c === 'L' ? 'Bats left' : (c === 'R' ? 'Bats right' : (c === 'S' ? 'Switch hitter' : '')));
  const throwsText = (c) => (c === 'L' ? 'Throws left' : (c === 'R' ? 'Throws right' : ''));
  /** Side of the plate a hitter stands on: 'L' | 'R' (a switch hitter takes the side opposite the pitcher's arm). */
  function batSide(person, pitcher) {
    const c = person && person.bats;
    if (c === 'L' || c === 'R') return c;
    if (c === 'S') return pitcher && pitcher.throws === 'R' ? 'L' : 'R';
    return null;
  }
  const fmtMph = (n) => (n === null || n === undefined ? '' : `${Number(n).toFixed(1)} mph`);

  // ---- score bug: bases, count and outs, drawn under the score in the hero card ----
  function sitBugHtml(sit) {
    if (!sit) return '';
    const on = (k) => (sit.runners[k] ? ' is-on' : '');
    const base = (k, cx, cy) =>
      `<rect class="gb-base${on(k)}" x="${cx - 7}" y="${cy - 7}" width="14" height="14" transform="rotate(45 ${cx} ${cy})"/>`;
    const names = [[1, 'first'], [2, 'second'], [3, 'third']]
      .filter(([k]) => sit.runners[k]).map(([k, w]) => `${sit.runners[k].n} on ${w}`);
    const aria = (sit.brk ? 'Between innings' : (names.length ? `Runners: ${names.join(', ')}` : 'Bases empty')) +
      (sit.brk ? '' : `. Count ${sit.balls} balls, ${sit.strikes} strikes, ${sit.outs} out${sit.outs === 1 ? '' : 's'}.`);
    const dots = [0, 1, 2].map((i) => `<span class="gx-out${i < sit.outs ? ' is-on' : ''}"></span>`).join('');
    return `<div class="gx-sit" role="img" aria-label="${esc(aria)}">` +
      `<svg class="gx-bases" viewBox="0 0 84 66" aria-hidden="true" focusable="false">` +
        `<path class="gb-line" d="M42 58 L68 34 L42 10 L16 34 Z"/>` +
        base(2, 42, 10) + base(3, 16, 34) + base(1, 68, 34) +
        `<path class="gb-home" d="M36 58 L48 58 L48 62 L42 66 L36 62 Z"/>` +
      `</svg>` +
      (sit.brk ? '' :
        `<div class="gx-sit__row"><span class="gx-sit__count">${sit.balls}&ndash;${sit.strikes}</span>` +
        `<span class="gx-outs" title="${sit.outs} out${sit.outs === 1 ? '' : 's'}">${dots}</span></div>` +
        `<div class="gx-sit__cap">Count &middot; ${sit.outs} out${sit.outs === 1 ? '' : 's'}</div>`) +
      `</div>`;
  }

  // ---- header: who is batting / pitching / catching, who is on base ----
  function personBlock(role, teamNick, person, handText, cls) {
    const head = `<div class="lv-person__role">${esc(role)}${teamNick ? ` &middot; ${esc(teamNick)}` : ''}</div>`;
    if (!person) return `<div class="lv-person ${cls} is-empty">${head}<div class="lv-person__name">&mdash;</div></div>`;
    return `<div class="lv-person ${cls}">${head}` +
      `<div class="lv-person__name">${playerLink(person.id, person.n)}</div>` +
      (handText ? `<div class="lv-person__hand">${esc(handText)}</div>` : '') + `</div>`;
  }

  function liveHeadHtml(sit, v) {
    const ab = sit.ab;
    const offT = sit.off === 'a' ? v.away : (sit.off === 'h' ? v.home : null);
    const defT = sit.off === 'a' ? v.home : (sit.off === 'h' ? v.away : null);
    const isNow = ab.live && !sit.brk;
    const tag = sit.brk ? 'Between innings' : (ab.live ? 'At bat' : 'Last play');
    const chip = (label, person, extra) => (person
      ? `<span class="lv-chip${extra ? ' ' + extra : ''}"><b>${esc(label)}</b> ${playerLink(person.id, person.n)}</span>` : '');
    const side = batSide(ab.batter, ab.pitcher);
    const batHand = ab.batter && ab.batter.bats === 'S' && side
      ? `Switch hitter, batting ${side === 'L' ? 'left' : 'right'}` : batsText(ab.batter && ab.batter.bats);

    const chips = [chip('Catcher', sit.field.C)];
    if (ab.next) chips.push(chip('Up next', ab.next));
    chips.push(chip('On deck', sit.onDeck), chip('In the hole', sit.inHole));

    const runners = [[1, '1B'], [2, '2B'], [3, '3B']].filter(([k]) => sit.runners[k])
      .map(([k, l]) => chip(l, sit.runners[k], 'lv-chip--run')).join('');
    const baseLine = sit.brk ? '' : (runners || `<span class="lv-chip lv-chip--none">Bases empty</span>`);

    return `<div class="lv-head">` +
      `<div class="lv-tag${ab.live && !sit.brk ? ' is-live' : ''}">${esc(tag)}${sit.brk ? ` &middot; ${esc(sit.state)} of the ${esc(sit.ord)}` : ''}</div>` +
      `<div class="lv-matchup">` +
        personBlock(isNow ? 'Batting' : 'Last batter', offT && offT.nick, ab.batter, batHand, 'lv-person--bat') +
        `<div class="lv-vs">vs</div>` +
        personBlock(isNow ? 'Pitching' : 'Pitcher', defT && defT.nick, ab.pitcher, throwsText(ab.pitcher && ab.pitcher.throws), 'lv-person--pit') +
      `</div>` +
      `<div class="lv-chips">${chips.join('')}</div>` +
      (baseLine ? `<div class="lv-chips">${baseLine}</div>` : '') +
    `</div>`;
  }

  // ---- strike zone ----
  // Drawn from the pitcher's side (like the TV camera): the catcher is behind the plate, a right-handed batter
  // stands on the right of the picture, a left-handed one on the left. MLB gives pitch locations from the
  // catcher's view (pX > 0 = catcher's right), so x is mirrored here.
  function zoneCardHtml(sit) {
    const ab = sit.ab;
    const W = 460, H = 420, S = 58, CX = 230, GY = 372;
    const X = (px) => CX - px * S;
    const Y = (z) => GY - z * S;
    const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
    const f = (n) => n.toFixed(1);
    const zt = ab.zTop !== null ? ab.zTop : 3.5;
    const zb = ab.zBot !== null ? ab.zBot : 1.5;
    const x0 = X(ZONE_HALF_W), x1 = X(-ZONE_HALF_W), y0 = Y(zt), y1 = Y(zb);
    const cw = (x1 - x0) / 3, ch = (y1 - y0) / 3;

    const catcher =
      `<g class="lv-fig lv-fig--c" transform="translate(${CX} ${GY})">` +
        `<line class="lv-limb" x1="-42" y1="0" x2="-34" y2="-62" stroke-width="22"/>` +
        `<line class="lv-limb" x1="42" y1="0" x2="34" y2="-62" stroke-width="22"/>` +
        `<line class="lv-limb" x1="-34" y1="-62" x2="-16" y2="-112" stroke-width="26"/>` +
        `<line class="lv-limb" x1="34" y1="-62" x2="16" y2="-112" stroke-width="26"/>` +
        `<line class="lv-limb" x1="0" y1="-112" x2="0" y2="-190" stroke-width="58"/>` +
        `<circle cx="0" cy="-222" r="19"/>` +
        `<path class="lv-helmet" d="M-21 -224 A21 21 0 0 1 21 -224 Z"/>` +
        `<circle class="lv-mitt" cx="28" cy="-150" r="22"/>` +
      `</g>`;

    const side = batSide(ab.batter, ab.pitcher);
    let batter = '', batterName = '';
    if (side) {
      const bx = side === 'L' ? W - 330 : 330;
      const flip = side === 'L' ? ' scale(-1,1)' : '';
      batter =
        `<g class="lv-fig lv-fig--b" transform="translate(${bx} ${GY})${flip}">` +
          `<line class="lv-limb" x1="-34" y1="0" x2="-4" y2="-168" stroke-width="17"/>` +
          `<line class="lv-limb" x1="30" y1="0" x2="6" y2="-168" stroke-width="17"/>` +
          `<line class="lv-limb" x1="0" y1="-168" x2="-6" y2="-285" stroke-width="36"/>` +
          `<line class="lv-limb" x1="-6" y1="-268" x2="30" y2="-300" stroke-width="11"/>` +
          `<line class="lv-limb" x1="6" y1="-268" x2="32" y2="-292" stroke-width="11"/>` +
          `<line class="lv-bat" x1="28" y1="-296" x2="96" y2="-352" stroke-width="7"/>` +
          `<circle cx="-12" cy="-318" r="15"/>` +
          `<path class="lv-helmet" d="M-30 -320 A18 18 0 0 1 6 -320 L10 -314 L-30 -314 Z"/>` +
        `</g>`;
      batterName = `<text class="lv-tag-txt" x="${bx}" y="${GY + 34}" text-anchor="middle">${esc(ab.batter.ln)} (${side})</text>`;
    }

    const plate = `<path class="lv-plate" d="M${f(CX - 41)} ${GY + 10} L${f(CX + 41)} ${GY + 10} L${f(CX + 41)} ${GY} L${CX} ${GY - 14} L${f(CX - 41)} ${GY} Z"/>`;
    const catcherName = sit.field.C
      ? `<text class="lv-tag-txt" x="${CX}" y="${GY + 34}" text-anchor="middle">C ${esc(sit.field.C.ln)}</text>` : '';

    const zone =
      `<rect class="lv-zone" x="${f(x0)}" y="${f(y0)}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"/>` +
      [1, 2].map((i) => `<line class="lv-zone__grid" x1="${f(x0 + cw * i)}" y1="${f(y0)}" x2="${f(x0 + cw * i)}" y2="${f(y1)}"/>`).join('') +
      [1, 2].map((i) => `<line class="lv-zone__grid" x1="${f(x0)}" y1="${f(y0 + ch * i)}" x2="${f(x1)}" y2="${f(y0 + ch * i)}"/>`).join('');

    const shown = ab.pitches.filter((p) => p.x !== null && p.z !== null);
    const lastN = ab.pitches.length ? ab.pitches[ab.pitches.length - 1].n : null;
    const dots = shown.map((p) => {
      const cx = clamp(X(p.x), 16, W - 16), cy = clamp(Y(p.z), 16, GY + 8);
      const isLast = p.n === lastN;
      return `<g class="lv-pt lv-pt--${p.cls}${isLast ? ' is-last' : ''}">` +
        (isLast ? `<circle class="lv-pt__ring" cx="${f(cx)}" cy="${f(cy)}" r="16"/>` : '') +
        `<circle cx="${f(cx)}" cy="${f(cy)}" r="10"/>` +
        `<text x="${f(cx)}" y="${f(cy + 4)}" text-anchor="middle">${p.n}</text></g>`;
    }).join('');

    const aria = `Strike zone from the pitcher's side with ${shown.length} pitch${shown.length === 1 ? '' : 'es'} plotted.`;
    const svg = `<svg class="lv-zone-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">` +
      catcher + batter + plate + zone + dots + catcherName + batterName + `</svg>`;

    const lp = ab.pitches.length ? ab.pitches[ab.pitches.length - 1] : null;
    const last = lp
      ? `<div class="lv-last"><span class="lv-last__t">${esc(lp.type || 'Pitch')}</span>` +
        (lp.mph !== null ? `<span class="lv-last__mph">${esc(fmtMph(lp.mph))}</span>` : '') +
        `<span class="lv-last__call">${esc(lp.call)}</span></div>`
      : `<div class="lv-last lv-last--none">${ab.live ? 'Waiting for the first pitch' : 'No pitches tracked'}</div>`;

    const rows = ab.pitches.map((p) =>
      `<tr class="lv-pc--${p.cls}"><td class="num">${p.n}</td><td>${esc(p.type || '\u2014')}</td>` +
      `<td class="num">${p.mph !== null ? esc(Number(p.mph).toFixed(1)) : '\u2014'}</td><td>${esc(p.call || '\u2014')}</td>` +
      `<td class="num">${p.b !== null && p.s !== null ? `${p.b}\u2013${p.s}` : ''}</td></tr>`).join('');
    const table = rows
      ? `<div class="table-scroll"><table class="lv-pt-table"><thead><tr><th>#</th><th>Pitch</th><th>mph</th><th>Result</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table></div>` : '';

    const legend = `<div class="lv-legend"><span><i class="lv-key lv-key--ball"></i>Ball</span>` +
      `<span><i class="lv-key lv-key--strike"></i>Strike / foul</span><span><i class="lv-key lv-key--play"></i>In play</span>` +
      `<span class="lv-legend__view">Pitcher&rsquo;s view</span></div>`;

    return `<div class="lv-card"><h3 class="lv-card__title">Strike zone</h3>${svg}${legend}${last}${table}</div>`;
  }

  // ---- field ----
  const FIELD_SPOTS = { P: [0, 60.5], '1B': [70, 92], '2B': [46, 138], SS: [-46, 138], '3B': [-70, 92],
    LF: [-135, 262], CF: [0, 300], RF: [135, 262] };
  const BASE_SPOTS = { 1: [63.64, 63.64], 2: [0, 127.28], 3: [-63.64, 63.64] };

  function hitKind(ab) {
    const h = ab.hit;
    if (!h) return null;
    if (h.inPlay) {
      if (ab.live) return 'pending';                       // just hit, result not decided yet
      const ev = (ab.result && ab.result.ev) || '';
      if (/home run/i.test(ev)) return 'hr';
      if (/^(single|double|triple)/i.test(ev)) return 'hit';
      if (/error/i.test(ev)) return 'err';
      return 'out';
    }
    return 'foul';
  }

  function fieldCardHtml(sit, v) {
    const ab = sit.ab;
    const FY = (y) => 410 - y;
    const f = (n) => n.toFixed(1);
    const rad = (d) => (d * Math.PI) / 180;
    const fence = (deg) => 400 - 70 * Math.pow(Math.abs(deg) / 45, 1.6);   // generic outfield wall: 330 down the lines, 400 to center
    const pts = [];
    for (let d = -45; d <= 45; d += 3) pts.push([fence(d) * Math.sin(rad(d)), fence(d) * Math.cos(rad(d))]);
    const pt = (x, y) => `${f(x)} ${f(FY(y))}`;
    const fair = `M ${pt(0, 0)} ` + pts.map((p) => `L ${pt(p[0], p[1])}`).join(' ') + ' Z';
    const wall = 'M ' + pts.map((p) => pt(p[0], p[1])).join(' L ');

    const bases = [1, 2, 3].map((k) => {
      const [bx, by] = BASE_SPOTS[k];
      const d = 8;
      return `<path class="lv-base${sit.runners[k] ? ' is-on' : ''}" d="M ${pt(bx, by + d)} L ${pt(bx + d, by)} L ${pt(bx, by - d)} L ${pt(bx - d, by)} Z"/>`;
    }).join('');

    // runners: a dot on the base with the name beside it
    const runnerSvg = [1, 2, 3].map((k) => {
      const r = sit.runners[k];
      if (!r) return '';
      const [bx, by] = BASE_SPOTS[k];
      let tx = bx, ty = by, anchor = 'middle';
      if (k === 1) { tx = bx + 15; ty = by - 5; anchor = 'start'; }
      if (k === 3) { tx = bx - 15; ty = by - 5; anchor = 'end'; }
      if (k === 2) { ty = by - 22; }
      return `<g class="lv-run"><circle cx="${f(bx)}" cy="${f(FY(by))}" r="7"/>` +
        `<text x="${f(tx)}" y="${f(FY(ty) + 5)}" text-anchor="${anchor}">${esc(r.ln)}</text></g>`;
    }).join('');

    const fielders = Object.keys(FIELD_SPOTS).map((k) => {
      const p = sit.field[k];
      if (!p) return '';
      const [x, y] = FIELD_SPOTS[k];
      return `<g class="lv-fld"><circle cx="${f(x)}" cy="${f(FY(y))}" r="6"/>` +
        `<text x="${f(x)}" y="${f(FY(y) - 11)}" text-anchor="middle">${esc(p.ln)}</text></g>`;
    }).join('');
    const catcherSvg = sit.field.C
      ? `<g class="lv-fld lv-fld--c"><circle cx="0" cy="${f(FY(-10))}" r="6"/>` +
        `<text x="0" y="${f(FY(-10) + 21)}" text-anchor="middle">${esc(sit.field.C.ln)}</text></g>` : '';

    // batter at the plate (right-handed on the third-base side = left of the picture)
    let batterSvg = '';
    const bPerson = ab.live ? ab.batter : (ab.next || ab.batter);
    const bSide = batSide(bPerson, ab.pitcher);
    if (!sit.brk && bPerson && bSide) {
      const bx = bSide === 'L' ? 16 : -16;
      batterSvg = `<g class="lv-bat-dot"><circle cx="${bx}" cy="${f(FY(0))}" r="6"/>` +
        `<text x="${bx + (bSide === 'L' ? 11 : -11)}" y="${f(FY(0) + 5)}" text-anchor="${bSide === 'L' ? 'start' : 'end'}">${esc(bPerson.ln)}</text></g>`;
    }

    // where the ball went (MLB's hit coordinates -> feet from home plate)
    let hitSvg = '', hitKindNow = hitKind(ab);
    if (ab.hit && ab.hit.x !== null && ab.hit.y !== null && hitKindNow) {
      const hx = Math.max(-255, Math.min(255, 2.495 * (ab.hit.x - 125.42)));
      const hy = Math.max(-40, Math.min(425, 2.495 * (198.27 - ab.hit.y)));
      const label = hitKindNow === 'foul' ? 'Foul ball' : (ab.result && ab.result.ev ? ab.result.ev : 'In play');
      const anchor = hx > 120 ? 'end' : 'start';
      const lx = hx + (anchor === 'end' ? -12 : 12);
      const mark = hitKindNow === 'hr'
        ? `<path d="M ${f(hx)} ${f(FY(hy) - 11)} L ${f(hx + 3.2)} ${f(FY(hy) - 3.5)} L ${f(hx + 10.5)} ${f(FY(hy) - 3.5)} L ${f(hx + 4.5)} ${f(FY(hy) + 1.5)} L ${f(hx + 6.5)} ${f(FY(hy) + 9)} L ${f(hx)} ${f(FY(hy) + 4.5)} L ${f(hx - 6.5)} ${f(FY(hy) + 9)} L ${f(hx - 4.5)} ${f(FY(hy) + 1.5)} L ${f(hx - 10.5)} ${f(FY(hy) - 3.5)} L ${f(hx - 3.2)} ${f(FY(hy) - 3.5)} Z"/>`
        : `<circle cx="${f(hx)}" cy="${f(FY(hy))}" r="7"/>`;
      hitSvg = `<g class="lv-hit lv-hit--${hitKindNow}"><line x1="0" y1="${f(FY(0))}" x2="${f(hx)}" y2="${f(FY(hy))}"/>${mark}` +
        `<text x="${f(lx)}" y="${f(FY(hy) + 5)}" text-anchor="${anchor}">${esc(label)}</text></g>`;
    }

    const svg = `<svg class="lv-field-svg" viewBox="-265 -20 530 490" role="img" aria-label="Baseball field with the fielders, the runners on base and where the ball went.">` +
      `<defs><clipPath id="lv-fair"><path d="${fair}"/></clipPath></defs>` +
      `<path class="lv-grass" d="${fair}"/>` +
      `<circle class="lv-dirt" cx="0" cy="${f(FY(60.5))}" r="95" clip-path="url(#lv-fair)"/>` +
      `<path class="lv-infield" d="M ${pt(0, 24)} L ${pt(51, 63.64)} L ${pt(0, 103)} L ${pt(-51, 63.64)} Z"/>` +
      `<path class="lv-wall" d="${wall}"/>` +
      `<line class="lv-chalk" x1="0" y1="${f(FY(0))}" x2="${f(pts[pts.length - 1][0])}" y2="${f(FY(pts[pts.length - 1][1]))}"/>` +
      `<line class="lv-chalk" x1="0" y1="${f(FY(0))}" x2="${f(pts[0][0])}" y2="${f(FY(pts[0][1]))}"/>` +
      bases +
      `<path class="lv-plate-f" d="M ${pt(-5, 0)} L ${pt(5, 0)} L ${pt(5, -4)} L ${pt(0, -8)} L ${pt(-5, -4)} Z"/>` +
      `<circle class="lv-mound" cx="0" cy="${f(FY(60.5))}" r="8"/>` +
      fielders + catcherSvg + batterSvg + hitSvg + runnerSvg + `</svg>`;

    // text readout under the field
    const lines = [];
    const h = ab.hit;
    if (!ab.live && ab.result && ab.result.ev) lines.push(`<strong>${esc(ab.result.ev)}</strong>`);
    if (h && hitKindNow === 'foul') {
      lines.push('Foul ball');
    } else if (h && hitKindNow) {
      const bits = [];
      if (h.traj) bits.push(prettyKey(h.traj));
      if (h.mph !== null) bits.push(`${Number(h.mph).toFixed(1)} mph off the bat`);
      if (h.ang !== null) bits.push(`${Math.round(h.ang)}\u00b0 launch angle`);
      if (h.dist !== null && h.dist > 0) bits.push(`${Math.round(h.dist)} ft`);
      lines.push(esc(bits.length ? bits.join(' \u00b7 ') : 'Ball in play'));
    }
    const read = lines.length
      ? `<div class="lv-readout">${lines.join('<br>')}</div>`
      : `<div class="lv-readout lv-readout--none">${ab.live ? 'No ball in play on this at-bat yet' : 'No ball in play'}</div>`;

    const legend = `<div class="lv-legend"><span><i class="lv-key lv-key--hit"></i>Hit</span><span><i class="lv-key lv-key--out"></i>Out</span>` +
      `<span><i class="lv-key lv-key--hr"></i>Home run</span><span><i class="lv-key lv-key--foul"></i>Foul</span></div>`;

    return `<div class="lv-card"><h3 class="lv-card__title">Field</h3>${svg}${legend}${read}` +
      `<p class="lv-note">Fielders are drawn at standard positions; MLB doesn&rsquo;t publish live shifts.</p></div>`;
  }

  // ---- live play-by-play: the current at-bat pitch by pitch, then finished plays, newest first ----
  function feedCardHtml(sit, v) {
    const ab = sit.ab;
    const items = [];
    if (ab.live) {
      for (let i = ab.pitches.length - 1; i >= 0; i--) {
        const p = ab.pitches[i];
        const bits = [`Pitch ${p.n}`];
        if (p.type) bits.push(p.type);
        if (p.mph !== null) bits.push(fmtMph(p.mph));
        items.push(`<li class="lv-ev lv-ev--pitch lv-pc--${p.cls}"><span class="lv-ev__when">${p.b !== null && p.s !== null ? `${p.b}\u2013${p.s}` : ''}</span>` +
          `<span class="lv-ev__txt">${esc(bits.join(' \u00b7 '))} &mdash; <b>${esc(p.call || 'Pitch')}</b></span></li>`);
      }
    }
    const done = v.plays.filter((p) => p.ok !== false).slice(-14).reverse();
    for (const p of done) {
      items.push(`<li class="lv-ev${p.sc ? ' is-scoring' : ''}"><span class="lv-ev__when">${p.t === 0 ? '\u25b2' : '\u25bc'} ${esc(p.in)}</span>` +
        `<span class="lv-ev__txt">${esc(p.d || p.ev || '')}</span></li>`);
    }
    const body = items.length ? `<ul class="lv-feed">${items.join('')}</ul>` : emptyMsg('Waiting for the first play.');
    return `<div class="lv-card lv-card--feed"><h3 class="lv-card__title">Live play-by-play</h3>${body}` +
      `<p class="lv-note">Updates automatically. The Plays tab has the full game log.</p></div>`;
  }

  function renderLive(game, v) {
    const panel = byId('live-panel');
    const sit = v.live && game.live ? game.live.sit : null;
    if (!sit) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.innerHTML = liveHeadHtml(sit, v) +
      `<div class="lv-grid">${zoneCardHtml(sit)}${fieldCardHtml(sit, v)}</div>` +
      feedCardHtml(sit, v);
    panel.hidden = false;
  }

  // --------------------------------------------------------------------------
  // Paint everything
  // --------------------------------------------------------------------------
  function paintGame(game) {
    const v = buildView(game);
    current = game;
    view = v;
    initTabs();
    safe('hero', () => renderHero(game, v));
    safe('live-panel', () => renderLive(game, v));
    safe('g-summary', () => { byId('g-summary').innerHTML = renderSummary(game, v); });
    safe('g-box', renderBox);
    safe('g-stats', () => { byId('g-stats').innerHTML = renderStats(v); });
    safe('g-plays', renderPlays);
    safe('g-winprob', renderWinProb);
  }

  function initTabs() {
    if (tabsReady) return;
    tabsReady = true;

    const btns = Array.from(document.querySelectorAll('#game-tabs .tab'));
    function show(name) {
      ui.tab = name;
      btns.forEach((b) => {
        const on = b.dataset.tab === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      TAB_KEYS.forEach((k) => { const el = byId('gpanel-' + k); if (el) el.hidden = k !== name; });
    }
    btns.forEach((b) => {
      b.addEventListener('click', () => show(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const n = btns.length;
        const next = btns[(btns.indexOf(b) + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
        next.focus();
        show(next.dataset.tab);
        e.preventDefault();
      });
    });
    const want = qs('tab');
    show(TAB_KEYS.includes(want) ? want : 'summary');

    // Box score: team toggle
    byId('g-box').addEventListener('click', (e) => {
      const b = e.target.closest('[data-side]');
      if (!b || !view) return;
      ui.boxSide = b.dataset.side === 'h' ? 'h' : 'a';
      safe('g-box', renderBox);
    });

    // Plays: filter / order buttons, inning select, remembering opened pitch lists
    const playsRoot = byId('g-plays');
    playsRoot.addEventListener('click', (e) => {
      if (!view) return;
      const f = e.target.closest('[data-filter]');
      if (f) { ui.playFilter = f.dataset.filter; safe('g-plays', renderPlays); return; }
      const o = e.target.closest('[data-order]');
      if (o) { ui.playOrder = o.dataset.order === 'new' ? 'new' : 'old'; safe('g-plays', renderPlays); }
    });
    playsRoot.addEventListener('change', (e) => {
      const s = e.target.closest('[data-inning]');
      if (!s || !view) return;
      ui.playInning = s.value;
      safe('g-plays', renderPlays);
    });
    playsRoot.addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d || !d.dataset || d.dataset.i === undefined) return;
      const i = Number(d.dataset.i);
      if (d.open) ui.openPlays.add(i); else ui.openPlays.delete(i);
    }, true); // 'toggle' doesn't bubble, so listen while it travels down
  }

  // --------------------------------------------------------------------------
  // Hero: logo cards with nicknames, score between them
  //   winner's score green, loser's score white at 50%; both red while live
  // --------------------------------------------------------------------------
  function heroTeamHtml(team) {
    const img = team.id === null || team.id === undefined ? '' :
      `<img src="assets/logos/${encodeURIComponent(team.id)}.webp" alt="" ` +
      `onerror="this.onerror=null;this.style.display='none';">`;
    const inner = `<span class="mu-logo">${img}</span><span class="mu-name">${esc(team.nick)}</span>`;
    return team.id === null || team.id === undefined
      ? `<div class="mu-team">${inner}</div>`
      : `<a class="mu-team" href="team.html?id=${encodeURIComponent(team.id)}">${inner}</a>`;
  }

  function renderHero(game, v) {
    document.title = `${v.live ? 'LIVE \u00b7 ' : ''}${v.away.nick} @ ${v.home.nick} \u2014 MLB Archive`;
    byId('game-date').textContent = fmtDate(game.date);

    const shown = (n) => (n === null ? '\u2014' : String(n));
    const cls = (side) => (v.live ? 'is-live' : (v.winner ? (v.winner === side ? 'is-win' : 'is-dim') : ''));

    const state = v.live
      ? `<span class="live-badge" title="Game in progress"><span class="live-dot" aria-hidden="true"></span>LIVE` +
        `<span class="live-badge__state">${esc(game.live.label)}</span></span>`
      : `<span class="gh-final">${v.innings > 9 ? `Final/${v.innings}` : 'Final'}</span>`;

    byId('game-title').textContent =
      `${v.away.nick} ${shown(v.runs.a)}, ${v.home.nick} ${shown(v.runs.h)} (${v.live ? 'live' : 'final'})`;

    const card = byId('game-matchup');
    card.classList.toggle('is-live', v.live);
    card.innerHTML =
      `<div class="gh-state">${state}</div>` +
      `<div class="mu-top">` +
        heroTeamHtml(v.away) +
        `<div class="mu-mid">` +
          `<div class="mu-score" aria-hidden="true">` +
            `<span class="gh-num ${cls('a')}">${shown(v.runs.a)}</span>` +
            `<span class="mu-dash">&ndash;</span>` +
            `<span class="gh-num ${cls('h')}">${shown(v.runs.h)}</span>` +
          `</div>` +
          (v.live && game.live ? sitBugHtml(game.live.sit) : '') +
        `</div>` +
        heroTeamHtml(v.home) +
      `</div>`;

    const meta = byId('game-meta');
    const venue = v.info.get('Venue');
    if (venue) { meta.textContent = venue; meta.hidden = false; } else { meta.hidden = true; }
  }

  // --------------------------------------------------------------------------
  // Summary tab: linescore, decisions, scoring summary, top performers, game info
  // --------------------------------------------------------------------------
  function renderSummary(game, v) {
    return section('Linescore', linescoreHtml(game, v)) +
      decisionsHtml(v) +
      scoringHtml(v) +
      performersHtml(v) +
      infoHtml(v);
  }

  function linescoreHtml(game, v) {
    if (!game.ls) return emptyMsg('No linescore available for this game.');
    const cols = Math.max(9, v.innings);
    let head = `<thead><tr><th class="left">Team</th>`;
    for (let i = 1; i <= cols; i++) head += `<th>${i}</th>`;
    head += `<th class="gx-r">R</th><th>H</th><th>E</th><th>LOB</th></tr></thead>`;

    const runCls = (side) => (v.live ? ' is-live' : (v.winner ? (v.winner === side ? ' is-win' : ' is-dim') : ''));
    const row = (team, idx) => {
      let cells = `<td class="left">${teamLinkHtml(team.id, esc(team.nick))}</td>`;
      for (let i = 0; i < cols; i++) {
        const inning = v.inn[i];
        let val = inning ? inning[idx] : null;
        // the home team didn't need to bat in the last inning
        if ((val === null || val === undefined) && idx === 4 && inning && !v.live && i === v.innings - 1) val = 'X';
        cells += `<td class="num">${esc(cellOrBlank(val))}</td>`;
      }
      const tot = v.lsTot(team.side);
      const r = numOrNull(tot[0]) !== null ? numOrNull(tot[0]) : v.runs[team.side];
      cells += `<td class="num gx-r${runCls(team.side)}">${esc(cellOrBlank(r))}</td>`;
      for (let k = 1; k < 4; k++) cells += `<td class="num">${esc(cellOrBlank(tot[k]))}</td>`;
      return `<tr>${cells}</tr>`;
    };

    return `<div class="table-scroll"><table class="ledger gx-line">${head}` +
      `<tbody>${row(v.away, 0)}${row(v.home, 4)}</tbody></table></div>`;
  }

  function pitchLine(p) {
    const parts = [];
    if (p.ip !== undefined && p.ip !== null && p.ip !== '') parts.push(`${p.ip} IP`);
    if (numOrNull(p.h) !== null) parts.push(`${p.h} H`);
    if (numOrNull(p.er) !== null) parts.push(`${p.er} ER`);
    if (numOrNull(p.bb) !== null) parts.push(`${p.bb} BB`);
    if (numOrNull(p.k) !== null) parts.push(`${p.k} K`);
    return parts.join(' \u00b7 ');
  }

  function batLine(p) {
    const parts = [`${n0(p.h)}-for-${n0(p.ab)}`];
    const add = (val, label) => { const n = n0(val); if (n > 0) parts.push(n > 1 ? `${n} ${label}` : label); };
    add(p.hr, 'HR'); add(p.t, '3B'); add(p.d, '2B');
    if (n0(p.rbi) > 0) parts.push(`${n0(p.rbi)} RBI`);
    if (n0(p.r) > 0) parts.push(`${n0(p.r)} R`);
    if (n0(p.bb) > 0) parts.push(`${n0(p.bb)} BB`);
    if (n0(p.sb) > 0) parts.push(`${n0(p.sb)} SB`);
    return parts.join(', ');
  }

  /** Simple "how big was his day" score used to pick the top hitters. */
  function batScore(p) {
    return n0(p.h) + n0(p.d) * 0.5 + n0(p.t) + n0(p.hr) * 3 + n0(p.rbi) * 1.5 + n0(p.r) * 0.5 + n0(p.sb) * 0.5 + n0(p.bb) * 0.3;
  }

  /** Pitchers who got a decision (the note on their line reads like "(W, 5-2)"). */
  function decisionsOf(v) {
    const out = [];
    for (const team of [v.away, v.home]) {
      for (const p of (team.data && Array.isArray(team.data.pit) ? team.data.pit : [])) {
        const m = /^\(?\s*(W|L|SV|S|H|BS)\b/i.exec(String(p.note || '').trim());
        if (!m) continue;
        let kind = m[1].toUpperCase();
        if (kind === 'S') kind = 'SV';
        out.push({ kind, p, team });
      }
    }
    return out;
  }

  function decisionsHtml(v) {
    const decs = decisionsOf(v);
    const defs = [['W', 'Win', 'win'], ['L', 'Loss', 'loss'], ['SV', 'Save', 'save']];
    const cards = defs.map(([kind, label, cls]) => {
      const d = decs.find(x => x.kind === kind);
      if (!d) return '';
      const recMatch = /,\s*([^)]*)/.exec(String(d.p.note));
      const rec = recMatch && recMatch[1].trim() ? (kind === 'SV' ? `${recMatch[1].trim()} SV` : recMatch[1].trim()) : '';
      return `<div class="gx-dec gx-dec--${cls}">` +
        `<div class="gx-dec__kind">${label}</div>` +
        `<div class="gx-dec__who">${teamLogoCardHtml(d.team.id)}` +
          `<div><div class="gx-dec__name">${playerLink(d.p.id, d.p.n || 'Pitcher')}</div>` +
          `<div class="gx-dec__line">${esc(pitchLine(d.p))}</div></div></div>` +
        (rec ? `<div class="gx-dec__rec">${esc(rec)}</div>` : '') +
      `</div>`;
    }).join('');
    return cards ? section('Decisions', `<div class="gx-dec-grid">${cards}</div>`) : '';
  }

  function scoreTagHtml(v, a, h) {
    return `<span class="gx-score" title="Score after this half-inning">` +
      `<span class="gx-score__t">${teamLogoCardHtml(v.away.id)}<b>${a}</b></span>` +
      `<span class="gx-score__dash">&ndash;</span>` +
      `<span class="gx-score__t">${teamLogoCardHtml(v.home.id)}<b>${h}</b></span></span>`;
  }

  function scoringHtml(v) {
    if (v.plays.length === 0) return '';
    const scoring = v.plays.filter(p => p && p.sc);
    if (scoring.length === 0) {
      return section('Scoring summary', emptyMsg(v.live ? 'No runs scored yet.' : 'No scoring plays recorded.'));
    }
    const groups = new Map();
    for (const p of scoring) {
      const key = `${p.in}-${p.t}`;
      if (!groups.has(key)) groups.set(key, { inning: p.in, t: p.t, items: [] });
      groups.get(key).items.push(p);
    }
    const html = [...groups.values()].map((g) => {
      const bat = g.t === 0 ? v.away : v.home;
      const inning = numOrNull(g.inning);
      const after = v.innings > 0 && inning !== null ? scoreAfter(v, inning, g.t) : null;
      return `<div class="gx-sum">` +
        `<div class="gx-half"><span class="gx-half__title">${teamLogoCardHtml(bat.id)}` +
          `<span>${esc(halfLabel(g.t, g.inning))}</span></span>${after ? scoreTagHtml(v, after[0], after[1]) : ''}</div>` +
        `<ul class="gx-sum__list">${g.items.map(p => `<li>${esc(p.d || p.ev || '')}</li>`).join('')}</ul>` +
      `</div>`;
    }).join('');
    return section('Scoring summary', html);
  }

  function performersHtml(v) {
    const decs = decisionsOf(v);
    const col = (team) => {
      const d = team.data || {};
      const bats = (Array.isArray(d.bat) ? d.bat : [])
        .map(p => ({ p, s: batScore(p) })).filter(x => x.s >= 2)
        .sort((a, b) => b.s - a.s).slice(0, 3);

      const mine = decs.filter(x => x.team === team && ['W', 'L', 'SV'].includes(x.kind));
      const pits = [];
      const pit = Array.isArray(d.pit) ? d.pit : [];
      if (pit[0]) {
        const dec = mine.find(x => x.p === pit[0]);
        pits.push({ p: pit[0], tag: dec ? `SP \u00b7 ${dec.kind}` : 'SP' });
      }
      for (const x of mine) if (!pits.some(y => y.p === x.p)) pits.push({ p: x.p, tag: x.kind });

      const tag = (t) => (t ? `<span class="gx-perf__tag">${esc(t)}</span>` : '');
      const rows = pits.map(({ p, tag: t }) =>
        `<li><span class="gx-perf__who">${playerLink(p.id, p.n || 'Pitcher')}${tag(t)}</span>` +
        `<span class="gx-perf__line">${esc(pitchLine(p))}</span></li>`)
        .concat(bats.map(({ p }) =>
        `<li><span class="gx-perf__who">${playerLink(p.id, p.n || 'Player')}${tag(p.pos)}</span>` +
        `<span class="gx-perf__line">${esc(batLine(p))}</span></li>`));
      if (!rows.length) return '';
      return `<div class="gx-perf"><div class="gx-perf__head">${teamLinkHtml(team.id, esc(team.nick))}</div>` +
        `<ul class="gx-perf__list">${rows.join('')}</ul></div>`;
    };
    const a = col(v.away), h = col(v.home);
    return a || h ? section('Top performers', `<div class="gx-grid2">${a}${h}</div>`) : '';
  }

  function infoHtml(v) {
    const order = ['Venue', 'First pitch', 'T', 'Att', 'Weather', 'Wind'];
    const labels = { T: 'Time of game', Att: 'Attendance' };
    const rows = [];
    for (const k of order) if (v.info.has(k)) rows.push([labels[k] || k, v.info.get(k)]);
    for (const [k, val] of v.info) if (!order.includes(k)) rows.push([k, val]);
    if (v.officials.length) {
      rows.push(['Umpires', v.officials.map(([pos, name]) => `${pos} \u2013 ${name}`).join(' \u00b7 ')]);
    }
    if (!rows.length) return '';
    return section('Game info', `<table class="trophy-table">${rows.map(([label, val]) =>
      `<tr><td class="trophy-label">${esc(label)}</td><td class="trophy-years">${esc(val)}</td></tr>`).join('')}</table>`);
  }

  // --------------------------------------------------------------------------
  // Box score tab: team toggle, batting, pitching, notes
  // --------------------------------------------------------------------------
  const BAT_COLS = [
    ['pos', 'Pos'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['d', '2B'], ['t', '3B'],
    ['hr', 'HR'], ['rbi', 'RBI'], ['bb', 'BB'], ['k', 'K'], ['sb', 'SB'],
  ];
  const PIT_COLS = [
    ['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['bb', 'BB'], ['k', 'K'], ['hr', 'HR'],
  ];
  const BAT_KEYS = ['ab', 'r', 'h', 'd', 't', 'hr', 'rbi', 'bb', 'k', 'sb'];

  function batTotals(data) {
    if (!data) return null;
    if (data.tot && numOrNull(data.tot.ab) !== null) {
      const o = {};
      for (const k of BAT_KEYS) o[k] = n0(data.tot[k]);
      return o;
    }
    if (Array.isArray(data.bat) && data.bat.length) {
      const o = {};
      for (const k of BAT_KEYS) o[k] = data.bat.reduce((s, p) => s + n0(p[k]), 0);
      return o;
    }
    return null;
  }

  function pitTotals(data) {
    const pit = data && Array.isArray(data.pit) ? data.pit : [];
    if (!pit.length) return null;
    const o = { outs: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0, count: pit.length };
    for (const p of pit) {
      o.outs += ipToOuts(p.ip);
      for (const k of ['h', 'r', 'er', 'bb', 'k', 'hr']) o[k] += n0(p[k]);
    }
    o.ip = outsToIp(o.outs);
    return o;
  }

  /** Highlights standout numbers in a batting line. */
  function hotCls(key, val) {
    const n = numOrNull(val);
    if (n === null || n <= 0) return '';
    if (key === 'd' || key === 't' || key === 'hr' || key === 'sb') return ' is-hot';
    if ((key === 'h' || key === 'r' || key === 'rbi') && n >= 2) return ' is-hot';
    return '';
  }

  function teamBoxHtml(team, v) {
    const d = team.data;
    if (!d) return emptyMsg(`No box score available for the ${team.nick}.`);

    const tot = v.lsTot(team.side);
    const kpiVals = [['Runs', v.runs[team.side]], ['Hits', numOrNull(tot[1])], ['Errors', numOrNull(tot[2])], ['LOB', numOrNull(tot[3])]]
      .filter(([, x]) => x !== null);
    let html = kpiVals.length
      ? `<div class="gx-kpis">${kpiVals.map(([l, x]) =>
          `<div class="gx-kpi"><div class="gx-kpi__v">${x}</div><div class="gx-kpi__l">${l}</div></div>`).join('')}</div>`
      : '';

    // batting
    const bt = batTotals(d);
    html += `<h3 class="sub-heading">Batting</h3><div class="table-scroll"><table class="ledger gx-box"><thead><tr>` +
      `<th class="left">Player</th>` +
      BAT_COLS.map(([k, l]) => `<th${k === 'pos' ? ' class="left"' : ''}>${l}</th>`).join('') +
      `</tr></thead><tbody>`;
    for (const p of (Array.isArray(d.bat) ? d.bat : [])) {
      html += `<tr><td class="left">${playerLink(p.id, p.n || '\u2014')}</td>` +
        BAT_COLS.map(([k]) => k === 'pos'
          ? `<td class="gx-pos">${esc(cellOrBlank(p.pos))}</td>`
          : `<td class="num${hotCls(k, p[k])}">${esc(cellOrBlank(p[k]))}</td>`).join('') +
        `</tr>`;
    }
    html += `</tbody>`;
    if (bt) {
      html += `<tfoot><tr><td class="left">Total</td>` +
        BAT_COLS.map(([k]) => (k === 'pos' ? '<td></td>' : `<td class="num">${bt[k]}</td>`)).join('') +
        `</tr></tfoot>`;
    }
    html += `</table></div>`;

    // pitching
    const pit = Array.isArray(d.pit) ? d.pit : [];
    if (pit.length) {
      const pt = pitTotals(d);
      html += `<h3 class="sub-heading" style="margin-top:26px;">Pitching</h3><div class="table-scroll"><table class="ledger gx-box"><thead><tr>` +
        `<th class="left">Pitcher</th>${PIT_COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>`;
      for (const p of pit) {
        const note = p.note ? ` <span class="gx-note">${esc(p.note)}</span>` : '';
        html += `<tr><td class="left">${playerLink(p.id, p.n || '\u2014')}${note}</td>` +
          PIT_COLS.map(([k]) => `<td class="num">${esc(cellOrBlank(p[k]))}</td>`).join('') + `</tr>`;
      }
      html += `</tbody><tfoot><tr><td class="left">Total</td>` +
        PIT_COLS.map(([k]) => `<td class="num">${esc(String(pt[k]))}</td>`).join('') +
        `</tr></tfoot></table></div>`;
    }

    // notes (2B / 3B / HR / SB narrative lines), if present
    if (d.notes && typeof d.notes === 'object' && Object.keys(d.notes).length) {
      html += `<div class="gx-notes">` + Object.entries(d.notes).map(([title, rows]) => {
        const list = (Array.isArray(rows) ? rows : [rows])
          .map(r => (Array.isArray(r) ? r.join(' ') : String(r))).join('; ');
        return `<div><strong>${esc(prettyKey(String(title).toLowerCase()))}:</strong> ${esc(list)}</div>`;
      }).join('') + `</div>`;
    }
    return html;
  }

  function renderBox() {
    const root = byId('g-box');
    const v = view;
    if (!v.away.data && !v.home.data) {
      root.innerHTML = emptyMsg('No box score available for this game.');
      return;
    }
    const btn = (team) => {
      const on = ui.boxSide === team.side;
      return `<button type="button" class="gx-seg__btn${on ? ' is-active' : ''}" data-side="${team.side}" aria-pressed="${on}">` +
        `${teamLogoCardHtml(team.id)}<span>${esc(team.nick)}</span></button>`;
    };
    const team = ui.boxSide === 'h' ? v.home : v.away;
    root.innerHTML =
      `<div class="gx-controls"><div class="gx-seg" role="group" aria-label="Choose a team">${btn(v.away)}${btn(v.home)}</div></div>` +
      teamBoxHtml(team, v);
  }

  // --------------------------------------------------------------------------
  // Team stats tab: side-by-side comparison bars + runs by inning
  // --------------------------------------------------------------------------
  const PITCH_STRIKE_RE = /strike|foul|in play|missed bunt/i;

  function sideStats(v, side) {
    const team = side === 'a' ? v.away : v.home;
    const d = team.data || {};
    const bt = batTotals(d), pt = pitTotals(d), ls = v.lsTot(side);
    const hits = numOrNull(ls[1]) !== null ? numOrNull(ls[1]) : (bt ? bt.h : null);
    return {
      runs: v.runs[side], hits, errors: numOrNull(ls[2]), lob: numOrNull(ls[3]),
      ab: bt ? bt.ab : null,
      avg: bt && bt.ab > 0 ? bt.h / bt.ab : null,
      d: bt ? bt.d : null, t: bt ? bt.t : null, hr: bt ? bt.hr : null, rbi: bt ? bt.rbi : null,
      bb: bt ? bt.bb : null, k: bt ? bt.k : null, sb: bt ? bt.sb : null,
      pUsed: pt ? pt.count : null, pK: pt ? pt.k : null, pBB: pt ? pt.bb : null,
      pH: pt ? pt.h : null, pER: pt ? pt.er : null, pHR: pt ? pt.hr : null,
    };
  }

  /** Pitch counts / speeds (by the pitching side) and batted balls (by the batting side), read from the plays. */
  function trackingOf(v) {
    const mk = () => ({ pitches: 0, strikes: 0, speeds: [] });
    const pitching = { a: mk(), h: mk() };
    const batted = { a: [], h: [] };
    let hasPitch = false, hasHit = false;
    for (const p of v.plays) {
      if (!p || (p.t !== 0 && p.t !== 1)) continue;
      const batSide = p.t === 0 ? 'a' : 'h';
      const pitSide = p.t === 0 ? 'h' : 'a';
      for (const pt of (Array.isArray(p.pt) ? p.pt : [])) {
        if (!Array.isArray(pt)) continue;
        const o = pitching[pitSide];
        o.pitches++;
        hasPitch = true;
        if (PITCH_STRIKE_RE.test(String(pt[0] || ''))) o.strikes++;
        const sp = numOrNull(pt[2]);
        if (sp !== null && sp > 0) o.speeds.push(sp);
      }
      if (Array.isArray(p.hd)) {
        const speed = numOrNull(p.hd[0]), dist = numOrNull(p.hd[2]);
        if (speed !== null || dist !== null) {
          batted[batSide].push({ speed, dist });
          hasHit = true;
        }
      }
    }
    return { pitching, batted, hasPitch, hasHit };
  }

  /** One comparison row: away value | label | home value, with a split bar underneath. */
  function statRowHtml(label, a, h, opts = {}) {
    if (a === null || a === undefined || h === null || h === undefined) return '';
    if (!Number.isFinite(a) || !Number.isFinite(h)) return '';
    const fmt = opts.fmt || ((x) => String(x));
    const lead = opts.lead || 'high';   // which side is "better": 'high' | 'low' | 'none'
    let leader = null;
    if (lead !== 'none' && a !== h) leader = ((lead === 'high') === (a > h)) ? 'a' : 'h';
    const total = a + h;
    const grow = (x) => (total > 0 ? x : 1);
    const segCls = (side) => `gx-bar__seg gx-bar__seg--${side}${leader === side ? ' is-lead' : ''}`;
    const aria = `${label}: ${fmt(a)} to ${fmt(h)}`;
    return `<div class="gx-stat">` +
      `<div class="gx-stat__row">` +
        `<span class="gx-stat__v${leader === 'a' ? ' is-lead' : ''}">${esc(fmt(a))}</span>` +
        `<span class="gx-stat__label">${esc(label)}</span>` +
        `<span class="gx-stat__v${leader === 'h' ? ' is-lead' : ''}">${esc(fmt(h))}</span>` +
      `</div>` +
      `<div class="gx-bar" role="img" aria-label="${esc(aria)}">` +
        `<span class="${segCls('a')}" style="flex:${grow(a)} 1 0;"></span>` +
        `<span class="${segCls('h')}" style="flex:${grow(h)} 1 0;"></span>` +
      `</div></div>`;
  }

  function statGroup(title, rows) {
    const html = rows.join('');
    return html ? `<h3 class="sub-heading gx-sub">${title}</h3><div class="gx-stats">${html}</div>` : '';
  }

  function runsChartHtml(v) {
    if (!v.innings) return '';
    const cols = Math.max(9, v.innings);
    const cells = [];
    let max = 3;
    for (let i = 0; i < cols; i++) {
      const row = v.inn[i] || [];
      const a = numOrNull(row[0]), h = numOrNull(row[4]);
      cells.push([a, h]);
      max = Math.max(max, a || 0, h || 0);
    }
    const GW = 46, PADX = 14, PT = 22, PB = 26, BH = 130, BW = 15;
    const W = PADX * 2 + GW * cols, CH = PT + BH + PB, y0 = PT + BH;
    let bars = '', labels = '';
    cells.forEach(([a, h], i) => {
      const gx = PADX + i * GW + GW / 2;
      const bar = (val, x, cls) => {
        if (val === null) return '';
        const height = val > 0 ? Math.max(3, (val / max) * BH) : 2;
        return `<rect class="gx-rb gx-rb--${cls}${val === 0 ? ' is-zero' : ''}" x="${x.toFixed(1)}" y="${(y0 - height).toFixed(1)}" ` +
          `width="${BW}" height="${height.toFixed(1)}" rx="2"/>` +
          (val > 0 ? `<text class="gx-rb__v" x="${(x + BW / 2).toFixed(1)}" y="${(y0 - height - 5).toFixed(1)}" text-anchor="middle">${val}</text>` : '');
      };
      bars += bar(a, gx - BW - 1, 'a') + bar(h, gx + 1, 'h');
      labels += `<text class="gx-rb__x" x="${gx.toFixed(1)}" y="${CH - 8}" text-anchor="middle">${i + 1}</text>`;
    });
    return `<div class="gx-rchart"><svg viewBox="0 0 ${W} ${CH}" style="width:100%;max-width:${Math.round(W * 1.35)}px;height:auto;" ` +
      `role="img" aria-label="Runs by inning for both teams">` +
      `<line class="gx-rb__axis" x1="${PADX}" y1="${y0}" x2="${W - PADX}" y2="${y0}"/>${bars}${labels}</svg></div>`;
  }

  function renderStats(v) {
    if (!v.away.data && !v.home.data && !v.innings && !v.plays.length) {
      return emptyMsg('No statistics available for this game.');
    }
    const A = sideStats(v, 'a'), H = sideStats(v, 'h');
    const tr = trackingOf(v);
    const row = (label, a, h, opts) => statRowHtml(label, a, h, opts);

    const avgOf = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
    const maxOf = (arr) => (arr.length ? Math.max(...arr) : null);
    const pct = (x) => `${Math.round(x * 100)}%`;
    const mph = (x) => `${x.toFixed(1)} mph`;
    const ft = (x) => `${Math.round(x)} ft`;
    const none = { lead: 'none' }, low = { lead: 'low' };

    const batting = statGroup('Batting', [
      row('Runs', A.runs, H.runs),
      row('Hits', A.hits, H.hits),
      row('Team AVG', A.avg, H.avg, { fmt: fmtAvg }),
      row('Home runs', A.hr, H.hr),
      row('Doubles', A.d, H.d),
      row('Triples', A.t, H.t),
      row('RBI', A.rbi, H.rbi),
      row('Walks', A.bb, H.bb),
      row('Strikeouts', A.k, H.k, low),
      row('Stolen bases', A.sb, H.sb),
      row('Errors', A.errors, H.errors, low),
      row('Left on base', A.lob, H.lob, none),
    ]);

    const pitching = statGroup('Pitching', [
      row('Pitchers used', A.pUsed, H.pUsed, none),
      row('Strikeouts', A.pK, H.pK),
      row('Walks allowed', A.pBB, H.pBB, low),
      row('Hits allowed', A.pH, H.pH, low),
      row('Earned runs', A.pER, H.pER, low),
      row('Home runs allowed', A.pHR, H.pHR, low),
    ]);

    let tracking = '';
    if (tr.hasPitch) {
      const pa = tr.pitching.a, ph = tr.pitching.h;
      tracking = statGroup('Pitch tracking', [
        row('Pitches thrown', pa.pitches, ph.pitches, none),
        row('Strike %', pa.pitches ? pa.strikes / pa.pitches : null, ph.pitches ? ph.strikes / ph.pitches : null, { fmt: pct }),
        row('Avg velocity', avgOf(pa.speeds), avgOf(ph.speeds), { fmt: mph, lead: 'none' }),
        row('Top velocity', maxOf(pa.speeds), maxOf(ph.speeds), { fmt: mph, lead: 'none' }),
      ]);
    }

    let contact = '';
    if (tr.hasHit) {
      const sp = (side) => tr.batted[side].filter(b => b.speed !== null).map(b => b.speed);
      const ds = (side) => tr.batted[side].filter(b => b.dist !== null && b.dist > 0).map(b => b.dist);
      const sa = sp('a'), sh = sp('h');
      contact = statGroup('Batted balls', [
        row('Balls tracked', sa.length, sh.length, none),
        row('Avg exit velocity', avgOf(sa), avgOf(sh), { fmt: mph }),
        row('Max exit velocity', maxOf(sa), maxOf(sh), { fmt: mph }),
        row('Hard hit (95+ mph)', sa.filter(x => x >= 95).length, sh.filter(x => x >= 95).length),
        row('Longest batted ball', maxOf(ds('a')), maxOf(ds('h')), { fmt: ft }),
      ]);
    }

    const legend = `<div class="gx-legend">` +
      `<span class="gx-legend__side gx-legend__side--a">${teamLogoCardHtml(v.away.id)}<span>${esc(v.away.nick)}</span></span>` +
      `<span class="gx-legend__side gx-legend__side--h"><span>${esc(v.home.nick)}</span>${teamLogoCardHtml(v.home.id)}</span>` +
    `</div>`;

    const runs = runsChartHtml(v);
    const body = (runs ? `<h3 class="sub-heading gx-sub">Runs by inning</h3>${runs}` : '') + batting + pitching + tracking + contact;
    return body ? legend + body : emptyMsg('No statistics available for this game.');
  }

  // --------------------------------------------------------------------------
  // Plays tab: filters, half-inning groups, expandable pitch sequences
  // --------------------------------------------------------------------------
  const HIT_RE = /^(single|double|triple|home run)$/i;

  function formatHit(hd) {
    if (!Array.isArray(hd)) return null;
    const speed = numOrNull(hd[0]), angle = numOrNull(hd[1]), dist = numOrNull(hd[2]);
    const parts = [];
    if (speed !== null) parts.push(`Exit velocity ${speed} mph`);
    if (angle !== null) parts.push(`Launch angle ${angle}\u00b0`);
    if (dist !== null && dist > 0) parts.push(`${dist} ft`);
    if (hd[3] !== null && hd[3] !== undefined && hd[3] !== '') parts.push(prettyKey(hd[3]));
    return parts.length ? parts.join(' \u00b7 ') : null;
  }

  function pitchTableHtml(pitches) {
    const kind = (call) => {
      const c = String(call || '');
      if (/in play/i.test(c)) return 'play';
      if (/strike|foul/i.test(c)) return 'strike';
      if (/ball|hit by pitch|pitchout/i.test(c)) return 'ball';
      return 'strike';
    };
    const rows = pitches.map((pt, i) => {
      const sp = numOrNull(pt[2]);
      return `<tr class="gx-pc--${kind(pt[0])}"><td class="num">${i + 1}</td><td>${esc(pt[0] || '\u2014')}</td>` +
        `<td>${esc(pt[1] || '\u2014')}</td><td class="num">${sp === null ? '\u2014' : fmtNum(sp, 1)}</td></tr>`;
    }).join('');
    return `<div class="gx-pitches"><table class="gx-pt"><thead><tr><th>#</th><th>Result</th><th>Pitch</th><th>mph</th></tr></thead>` +
      `<tbody>${rows}</tbody></table></div>`;
  }

  function playHtml(p, v) {
    const nameOf = (id) => (id !== null && id !== undefined && v.names[id]) ? v.names[id] : (id !== null && id !== undefined ? `Player ${id}` : null);
    const bn = nameOf(p.bt) || 'Batter';
    const pn = nameOf(p.p) || 'Pitcher';
    const ev = String(p.ev || '');
    const isHr = /^home run$/i.test(ev);
    const isHit = HIT_RE.test(ev);

    const tags = [];
    if (ev) tags.push(`<span class="gx-tag${isHr ? ' gx-tag--hr' : (isHit ? ' gx-tag--hit' : '')}">${esc(ev)}</span>`);
    if (p.sc) tags.push(`<span class="gx-tag gx-tag--sc">Scoring play</span>`);

    const pitches = Array.isArray(p.pt) ? p.pt.filter(Array.isArray) : [];
    const hit = formatHit(p.hd);
    let more = '';
    if (pitches.length || hit) {
      const sum = [pitches.length ? `${pitches.length} pitch${pitches.length === 1 ? '' : 'es'}` : null, hit ? 'Batted ball' : null]
        .filter(Boolean).join(' \u00b7 ');
      more = `<details class="gx-more" data-i="${p.i}"${ui.openPlays.has(p.i) ? ' open' : ''}><summary>${sum}</summary>` +
        (hit ? `<div class="gx-hit">${esc(hit)}</div>` : '') +
        (pitches.length ? pitchTableHtml(pitches) : '') +
        `</details>`;
    }
    const actions = Array.isArray(p.ac) && p.ac.length
      ? `<div class="gx-play__ac">${p.ac.map(a => esc(Array.isArray(a) ? a.join(' ') : String(a))).join(' \u00b7 ')}</div>` : '';

    return `<li class="gx-play${p.sc ? ' is-scoring' : ''}">` +
      `<div class="gx-play__top"><span class="gx-play__who">${playerLink(p.bt, bn)} <span class="dim">vs</span> ${playerLink(p.p, pn)}</span>` +
      `<span class="gx-play__tags">${tags.join('')}</span></div>` +
      `<div class="gx-play__desc">${esc(p.d || p.ev || '')}</div>${actions}${more}</li>`;
  }

  function renderPlays() {
    const root = byId('g-plays');
    const v = view;
    if (!v.plays.length) {
      root.innerHTML = emptyMsg('No play-by-play data available for this game.');
      return;
    }

    const innings = [...new Set(v.plays.map(p => numOrNull(p.in)).filter(x => x !== null))].sort((a, b) => a - b);
    if (ui.playInning !== 'all' && !innings.includes(Number(ui.playInning))) ui.playInning = 'all';
    const order = ui.playOrder || (v.live ? 'new' : 'old');
    const filters = [['all', 'All plays'], ['scoring', 'Scoring'], ['hits', 'Hits'], ['hr', 'Home runs']];

    const passes = (p) => {
      if (ui.playFilter === 'scoring') return !!p.sc;
      if (ui.playFilter === 'hits') return HIT_RE.test(String(p.ev || ''));
      if (ui.playFilter === 'hr') return /^home run$/i.test(String(p.ev || ''));
      return true;
    };

    const controls = `<div class="gx-controls">` +
      `<div class="gx-seg" role="group" aria-label="Filter plays">` +
        filters.map(([k, l]) => `<button type="button" class="gx-seg__btn${ui.playFilter === k ? ' is-active' : ''}" ` +
          `data-filter="${k}" aria-pressed="${ui.playFilter === k}">${l}</button>`).join('') +
      `</div>` +
      `<label class="gx-sel"><span>Inning</span><select data-inning aria-label="Inning">` +
        `<option value="all">All</option>` +
        innings.map(n => `<option value="${n}"${String(ui.playInning) === String(n) ? ' selected' : ''}>${n}</option>`).join('') +
      `</select></label>` +
      `<button type="button" class="gx-seg__btn gx-order" data-order="${order === 'new' ? 'old' : 'new'}">` +
        `${order === 'new' ? 'Newest first \u2193' : 'Oldest first \u2191'}</button>` +
    `</div>`;

    let list = v.plays.filter(passes);
    if (ui.playInning !== 'all') list = list.filter(p => Number(p.in) === Number(ui.playInning));
    if (!list.length) {
      root.innerHTML = controls + emptyMsg('No plays match this filter.');
      return;
    }

    // plays are in game order, so each half-inning is one run of neighbours
    const groups = [];
    let cur = null;
    for (const p of list) {
      const key = `${p.in}-${p.t}`;
      if (!cur || cur.key !== key) { cur = { key, inning: p.in, t: p.t, items: [] }; groups.push(cur); }
      cur.items.push(p);
    }
    if (order === 'new') { groups.reverse(); groups.forEach(g => g.items.reverse()); }

    const html = groups.map((g) => {
      const bat = g.t === 0 ? v.away : v.home;
      const inning = numOrNull(g.inning);
      const after = v.innings > 0 && inning !== null ? scoreAfter(v, inning, g.t) : null;
      return `<div class="gx-sum">` +
        `<div class="gx-half"><span class="gx-half__title">${teamLogoCardHtml(bat.id)}` +
          `<span>${esc(halfLabel(g.t, g.inning))}</span><span class="gx-half__sub">${esc(bat.nick)} batting</span></span>` +
          `${after ? scoreTagHtml(v, after[0], after[1]) : ''}</div>` +
        `<ul class="gx-plays">${g.items.map(p => playHtml(p, v)).join('')}</ul></div>`;
    }).join('');

    root.innerHTML = controls +
      `<p class="tab-note">${list.length === v.plays.length ? `${list.length} plays` : `${list.length} of ${v.plays.length} plays`}</p>` + html;
  }

  // --------------------------------------------------------------------------
  // Win probability tab
  // The homeTeamWinProbability scale (0-1 vs 0-100) was never independently
  // confirmed in this project, so it normalises automatically: if any value
  // exceeds 1 the data is already 0-100, otherwise it is scaled up.
  // When the probability list lines up one-to-one with the plays, the chart also
  // shows inning markers, dots on scoring plays and the play behind each point.
  // --------------------------------------------------------------------------
  function renderWinProb() {
    const root = byId('g-winprob');
    const v = view, game = current;
    const pts = (Array.isArray(game.wp) ? game.wp : []).filter(p => Array.isArray(p) && numOrNull(p[1]) !== null);
    if (pts.length < 2) {
      root.innerHTML = emptyMsg('No win probability data available for this game.');
      return;
    }

    const maxRaw = Math.max(...pts.map(p => Number(p[1])));
    const scale = maxRaw > 1 ? 1 : 100;
    const vals = pts.map(p => Number(p[1]) * scale);   // home team win probability, 0-100
    const n = pts.length;
    const maxIdx = Math.max(...pts.map(p => Number(p[0])));
    const aligned = v.plays.length > 0 && Number.isInteger(maxIdx) && maxIdx + 1 === v.plays.length;
    const playAt = (k) => (aligned ? (v.plays[Number(pts[k][0])] || null) : null);

    const W = 720, H = 300, PL = 46, PR = 14, PT = 16, PB = 30;
    const xFor = (k) => PL + (k / (n - 1)) * (W - PL - PR);
    const yFor = (p) => PT + (1 - p / 100) * (H - PT - PB);
    const yMid = yFor(50);
    const f1 = (x) => x.toFixed(1);

    const line = vals.map((p, k) => `${k === 0 ? 'M' : 'L'}${f1(xFor(k))} ${f1(yFor(p))}`).join(' ');
    const area = `${line} L${f1(xFor(n - 1))} ${f1(yMid)} L${f1(xFor(0))} ${f1(yMid)} Z`;

    let grid = '';
    for (const p of [100, 75, 50, 25, 0]) {
      const y = yFor(p);
      const lab = p === 50 ? '50%' : `${p > 50 ? p : 100 - p}%`;
      const side = p === 50 ? '' : (p > 50 ? ' wp-lab--h' : ' wp-lab--a');
      grid += `<line class="wp-grid${p === 50 ? ' wp-grid--mid' : ''}" x1="${PL}" y1="${f1(y)}" x2="${W - PR}" y2="${f1(y)}"/>` +
        `<text class="wp-lab${side}" x="${PL - 8}" y="${f1(y + 4)}" text-anchor="end">${lab}</text>`;
    }

    let axis = '';
    if (aligned) {
      const posByPlay = new Map(pts.map((p, k) => [Number(p[0]), k]));
      const starts = [];
      const seen = new Set();
      v.plays.forEach((p, i) => {
        const inn = numOrNull(p.in);
        if (inn === null || seen.has(inn) || !posByPlay.has(i)) return;
        seen.add(inn);
        starts.push([inn, posByPlay.get(i)]);
      });
      starts.forEach(([inn, k], j) => {
        const x0 = xFor(k);
        const x1 = j + 1 < starts.length ? xFor(starts[j + 1][1]) : xFor(n - 1);
        if (j > 0) axis += `<line class="wp-inn" x1="${f1(x0)}" y1="${PT}" x2="${f1(x0)}" y2="${H - PB}"/>`;
        axis += `<text class="wp-axis" x="${f1((x0 + x1) / 2)}" y="${H - 10}" text-anchor="middle">${inn}</text>`;
      });
    } else {
      axis = `<text class="wp-axis" x="${PL}" y="${H - 10}" text-anchor="start">Start</text>` +
        `<text class="wp-axis" x="${W - PR}" y="${H - 10}" text-anchor="end">${v.live ? 'Now' : 'End'}</text>`;
    }

    let dots = '';
    if (aligned) {
      vals.forEach((p, k) => {
        const pl = playAt(k);
        if (pl && pl.sc) dots += `<circle class="wp-sc" cx="${f1(xFor(k))}" cy="${f1(yFor(p))}" r="3.2"/>`;
      });
    }

    const svg = `<svg class="wp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.home.nick)} win probability over the course of the game">` +
      `<defs><clipPath id="wp-clip-h"><rect x="0" y="0" width="${W}" height="${f1(yMid)}"/></clipPath>` +
      `<clipPath id="wp-clip-a"><rect x="0" y="${f1(yMid)}" width="${W}" height="${f1(H - yMid)}"/></clipPath></defs>` +
      grid + axis +
      `<path class="wp-area wp-area--h" d="${area}" clip-path="url(#wp-clip-h)"/>` +
      `<path class="wp-area wp-area--a" d="${area}" clip-path="url(#wp-clip-a)"/>` +
      `<path class="wp-line" d="${line}"/>${dots}` +
      `<line class="wp-cross" x1="0" y1="${PT}" x2="0" y2="${H - PB}" visibility="hidden"/>` +
      `<circle class="wp-dot" cx="0" cy="0" r="5" visibility="hidden"/>` +
      `<rect class="wp-hit" x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}"/></svg>`;

    // numbers under the chart
    const body = vals.length > 2 ? vals.slice(0, -1) : vals;   // the last point is the game ending (100% / 0%)
    const peakHome = Math.max(...body), peakAway = 100 - Math.min(...body);
    const deltas = [];
    let flips = 0;
    for (let k = 1; k < n; k++) {
      deltas.push({ k, d: vals[k] - vals[k - 1] });
      if ((vals[k - 1] - 50) * (vals[k] - 50) < 0) flips++;
    }
    const biggest = deltas.reduce((m, x) => (!m || Math.abs(x.d) > Math.abs(m.d) ? x : m), null);
    const kpi = (val, label) => `<div class="gx-kpi"><div class="gx-kpi__v">${val}</div><div class="gx-kpi__l">${label}</div></div>`;
    const kpis = `<div class="gx-kpis gx-kpis--4">` +
      kpi(`${Math.round(peakHome)}%`, `${esc(v.home.nick)} peak`) +
      kpi(`${Math.round(peakAway)}%`, `${esc(v.away.nick)} peak`) +
      kpi(biggest ? `${Math.abs(biggest.d).toFixed(1)}%` : '\u2014', 'Biggest swing') +
      kpi(String(flips), 'Favorite changed') +
    `</div>`;

    let moments = '';
    if (aligned) {
      const top = deltas.slice().sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5);
      const items = top.map(({ k, d }) => {
        const pl = playAt(k);
        if (!pl) return '';
        const team = d > 0 ? v.home : v.away;
        return `<li class="gx-moment"><span class="gx-moment__delta gx-moment__delta--${team.side}">+${Math.abs(d).toFixed(1)}%</span>` +
          `<div class="gx-moment__body"><div class="gx-moment__when">${teamLogoCardHtml(team.id)}` +
            `<span>${esc(halfLabel(pl.t, pl.in))}</span><span class="gx-half__sub">${esc(team.nick)} gain</span></div>` +
          `<div class="gx-moment__desc">${esc(pl.d || pl.ev || '')}</div></div></li>`;
      }).join('');
      if (items) moments = section('Biggest swings', `<ol class="gx-moments">${items}</ol>`);
    }

    root.innerHTML =
      `<div class="gx-legend wp-legend">` +
        `<span class="gx-legend__side"><i class="wp-sw wp-sw--h"></i>${teamLogoCardHtml(v.home.id)}<span>${esc(v.home.nick)} <em>(top)</em></span></span>` +
        `<span class="gx-legend__side"><i class="wp-sw wp-sw--a"></i>${teamLogoCardHtml(v.away.id)}<span>${esc(v.away.nick)} <em>(bottom)</em></span></span>` +
      `</div>` +
      `<div class="wp-wrap">${svg}<div class="wp-tip" hidden></div></div>` +
      `<p class="tab-note" style="margin-top:8px;">${aligned ? 'Dots mark scoring plays. ' : ''}Hover or drag across the chart for details.</p>` +
      kpis + moments;

    // hover / touch scrubbing
    const svgEl = root.querySelector('.wp-svg');
    const hit = root.querySelector('.wp-hit');
    const tip = root.querySelector('.wp-tip');
    const cross = root.querySelector('.wp-cross');
    const dot = root.querySelector('.wp-dot');
    if (!svgEl || !hit || !tip || !cross || !dot) return;

    function hideTip() {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
    }
    function showTip(ev) {
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return;
      const x = (ev.clientX - rect.left) * (W / rect.width);
      const k = Math.max(0, Math.min(n - 1, Math.round(((x - PL) / (W - PL - PR)) * (n - 1))));
      const px = xFor(k), py = yFor(vals[k]);
      cross.setAttribute('x1', f1(px)); cross.setAttribute('x2', f1(px)); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', f1(px)); dot.setAttribute('cy', f1(py)); dot.setAttribute('visibility', 'visible');

      const pl = playAt(k);
      const home = vals[k], away = 100 - vals[k];
      tip.innerHTML =
        (pl ? `<strong>${esc(halfLabel(pl.t, pl.in))}</strong>` : '') +
        `<span class="wp-tip__row"><i class="wp-sw wp-sw--h"></i>${esc(v.home.nick)} ${home.toFixed(1)}%</span>` +
        `<span class="wp-tip__row"><i class="wp-sw wp-sw--a"></i>${esc(v.away.nick)} ${away.toFixed(1)}%</span>` +
        (pl && (pl.d || pl.ev) ? `<em>${esc(String(pl.d || pl.ev).slice(0, 140))}</em>` : '');
      tip.hidden = false;
      const wrapW = rect.width;
      const left = (px / W) * wrapW - tip.offsetWidth / 2;
      tip.style.left = `${Math.max(4, Math.min(left, wrapW - tip.offsetWidth - 4))}px`;
    }
    hit.addEventListener('pointermove', showTip);
    hit.addEventListener('pointerdown', showTip);
    hit.addEventListener('pointerleave', hideTip);
  }

  main();

}

// ---- dispatcher: run only the one page that's actually loaded ----
(function dispatch() {
  if (document.getElementById('standings-heading')) { runIndexPage(); return; }
  if (document.getElementById('league-heading')) { runLeaguePage(); return; }
  if (document.getElementById('team-name')) { runTeamPage(); return; }
  if (document.getElementById('team-grid')) { runTeamsPage(); return; }
  if (document.getElementById('player-name')) { runPlayerPage(); return; }
  if (document.getElementById('player-grid')) { runPlayersPage(); return; }
  if (document.getElementById('manager-name')) { runManagerPage(); return; }
  if (document.getElementById('manager-grid')) { runManagersPage(); return; }
  if (document.getElementById('ballpark-name')) { runBallparkPage(); return; }
  if (document.getElementById('ballpark-grid')) { runBallparksPage(); return; }
  if (document.getElementById('standings-title')) { runStandingsPage(); return; }
  if (document.getElementById('scores-table')) { runScoresPage(); return; }
  if (document.getElementById('roster-title')) { runRosterPage(); return; }
  if (document.getElementById('postseason-title')) { runPostseasonPage(); return; }
  if (document.getElementById('awards-title')) { runAwardsPage(); return; }
  if (document.getElementById('draft-title')) { runDraftPage(); return; }
  if (document.getElementById('tx-title')) { runTransactionsPage(); return; }
  if (document.getElementById('leader-controls')) { runLeadersPage(); return; }
  if (document.getElementById('game-matchup')) { runGamePage(); return; }
})();
