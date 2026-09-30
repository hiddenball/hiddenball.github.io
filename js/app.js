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
 */
async function fetchLatestAvailable(manifest, filename, { startYear, floorYear = 1980 } = {}) {
  let year = startYear || new Date().getFullYear();
  while (year >= floorYear) {
    try {
      const data = await fetchSeasonFile(manifest, year, filename);
      if (data) return { year, data };
    } catch (_) { /* try the previous year */ }
    year--;
  }
  return null;
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
const NON_REGULAR_GAME_TYPES = new Set(['F', 'D', 'L', 'W', 'S', 'E', 'A', 'P', 'I']);

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Fallback for seasons that have no schedule.json in the data repos (the
 * current season). Asks MLB's public schedule API for the regular season and
 * converts each finished game into the same shape schedule.json uses, so
 * buildLastFive() treats both sources identically. gamePk is the same id the
 * game pages use. Throws on any network / HTTP problem.
 */
async function fetchScheduleFromStatsApi(year) {
  const fields = 'dates,games,gamePk,gameDate,gameType,status,detailedState,teams,away,home,team,id,score';
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${encodeURIComponent(year)}` +
    `&gameType=R&fields=${fields}`;
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

/** One "Last 5" table cell. state = { status: 'pending'|'unavailable'|'ready', byTeam, names } */
function lastFiveCellHtml(teamId, year, state) {
  if (!state || state.status === 'pending') return `<td class="l5-cell"><span class="dim">…</span></td>`;
  const list = state.status === 'ready' ? state.byTeam.get(String(teamId)) : null;
  if (!list || list.length === 0) return `<td class="l5-cell"><span class="dim">—</span></td>`;

  const chips = list.map(r => {
    const opp = state.names.get(String(r.oppId)) || `Team ${r.oppId}`;
    const day = new Date(r.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    const label = `${r.outcome} ${r.us}\u2013${r.them} ${r.home ? 'vs.' : '@'} ${opp}, ${day}`;
    const cls = r.outcome === 'W' ? 'l5--w' : r.outcome === 'L' ? 'l5--l' : 'l5--t';
    return `<a class="l5 ${cls}" href="game.html?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}" ` +
      `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${r.outcome}</a>`;
  }).join('');
  return `<td class="l5-cell"><span class="l5-strip">${chips}</span></td>`;
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

function standingsHeaderHtml(key, sort) {
  if (key === 'last5') return '<th class="l5-col">Last 5</th>';
  const active = sort.key === key;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = active ? `<span class="sort-arrow" aria-hidden="true">${sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>` : '';
  return `<th class="sortable" aria-sort="${ariaSort}">` +
    `<button type="button" class="sort-btn" data-sort="${key}" title="Sort by ${STANDINGS_TITLES[key]}">` +
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
 * Without opts.extended the table is the plain Team / W / L / Pct / GB layout
 * (standings.html relies on that).
 */
function standingsTableHtml(teams, year, opts = {}) {
  const extended = !!opts.extended;
  const sort = opts.sort || STANDINGS_DEFAULT_SORT;
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

  const groups = new Map([['East', []], ['Central', []], ['West', []], ['Other', []]]);
  for (const t of teams) {
    groups.get(divisionFor(t.id, year) || 'Other').push(t);
  }

  let html = '';
  for (const [division, rows] of groups) {
    if (rows.length === 0) continue;
    html += `<div class="division-label">${division}</div>`;
    html += `<div class="table-scroll"><table class="ledger${extended ? ' ledger--standings' : ''}"><thead><tr>` +
      `<th class="left">Team</th>${columns.map(k => standingsHeaderHtml(k, sort)).join('')}` +
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
    for (const teams of byLeague.values()) {
      teams.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    }

    // team id -> name, used for the hover text on each last-five result
    const names = new Map();
    for (const t of result.data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);

    // rank + playoff spots are worked out once from the full season list (both leagues)
    const spots = computePlayoffSpots(result.data.teams, result.year);
    let sortState = STANDINGS_DEFAULT_SORT;

    const verticalMql = window.matchMedia(VERTICAL_SCREEN_QUERY);
    let currentLast5 = { status: 'pending' };

    function render(last5) {
      currentLast5 = last5;
      let html = '';
      if (last5.status === 'unavailable') {
        html += `<p class="l5-note">Last 5 results couldn't be loaded for ${result.year}.</p>`;
      }
      for (const [lg, teams] of byLeague) {
        html += `<h3 class="league-heading" style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
          color:var(--text-secondary);margin:18px 0 8px;">${leagueLogoCardHtml(lg)}<span>${LEAGUE_NAMES[lg] || `League ${lg}`}</span></h3>`;
        html += standingsTableHtml(teams, result.year, { extended: true, last5, vertical: verticalMql.matches, spots, sort: sortState });
      }
      wrap.innerHTML = html;
    }

    // Click a column header to sort by it; click again to reverse.
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn || !wrap.contains(btn)) return;
      sortState = nextStandingsSort(sortState, btn.dataset.sort);
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

    let schedule = null;
    try {
      schedule = await fetchSeasonFile(manifest, result.year, 'schedule.json');
    } catch (_) { /* fall through to the MLB schedule API below */ }

    // No schedule.json for this season (the current season): use MLB's schedule API instead.
    if (!Array.isArray(schedule)) {
      try {
        schedule = await fetchScheduleFromStatsApi(result.year);
      } catch (_) { schedule = null; }
    }

    if (Array.isArray(schedule) && schedule.length > 0) {
      render({ status: 'ready', byTeam: buildLastFive(schedule), names });
    } else {
      render({ status: 'unavailable' });
    }
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
        <td class="left">${teamLinkHtml(g.awayTeamId, awayName)}</td>
        <td class="left">${teamLinkHtml(g.homeTeamId, homeName)}</td>
        <td class="num"><a href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a></td>
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
    loadRecentGames(manifest, id);
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
   * Last five finished regular-season games for this team, newest first. Each
   * card shows the OPPONENT's logo with this team's score underneath
   * (this team's runs first): green if this team won, red if it lost.
   * Starts at the current year and walks back until a season has games for
   * this team (early in a year, or for a defunct franchise, the newest season
   * may have none). Seasons with no schedule.json (the current one) fall back
   * to MLB's schedule API, same as the index page's Last 5 column.
   */
  async function loadRecentGames(manifest, teamId) {
    const statusEl2 = document.getElementById('recent-status');
    const grid = document.getElementById('recent-games');
    const heading = document.getElementById('recent-heading');
    setStatus(statusEl2, 'Loading recent games\u2026');

    try {
      const thisYear = new Date().getFullYear();
      let found = null;

      for (let y = thisYear; y >= 1980; y--) {
        let schedule = null;
        try {
          schedule = await fetchSeasonFile(manifest, y, 'schedule.json');
        } catch (_) { /* fall through to the MLB schedule API below */ }

        if (!Array.isArray(schedule) && y >= thisYear - 1) {
          try {
            schedule = await fetchScheduleFromStatsApi(y);
          } catch (_) { schedule = null; }
        }

        if (Array.isArray(schedule) && schedule.length > 0) {
          const list = buildLastFive(schedule).get(String(teamId));
          if (list && list.length > 0) { found = { year: y, list }; break; }
        }
      }

      if (!found) {
        setStatus(statusEl2, 'No completed games found for this team in the archive.');
        return;
      }

      const resolveTeamName = createTeamNameResolver(manifest);
      const games = found.list.slice().reverse(); // newest first
      const names = await Promise.all(games.map(r => resolveTeamName(r.oppId)));

      grid.innerHTML = games.map((r, i) => {
        const oppName = names[i];
        const cls = r.outcome === 'W' ? 'rg--w' : r.outcome === 'L' ? 'rg--l' : 'rg--t';
        const verb = r.outcome === 'W' ? 'Won' : r.outcome === 'L' ? 'Lost' : 'Tied';
        const day = new Date(r.date).toLocaleDateString('en-US',
          { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
        const label = `${verb} ${r.us}\u2013${r.them} ${r.home ? 'vs.' : '@'} ${oppName}, ${day}`;
        const href = `game.html?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(found.year)}`;
        return `<a class="rg-card ${cls}" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
          `<span class="rg-logo">` +
            `<img src="assets/logos/${encodeURIComponent(r.oppId)}.webp" alt="" ` +
              `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
            `<span class="rg-logo__fb" hidden>${escapeHtml(shortTeamName(oppName))}</span>` +
          `</span>` +
          `<span class="rg-score">${r.us}&ndash;${r.them}</span>` +
        `</a>`;
      }).join('');

      heading.textContent = `Last 5 games \u2014 ${found.year} season`;
      clearStatus(statusEl2);
      grid.hidden = false;
    } catch (err) {
      setStatus(statusEl2, `Couldn't load recent games (${err.message}).`, true);
    }
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

  let sortState = STANDINGS_DEFAULT_SORT;
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
      html += standingsTableHtml(teams, year, { spots, sort: sortState });
    }

    wrap.innerHTML = html;
  }

  // Click a column header to sort by it; click again to reverse.
  document.getElementById('standings-body-wrap').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn || !shown) return;
    sortState = nextStandingsSort(sortState, btn.dataset.sort);
    renderStandings(shown.data, shown.year);
  });

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

  async function main() {
    const gamePk = qs('id');
    let year = qs('year');

    if (!gamePk) {
      setStatus(statusEl, 'A game id is required, e.g. game.html?id=413649&year=2015', true);
      return;
    }

    let manifest, game;
    try {
      manifest = await loadManifest();
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

    if (!game) {
      setStatus(statusEl, `No game found with id "${gamePk}"${year ? ` in ${year}` : ''}.`, true);
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

    if (away) setImgWithFallback(document.getElementById('hdr-logo-away'), `assets/logos/${away.id}.webp`);
    if (home) setImgWithFallback(document.getElementById('hdr-logo-home'), `assets/logos/${home.id}.webp`);
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

    if (away) setImgWithFallback(document.getElementById('ls-logo-away'), `assets/logos/${away.id}.webp`);
    if (home) setImgWithFallback(document.getElementById('ls-logo-home'), `assets/logos/${home.id}.webp`);
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
    setImgWithFallback(document.getElementById(`${logoIdPrefix}-header`), `assets/logos/${team.id}.webp`);
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
        setImgWithFallback(document.getElementById(`pbp-logo-${idx}`), `assets/logos/${team.id}.webp`);
      }
    });
  }

  main();

}

// ---- dispatcher: run only the one page that's actually loaded ----
(function dispatch() {
  if (document.getElementById('games-heading')) { runIndexPage(); return; }
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
