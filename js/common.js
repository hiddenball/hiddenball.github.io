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
export function loadManifest() {
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
export function seasonBaseUrl(manifest, year) {
  const y = String(year);
  const repo = manifest.seasons[y] || (Number(year) >= manifest.current.from_year ? manifest.current.repo : null);
  if (!repo) return null;
  return manifest.season_repos[repo] || manifest.current.url;
}

/** Base CDN URL for the core repo (players/teams/managers/ballparks). */
export function coreBaseUrl(manifest) {
  return manifest.core.url;
}

/**
 * Fetches JSON and returns null on 404 (a legitimately absent file, e.g. a
 * team that didn't exist that year) instead of throwing, so callers can
 * skip missing years cleanly. Any other failure still throws.
 */
export async function fetchJSONOrNull(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

export async function fetchCoreRecord(manifest, folder, id) {
  const url = `${coreBaseUrl(manifest)}/data/${folder}/${id}.json`;
  return fetchJSONOrNull(url);
}

export async function fetchSeasonFile(manifest, year, filename) {
  const base = seasonBaseUrl(manifest, year);
  if (!base) return null;
  return fetchJSONOrNull(`${base}/data/seasons/${year}/${filename}`);
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

export function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function fmtOrDash(v) {
  return v === null || v === undefined || v === '' ? '—' : v;
}

/** .300 style average from a 0-1 decimal, MLB convention drops the leading 0. */
export function fmtAvg(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.');
}

export function fmtNum(v, digits = 0) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return Number.isNaN(n) ? '—' : n.toFixed(digits);
}

export function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.className = 'state-msg' + (isError ? ' state-msg--error' : '');
  el.hidden = false;
}

export function clearStatus(el) {
  el.hidden = true;
  el.textContent = '';
}

/** Groups an array of stat rows by a key, preserving first-seen order. */
export function groupBy(rows, keyFn) {
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
export function createTeamNameResolver(manifest) {
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
export async function fetchLatestAvailable(manifest, filename, { startYear, floorYear = 1980 } = {}) {
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
export async function fetchCoreIndex(manifest, name) {
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
 *   maxRender    - cap on rendered cards (default 100)
 *   emptyMessage - shown when a search matches nothing
 */
export function initEntityBrowser({ entries, containerEl, searchEl, hrefFor, maxRender = 100, emptyMessage = 'No matches.' }) {
  function render(query) {
    const q = (query || '').trim().toLowerCase();
    const matches = q ? entries.filter(e => e.name.toLowerCase().includes(q)) : entries;
    const shown = matches.slice(0, maxRender);

    if (shown.length === 0) {
      containerEl.innerHTML = `<p class="state-msg" style="padding:12px 0;">${emptyMessage}</p>`;
      return;
    }

    containerEl.innerHTML = shown.map(e => `
      <a class="entity-card" href="${hrefFor(e)}">
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
export function setImgWithFallback(imgEl, primarySrc, fallbackSrc) {
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
export function setHeroBanner(heroEl, bannerSrc) {
  heroEl.style.backgroundImage =
    `linear-gradient(rgba(10,14,20,0.55), rgba(10,14,20,0.88)), url("${bannerSrc}")`;
}
