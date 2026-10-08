const MANIFEST_URL = 'https://cdn.jsdelivr.net/gh/hiddenball/mlb-data-core@main/manifest.json';
const MANIFEST_CACHE_KEY = 'mlb-archive:manifest';
const MANIFEST_CACHE_MAX_AGE_MS = 1000 * 60 * 60;
let manifestPromise = null;
function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const cached = localStorage.getItem(MANIFEST_CACHE_KEY);
      if (cached) {
        const { at, data } = JSON.parse(cached);
        if (Date.now() - at < MANIFEST_CACHE_MAX_AGE_MS) return data;
      }
    } catch (_) { }
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Could not load manifest.json (${res.status})`);
    const data = await res.json();
    try {
      localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    } catch (_) { }
    return data;
  })();
  return manifestPromise;
}
function seasonBaseUrl(manifest, year) {
  const y = String(year);
  const repo = manifest.seasons[y] || (Number(year) >= manifest.current.from_year ? manifest.current.repo : null);
  if (!repo) return null;
  return manifest.season_repos[repo] || manifest.current.url;
}
function coreBaseUrl(manifest) {
  return manifest.core.url;
}
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
function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}
function gameHref(g) {
  const year = g.season || (g.date ? String(g.date).slice(0, 4) : '');
  return `/game/?id=${g.gamePk}&year=${year}`;
}
function fmtDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate).trim());
  return d.toLocaleDateString('en-US', dateOnly
    ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }
    : { year: 'numeric', month: 'long', day: 'numeric' });
}
function fmtClock24(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function to24hText(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\b(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?/g, (m, h, min, ap) => {
      let hh = Number(h) % 12;
      if (/p/i.test(ap)) hh += 12;
      return `${String(hh).padStart(2, '0')}:${min}`;
    });
}
function fmtGameTime(isoDate) {
  if (!isoDate || !/T\d\d:\d\d/.test(String(isoDate))) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return fmtClock24(d);
}
function fmtGameDay(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtOrDash(v) {
  return v === null || v === undefined || v === '' ? '—' : v;
}
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
const LOADER_SVG =
  '<svg viewBox="28 22 44 70" role="img" aria-label="Loading" focusable="false">' +
    '<ellipse class="ldr-shadow" cx="50" cy="87" rx="15" ry="2.6"/>' +
    '<g class="ldr-fly"><g class="ldr-squash"><g class="ldr-spin"><g transform="scale(.62)">' +
      '<path class="ldr-ball" transform="translate(-65 -123)" d="M89.862,125.614c-.022.209-.068.411-.094.619-.085.65-.174,1.3-.308,1.933-.04.189-.1.371-.144.558-.153.647-.313,1.291-.516,1.917-.044.138-.1.27-.149.407-.229.67-.474,1.332-.757,1.975-.037.083-.081.162-.118.245-.313.69-.649,1.368-1.022,2.023-.02.036-.044.07-.064.105-.4.7-.83,1.374-1.293,2.025l-.008.011a25.313,25.313,0,0,1-3.266,3.748c-.463.436-.933.865-1.428,1.265a25.189,25.189,0,0,1-2.835,1.963c-.227.137-.448.283-.679.413-.361.2-.737.383-1.109.568-.31.154-.619.31-.937.451-.351.156-.71.3-1.069.438s-.727.277-1.1.4q-.511.173-1.032.324c-.416.12-.837.226-1.262.324-.322.075-.642.152-.968.214-.5.094-1,.165-1.5.229-.271.035-.539.081-.813.107-.788.075-1.584.121-2.391.121s-1.627-.046-2.426-.122c-.3-.029-.583-.082-.876-.12-.492-.065-.985-.131-1.468-.224-.363-.071-.718-.162-1.076-.249-.393-.094-.786-.189-1.172-.3s-.79-.25-1.18-.387c-.322-.112-.644-.227-.96-.351q-.635-.251-1.251-.536-.388-.178-.768-.37c-.443-.223-.88-.454-1.307-.7-.195-.113-.385-.232-.577-.35-.462-.285-.919-.576-1.361-.889-.122-.086-.238-.179-.358-.268-.49-.361-.974-.73-1.436-1.124-.49-.419-.974-.845-1.43-1.3a25.053,25.053,0,0,1-5.337-7.866c-.013-.031-.031-.06-.044-.091-.284-.668-.528-1.357-.754-2.053-.027-.084-.065-.164-.091-.249-.2-.648-.362-1.313-.511-1.982-.032-.141-.078-.276-.108-.419-.132-.643-.219-1.3-.3-1.963-.022-.176-.062-.347-.08-.524a25.34,25.34,0,0,1,0-5.119c.018-.177.058-.348.08-.524.081-.66.168-1.319.3-1.963.029-.142.076-.277.108-.419.149-.669.309-1.335.511-1.982.026-.085.064-.165.091-.249.226-.7.47-1.385.754-2.053.013-.031.031-.06.044-.091a25.05,25.05,0,0,1,5.337-7.866c.456-.455.94-.881,1.43-1.3.462-.395.946-.763,1.436-1.124.12-.088.236-.181.358-.268.441-.313.9-.6,1.361-.889.192-.118.382-.237.577-.35.427-.248.865-.479,1.307-.7q.381-.191.768-.37.617-.284,1.251-.536c.316-.125.638-.239.96-.351.39-.136.781-.27,1.18-.386s.779-.207,1.172-.3c.357-.086.713-.178,1.076-.248.483-.093.975-.159,1.468-.224.292-.039.58-.092.876-.12C63.373,98.046,64.181,98,65,98s1.634.045,2.436.123c.312.03.616.087.925.129.477.064.954.126,1.422.217.393.077.776.177,1.162.272.363.089.728.174,1.084.279.439.13.87.279,1.3.431.28.1.56.2.835.306.473.188.938.392,1.4.607.207.1.413.195.616.3.5.251.99.517,1.47.8.139.082.276.167.413.251.52.321,1.03.654,1.524,1.011.073.053.143.108.216.161.538.4,1.064.81,1.568,1.248s.974.86,1.43,1.322a25.124,25.124,0,0,1,4.235,5.731l.012.024q.559,1.042,1.022,2.14c.034.08.057.165.09.246.27.663.522,1.337.736,2.027.061.2.1.405.156.605.165.584.329,1.168.451,1.768.077.379.117.771.176,1.156.068.435.153.865.2,1.307a25.044,25.044,0,0,1-.009,5.155Zm-40.02-18.533a21.939,21.939,0,0,0,0,31.838c.268-.245.527-.508.779-.781l-1.439-.958c-.244-.162-.237-.508.015-.773a.748.748,0,0,1,.9-.185l1.375.915a18.841,18.841,0,0,0,1.406-2.108l-1.56-.283a.5.5,0,0,1-.315-.712.725.725,0,0,1,.742-.52l1.78.323a21.977,21.977,0,0,0,1.053-2.5l-1.266.091c-.3.021-.518-.252-.5-.609a.706.706,0,0,1,.576-.686l1.6-.115a24.978,24.978,0,0,0,.6-2.628l-1.25.09c-.3.021-.518-.251-.5-.609a.706.706,0,0,1,.576-.686l1.377-.1c.091-.787.15-1.589.171-2.4l-1.448.486a.525.525,0,0,1-.644-.465.688.688,0,0,1,.372-.806l1.72-.577c-.021-.814-.093-1.607-.189-2.388l-1.379.311c-.285.064-.525-.225-.536-.647a.855.855,0,0,1,.5-.879l1.193-.269c-.14-.767-.3-1.522-.5-2.253l-1.458.5a.521.521,0,0,1-.65-.46.706.706,0,0,1,.389-.814l1.363-.465a22.133,22.133,0,0,0-.969-2.451l-.7.678a.71.71,0,0,1-.958-.087.637.637,0,0,1-.1-.914l1.061-1.025c-.261-.459-.535-.9-.825-1.324l-1.02,1.021a.676.676,0,0,1-.935-.088.659.659,0,0,1-.1-.924l1.173-1.174A15.22,15.22,0,0,0,49.842,107.081ZM65,101a21.894,21.894,0,0,0-13.764,4.852,17.629,17.629,0,0,1,1.44,1.513l1.93-.375a.71.71,0,0,1,.743.516.519.519,0,0,1-.329.724l-1.47.286a21.179,21.179,0,0,1,1.442,2.321l1.772-.344a.71.71,0,0,1,.743.516.519.519,0,0,1-.329.725l-1.578.306a24.4,24.4,0,0,1,1.108,2.884l1.653-.239a.919.919,0,0,1,.88.631c.152.4,0,.758-.329.806l-1.783.258c.195.759.352,1.54.483,2.333l1.661.1a.691.691,0,0,1,.579.683.531.531,0,0,1-.513.618l-1.543-.092c.088.759.153,1.528.172,2.315l1.67.56a.688.688,0,0,1,.372.806.525.525,0,0,1-.644.465l-1.4-.47c-.023.895-.093,1.773-.2,2.636a.39.39,0,0,1,.079.027l1.778,1.162a.677.677,0,0,1,.141.871.536.536,0,0,1-.747.29l-1.476-.964a26.292,26.292,0,0,1-.623,2.657l1.675,1.095a.677.677,0,0,1,.141.871.536.536,0,0,1-.747.29l-1.466-.958a23.7,23.7,0,0,1-1.21,2.856l1.371,1a.876.876,0,0,1,.153,1.045c-.18.385-.541.54-.806.348l-1.445-1.051a21.34,21.34,0,0,1-1.409,2.106l1.211.792a.677.677,0,0,1,.141.871.536.536,0,0,1-.747.29l-1.434-.938a16,16,0,0,1-1.114,1.161,21.919,21.919,0,0,0,27.088.329,18.2,18.2,0,0,1-1.507-1.741l-1.407.274a.709.709,0,0,1-.741-.516A.52.52,0,0,1,75,137.77l1-.195a22,22,0,0,1-1.329-2.342l-1.411.275a.709.709,0,0,1-.741-.516.52.52,0,0,1,.328-.724l1.263-.246a25.356,25.356,0,0,1-1.016-2.913l-1.428.207a.917.917,0,0,1-.877-.631c-.152-.4,0-.758.328-.806l1.6-.232c-.176-.771-.315-1.563-.429-2.367l-1.529-.091a.691.691,0,0,1-.577-.683.531.531,0,0,1,.512-.618l1.442.086c-.071-.764-.121-1.536-.125-2.326l-1.615-.543a.689.689,0,0,1-.371-.806.524.524,0,0,1,.642-.465l1.393.469c.037-.891.119-1.765.235-2.623a.4.4,0,0,1-.115-.039L70.4,118.477a.679.679,0,0,1-.141-.871.534.534,0,0,1,.745-.29l1.522,1a26.912,26.912,0,0,1,.645-2.641l-1.745-1.144a.679.679,0,0,1-.141-.871.534.534,0,0,1,.745-.29l1.547,1.014a23.942,23.942,0,0,1,1.222-2.838l-1.467-1.07a.878.878,0,0,1-.152-1.045c.18-.384.54-.54.8-.348l1.55,1.131a21.155,21.155,0,0,1,1.424-2.1l-1.335-.875a.679.679,0,0,1-.141-.871.534.534,0,0,1,.745-.29L77.8,107.1a15.547,15.547,0,0,1,1.114-1.141A21.9,21.9,0,0,0,65,101Zm15.268,6.181c-.266.236-.523.49-.774.755l1.325.884c.243.162.237.508-.015.773a.745.745,0,0,1-.9.185l-1.275-.851a18.449,18.449,0,0,0-1.4,2.061l1.461.266a.5.5,0,0,1,.314.712.723.723,0,0,1-.74.52l-1.695-.309a22.076,22.076,0,0,0-1.071,2.482l1.2-.087c.3-.021.517.251.495.609a.705.705,0,0,1-.575.686l-1.549.111a25.608,25.608,0,0,0-.635,2.63l1.238-.089c.3-.021.517.251.495.609a.705.705,0,0,1-.575.686l-1.382.1c-.1.791-.175,1.6-.21,2.42l1.492-.5a.524.524,0,0,1,.642.465.689.689,0,0,1-.371.806l-1.807.608c.006.813.062,1.606.141,2.388l1.513-.342c.284-.064.523.225.534.647a.856.856,0,0,1-.494.879l-1.362.308c.123.779.269,1.546.452,2.289l1.675-.573a.519.519,0,0,1,.648.46.706.706,0,0,1-.388.814l-1.608.549a23.064,23.064,0,0,0,.95,2.622l.964-.934a.707.707,0,0,1,.955.087.638.638,0,0,1,.1.914l-1.352,1.311c.251.472.515.928.794,1.363l1.34-1.345a.673.673,0,0,1,.932.088.66.66,0,0,1,.1.924l-1.526,1.532a15.546,15.546,0,0,0,1.4,1.612,21.937,21.937,0,0,0,.535-32.124Z"/>' +
    '</g></g></g></g>' +
  '</svg>';
function loaderImgHtml() {
  return `<span class="loader">${LOADER_SVG}</span>`;
}
function loaderBlockHtml() {
  return `<div class="state-msg state-msg--loading" role="status">${loaderImgHtml()}</div>`;
}
function setLoading(el) {
  if (!el) return;
  if (!(el.classList.contains('state-msg--loading') && el.querySelector('.loader'))) {
    el.className = 'state-msg state-msg--loading';
    el.innerHTML = loaderImgHtml();
  }
  el.hidden = false;
}
function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
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
async function fetchLatestAvailable(manifest, filename, { startYear, floorYear = 1980, validate, transform } = {}) {
  let year = startYear || new Date().getFullYear();
  while (year >= floorYear) {
    try {
      let data = await fetchSeasonFile(manifest, year, filename);
      if (transform) data = transform(data);
      if (data && (!validate || validate(data))) return { year, data };
    } catch (_) { }
    year--;
  }
  return null;
}
function isStandingsShape(data) {
  return !!data && Array.isArray(data.teams);
}
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
async function fetchCoreIndex(manifest, name) {
  const url = `${coreBaseUrl(manifest)}/data/index/${name}.json`;
  const data = await fetchJSONOrNull(url);
  return data || [];
}
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
  render(searchEl ? searchEl.value : '');
  if (searchEl) {
    let debounceTimer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => render(searchEl.value), 120);
    });
  }
}
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
function setHeroBanner(heroEl, bannerSrc) {
  heroEl.style.backgroundImage =
    `linear-gradient(rgba(11,13,16,0.55), rgba(11,13,16,0.88)), url("${bannerSrc}")`;
}
function teamLogoCardHtml(teamId) {
  return `<span class="team-logo-card"><img src="/assets/logos/${teamId}.webp" alt="" ` +
    `onerror="this.onerror=null;this.style.display='none';"></span>`;
}
const LEAGUE_LOGO_FILES = { 103: 'al', 104: 'nl' };
function leagueLogoCardHtml(leagueId) {
  const file = LEAGUE_LOGO_FILES[leagueId];
  if (!file) return '';
  return `<span class="team-logo-card league-logo-card"><img src="/assets/leagues/${file}.webp" alt="" ` +
    `onerror="this.onerror=null;this.style.display='none';"></span>`;
}
const TWO_WORD_NICKNAMES = ['Red Sox', 'White Sox', 'Blue Jays', 'Devil Rays'];
function shortTeamName(name) {
  const n = String(name ?? '').trim();
  if (!n || /^Team \d+$/.test(n)) return n;
  for (const nick of TWO_WORD_NICKNAMES) {
    if (n === nick || n.endsWith(` ${nick}`)) return nick;
  }
  if (/\bAngels\b/.test(n)) return 'Angels';
  const parts = n.split(/\s+/);
  return parts[parts.length - 1];
}
function compactYearSelectHtml(activeYear, label, id) {
  const thisYear = new Date().getFullYear();
  let groups = '';
  for (let d = Math.floor(thisYear / 10) * 10; d >= 1980; d -= 10) {
    let opts = '';
    for (let y = Math.min(d + 9, thisYear); y >= Math.max(d, 1980); y--) {
      opts += `<option value="${y}"${y === activeYear ? ' selected' : ''}>${y}</option>`;
    }
    groups += `<optgroup label="${d}s">${opts}</optgroup>`;
  }
  return `<select class="tx-select"${id ? ` id="${id}"` : ''} aria-label="${label}">${groups}</select>`;
}
function teamLinkHtml(teamId, name) {
  if (teamId === null || teamId === undefined || teamId === '') return `${name}`;
  const short = shortTeamName(name);
  const label = short && short !== name
    ? `<span class="tn-full">${name}</span><span class="tn-short">${short}</span>`
    : `${name}`;
  return `<a class="team-link team-chip" href="/team/?id=${teamId}">` +
    `${teamLogoCardHtml(teamId)}<span class="team-chip__name">${label}</span></a>`;
}
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
const NON_REGULAR_GAME_TYPES = new Set(['S', 'E', 'A', 'I']);
function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function txKey(row) {
  const d = String(row[0] === null || row[0] === undefined ? '' : row[0]).slice(0, 10);
  const t = String(row[1] === null || row[1] === undefined ? '' : row[1]);
  const p = String(row[2] === null || row[2] === undefined ? '' : row[2]);
  return `tx-${d}-${t}-${p}`.replace(/[^A-Za-z0-9_-]/g, '-');
}
function txPageHref(row) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(row[0] === null || row[0] === undefined ? '' : row[0]));
  if (!m) return '/archive/?type=transactions';
  return `/archive/?type=transactions&year=${m[1]}&month=${m[2]}#${txKey(row)}`;
}
async function fetchScheduleFromStatsApi(year) {
  const fields = 'dates,games,gamePk,gameDate,gameType,status,detailedState,teams,away,home,team,id,score';
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${encodeURIComponent(year)}` +
    `&fields=${fields}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching MLB schedule for ${year}`);
  const data = await res.json();
  const games = [];
  for (const day of (data && data.dates) || []) {
    for (const g of day.games || []) {
      const state = (g.status && g.status.detailedState) || '';
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
    const prev = byPk.get(String(g.gamePk));
    if (!prev || String(g.date) >= String(prev.date)) byPk.set(String(g.gamePk), g);
  }
  const games = [...byPk.values()].sort((a, b) => {
    const ta = Date.parse(a.date), tb = Date.parse(b.date);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
    if (a.date !== b.date) return String(a.date) < String(b.date) ? -1 : 1;
    return Number(a.gamePk) - Number(b.gamePk);
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
async function fetchSeasonSchedule(manifest, year) {
  const thisYear = new Date().getFullYear();
  if (Number(year) >= thisYear) {
    try {
      const fresh = await fetchScheduleFromStatsApi(year);
      if (Array.isArray(fresh) && fresh.length > 0) return fresh;
    } catch (_) { }
  }
  let schedule = null;
  try {
    schedule = await fetchSeasonFile(manifest, year, 'schedule.json');
  } catch (_) { }
  if (!Array.isArray(schedule) && Number(year) >= thisYear - 1) {
    try {
      schedule = await fetchScheduleFromStatsApi(year);
    } catch (_) { schedule = null; }
  }
  return Array.isArray(schedule) ? schedule : null;
}
const LIVE_POLL_MS = 30000;
function liveStateLabel(detailedState, linescore) {
  if (/delay/i.test(detailedState || '')) return 'Delayed';
  const ls = linescore || {};
  if (ls.currentInningOrdinal && ls.inningState) return `${ls.inningState} ${ls.currentInningOrdinal}`;
  if (ls.currentInningOrdinal) return `${ls.currentInningOrdinal} inning`;
  return 'In progress';
}
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
      if (Number.isFinite(inning) && inning < 1) continue;
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
async function fetchTodaysGames() {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const fields = 'dates,games,gamePk,season,gameDate,gameType,status,abstractGameState,detailedState,' +
    'teams,away,home,team,id,score,linescore,currentInning,currentInningOrdinal,inningState';
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${day(-1)}&endDate=${day(1)}` +
    `&hydrate=linescore&fields=${fields}`;
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
      if (/Postponed|Cancelled/i.test(st.detailedState || '')) continue;
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
function liveByTeam(list) {
  const m = new Map();
  for (const g of list || []) {
    const base = { gamePk: g.gamePk, season: g.season, date: g.date, outcome: 'LIVE', label: g.label };
    m.set(String(g.awayTeamId), { ...base, us: g.awayScore, them: g.homeScore, oppId: g.homeTeamId, home: false });
    m.set(String(g.homeTeamId), { ...base, us: g.homeScore, them: g.awayScore, oppId: g.awayTeamId, home: true });
  }
  return m;
}
function liveSig(entry) {
  return entry ? `${entry.gamePk}|${entry.us}|${entry.them}|${entry.label}` : '';
}
function liveListSig(list) {
  return (list || []).map(g => `${g.gamePk}|${g.awayScore}|${g.homeScore}|${g.label}`).sort().join(',');
}
function playoffFormat(year) {
  const y = Number(year);
  if (y === 1981 || y === 1994) return null;
  if (y < 1995) return { perDivision: 1, wildCards: 0 };
  if (y < 2012) return { perDivision: 1, wildCards: 1 };
  if (y === 2020) return { perDivision: 2, wildCards: 2 };
  if (y < 2022) return { perDivision: 1, wildCards: 2 };
  return { perDivision: 1, wildCards: 3 };
}
function standingsWinPct(t) {
  const p = Number(t.pct);
  if (t.pct !== null && t.pct !== undefined && t.pct !== '' && Number.isFinite(p)) return p;
  const w = Number(t.w), l = Number(t.l);
  return Number.isFinite(w) && Number.isFinite(l) && w + l > 0 ? w / (w + l) : null;
}
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
function playoffDotHtml(teamId, spots) {
  const spot = spots.get(String(teamId));
  return spot
    ? `<span class="po-dot" role="img" title="${PLAYOFF_SPOT_LABELS[spot]}" aria-label="${PLAYOFF_SPOT_LABELS[spot]}"></span>`
    : `<span class="po-dot po-dot--none" aria-hidden="true"></span>`;
}
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
    const label = `LIVE ${liveEntry.us}\u2013${liveEntry.them} vs. ${opp}, ${liveEntry.label}`;
    liveChip = `<a class="l5 l5--live" href="/game/?id=${encodeURIComponent(liveEntry.gamePk)}&year=${encodeURIComponent(year)}" ` +
      `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="live-dot" aria-hidden="true"></span></a>`;
  }
  const chips = list.map(r => {
    const opp = state.names.get(String(r.oppId)) || `Team ${r.oppId}`;
    const day = new Date(r.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
    const label = `${r.outcome} ${r.us}\u2013${r.them} vs. ${opp}, ${day}`;
    const cls = r.outcome === 'W' ? 'l5--w' : r.outcome === 'L' ? 'l5--l' : 'l5--t';
    return `<a class="l5 ${cls}" href="/game/?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}" ` +
      `title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${r.outcome}</a>`;
  }).join('');
  return `<td class="l5-cell"><span class="l5-strip">${chips}${liveChip}</span></td>`;
}
const VERTICAL_SCREEN_QUERY = '(max-width: 640px), (orientation: portrait) and (max-width: 900px)';
const STANDINGS_PLAIN_COLUMNS = ['w', 'l', 'pct', 'gb'];
const STANDINGS_WIDE_COLUMNS = ['pl', 'w', 'l', 'pct', 'gb', 'last5'];
const STANDINGS_VERTICAL_COLUMNS = ['pl', 'w', 'l', 'pct', 'last5'];
const STANDINGS_LABELS = { pl: 'PL', w: 'W', l: 'L', pct: 'Pct', gb: 'GB' };
const STANDINGS_TITLES = { pl: 'games played', w: 'wins', l: 'losses', pct: 'win percentage', gb: 'games behind' };
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
      if (raw === '-' || raw === '\u2013' || raw === '\u2014') return 0;
      if (raw.startsWith('+')) { const n = standingsNum(raw.slice(1)); return n === null ? null : -n; }
      return standingsNum(raw);
    }
    default: return null;
  }
}
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
function standingsHeaderHtml(key, sort, group) {
  if (key === 'last5') return '<th class="l5-col"><span class="sr-only">Last 5</span></th>';
  const active = sort.key === key;
  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const arrow = active ? `<span class="sort-arrow" aria-hidden="true">${sort.dir === 'asc' ? '\u25B2' : '\u25BC'}</span>` : '';
  const groupAttr = group ? ` data-group="${escapeHtml(group)}"` : '';
  return `<th class="sortable" aria-sort="${ariaSort}">` +
    `<button type="button" class="sort-btn" data-sort="${key}"${groupAttr} title="Sort by ${STANDINGS_TITLES[key]}">` +
    `${STANDINGS_LABELS[key]}${arrow}</button></th>`;
}
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
        const trend = extended && !opts.plainPct ? pctTrend(t.id, opts.last5) : null;
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
function runIndexPage() {
  const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };
  const LEAGUE_PAGES = { 103: '/AL/', 104: '/NL/' };
  async function main() {
    setLoading(document.getElementById('standings-status'));
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
  async function loadTodaysGames(manifest) {
    const statusEl = document.getElementById('today-status');
    const wrap = document.getElementById('today-wrap');
    const resolveTeamName = createTeamNameResolver(manifest);
    const FEATURE_POLL_MS = 8000;
    const SHOW_FEATURED_LIVE = false;
    let feat = { pk: null, html: '' };
    let current = [];
    const TODAY_AHEAD_HOURS = 24;
    const TODAY_GRACE_HOURS = 4;
    async function fetchShown() {
      const all = await fetchTodaysGames();
      const now = Date.now();
      return sortGames(all.filter((g) => {
        if (g.state === 'live') return true;
        if (g.state !== 'preview') return false;
        const t = Date.parse(g.gameDate);
        if (Number.isNaN(t)) return false;
        return t >= now - TODAY_GRACE_HOURS * 3600000 && t <= now + TODAY_AHEAD_HOURS * 3600000;
      }));
    }
    function sortGames(games) {
      return [...games].sort((a, b) => {
        if ((a.state === 'live') !== (b.state === 'live')) return a.state === 'live' ? -1 : 1;
        return new Date(a.gameDate) - new Date(b.gameDate);
      });
    }
    async function render(games) {
      if (games.length === 0) {
        wrap.hidden = true;
        setStatus(statusEl, 'No live games, and none starting in the next 24 hours.');
        return;
      }
      const rows = [];
      for (const g of games) {
        if (SHOW_FEATURED_LIVE && g === games[0] && g.state === 'live' && feat.pk === g.gamePk && feat.html) {
          rows.push(`<div class="gm gm--feature" id="today-feature" data-pk="${g.gamePk}">${feat.html}</div>`);
          continue;
        }
        const [awayName, homeName] = await Promise.all([
          resolveTeamName(g.awayTeamId),
          resolveTeamName(g.homeTeamId),
        ]);
        const live = g.state === 'live';
        const time = fmtGameTime(g.gameDate);
        const day = fmtGameDay(g.gameDate);
        const hasTime = time !== '—';
        const hasDay = day !== '—';
        const dayTime = [hasDay ? day : '', hasTime ? time : ''].filter(Boolean).join(', ');
        const when = live
          ? `<div class="gm-when"><span class="live-dot" aria-hidden="true"></span> LIVE · ${escapeHtml(g.label || 'In progress')}${dayTime ? ` · ${escapeHtml(dayTime)}` : ''}</div>`
          : '';
        const scoreCell = live
          ? `<a class="gm-score gm--live" href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a>`
          : `<span class="gm-score gm-score--pending gm-score--time">` +
              (hasTime || hasDay
                ? `${hasTime ? `<span class="gm-time">${escapeHtml(time)}</span>` : ''}${hasDay ? `<span class="gm-date">${escapeHtml(day)}</span>` : ''}`
                : '&ndash;') +
            `</span>`;
        const coverLabel = `${awayName} at ${homeName}${live ? ' (live)' : ''} - open game`;
        rows.push(`<div class="gm gm--link">
          <a class="gm-cover" href="${gameHref(g)}" aria-label="${escapeHtml(coverLabel)}"></a>
          ${when}
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
    try {
      current = await fetchShown();
    } catch (err) {
      setStatus(statusEl, `Couldn't load today's games (${err.message}).`, true);
      return;
    }
    await render(current);
    let busy = false;
    async function rebuild() {
      if (busy) return;
      busy = true;
      try { await render(current); } finally { busy = false; }
    }
    let featBusy = false;
    async function refreshFeature() {
      if (!SHOW_FEATURED_LIVE || featBusy || document.hidden) return;
      const top = current[0];
      if (!top || top.state !== 'live') {
        if (feat.pk !== null) feat = { pk: null, html: '' };
        return;
      }
      featBusy = true;
      try {
        const feed = await LiveKit.fetchLiveFeed(top.gamePk);
        if (!current[0] || current[0].gamePk !== top.gamePk || current[0].state !== 'live') return;
        if (!feed) return;
        const html = LiveKit.featureHtml(feed, gameHref(top));
        const el = document.getElementById('today-feature');
        if (!html) {
          if (feat.pk === top.gamePk) { feat = { pk: null, html: '' }; await rebuild(); }
          return;
        }
        if (feat.pk === top.gamePk && feat.html === html && el) return;
        feat = { pk: top.gamePk, html };
        if (el && el.getAttribute('data-pk') === String(top.gamePk)) el.innerHTML = html;
        else await rebuild();
      } catch (_) { }
      finally { featBusy = false; }
    }
    if (SHOW_FEATURED_LIVE) {
      refreshFeature();
      setInterval(refreshFeature, FEATURE_POLL_MS);
    }
    setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        current = await fetchShown();
        await render(current);
      } catch (_) { }
      finally { busy = false; }
      refreshFeature();
    }, LIVE_POLL_MS);
  }
  const PS_NAMES = { F: 'Wild Card Series', D: 'Division Series', L: 'Championship Series', W: 'World Series' };
  const PS_ROUND_ORDER = ['W', 'L', 'D', 'F'];
  const PS_DEFAULT_BEST_OF = { F: 3, D: 5, L: 7, W: 7 };
  const PHASE_WATCH_MS = 5 * 60 * 1000;
  async function fetchPostseasonGames(year) {
    const fields = 'dates,games,gamePk,season,gameDate,gameType,status,abstractGameState,detailedState,' +
      'seriesGameNumber,gamesInSeries,teams,away,home,team,id,name,score,' +
      'linescore,currentInning,currentInningOrdinal,inningState';
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${year}-09-25&endDate=${year}-12-31` +
      `&hydrate=linescore&fields=${fields}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching the ${year} postseason`);
    const data = await res.json();
    const byPk = new Map();
    for (const d of (data && data.dates) || []) {
      for (const g of d.games || []) {
        if (!PS_NAMES[g.gameType]) continue;
        const st = g.status || {};
        if (/Postponed|Cancelled/i.test(st.detailedState || '')) continue;
        const away = g.teams && g.teams.away, home = g.teams && g.teams.home;
        if (!away || !home || !away.team || !home.team) continue;
        const aId = away.team.id, hId = home.team.id;
        if (!aId || !hId) continue;
        const state = st.abstractGameState === 'Live' ? 'live' : (st.abstractGameState === 'Final' ? 'final' : 'preview');
        byPk.set(String(g.gamePk), {
          gamePk: g.gamePk,
          season: Number(g.season) || year,
          gameDate: g.gameDate,
          gameType: g.gameType,
          state,
          label: state === 'live' ? liveStateLabel(st.detailedState, g.linescore) : null,
          awayTeamId: aId, homeTeamId: hId,
          awayName: away.team.name || `Team ${aId}`, homeName: home.team.name || `Team ${hId}`,
          awayScore: Number(away.score) || 0, homeScore: Number(home.score) || 0,
          gamesInSeries: Number(g.gamesInSeries) || 0,
          seriesGameNumber: Number(g.seriesGameNumber) || 0,
        });
      }
    }
    return [...byPk.values()];
  }
  function postseasonStarted(games) {
    const now = Date.now();
    return games.some((g) => g.state !== 'preview' || Date.parse(g.gameDate) <= now);
  }
  function standingsHaveGames(data) {
    return !!data && Array.isArray(data.teams) &&
      data.teams.some((t) => (Number(t.w) || 0) + (Number(t.l) || 0) > 0);
  }
  async function decidePhase(manifest, standings) {
    const nowYear = new Date().getFullYear();
    let games;
    try { games = await fetchPostseasonGames(nowYear); } catch (_) { return { mode: 'standings', unknown: true }; }
    if (postseasonStarted(games)) return { mode: 'postseason', year: nowYear, games };
    const seasonUnderway = Number(standings.year) >= nowYear && standingsHaveGames(standings.data);
    if (seasonUnderway) return { mode: 'standings' };
    const lastYear = Number(standings.year) >= nowYear ? nowYear - 1 : Number(standings.year);
    try {
      const prev = await fetchPostseasonGames(lastYear);
      if (prev.some((g) => g.state === 'final')) return { mode: 'postseason', year: lastYear, games: prev };
    } catch (_) { }
    return { mode: 'standings' };
  }
  async function standingsTeamsFor(manifest, year, known) {
    let data = known && Number(known.year) === Number(year) ? known.data : null;
    if (!data) {
      try { data = normalizeStandings(await fetchSeasonFile(manifest, year, 'standings-splits.json')); } catch (_) { data = null; }
    }
    return data && Array.isArray(data.teams) ? data.teams : [];
  }
  function buildSeries(games) {
    const sorted = [...games].sort((a, b) =>
      (Date.parse(a.gameDate) || 0) - (Date.parse(b.gameDate) || 0) || Number(a.gamePk) - Number(b.gamePk));
    const map = new Map();
    for (const g of sorted) {
      const key = `${g.gameType}|${[g.awayTeamId, g.homeTeamId].map(String).sort().join('-')}`;
      if (!map.has(key)) {
        map.set(key, {
          type: g.gameType, games: [], bestOf: 0,
          left: { id: g.homeTeamId, name: g.homeName, wins: 0 },
          right: { id: g.awayTeamId, name: g.awayName, wins: 0 },
        });
      }
      map.get(key).games.push(g);
    }
    const list = [];
    for (const s of map.values()) {
      for (const g of s.games) {
        s.bestOf = Math.max(s.bestOf, g.gamesInSeries);
        if (g.state !== 'final' || g.awayScore === g.homeScore) continue;
        const winId = g.awayScore > g.homeScore ? g.awayTeamId : g.homeTeamId;
        if (String(winId) === String(s.left.id)) s.left.wins++;
        else if (String(winId) === String(s.right.id)) s.right.wins++;
      }
      if (!s.bestOf) s.bestOf = PS_DEFAULT_BEST_OF[s.type] || 7;
      const need = Math.floor(s.bestOf / 2) + 1;
      s.winner = s.left.wins >= need ? s.left : (s.right.wins >= need ? s.right : null);
      list.push(s);
    }
    return list;
  }
  function seriesWhenHtml(s, lgMap) {
    const nick = (t) => shortTeamName(t.name);
    const finished = s.games.filter((g) => g.state === 'final').length;
    const live = s.games.find((g) => g.state === 'live') || null;
    const next = s.games.find((g) => g.state === 'preview') || null;
    const gameNo = (g) => g.seriesGameNumber || (finished + 1);
    const nextText = (g) => {
      const day = fmtGameDay(g.gameDate), time = fmtGameTime(g.gameDate);
      const when = [day !== '—' ? day : '', time !== '—' ? time : ''].filter(Boolean).join(', ');
      return `Game ${gameNo(g)}${when ? `: ${when}` : ''}`;
    };
    const lg = lgMap && s.type !== 'W' ? lgMap.get(String(s.left.id)) : null;
    const parts = [];
    if (lg && lg === lgMap.get(String(s.right.id)) && LEAGUE_NAMES[lg]) parts.push(LEAGUE_NAMES[lg]);
    const pieces = parts.map((t) => escapeHtml(t));
    if (s.winner) {
      const loser = s.winner === s.left ? s.right : s.left;
      pieces.push(escapeHtml(`${nick(s.winner)} win ${s.winner.wins}\u2013${loser.wins}`));
    } else if (live) {
      pieces.push(`<span class="live-dot" aria-hidden="true"></span> LIVE \u00b7 ${escapeHtml(`Game ${gameNo(live)} \u00b7 ${live.label || 'In progress'}`)}`);
    } else if (s.left.wins + s.right.wins === 0) {
      pieces.push(escapeHtml(next ? nextText(next) : 'Not started'));
    } else {
      const a = s.left, b = s.right;
      pieces.push(escapeHtml(a.wins === b.wins
        ? `Series tied ${a.wins}\u2013${b.wins}`
        : (a.wins > b.wins ? `${nick(a)} lead ${a.wins}\u2013${b.wins}` : `${nick(b)} lead ${b.wins}\u2013${a.wins}`)));
      if (next) pieces.push(escapeHtml(nextText(next)));
    }
    return `<div class="gm-when">${pieces.join(' \u00b7 ')}</div>`;
  }
  const PS_COLS = ['F', 'D', 'L'];
  const PS_EXPECTED = { F: 2, D: 2, L: 1 };
  const PS_BRACKET_FROM = 2022;
  const sharesTeam = (a, b) => [a.left.id, a.right.id].some((id) => String(id) === String(b.left.id) || String(id) === String(b.right.id));
  const seriesStart = (s) => Date.parse(s.games[0].gameDate) || 0;
  const byStart = (a, b) => seriesStart(a) - seriesStart(b) || Number(a.games[0].gamePk) - Number(b.games[0].gamePk);
  const TEAM_ABBR = { 108: 'LAA', 109: 'AZ', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN', 114: 'CLE', 115: 'COL',
    116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA',
    137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA',
    147: 'NYY', 158: 'MIL' };
  const TEAM_LEAGUE = {};
  [108, 110, 111, 114, 116, 117, 118, 133, 136, 139, 140, 141, 142, 145, 147].forEach((id) => { TEAM_LEAGUE[id] = 103; });
  [109, 112, 113, 115, 119, 120, 121, 134, 135, 137, 138, 143, 144, 146, 158].forEach((id) => { TEAM_LEAGUE[id] = 104; });
  function leagueKeyOf(s, lgMap) {
    const norm = (v) => { const n = Number(v); return n === 103 || n === 104 ? n : 0; };
    const of = (t) => norm(lgMap && lgMap.get(String(t.id))) || TEAM_LEAGUE[Number(t.id)] || 0;
    const a = of(s.left), b = of(s.right);
    return a && b ? (a === b ? a : 0) : (a || b);
  }
  function placeSlots(list, size, anchorOf) {
    const n = Math.max(size, list.length);
    const slots = new Array(n).fill(null);
    const rest = [];
    for (const s of list) {
      const k = anchorOf ? anchorOf(s) : -1;
      if (Number.isInteger(k) && k >= 0 && k < n && !slots[k]) slots[k] = s; else rest.push(s);
    }
    for (const s of rest) slots[slots.indexOf(null)] = s;
    return slots;
  }
  function seriesGameChipHtml(s, g, idx) {
    const n = g.seriesGameNumber || (idx + 1);
    const nick = (t) => shortTeamName(t.name);
    const leftIsHome = String(g.homeTeamId) === String(s.left.id);
    const l = leftIsHome ? g.homeScore : g.awayScore;
    const r = leftIsHome ? g.awayScore : g.homeScore;
    const day = fmtGameDay(g.gameDate), time = fmtGameTime(g.gameDate);
    const when = [day !== '\u2014' ? day : '', time !== '\u2014' ? time : ''].filter(Boolean).join(', ');
    if (g.state === 'preview') {
      const label = `Game ${n}${when ? ` \u00b7 ${when}` : ''} (not played yet)`;
      return `<span class="po-g po-g--next" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="po-g__n">G${n}</span><span class="po-g__s">${escapeHtml(day !== '\u2014' ? day : 'TBD')}</span></span>`;
    }
    const href = gameHref({ gamePk: g.gamePk, season: g.season });
    if (g.state === 'live') {
      const label = `Game ${n} live: ${nick(s.left)} ${l}, ${nick(s.right)} ${r} \u00b7 ${g.label || 'In progress'}`;
      return `<a class="po-g po-g--live" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="live-dot" aria-hidden="true"></span><span class="po-g__n">G${n}</span>` +
        `<span class="po-g__s">${l}&ndash;${r}</span></a>`;
    }
    const label = `Game ${n}: ${nick(s.left)} ${l}, ${nick(s.right)} ${r}${when ? ` (${when})` : ''}`;
    const score = l > r ? `<b>${l}</b>&ndash;${r}` : (r > l ? `${l}&ndash;<b>${r}</b>` : `${l}&ndash;${r}`);
    return `<a class="po-g" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
      `<span class="po-g__n">G${n}</span><span class="po-g__s">${score}</span></a>`;
  }
  function seriesGamesHtml(s) {
    const played = s.games.filter((g) => g.state !== 'preview');
    const next = s.winner ? null : (s.games.find((g) => g.state === 'preview') || null);
    const shown = next ? played.concat(next) : played;
    if (shown.length === 0) return '';
    return `<div class="po-games" role="group" aria-label="Games in this series">` +
      shown.map((g) => seriesGameChipHtml(s, g, s.games.indexOf(g))).join('') + `</div>`;
  }
  function seriesCardHtml(s) {
    const live = s.games.some((g) => g.state === 'live');
    const row = (t) => {
      const cls = s.winner ? (s.winner === t ? ' is-winner' : ' is-out') : '';
      return `<div class="po-team${cls}">` +
        `<a class="po-team__link" href="/team/?id=${encodeURIComponent(t.id)}" title="${escapeHtml(t.name)}">` +
          `${teamLogoCardHtml(t.id)}<span class="po-team__name">${escapeHtml(shortTeamName(t.name))}</span></a>` +
        `<span class="po-wins" aria-label="${t.wins} win${t.wins === 1 ? '' : 's'}">${t.wins}</span></div>`;
    };
    return `<div class="po-series${live ? ' is-live' : ''}">${seriesWhenHtml(s, null)}${row(s.left)}${row(s.right)}${seriesGamesHtml(s)}</div>`;
  }
  const tbdCardHtml = (rows) => (rows && rows.length
    ? `<div class="po-series po-series--tbd po-series--feed"><div class="gm-when">To be decided</div>${rows.join('')}</div>`
    : `<div class="po-series po-series--tbd"><span>To be decided</span></div>`);
  const feedWinnerRow = (t) =>
    `<div class="po-team is-winner"><a class="po-team__link" href="/team/?id=${encodeURIComponent(t.id)}" title="${escapeHtml(t.name)}">` +
    `${teamLogoCardHtml(t.id)}<span class="po-team__name">${escapeHtml(shortTeamName(t.name))}</span></a></div>`;
  const feedPendingRow = (s, label) => {
    const logos = s ? teamLogoCardHtml(s.left.id) + teamLogoCardHtml(s.right.id) : '';
    const txt = s ? `Winner of ${shortTeamName(s.left.name)} vs ${shortTeamName(s.right.name)}` : label;
    return `<div class="po-feed">${logos ? `<span class="po-feed__logos">${logos}</span>` : ''}<span class="po-feed__txt">${escapeHtml(txt)}</span></div>`;
  };
  const feedRowFor = (s, label) => (s && s.winner ? feedWinnerRow(s.winner) : feedPendingRow(s || null, label));
  function feedRows(t, k, by) {
    if (t === 'D') {
      return [feedRowFor((by.F || [])[k], 'Winner of Wild Card Series'),
        '<div class="po-feed po-feed--bye"><span class="po-feed__txt">Division winner (first-round bye)</span></div>'];
    }
    if (t === 'L') {
      return [feedRowFor((by.D || [])[0], 'Winner of Division Series'), feedRowFor((by.D || [])[1], 'Winner of Division Series')];
    }
    return [];
  }
  function bracketHtml(series, lgMap, year, spots) {
    const std = Number(year) >= PS_BRACKET_FROM;
    const cols = PS_COLS.filter((t) => std || series.some((s) => s.type === t));
    const inLeague = (lg) => series.filter((s) => s.type !== 'W' && leagueKeyOf(s, lgMap) === lg);
    const anyKnown = inLeague(103).length + inLeague(104).length > 0;
    const leagues = (anyKnown || inLeague(0).length === 0)
      ? [103, 104].concat(inLeague(0).length ? [0] : [])
      : [0];
    const lcsByLg = {};
    const leagueHtml = leagues.map((lg) => {
      const mine = inLeague(lg);
      const slotsBy = {};
      let prev = [];
      for (const t of cols) {
        const list = mine.filter((s) => s.type === t).sort(byStart);
        const size = std && lg ? PS_EXPECTED[t] : 0;
        let anchorOf = null;
        if (t === 'F' && std && lg) {
          anchorOf = (s) => { const sp = spots && spots.get(String(s.left.id)); return sp === 'wildcard' ? 0 : (sp === 'division' ? 1 : -1); };
        } else if (prev.length) {
          anchorOf = (s) => prev.findIndex((p) => p && sharesTeam(p, s));
        }
        slotsBy[t] = placeSlots(list, size, anchorOf);
        prev = slotsBy[t];
      }
      lcsByLg[lg] = (slotsBy.L && slotsBy.L[0]) || null;
      const colHtml = cols.map((t, i) => {
        const slots = slotsBy[t], next = slotsBy[cols[i + 1]];
        const join = slots.length === 2 && !!next && next.length === 1;
        return `<div class="po-col${join ? ' po-col--join' : ''}${slots.length === 1 ? ' po-col--single' : ''}"><div class="po-col__title">${PS_NAMES[t]}</div>` +
          `<div class="po-col__body">${slots.map((s, k) => (s ? seriesCardHtml(s) : tbdCardHtml(std && lg ? feedRows(t, k, slotsBy) : null))).join('')}</div></div>`;
      }).join('');
      const name = LEAGUE_NAMES[lg] || 'Postseason';
      const lgPage = LEAGUE_PAGES[lg];
      const lgHead = lgPage
        ? `<a class="po-lg__link" href="${lgPage}">${leagueLogoCardHtml(lg)}<span>${escapeHtml(name)}</span></a>`
        : `${leagueLogoCardHtml(lg)}<span>${escapeHtml(name)}</span>`;
      return `<div class="po-lg"><div class="po-lg__head">${lgHead}</div>` +
        `<div class="po-lg__cols">${colHtml}</div></div>`;
    }).join('');
    const ws = series.filter((s) => s.type === 'W').sort(byStart);
    const finalHtml = (std || ws.length)
      ? `<div class="po-final"><div class="po-col__title">${PS_NAMES.W}</div><div class="po-col__body">` +
        `${ws.length ? ws.map((s) => seriesCardHtml(s)).join('') : tbdCardHtml([feedRowFor(lcsByLg[103], 'Winner of American League'), feedRowFor(lcsByLg[104], 'Winner of National League')])}</div></div>`
      : '';
    return `<div class="po-bracket"><div class="po-lgs">${leagueHtml}</div>${finalHtml}</div>`;
  }
  const PT_SHIELD = '<svg class="pt-shield" viewBox="0 0 24 28" aria-hidden="true" focusable="false">' +
    '<path d="M12 1.6 3 4.7v8.9c0 5.9 3.8 10.4 9 12.7 5.2-2.3 9-6.8 9-12.7V4.7L12 1.6Z"/></svg>';
  const PT_JOINS = {
    straight: 'M12.5 0V30M37.5 0V30M62.5 0V30M87.5 0V30',
    four: 'M12.5 0V15H37.5V0M25 15V30M62.5 0V15H87.5V0M75 15V30',
    two: 'M25 0V15H75V0M50 15V30',
  };
  const ptJoinHtml = (kind) =>
    `<svg class="pt-j" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${PT_JOINS[kind]}"/></svg>`;
  const teamAbbr = (t) => TEAM_ABBR[Number(t.id)] || String(shortTeamName(t.name) || '').slice(0, 3).toUpperCase() || 'TBD';
  function ptTeamHtml(t) {
    if (!t) return `<span class="pt-team pt-team--tbd">${PT_SHIELD}<span class="pt-abbr">TBD</span></span>`;
    return `<span class="pt-team"><span class="pt-logo"><img src="/assets/logos/${encodeURIComponent(t.id)}.webp" alt="" ` +
      `onerror="this.onerror=null;this.style.display='none';"></span><span class="pt-abbr">${escapeHtml(teamAbbr(t))}</span></span>`;
  }
  function ptPair(l, r) {
    const nm = (t) => (t ? shortTeamName(t.name) : 'TBD');
    return { l, r, score: null, state: 'tbd', href: null, label: `${nm(l)} vs ${nm(r)}` };
  }
  function ptGamesHtml(s) {
    const played = s.games.filter((g) => g.state !== 'preview');
    const next = s.winner ? null : (s.games.find((g) => g.state === 'preview') || null);
    const shown = next ? played.concat(next) : played;
    if (shown.length === 0) return '';
    const L = s.right, R = s.left;
    const nick = (t) => shortTeamName(t.name);
    const scoreOf = (g, t) => (String(g.homeTeamId) === String(t.id) ? g.homeScore : g.awayScore);
    const chips = shown.map((g) => {
      const n = g.seriesGameNumber || (s.games.indexOf(g) + 1);
      const day = fmtGameDay(g.gameDate), time = fmtGameTime(g.gameDate);
      const when = [day !== '\u2014' ? day : '', time !== '\u2014' ? time : ''].filter(Boolean).join(', ');
      if (g.state === 'preview') {
        const label = `Game ${n}${when ? ` \u00b7 ${when}` : ''} (not played yet)`;
        return `<span class="pt-g pt-g--next" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
          `<span class="pt-g__n">G${n}</span><span class="pt-g__s">${escapeHtml(day !== '\u2014' ? day : 'TBD')}</span></span>`;
      }
      const a = scoreOf(g, L), b = scoreOf(g, R);
      const href = gameHref({ gamePk: g.gamePk, season: g.season });
      if (g.state === 'live') {
        const label = `Game ${n} live: ${nick(L)} ${a}, ${nick(R)} ${b} \u00b7 ${g.label || 'In progress'}`;
        return `<a class="pt-g pt-g--live" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
          `<span class="live-dot" aria-hidden="true"></span><span class="pt-g__n">G${n}</span><span class="pt-g__s">${a}&ndash;${b}</span></a>`;
      }
      const label = `Game ${n}: ${nick(L)} ${a}, ${nick(R)} ${b}${when ? ` (${when})` : ''}`;
      const score = a > b ? `<b>${a}</b>&ndash;${b}` : (b > a ? `${a}&ndash;<b>${b}</b>` : `${a}&ndash;${b}`);
      return `<a class="pt-g" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="pt-g__n">G${n}</span><span class="pt-g__s">${score}</span></a>`;
    });
    return `<span class="pt-games" role="group" aria-label="Games in this series">${chips.join('')}</span>`;
  }
  function ptNodeOf(s) {
    const L = s.right, R = s.left;
    const live = s.games.find((g) => g.state === 'live') || null;
    const played = s.games.filter((g) => g.state === 'final');
    const last = live || played[played.length - 1] || null;
    const state = s.winner ? 'done' : (live || L.wins + R.wins > 0 ? 'on' : 'idle');
    const nick = (t) => shortTeamName(t.name);
    let label = `${PS_NAMES[s.type]}: ${nick(L)} ${L.wins}, ${nick(R)} ${R.wins}`;
    label += s.winner ? ` \u2014 ${nick(s.winner)} won the series` : (live ? ' \u2014 live now' : '');
    return {
      l: { id: L.id, name: L.name }, r: { id: R.id, name: R.name },
      score: `${L.wins}:${R.wins}`, state, label,
      status: s.winner ? 'Final' : (live ? 'Live' : (state === 'on' ? 'In progress' : 'Upcoming')),
      games: ptGamesHtml(s),
      href: last ? gameHref({ gamePk: last.gamePk, season: last.season }) : null,
    };
  }
  function ptCardHtml(n) {
    const cls = `pt-card pt-card--${n.state}`;
    const head = n.round ? `<span class="pt-round">${escapeHtml(n.round)}</span>` : '';
    const body = `<span class="pt-teams">${ptTeamHtml(n.l)}${ptTeamHtml(n.r)}</span>` +
      (n.score ? `<span class="pt-score">${escapeHtml(n.score)}</span>` : '') +
      (n.status ? `<span class="pt-status">${escapeHtml(n.status)}</span>` : '');
    const main = n.href
      ? `<a class="pt-main" href="${n.href}" title="${escapeHtml(n.label)}" aria-label="${escapeHtml(n.label)}">${body}</a>`
      : `<span class="pt-main">${body}</span>`;
    return `<div class="${cls}" role="group" aria-label="${escapeHtml(n.label)}">${head}${main}${n.games || ''}</div>`;
  }
  function playoffSeeds(standingsTeams, spots) {
    const out = new Map();
    const rows = standingsTeams
      .filter((t) => spots.get(String(t.id)) === 'division')
      .map((t) => ({ lg: Number(t.lg) || TEAM_LEAGUE[Number(t.id)] || 0, id: t.id, name: t.n || `Team ${t.id}`, p: standingsWinPct(t) }))
      .sort((a, b) => (b.p === null ? -1 : b.p) - (a.p === null ? -1 : a.p));
    for (const r of rows) {
      if (!out.has(r.lg)) out.set(r.lg, []);
      out.get(r.lg).push({ id: r.id, name: r.name });
    }
    return out;
  }
  function ptHalf(series, lg, lgMap, spots, seeds) {
    const mine = (t) => series.filter((s) => s.type === t && leagueKeyOf(s, lgMap) === lg).sort(byStart);
    const sd = (seeds && seeds.get(lg)) || [];
    const has = (s, t) => !!s && !!t && [s.left.id, s.right.id].some((id) => String(id) === String(t.id));
    const tm = (t) => (t ? { id: t.id, name: t.name } : null);
    const wc = placeSlots(mine('F'), 2, (s) => {
      const sp = spots && spots.get(String(s.left.id));
      return sp === 'wildcard' ? 0 : (sp === 'division' ? 1 : -1);
    }).slice(0, 2);
    const ds = placeSlots(mine('D'), 2, (s) => {
      const i = wc.findIndex((p) => p && sharesTeam(p, s));
      if (i >= 0) return i;
      const j = [0, 1].find((k) => has(s, sd[k]));
      return j === undefined ? -1 : j;
    }).slice(0, 2);
    const lcs = mine('L')[0] || null;
    const byeOf = (k) => {
      const d = ds[k], w = wc[k];
      if (d && w) return tm([d.left, d.right].find((x) => !has(w, x)));
      return tm(sd[k]);
    };
    const wcNode = (k) => (wc[k] ? ptNodeOf(wc[k]) : ptPair(null, null));
    const dsNode = (k) => {
      if (ds[k]) return ptNodeOf(ds[k]);
      return ptPair(wc[k] && wc[k].winner ? tm(wc[k].winner) : null, byeOf(k));
    };
    const dsWinner = (k) => (ds[k] && ds[k].winner ? tm(ds[k].winner) : null);
    const tag = (n, round) => Object.assign(n, { round });
    return {
      leaf: [tag(wcNode(0), 'Wild Card'), tag(wcNode(1), 'Wild Card')],
      ds: [tag(dsNode(0), 'Div. Series'), tag(dsNode(1), 'Div. Series')],
      lcs: tag(lcs ? ptNodeOf(lcs) : ptPair(dsWinner(0), dsWinner(1)), 'Championship Series'),
      champ: lcs && lcs.winner ? tm(lcs.winner) : null,
    };
  }
  function treeHtml(series, lgMap, spots, seeds) {
    const al = ptHalf(series, 103, lgMap, spots, seeds);
    const nl = ptHalf(series, 104, lgMap, spots, seeds);
    const wsSeries = series.filter((s) => s.type === 'W').sort(byStart)[0] || null;
    const ws = Object.assign(wsSeries ? ptNodeOf(wsSeries) : ptPair(al.champ, nl.champ), { round: 'World Series' });
    const cellCls = { 1: '', 2: ' pt-cell--2', 4: ' pt-cell--4' };
    const row = (nodes, span) =>
      `<div class="pt-row">${nodes.map((n) => `<div class="pt-cell${cellCls[span]}">${ptCardHtml(n)}</div>`).join('')}</div>`;
    return `<div class="po-tree" role="group" aria-label="Postseason bracket: Wild Card, Division Series and Championship Series for the American League (left) and National League (right), World Series at the bottom">` +
      `<div class="pt-lgs"><span>American League</span><span>National League</span></div>` +
      row(al.leaf.concat(nl.leaf), 1) + ptJoinHtml('straight') +
      row(al.ds.concat(nl.ds), 1) + ptJoinHtml('four') +
      row([al.lcs, nl.lcs], 2) + ptJoinHtml('two') +
      row([ws], 4) +
      `</div>`;
  }
  function postseasonHtml(series, lgMap, year, spots, seeds) {
    const isStandIn = (t) => !t || /\b(seed|champion|winner|tbd)s?\b/i.test(String(t.name || '').trim());
    series = series.filter((s) => !isStandIn(s.left) && !isStandIn(s.right));
    let html = '';
    const champ = series.find((s) => s.type === 'W' && s.winner);
    if (champ) {
      html += `<p class="tab-note"><strong class="rank-pill">${escapeHtml(champ.winner.name)}</strong> won the ${year} World Series.</p>`;
    }
    const tree = Number(year) >= PS_BRACKET_FROM ? treeHtml(series, lgMap, spots, seeds) : '';
    html += `<div class="po-wrap${tree ? ' po-wrap--tree' : ''}">` +
      `<p class="tab-note po-hint"></p>` +
      tree +
      `<div class="po-scroll">${bracketHtml(series, lgMap, year, spots)}</div></div>`;
    html += `<p class="tab-note ps-standings"><a class="ps-standings-link" href="/standings/?year=${year}">` +
      `${year} standings</a></p>`;
    return html;
  }
  const postseasonSig = (games) =>
    games.map((g) => `${g.gamePk}|${g.state}|${g.awayScore}|${g.homeScore}|${g.label}`).sort().join(',');
  async function showPostseason(manifest, phase, standings) {
    const statusEl = document.getElementById('standings-status');
    const wrap = document.getElementById('standings-wrap');
    const heading = document.getElementById('standings-heading');
    heading.textContent = 'Postseason';
    const standingsTeams = await standingsTeamsFor(manifest, phase.year, standings);
    const lgMap = new Map(standingsTeams.map((t) => [String(t.id), t.lg]));
    const spots = computePlayoffSpots(standingsTeams, phase.year);
    const seeds = playoffSeeds(standingsTeams, spots);
    let games = phase.games;
    const draw = () => {
      const series = buildSeries(games);
      wrap.innerHTML = postseasonHtml(series, lgMap, phase.year, spots, seeds);
      return series;
    };
    const series = draw();
    clearStatus(statusEl);
    wrap.hidden = false;
    try { showPostseasonStandings(manifest, phase.year, standingsTeams, wrap); } catch (_) { }
    const over = series.some((s) => s.type === 'W' && s.winner);
    if (over || phase.year < new Date().getFullYear()) return;
    let lastSig = postseasonSig(games);
    let busy = false;
    setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await fetchPostseasonGames(phase.year);
        if (next.length === 0) return;
        const sig = postseasonSig(next);
        if (sig !== lastSig) { games = next; lastSig = sig; draw(); }
      } catch (_) { }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }
  function showPostseasonStandings(manifest, year, teams, afterEl) {
    if (!Array.isArray(teams) || teams.length === 0) return;
    let box = document.getElementById('ps-standings-wrap');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ps-standings-wrap';
      afterEl.insertAdjacentElement('afterend', box);
    }
    const names = new Map();
    for (const t of teams) names.set(String(t.id), t.n || `Team ${t.id}`);
    const spots = computePlayoffSpots(teams, year);
    const sortByGroup = new Map();
    const verticalMql = window.matchMedia(VERTICAL_SCREEN_QUERY);
    let last5 = { status: 'pending' };
    function render() {
      const byLeague = new Map();
      for (const t of teams) {
        if (!byLeague.has(t.lg)) byLeague.set(t.lg, []);
        byLeague.get(t.lg).push(t);
      }
      let html = '';
      if (last5.status === 'unavailable') {
        html += `<p class="l5-note">Last 5 results couldn't be loaded for ${year}.</p>`;
      }
      for (const [lg, list] of byLeague) {
        const page = LEAGUE_PAGES[lg];
        const name = LEAGUE_NAMES[lg] || `League ${lg}`;
        const heading = page
          ? `<a class="league-heading-link" href="${page}">${leagueLogoCardHtml(lg)}<span>${name}</span></a>`
          : `${leagueLogoCardHtml(lg)}<span>${name}</span>`;
        html += `<h3 class="league-heading" style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
          color:var(--text-secondary);margin:18px 0 8px;">${heading}</h3>`;
        html += standingsTableHtml(list, year, {
          extended: true, last5, vertical: verticalMql.matches, spots, leagueId: lg, sortByGroup, flat: true,
        });
      }
      box.innerHTML = html;
    }
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn || !box.contains(btn)) return;
      const group = btn.dataset.group;
      const current = sortByGroup.get(group) || STANDINGS_DEFAULT_SORT;
      sortByGroup.set(group, nextStandingsSort(current, btn.dataset.sort));
      render();
    });
    if (verticalMql.addEventListener) verticalMql.addEventListener('change', render);
    else if (verticalMql.addListener) verticalMql.addListener(render);
    render();
    (async () => {
      const seasonIsCurrent = Number(year) >= new Date().getFullYear();
      const [schedule, liveInitial] = await Promise.all([
        fetchSeasonSchedule(manifest, year).catch(() => null),
        seasonIsCurrent ? fetchLiveGames().catch(() => []) : Promise.resolve([]),
      ]);
      if (!(Array.isArray(schedule) && schedule.length > 0)) {
        last5 = { status: 'unavailable' };
        render();
        return;
      }
      let finishedByTeam = buildLastFive(schedule);
      let liveList = liveInitial;
      last5 = { status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) };
      render();
      if (!seasonIsCurrent) return;
      let busy = false;
      let finishedRetries = 0;
      setInterval(async () => {
        if (busy || document.hidden) return;
        busy = true;
        try {
          const next = await fetchLiveGames();
          const ended = liveList.some((p) => !next.some((n) => String(n.gamePk) === String(p.gamePk)));
          const changed = liveListSig(next) !== liveListSig(liveList);
          if (ended) finishedRetries = 3;
          let refetched = false;
          if (finishedRetries > 0) {
            finishedRetries--;
            const fresh = await fetchSeasonSchedule(manifest, year);
            if (Array.isArray(fresh) && fresh.length > 0) { finishedByTeam = buildLastFive(fresh); refetched = true; }
          }
          liveList = next;
          if (changed || refetched) {
            last5 = { status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) };
            render();
          }
        } catch (_) { }
        finally { busy = false; }
      }, LIVE_POLL_MS);
    })();
  }
  function watchForPostseason(manifest, standings) {
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const next = await decidePhase(manifest, standings);
        if (!next.unknown && next.mode === 'postseason') window.location.reload();
      } catch (_) { }
    }, PHASE_WATCH_MS);
  }
  async function loadStandings(manifest) {
    const statusEl = document.getElementById('standings-status');
    const wrap = document.getElementById('standings-wrap');
    const heading = document.getElementById('standings-heading');
    setLoading(statusEl);
    const result = await fetchLatestAvailable(manifest, 'standings-splits.json', { transform: normalizeStandings, validate: isStandingsShape }).catch(() => null);
    if (!result || !result.data || !Array.isArray(result.data.teams)) {
      setStatus(statusEl, "Couldn't find standings for any season.", true);
      return;
    }
    const phase = await decidePhase(manifest, result);
    if (phase.mode === 'postseason') {
      try {
        await showPostseason(manifest, phase, result);
        return;
      } catch (_) { }
    }
    watchForPostseason(manifest, result);
    heading.textContent = 'Standings';
    heading.classList.remove('is-centered');
    const byLeague = new Map();
    for (const t of result.data.teams) {
      const key = t.lg;
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key).push(t);
    }
    for (const teams of byLeague.values()) {
      teams.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
    }
    const names = new Map();
    for (const t of result.data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);
    const spots = computePlayoffSpots(result.data.teams, result.year);
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
        html += standingsTableHtml(teams, result.year, { extended: true, last5, vertical: verticalMql.matches, spots, leagueId: lg, sortByGroup, plainPct: true });
      }
      wrap.innerHTML = html;
    }
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sort]');
      if (!btn || !wrap.contains(btn)) return;
      const group = btn.dataset.group;
      const current = sortByGroup.get(group) || STANDINGS_DEFAULT_SORT;
      sortByGroup.set(group, nextStandingsSort(current, btn.dataset.sort));
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
      } catch (_) { }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }
  const TX_ROTATE_MS = 4500;
  const TX_TYPE_LABELS = {
    TR: 'Trade', SGN: 'Signed', SFA: 'Signed', REL: 'Released', DES: 'DFA', DFA: 'DFA',
    OPT: 'Optioned', CU: 'Recalled', CLW: 'Claimed', ASG: 'Assigned', SC: 'Status',
    NUM: 'Number', RET: 'Retired', DR: 'Draft',
  };
  const TX_BALL_ICON = '<span class="tx-icon tx-icon--neutral"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" focusable="false" aria-hidden="true">' +
    '<path opacity="0.4" d="M14.5 10.6499H9.5" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M16.8203 2H7.18031C5.05031 2 3.32031 3.74 3.32031 5.86V19.95C3.32031 21.75 4.61031 22.51 6.19031 21.64L11.0703 18.93C11.5903 18.64 12.4303 18.64 12.9403 18.93L17.8203 21.64C19.4003 22.52 20.6903 21.76 20.6903 19.95V5.86C20.6803 3.74 18.9503 2 16.8203 2Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const txIconHtml = () => TX_BALL_ICON;
  const TX_GO_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
  async function loadRecentTransactions(manifest) {
    const ticker = document.getElementById('tx-ticker');
    const track = document.getElementById('tx-track');
    if (!ticker || !track) return;
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    const collected = [];
    let monthsChecked = 0;
    while (monthsChecked < 24 && collected.length < 10) {
      const mm = String(m).padStart(2, '0');
      try {
        const data = await fetchSeasonFile(manifest, y, `transactions/${mm}.json`);
        if (data && Array.isArray(data.tx) && data.tx.length) {
          for (const row of data.tx) collected.push(row);
        }
      } catch (_) { }
      monthsChecked++;
      m--;
      if (m === 0) { m = 12; y--; }
      if (y < 1980) break;
    }
    if (collected.length === 0) return;
    collected.sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const top = collected.slice(0, 10);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const shortDate = (d) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d === null || d === undefined ? '' : d));
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return fmtDate(d);
      const base = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
      return Number(m[1]) === now.getFullYear() ? base : `${base}, ${m[1]}`;
    };
    const detailHtml = (detail, playerName) => {
      const name = String(playerName || '');
      const at = name ? detail.indexOf(name) : -1;
      if (at < 0) return escapeHtml(detail);
      return escapeHtml(detail.slice(0, at)) + `<strong>${escapeHtml(name)}</strong>` +
        escapeHtml(detail.slice(at + name.length));
    };
    track.innerHTML = top.map((row, i) => {
      const [date, typeCode, , playerName, , , description] = row;
      const detail = String(description || playerName || 'Transaction');
      const label = TX_TYPE_LABELS[String(typeCode || '').toUpperCase()];
      const logo = txIconHtml(typeCode);
      return `<a class="tx-item${i === 0 ? ' is-active' : ''}" href="${escapeHtml(txPageHref(row))}" aria-hidden="${i === 0 ? 'false' : 'true'}" title="${escapeHtml(detail)}">` +
        `<span class="tx-logo" aria-hidden="true">${logo}</span>` +
        `<span class="tx-body">` +
          `<span class="tx-meta">${label ? `<span class="tx-type">${escapeHtml(label)}</span>` : ''}` +
          `<span class="tx-date">${escapeHtml(shortDate(date))}</span></span>` +
          `<span class="tx-text">${detailHtml(detail, playerName)}</span>` +
        `</span>` +
        `<span class="tx-go" aria-hidden="true">${TX_GO_ICON}</span></a>`;
    }).join('');
    ticker.hidden = false;
    const items = Array.from(track.querySelectorAll('.tx-item'));
    if (items.length < 2) return;
    const dotsEl = document.createElement('div');
    dotsEl.className = 'tx-dots';
    dotsEl.setAttribute('aria-hidden', 'true');
    dotsEl.innerHTML = items.map((_, i) => `<span class="tx-dot${i === 0 ? ' is-active' : ''}"></span>`).join('');
    ticker.appendChild(dotsEl);
    const dots = Array.from(dotsEl.children);
    let idx = 0;
    let paused = false;
    ticker.addEventListener('mouseenter', () => { paused = true; });
    ticker.addEventListener('mouseleave', () => { paused = false; });
    let touchTimer = 0;
    ticker.addEventListener('touchstart', () => { paused = true; clearTimeout(touchTimer); }, { passive: true });
    const touchDone = () => { clearTimeout(touchTimer); touchTimer = setTimeout(() => { paused = false; }, 6000); };
    ticker.addEventListener('touchend', touchDone, { passive: true });
    ticker.addEventListener('touchcancel', touchDone, { passive: true });
    setInterval(() => {
      if (paused || document.hidden) return;
      const next = (idx + 1) % items.length;
      items[idx].classList.remove('is-active');
      items[idx].setAttribute('aria-hidden', 'true');
      dots[idx].classList.remove('is-active');
      items[next].classList.add('is-active');
      items[next].setAttribute('aria-hidden', 'false');
      dots[next].classList.add('is-active');
      idx = next;
    }, TX_ROTATE_MS);
  }
  main();
}
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
    setLoading(statusEl);
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
    loadRecentGames(manifest, id, team.currentName);
    initTeamTabs(manifest, id, team);
  }
  function renderTeam(team) {
    document.title = `${team.currentName} — Hidden Ball`;
    const crumbEl = document.getElementById('crumb-name');
    if (crumbEl) crumbEl.textContent = team.currentName;
    document.getElementById('team-name').textContent = team.currentName;
    renderTeamMeta(team);
    renderTeamInitials(team.currentName);
    setImgWithFallback(
      document.getElementById('team-logo'),
      `/assets/logos/${team.id}.webp`);
    setHeroBanner(document.getElementById('hero'), `/assets/banners/${team.id}.webp`);
    renderTrophies(team.trophies || {});
  }
  function renderTeamMeta(team) {
    const metaEl = document.getElementById('team-meta');
    const lgEl = document.getElementById('team-league');
    const dvEl = document.getElementById('team-division');
    const sepEl = document.getElementById('team-meta-sep');
    let lg = team.league ? String(team.league).trim() : '';
    const dv = team.division ? String(team.division).trim() : '';
    if (lg && dv && dv.toLowerCase().includes(lg.toLowerCase())) lg = '';
    const leaguePageFor = (text) => /\bnational\b|^nl\b/i.test(text) ? '/NL/' : /\bamerican\b|^al\b/i.test(text) ? '/AL/' : '';
    const page = leaguePageFor(String(team.league || '')) || leaguePageFor(String(team.division || ''));
    const fill = (el, text) => {
      const p = leaguePageFor(text) || page;
      if (text && p) el.innerHTML = `<a href="${p}">${escapeHtml(text)}</a>`;
      else el.textContent = text;
    };
    fill(lgEl, lg);
    fill(dvEl, dv);
    lgEl.hidden = !lg;
    dvEl.hidden = !dv;
    sepEl.hidden = !(lg && dv);
    metaEl.hidden = !(lg || dv);
  }
  function renderTeamInitials(name) {
    const el = document.getElementById('team-initials');
    if (!el) return;
    const words = String(name || '').split(/\s+/).filter(Boolean);
    el.textContent = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
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
  async function loadRecentGames(manifest, teamId, teamName) {
    const statusEl2 = document.getElementById('recent-status');
    const grid = document.getElementById('recent-games');
    const heading = document.getElementById('recent-heading');
    setLoading(statusEl2);
    const resolveTeamName = createTeamNameResolver(manifest);
    let found = null;
    let liveEntry = null;
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
      const label = `${verb} ${r.us}\u2013${r.them} vs. ${oppName}, ${day}`;
      const href = `/game/?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}`;
      return `<a class="rg-card ${cls}" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="rg-logo">` +
          `<img src="/assets/logos/${encodeURIComponent(r.oppId)}.webp" alt="" ` +
            `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
          `<span class="rg-logo__fb" hidden>${escapeHtml(shortTeamName(oppName))}</span>` +
        `</span>` +
        `<span class="rg-score">${r.us}&ndash;${r.them}</span>` +
      `</a>`;
    }
    function liveCardHtml(l, oppName) {
      const label = `LIVE: ${l.us}\u2013${l.them} vs. ${oppName}, ${l.label}`;
      const href = `/game/?id=${encodeURIComponent(l.gamePk)}&year=${encodeURIComponent(l.season)}`;
      return `<a class="rg-card rg--live" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
        `<span class="live-dot rg-live-dot" aria-hidden="true"></span>` +
        `<span class="rg-logo">` +
          `<img src="/assets/logos/${encodeURIComponent(l.oppId)}.webp" alt="" ` +
            `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
          `<span class="rg-logo__fb" hidden>${escapeHtml(shortTeamName(oppName))}</span>` +
        `</span>` +
        `<span class="rg-score">${l.us}&ndash;${l.them}</span>` +
      `</a>`;
    }
    async function render() {
      if (!found && !liveEntry) return;
      const liveYear = liveEntry ? Number(liveEntry.season) : null;
      const mix = !!(liveEntry && found && Number(found.year) === liveYear);
      const finished = (found && (!liveEntry || mix)) ? found.list.slice().reverse() : [];
      const year = liveEntry ? liveYear : found.year;
      const [names, liveOpp] = await Promise.all([
        Promise.all(finished.map(r => resolveTeamName(r.oppId))),
        liveEntry ? resolveTeamName(liveEntry.oppId) : Promise.resolve(null),
      ]);
      const cards = [];
      const room = liveEntry ? 4 : 5;
      for (let i = Math.min(room, finished.length) - 1; i >= 0; i--) cards.push(finishedCardHtml(finished[i], names[i], year));
      if (liveEntry) cards.push(liveCardHtml(liveEntry, liveOpp));
      grid.innerHTML = cards.join('');
      heading.textContent = 'Last 5 games';
      clearStatus(statusEl2);
      grid.hidden = false;
      if (liveEntry) renderLiveMatchup(teamId, teamName, liveEntry, liveOpp);
      else if (finished.length > 0) renderLatestMatchup(manifest, teamId, teamName, found.year, finished[0], names[0]);
    }
    async function tick() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = liveByTeam(await fetchLiveGames()).get(String(teamId)) || null;
        const changed = liveSig(next) !== liveSig(liveEntry);
        if (liveEntry && !next) finishedRetries = 3;
        let refetched = false;
        if (finishedRetries > 0) {
          finishedRetries--;
          const f = await findFinished();
          if (f) { found = f; refetched = true; }
        }
        liveEntry = next;
        if (changed || refetched) await render();
      } catch (_) { }
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
      link.href = `/game/?id=${encodeURIComponent(l.gamePk)}&year=${encodeURIComponent(l.season)}`;
      link.setAttribute('aria-label',
        `Live: ${teamName} ${l.us} to ${l.them} vs. ${oppName}, ${l.label} \u2014 open game`);
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
    } catch (_) { }
  }
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
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
      const fromLine = Array.isArray(ls[side]) ? numOrNull(ls[side][1]) : null;
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
      `<span class="mu-logo"><img src="/assets/logos/${encodeURIComponent(teamId)}.webp" alt="" ` +
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
      link.href = `/game/?id=${encodeURIComponent(r.gamePk)}&year=${encodeURIComponent(year)}`;
      link.setAttribute('aria-label',
        `${teamName} ${r.us} to ${r.them} vs. ${oppName} \u2014 open game`);
      link.innerHTML =
        `<div class="mu-top">` +
          latestTeamHtml(teamId, teamName) +
          `<div class="mu-score"><span${usDim}>${r.us}</span><span class="mu-dash">&ndash;</span><span${themDim}>${r.them}</span></div>` +
          latestTeamHtml(r.oppId, oppName) +
        `</div>` +
        `<div class="mu-stats" hidden></div>`;
      block.hidden = false;
      const game = await fetchSeasonFile(manifest, year, `games/${r.gamePk}.json`);
      if (!game || !game.box) return;
      const stats = latestGameStats(game, r.home ? 'h' : 'a', r.home ? 'a' : 'h');
      if (stats.length === 0) return;
      const statsEl = link.querySelector('.mu-stats');
      statsEl.innerHTML = stats.map(latestStatRowHtml).join('');
      statsEl.hidden = false;
    } catch (_) { }
  }
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
  function initTeamTabs(manifest, teamId, teamInfo) {
    const thisYear = new Date().getFullYear();
    const byId = (id) => document.getElementById(id);
    const tabBtns = Array.from(document.querySelectorAll('#tabs-block .tab'));
    const panels = {
      standings: byId('panel-standings'),
      games: byId('panel-games'),
      squad: byId('panel-squad'),
      trophies: byId('panel-trophies'),
    };
    const seasonBar = byId('season-bar');
    const select = byId('season-select');
    if (!select || tabBtns.length === 0) return;
    const resolveName = createTeamNameResolver(manifest);
    const scheduleCache = new Map();
    const loadedYear = { standings: null, games: null, squad: null };
    const tokens = { standings: 0, games: 0, squad: 0 };
    let activeTab = 'standings';
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
    function gameWhen(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      const dateOpts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      if (!/T\d\d:\d\d/.test(String(iso))) return d.toLocaleDateString('en-US', { ...dateOpts, timeZone: 'UTC' });
      return d.toLocaleDateString('en-US', dateOpts) + ' \u00b7 ' + fmtClock24(d);
    }
    function gameRowHtml(g, year, names) {
      const home = String(g.homeTeamId) === String(teamId);
      const us = Number(home ? g.homeScore : g.awayScore);
      const them = Number(home ? g.awayScore : g.homeScore);
      const outcome = us > them ? 'W' : us < them ? 'L' : 'T';
      const verb = outcome === 'W' ? 'Won' : outcome === 'L' ? 'Lost' : 'Tied';
      const awayName = names.get(String(g.awayTeamId)) || `Team ${g.awayTeamId}`;
      const homeName = names.get(String(g.homeTeamId)) || `Team ${g.homeTeamId}`;
      const label = `${verb} ${us}\u2013${them} vs. ${home ? awayName : homeName}`;
      const href = `/game/?id=${encodeURIComponent(g.gamePk)}&year=${encodeURIComponent(year)}`;
      const round = g.gameType && g.gameType !== 'R' ? (TAB_ROUNDS[g.gameType] || 'Postseason') : '';
      return `<div class="gm gm--link">` +
        `<a class="gm-cover" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></a>` +
        `<div class="gm-when">${escapeHtml(gameWhen(g.date))}` +
          (round ? `<span class="gm-tag">${escapeHtml(round)}</span>` : '') + `</div>` +
        `<div class="gm-main">` +
          `<div class="gm-team gm-team--away${home ? '' : ' is-me'}">${teamLinkHtml(g.awayTeamId, awayName)}</div>` +
          `<a class="gm-score gm--${outcome.toLowerCase()}" href="${href}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">` +
            `<span>${g.awayScore}&ndash;${g.homeScore}</span><span class="gm-res">${outcome}</span></a>` +
          `<div class="gm-team gm-team--home${home ? ' is-me' : ''}">${teamLinkHtml(g.homeTeamId, homeName)}</div>` +
        `</div></div>`;
    }
    async function loadGames() {
      const my = ++tokens.games, year = season;
      const status = byId('games-status'), list = byId('games-list');
      list.innerHTML = '';
      setLoading(status);
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
      list.innerHTML = `<div class="gm-list">${games.map(g => gameRowHtml(g, year, names)).join('')}</div>`;
      clearStatus(status);
    }
    async function loadSquad() {
      const my = ++tokens.squad, year = season;
      const status = byId('squad-status'), body = byId('squad-body');
      body.innerHTML = '';
      setLoading(status);
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
            w: readManagerRecord(r).w,
            l: readManagerRecord(r).l,
          };
        }));
      } catch (err) {
        if (my !== tokens.squad) return;
        loadedYear.squad = null;
        setStatus(status, `Couldn't load the ${year} squad (${err.message}).`, true);
        return;
      }
      if (my !== tokens.squad) return;
      const players = rosters && rosters.teams && Array.isArray(rosters.teams[teamId]) ? rosters.teams[teamId].slice() : [];
      if (players.length === 0 && managers.length === 0) {
        setStatus(status, `No squad found for this team in ${year}.`);
        return;
      }
      const posRank = (p) => { const i = TAB_POS_ORDER.indexOf(p); return i === -1 ? 99 : i; };
      const jersey = (j) => { const n = parseInt(j, 10); return Number.isNaN(n) ? 999 : n; };
      players.sort((a, b) =>
        posRank(a[3]) - posRank(b[3]) || jersey(a[2]) - jersey(b[2]) || String(a[1]).localeCompare(String(b[1])));
      let html = '';
      if (managers.length) {
        html += `<h3 class="sub-heading">${managers.length > 1 ? 'Managers' : 'Manager'}</h3>`;
        html += `<ul class="staff-list">` + managers.map((m) => {
          const rec = m.w !== null && m.l !== null ? `<span class="dim">${escapeHtml(m.w)}\u2013${escapeHtml(m.l)}</span>` : '';
          return `<li><a class="team-link" href="/manager/?id=${encodeURIComponent(m.id)}">${escapeHtml(m.name)}</a>${rec}</li>`;
        }).join('') + `</ul>`;
      }
      html += `<h3 class="sub-heading">Players (${players.length})</h3>`;
      if (players.length) {
        html += `<div class="table-scroll"><table class="ledger"><thead><tr>` +
          `<th class="left">#</th><th class="left">Player</th><th class="left">Pos</th><th class="left">Status</th>` +
          `</tr></thead><tbody>` +
          players.map(([id, name, num, pos, code]) => `<tr>` +
            `<td class="num">${escapeHtml(num || '\u2014')}</td>` +
            `<td class="left"><a class="team-link" href="/player/?id=${encodeURIComponent(id)}">${escapeHtml(name || `Player ${id}`)}</a></td>` +
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
    async function loadStandings() {
      const my = ++tokens.standings, year = season;
      const status = byId('stand-status'), body = byId('stand-body');
      body.innerHTML = '';
      setLoading(status);
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
      const leagueRows = sortStandingsTeams(rows.filter(t => String(t.lg) === String(me.lg)), STANDINGS_DEFAULT_SORT);
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
        `<div class="table-scroll"><table class="ledger ledger--standings"><thead><tr>` +
          `<th class="left">#</th><th class="left">Team</th><th class="left">Div</th>` +
          `<th title="wins">W</th><th title="losses">L</th><th title="win percentage">Pct</th>` +
        `</tr></thead><tbody>${trs}</tbody></table></div>`;
      clearStatus(status);
    }
    function ensureLoaded() {
      if (activeTab === 'trophies' || loadedYear[activeTab] === season) return;
      loadedYear[activeTab] = season;
      if (activeTab === 'standings') loadStandings();
      else if (activeTab === 'games') loadGames();
      else if (activeTab === 'squad') loadSquad();
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
    async function pickDefaultSeason() {
      const floor = Math.max(TAB_FIRST_YEAR, thisYear - 10);
      for (let y = thisYear; y >= floor; y--) {
        try {
          if (teamGames(await getSchedule(y)).length > 0) return y;
        } catch (_) { }
      }
      return thisYear;
    }
    tabBtns.forEach((b) => { b.disabled = true; });
    select.disabled = true;
    setLoading(byId('stand-status'));
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
      showTab('standings');
    })();
  }
  main();
}
function runTeamsPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const gridEl = document.getElementById('team-grid');
  const searchEl = document.getElementById('team-search');
  const clearBtn = document.getElementById('team-search-clear');
  const countEl = document.getElementById('team-count');
  const ACTIVE_BY_LEAGUE = {
    103: [108, 110, 111, 114, 116, 117, 118, 133, 136, 139, 140, 141, 142, 145, 147],
    104: [109, 112, 113, 115, 119, 120, 121, 134, 135, 137, 138, 143, 144, 146, 158],
  };
  const LEAGUE_TITLES = { 103: 'American League', 104: 'National League' };
  const DIVISIONS = ['East', 'Central', 'West'];
  const activeLeagueOf = new Map();
  for (const lg of Object.keys(ACTIVE_BY_LEAGUE)) {
    for (const id of ACTIVE_BY_LEAGUE[lg]) activeLeagueOf.set(id, Number(lg));
  }
  let teams = [];
  const norm = (s) => String(s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  function initials(name) {
    const words = String(name).split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  function logoHtml(t) {
    return `<span class="team-logo-card tm-logo">` +
      `<img src="/assets/logos/${encodeURIComponent(t.id)}.webp" alt="" loading="lazy" decoding="async" ` +
        `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
      `<span class="tm-logo__fb" aria-hidden="true" hidden>${escapeHtml(initials(t.name))}</span>` +
    `</span>`;
  }
  function cardHtml(t) {
    const short = t.active ? shortTeamName(t.name) : '';
    const nameHtml = short && short !== t.name
      ? `<span class="tn-full">${escapeHtml(t.name)}</span><span class="tn-short">${escapeHtml(short)}</span>`
      : escapeHtml(t.name);
    const meta = t.meta ? `<span class="tm-card__meta">${escapeHtml(t.meta)}</span>` : '';
    return `<a class="tm-card${t.active ? '' : ' tm-card--inactive'}" href="/team/?id=${encodeURIComponent(t.id)}" ` +
      `aria-label="${escapeHtml(t.name)}">` +
      logoHtml(t) +
      `<span class="tm-card__text"><span class="tm-card__name">${nameHtml}</span>${meta}</span>` +
    `</a>`;
  }
  function leagueIconHtml(lgId) {
    const file = lgId === 103 ? 'al' : 'nl';
    return `<span class="team-logo-card tm-league__icon"><img src="/assets/leagues/${file}.webp" alt="" ` +
      `onerror="this.onerror=null;this.parentNode.style.display='none';"></span>`;
  }
  function matches(t, q) {
    if (!q) return true;
    if (norm(t.name).includes(q)) return true;
    if (t.active && norm(shortTeamName(t.name)).includes(q)) return true;
    return t.former.some((n) => norm(n).includes(q));
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  function render() {
    const raw = searchEl.value || '';
    const q = norm(raw);
    clearBtn.hidden = raw.length === 0;
    const shown = teams.filter((t) => matches(t, q));
    let html = '';
    for (const lg of [103, 104]) {
      const inLeague = shown.filter((t) => t.active && t.league === lg);
      if (inLeague.length === 0) continue;
      const total = teams.filter((t) => t.active && t.league === lg).length;
      let divs = '';
      for (const dv of DIVISIONS) {
        const list = inLeague.filter((t) => t.division === dv).sort(byName);
        if (list.length === 0) continue;
        divs += `<div class="tm-div"><h3 class="tm-div__title">${dv}</h3>` +
          `<div class="tm-list">${list.map(cardHtml).join('')}</div></div>`;
      }
      const other = inLeague.filter((t) => !DIVISIONS.includes(t.division)).sort(byName);
      if (other.length) {
        divs += `<div class="tm-div"><h3 class="tm-div__title">Other</h3>` +
          `<div class="tm-list">${other.map(cardHtml).join('')}</div></div>`;
      }
      html += `<section class="tm-league" aria-labelledby="tm-h-${lg}">` +
        `<h2 class="tm-league__title" id="tm-h-${lg}">${leagueIconHtml(lg)}<span>${LEAGUE_TITLES[lg]}</span>` +
        `<span class="tm-pill">${q ? `${inLeague.length} of ${total}` : total}</span></h2>` +
        `<div class="tm-divs">${divs}</div></section>`;
    }
    const inactiveAll = teams.filter((t) => !t.active);
    const inactive = shown.filter((t) => !t.active).sort(byName);
    if (inactive.length > 0) {
      html += `<section class="tm-league tm-league--inactive" aria-labelledby="tm-h-inactive">` +
        `<h2 class="tm-league__title" id="tm-h-inactive"><span>Inactive teams</span>` +
        `<span class="tm-pill">${q ? `${inactive.length} of ${inactiveAll.length}` : inactiveAll.length}</span></h2>` +
        `<div class="tm-list tm-list--wide">${inactive.map(cardHtml).join('')}</div></section>`;
    }
    if (shown.length === 0) {
      html = `<p class="state-msg tm-empty">No teams match \u201C${escapeHtml(raw.trim())}\u201D.</p>`;
    }
    gridEl.innerHTML = html;
    if (countEl) {
      countEl.textContent = q
        ? `${shown.length} of ${teams.length} teams`
        : `${teams.length} teams \u00B7 ${teams.filter((t) => t.active).length} active`;
    }
  }
  async function enrich(manifest) {
    const recs = await Promise.all(teams.map(async (t) => {
      try { return await fetchCoreRecord(manifest, 'teams', t.id); } catch (_) { return null; }
    }));
    teams.forEach((t, i) => {
      const r = recs[i];
      if (!r) return;
      const hist = Array.isArray(r.nameHistory) ? r.nameHistory : [];
      const names = hist.map((h) => h && h.name).filter(Boolean);
      if (r.currentName && r.currentName !== t.name) names.push(r.currentName);
      t.former = [...new Set(names.filter((n) => n !== t.name))];
      t.rec = r;
    });
    const activeByName = new Map();
    for (const t of teams) {
      if (!t.active) continue;
      for (const n of [t.name, ...t.former]) activeByName.set(norm(n), t);
    }
    for (const t of teams) {
      if (t.active) continue;
      const parts = [];
      const heir = [t.name, ...t.former].map((n) => activeByName.get(norm(n))).find(Boolean);
      if (heir) parts.push(`Now the ${heir.name}`);
      else if (t.former.length) parts.push(`Also known as ${t.former.slice(0, 2).join(', ')}`);
      const lg = t.rec && typeof t.rec.league === 'string' ? t.rec.league.trim() : '';
      if (lg) parts.push(lg);
      t.meta = parts.join(' \u00B7 ');
    }
    render();
  }
  async function main() {
    setLoading(statusEl);
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
    const year = new Date().getFullYear();
    teams = entries.filter((e) => e.id !== 14).map((e) => {
      const id = Number(e.id);
      const lg = activeLeagueOf.get(id);
      return {
        id: e.id,
        name: String(e.name),
        active: lg !== undefined,
        league: lg,
        division: lg !== undefined ? divisionFor(id, year) : null,
        former: [],
        meta: '',
        rec: null,
      };
    });
    render();
    clearStatus(statusEl);
    contentEl.hidden = false;
    let timer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(render, 80);
    });
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchEl.value) { searchEl.value = ''; render(); }
    });
    clearBtn.addEventListener('click', () => { searchEl.value = ''; render(); searchEl.focus(); });
    enrich(manifest);
  }
  main();
}
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
      const name = team ? team.currentName : `Team ${teamId}`;
      teamNameCache.set(teamId, name);
      return name;
    } catch (_) {
      return `Team ${teamId}`;
    }
  }
  function inningsToOuts(ip) {
    if (ip === null || ip === undefined) return 0;
    const s = String(ip);
    const [whole, frac = '0'] = s.split('.');
    const w = parseInt(whole, 10) || 0;
    const f = parseInt(frac, 10) || 0;
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
    setLoading(statusEl);
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
    Promise.all([statsPromise, extrasPromise]).then(async ([rows, api]) => {
      const extra = await buildExtra(manifest, rows, api);
      renderBio(player, extra);
      renderAwards(api);
    }).catch(() => {});
  }
  const COUNTRY_FLAGS = {
    usa: ['us', 'United States'], us: ['us', 'United States'], unitedstates: ['us', 'United States'],
    unitedstatesofamerica: ['us', 'United States'],
    dominicanrepublic: ['do', 'Dominican Republic'], dr: ['do', 'Dominican Republic'],
    venezuela: ['ve', 'Venezuela'], cuba: ['cu', 'Cuba'],
    puertorico: ['pr', 'Puerto Rico'], pr: ['pr', 'Puerto Rico'],
    canada: ['ca', 'Canada'], mexico: ['mx', 'Mexico'], japan: ['jp', 'Japan'],
    southkorea: ['kr', 'South Korea'], korea: ['kr', 'South Korea'], republicofkorea: ['kr', 'South Korea'],
    panama: ['pa', 'Panama'], colombia: ['co', 'Colombia'], curacao: ['cw', 'Cura\u00e7ao'],
    nicaragua: ['ni', 'Nicaragua'], aruba: ['aw', 'Aruba'], australia: ['au', 'Australia'],
    netherlands: ['nl', 'Netherlands'], holland: ['nl', 'Netherlands'], taiwan: ['tw', 'Taiwan'],
    brazil: ['br', 'Brazil'], bahamas: ['bs', 'Bahamas'],
    virginislands: ['vi', 'U.S. Virgin Islands'], usvirginislands: ['vi', 'U.S. Virgin Islands'],
    germany: ['de', 'Germany'], italy: ['it', 'Italy'],
    uk: ['gb', 'United Kingdom'], unitedkingdom: ['gb', 'United Kingdom'], greatbritain: ['gb', 'United Kingdom'],
    england: ['gb-eng', 'England'], scotland: ['gb-sct', 'Scotland'], wales: ['gb-wls', 'Wales'],
    northernireland: ['gb-nir', 'Northern Ireland'], ireland: ['ie', 'Ireland'],
    honduras: ['hn', 'Honduras'], jamaica: ['jm', 'Jamaica'], lithuania: ['lt', 'Lithuania'],
    czechrepublic: ['cz', 'Czech Republic'], czechia: ['cz', 'Czech Republic'],
    russia: ['ru', 'Russia'], southafrica: ['za', 'South Africa'], peru: ['pe', 'Peru'],
    philippines: ['ph', 'Philippines'], china: ['cn', 'China'], spain: ['es', 'Spain'],
    france: ['fr', 'France'], austria: ['at', 'Austria'], guam: ['gu', 'Guam'],
    caymanislands: ['ky', 'Cayman Islands'], belgium: ['be', 'Belgium'], sweden: ['se', 'Sweden'],
    saudiarabia: ['sa', 'Saudi Arabia'], norway: ['no', 'Norway'], poland: ['pl', 'Poland'],
    greece: ['gr', 'Greece'], hongkong: ['hk', 'Hong Kong'], israel: ['il', 'Israel'],
    singapore: ['sg', 'Singapore'], vietnam: ['vn', 'Vietnam'], indonesia: ['id', 'Indonesia'],
    slovakia: ['sk', 'Slovakia'], finland: ['fi', 'Finland'], denmark: ['dk', 'Denmark'],
    afghanistan: ['af', 'Afghanistan'], cameroon: ['cm', 'Cameroon'], ukraine: ['ua', 'Ukraine'],
    croatia: ['hr', 'Croatia'], hungary: ['hu', 'Hungary'], switzerland: ['ch', 'Switzerland'],
    nigeria: ['ng', 'Nigeria'], belize: ['bz', 'Belize'], costarica: ['cr', 'Costa Rica'],
    ecuador: ['ec', 'Ecuador'], guyana: ['gy', 'Guyana'],
    trinidadandtobago: ['tt', 'Trinidad and Tobago'], trinidad: ['tt', 'Trinidad and Tobago'],
    barbados: ['bb', 'Barbados'], antigua: ['ag', 'Antigua and Barbuda'], antiguaandbarbuda: ['ag', 'Antigua and Barbuda'],
    stkittsandnevis: ['kn', 'St. Kitts and Nevis'], martinique: ['mq', 'Martinique'], guadeloupe: ['gp', 'Guadeloupe'],
    americansamoa: ['as', 'American Samoa'], northernmarianaislands: ['mp', 'Northern Mariana Islands'],
    bermuda: ['bm', 'Bermuda'], argentina: ['ar', 'Argentina'], chile: ['cl', 'Chile'], bolivia: ['bo', 'Bolivia'],
    uruguay: ['uy', 'Uruguay'], paraguay: ['py', 'Paraguay'], elsalvador: ['sv', 'El Salvador'],
    guatemala: ['gt', 'Guatemala'], haiti: ['ht', 'Haiti'], sintmaarten: ['sx', 'Sint Maarten'],
    bonaire: ['bq', 'Bonaire'], newzealand: ['nz', 'New Zealand'], india: ['in', 'India'],
    turkey: ['tr', 'Turkey'], portugal: ['pt', 'Portugal'], romania: ['ro', 'Romania'],
    bulgaria: ['bg', 'Bulgaria'], serbia: ['rs', 'Serbia'], slovenia: ['si', 'Slovenia'],
    latvia: ['lv', 'Latvia'], estonia: ['ee', 'Estonia'], belarus: ['by', 'Belarus'],
    thailand: ['th', 'Thailand'], malaysia: ['my', 'Malaysia'], egypt: ['eg', 'Egypt'],
    morocco: ['ma', 'Morocco'], ghana: ['gh', 'Ghana'], kenya: ['ke', 'Kenya'], liberia: ['lr', 'Liberia'],
    zimbabwe: ['zw', 'Zimbabwe'], lebanon: ['lb', 'Lebanon'], iran: ['ir', 'Iran'], iraq: ['iq', 'Iraq'],
    luxembourg: ['lu', 'Luxembourg'], iceland: ['is', 'Iceland'], cyprus: ['cy', 'Cyprus'],
    montserrat: ['ms', 'Montserrat'], stlucia: ['lc', 'St. Lucia'], grenada: ['gd', 'Grenada'],
    suriname: ['sr', 'Suriname'], britishvirginislands: ['vg', 'British Virgin Islands'],
  };
  function flagEmoji(code) {
    if (code.indexOf('-') !== -1) {
      const tags = code.replace('-', '');
      return '\u{1F3F4}' + Array.from(tags).map((c) => String.fromCodePoint(0xE0000 + c.charCodeAt(0))).join('') + '\u{E007F}';
    }
    return Array.from(code.toUpperCase()).map((c) => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
  }
  function countryHtml(raw) {
    const name = String(raw || '').trim();
    if (!name) return null;
    const hit = COUNTRY_FLAGS[name.toLowerCase().replace(/[^a-z]/g, '')];
    if (!hit) return escapeHtml(name);
    const code = hit[0], label = hit[1];
    return `<span class="country">` +
      `<span class="country__flag" role="img" aria-label="${escapeHtml(label)} flag">` +
        `<img src="https://flagcdn.com/w40/${code}.png" srcset="https://flagcdn.com/w80/${code}.png 2x" alt="" ` +
          `height="18" loading="lazy" decoding="async" ` +
          `onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.hidden=false;">` +
        `<span class="country__emoji" hidden>${flagEmoji(code)}</span>` +
      `</span>` +
      `<span class="country__name">${escapeHtml(label)}</span>` +
    `</span>`;
  }
  function renderBio(p, extra) {
    const api = extra && extra.api ? extra.api : null;
    document.title = `${p.fullName} — Hidden Ball`;
    const crumbEl = document.getElementById('crumb-name');
    if (crumbEl) crumbEl.textContent = p.fullName;
    document.getElementById('player-name').textContent = p.fullName;
    const iniEl = document.getElementById('player-initials');
    if (iniEl) {
      iniEl.textContent = String(p.fullName || '').split(/\s+/).filter(Boolean)
        .filter((w, i, a) => i === 0 || i === a.length - 1).map((w) => w[0]).join('').toUpperCase();
    }
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
      ['Country', api && api.birthCountry ? countryHtml(api.birthCountry) : null],
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
      `<div class="player-bio__row"><dt>${label}</dt><dd>${val}</dd></div>`
    ).join('');
  }
  async function loadCareerStats(manifest, playerId, player) {
    const debutYear = player.debutDate ? parseInt(String(player.debutDate).slice(0, 4), 10) : 1980;
    const endYear = player.lastActiveSeason ? parseInt(player.lastActiveSeason, 10) : new Date().getFullYear();
    const start = Math.max(1980, Math.min(debutYear, endYear));
    const end = Math.min(2025, Math.max(debutYear, endYear));
    const years = [];
    for (let y = start; y <= end; y++) years.push(y);
    setLoading(statsStatusEl);
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
    return { hitting, pitching, fielding };
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
  const STATSAPI = 'https://statsapi.mlb.com/api/v1';
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  async function apiJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    return res.json();
  }
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
  function fmtShortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return fmtOrDash(iso);
    return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
  }
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
    const groups = new Map();
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
        if (name === 'heatmap' && heatmap) heatmap.redraw();
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
    show('heatmap');
  }
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
    const logCache = new Map();
    const homeCache = new Map();
    let token = 0;
    let teams = [];
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
        } catch (_) { }
        return regular.concat(post);
      })();
      logCache.set(key, p);
      p.catch(() => logCache.delete(key));
      return p;
    }
    function addScheduleHomes(map, data) {
      for (const d of (data && data.dates) || []) {
        for (const g of d.games || []) {
          const h = g.teams && g.teams.home && g.teams.home.team;
          if (g.gamePk !== null && g.gamePk !== undefined && h && h.id !== null && h.id !== undefined) {
            map.set(String(g.gamePk), String(h.id));
          }
        }
      }
    }
    function fetchHomeMap(teamId, year) {
      const key = `${teamId}|${year}`;
      if (homeCache.has(key)) return homeCache.get(key);
      const p = (async () => {
        const base = `${STATSAPI}/schedule?sportId=1&teamId=${encodeURIComponent(teamId)}` +
          `&season=${encodeURIComponent(year)}&fields=dates,games,gamePk,teams,home,team,id`;
        const map = new Map();
        const results = await Promise.allSettled([
          apiJson(`${base}&gameType=R,F,D,L,W,C`),
          apiJson(base),
        ]);
        let ok = 0;
        for (const r of results) if (r.status === 'fulfilled') { addScheduleHomes(map, r.value); ok++; }
        if (!ok) throw new Error('schedule unavailable');
        return map;
      })();
      homeCache.set(key, p);
      p.catch(() => homeCache.delete(key));
      return p;
    }
    async function fillMissingHome(map, gamePks) {
      const missing = gamePks.filter((pk) => !map.has(String(pk)));
      for (let i = 0; i < missing.length; i += 40) {
        const chunk = missing.slice(i, i + 40);
        try {
          const data = await apiJson(`${STATSAPI}/schedule?sportId=1&gamePks=${chunk.map(encodeURIComponent).join(',')}` +
            `&fields=dates,games,gamePk,teams,home,team,id`);
          addScheduleHomes(map, data);
        } catch (_) { }
      }
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
    function renderLog(games, group, year, homeMap, names) {
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
        const nameOf = (t, fb) => escapeHtml(t.name || (names && names.get(String(t.id))) || fb);
        const homeId = homeMap && gamePk !== null && gamePk !== undefined ? homeMap.get(String(gamePk)) : undefined;
        let isHome = null;
        if (homeId !== undefined) isHome = homeId === String(myTeam.id);
        else if (typeof s.isHome === 'boolean') isHome = s.isHome;
        const venue = 'vs';
        const res = s.isWin === true ? '<span class="pg-res pg-res--w">W</span>'
          : s.isWin === false ? '<span class="pg-res pg-res--l">L</span>' : '\u2014';
        let dec = '';
        if (isPit) {
          const d = st.wins === 1 ? 'W' : st.losses === 1 ? 'L' : st.saves === 1 ? 'SV' : st.holds === 1 ? 'H' : '';
          dec = `<td class="num">${d || '\u2014'}</td>`;
        }
        const cells = cols.map(([, k]) => `<td class="num">${fmtOrDash(st[k])}</td>`).join('');
        const rowAttrs = gamePk
          ? ` class="pg-row pg-row--link" data-href="${escapeHtml(gameHref({ gamePk, season: year }))}"` : '';
        return `<tr${rowAttrs}>` +
          `<td class="left">${dateCell}${tag}</td>` +
          `<td class="left">${teamLinkHtml(myTeam.id, nameOf(myTeam, 'Team'))}</td>` +
          `<td class="left">${venue}</td>` +
          `<td class="left">${teamLinkHtml(opp.id, nameOf(opp, 'Opponent'))}</td>` +
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
      setLoading(status);
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
        .sort((a, b) => {
          const byDate = String(b.date || '').localeCompare(String(a.date || ''));
          if (byDate !== 0) return byDate;
          return (Number(b.game && b.game.gamePk) || 0) - (Number(a.game && a.game.gamePk) || 0);
        });
      if (games.length === 0) {
        setStatus(status, `No ${GROUP_NAMES[group].toLowerCase()} games found for ${team.name} in ${year}.`);
        return;
      }
      let homeMap = null;
      try { homeMap = await fetchHomeMap(team.id, year); } catch (_) { homeMap = null; }
      if (my !== token) return;
      if (!homeMap) homeMap = new Map();
      await fillMissingHome(homeMap, games.map((g) => g.game && g.game.gamePk).filter((pk) => pk !== null && pk !== undefined));
      if (my !== token) return;
      const names = new Map();
      const ids = new Set();
      for (const g of games) {
        if (g.team && g.team.id !== undefined && !g.team.name) ids.add(g.team.id);
        if (g.opponent && g.opponent.id !== undefined && !g.opponent.name) ids.add(g.opponent.id);
      }
      await Promise.all([...ids].map(async (id) => { names.set(String(id), await teamName(manifest, id)); }));
      if (my !== token) return;
      clearStatus(status);
      list.innerHTML = renderLog(games, group, year, homeMap, names);
    }
    list.addEventListener('click', (e) => {
      if (e.target.closest('a, button, select, input')) return;
      const tr = e.target.closest('tr[data-href]');
      if (!tr || !list.contains(tr)) return;
      const sel = window.getSelection ? String(window.getSelection()) : '';
      if (sel) return;
      const href = tr.getAttribute('data-href');
      if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
      else window.location.href = href;
    });
    async function start() {
      setLoading(status);
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
  async function renderCareerTab(manifest, player, statsPromise, extrasPromise) {
    const status = document.getElementById('career-status');
    const body = document.getElementById('career-body');
    setLoading(status);
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
  const HM_VERSION = 1;
  const HM_W = 520, HM_H = 460, HM_X0 = -260, HM_Y1 = 430;
  const HM_FIELDS = 'allPlays,result,eventType,matchup,batter,pitcher,id,batSide,code,' +
    'playEvents,details,isInPlay,hitData,launchSpeed,launchAngle,totalDistance,coordinates,coordX,coordY';
  const HM_EVENT_RES = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  const HM_RES_COLORS = { OUT: '#9aa4b2', '1B': '#4ade80', '2B': '#38bdf8', '3B': '#c084fc', HR: '#facc15' };
  const HM_RES_NAMES = { OUT: 'Out / error', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' };
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
  let hmUseFields = true;
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
            hmUseFields = false;
          } else if (res.status === 404) {
            const e = new Error('404'); e.noRetry = true; throw e;
          } else if (res.status === 429 || res.status >= 500) {
            throw new Error(String(res.status));
          } else {
            hmUseFields = false;
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
  async function hmFetchGames(playerId, year, group) {
    const base = `${STATSAPI}/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=${group}&season=${year}`;
    let reg;
    try { reg = await apiJson(`${base}&gameType=R`); } catch (_) { reg = await apiJson(base); }
    let post = null;
    try { post = await apiJson(`${base}&gameType=P`); } catch (_) { }
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
  const hmPlaceCache = new WeakMap();
  function hmPlace(SF, p) {
    let c = hmPlaceCache.get(p);
    if (c) return c;
    const hx = Math.min(255, Math.max(-255, p.x)), hy = Math.min(425, Math.max(-25, p.y));
    c = { gx: hx, gy: hy, dx: hx, dy: hy, dz: 0 };
    const deg = Math.atan2(hx, hy) * 180 / Math.PI;
    if (hy > 0 && Math.abs(deg) <= 45) {
      const fe = SF.FENCE(deg), r0 = Math.hypot(hx, hy);
      if (r0 > 0) {
        const inside = Math.min(r0, fe - 3);
        c.gx = hx * inside / r0; c.gy = hy * inside / r0;
        c.dx = c.gx; c.dy = c.gy;
        if (p.r === 'HR') { const out = fe + 12; c.dx = hx * out / r0; c.dy = hy * out / r0; c.dz = 16; }
      }
    }
    hmPlaceCache.set(p, c);
    return c;
  }
  function hmFieldSvg() {
    const SF = LiveKit.SF;
    return `<svg class="hm-svg" viewBox="0 0 ${SF.W} ${SF.H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
      `aria-label="Baseball field seen from a high camera behind home plate">${SF.svg(null)}</svg>`;
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
    const cacheKey = (year, group) => `mlb-archive:hm:v${HM_VERSION}:${playerId}:${group}:${year}`;
    function readCache(year, group) {
      try {
        const raw = localStorage.getItem(cacheKey(year, group));
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!c || !Array.isArray(c.hits)) return null;
        if (year >= thisYear && Date.now() - c.at > 3 * 3600 * 1000) return null;
        return c;
      } catch (_) { return null; }
    }
    function writeCache(year, group, payload) {
      try { localStorage.setItem(cacheKey(year, group), JSON.stringify({ at: Date.now(), ...payload })); } catch (_) { }
    }
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
          const res = await loadSeason(y, group, my, (done, total) => {
            if (my !== token) return;
            const frac = (k + (total ? done / total : 1)) / years.length;
            bar.style.width = `${Math.round(frac * 100)}%`;
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
      state.pos = null;
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
        const ang = Math.atan2(p.x, p.y) * 180 / Math.PI;
        if (isPit) {
          s.z[ang < -15 ? 0 : ang > 15 ? 2 : 1]++;
        } else {
          const lefty = p.s === 'L';
          if (Math.abs(ang) <= 15) s.z[1]++;
          else if ((ang < 0) !== lefty) s.z[0]++;
          else s.z[2]++;
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
      const sub = state.loading ? ''
        : state.all.length === state.shown.length ? `${state.all.length.toLocaleString('en-US')} ${isPit ? 'balls in play against' : 'batted balls'}`
        : `${state.shown.length.toLocaleString('en-US')} of ${state.all.length.toLocaleString('en-US')} shown`;
      side.innerHTML =
        `<h3 class="hm-side__title">${escapeHtml(state.label || 'Heat map')}</h3><p class="hm-side__sub">${sub}</p>` +
        `<div class="hm-tiles">${tiles}</div>` +
        `<h4 class="hm-side__h">${isPit ? 'Where hitters hit it' : 'Spray'}</h4>${spray}` +
        `<h4 class="hm-side__h">Legend</h4>${legend}` +
        `<p class="hm-note">Balls in play</p>`;
    }
    const SF = LiveKit.SF;
    const HT_W = 320, HT_H = Math.round(HT_W * SF.H / SF.W);
    let groundMap = null;
    function buildGroundMap() {
      const gx = new Float32Array(HT_W * HT_H), gy = new Float32Array(HT_W * HT_H);
      const sx = SF.W / HT_W, sy = SF.H / HT_H;
      for (let j = 0; j < HT_H; j++) {
        for (let i = 0; i < HT_W; i++) {
          const g = SF.unproject((i + 0.5) * sx, (j + 0.5) * sy), k = j * HT_W + i;
          if (g && Math.abs(g[0]) < 600 && g[1] > -60 && g[1] < 600) { gx[k] = g[0]; gy[k] = g[1]; }
          else { gx[k] = NaN; gy[k] = NaN; }
        }
      }
      return { gx, gy };
    }
    function metrics() {
      const cssW = field.clientWidth;
      if (!cssW) return null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cssW * dpr), h = Math.round(w * SF.H / SF.W);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      return { cssW, dpr, w, h, s: w / SF.W };
    }
    function clipFair(ctx, m) {
      ctx.beginPath();
      let q = SF.P(0, 0, 0);
      ctx.moveTo(q.x * m.s, q.y * m.s);
      for (let d = -45; d <= 45.001; d += 3) {
        const a = SF.polar(d, SF.FENCE(d));
        q = SF.P(a[0], a[1], 0);
        ctx.lineTo(q.x * m.s, q.y * m.s);
      }
      ctx.closePath();
      ctx.clip();
    }
    function drawHeat(ctx, m, pts) {
      const CELL = 4, gw = HM_W / CELL, gh = Math.ceil(HM_H / CELL), Y0 = HM_Y1 - HM_H;
      const grid = new Float32Array(gw * gh);
      const sigma = state.spread / 2;
      const reach = Math.ceil(sigma * 2.6 / CELL);
      const inv = 1 / (2 * sigma * sigma);
      for (const p of pts) {
        const c = hmPlace(SF, p);
        const ci = Math.floor((c.gx - HM_X0) / CELL), cj = Math.floor((c.gy - Y0) / CELL);
        for (let j = Math.max(0, cj - reach); j <= Math.min(gh - 1, cj + reach); j++) {
          const dy = Y0 + (j + 0.5) * CELL - c.gy;
          for (let i = Math.max(0, ci - reach); i <= Math.min(gw - 1, ci + reach); i++) {
            const dx = HM_X0 + (i + 0.5) * CELL - c.gx;
            grid[j * gw + i] += Math.exp(-(dx * dx + dy * dy) * inv);
          }
        }
      }
      let max = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
      const denom = Math.max(max, 5);
      if (!groundMap) groundMap = buildGroundMap();
      heatCanvas.width = HT_W; heatCanvas.height = HT_H;
      const hctx = heatCanvas.getContext('2d');
      const img = hctx.createImageData(HT_W, HT_H);
      const gxs = groundMap.gx, gys = groundMap.gy;
      for (let k = 0; k < gxs.length; k++) {
        const x = gxs[k];
        if (x !== x) continue;
        const fx = (x - HM_X0) / CELL - 0.5, fy = (gys[k] - Y0) / CELL - 0.5;
        const i0 = Math.floor(fx), j0 = Math.floor(fy);
        if (i0 < 0 || j0 < 0 || i0 >= gw - 1 || j0 >= gh - 1) continue;
        const tx = fx - i0, ty = fy - j0, o = j0 * gw + i0;
        const v = grid[o] * (1 - tx) * (1 - ty) + grid[o + 1] * tx * (1 - ty) + grid[o + gw] * (1 - tx) * ty + grid[o + gw + 1] * tx * ty;
        const idx = Math.min(255, Math.floor(Math.pow(v / denom, 0.8) * 255)) * 4;
        img.data[k * 4] = HM_LUT[idx]; img.data[k * 4 + 1] = HM_LUT[idx + 1];
        img.data[k * 4 + 2] = HM_LUT[idx + 2]; img.data[k * 4 + 3] = HM_LUT[idx + 3];
      }
      hctx.putImageData(img, 0, 0);
      ctx.save();
      clipFair(ctx, m);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(heatCanvas, 0, 0, HT_W, HT_H, 0, 0, m.w, m.h);
      ctx.restore();
    }
    function drawDots(ctx, m, pts) {
      const pos = new Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        const c = hmPlace(SF, pts[i]), q = SF.P(c.dx, c.dy, c.dz);
        const cssPerFt = q.k * m.s / m.dpr;
        pos[i] = { x: q.x * m.s, y: q.y * m.s, r: Math.min(6.2, Math.max(3, cssPerFt * 3.4)) * m.dpr };
      }
      state.pos = pos;
      ctx.lineWidth = Math.max(1, m.dpr);
      ctx.strokeStyle = 'rgba(10,14,20,0.85)';
      for (const res of ['OUT', '1B', '2B', '3B', 'HR']) {
        ctx.fillStyle = HM_RES_COLORS[res];
        ctx.globalAlpha = res === 'OUT' ? 0.8 : 0.95;
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].r !== res) continue;
          const o = pos[i];
          ctx.beginPath();
          ctx.arc(o.x, o.y, res === 'HR' ? o.r * 1.35 : o.r, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (hoverIdx >= 0 && pos[hoverIdx]) {
        const o = pos[hoverIdx];
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#f9f8f4'; ctx.lineWidth = Math.max(1.5, m.dpr * 1.5); ctx.stroke();
      }
    }
    function draw() {
      rafId = 0;
      const m = metrics();
      if (!m) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, m.w, m.h);
      state.pos = null;
      if (!state.shown.length) return;
      if (state.view === 'heat') drawHeat(ctx, m, state.shown);
      else drawDots(ctx, m, state.shown);
    }
    function scheduleDraw() {
      if (rafId) return;
      rafId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(draw) : (draw(), 0);
    }
    function nearest(ev) {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !state.pos) return { idx: -1, rect };
      const sc = canvas.width / rect.width;
      const mx = (ev.clientX - rect.left) * sc, my = (ev.clientY - rect.top) * sc;
      const maxD = 12 * sc;
      let best = -1, bd = maxD * maxD;
      for (let i = 0; i < state.pos.length; i++) {
        const o = state.pos[i];
        const d = (o.x - mx) * (o.x - mx) + (o.y - my) * (o.y - my);
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
    async function start() {
      progress.hidden = false;
      bar.style.width = '0%';
      const [rows, api] = await Promise.all([statsPromise, extrasPromise]);
      const sets = { hitting: new Set(), pitching: new Set() };
      for (const g of ['hitting', 'pitching']) for (const r of rows[g] || []) sets[g].add(r.year);
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
        progress.hidden = true;
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
    start().catch((err) => { progress.hidden = true; setStatus(status, `Couldn't start the heat map (${err.message}).`, true); });
    renderSide();
    return { redraw: scheduleDraw };
  }
  main();
}
function runPlayersPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    setLoading(statusEl);
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
      hrefFor: (e) => `/player/?id=${e.id}`,
      maxRender: 100,
      emptyMessage: 'No players match your search.',
    });
    clearStatus(statusEl);
    contentEl.hidden = false;
  }
  main();
}
function readManagerRecord(row) {
  const leaves = [];
  (function walk(o, path, depth) {
    if (o === null || o === undefined || depth > 4) return;
    if (Array.isArray(o)) {
      if (o.length === 2 && o.every((x) => typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && !isNaN(Number(x))))) {
        leaves.push([path.toLowerCase(), path.split('.').pop().toLowerCase(), o]);
      } else {
        o.forEach((x, i) => walk(x, `${path}.${i}`, depth + 1));
      }
      return;
    }
    if (typeof o === 'object') {
      for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k, depth + 1);
      return;
    }
    leaves.push([path.toLowerCase(), path.split('.').pop().toLowerCase(), o]);
  })(row, '', 0);
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const pick = (re) => {
    for (const [, key, v] of leaves) {
      if (re.test(key) && typeof v !== 'object') { const n = num(v); if (n !== null) return n; }
    }
    return null;
  };
  let w = pick(/^(w|wins?|won|gameswon|managerwins?|careerwins?|seasonwins?)$/);
  let l = pick(/^(l|loss(es)?|lost|gameslost|managerloss(es)?|careerloss(es)?|seasonloss(es)?)$/);
  if (w === null || l === null) {
    for (const [path, key, v] of leaves) {
      if (!/(record|wl|winloss|w_l|w-l)/.test(path)) continue;
      if (Array.isArray(v)) { w = num(v[0]); l = num(v[1]); break; }
      const m = /^\s*(\d+)\s*[-\u2013\u2014\/]\s*(\d+)/.exec(String(v));
      if (m) { w = Number(m[1]); l = Number(m[2]); break; }
    }
  }
  let pct = null;
  for (const [, key, v] of leaves) {
    if (/^(pct|winpct|winpercentage|winningpercentage|winningpct|percentage)$/.test(key) && typeof v !== 'object' && v !== '' && v !== null) {
      const n = Number(v);
      pct = Number.isFinite(n) && n <= 1 ? n.toFixed(3).replace(/^0\./, '.') : String(v);
      break;
    }
  }
  if (pct === null && w !== null && l !== null && (w + l) > 0) {
    pct = (w / (w + l)).toFixed(3).replace(/^0\./, '.');
  }
  return { w, l, pct };
}
function runManagerPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    const id = qs('id');
    if (!id) {
      setStatus(statusEl, 'No manager specified. Go back to Managers and pick one.', true);
      return;
    }
    setLoading(statusEl);
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
    document.title = `${m.fullName} — Hidden Ball`;
    const crumbEl = document.getElementById('crumb-name');
    if (crumbEl) crumbEl.textContent = m.fullName;
    document.getElementById('manager-name').textContent = m.fullName;
    const first = m.firstSeasonManaged, last = m.lastSeasonManaged;
    document.getElementById('manager-meta-line').textContent =
      (first || last) ? `Managed ${fmtOrDash(first)}\u2013${fmtOrDash(last)}` : 'Manager';
    const badges = document.getElementById('manager-badges');
    const chips = [];
    if (m.status === 'active') chips.push('<span class="badge badge--active">Active</span>');
    else if (m.status === 'deceased') chips.push('<span class="badge badge--deceased">Deceased</span>');
    else if (m.status) chips.push(`<span class="badge">${m.status[0].toUpperCase()}${m.status.slice(1)}</span>`);
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
    const photoEl = document.getElementById('manager-photo');
    if (photoEl) {
      setImgWithFallback(photoEl, `/assets/managers/${m.id}.webp`, '/assets/managers/default.webp');
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
    setLoading(statusEl2);
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
          for (const row of matches) {
            const sameTeam = stats.filter(r => String(r.teamId) === String(row.teamId));
            const solo = new Set(sameTeam.map(r => String(r.managerId))).size === 1;
            rows.push({ year: y, row, solo });
          }
        } catch (_) {
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
    let warnedNoRecord = false;
    const standingsCache = {};
    async function teamSeasonRecord(year, teamId) {
      if (!(year in standingsCache)) {
        try { standingsCache[year] = normalizeStandings(await fetchSeasonFile(manifest, year, 'standings-splits.json')); }
        catch (_) { standingsCache[year] = null; }
      }
      const data = standingsCache[year];
      const t = data && Array.isArray(data.teams) ? data.teams.find(x => String(x.id) === String(teamId)) : null;
      if (!t) return null;
      const w = t.w === null || t.w === undefined ? null : Number(t.w);
      const l = t.l === null || t.l === undefined ? null : Number(t.l);
      if (!Number.isFinite(w) || !Number.isFinite(l)) return null;
      let pct = null;
      if (t.pct !== null && t.pct !== undefined && t.pct !== '') {
        const n = Number(t.pct);
        pct = Number.isFinite(n) && n <= 1 ? n.toFixed(3).replace(/^0\./, '.') : String(t.pct);
      } else if (w + l > 0) {
        pct = (w / (w + l)).toFixed(3).replace(/^0\./, '.');
      }
      return { w, l, pct };
    }
    const lines = [];
    for (const { year, row, solo } of rows) {
      const name = await resolveTeamName(row.teamId);
      let { w: wins, l: losses, pct } = readManagerRecord(row);
      if (wins === null && losses === null && solo) {
        const tr = await teamSeasonRecord(year, row.teamId);
        if (tr) { wins = tr.w; losses = tr.l; pct = tr.pct; }
      }
      if (wins === null && losses === null && !warnedNoRecord) {
        warnedNoRecord = true;
        console.warn('manager-stats.json row has no recognisable W/L fields. Row keys:', Object.keys(row), row);
      }
      if (wins !== null) { totalW += wins; anyRecordField = true; }
      if (losses !== null) { totalL += losses; anyRecordField = true; }
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
    if (!anyRecordField) {
      const sample = rows[0].row;
      statusEl2.hidden = false;
      statusEl2.textContent = 'Debug: manager-stats.json row = ' + JSON.stringify(sample).slice(0, 600);
    }
  }
  main();
}
function runManagersPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    setLoading(statusEl);
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
      hrefFor: (e) => `/manager/?id=${e.id}`,
      maxRender: 300,
      emptyMessage: 'No managers match your search.',
    });
    clearStatus(statusEl);
    contentEl.hidden = false;
  }
  main();
}
function runBallparkPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    const id = qs('id');
    if (!id) {
      setStatus(statusEl, 'No ballpark specified. Go back to Ballparks and pick one.', true);
      return;
    }
    setLoading(statusEl);
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
    initGamesHosted(manifest, id);
  }
  function renderBallpark(bp) {
    document.title = `${bp.currentName} — Hidden Ball`;
    const crumbEl = document.getElementById('crumb-name');
    if (crumbEl) crumbEl.textContent = bp.currentName;
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
  function initGamesHosted(manifest, ballparkId) {
    const FIRST_YEAR = 1980, LAST_YEAR = 2025, LATEST_COUNT = 10;
    const statusEl2 = document.getElementById('games-status');
    const wrap = document.getElementById('games-wrap');
    const body = document.getElementById('games-body');
    const bar = document.getElementById('games-bar');
    const note = document.getElementById('games-note');
    const seasonSel = document.getElementById('games-season');
    const allWrap = document.getElementById('games-all-wrap');
    const allBtn = document.getElementById('games-all-btn');
    const resolveTeamName = createTeamNameResolver(manifest);
    const cache = new Map();
    const inflight = new Map();
    let token = 0;
    let intent = 0;
    let current = 'latest';
    const allYears = [];
    for (let y = LAST_YEAR; y >= FIRST_YEAR; y--) allYears.push(y);
    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function shortDate(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      if (!m) return fmtDate(iso);
      return `${SHORT_MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
    }
    const byNewest = (a, b) =>
      String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.gamePk) || 0) - (Number(a.gamePk) || 0);
    function gamesForYear(y) {
      if (cache.has(y)) return Promise.resolve(cache.get(y));
      if (inflight.has(y)) return inflight.get(y);
      const p = (async () => {
        try {
          const schedule = await fetchSeasonFile(manifest, y, 'schedule.json');
          const list = Array.isArray(schedule)
            ? schedule
                .filter((g) => String(g.ballparkId) === String(ballparkId) &&
                  (g.status === 'Final' || g.status === 'Completed Early'))
                .sort(byNewest)
            : [];
          cache.set(y, list);
          return list;
        } catch (_) {
          return [];
        } finally {
          inflight.delete(y);
        }
      })();
      inflight.set(y, p);
      return p;
    }
    function syncControls() {
      const isAll = current === 'all';
      allBtn.classList.toggle('is-active', isAll);
      allBtn.setAttribute('aria-pressed', String(isAll));
      if (seasonSel.querySelector(`option[value="${current}"]`)) seasonSel.value = String(current);
    }
    async function renderRows(list, noteText) {
      const my = ++token;
      const ids = new Set();
      for (const g of list) { ids.add(g.awayTeamId); ids.add(g.homeTeamId); }
      const names = new Map();
      await Promise.all([...ids].map(async (id) => { names.set(id, await resolveTeamName(id)); }));
      if (my !== token) return;
      const rowHtml = (g) => `<tr class="pg-row pg-row--link" data-href="${escapeHtml(gameHref(g))}">
        <td class="left">${shortDate(g.date)}</td>
        <td class="left">${teamLinkHtml(g.awayTeamId, names.get(g.awayTeamId))}</td>
        <td class="left">${teamLinkHtml(g.homeTeamId, names.get(g.homeTeamId))}</td>
        <td class="num"><a href="${gameHref(g)}">${g.awayScore}&ndash;${g.homeScore}</a></td>
      </tr>`;
      const CHUNK = 250;
      body.innerHTML = list.slice(0, CHUNK).map(rowHtml).join('');
      note.textContent = noteText;
      note.hidden = false;
      clearStatus(statusEl2);
      wrap.hidden = false;
      allWrap.hidden = false;
      for (let i = CHUNK; i < list.length; i += CHUNK) {
        await new Promise((r) => setTimeout(r, 0));
        if (my !== token) return;
        body.insertAdjacentHTML('beforeend', list.slice(i, i + CHUNK).map(rowHtml).join(''));
      }
    }
    let latest = [];
    async function showLatest() {
      current = 'latest';
      syncControls();
      await renderRows(latest, `Latest ${latest.length} game${latest.length === 1 ? '' : 's'} hosted`);
    }
    async function showSeason(y) {
      const mine = ++intent;
      current = y;
      syncControls();
      setLoading(statusEl2);
      const list = await gamesForYear(y);
      if (mine !== intent) return;
      if (list.length === 0) {
        ++token;
        wrap.hidden = true;
        note.hidden = true;
        setStatus(statusEl2, `No completed games found at this ballpark in ${y}.`, true);
        return;
      }
      await renderRows(list, `${y} season hosted \u00b7 ${list.length} game${list.length === 1 ? '' : 's'}`);
    }
    async function showAll() {
      const mine = ++intent;
      current = 'all';
      syncControls();
      setLoading(statusEl2);
      let next = 0;
      async function worker() {
        while (next < allYears.length) await gamesForYear(allYears[next++]);
      }
      await Promise.all(Array.from({ length: 8 }, worker));
      if (mine !== intent) return;
      const all = [];
      for (const y of allYears) if (cache.has(y)) for (const g of cache.get(y)) all.push(g);
      if (all.length === 0) {
        ++token;
        wrap.hidden = true;
        note.hidden = true;
        setStatus(statusEl2, 'No completed games found at this ballpark in 1980\u20132025.', true);
        return;
      }
      await renderRows(all, `All seasons \u00b7 ${all.length.toLocaleString('en-US')} game${all.length === 1 ? '' : 's'} hosted`);
    }
    function fillSeasons() {
      const years = [...cache.entries()]
        .filter(([, list]) => list.length > 0)
        .map(([y, list]) => [y, list.length])
        .sort((a, b) => b[0] - a[0]);
      if (years.length === 0) return;
      seasonSel.innerHTML = `<option value="latest">Latest ${LATEST_COUNT} games</option>` + years
        .map(([y, n]) => `<option value="${y}">${y} (${n} game${n === 1 ? '' : 's'})</option>`)
        .join('') + '<option value="all" hidden>All seasons</option>';
      seasonSel.disabled = false;
      syncControls();
    }
    async function start() {
      seasonSel.innerHTML = '<option value="">\u2014</option>';
      seasonSel.disabled = true;
      bar.hidden = false;
      setLoading(statusEl2);
      let cursor = 0;
      const CHUNK = 4;
      while (cursor < allYears.length && latest.length < LATEST_COUNT) {
        const chunk = allYears.slice(cursor, cursor + CHUNK);
        cursor += CHUNK;
        const lists = await Promise.all(chunk.map(gamesForYear));
        for (const list of lists) latest = latest.concat(list);
      }
      latest = latest.slice(0, LATEST_COUNT);
      if (latest.length === 0) {
        bar.hidden = true;
        setStatus(statusEl2, 'No completed games found at this ballpark in 1980\u20132025. '
          + '(The current season isn\u2019t indexed for this lookup yet.)', true);
        return;
      }
      await showLatest();
      const rest = allYears.filter((y) => !cache.has(y));
      let next = 0;
      async function worker() {
        while (next < rest.length) await gamesForYear(rest[next++]);
      }
      await Promise.all(Array.from({ length: 8 }, worker));
      fillSeasons();
      if (seasonSel.disabled) seasonSel.innerHTML = '<option value="">No seasons found</option>';
    }
    seasonSel.addEventListener('change', () => {
      const v = seasonSel.value;
      if (v === 'latest') { ++intent; showLatest(); }
      else if (v === 'all') showAll();
      else if (Number(v)) showSeason(Number(v));
    });
    allBtn.addEventListener('click', () => { if (current !== 'all') showAll(); });
    body.addEventListener('click', (e) => {
      if (e.target.closest('a, button, select, input')) return;
      const tr = e.target.closest('tr[data-href]');
      if (!tr || !body.contains(tr)) return;
      if (window.getSelection && String(window.getSelection())) return;
      const href = tr.getAttribute('data-href');
      if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
      else window.location.href = href;
    });
    start().catch((err) => {
      setStatus(statusEl2, `Couldn't load games (${err.message}).`, true);
    });
  }
  main();
}
function runBallparksPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    setLoading(statusEl);
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
    initEntityBrowser({
      entries,
      containerEl: document.getElementById('ballpark-grid'),
      searchEl: null,
      hrefFor: (e) => `/ballpark/?id=${e.id}`,
      maxRender: 200,
      emptyMessage: 'No ballparks found.',
    });
    clearStatus(statusEl);
    contentEl.hidden = false;
  }
  main();
}
function runStandingsPage() {
  const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };
  const LEAGUE_PAGES = { 103: '/AL/', 104: '/NL/' };
  const FIRST_YEAR = 1980;
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const wrap = document.getElementById('standings-body-wrap');
  const picker = document.getElementById('year-picker');
  const verticalMql = window.matchMedia(VERTICAL_SCREEN_QUERY);
  const sortByGroup = new Map();
  let shown = null;
  let currentLast5 = { status: 'pending' };
  let pickerYear = null;
  async function main() {
    setLoading(statusEl);
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
        showPickerOnly(year);
        setStatus(statusEl, `Couldn't load standings for ${year} (${err.message}).`, true);
        return;
      }
      if (!data || !Array.isArray(data.teams)) {
        showPickerOnly(year);
        setStatus(statusEl, `No standings found for ${year}.`, true);
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
    document.title = `Standings — ${year} — Hidden Ball`;
    document.getElementById('standings-title').textContent = `${year} Standings`;
    renderYearPicker(year);
    const names = new Map();
    for (const t of data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);
    shown = { data, year, names, spots: computePlayoffSpots(data.teams, year) };
    renderStandings();
    clearStatus(statusEl);
    contentEl.hidden = false;
    loadLastFive(manifest);
  }
  function showPickerOnly(year) {
    document.getElementById('standings-title').textContent = Number.isFinite(year) ? `${year} Standings` : 'Standings';
    renderYearPicker(year);
    wrap.innerHTML = '';
    contentEl.hidden = false;
  }
  function decadeOf(y) { return Math.floor(y / 10) * 10; }
  function renderYearPicker(activeYear) {
    const thisYear = new Date().getFullYear();
    pickerYear = Number.isFinite(activeYear) ? activeYear : null;
    const known = pickerYear !== null && pickerYear >= FIRST_YEAR && pickerYear <= thisYear;
    let groups = '';
    for (let d = decadeOf(thisYear); d >= decadeOf(FIRST_YEAR); d -= 10) {
      let opts = '';
      for (let y = Math.min(d + 9, thisYear); y >= Math.max(d, FIRST_YEAR); y--) {
        opts += `<option value="${y}"${y === pickerYear ? ' selected' : ''}>${y}</option>`;
      }
      groups += `<optgroup label="${d}s">${opts}</optgroup>`;
    }
    const placeholder = known ? '' : `<option value="" selected disabled hidden>${pickerYear === null ? 'Season' : pickerYear}</option>`;
    picker.innerHTML = `<select class="tx-select" id="year-select" aria-label="Season">${placeholder}${groups}</select>`;
  }
  picker.addEventListener('change', (e) => {
    const sel = e.target.closest('#year-select');
    if (!sel || !picker.contains(sel) || !sel.value) return;
    window.location.href = `/standings/?year=${encodeURIComponent(sel.value)}`;
  });
  function renderStandings() {
    if (!shown) return;
    const { data, year, spots } = shown;
    const last5 = currentLast5;
    const byLeague = new Map();
    for (const t of data.teams) {
      const key = t.lg;
      if (!byLeague.has(key)) byLeague.set(key, []);
      byLeague.get(key).push(t);
    }
    let html = '';
    if (last5.status === 'unavailable') {
      html += `<p class="l5-note">Last 5 results couldn't be loaded for ${year}.</p>`;
    }
    for (const [lg, teams] of byLeague) {
      const page = LEAGUE_PAGES[lg];
      const name = LEAGUE_NAMES[lg] || `League ${lg}`;
      const heading = page
        ? `<a class="league-heading-link" href="${page}">${leagueLogoCardHtml(lg)}<span>${name}</span></a>`
        : `${leagueLogoCardHtml(lg)}<span>${name}</span>`;
      html += `<h3 class="league-heading" style="font-family:var(--font-body);font-size:0.92rem;font-weight:600;
        color:var(--text-secondary);margin:18px 0 8px;">${heading}</h3>`;
      html += standingsTableHtml(teams, year, {
        extended: true, last5, vertical: verticalMql.matches, spots, leagueId: lg, sortByGroup, flat: true,
      });
    }
    wrap.innerHTML = html;
  }
  wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn || !wrap.contains(btn) || !shown) return;
    const group = btn.dataset.group;
    const current = sortByGroup.get(group) || STANDINGS_DEFAULT_SORT;
    sortByGroup.set(group, nextStandingsSort(current, btn.dataset.sort));
    renderStandings();
  });
  const onScreenShapeChange = () => renderStandings();
  if (verticalMql.addEventListener) verticalMql.addEventListener('change', onScreenShapeChange);
  else if (verticalMql.addListener) verticalMql.addListener(onScreenShapeChange);
  async function loadLastFive(manifest) {
    const { year, names } = shown;
    const seasonIsCurrent = Number(year) >= new Date().getFullYear();
    const [schedule, liveInitial] = await Promise.all([
      fetchSeasonSchedule(manifest, year).catch(() => null),
      seasonIsCurrent ? fetchLiveGames().catch(() => []) : Promise.resolve([]),
    ]);
    if (!(Array.isArray(schedule) && schedule.length > 0)) {
      currentLast5 = { status: 'unavailable' };
      renderStandings();
      return;
    }
    let finishedByTeam = buildLastFive(schedule);
    let liveList = liveInitial;
    currentLast5 = { status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) };
    renderStandings();
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
          const fresh = await fetchSeasonSchedule(manifest, year);
          if (Array.isArray(fresh) && fresh.length > 0) { finishedByTeam = buildLastFive(fresh); refetched = true; }
        }
        liveList = next;
        if (changed || refetched) {
          currentLast5 = { status: 'ready', byTeam: finishedByTeam, names, live: liveByTeam(liveList) };
          renderStandings();
        }
      } catch (_) { }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }
  main();
}
function runLeaguePage() {
  const LEAGUE_NAMES = { 103: 'American League', 104: 'National League' };
  const leagueId = Number(document.body.dataset.league);
  async function main() {
    setLoading(document.getElementById('league-status'));
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
    setLoading(statusEl);
    const result = await fetchLatestAvailable(manifest, 'standings-splits.json', { transform: normalizeStandings, validate: isStandingsShape }).catch(() => null);
    if (!result || !result.data || !Array.isArray(result.data.teams)) {
      setStatus(statusEl, "Couldn't find standings for any season.", true);
      return;
    }
    const leagueName = LEAGUE_NAMES[leagueId] || `League ${leagueId}`;
    const teams = result.data.teams.filter(t => String(t.lg) === String(leagueId));
    document.title = `${leagueName} — Hidden Ball`;
    heading.textContent = `${leagueId === 103 ? 'AL' : leagueId === 104 ? 'NL' : leagueName}/${result.year}`;
    const names = new Map();
    for (const t of result.data.teams) names.set(String(t.id), t.n || `Team ${t.id}`);
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
      } catch (_) { }
      finally { busy = false; }
    }, LIVE_POLL_MS);
  }
  main();
}
function runScoresPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  let allGames = [];
  let resolveTeamName = null;
  async function main() {
    setLoading(statusEl);
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
      setLoading(statusEl);
      try {
        data = await fetchSeasonFile(manifest, year, 'schedule.json');
      } catch (err) {
        setStatus(statusEl, `Couldn't load the ${year} schedule (${err.message}).`, true);
        return;
      }
      if (!data) {
        renderYearPicker(year);
        contentEl.hidden = false;
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
    document.title = `Scores — ${year} — Hidden Ball`;
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
    picker.innerHTML = compactYearSelectHtml(activeYear, 'Season');
    picker.onchange = (e) => {
      window.location.href = `/archive/?type=scores&year=${encodeURIComponent(e.target.value)}`;
    };
  }
  async function renderTable(dateFilter) {
    const list = document.getElementById('scores-table');
    const filtered = dateFilter
      ? allGames.filter(g => g.date && g.date.slice(0, 10) === dateFilter)
      : allGames;
    if (filtered.length === 0) {
      list.innerHTML = `<p class="state-msg">No games match this date.</p>`;
      return;
    }
    const days = [];
    const byDay = new Map();
    for (const g of filtered) {
      const key = g.date ? g.date.slice(0, 10) : '';
      if (!byDay.has(key)) { const day = { key, date: g.date, games: [] }; byDay.set(key, day); days.push(day); }
      byDay.get(key).games.push(g);
    }
    const html = [];
    for (const day of days) {
      const cards = [];
      for (const g of day.games) {
        const [awayName, homeName] = await Promise.all([
          resolveTeamName(g.awayTeamId),
          resolveTeamName(g.homeTeamId),
        ]);
        const aw = Number(g.awayScore), hs = Number(g.homeScore);
        const awayWin = aw > hs, homeWin = hs > aw;
        const note = g.status && g.status !== 'Final' ? `<span class="sc-note">${g.status}</span>` : '';
        cards.push(`<div class="sc-game">
          <div class="sc-team sc-away${awayWin ? ' is-win' : ''}">${teamLinkHtml(g.awayTeamId, awayName)}</div>
          <a class="sc-score" href="${gameHref(g)}"><span${awayWin ? ' class="is-win"' : ''}>${g.awayScore}</span><i>&ndash;</i><span${homeWin ? ' class="is-win"' : ''}>${g.homeScore}</span></a>
          <div class="sc-team sc-home${homeWin ? ' is-win' : ''}">${teamLinkHtml(g.homeTeamId, homeName)}</div>
          ${note}
        </div>`);
      }
      html.push(`<section class="sc-day"><h2 class="sc-day__title">${fmtDate(day.date)}</h2><div class="sc-grid">${cards.join('')}</div></section>`);
    }
    list.innerHTML = html.join('');
  }
  main();
}
function runPostseasonPage() {
  const ROUND_NAMES = { D: 'Division Series', L: 'League Championship Series', W: 'World Series' };
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  async function main() {
    setLoading(statusEl);
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
      setLoading(statusEl);
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
    document.title = `Postseason — ${year} — Hidden Ball`;
    document.getElementById('postseason-title').textContent = `Postseason — ${year}`;
    renderYearPicker(year);
    if (!data || !Array.isArray(data) || data.length === 0) {
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
        : `<a class="accent-link" href="/postseason/?year=${y}">${y}</a>`
    ).join(' · ');
  }
  async function renderTable(manifest, games) {
    const body = document.getElementById('postseason-body');
    const resolveTeamName = createTeamNameResolver(manifest);
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
    setLoading(statusEl);
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
      setLoading(statusEl);
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
    document.title = `Awards — ${year} — Hidden Ball`;
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
    picker.innerHTML = compactYearSelectHtml(activeYear, 'Season');
    picker.onchange = (e) => {
      window.location.href = `/archive/?type=awards&year=${encodeURIComponent(e.target.value)}`;
    };
  }
  async function renderTable(manifest, awards) {
    const grid = document.getElementById('awards-table');
    const resolveTeamName = createTeamNameResolver(manifest);
    const cards = [];
    for (const a of awards) {
      let who = '';
      let team = '';
      const hasPlayer = a.playerId !== null && a.playerId !== undefined;
      const hasTeam = a.teamId !== null && a.teamId !== undefined;
      if (hasPlayer) {
        const name = await resolvePlayerName(manifest, a.playerId);
        who = `<a class="team-link" href="/player/?id=${a.playerId}">${name}</a>`;
      }
      if (hasTeam) {
        const teamName = await resolveTeamName(a.teamId);
        const t = teamLinkHtml(a.teamId, teamName);
        if (hasPlayer) team = `<div class="aw-card__team">${t}</div>`;
        else who = t;
      }
      cards.push(`<div class="aw-card">
        <div class="aw-card__label">${a.award || '—'}</div>
        <div class="aw-card__who">${who || '—'}</div>
        ${team}
      </div>`);
    }
    grid.innerHTML = cards.join('');
  }
  main();
}
function runDraftPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
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
      } catch (_) { }
      year--;
    }
    return null;
  }
  async function main() {
    setLoading(statusEl);
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
      setLoading(statusEl);
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
    document.title = `Draft — ${year} — Hidden Ball`;
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
  const FIRST_YEAR = 1980;
  const decadeOf = (y) => Math.floor(y / 10) * 10;
  let pickerYear = null;
  function renderYearPicker(activeYear) {
    const picker = document.getElementById('year-picker');
    const thisYear = new Date().getFullYear();
    pickerYear = Number.isFinite(activeYear) ? activeYear : null;
    let groups = '';
    for (let d = decadeOf(thisYear); d >= decadeOf(FIRST_YEAR); d -= 10) {
      let opts = '';
      for (let y = Math.min(d + 9, thisYear); y >= Math.max(d, FIRST_YEAR); y--) {
        opts += `<option value="${y}"${y === pickerYear ? ' selected' : ''}>${y}</option>`;
      }
      groups += `<optgroup label="${d}s">${opts}</optgroup>`;
    }
    picker.innerHTML =
      `<div class="tx-bar"><select class="tx-select" id="year-select" aria-label="Draft year">${groups}</select></div>`;
  }
  document.getElementById('year-picker').addEventListener('change', (e) => {
    const sel = e.target.closest('#year-select');
    if (!sel) return;
    window.location.href = `/archive/?type=draft&year=${encodeURIComponent(sel.value)}`;
  });
  async function renderTable(manifest, picks) {
    const body = document.getElementById('draft-body');
    const resolveTeamName = createTeamNameResolver(manifest);
    const rows = [];
    for (const pick of picks) {
      const [round, pickNumber, teamId, playerId, fullName, position, school] = pick;
      const teamName = (teamId !== null && teamId !== undefined) ? await resolveTeamName(teamId) : '—';
      const playerCell = playerId
        ? `<a class="team-link" href="/player/?id=${playerId}">${fullName || `Player ${playerId}`}</a>`
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
function runTransactionsPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const PAGE_SIZE = 40;
  const TYPE_INFO = {
    TR:  ['Trade', 'trade'],
    SGN: ['Signed', 'signing'], SFA: ['Signed', 'signing'], DR: ['Draft', 'signing'],
    REL: ['Released', 'release'], DES: ['Designated', 'release'], DFA: ['Designated', 'release'], RET: ['Retired', 'release'],
    OPT: ['Optioned', 'move'], CU: ['Recalled', 'move'], CLW: ['Claimed', 'move'], ASG: ['Assigned', 'move'],
    SC:  ['Status change', 'other'], NUM: ['Number change', 'other'],
  };
  const GROUPS = [['all', 'All'], ['trade', 'Trades'], ['signing', 'Signings'],
                  ['release', 'Releases'], ['move', 'Roster moves'], ['other', 'Other']];
  const typeInfo = (code) => TYPE_INFO[String(code || '').toUpperCase()] || ['Roster move', 'other'];
  const EXT_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const state = { items: [], group: 'all', limit: PAGE_SIZE };
  const teamNames = new Map();
  const validTeam = (id) => id !== null && id !== undefined && id !== '' && Number(id) > 0;
  const validPlayer = (id) => /^\d+$/.test(String(id === null || id === undefined ? '' : id));
  const pad2 = (n) => String(n).padStart(2, '0');
  function dateParts(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d === null || d === undefined ? '' : d));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }
  const shortDay = (p) => `${MONTH_SHORT[p.m - 1]} ${p.d}`;
  const longDay = (p) => {
    const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    return `${wd}, ${MONTH_NAMES[p.m - 1]} ${p.d}`;
  };
  async function findLatestTransactions(manifest) {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    let checked = 0;
    while (checked < 36) {
      const mm = pad2(m);
      try {
        const data = await fetchSeasonFile(manifest, y, `transactions/${mm}.json`);
        if (data && Array.isArray(data.tx) && data.tx.length > 0) {
          return { year: y, month: mm, data };
        }
      } catch (_) { }
      checked++;
      m--;
      if (m === 0) { m = 12; y--; }
      if (y < 1980) break;
    }
    return null;
  }
  async function loadTeamNames(manifest, rows) {
    const ids = new Set();
    for (const r of rows) {
      if (validTeam(r[4])) ids.add(Number(r[4]));
      if (validTeam(r[5])) ids.add(Number(r[5]));
    }
    await Promise.all(Array.from(ids).map(async (id) => {
      try {
        const team = await fetchCoreRecord(manifest, 'teams', id);
        if (team && team.currentName) teamNames.set(id, team.currentName);
      } catch (_) { }
    }));
  }
  const teamChip = (id) => {
    const name = teamNames.get(Number(id));
    return name ? teamLinkHtml(Number(id), escapeHtml(name)) : '';
  };
  function buildItems(rows) {
    const dateOf = (r) => String(r[0] === null || r[0] === undefined ? '' : r[0]);
    const sorted = rows.filter(Array.isArray)
      .map((row, i) => ({ row, i }))
      .sort((a, b) => {
        const da = dateOf(a.row), db = dateOf(b.row);
        if (da !== db) return da < db ? 1 : -1;
        return b.i - a.i;
      })
      .map((x) => x.row);
    const seen = new Map();
    return sorted.map((row) => {
      const base = txKey(row);
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { row, key: n === 1 ? base : `${base}-${n}`, group: typeInfo(row[1])[1] };
    });
  }
  const pickLead = (list) => list[0];
  function cardHtml(item, lead) {
    const [date, typeCode, playerId, playerName, fromId, toId, description] = item.row;
    const label = typeInfo(typeCode)[0];
    const p = dateParts(date);
    const headline = String(description || playerName || 'Transaction');
    const from = validTeam(fromId) ? teamChip(fromId) : '';
    const to = validTeam(toId) ? teamChip(toId) : '';
    const teams = (from && to && Number(fromId) !== Number(toId))
      ? `${from}<span class="tx-arrow" role="img" aria-label="to">&rarr;</span>${to}`
      : (to || from);
    const who = playerName
      ? (validPlayer(playerId)
          ? `<a class="accent-link" href="/player/?id=${encodeURIComponent(playerId)}">${escapeHtml(playerName)}</a>`
          : escapeHtml(playerName))
      : '';
    const ctx = (who ? `<span class="tx-who"><span class="tx-who__lbl">Player</span>${who}</span>` : '') +
      (teams ? `<span class="tx-teams">${teams}</span>` : '');
    const links = [];
    if (p) {
      links.push(`<a class="tx-src" href="https://www.mlb.com/transactions/${p.y}/${pad2(p.m)}/${pad2(p.d)}" ` +
        `target="_blank" rel="noopener noreferrer">Source: MLB.com transactions${EXT_ICON}</a>`);
    }
    if (validPlayer(playerId)) {
      links.push(`<a class="tx-src" href="https://www.mlb.com/player/${encodeURIComponent(playerId)}" ` +
        `target="_blank" rel="noopener noreferrer">Player profile${EXT_ICON}</a>`);
    }
    const kicker = `<div class="tx-meta">${lead ? '<span class="tx-flag">Top story</span>' : ''}` +
      `<span class="tx-type">${escapeHtml(label)}</span>` +
      (lead ? `<span class="tx-date">${escapeHtml(p ? shortDay(p) : fmtDate(date))}</span>` : '') + `</div>`;
    return `<article class="tx-card tx-card--${item.group}${lead ? ' tx-card--lead' : ''}" id="${item.key}">` +
      kicker +
      `<h3 class="tx-card__headline">${escapeHtml(headline)}</h3>` +
      (ctx ? `<div class="tx-card__ctx">${ctx}</div>` : '') +
      (links.length ? `<div class="tx-card__src">${links.join('')}</div>` : '') +
      `</article>`;
  }
  function render() {
    const list = document.getElementById('tx-list');
    const filtered = state.items.filter((it) => state.group === 'all' || it.group === state.group);
    if (filtered.length === 0) {
      list.innerHTML = '<p class="state-msg">No transactions found for this month.</p>';
      return;
    }
    const lead = pickLead(filtered);
    const rest = filtered.filter((it) => it !== lead);
    const shown = rest.slice(0, state.limit);
    const perDay = new Map();
    for (const it of rest) {
      const k = String(it.row[0] === null || it.row[0] === undefined ? '' : it.row[0]).slice(0, 10);
      perDay.set(k, (perDay.get(k) || 0) + 1);
    }
    let html = cardHtml(lead, true);
    let prev = null;
    for (const it of shown) {
      const day = String(it.row[0] === null || it.row[0] === undefined ? '' : it.row[0]).slice(0, 10);
      if (day !== prev) {
        if (prev !== null) html += '</div></section>';
        const p = dateParts(day);
        const n = perDay.get(day) || 0;
        html += `<section class="tx-day-group"><h2 class="tx-day">${escapeHtml(p ? longDay(p) : (day || 'Undated'))}` +
          `<span class="tx-day__count">${n} ${n === 1 ? 'move' : 'moves'}</span></h2><div class="tx-grid">`;
        prev = day;
      }
      html += cardHtml(it, false);
    }
    if (prev !== null) html += '</div></section>';
    if (rest.length > shown.length) {
      html += `<div class="tx-more-wrap"><button type="button" class="btn tx-more">` +
        `Show more (${rest.length - shown.length} left)</button></div>`;
    }
    list.innerHTML = html;
  }
  function renderFilters() {
    const el = document.getElementById('tx-filters');
    const counts = { all: state.items.length };
    for (const it of state.items) counts[it.group] = (counts[it.group] || 0) + 1;
    const groups = GROUPS.filter(([id]) => id === 'all' || counts[id]);
    el.hidden = groups.length < 3;
    el.innerHTML = groups.map(([id, name]) =>
      `<button type="button" class="tx-chip${state.group === id ? ' is-active' : ''}" data-group="${id}" ` +
      `aria-pressed="${state.group === id}">${name}<span class="tx-chip__n">${counts[id]}</span></button>`
    ).join('');
  }
  const FIRST_YEAR = 1980;
  const decadeOf = (y) => Math.floor(y / 10) * 10;
  let pickerYear = null;
  let pickerMonth = '01';
  function lastMonthOf(y) {
    const now = new Date();
    return y >= now.getFullYear() ? now.getMonth() + 1 : 12;
  }
  function renderYearPicker(activeYear, currentMonth) {
    const picker = document.getElementById('year-picker');
    const thisYear = new Date().getFullYear();
    pickerYear = activeYear;
    pickerMonth = currentMonth;
    let groups = '';
    for (let d = decadeOf(thisYear); d >= decadeOf(FIRST_YEAR); d -= 10) {
      let opts = '';
      for (let y = Math.min(d + 9, thisYear); y >= Math.max(d, FIRST_YEAR); y--) {
        opts += `<option value="${y}"${y === activeYear ? ' selected' : ''}>${y}</option>`;
      }
      groups += `<optgroup label="${d}s">${opts}</optgroup>`;
    }
    picker.innerHTML = `<select class="tx-select" id="year-select" aria-label="Season">${groups}</select>`;
  }
  function renderMonthPicker(activeYear, activeMonth) {
    const picker = document.getElementById('month-picker');
    picker.innerHTML = `<select class="tx-select" id="month-select" aria-label="Month">` +
      MONTH_NAMES.slice(0, lastMonthOf(activeYear)).map((name, i) => {
        const mm = pad2(i + 1);
        return `<option value="${mm}"${mm === activeMonth ? ' selected' : ''}>${name}</option>`;
      }).join('') + `</select>`;
  }
  function centerActive(id) {
    const picker = document.getElementById(id);
    const a = picker && picker.querySelector('.is-active');
    if (!a || picker.scrollWidth <= picker.clientWidth) return;
    picker.scrollLeft = a.offsetLeft - (picker.clientWidth - a.offsetWidth) / 2;
  }
  async function main() {
    setLoading(statusEl);
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
      const nowYear = new Date().getFullYear();
      if (!Number.isFinite(year) || year > nowYear) year = nowYear;
      if (year < FIRST_YEAR) year = FIRST_YEAR;
      let mNum = parseInt(requestedMonth, 10);
      if (!Number.isFinite(mNum) || mNum < 1) mNum = 1;
      month = pad2(Math.min(mNum, lastMonthOf(year)));
      setLoading(statusEl);
      try {
        data = await fetchSeasonFile(manifest, year, `transactions/${month}.json`);
      } catch (err) {
        setStatus(statusEl, `Couldn't load transactions for ${month}/${year} (${err.message}).`, true);
        return;
      }
    } else {
      setLoading(statusEl);
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
    document.title = `Transactions — ${monthLabel} ${year} — Hidden Ball`;
    const rows = (data && Array.isArray(data.tx)) ? data.tx : [];
    await loadTeamNames(manifest, rows);
    state.items = buildItems(rows);
    const trades = state.items.filter((it) => it.group === 'trade').length;
    const txCountEl = document.getElementById('tx-count');
    if (txCountEl) {
      txCountEl.textContent = state.items.length
        ? `${state.items.length.toLocaleString('en-US')} transactions` +
          (trades ? ` \u00b7 ${trades.toLocaleString('en-US')} ${trades === 1 ? 'trade' : 'trades'}` : '')
        : 'No transactions recorded';
    }
    let focusKey = '';
    try { focusKey = decodeURIComponent((window.location.hash || '').slice(1)); } catch (_) { focusKey = ''; }
    if (window.location.hash) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) { }
    }
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (_) { }
    const target = focusKey ? state.items.find((it) => it.key === focusKey) : null;
    if (target) {
      const lead = pickLead(state.items);
      const at = state.items.filter((it) => it !== lead).indexOf(target);
      if (at >= state.limit) state.limit = at + 1;
    } else {
      focusKey = '';
    }
    renderYearPicker(year, month);
    renderMonthPicker(year, month);
    document.getElementById('year-select').addEventListener('change', (e) => {
      const y = parseInt(e.target.value, 10);
      const mm = pad2(Math.min(parseInt(pickerMonth, 10) || 1, lastMonthOf(y)));
      window.location.href = `/archive/?type=transactions&year=${y}&month=${mm}`;
    });
    document.getElementById('month-select').addEventListener('change', (e) => {
      window.location.href = `/archive/?type=transactions&year=${pickerYear}&month=${e.target.value}`;
    });
    renderFilters();
    render();
    document.getElementById('tx-filters').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-group]');
      if (!btn) return;
      const id = btn.dataset.group;
      state.group = id;
      state.limit = PAGE_SIZE;
      renderFilters();
      render();
      const again = document.querySelector(`#tx-filters [data-group="${id}"]`);
      if (again) again.focus({ preventScroll: true });
    });
    document.getElementById('tx-list').addEventListener('click', (e) => {
      if (!e.target.closest('.tx-more')) return;
      state.limit += PAGE_SIZE;
      render();
    });
    clearStatus(statusEl);
    contentEl.hidden = false;
    if (focusKey) {
      const el = document.getElementById(focusKey);
      if (el) {
        el.classList.add('is-focus');
        setTimeout(() => el.classList.remove('is-focus'), 4500);
      }
    }
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }
  main();
}
function runLeadersPage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
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
    setLoading(statusEl);
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      setStatus(statusEl, `Couldn't load the archive right now (${err.message}).`, true);
      return;
    }
    const thisYear = new Date().getFullYear();
    const statKey = qs('stat') && STAT_DEFS[qs('stat')] ? qs('stat') : 'homeRuns';
    const from = qs('from') ? parseInt(qs('from'), 10) : thisYear - 1;
    const to = qs('to') ? parseInt(qs('to'), 10) : thisYear - 1;
    renderControls(statKey, from, to);
    const tpSubEl = document.getElementById('tp-sub');
    if (tpSubEl) {
      tpSubEl.textContent =
        `${STAT_DEFS[statKey].label} \u00B7 ${from === to ? from : `${Math.min(from, to)}\u2013${Math.max(from, to)}`}`;
    }
    const years = [];
    for (let y = Math.min(from, to); y <= Math.max(from, to); y++) years.push(y);
    if (years.length > 15) {
      setStatus(statusEl, `That's a ${years.length}-year range - this page fetches one file per year, `
        + `so a narrower range (or waiting a bit) will load faster.`, false);
    } else {
      setLoading(statusEl);
    }
    const def = STAT_DEFS[statKey];
    const totals = new Map();
    let checked = 0;
    let cursor = 0;
    const CONCURRENCY = 6;
    async function worker() {
      while (cursor < years.length) {
        const y = years[cursor++];
        checked++;
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
    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N);
    const rows = [];
    const top = ranked.length ? ranked[0][1] : 0;
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
      const pct = top > 0 ? Math.max(2, Math.round((value / top) * 100)) : 0;
      rows.push(`<li class="tp-row">
        <span class="tp-rank">${rank}</span>
        <a class="tp-name team-link" href="/player/?id=${playerId}">${name}</a>
        <span class="tp-val">${displayValue}</span>
        <span class="tp-bar" style="--w:${pct}%"></span>
      </li>`);
      rank++;
    }
    document.getElementById('leaders-body').innerHTML = rows.join('');
    clearStatus(statusEl);
    contentEl.hidden = false;
  }
  function renderControls(activeStat, from, to) {
    const controls = document.getElementById('leader-controls');
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const href = (stat, f, t) => `/archive/?type=leaders&stat=${stat}&from=${f}&to=${t}`;
    const chips = Object.entries(STAT_DEFS).map(([key, def]) => {
      const text = def.label.replace(' (Pitching)', '');
      return key === activeStat
        ? `<span class="tx-chip is-active" aria-current="page">${text}</span>`
        : `<a class="tx-chip" href="${href(key, lo, hi)}">${text}</a>`;
    }).join('');
    controls.innerHTML =
      `<nav class="tx-picker tx-picker--wrap tp-stats" aria-label="Stat">${chips}</nav>` +
      `<div class="tp-range">${compactYearSelectHtml(lo, 'From season', 'from-year')}` +
      `<span>to</span>${compactYearSelectHtml(hi, 'To season', 'to-year')}</div>`;
    const go = () => {
      window.location.href = href(activeStat,
        document.getElementById('from-year').value, document.getElementById('to-year').value);
    };
    document.getElementById('from-year').addEventListener('change', go);
    document.getElementById('to-year').addEventListener('change', go);
  }
  main();
}
const LiveKit = (function () {
  const esc = escapeHtml;
  const numOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const n0 = (v) => { const n = numOrNull(v); return n === null ? 0 : n; };
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], r = n % 100;
    return n + (s[(r - 20) % 10] || s[r] || s[0]);
  };
  const prettyKey = (s) => String(s || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const ZONE_HALF_W = 17 / 24;
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
  function lineScore(ls) {
    const lt = ls.teams || {};
    const tot = (s) => { const t = lt[s] || {}; return { r: n0(t.runs), h: n0(t.hits), e: n0(t.errors), lob: n0(t.leftOnBase) }; };
    const inns = Array.isArray(ls.innings)
      ? ls.innings.map((i) => [numOrNull(i && i.away ? i.away.runs : null), numOrNull(i && i.home ? i.home.runs : null)]) : [];
    return { a: tot('away'), h: tot('home'), inns };
  }
  function liveSituation(feed) {
    const gd = feed.gameData || {};
    const ld = feed.liveData || {};
    const ls = ld.linescore || {};
    const off = ls.offense || {};
    const def = ls.defense || {};
    const players = gd.players || {};
    const P = (p) => pickPerson(p, players);
    const innState = String(ls.inningState || '');
    const brk = /^(Middle|End)$/i.test(innState);
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
      ab.live = true;
      ab.batter = P(off.batter);
      ab.pitcher = P(def.pitcher);
    }
    return {
      brk, top,
      inn: numOrNull(ls.currentInning),
      ord: ls.currentInningOrdinal || '',
      state: innState,
      balls: n0(ls.balls), strikes: n0(ls.strikes), outs: n0(ls.outs),
      off: brk ? null : (top ? 'a' : 'h'),
      runners: brk ? { 1: null, 2: null, 3: null } : { 1: P(off.first), 2: P(off.second), 3: P(off.third) },
      field: { P: P(def.pitcher), C: P(def.catcher), '1B': P(def.first), '2B': P(def.second), '3B': P(def.third),
               SS: P(def.shortstop), LF: P(def.left), CF: P(def.center), RF: P(def.right) },
      onDeck: brk ? null : P(off.onDeck),
      inHole: brk ? null : P(off.inHole),
      line: lineScore(ls),
      ab,
    };
  }
  const batsText = (c) => (c === 'L' ? 'Bats left' : (c === 'R' ? 'Bats right' : (c === 'S' ? 'Switch hitter' : '')));
  const throwsText = (c) => (c === 'L' ? 'Throws left' : (c === 'R' ? 'Throws right' : ''));
  function batSide(person, pitcher) {
    const c = person && person.bats;
    if (c === 'L' || c === 'R') return c;
    if (c === 'S') return pitcher && pitcher.throws === 'R' ? 'L' : 'R';
    return null;
  }
  const fmtMph = (n) => (n === null || n === undefined ? '' : `${Number(n).toFixed(1)} mph`);
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
      `<svg class="gx-bases" viewBox="0 0 84 46" aria-hidden="true" focusable="false">` +
        `<path class="gb-line" d="M16 34 L42 12 L68 34"/>` +
        base(2, 42, 12) + base(3, 16, 34) + base(1, 68, 34) +
      `</svg>` +
      (sit.brk ? '' :
        `<div class="gx-sit__row"><span class="gx-sit__count">${sit.balls}&ndash;${sit.strikes}</span>` +
        `<span class="gx-outs" title="${sit.outs} out${sit.outs === 1 ? '' : 's'}">${dots}</span></div>` +
        `<div class="gx-sit__cap">Count &middot; ${sit.outs} out${sit.outs === 1 ? '' : 's'}</div>`) +
      `</div>`;
  }
  let uid = 0;
  const f1 = (n) => Math.round(n * 10) / 10;
  const clampN = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const rad = (d) => (d * Math.PI) / 180;
  const KZ = (function () {
    const W = 600, H = 600, PAD_T = 22, PAD_B = 30;
    const BALL_R = 1.45 / 12;
    const HW = 17 / 24;
    const FLIP = -1;
    const FIG = {
      ground: 1197, top: 13,
      handX: 763, xMin: 315,
      zoneEdge: 805,
      topLm: 498, kneeLm: 865,
      paths: [[5,"M534 341L539 342L552 356L559 364L565 373L571 382L560 379L544 375L534 376L521 377L521 379L529 379L545 382L553 385L553 386L534 390L518 398L515 400L529 397L562 397L571 398L571 400L555 404L542 412L531 422L521 436L516 447L513 457L513 477L525 490L535 499L539 503L528 500L507 493L477 486L477 488L481 489L495 500L506 507L510 508L557 509L565 518L574 529L576 533L567 544L550 561L538 570L543 569L541 574L535 586L533 591L531 591L529 596L521 610L513 621L507 624L500 623L498 622L487 622L493 625L499 627L500 628L500 639L497 645L494 647L495 650L497 664L510 682L521 697L532 713L556 749L567 766L580 787L593 810L600 827L602 833L602 846L600 854L591 874L577 904L565 929L553 954L544 973L534 992L528 1004L524 1015L519 1026L515 1038L511 1047L504 1060L493 1074L491 1078L493 1086L493 1093L503 1095L518 1097L524 1101L528 1106L529 1118L525 1123L518 1126L513 1126L512 1131L503 1131L503 1128L492 1128L493 1126L513 1122L523 1118L520 1118L511 1120L502 1122L492 1122L490 1128L495 1132L500 1135L501 1139L507 1140L516 1147L532 1150L542 1152L550 1156L554 1160L556 1169L557 1170L557 1177L553 1183L548 1187L539 1189L537 1195L536 1196L527 1196L526 1192L512 1192L511 1198L499 1198L497 1193L484 1193L482 1197L471 1197L469 1191L459 1190L441 1185L413 1185L411 1191L399 1191L397 1185L392 1184L391 1189L382 1189L381 1188L381 1182L374 1182L372 1181L370 1171L370 1148L373 1139L371 1139L370 1144L362 1144L361 1139L354 1137L353 1135L353 1126L360 1129L370 1130L370 1127L360 1127L354 1125L354 1114L358 1103L369 1104L359 1100L355 1096L355 1090L359 1082L364 1067L369 1059L374 1055L389 1047L397 1040L408 1026L394 1034L378 1043L377 1043L377 1034L385 1018L396 1009L407 1000L421 988L425 983L431 966L433 960L422 971L414 978L403 988L394 1001L387 1014L384 1010L384 999L388 993L397 983L401 973L407 955L411 941L423 916L437 888L442 883L442 868L445 864L448 864L448 854L440 848L433 839L423 828L414 817L400 798L386 776L375 758L367 745L358 738L348 729L340 722L329 709L321 696L317 684L315 675L315 656L317 640L320 632L320 620L325 614L327 614L328 604L333 590L335 588L339 588L335 578L329 569L327 566L327 559L343 542L350 534L373 511L395 478L409 458L423 439L433 426L441 416L452 403L461 393L470 383L478 376L487 367L495 361L510 353L528 346Z"],[0,"M534 341L539 342L552 356L559 364L565 373L571 382L560 379L544 375L534 376L521 377L521 379L529 379L545 382L553 385L553 386L534 390L518 398L515 400L529 397L562 397L571 398L571 400L555 404L542 412L531 422L521 436L516 447L513 457L513 477L525 490L535 499L539 503L528 500L507 493L477 486L477 488L481 489L495 500L506 507L510 508L557 509L565 518L574 529L576 533L567 544L550 561L538 570L543 569L541 574L535 586L533 591L531 591L529 596L521 610L513 621L507 624L500 623L498 622L487 622L493 625L499 627L500 628L500 639L497 645L495 646L489 646L483 642L467 637L455 636L453 636L454 626L457 616L445 615L405 607L401 623L409 624L430 629L440 632L440 633L427 632L391 627L369 623L365 626L365 614L370 599L373 596L386 597L425 603L449 607L459 607L480 601L491 594L508 581L522 570L527 566L529 566L529 564L520 568L489 577L452 585L442 586L445 583L474 569L491 559L512 545L526 535L528 535L528 533L484 533L428 532L428 534L433 535L446 540L459 543L468 544L468 546L458 550L442 558L417 571L389 584L371 590L360 593L357 594L348 594L342 590L338 585L331 571L327 566L327 559L343 542L350 534L373 511L395 478L409 458L423 439L433 426L441 416L452 403L461 393L470 383L478 376L487 367L495 361L510 353L528 346Z"],[0,"M335 588L338 588L341 592L344 593L343 600L338 616L332 615L329 614L329 623L335 629L334 632L329 635L329 655L332 672L337 688L348 706L359 719L369 730L377 737L392 749L407 759L432 774L460 791L469 797L467 798L450 791L458 801L468 812L474 819L482 823L490 825L527 827L540 832L541 834L525 836L508 839L502 840L489 840L496 848L507 855L502 860L488 866L483 865L480 864L478 868L476 871L476 878L480 886L479 890L471 902L465 923L452 966L447 984L437 997L430 1008L418 1044L414 1056L400 1071L391 1082L387 1090L381 1106L372 1130L374 1136L392 1138L417 1138L442 1134L467 1128L480 1124L486 1124L483 1114L482 1112L482 1106L459 1109L440 1109L442 1107L466 1098L478 1091L487 1080L491 1078L493 1086L493 1093L503 1095L518 1097L524 1101L528 1106L529 1118L525 1123L518 1126L513 1126L512 1131L503 1131L503 1128L492 1128L493 1126L513 1122L523 1118L520 1118L511 1120L502 1122L492 1122L490 1128L495 1132L500 1135L501 1139L507 1140L516 1147L532 1150L542 1152L550 1156L554 1160L556 1169L557 1170L557 1177L553 1183L548 1187L539 1189L537 1195L536 1196L527 1196L526 1192L512 1192L511 1198L499 1198L497 1193L484 1193L482 1197L471 1197L469 1191L459 1190L441 1185L413 1185L411 1191L399 1191L397 1185L392 1184L391 1189L382 1189L381 1188L381 1182L374 1182L372 1181L370 1171L370 1148L373 1139L371 1139L370 1144L362 1144L361 1139L354 1137L353 1135L353 1126L360 1129L370 1130L370 1127L360 1127L354 1125L354 1114L358 1103L369 1104L359 1100L355 1096L355 1090L359 1082L364 1067L369 1059L374 1055L389 1047L397 1040L408 1026L394 1034L378 1043L377 1043L377 1034L385 1018L396 1009L407 1000L421 988L425 983L431 966L433 960L422 971L414 978L403 988L394 1001L387 1014L384 1010L384 999L388 993L397 983L401 973L407 955L411 941L423 916L437 888L442 883L442 868L445 864L448 864L448 854L440 848L433 839L423 828L414 817L400 798L386 776L375 758L367 745L358 738L348 729L340 722L329 709L321 696L317 684L315 675L315 656L317 640L320 632L320 620L325 614L327 614L328 604L333 590Z"],[0,"M589 235L619 235L639 239L657 246L665 252L672 259L676 266L678 274L678 288L676 302L659 297L640 295L637 294L624 293L602 293L603 296L622 303L631 306L645 311L654 313L681 314L692 317L701 323L701 327L699 328L687 328L679 325L674 325L674 333L675 340L669 347L666 352L664 353L658 353L658 363L656 365L653 365L653 372L648 377L647 386L645 390L641 392L632 392L616 387L610 387L606 393L600 399L596 398L589 392L580 378L570 365L559 352L547 340L548 336L550 332L546 330L541 326L540 324L541 313L543 305L547 279L552 265L559 254L569 244L585 236Z"],[0,"M709 333L715 333L720 337L721 339L721 347L725 349L728 352L729 362L732 367L732 377L729 391L724 400L716 407L713 406L709 398L709 396L719 394L723 392L716 393L708 394L709 403L708 409L713 410L711 415L710 417L723 407L730 395L731 386L733 384L741 385L744 387L744 396L742 402L734 402L750 411L760 419L764 429L764 436L759 448L754 457L751 458L748 451L741 443L731 437L720 433L721 422L721 419L718 429L719 437L711 439L707 443L711 441L724 441L738 448L744 453L747 457L747 466L743 473L740 488L734 493L731 493L729 505L726 514L719 533L710 550L702 562L692 575L686 580L683 581L676 581L648 566L627 553L614 543L605 545L592 548L586 540L586 538L596 536L610 532L620 528L638 518L648 508L657 493L660 485L656 484L648 477L639 465L636 462L631 459L627 454L623 441L615 425L606 415L593 406L584 401L584 400L600 401L613 411L622 420L628 431L633 444L635 452L641 456L652 469L659 477L666 482L667 487L665 495L672 502L672 522L667 538L661 548L659 553L666 557L674 546L678 538L680 531L680 512L675 505L676 501L684 493L689 488L697 477L700 475L711 475L721 480L728 487L730 491L730 483L724 476L716 471L713 470L703 470L698 475L695 474L694 472L694 466L701 449L704 446L700 430L695 420L695 413L698 403L704 395L699 394L694 390L690 382L688 376L682 366L678 358L678 350L681 344L683 337L685 335L693 335L696 337L702 337Z"],[0,"M489 1078L491 1078L493 1086L493 1093L503 1095L518 1097L524 1101L528 1106L529 1118L525 1123L518 1126L513 1126L512 1131L503 1131L503 1128L492 1128L493 1126L513 1122L523 1118L520 1118L511 1120L502 1122L492 1122L490 1128L495 1132L500 1135L501 1139L507 1140L516 1147L532 1150L542 1152L550 1156L554 1160L556 1169L557 1170L557 1177L553 1183L548 1187L539 1189L537 1195L536 1196L527 1196L526 1192L512 1192L511 1198L499 1198L497 1193L484 1193L482 1197L471 1197L469 1191L459 1190L441 1185L413 1185L411 1191L399 1191L397 1185L392 1184L391 1189L382 1189L381 1188L381 1182L374 1182L372 1181L370 1171L370 1148L374 1139L376 1138L417 1138L442 1134L467 1128L480 1124L486 1124L483 1114L482 1112L482 1106L459 1109L440 1109L442 1107L466 1098L478 1091L487 1080Z"],[0,"M526 13L534 13L540 16L544 20L548 30L565 67L576 92L590 124L609 167L620 194L631 222L634 229L634 232L621 229L614 225L614 228L611 229L604 229L592 209L580 190L568 170L555 146L542 123L525 91L513 69L499 42L498 41L498 31L505 23L515 17Z"],[0,"M709 333L715 333L720 337L721 339L721 347L725 349L728 352L729 362L732 367L732 377L729 391L724 400L716 407L713 406L709 398L709 396L719 394L723 392L716 393L708 394L709 403L708 409L713 410L711 415L710 417L723 407L730 395L731 386L733 384L741 385L744 387L744 396L742 402L734 402L750 411L760 419L764 429L764 436L759 448L754 457L751 458L748 451L741 443L731 437L720 433L721 422L721 419L718 429L719 437L711 439L707 443L711 441L724 441L738 448L744 453L747 457L747 466L743 473L740 488L734 493L731 493L730 496L729 491L730 491L730 483L724 476L716 471L713 470L703 470L698 475L695 474L694 472L694 466L701 449L704 446L700 430L695 420L695 413L698 403L704 395L699 394L694 390L690 382L688 376L682 366L678 358L678 350L681 344L683 337L685 335L693 335L696 337L702 337Z"],[0,"M455 639L465 641L482 646L491 648L495 653L496 655L497 664L510 682L521 697L532 713L556 749L567 766L580 787L593 810L600 827L602 833L602 846L600 854L591 874L577 904L565 929L553 954L544 973L534 992L528 1004L524 1015L519 1026L515 1038L511 1047L504 1060L493 1074L492 1076L490 1076L493 1067L495 1063L478 1073L461 1081L456 1082L461 1076L469 1069L477 1060L490 1041L512 1008L520 994L524 984L543 944L554 922L563 906L570 892L579 875L590 848L591 845L591 835L583 815L575 801L560 777L545 753L530 730L514 706L504 692L492 675L483 665L479 659L475 654L456 641Z"],[0,"M412 1146L420 1147L440 1154L450 1159L474 1173L483 1178L489 1179L526 1179L544 1176L551 1173L555 1172L557 1170L557 1177L553 1183L548 1187L539 1189L537 1195L536 1196L527 1196L526 1192L512 1192L511 1198L499 1198L497 1193L484 1193L482 1197L471 1197L469 1191L459 1190L441 1185L413 1185L411 1191L399 1191L397 1185L392 1184L391 1189L382 1189L381 1188L381 1182L374 1182L372 1181L370 1171L370 1162L387 1164L424 1167L437 1169L450 1172L450 1174L460 1175L466 1176L446 1165L424 1153L412 1147Z"],[0,"M709 333L715 333L720 337L721 339L721 347L725 349L728 352L729 362L732 367L732 377L729 391L724 400L716 407L713 406L709 398L709 396L719 394L723 392L716 393L708 394L708 396L704 397L704 395L699 394L694 390L690 382L688 376L682 366L678 358L678 350L681 344L683 337L685 335L693 335L696 337L702 337Z"],[0,"M489 1078L491 1078L493 1086L493 1093L503 1095L518 1097L524 1101L528 1106L529 1118L525 1123L518 1126L513 1126L512 1131L503 1131L503 1128L492 1128L493 1126L513 1122L523 1118L520 1118L511 1120L502 1122L492 1122L490 1126L488 1128L486 1127L486 1125L480 1125L480 1124L486 1124L483 1114L482 1112L482 1106L459 1109L440 1109L442 1107L466 1098L478 1091L487 1080Z"],[5,"M412 1146L420 1147L440 1154L450 1159L474 1173L483 1178L489 1179L526 1179L544 1176L552 1174L548 1178L538 1182L523 1185L477 1185L453 1179L437 1174L426 1172L386 1171L377 1169L372 1164L403 1165L433 1168L450 1172L450 1174L460 1175L466 1176L446 1165L424 1153L412 1147Z"],[5,"M588 297L595 298L608 305L615 307L615 316L616 326L612 336L608 341L597 346L584 346L575 336L568 321L569 318L579 328L583 330L593 330L597 327L597 316L589 309L579 303L579 301Z"],[0,"M548 489L565 493L593 501L618 510L614 511L599 509L584 505L584 507L589 509L612 520L617 521L617 523L601 529L592 532L585 533L574 519L565 508L556 498L548 491Z"],[0,"M405 666L432 666L452 672L463 677L470 680L470 681L436 682L419 686L403 692L394 697L392 697L394 689L399 681L406 675L414 672L405 667Z"],[0,"M410 730L421 737L435 745L460 760L472 772L479 780L487 788L494 796L499 802L494 800L481 790L467 780L454 770L438 757L427 747L419 740L410 732Z"],[5,"M433 959L434 961L428 977L424 986L417 993L406 1002L393 1013L386 1017L385 1012L387 1012L396 996L405 985L420 971L428 964Z"],[5,"M477 486L485 487L511 493L528 499L539 502L539 505L553 506L557 509L510 509L503 506L491 498L480 489L477 488Z"],[0,"M489 968L491 969L482 981L471 997L461 1011L445 1023L435 1031L433 1031L435 1025L443 1011L455 999L463 992L475 981L485 972Z"],[5,"M672 503L675 503L681 512L681 531L677 543L668 556L665 558L658 553L660 548L666 538L671 522Z"],[0,"M547 864L547 867L540 875L531 884L514 893L490 904L488 906L485 905L498 894L508 885L519 877L540 868Z"],[5,"M372 1164L403 1165L433 1168L450 1172L446 1174L447 1176L441 1175L426 1172L386 1171L377 1169Z"],[5,"M722 417L723 420L720 433L729 435L738 440L748 449L751 454L752 459L750 459L748 463L747 463L745 456L740 451L735 447L724 442L711 442L707 443L709 439L718 436L717 429L720 419Z"],[0,"M335 588L338 588L341 592L344 593L343 600L338 616L332 615L327 613L328 604L333 590Z"],[5,"M412 1146L420 1147L440 1154L450 1159L465 1168L462 1173L457 1171L435 1159L416 1149L412 1147Z"],[0,"M353 1126L360 1129L370 1130L371 1127L373 1133L374 1136L382 1137L382 1138L374 1139L373 1141L373 1139L371 1139L370 1144L362 1144L361 1139L354 1137L353 1135Z"],[5,"M731 377L732 377L733 385L732 386L731 395L724 407L712 417L710 417L712 412L713 410L708 409L708 394L719 391L724 391L722 394L717 396L709 396L714 406L719 404L725 397L729 387Z"],[5,"M703 469L713 469L721 473L730 481L731 483L731 492L728 489L721 481L711 476L700 476L697 477L696 475Z"],[4,"M550 1174L552 1175L544 1180L529 1184L523 1185L495 1185L497 1181L497 1180L526 1179L544 1176Z"],[4,"M743 396L747 397L752 401L754 407L756 411L755 415L748 411L736 404L733 402L734 401L740 401L742 402L742 397Z"],[0,"M526 1116L528 1120L523 1124L518 1126L513 1126L512 1131L503 1131L503 1128L492 1128L493 1126L513 1122L523 1118Z"],[0,"M728 388L729 391L724 400L716 407L713 406L709 398L709 396L719 394L723 392L723 390Z"],[4,"M465 636L478 639L488 644L494 646L495 650L492 650L491 649L482 647L465 642L460 641L462 640L462 638L465 638Z"],[5,"M609 525L611 526L608 527L611 532L603 535L594 538L585 539L585 535L587 533L587 532L600 529Z"],[4,"M523 1116L525 1117L521 1120L509 1124L493 1127L503 1128L502 1130L491 1130L489 1126L492 1122L502 1121L511 1119L520 1117Z"],[4,"M427 1168L437 1169L450 1172L446 1174L447 1176L441 1175L426 1172L386 1171L386 1170L427 1170Z"],[0,"M407 624L423 627L440 632L440 633L427 632L405 629Z"],[4,"M719 347L721 347L720 352L713 359L702 363L697 365L694 364L711 354Z"],[5,"M725 363L727 363L725 367L720 372L715 375L706 378L700 378L703 375L720 367Z"],[1,"M372 512L372 515L351 536L342 547L336 552L334 551L343 542L350 534Z"],[1,"M744 397L749 398L752 401L754 407L755 408L755 413L753 413L748 407L744 404Z"],[4,"M446 1173L454 1174L464 1176L461 1177L461 1180L464 1181L456 1180L447 1177L447 1175L445 1174Z"],[0,"M483 786L487 788L494 796L499 802L494 800L481 790L479 788Z"],[0,"M548 489L561 492L559 494L561 499L564 503L561 503L550 492L548 491Z"],[1,"M599 504L605 505L618 510L614 511L599 509L596 507Z"],[4,"M372 1164L403 1165L403 1166L385 1166L384 1169L375 1168Z"],[4,"M594 530L598 531L595 531L596 534L600 536L594 538L585 539L585 535L587 533L587 532Z"],[0,"M452 1168L466 1175L467 1177L454 1175L450 1174L451 1169Z"],[4,"M412 1146L420 1147L435 1152L435 1153L430 1153L430 1155L424 1153L412 1147Z"],[4,"M353 1116L354 1116L354 1125L370 1127L370 1130L360 1130L354 1127L353 1126Z"],[0,"M456 578L458 578L457 581L460 583L445 586L442 585Z"],[4,"M731 377L732 377L733 385L732 386L731 395L728 401L727 399L725 399L727 393L730 384Z"],[1,"M496 1061L501 1063L495 1071L492 1076L490 1076L493 1067L496 1062Z"],[1,"M410 730L421 737L425 739L426 743L426 746L419 740L410 732Z"],[4,"M584 505L596 507L599 509L597 509L597 513L591 511L584 507Z"],[4,"M572 537L574 538L569 545L561 552L556 558L553 557L569 541Z"],[4,"M719 391L724 391L722 394L717 396L709 396L711 401L709 401L708 394Z"],[5,"M428 532L449 532L449 533L439 533L438 537L433 536L428 534Z"],[3,"M722 417L723 420L720 433L723 434L719 434L718 436L717 429L720 419Z"],[5,"M485 1180L497 1180L518 1181L518 1182L498 1183L495 1184L493 1183L493 1181L485 1181Z"],[1,"M504 1124L508 1125L506 1127L505 1129L508 1130L503 1131L503 1128L492 1128L493 1126Z"],[4,"M743 396L746 397L744 397L744 404L740 406L733 403L734 401L740 401L742 402L742 397Z"],[0,"M584 400L600 401L595 406L590 404L584 401Z"],[4,"M525 393L527 393L527 397L529 398L513 401L516 398Z"],[4,"M725 363L727 363L725 367L720 372L717 374L714 370L724 364Z"],[4,"M542 1187L547 1187L541 1194L536 1197L539 1188Z"],[4,"M550 1174L552 1175L544 1180L538 1181L538 1179L534 1178Z"],[4,"M721 379L723 379L723 381L714 386L703 388L703 386L707 384L715 382Z"],[4,"M430 1153L437 1153L441 1155L437 1159L432 1157L430 1156Z"],[4,"M747 451L750 452L752 459L750 459L748 463L747 463L746 452Z"],[5,"M449 790L458 793L460 795L457 797L456 800L449 791Z"],[1,"M459 676L468 679L470 681L450 681L450 680L460 679ZM461 678Z"],[0,"M470 1070ZM469 1071ZM468 1072ZM467 1073ZM464 1074L467 1075L465 1075L466 1078L458 1082L456 1081Z"],[1,"M405 666L432 666L432 667L412 667L411 670L405 667Z"],[4,"M527 564L529 564L529 566L521 572L518 573L517 568Z"],[1,"M528 494L532 496L539 502L537 503L528 500Z"],[0,"M508 1124L511 1125L511 1131L504 1131L505 1125Z"],[2,"M450 1104L452 1105L449 1107L459 1108L459 1109L440 1109L442 1107Z"],[1,"M518 1120L520 1121L516 1122L515 1124L518 1126L513 1126L512 1131L511 1131L509 1123Z"],[1,"M425 629L433 630L440 632L440 633L427 632L421 631Z"],[1,"M349 537ZM348 538ZM345 539L348 540L342 547L336 552L334 551L343 542Z"],[5,"M726 482L731 483L731 492L728 489L726 486Z"],[4,"M701 470L703 471L702 473L709 473L709 475L700 476L697 477L696 475Z"],[4,"M713 437L719 437L715 439L720 440L720 441L711 442L707 443L709 439Z"],[4,"M388 1010L394 1010L393 1013L386 1017L385 1012L387 1012Z"],[4,"M538 414L540 414L538 418L530 426L528 425L537 415Z"],[5,"M495 1062L497 1063L492 1071L487 1068L492 1064Z"],[1,"M489 968L491 969L483 980L480 977Z"],[1,"M556 1170L557 1170L557 1177L555 1179L551 1175L552 1172L555 1172Z"],[3,"M523 1116L525 1117L521 1120L512 1121L504 1121L504 1120L518 1118Z"],[4,"M609 525L611 526L608 527L611 532L607 533L606 530L601 529L604 527Z"],[1,"M489 1078L491 1078L491 1083L486 1085L483 1088L481 1087Z"],[4,"M535 988L538 990L535 991L536 994L530 1002L529 1000Z"],[0,"M534 830L541 833L541 834L529 835L531 834L532 831Z"],[4,"M568 318L575 324L571 328L568 321Z"],[1,"M436 1023L440 1024L440 1027L435 1031L433 1031L435 1025Z"],[1,"M547 864L547 867L543 872L541 872L541 870L538 869Z"],[4,"M725 478L729 480L729 483L726 482L725 485L722 482L722 480L725 480Z"],[1,"M488 1121L490 1121L491 1125L488 1128L486 1127L486 1125L480 1125L480 1124L488 1123Z"],[4,"M339 587L344 591L347 592L347 594L344 595L344 593L340 592L338 588Z"],[4,"M477 486L485 487L485 489L487 491L483 492L480 489L477 488Z"],[4,"M588 297L592 298L584 301L583 304L579 303L579 301Z"],[4,"M443 1156L448 1158L450 1160L446 1161L445 1163L441 1161L443 1161Z"],[4,"M512 1120L517 1120L513 1123L507 1124L507 1123L502 1122L502 1121Z"],[1,"M449 581L452 582L452 585L442 586L445 583Z"],[3,"M584 505L596 507L596 508L591 508L591 510L586 508L584 507Z"],[4,"M528 376L531 377L530 379L533 380L521 379L521 377Z"],[4,"M359 1102L367 1102L372 1104L372 1105L364 1105L359 1103Z"],[5,"M487 645L494 646L495 650L492 650L487 648Z"],[4,"M702 561L703 565L697 571L695 570Z"],[1,"M462 544L468 544L468 546L461 548L456 546L456 545Z"],[1,"M751 406L755 408L755 413L753 413L749 407Z"],[2,"M558 377L564 378L567 379L568 377L571 382L560 379Z"],[0,"M500 358L502 358L500 362L496 364L492 363Z"],[4,"M543 286L546 287L545 298L544 298L543 292L542 292L542 287Z"],[3,"M353 1116L354 1116L354 1125L360 1126L357 1128L353 1126Z"],[4,"M480 983L481 986L475 994L473 993Z"],[0,"M393 691L398 692L396 696L392 697Z"],[1,"M593 502L599 503L599 504L594 505L587 505L587 503Z"],[2,"M731 485L732 485L732 490L736 492L731 493L730 496L729 491L730 491Z"],[1,"M700 451L701 451L701 457L698 463L696 464L699 454Z"],[1,"M721 347L725 349L725 352L722 352L719 355L717 354L720 351Z"],[4,"M706 341L708 341L708 346L705 348L701 347L705 344Z"],[4,"M674 324L682 325L682 326L675 327L674 333L673 333L673 325Z"],[1,"M460 1173L466 1175L467 1177L454 1175L454 1174Z"],[4,"M492 1122L498 1122L495 1123L495 1125L499 1126L491 1126Z"],[1,"M490 795L494 796L499 802L494 800L490 797Z"],[4,"M705 374L708 374L708 377L706 378L700 378L703 375Z"],[5,"M430 1153L437 1153L436 1156L430 1156Z"],[1,"M501 27L502 31L499 32L499 41L498 41L498 31Z"],[3,"M412 1146L420 1147L422 1149L418 1150L412 1147Z"],[5,"M408 668L414 671L415 673L409 674Z"],[0,"M520 572ZM518 573L520 574L515 579L512 579L517 574Z"],[4,"M357 1138L362 1139L362 1144L361 1142L357 1140Z"],[1,"M492 899L494 900L489 905L485 906L490 901Z"],[5,"M572 537L574 538L569 545L567 543Z"],[4,"M725 514L726 514L726 521L722 525Z"],[1,"M702 337L707 340L705 344L705 340L697 339L697 338Z"],[4,"M606 293L608 294L607 298L602 296L602 294Z"],[4,"M433 959L434 961L433 965L428 965Z"],[0,"M334 552L335 555L330 559L328 558Z"],[4,"M734 401L740 401L740 404L733 403Z"],[1,"M728 388L729 391L728 393L723 391L725 389Z"]]
    };
    const FIG_TONES = { a: ['#2d343e', '#8f99a7'], h: ['#262c35', '#6a7280'] };
    const mixHex = (c1, c2, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(c1.substr(i, 2), 16) + (parseInt(c2.substr(i, 2), 16) - parseInt(c1.substr(i, 2), 16)) * t).toString(16).padStart(2, '0')).join('');
    function batter(tone) {
      const t = FIG_TONES[tone === 'h' ? 'h' : 'a'];
      const vars = [0, 1, 2, 3, 4, 5].map((i) => `--b${i}:${mixHex(t[0], t[1], i / 5)}`).join(';');
      return `<g style="${vars}">` + FIG.paths.map((p) => `<path d="${p[1]}" style="fill:var(--b${p[0]})"/>`).join('') + '</g>';
    }
    function svg(sit, side) {
      const ab = sit.ab;
      const zt = ab.zTop !== null ? ab.zTop : 3.5, zb = ab.zBot !== null ? ab.zBot : 1.5;
      const sd = side === 'L' ? 'L' : 'R';
      const sgn = sd === 'R' ? 1 : -1;
      const u = 0.5 * (zt / (FIG.ground - FIG.topLm) + zb / (FIG.ground - FIG.kneeLm));
      const topFt = (FIG.ground - FIG.top) * u + 0.2, botFt = -0.3;
      const a = HW + (FIG.zoneEdge - FIG.handX) * u;
      const BX = a, OPP = 1.7;
      const FAR = Math.max(a + (FIG.handX - FIG.xMin) * u, 1.7);
      const sc = Math.min((H - PAD_T - PAD_B) / (topFt - botFt), (W - 40) / (OPP + FAR));
      const cx = W / 2 - sgn * ((FAR - OPP) / 2) * sc;
      const yOf = (z) => H - PAD_B - (z - botFt) * sc;
      const xOf = (x) => cx + FLIP * x * sc;
      const y0 = yOf(0), zx0 = xOf(HW), zx1 = xOf(-HW);
      const left = Math.min(zx0, zx1), right = Math.max(zx0, zx1), top = yOf(zt), bot = yOf(zb);
      const ring = BALL_R * sc;
      const id = 'kz' + (++uid);
      let s = `<defs><radialGradient id="${id}-glow" cx="${f1(cx)}" cy="${f1((top + bot) / 2)}" r="${f1(sc * 3.4)}" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0" stop-color="#f2f3f5" stop-opacity=".07"/><stop offset="1" stop-color="#f2f3f5" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="${id}-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f3f5" stop-opacity=".05"/><stop offset="1" stop-color="#f2f3f5" stop-opacity="0"/></linearGradient></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#${id}-glow)"/>`;
      s += `<rect x="0" y="${f1(y0)}" width="${W}" height="${f1(H - y0)}" fill="url(#${id}-floor)"/>`;
      s += `<line x1="16" x2="${W - 16}" y1="${f1(y0)}" y2="${f1(y0)}" stroke="#f2f3f5" stroke-opacity=".16"/>`;
      const k = u * sc, mir = sd === 'R' ? '-' : '';
      s += `<g transform="translate(${f1(cx + sgn * BX * sc)} ${f1(y0)}) scale(${mir}${k.toFixed(5)} ${k.toFixed(5)}) translate(${-FIG.handX} ${-FIG.ground})">${batter(sit.off === 'h' ? 'h' : 'a')}</g>`;
      const pw = HW * sc, pd = 0.34 * sc;
      s += `<path d="M${f1(cx - pw)} ${f1(y0 + 3)} L${f1(cx + pw)} ${f1(y0 + 3)} L${f1(cx + pw)} ${f1(y0 + 3 + pd * .45)} L${f1(cx)} ${f1(y0 + 3 + pd)} L${f1(cx - pw)} ${f1(y0 + 3 + pd * .45)} Z" fill="#f6f3e8" fill-opacity=".92"/>`;
      s += `<path d="M${f1(left)} ${f1(y0)} L${f1(left)} ${f1(bot)} M${f1(right)} ${f1(y0)} L${f1(right)} ${f1(bot)}" stroke="#f2f3f5" stroke-opacity=".12" stroke-dasharray="2 5" fill="none"/>`;
      s += `<rect class="kz-zone-edge" x="${f1(left - ring)}" y="${f1(top - ring)}" width="${f1(right - left + 2 * ring)}" height="${f1(bot - top + 2 * ring)}" rx="${f1(ring)}"/>`;
      s += `<rect class="kz-zone" x="${f1(left)}" y="${f1(top)}" width="${f1(right - left)}" height="${f1(bot - top)}"/>`;
      let g = '';
      for (let i = 1; i <= 2; i++) {
        const gx = left + ((right - left) / 3) * i, gy = top + ((bot - top) / 3) * i;
        g += `M${f1(gx)} ${f1(top)} L${f1(gx)} ${f1(bot)} M${f1(left)} ${f1(gy)} L${f1(right)} ${f1(gy)} `;
      }
      s += `<path class="kz-grid" d="${g}"/>`;
      const shown = ab.pitches.filter((p) => p.x !== null && p.z !== null);
      const lastN = ab.pitches.length ? ab.pitches[ab.pitches.length - 1].n : null;
      const r = Math.max(ring, 7.5), fs = clampN(r * 1.1, 8, 13);
      const draw = (p) => {
        const px = clampN(xOf(p.x), r + 6, W - r - 6), py = clampN(yOf(p.z), r + 6, H - r - 6), isLast = p.n === lastN;
        return `<g class="kz-pt kz-pt--${p.cls}">` +
          (isLast ? `<circle class="kz-pt__ring" cx="${f1(px)}" cy="${f1(py)}" r="${f1(r + 6)}"/>` : '') +
          `<circle class="kz-pt__dot" cx="${f1(px)}" cy="${f1(py)}" r="${f1(r)}"/>` +
          `<text x="${f1(px)}" y="${f1(py + fs * .36)}" text-anchor="middle" font-size="${f1(fs)}">${p.n}</text></g>`;
      };
      shown.filter((p) => p.n !== lastN).forEach((p) => { s += draw(p); });
      shown.filter((p) => p.n === lastN).forEach((p) => { s += draw(p); });
      return s;
    }
    return { W, H, svg };
  })();
  const SF = (function () {
    const W = 960, H = 540;
    const CAM = [0, -170, 300], TGT = [0, 170, 0];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const nrm = (v) => { const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; };
    const FWD = nrm([TGT[0] - CAM[0], TGT[1] - CAM[1], TGT[2] - CAM[2]]);
    const RIGHT = nrm([FWD[1], -FWD[0], 0]);
    const UPV = [RIGHT[1] * FWD[2] - RIGHT[2] * FWD[1], RIGHT[2] * FWD[0] - RIGHT[0] * FWD[2], RIGHT[0] * FWD[1] - RIGHT[1] * FWD[0]];
    let F = 1, CX = 0, CY = 0;
    const raw = (x, y, z) => { const q = [x - CAM[0], y - CAM[1], (z || 0) - CAM[2]], d = dot(q, FWD); return { u: dot(q, RIGHT) / d, v: dot(q, UPV) / d, d }; };
    const P = (x, y, z) => { const r = raw(x, y, z); return { x: f1(CX + r.u * F), y: f1(CY - r.v * F), k: F / r.d }; };
    const pt = (a) => { const p = P(a[0], a[1], a[2]); return p.x + ' ' + p.y; };
    const line = (a) => 'M' + a.map(pt).join('L');
    const poly = (a) => line(a) + 'Z';
    const disc = (x, y, r, n) => { const a = []; n = n || 18; for (let i = 0; i < n; i++) { const t = (i / n) * 2 * Math.PI; a.push([x + r * Math.cos(t), y + r * Math.sin(t), 0]); } return a; };
    const g = (p) => [p[0], p[1], 0];
    const FENCE = (deg) => 400 - 70 * Math.pow(Math.abs(deg) / 45, 1.6);
    const polar = (deg, r) => [r * Math.sin(rad(deg)), r * Math.cos(rad(deg))];
    const BASES = { 1: [63.64, 63.64], 2: [0, 127.28], 3: [-63.64, 63.64] };
    const SPOTS = { P: [0, 60.5], '1B': [70, 92], '2B': [46, 138], SS: [-46, 138], '3B': [-70, 92], LF: [-135, 262], CF: [0, 300], RF: [135, 262], C: [0, -9] };
    const LBL = { P: 'r', '1B': 'r', '3B': 'l', '2B': 'b', SS: 'b', LF: 'b', CF: 'b', RF: 'b', C: 'r' };
    (function fit() {
      const pts = [[0, 0, 0], [0, -16, 0], [233.3, 233.3, 42], [-233.3, 233.3, 42]];
      for (let d = -45; d <= 45.001; d += 3) { const f = FENCE(d), a = polar(d, f), c = polar(d, f + 30); pts.push([a[0], a[1], 0], [a[0], a[1], 10], [c[0], c[1], 38]); }
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      pts.forEach((q) => { const r = raw(q[0], q[1], q[2]); u0 = Math.min(u0, r.u); u1 = Math.max(u1, r.u); v0 = Math.min(v0, r.v); v1 = Math.max(v1, r.v); });
      F = Math.min((W - 70) / (u1 - u0), (H - 56) / (v1 - v0));
      CX = W / 2 - (F * (u0 + u1)) / 2; CY = H / 2 + (F * (v0 + v1)) / 2;
    })();
    const esc = escapeHtml;
    function flight(h, kind) {
      if (!h || h.x === null || h.y === null) return null;
      let hx = clampN(2.495 * (h.x - 125.42), -255, 255);
      let hy = clampN(2.495 * (198.27 - h.y), -25, 425);
      const deg = (Math.atan2(hx, hy) * 180) / Math.PI;
      if (kind !== 'foul' && hy > 0 && Math.abs(deg) <= 45) {
        const fe = FENCE(deg), r0 = Math.hypot(hx, hy), want = kind === 'hr' ? fe + 14 : Math.min(r0, fe - 3);
        hx *= want / r0; hy *= want / r0;
      }
      const traj = String(h.traj || '').toLowerCase();
      const ground = /ground|bunt/.test(traj) || (h.ang !== null && h.ang !== undefined && h.ang < 8);
      return { hx, hy, ground };
    }
    function svg(sit, ctx) {
      ctx = ctx || {};
      const ds = []; for (let d = -45; d <= 45.001; d += 3) ds.push(d);
      const wallAt = (z, extra) => ds.map((d) => { const p = polar(d, FENCE(d) + (extra || 0)); return [p[0], p[1], z]; });
      const bot = wallAt(0), top = wallAt(10), stand = wallAt(38, 30);
      let s = '';
      s += `<path class="sf-stands" d="${poly(stand.concat(top.slice().reverse()))}"/>`;
      s += `<path class="sf-fair" d="${poly([[0, 0, 0]].concat(bot))}"/>`;
      for (let r = 100; r < 400; r += 80) {
        const o = [], n = [];
        ds.forEach((d) => { const f = FENCE(d), a = polar(d, Math.min(r + 40, f)), b = polar(d, Math.min(r, f)); o.push(g(a)); n.push(g(b)); });
        s += `<path class="sf-stripe" d="${poly(o.concat(n.reverse()))}"/>`;
      }
      const skin = [[-12, -6, 0], [12, -6, 0]];
      for (let a = 75; a >= -75; a -= 5) skin.push([95 * Math.sin(rad(a)), 60.5 + 95 * Math.cos(rad(a)), 0]);
      s += `<path class="sf-dirt" d="${poly(skin)}"/>`;
      s += `<path class="sf-fair" d="${poly([[0, 16, 0], [50, 63.64, 0], [0, 111, 0], [-50, 63.64, 0]])}"/>`;
      [200, 300].forEach((r) => {
        s += `<path class="sf-ring" d="${line(ds.map((d) => g(polar(d, r))))}"/>`;
        const lp = P(polar(12, r)[0], polar(12, r)[1], 0);
        s += `<text class="sf-ringlbl" x="${f1(lp.x + 6)}" y="${f1(lp.y - 4)}">${r} ft</text>`;
      });
      s += `<path class="sf-line" d="${line([[0, 0, 0], g(polar(-45, 330))])}${line([[0, 0, 0], g(polar(45, 330))])}${line([[0, 0, 0], g(BASES[1]), g(BASES[2]), g(BASES[3]), [0, 0, 0]])}"/>`;
      s += `<path class="sf-wallface" d="${poly(top.concat(bot.slice().reverse()))}"/>`;
      s += `<path class="sf-wall" d="${line(top)}"/>`;
      [-1, 1].forEach((sg) => { s += `<path class="sf-pole" d="M${pt([233.3 * sg, 233.3, 0])}L${pt([233.3 * sg, 233.3, 42])}"/>`; });
      s += `<path class="sf-mound" d="${poly(disc(0, 60.5, 9))}"/>`;
      s += `<path d="${poly([[-3.5, 4, 0], [3.5, 4, 0], [3.5, 0, 0], [0, -3.5, 0], [-3.5, 0, 0]])}" fill="#f6f3e8"/>`;
      if (!sit) return s;
      const tDef = sit.off === 'a' ? 'h' : 'a';
      const dotFill = tDef === 'a' ? 'var(--side-a)' : 'var(--side-h)';
      [1, 2, 3].forEach((k) => {
        const on = !!sit.runners[k], b = BASES[k], h = on ? 4 : 3.2, hp = P(b[0], b[1], 0);
        if (on) s += `<path class="sf-halo" d="${poly(disc(b[0], b[1], 8))}"/>`;
        s += `<path class="sf-base${on ? ' is-on' : ''}" d="${poly([[b[0] - h, b[1], 0], [b[0], b[1] + h, 0], [b[0] + h, b[1], 0], [b[0], b[1] - h, 0]])}"/>`;
        if (on) {
          const nm = esc(sit.runners[k].ln);
          if (k === 1) s += `<text class="sf-nm sf-nm--run" x="${f1(hp.x + 26)}" y="${f1(hp.y + 4)}">${nm}</text>`;
          else if (k === 3) s += `<text class="sf-nm sf-nm--run" x="${f1(hp.x - 26)}" y="${f1(hp.y + 4)}" text-anchor="end">${nm}</text>`;
          else s += `<text class="sf-nm sf-nm--run" x="${hp.x}" y="${f1(hp.y - 20)}" text-anchor="middle">${nm}</text>`;
        }
      });
      const kind = ctx.kind, fl = flight(sit.ab.hit, kind);
      if (fl && kind) {
        const h = sit.ab.hit, gid = 'sf' + (++uid), R = Math.hypot(fl.hx, fl.hy);
        const angN = numOrNull(h.ang), ang = clampN(angN === null ? 30 : angN, 6, 70);
        const apex = fl.ground ? 0 : clampN((R * Math.tan(rad(ang))) / 4, 6, 150);
        const arc = [];
        for (let i = 0; i <= 28; i++) { const t = i / 28; arc.push([fl.hx * t, fl.hy * t, fl.ground ? 0.4 : 4 * apex * t * (1 - t) + 3 * (1 - t)]); }
        const a = P(0, 0, 3), e = P(fl.hx, fl.hy, 0);
        s += `<g class="sf-k--${kind}">` +
          `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${a.x}" y1="${a.y}" x2="${e.x}" y2="${e.y}">` +
          `<stop offset="0" style="stop-color:var(--k);stop-opacity:.08"/><stop offset="1" style="stop-color:var(--k);stop-opacity:1"/></linearGradient></defs>`;
        if (!fl.ground) s += `<path class="sf-shadow" d="${line([[0, 0, 0], [fl.hx, fl.hy, 0]])}"/>`;
        s += `<path class="sf-trail${fl.ground ? ' sf-trail--ground' : ''}${kind === 'foul' ? ' sf-trail--foul' : ''}" d="${line(arc)}" stroke="url(#${gid})"/>`;
        let lp = e;
        if (kind === 'hr') {
          const sp = P(fl.hx, fl.hy, 18); lp = sp;
          let d = '';
          for (let i = 0; i < 10; i++) { const rr = i % 2 ? 5.6 : 12.5, t = -Math.PI / 2 + (i * Math.PI) / 5; d += (i ? 'L' : 'M') + f1(sp.x + rr * Math.cos(t)) + ' ' + f1(sp.y + rr * Math.sin(t)); }
          s += `<circle class="sf-land" cx="${sp.x}" cy="${sp.y}" r="15"/><path class="sf-star" d="${d}Z"/>`;
        } else {
          const r = clampN(11 / e.k, 3, 9);
          s += `<path class="sf-land${kind === 'foul' ? ' sf-land--foul' : ''}" d="${poly(disc(fl.hx, fl.hy, r, 20))}"/>`;
          if (kind !== 'foul') s += `<circle class="sf-core" cx="${e.x}" cy="${e.y}" r="2.6"/>`;
        }
        if (h.dist !== null && h.dist > 0 && kind !== 'foul') {
          const right = lp.x > W * 0.68;
          s += `<text class="sf-dist" x="${clampN(lp.x + (right ? -20 : 20), 24, W - 24)}" y="${clampN(lp.y + 4.5, 18, H - 8)}" text-anchor="${right ? 'end' : 'start'}">${Math.round(h.dist)} ft</text>`;
        }
        s += '</g>';
      }
      Object.keys(SPOTS).forEach((k) => {
        const p = sit.field[k]; if (!p) return;
        const gp = P(SPOTS[k][0], SPOTS[k][1], 0), b = P(SPOTS[k][0], SPOTS[k][1], 4), r = clampN(b.k * 2.2, 6.5, 10), l = LBL[k];
        s += `<g><title>${esc(p.n)} (${k})</title><ellipse class="sf-shade" cx="${gp.x}" cy="${gp.y}" rx="${f1(r * 1.2)}" ry="${f1(r * 0.42)}"/>` +
          `<circle class="sf-fld" cx="${b.x}" cy="${b.y}" r="${f1(r)}" fill="${dotFill}"/>` +
          `<text class="sf-pos" x="${l === 'r' ? f1(b.x + r + 5) : (l === 'l' ? f1(b.x - r - 5) : b.x)}" y="${l === 'b' ? f1(gp.y + r * 0.42 + 14) : f1(b.y + 4)}" text-anchor="${l === 'r' ? 'start' : (l === 'l' ? 'end' : 'middle')}">${k}</text></g>`;
      });
      if (sit.ab.batter) { const hp = P(0, 0, 0); s += `<text class="sf-nm" x="${f1(hp.x - 20)}" y="${f1(hp.y + 5)}" text-anchor="end">${esc(sit.ab.batter.ln)}</text>`; }
      return s;
    }
    function unproject(sx, sy) {
      const u = (sx - CX) / F, v = (CY - sy) / F;
      const dx = FWD[0] + u * RIGHT[0] + v * UPV[0];
      const dy = FWD[1] + u * RIGHT[1] + v * UPV[1];
      const dz = FWD[2] + u * RIGHT[2] + v * UPV[2];
      if (dz >= -1e-6) return null;
      const t = -CAM[2] / dz;
      return [CAM[0] + t * dx, CAM[1] + t * dy];
    }
    return { W, H, svg, P, polar, FENCE, unproject };
  })();
  const headshot = (id) => `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best,f_png/v1/people/${encodeURIComponent(id)}/headshot/silo/current.png`;
  const initials = (n) => String(n || '').split(/\s+/).filter(Boolean).filter((w, i, a) => i === 0 || i === a.length - 1).map((w) => w[0]).join('').toUpperCase();
  const handP = (c) => (c === 'L' ? 'LHP' : (c === 'R' ? 'RHP' : 'Pitcher'));
  const handB = (c) => (c === 'L' ? 'Bats L' : (c === 'R' ? 'Bats R' : (c === 'S' ? 'Switch' : '')));
  const outsDots = (n) => `<span class="kz-outs" title="${n} out${n === 1 ? '' : 's'}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'is-on' : ''}"></i>`).join('')}</span>`;
  function whoHtml(p, role, sub, cls) {
    if (!p) return `<div class="kz-who ${cls}"><div class="kz-who__txt"><div class="kz-who__role">${role}</div><div class="kz-who__name">&mdash;</div></div></div>`;
    const img = p.id !== undefined && p.id !== null
      ? `<img src="${headshot(p.id)}" alt="" loading="lazy" onload="this.parentNode.classList.add('is-loaded')" onerror="this.remove()">` : '';
    const name = p.id !== undefined && p.id !== null
      ? `<a href="/player/?id=${encodeURIComponent(p.id)}">${esc(p.n)}</a>` : esc(p.n);
    return `<div class="kz-who ${cls}"><span class="kz-ph"><b>${esc(initials(p.n))}</b>${img}</span>` +
      `<div class="kz-who__txt"><div class="kz-who__role">${role}</div><div class="kz-who__name">${name}</div><div class="kz-who__sub">${esc(sub || '')}</div></div></div>`;
  }
  function hitKind(ab) {
    const h = ab.hit;
    if (!h) return null;
    if (h.inPlay) {
      if (ab.live) return 'pending';
      const ev = (ab.result && ab.result.ev) || '';
      if (/home run/i.test(ev)) return 'hr';
      if (/^(single|double|triple)/i.test(ev)) return 'hit';
      if (/error/i.test(ev)) return 'err';
      return 'out';
    }
    return 'foul';
  }
  function zoneCardHtml(sit, opts) {
    const ab = sit.ab, side = batSide(ab.batter, ab.pitcher) || 'R', compact = !!(opts && opts.compact);
    const shown = ab.pitches.filter((p) => p.x !== null && p.z !== null);
    const aria = `Strike zone seen from the pitcher's side with ${shown.length} pitch${shown.length === 1 ? '' : 'es'} plotted.`;
    const bar = `<div class="kz-bar">${whoHtml(ab.pitcher, 'Pitching', handP(ab.pitcher && ab.pitcher.throws), 'kz-who--pit')}` +
      `<div class="kz-mid"><div class="kz-count">${sit.balls}&ndash;${sit.strikes}<small>Count</small></div>${outsDots(sit.outs)}</div>` +
      `${whoHtml(ab.batter, 'At bat', handB(ab.batter && ab.batter.bats), 'kz-who--bat')}</div>`;
    const lp = ab.pitches.length ? ab.pitches[ab.pitches.length - 1] : null;
    const last = lp
      ? `<div class="kz-last"><div class="kz-last__mph">${lp.mph !== null ? Number(lp.mph).toFixed(1) : '\u2014'}<small>mph</small></div>` +
        `<div class="kz-last__t">${esc(lp.type || 'Pitch')}</div><div class="kz-last__call is-${lp.cls}">${esc(lp.call || '')}</div></div>`
      : `<div class="kz-last kz-last--none">${ab.live ? 'Waiting for the first pitch' : 'No pitches tracked'}</div>`;
    const list = !compact && ab.pitches.length
      ? `<ol class="kz-list" aria-label="Pitches in this at-bat">${ab.pitches.map((p) =>
          `<li class="kz-row"><span class="kz-row__n is-${p.cls}">${p.n}</span><span class="kz-row__t">${esc(p.type || '\u2014')}</span>` +
          `<span class="kz-row__v">${p.mph !== null ? Number(p.mph).toFixed(1) : '\u2014'}</span><span class="kz-row__c">${esc(p.call || '')}</span></li>`).join('')}</ol>` : '';
    const zt = ab.zTop !== null ? ab.zTop : 3.5, zb = ab.zBot !== null ? ab.zBot : 1.5;
    const foot = `<div class="kz-foot"><span><i class="kz-key kz-key--ball"></i>Ball</span><span><i class="kz-key kz-key--strike"></i>Strike / foul</span>` +
      `<span><i class="kz-key kz-key--play"></i>In play</span><span>Zone ${zb.toFixed(2)}&ndash;${zt.toFixed(2)} ft &middot; Pitcher&rsquo;s view</span></div>`;
    return `<div class="kz-card${compact ? '' : ' kz-card--split'}">${bar}<div class="kz-body"><div class="kz-stage">` +
      `<svg class="kz-svg" viewBox="0 0 ${KZ.W} ${KZ.H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(aria)}">${KZ.svg(sit, side)}</svg>` +
      `<span class="kz-chip">Strike zone</span></div><div class="kz-side">${last}${list}${foot}</div></div></div>`;
  }
  function fieldCardHtml(sit) {
    const ab = sit.ab, kind = hitKind(ab), h = ab.hit;
    const label = kind === 'foul' ? 'Foul ball' : (!ab.live && ab.result && ab.result.ev ? ab.result.ev : 'In play');
    const aria = kind
      ? `Baseball field from behind home plate: ${label}.`
      : 'Baseball field from behind home plate with the fielders in position and the runners on base.';
    const mid = kind
      ? `<div class="kz-mid"><div class="kz-res sf-k--${kind}">${esc(label)}<small>${kind === 'foul' ? 'Foul' : 'Hit chart'}</small></div></div>`
      : `<div class="kz-mid"><div class="kz-count">${sit.balls}&ndash;${sit.strikes}<small>Count</small></div>${outsDots(sit.outs)}</div>`;
    const bar = `<div class="kz-bar">${whoHtml(ab.pitcher, 'Pitching', handP(ab.pitcher && ab.pitcher.throws), 'kz-who--pit')}${mid}` +
      `${whoHtml(ab.batter, ab.batter && ab.live && !kind ? 'Up to bat' : 'At bat', handB(ab.batter && ab.batter.bats), 'kz-who--bat')}</div>`;
    const stat = (l, v, u) => `<div class="sf-stat"><div class="sf-stat__l">${l}</div><div class="sf-stat__v">${v === null ? '\u2014' : v}${v !== null && u ? `<small>${u}</small>` : ''}</div></div>`;
    const stats = kind && kind !== 'foul'
      ? `<div class="sf-stats">${stat('Exit velo', h.mph !== null ? Number(h.mph).toFixed(1) : null, 'mph')}${stat('Launch angle', h.ang !== null ? Math.round(h.ang) + '\u00b0' : null)}` +
        `${stat('Distance', h.dist !== null && h.dist > 0 ? Math.round(h.dist) : null, 'ft')}${stat('Type', h.traj ? esc(prettyKey(h.traj)) : null)}</div>` : '';
    const key = kind
      ? `<div class="kz-foot"><span><i class="kz-key kz-key--hit"></i>Hit</span><span><i class="kz-key kz-key--out"></i>Out</span>` +
        `<span><i class="kz-key kz-key--hr"></i>Home run</span><span><i class="kz-key kz-key--foul"></i>Foul</span></div>` : '<div class="kz-foot"><span>Fielders in position</span></div>';
    const foot = `<div class="sf-note">${key}<span>High camera view &middot; generic outline: 330 ft down the lines, 400 to center</span></div>`;
    return `<div class="kz-card">${bar}<div class="sf-stage"><svg class="kz-svg" viewBox="0 0 ${SF.W} ${SF.H}" role="img" aria-label="${esc(aria)}">${SF.svg(sit, { kind })}</svg></div>${stats}${foot}</div>`;
  }
  function breakCardHtml(sit, v) {
    const a = v.runs.a === null ? 0 : v.runs.a, h = v.runs.h === null ? 0 : v.runs.h;
    const ord = sit.ord || (sit.inn !== null ? ordinal(sit.inn) : 'inning');
    const title = `${/^Middle/i.test(sit.state) ? 'Middle' : 'End'} of the ${ord}`;
    const ln = sit.line || { a: { r: a, h: 0, e: 0, lob: 0 }, h: { r: h, h: 0, e: 0, lob: 0 }, inns: [] };
    const mid = /^Middle/i.test(sit.state);
    const nextTxt = mid
      ? `Bottom of the ${ord} \u00b7 ${v.home.nick} batting`
      : `Top of the ${sit.inn !== null ? ordinal(sit.inn + 1) : 'next inning'} \u00b7 ${v.away.nick} batting`;
    const row = (t, n, lead) => `<div class="lv-brk__row${lead ? ' is-lead' : ''}"><span>${esc(t.nick)}</span><b>${n}</b></div>`;
    const cols = Math.max(9, ln.inns.length);
    const cell = (x) => `<td>${x === null || x === undefined ? '&middot;' : x}</td>`;
    const lrow = (t, idx, tot) => {
      let c = '';
      for (let i = 0; i < cols; i++) c += cell(ln.inns[i] ? ln.inns[i][idx] : null);
      return `<tr><th scope="row">${esc(t.nick)}</th>${c}<td class="lb-tot">${tot.r}</td><td class="lb-tot">${tot.h}</td><td class="lb-tot">${tot.e}</td></tr>`;
    };
    let hd = '<th></th>';
    for (let i = 1; i <= cols; i++) hd += `<th${sit.inn !== null && i === sit.inn ? ' class="is-now"' : ''}>${i}</th>`;
    hd += '<th class="lb-tot">R</th><th class="lb-tot">H</th><th class="lb-tot">E</th>';
    const table = `<div class="lv-brk__line"><table class="lv-brk__tbl" aria-label="Line score"><thead><tr>${hd}</tr></thead><tbody>${lrow(v.away, 0, ln.a)}${lrow(v.home, 1, ln.h)}</tbody></table></div>`;
    const lob = `<div class="lv-brk__facts"><span>Left on base</span><span>${esc(v.away.nick)} <b>${ln.a.lob}</b></span><span>${esc(v.home.nick)} <b>${ln.h.lob}</b></span></div>`;
    const aria = `${title}. ${v.away.nick} ${a}, ${v.home.nick} ${h}.`;
    return `<div class="kz-card"><div class="sf-stage lv-stage--break">` +
      `<svg class="kz-svg" viewBox="0 0 ${SF.W} ${SF.H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${SF.svg(null)}</svg>` +
      `<div class="lv-brk" role="status" aria-label="${esc(aria)}"><div class="lv-brk__eyebrow">Break</div><div class="lv-brk__title">${esc(title)}</div>` +
      `<div class="lv-brk__score">${row(v.away, a, a > h)}${row(v.home, h, h > a)}</div>${table}${lob}` +
      `<div class="lv-brk__next">Next: ${esc(nextTxt)}</div></div></div></div>`;
  }
  function stageCardHtml(sit, v, opts) {
    if (sit.brk) return breakCardHtml(sit, v);
    const ab = sit.ab;
    if (hitKind(ab) || ab.pitches.length === 0) return fieldCardHtml(sit);
    return zoneCardHtml(sit, opts);
  }
  async function fetchLiveFeed(gamePk) {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`);
    if (!res.ok) return null;
    return res.json();
  }
  function feedIsLive(feed) {
    const st = (feed && feed.gameData && feed.gameData.status) || {};
    const d = st.detailedState || '';
    if (/^(Final|Game Over|Completed Early)/i.test(d)) return false;
    if (/Postponed|Cancelled|Suspended/i.test(d)) return false;
    return st.abstractGameState === 'Live';
  }
  function featureHtml(feed, href) {
    if (!feedIsLive(feed)) return null;
    const gd = feed.gameData || {};
    const ls = (feed.liveData && feed.liveData.linescore) || {};
    const tm = gd.teams || {};
    const mk = (side, fallback) => {
      const t = tm[side] || {};
      const name = t.name ? String(t.name) : fallback;
      return { id: t.id !== undefined && t.id !== null ? t.id : null, name, nick: shortTeamName(name) };
    };
    const away = mk('away', 'Away'), home = mk('home', 'Home');
    const runOf = (side) => n0(ls.teams && ls.teams[side] ? ls.teams[side].runs : null);
    const v = { away, home, runs: { a: runOf('away'), h: runOf('home') } };
    const sit = liveSituation(feed);
    const label = liveStateLabel((gd.status || {}).detailedState, ls);
    const startIso = gd.datetime && gd.datetime.dateTime ? gd.datetime.dateTime : null;
    const startTime = startIso ? fmtGameTime(startIso) : '—';
    const teamHtml = (team) => {
      const img = team.id === null ? '' :
        `<img src="/assets/logos/${encodeURIComponent(team.id)}.webp" alt="" onerror="this.onerror=null;this.style.display='none';">`;
      const inner = `<span class="mu-logo">${img}</span><span class="mu-name">${esc(team.nick)}</span>`;
      return team.id === null
        ? `<div class="mu-team">${inner}</div>`
        : `<a class="mu-team" href="/team/?id=${encodeURIComponent(team.id)}">${inner}</a>`;
    };
    return `<div class="gm-live">` +
      `<div class="gh-state"><span class="live-badge" title="Game in progress"><span class="live-dot" aria-hidden="true"></span>LIVE` +
        `<span class="live-badge__state">${esc(label)}</span></span>` +
        (startTime !== '—' ? `<span class="gm-live__time">${esc(startTime)}</span>` : '') + `</div>` +
      `<div class="mu-top">` +
        teamHtml(away) +
        `<div class="mu-mid">` +
          `<div class="mu-score"><span class="sr-only">${esc(away.nick)} ${v.runs.a}, ${esc(home.nick)} ${v.runs.h}</span>` +
            `<span class="gh-num is-live" aria-hidden="true">${v.runs.a}</span>` +
            `<span class="mu-dash" aria-hidden="true">&ndash;</span>` +
            `<span class="gh-num is-live" aria-hidden="true">${v.runs.h}</span></div>` +
          sitBugHtml(sit) +
        `</div>` +
        teamHtml(home) +
      `</div>` +
      stageCardHtml(sit, v, { compact: true }) +
      `<a class="gm-live__more" href="${esc(href)}">Open the full game view &rarr;</a>` +
    `</div>`;
  }
  return { liveSituation, sitBugHtml, stageCardHtml, batSide, batsText, throwsText, fmtMph, fetchLiveFeed, featureHtml, whoHtml, SF };
})();
function runGamePage() {
  const statusEl = document.getElementById('status');
  const contentEl = document.getElementById('content');
  const byId = (id) => document.getElementById(id);
  const esc = escapeHtml;
  const GAME_POLL_MS = 8000;
  const WP_EVERY = 4;
  const TAB_KEYS = ['stats', 'summary', 'box', 'field', 'plays', 'winprob'];
  const ui = {
    tab: 'summary', boxSide: 'a', playFilter: 'all', playInning: 'all', playOrder: null, openPlays: new Set(),
    field: { open: false, status: 'idle', balls: [], shown: [], stamp: -1, busy: false, err: '', team: 'all', res: 'all', view: 'heat', hover: -1, pos: null },
  };
  let current = null;
  let view = null;
  let tabsReady = false;
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
    `<section class="block">${title ? `<h2 class="block__heading">${title}</h2>` : ''}${body}</section>`;
  const emptyMsg = (text) => `<p class="state-msg" style="padding:20px 0;">${esc(text)}</p>`;
  const playerLink = (id, name) => (id === null || id === undefined || id === ''
    ? esc(name)
    : `<a class="team-link" href="/player/?id=${encodeURIComponent(id)}">${esc(name)}</a>`);
  function ipToOuts(ip) {
    if (ip === null || ip === undefined || ip === '') return 0;
    const [whole, frac = '0'] = String(ip).split('.');
    return (parseInt(whole, 10) || 0) * 3 + (parseInt(frac, 10) || 0);
  }
  function outsToIp(outs) { return `${Math.floor(outs / 3)}.${outs % 3}`; }
  function safe(label, fn) {
    try { fn(); } catch (err) {
      console.error(`Game page: ${label} failed`, err);
      const el = byId(label);
      if (el) el.innerHTML = emptyMsg("Couldn't display this section.");
    }
  }
  async function main() {
    const gamePk = qs('id');
    let year = qs('year');
    if (!gamePk) {
      setStatus(statusEl, 'A game id is required, e.g. /game/?id=413649&year=2015', true);
      return;
    }
    setLoading(statusEl);
    let manifest, game;
    let liveFeed = null;
    try {
      manifest = await loadManifest();
      venueRef.manifest = manifest;
      venueRef.gamePk = gamePk;
      if (!year || Number(year) >= new Date().getFullYear()) {
        liveFeed = await fetchLiveFeed(gamePk).catch(() => null);
        if (liveFeed && feedState(liveFeed) === 'live') {
          await showLive(gamePk, liveFeed);
          return;
        }
        if (liveFeed && feedState(liveFeed) === 'preview') {
          await showPreview(gamePk, liveFeed);
          return;
        }
      }
      if (year) {
        game = await fetchSeasonFile(manifest, year, `games/${gamePk}.json`);
      } else {
        setLoading(statusEl);
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
            } catch (_) { }
          }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      }
    } catch (err) {
      setStatus(statusEl, `Couldn't load this game right now (${err.message}). Try refreshing.`, true);
      return;
    }
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
    venueRef.year = year ? Number(year) : null;
    paintGame(game);
    clearStatus(statusEl);
    contentEl.hidden = false;
  }
  const PV_POLL_MS = 30000;
  const pv = { rosters: {}, venues: {}, side: 'a', sig: '', ready: false };
  const PV_PIN = '<svg class="gx-info__pin" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<path d="M8 1.5a4.6 4.6 0 0 0-4.6 4.6c0 3.3 4.6 8.4 4.6 8.4s4.6-5.1 4.6-8.4A4.6 4.6 0 0 0 8 1.5zm0 6.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" fill="currentColor"/></svg>';
  const pvHand = (c) => (c === 'L' ? 'LHP' : (c === 'R' ? 'RHP' : 'Pitcher'));
  const pvBats = (c) => (c === 'L' ? 'Bats L' : (c === 'R' ? 'Bats R' : (c === 'S' ? 'Switch' : '')));
  const pvThrows = (c) => (c === 'L' ? 'Throws L' : (c === 'R' ? 'Throws R' : ''));
  async function pvGetJson(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; } finally { clearTimeout(t); }
  }
  function pvModel(feed) {
    const gd = feed.gameData || {};
    const bx = (feed.liveData && feed.liveData.boxscore) || {};
    const gp = gd.players || {};
    const mkTeam = (key, s, fallback) => {
      const meta = (gd.teams && gd.teams[key]) || {};
      const name = meta.name ? String(meta.name) : fallback;
      return {
        key, side: s, name, nick: shortTeamName(name),
        id: meta.id !== undefined && meta.id !== null ? meta.id : null,
        box: (bx.teams && bx.teams[key]) || {},
      };
    };
    const away = mkTeam('away', 'a', 'Away');
    const home = mkTeam('home', 'h', 'Home');
    const person = (team, id) => {
      const g = gp['ID' + id] || {};
      const b = (team.box.players && team.box.players['ID' + id]) || {};
      return {
        id,
        n: String(g.fullName || (b.person && b.person.fullName) || ''),
        pos: (b.position && b.position.abbreviation) || (g.primaryPosition && g.primaryPosition.abbreviation) || '',
        type: (b.position && b.position.type) || (g.primaryPosition && g.primaryPosition.type) || '',
        num: b.jerseyNumber || g.primaryNumber || '',
        bats: g.batSide && g.batSide.code,
        throws: g.pitchHand && g.pitchHand.code,
        season: b.seasonStats && b.seasonStats.pitching ? b.seasonStats.pitching : null,
      };
    };
    const lineupIds = (team) => (Array.isArray(team.box.battingOrder) ? team.box.battingOrder : [])
      .filter((id) => id !== undefined && id !== null);
    const dt = gd.datetime || {};
    return {
      gd, away, home, person, lineupIds,
      venue: gd.venue || {},
      probables: gd.probablePitchers || {},
      iso: dt.dateTime || null,
      weather: gd.weather || {},
      detail: (gd.status && gd.status.detailedState) || '',
    };
  }
  const pvSig = (m) => JSON.stringify([m.detail, m.iso, m.lineupIds(m.away), m.lineupIds(m.home),
    m.weather.temp, m.weather.condition, m.venue.id]);
  async function pvRoster(teamId) {
    if (teamId === null || teamId === undefined) return null;
    if (pv.rosters[teamId]) return pv.rosters[teamId];
    const data = await pvGetJson(`https://statsapi.mlb.com/api/v1/teams/${encodeURIComponent(teamId)}/roster?rosterType=active`);
    if (data && Array.isArray(data.roster) && data.roster.length) pv.rosters[teamId] = data.roster;
    return pv.rosters[teamId] || null;
  }
  async function pvVenue(venueId) {
    if (venueId === undefined || venueId === null) return {};
    if (pv.venues[venueId]) return pv.venues[venueId];
    const data = await pvGetJson(`https://statsapi.mlb.com/api/v1/venues/${encodeURIComponent(venueId)}?hydrate=location,fieldInfo`);
    const v = data && Array.isArray(data.venues) ? data.venues[0] : null;
    if (v) pv.venues[venueId] = v;
    return pv.venues[venueId] || {};
  }
  const pvGroupOf = (r) => {
    const t = String(r.type || '');
    if (/^pitcher$/i.test(t) || r.pos === 'P') return 'Pitchers';
    if (/^catcher$/i.test(t) || r.pos === 'C') return 'Catchers';
    if (/^infielder$/i.test(t) || ['1B', '2B', '3B', 'SS'].includes(r.pos)) return 'Infielders';
    if (/^outfielder$/i.test(t) || ['LF', 'CF', 'RF', 'OF'].includes(r.pos)) return 'Outfielders';
    return 'Hitters';
  };
  const PV_GROUP_ORDER = ['Pitchers', 'Catchers', 'Infielders', 'Outfielders', 'Hitters'];
  const pvLast = (n) => String(n || '').trim().split(/\s+/).pop().toLowerCase();
  function pvSub(p) {
    const parts = [];
    if (p.num !== '' && p.num !== null && p.num !== undefined) parts.push(`#${p.num}`);
    if (p.pos === 'P') { const t = pvThrows(p.throws); if (t) parts.push(t); }
    else {
      const b = pvBats(p.bats); if (b) parts.push(b);
      if (p.pos === 'TWP') { const t = pvThrows(p.throws); if (t) parts.push(t); }
    }
    return parts.join(' \u00b7 ');
  }
  function pvTeamPanel(m, team, rosterRows) {
    const { whoHtml } = LiveKit;
    const ids = m.lineupIds(team);
    const logo = team.id === null ? '' : teamLogoCardHtml(team.id);
    const nameHtml = team.id === null ? esc(team.name)
      : `<a href="/team/?id=${encodeURIComponent(team.id)}">${esc(team.name)}</a>`;
    const head = `<div class="pv-team__head">${logo}<span class="pv-team__name">${nameHtml}</span>` +
      `<span class="pv-chip${ids.length ? ' is-ok' : ''}">${ids.length ? 'Confirmed lineup' : 'Lineup not announced'}</span></div>`;
    let body = '';
    if (ids.length) {
      const rows = ids.map((id, i) => {
        const p = m.person(team, id);
        if (!p.n) return '';
        return `<li class="pv-row">${whoHtml(p, esc(`${i + 1}${p.pos ? ` \u00b7 ${p.pos}` : ''}`), pvSub(p), 'pv-who')}</li>`;
      }).join('');
      body = rows ? `<ol class="pv-list">${rows}</ol>` : '';
    }
    if (!body) {
      if (rosterRows && rosterRows.length) {
        const groups = new Map(PV_GROUP_ORDER.map((g) => [g, []]));
        rosterRows.forEach((r) => groups.get(pvGroupOf(r)).push(r));
        body = PV_GROUP_ORDER.map((g) => {
          const list = groups.get(g).sort((a, b) => pvLast(a.n).localeCompare(pvLast(b.n)));
          if (!list.length) return '';
          return `<div class="pv-group">${g}</div><ul class="pv-list">` +
            list.map((r) => `<li class="pv-row">${whoHtml(r, esc(r.pos || ''), pvSub(r), 'pv-who')}</li>`).join('') + `</ul>`;
        }).join('');
      }
      if (!body) body = emptyMsg("The roster isn't available right now.");
    }
    return `<div class="pv-team pv-team--${team.side}">${head}${body}</div>`;
  }
  function pvRosterRows(m, team, roster) {
    const rows = [];
    if (roster) {
      roster.forEach((r) => {
        if (!r || !r.person || r.person.id === undefined || r.person.id === null) return;
        const p = m.person(team, r.person.id);
        if (!p.n) p.n = String(r.person.fullName || '');
        if (r.position) { p.pos = r.position.abbreviation || p.pos; p.type = r.position.type || p.type; }
        if (r.jerseyNumber) p.num = r.jerseyNumber;
        if (p.n) rows.push(p);
      });
      return rows;
    }
    const pl = team.box.players || {};
    Object.keys(pl).forEach((k) => {
      const b = pl[k];
      if (!b || !b.person || b.person.id === undefined) return;
      const p = m.person(team, b.person.id);
      if (!p.n) p.n = String(b.person.fullName || '');
      if (p.n) rows.push(p);
    });
    return rows;
  }
  function pvHtml(m, vd, rosters) {
    const { whoHtml, SF } = LiveKit;
    const away = m.away, home = m.home;
    const tm = (m.iso && !Number.isNaN(new Date(m.iso).getTime())) ? new Date(m.iso) : null;
    const time = fmtGameTime(m.iso), day = fmtGameDay(m.iso);
    const dayLong = tm ? tm.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
    const venueName = String(vd.name || m.venue.name || '');
    const loc = vd.location || m.venue.location || {};
    const city = [loc.city, loc.stateAbbrev || loc.state].filter(Boolean).join(', ');
    const fact = (v, l) => `<div class="gx-fact"><div class="gx-fact__v">${esc(v)}</div><div class="gx-fact__l">${esc(l)}</div></div>`;
    const facts = [];
    const w = m.weather;
    if (w.temp) facts.push(fact(`${w.temp}\u00b0`, w.condition ? String(w.condition) : 'Weather'));
    else if (w.condition) facts.push(fact(String(w.condition), 'Weather'));
    const venueLine = venueName
      ? `<div class="gx-info__venue">${m.venue.id !== undefined && m.venue.id !== null
          ? `<a class="gx-info__link" href="/ballpark/?id=${encodeURIComponent(m.venue.id)}" title="Ballpark details">${PV_PIN}<span>${esc(venueName)}</span></a>`
          : `${PV_PIN}<span>${esc(venueName)}</span>`}</div>` : '';
    const whenLine = [dayLong, time !== '\u2014' ? time : ''].filter(Boolean).join(' \u00b7 ');
    const info = (venueLine || whenLine || facts.length)
      ? `<div class="gx-info"><div class="gx-info__main">${venueLine}` +
          (whenLine ? `<div class="gx-info__when">${esc(whenLine)}</div>` : '') + `</div>` +
          (facts.length ? `<div class="gx-info__facts">${facts.join('')}</div>` : '') + `</div>` : '';
    const hero = `<div class="gx-hero">${info}<div class="gx-hero__body">` +
      `<div class="mu-top">${heroTeamHtml(away)}` +
        `<div class="mu-mid pv-mid"><div class="pv-time">${esc(time)}</div>` +
          (day !== '\u2014' ? `<div class="pv-day">${esc(day)}</div>` : '') + `</div>` +
        `${heroTeamHtml(home)}</div></div></div>`;
    let park = '';
    if (venueName) {
      const fi = vd.fieldInfo || m.venue.fieldInfo || {};
      const dims = [['Left line', fi.leftLine], ['Left-center', fi.leftCenter], ['Center', fi.center],
        ['Right-center', fi.rightCenter], ['Right line', fi.rightLine]]
        .filter(([, v]) => Number(v) > 0)
        .map(([l, v]) => `<div class="pv-dim"><div class="pv-dim__v">${Number(v)}<small>ft</small></div><div class="pv-dim__l">${l}</div></div>`).join('');
      const bits = [];
      if (Number(fi.capacity) > 0) bits.push(['Capacity', Number(fi.capacity).toLocaleString('en-US')]);
      if (fi.turfType) bits.push(['Surface', String(fi.turfType)]);
      if (fi.roofType) bits.push(['Roof', String(fi.roofType)]);
      const bitsHtml = bits.map(([l, v]) => `<div class="pv-bit"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('');
      const nameHtml = m.venue.id !== undefined && m.venue.id !== null
        ? `<a href="/ballpark/?id=${encodeURIComponent(m.venue.id)}">${esc(venueName)}</a>` : esc(venueName);
      park = section('',
        `<div class="pv-park"><div class="pv-park__info"><div class="pv-park__name">${PV_PIN}<span>${nameHtml}</span></div>` +
          (city ? `<div class="pv-park__city">${esc(city)}</div>` : '') +
          (dims ? `<div class="pv-dims" aria-label="Distances to the outfield wall">${dims}</div>` : '') +
          (bitsHtml ? `<div class="pv-bits">${bitsHtml}</div>` : '') + `</div>` +
        `<div class="kz-card pv-park__map"><div class="sf-stage"><svg class="kz-svg" viewBox="0 0 ${SF.W} ${SF.H}" role="img" ` +
          `aria-label="Baseball field seen from behind home plate">${SF.svg(null)}</svg></div></div></div>`);
    }
    const anyLineup = m.lineupIds(away).length > 0 || m.lineupIds(home).length > 0;
    const tabBtn = (team) => `<button type="button" class="pv-tab${pv.side === team.side ? ' is-active' : ''}" data-pv-side="${team.side}" ` +
      `aria-pressed="${pv.side === team.side}">${team.id === null ? '' : teamLogoCardHtml(team.id)}<span>${esc(team.nick)}</span></button>`;
    const players = section(anyLineup ? 'Lineups' : '',
      `<div class="pv-tabs" role="group" aria-label="Choose a team">${tabBtn(away)}${tabBtn(home)}</div>` +
      `<div class="pv-teams" data-show="${pv.side}">${pvTeamPanel(m, away, rosters.a)}${pvTeamPanel(m, home, rosters.h)}</div>`);
    return `<h1 class="sr-only">${esc(away.name)} at ${esc(home.name)}, game preview</h1>${hero}${park}${players}`;
  }
  async function showPreview(gamePk, feed) {
    let root = byId('preview-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'preview-root';
      root.className = 'pv';
      contentEl.parentNode.insertBefore(root, contentEl);
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pv-side]');
        if (!b || !root.contains(b)) return;
        pv.side = b.dataset.pvSide === 'h' ? 'h' : 'a';
        const teams = root.querySelector('.pv-teams');
        if (teams) teams.setAttribute('data-show', pv.side);
        root.querySelectorAll('[data-pv-side]').forEach((x) => {
          const on = x.dataset.pvSide === pv.side;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
    }
    contentEl.hidden = true;
    async function paint(f) {
      const m = pvModel(f);
      const sig = pvSig(m);
      if (pv.ready && sig === pv.sig) return;
      const [vd, ra, rh] = await Promise.all([
        pvVenue(m.venue.id),
        m.lineupIds(m.away).length ? Promise.resolve(null) : pvRoster(m.away.id),
        m.lineupIds(m.home).length ? Promise.resolve(null) : pvRoster(m.home.id),
      ]);
      const rosters = {
        a: m.lineupIds(m.away).length ? null : pvRosterRows(m, m.away, ra),
        h: m.lineupIds(m.home).length ? null : pvRosterRows(m, m.home, rh),
      };
      document.title = `${m.away.nick} vs ${m.home.nick} \u2014 Hidden Ball`;
      root.innerHTML = pvHtml(m, vd, rosters);
      pv.sig = sig;
      pv.ready = true;
    }
    await paint(feed);
    clearStatus(statusEl);
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const next = await fetchLiveFeed(gamePk);
        if (!next) return;
        if (feedState(next) !== 'preview') {
          clearInterval(timer);
          window.location.reload();
          return;
        }
        await paint(next);
      } catch (_) { }
    }, PV_POLL_MS);
  }
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
  function feedState(feed) {
    const st = (feed && feed.gameData && feed.gameData.status) || {};
    const d = st.detailedState || '';
    if (/^(Final|Game Over|Completed Early)/i.test(d)) return 'final';
    if (/Postponed|Cancelled|Suspended/i.test(d)) return 'other';
    if (st.abstractGameState === 'Live') return 'live';
    if (st.abstractGameState === 'Final') return 'final';
    return 'preview';
  }
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
      venueId: gd.venue && gd.venue.id !== undefined ? gd.venue.id : null,
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
        if (state !== 'live') clearInterval(timer);
      } catch (_) { }
      finally { busy = false; }
    }, GAME_POLL_MS);
  }
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
    const info = new Map();
    for (const row of (Array.isArray(box.info) ? box.info : [])) {
      if (!Array.isArray(row)) continue;
      const [label, value] = row;
      if (label && value) info.set(String(label).trim(), String(value).replace(/\.\s*$/, '').trim());
    }
    const plays = (Array.isArray(game.plays) ? game.plays : []).map((p, i) => ({ ...p, i }));
    return {
      away, home, runs, live, winner, inn, innings: inn.length, lsTot, info, plays,
      startIso: game.date || null,
      names: game.names || {},
      officials: (Array.isArray(box.off) ? box.off : []).filter(Array.isArray),
    };
  }
  function scoreAfter(v, inning, half) {
    let a = 0, h = 0;
    for (let i = 0; i < v.inn.length && i < inning; i++) {
      const row = v.inn[i] || [];
      a += n0(row[0]);
      if (i < inning - 1 || half === 1) h += n0(row[4]);
    }
    return [a, h];
  }
  const { liveSituation, sitBugHtml, stageCardHtml, batSide, batsText, throwsText, fmtMph } = LiveKit;
  function liveHeadHtml(sit, v) {
    const ab = sit.ab;
    const tag = sit.brk ? 'Between innings' : (ab.live ? 'At bat' : 'Last play');
    const chip = (label, person, extra) => (person
      ? `<span class="lv-chip${extra ? ' ' + extra : ''}"><b>${esc(label)}</b> ${playerLink(person.id, person.n)}</span>` : '');
    const chips = [chip('Catcher', sit.field.C)];
    if (ab.next) chips.push(chip('Up next', ab.next));
    chips.push(chip('On deck', sit.onDeck), chip('In the hole', sit.inHole));
    const runners = [[1, '1B'], [2, '2B'], [3, '3B']].filter(([k]) => sit.runners[k])
      .map(([k, l]) => chip(l, sit.runners[k], 'lv-chip--run')).join('');
    const baseLine = sit.brk ? '' : (runners || `<span class="lv-chip lv-chip--none">Bases empty</span>`);
    return `<div class="lv-head">` +
      `<div class="lv-tag${ab.live && !sit.brk ? ' is-live' : ''}">${esc(tag)}${sit.brk ? ` &middot; ${esc(sit.state)} of the ${esc(sit.ord)}` : ''}</div>` +
      `<div class="lv-chips">${chips.filter(Boolean).join('')}</div>` +
      (baseLine ? `<div class="lv-chips">${baseLine}</div>` : '') +
    `</div>`;
  }
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
      stageCardHtml(sit, v) +
      feedCardHtml(sit, v);
    panel.hidden = false;
  }
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
    safe('g-field', fieldSync);
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
      if (name === 'field' && !ui.field.open) { ui.field.open = true; safe('g-field', fieldSync); }
      else if (name === 'field') fieldDraw();
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
    const finished = !!view && !view.live && view.runs.a !== null && view.runs.h !== null;
    show(TAB_KEYS.includes(want) ? want : (finished ? 'stats' : 'summary'));
    byId('g-box').addEventListener('click', (e) => {
      const b = e.target.closest('[data-side]');
      if (!b || !view) return;
      ui.boxSide = b.dataset.side === 'h' ? 'h' : 'a';
      safe('g-box', renderBox);
    });
    const fieldRoot = byId('g-field');
    fieldRoot.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft],[data-fr],[data-fv]');
      if (!b || !view) return;
      if (b.dataset.ft) ui.field.team = b.dataset.ft;
      if (b.dataset.fr) ui.field.res = b.dataset.fr;
      if (b.dataset.fv) ui.field.view = b.dataset.fv;
      safe('g-field', renderField);
    });
    fieldRoot.addEventListener('pointermove', fieldHover);
    fieldRoot.addEventListener('pointerdown', fieldHover);
    fieldRoot.addEventListener('pointerleave', fieldHideTip);
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
    }, true);
  }
  function heroTeamHtml(team) {
    const img = team.id === null || team.id === undefined ? '' :
      `<img src="/assets/logos/${encodeURIComponent(team.id)}.webp" alt="" ` +
      `onerror="this.onerror=null;this.style.display='none';">`;
    const inner = `<span class="mu-logo">${img}</span><span class="mu-name">${esc(team.nick)}</span>`;
    return team.id === null || team.id === undefined
      ? `<div class="mu-team">${inner}</div>`
      : `<a class="mu-team" href="/team/?id=${encodeURIComponent(team.id)}">${inner}</a>`;
  }
  function renderHero(game, v) {
    document.title = `${v.live ? 'LIVE \u00b7 ' : ''}${v.away.nick} vs ${v.home.nick} \u2014 Hidden Ball`;
    byId('game-date').textContent = fmtDate(game.date);
    byId('game-date').hidden = true;
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
      heroInfoHtml(game, v) +
      `<div class="gx-hero__body">` +
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
        `</div>` +
      `</div>`;
    byId('game-meta').hidden = true;
    if (!venueRef.started) {
      venueRef.started = true;
      resolveVenueId(game, v).then((id) => {
        if (!id) return;
        venueRef.id = id;
        if (current && view) safe('hero', () => renderHero(current, view));
      }).catch(() => {});
    }
  }
  function weatherParts(raw) {
    if (!raw) return null;
    const text = String(raw).trim();
    const m = /(-?\d+)\s*(?:\u00b0|degrees?)/i.exec(text);
    const temp = m ? Number(m[1]) : null;
    const cond = text.replace(/(-?\d+)\s*(?:\u00b0|degrees?)\s*,?\s*/i, '').replace(/[.\s]+$/, '').trim();
    return { temp, cond };
  }
  const venueRef = { manifest: null, gamePk: null, year: null, id: null, started: false };
  const normVenue = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  async function resolveVenueId(game, v) {
    const direct = [game.venueId, game.ballparkId, game.vid]
      .find((x) => x !== undefined && x !== null && x !== '' && Number(x) > 0);
    if (direct !== undefined) return String(direct);
    const m = venueRef.manifest;
    if (!m) return null;
    let y = venueRef.year;
    if (!y && game.date) {
      const dm = /^(\d{4})/.exec(String(game.date));
      if (dm) y = Number(dm[1]);
    }
    if (y && venueRef.gamePk) {
      try {
        const sched = await fetchSeasonFile(m, y, 'schedule.json');
        if (Array.isArray(sched)) {
          const g = sched.find((x) => x && [x.id, x.gamePk, x.pk, x.gameId]
            .some((k) => k !== undefined && k !== null && String(k) === String(venueRef.gamePk)));
          if (g && g.ballparkId !== undefined && g.ballparkId !== null && Number(g.ballparkId) > 0) {
            return String(g.ballparkId);
          }
        }
      } catch (_) { }
    }
    const name = v.info.get('Venue');
    if (!name) return null;
    try {
      const idx = await fetchCoreIndex(m, 'ballparks');
      const want = normVenue(name);
      if (!want) return null;
      let hit = idx.find((e) => e && normVenue(e.name) === want);
      if (!hit && want.length >= 6) {
        hit = idx.find((e) => {
          const n = normVenue(e && e.name);
          return n.length >= 6 && (n.includes(want) || want.includes(n));
        });
      }
      return hit ? String(hit.id) : null;
    } catch (_) {
      return null;
    }
  }
  function heroInfoHtml(game, v) {
    let when = '';
    const iso = game.date;
    const d = iso ? new Date(iso) : null;
    if (d && !Number.isNaN(d.getTime())) {
      const hasTime = /T\d\d:\d\d/.test(String(iso));
      const dayOpts = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      if (hasTime) {
        when = `${d.toLocaleDateString('en-US', dayOpts)} \u00b7 ` +
          fmtClock24(d);
      } else {
        when = d.toLocaleDateString('en-US', { ...dayOpts, timeZone: 'UTC' });
        const fp = v.info.get('First pitch');
        if (fp) when += ` \u00b7 ${to24hText(fp.replace(/[.\s]+$/, ''))}`;
      }
    }
    const venue = v.info.get('Venue');
    const facts = [];
    const fact = (value, label, title) =>
      `<div class="gx-fact"${title ? ` title="${esc(title)}"` : ''}><div class="gx-fact__v">${esc(value)}</div>` +
      `<div class="gx-fact__l">${esc(label)}</div></div>`;
    const w = weatherParts(v.info.get('Weather'));
    if (w) {
      if (w.temp !== null) {
        const c = Math.round((w.temp - 32) * 5 / 9);
        facts.push(fact(`${w.temp}\u00b0F`, `${w.cond ? w.cond + ' \u00b7 ' : ''}${c}\u00b0C`, `${w.temp}\u00b0F / ${c}\u00b0C`));
      } else if (w.cond) {
        facts.push(fact(w.cond, 'Weather'));
      }
    }
    const att = v.info.get('Att');
    if (att) facts.push(fact(att, 'Attendance'));
    const dur = v.info.get('T');
    if (dur) facts.push(fact(dur, 'Game time'));
    if (!venue && !when && !facts.length) return '';
    const pin = `<svg class="gx-info__pin" viewBox="0 0 16 16" aria-hidden="true" focusable="false">` +
      `<path d="M8 1.5a4.6 4.6 0 0 0-4.6 4.6c0 3.3 4.6 8.4 4.6 8.4s4.6-5.1 4.6-8.4A4.6 4.6 0 0 0 8 1.5zm0 6.4a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" fill="currentColor"/></svg>`;
    return `<div class="gx-info">` +
      `<div class="gx-info__main">` +
        (venue
          ? `<div class="gx-info__venue">` + (venueRef.id
              ? `<a class="gx-info__link" href="/ballpark/?id=${encodeURIComponent(venueRef.id)}" title="Ballpark details">${pin}<span>${esc(venue)}</span></a>`
              : `${pin}<span>${esc(venue)}</span>`) + `</div>`
          : '') +
        (when ? `<div class="gx-info__when">${esc(when)}</div>` : '') +
      `</div>` +
      (facts.length ? `<div class="gx-info__facts">${facts.join('')}</div>` : '') +
    `</div>`;
  }
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
  function batScore(p) {
    return n0(p.h) + n0(p.d) * 0.5 + n0(p.t) + n0(p.hr) * 3 + n0(p.rbi) * 1.5 + n0(p.r) * 0.5 + n0(p.sb) * 0.5 + n0(p.bb) * 0.3;
  }
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
  function firstPitchText(v) {
    const iso = v.startIso;
    if (iso && /T\d\d:\d\d/.test(String(iso))) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return fmtClock24(d);
    }
    return to24hText(v.info.get('First pitch'));
  }
  function infoHtml(v) {
    const order = ['Venue', 'First pitch', 'T', 'Att', 'Weather'];
    const labels = { T: 'Time of game', Att: 'Attendance' };
    const rows = [];
    for (const k of order) if (v.info.has(k)) rows.push([labels[k] || k, k === 'First pitch' ? firstPitchText(v) : v.info.get(k)]);
    for (const [k, val] of v.info) if (!order.includes(k) && k !== 'Wind') rows.push([k, val]);
    if (v.officials.length) {
      rows.push(['Umpires', v.officials.map(([pos, name]) => `${pos} \u2013 ${name}`).join(' \u00b7 ')]);
    }
    if (!rows.length) return '';
    return section('Game info', `<table class="trophy-table">${rows.map(([label, val]) =>
      `<tr><td class="trophy-label">${esc(label)}</td><td class="trophy-years">${esc(val)}</td></tr>`).join('')}</table>`);
  }
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
  function statRowHtml(label, a, h, opts = {}) {
    if (a === null || a === undefined || h === null || h === undefined) return '';
    if (!Number.isFinite(a) || !Number.isFinite(h)) return '';
    const fmt = opts.fmt || ((x) => String(x));
    const lead = opts.lead || 'high';
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
  const FLD_W = 520, FLD_H = 460, FLD_X0 = -260, FLD_Y0 = -30;
  const FLD_FIELDS = 'allPlays,result,event,eventType,description,about,inning,isTopInning,isComplete,isScoringPlay,' +
    'matchup,batter,pitcher,id,fullName,batSide,code,playEvents,details,isInPlay,hitData,launchSpeed,launchAngle,' +
    'totalDistance,trajectory,coordinates,coordX,coordY';
  const FLD_EVENT_RES = { single: '1B', double: '2B', triple: '3B', home_run: 'HR' };
  const FLD_COLORS = { OUT: '#9aa4b2', '1B': '#4ade80', '2B': '#38bdf8', '3B': '#c084fc', HR: '#facc15' };
  const FLD_NAMES = { OUT: 'Out / error', '1B': 'Single', '2B': 'Double', '3B': 'Triple', HR: 'Home run' };
  const FLD_ORDER = ['OUT', '1B', '2B', '3B', 'HR'];
  const FLD_NON_BIP = new Set(['strikeout', 'strikeout_double_play', 'strikeout_triple_play', 'walk', 'intent_walk',
    'hit_by_pitch', 'catcher_interf', 'batter_interference', 'balk', 'wild_pitch', 'passed_ball', 'pickoff_1b',
    'pickoff_2b', 'pickoff_3b', 'stolen_base_2b', 'stolen_base_3b', 'caught_stealing_2b', 'caught_stealing_3b']);
  const FLD_STOPS = [
    [0.00, [59, 130, 246, 0]], [0.12, [59, 130, 246, 95]], [0.32, [34, 211, 238, 150]],
    [0.52, [74, 222, 128, 185]], [0.72, [250, 204, 21, 210]], [0.88, [249, 115, 22, 225]], [1.00, [239, 68, 68, 240]],
  ];
  function fldRamp(t) {
    let k = 1;
    while (k < FLD_STOPS.length - 1 && t > FLD_STOPS[k][0]) k++;
    const [t0, c0] = FLD_STOPS[k - 1], [t1, c1] = FLD_STOPS[k];
    const f = t1 === t0 ? 0 : Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    return c0.map((c, i) => c + (c1[i] - c) * f);
  }
  async function fetchPlayByPlay(pk) {
    const base = `https://statsapi.mlb.com/api/v1/game/${encodeURIComponent(pk)}/playByPlay`;
    for (const url of [`${base}?fields=${FLD_FIELDS}`, base]) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const d = await res.json();
        if (d && Array.isArray(d.allPlays)) return d;
      } catch (_) { }
    }
    throw new Error("MLB's play-by-play feed isn't reachable right now");
  }
  function extractBalls(feed) {
    const out = [];
    for (const play of feed.allPlays) {
      if (!play || !play.matchup || !play.matchup.batter) continue;
      if (play.about && play.about.isComplete === false) continue;
      const et = play.result && play.result.eventType ? String(play.result.eventType) : '';
      const evs = Array.isArray(play.playEvents) ? play.playEvents : [];
      let hd = null;
      for (let i = evs.length - 1; i >= 0; i--) {
        const e = evs[i];
        const co = e && e.hitData && e.hitData.coordinates;
        if (!co || numOrNull(co.coordX) === null || numOrNull(co.coordY) === null) continue;
        if ((e.details && e.details.isInPlay === true) || (!e.details && !FLD_NON_BIP.has(et))) { hd = e.hitData; break; }
      }
      if (!hd) continue;
      const x = 2.5 * (Number(hd.coordinates.coordX) - 125.42);
      const y = 2.5 * (198.27 - Number(hd.coordinates.coordY));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const top = play.about && play.about.isTopInning !== undefined ? !!play.about.isTopInning : true;
      const b = play.matchup.batter;
      out.push({
        x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10,
        v: numOrNull(hd.launchSpeed), a: numOrNull(hd.launchAngle), d: numOrNull(hd.totalDistance),
        r: FLD_EVENT_RES[et] || 'OUT',
        ev: (play.result && play.result.event) || prettyKey(et) || 'Batted ball',
        side: top ? 'a' : 'h',
        t: top ? 0 : 1,
        inn: play.about ? play.about.inning : null,
        bid: b.id,
        bn: b.fullName || (view && view.names[b.id]) || 'Batter',
        s: play.matchup.batSide && play.matchup.batSide.code ? play.matchup.batSide.code : null,
      });
    }
    return out;
  }
  async function loadFieldBalls() {
    const f = ui.field;
    const pk = qs('id');
    if (!pk || f.busy) return;
    f.busy = true;
    const stamp = view ? view.plays.length : 0;
    if (f.status !== 'ready') { f.status = 'loading'; safe('g-field', renderField); }
    try {
      const feed = await fetchPlayByPlay(pk);
      f.balls = extractBalls(feed);
      f.status = 'ready';
      f.stamp = stamp;
      f.err = '';
    } catch (err) {
      if (f.status !== 'ready') { f.status = 'error'; f.err = err.message; }
    } finally {
      f.busy = false;
    }
    safe('g-field', renderField);
  }
  function fieldSync() {
    const f = ui.field;
    if (!f.open) return;
    if (!f.busy && (f.status === 'idle' || (f.status === 'ready' && view && view.live && f.stamp !== view.plays.length))) {
      loadFieldBalls();
    } else {
      renderField();
    }
  }
  function fieldFiltered(f) {
    return f.balls.filter((p) => {
      if (f.team !== 'all' && p.side !== f.team) return false;
      if (f.res === 'hit') return p.r !== 'OUT';
      if (f.res === 'hr') return p.r === 'HR';
      if (f.res === 'out') return p.r === 'OUT';
      return true;
    });
  }
  function fieldStats(pts) {
    const s = { n: pts.length, hits: 0, hr: 0, evN: 0, evSum: 0, evMax: 0, hard: 0, dMax: 0, z: [0, 0, 0] };
    for (const p of pts) {
      if (p.r !== 'OUT') s.hits++;
      if (p.r === 'HR') s.hr++;
      if (p.v !== null) { s.evN++; s.evSum += p.v; if (p.v > s.evMax) s.evMax = p.v; if (p.v >= 95) s.hard++; }
      if (p.d !== null && p.d > s.dMax) s.dMax = p.d;
      const ang = Math.atan2(p.x, p.y) * 180 / Math.PI;
      if (Math.abs(ang) <= 15) s.z[1]++;
      else if ((ang < 0) !== (p.s === 'L')) s.z[0]++;
      else s.z[2]++;
    }
    return s;
  }
  const FLD_LUT = (function buildLut() {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const c = fldRamp(i / 255);
      for (let k = 0; k < 4; k++) lut[i * 4 + k] = Math.round(c[k]);
    }
    return lut;
  })();
  const FLD_HT_W = 320;
  const fldHeatCanvas = document.createElement('canvas');
  let fldGround = null;
  let fldRO = null;
  function fldGroundMap() {
    if (fldGround) return fldGround;
    const SF = LiveKit.SF, w = FLD_HT_W, h = Math.round(w * SF.H / SF.W);
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    const sx = SF.W / w, sy = SF.H / h;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const g = SF.unproject((i + 0.5) * sx, (j + 0.5) * sy), k = j * w + i;
        if (g && Math.abs(g[0]) < 600 && g[1] > -60 && g[1] < 600) { gx[k] = g[0]; gy[k] = g[1]; }
        else { gx[k] = NaN; gy[k] = NaN; }
      }
    }
    fldGround = { gx, gy, w, h };
    return fldGround;
  }
  const fldPlaceCache = new WeakMap();
  function fldPlace(p) {
    let c = fldPlaceCache.get(p);
    if (c) return c;
    const SF = LiveKit.SF;
    const hx = Math.min(255, Math.max(-255, p.x)), hy = Math.min(425, Math.max(-25, p.y));
    c = { gx: hx, gy: hy, dx: hx, dy: hy, dz: 0 };
    const deg = Math.atan2(hx, hy) * 180 / Math.PI;
    if (hy > 0 && Math.abs(deg) <= 45) {
      const fe = SF.FENCE(deg), r0 = Math.hypot(hx, hy);
      if (r0 > 0) {
        const inside = Math.min(r0, fe - 3);
        c.gx = hx * inside / r0; c.gy = hy * inside / r0;
        c.dx = c.gx; c.dy = c.gy;
        if (p.r === 'HR') { const out = fe + 12; c.dx = hx * out / r0; c.dy = hy * out / r0; c.dz = 16; }
      }
    }
    fldPlaceCache.set(p, c);
    return c;
  }
  function fldClipFair(ctx, m) {
    const SF = LiveKit.SF;
    ctx.beginPath();
    let q = SF.P(0, 0, 0);
    ctx.moveTo(q.x * m.s, q.y * m.s);
    for (let d = -45; d <= 45.001; d += 3) {
      const a = SF.polar(d, SF.FENCE(d));
      q = SF.P(a[0], a[1], 0);
      ctx.lineTo(q.x * m.s, q.y * m.s);
    }
    ctx.closePath();
    ctx.clip();
  }
  function fldDrawHeat(ctx, m, pts) {
    const CELL = 4, gw = Math.ceil(FLD_W / CELL), gh = Math.ceil(FLD_H / CELL);
    const sigma = 18, reach = Math.ceil(sigma * 2.6 / CELL), inv = 1 / (2 * sigma * sigma);
    const grid = new Float32Array(gw * gh);
    for (const p of pts) {
      const c = fldPlace(p);
      const ci = Math.floor((c.gx - FLD_X0) / CELL), cj = Math.floor((c.gy - FLD_Y0) / CELL);
      for (let j = Math.max(0, cj - reach); j <= Math.min(gh - 1, cj + reach); j++) {
        const dy = FLD_Y0 + (j + 0.5) * CELL - c.gy;
        for (let i = Math.max(0, ci - reach); i <= Math.min(gw - 1, ci + reach); i++) {
          const dx = FLD_X0 + (i + 0.5) * CELL - c.gx;
          grid[j * gw + i] += Math.exp(-(dx * dx + dy * dy) * inv);
        }
      }
    }
    let max = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
    const denom = Math.max(max, 2.5);
    const g = fldGroundMap();
    fldHeatCanvas.width = g.w; fldHeatCanvas.height = g.h;
    const hctx = fldHeatCanvas.getContext('2d');
    const img = hctx.createImageData(g.w, g.h);
    for (let k = 0; k < g.gx.length; k++) {
      const x = g.gx[k];
      if (x !== x) continue;
      const fx = (x - FLD_X0) / CELL - 0.5, fy = (g.gy[k] - FLD_Y0) / CELL - 0.5;
      const i0 = Math.floor(fx), j0 = Math.floor(fy);
      if (i0 < 0 || j0 < 0 || i0 >= gw - 1 || j0 >= gh - 1) continue;
      const tx = fx - i0, ty = fy - j0, o = j0 * gw + i0;
      const val = grid[o] * (1 - tx) * (1 - ty) + grid[o + 1] * tx * (1 - ty) + grid[o + gw] * (1 - tx) * ty + grid[o + gw + 1] * tx * ty;
      const idx = Math.min(255, Math.floor(Math.pow(val / denom, 0.8) * 255)) * 4;
      img.data[k * 4] = FLD_LUT[idx]; img.data[k * 4 + 1] = FLD_LUT[idx + 1];
      img.data[k * 4 + 2] = FLD_LUT[idx + 2]; img.data[k * 4 + 3] = FLD_LUT[idx + 3];
    }
    hctx.putImageData(img, 0, 0);
    ctx.save();
    fldClipFair(ctx, m);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fldHeatCanvas, 0, 0, g.w, g.h, 0, 0, m.w, m.h);
    ctx.restore();
  }
  function fldDrawDots(ctx, m, pts) {
    const SF = LiveKit.SF, f = ui.field;
    const pos = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const c = fldPlace(pts[i]), q = SF.P(c.dx, c.dy, c.dz);
      const cssPerFt = q.k * m.s / m.dpr;
      pos[i] = { x: q.x * m.s, y: q.y * m.s, r: Math.min(6.2, Math.max(3, cssPerFt * 3.4)) * m.dpr };
    }
    f.pos = pos;
    ctx.lineWidth = Math.max(1, m.dpr);
    ctx.strokeStyle = 'rgba(10,14,20,0.85)';
    for (const res of FLD_ORDER) {
      ctx.fillStyle = FLD_COLORS[res];
      ctx.globalAlpha = res === 'OUT' ? 0.8 : 0.95;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].r !== res) continue;
        const o = pos[i], r = res === 'HR' ? o.r * 1.35 : o.r;
        ctx.beginPath();
        if (pts[i].side === 'a') {
          ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
        } else {
          const d = r * 1.25;
          ctx.moveTo(o.x, o.y - d); ctx.lineTo(o.x + d, o.y); ctx.lineTo(o.x, o.y + d); ctx.lineTo(o.x - d, o.y);
          ctx.closePath();
        }
        ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (f.hover >= 0 && pos[f.hover]) {
      const o = pos[f.hover];
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#f9f8f4'; ctx.lineWidth = Math.max(1.5, m.dpr * 1.5); ctx.stroke();
    }
  }
  function fieldDraw() {
    const root = byId('g-field');
    const field = root && root.querySelector('.gf-field');
    const canvas = field && field.querySelector('.gf-canvas');
    const f = ui.field;
    if (!canvas) return;
    const cssW = field.clientWidth;
    if (!cssW) return;
    const SF = LiveKit.SF;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssW * dpr), h = Math.round(w * SF.H / SF.W);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    f.pos = null;
    if (!f.shown.length) return;
    const m = { cssW, dpr, w, h, s: w / SF.W };
    if (f.view === 'heat') fldDrawHeat(ctx, m, f.shown);
    else fldDrawDots(ctx, m, f.shown);
  }
  function renderField() {
    const root = byId('g-field');
    const f = ui.field, v = view;
    if (!root || !f.open || !v) return;
    if (!f.balls.length) {
      if (f.status === 'idle' || f.status === 'loading') { root.innerHTML = loaderBlockHtml(); return; }
      if (f.status === 'error') { root.innerHTML = emptyMsg(`Couldn't load batted-ball locations (${f.err}).`); return; }
      root.innerHTML = emptyMsg(v.live
        ? 'No balls in play yet.'
        : 'MLB has no hit-location data for this game. Locations are only tracked for more recent seasons.');
      return;
    }
    const seg = (attr, cur, items) => `<div class="hm-seg gf-seg" role="group">` +
      items.map(([k, label]) => `<button type="button" class="hm-seg__btn${cur === k ? ' is-active' : ''}" ${attr}="${k}" ` +
        `aria-pressed="${cur === k}">${label}</button>`).join('') + `</div>`;
    const controls = `<div class="hm-controls">` +
      seg('data-ft', f.team, [
        ['all', 'Both teams'],
        ['a', `${teamLogoCardHtml(v.away.id)}<span>${esc(v.away.nick)}</span>`],
        ['h', `${teamLogoCardHtml(v.home.id)}<span>${esc(v.home.nick)}</span>`],
      ]) +
      seg('data-fr', f.res, [['all', 'All'], ['hit', 'Hits'], ['hr', 'Home runs'], ['out', 'Outs']]) +
    `</div>`;
    const shown = fieldFiltered(f);
    f.shown = shown;
    f.hover = -1;
    f.pos = null;
    const s = fieldStats(shown);
    const dash = '—';
    const tile = (val, lbl) => `<div class="hm-tile"><div class="hm-tile__val">${val}</div><div class="hm-tile__lbl">${lbl}</div></div>`;
    const tiles = [
      tile(s.n, 'Balls in play'),
      tile(s.n ? s.hits : dash, 'Hits'),
      tile(s.n ? s.hr : dash, 'Home runs'),
      tile(s.evN ? `${(s.evSum / s.evN).toFixed(1)}<small> mph</small>` : dash, 'Avg exit velo'),
      tile(s.evN ? `${s.evMax.toFixed(1)}<small> mph</small>` : dash, 'Hardest hit'),
      tile(s.dMax > 0 ? `${Math.round(s.dMax)}<small> ft</small>` : dash, 'Longest'),
    ].join('');
    const names = ['Pull', 'Center', 'Oppo'], cols = ['#38bdf8', '#a3b1c6', '#fb923c'];
    const tot = s.z[0] + s.z[1] + s.z[2];
    const spray = tot
      ? `<div class="hm-spray">${s.z.map((n, i) => `<span style="width:${(n * 100 / tot).toFixed(2)}%;background:${cols[i]}"></span>`).join('')}</div>` +
        `<div class="hm-spray__lbl">${s.z.map((n, i) => `<span><i style="background:${cols[i]}"></i>${names[i]} ${Math.round(n * 100 / tot)}%</span>`).join('')}</div>`
      : `<p class="hm-note">${dash}</p>`;
    const hardest = shown.filter((p) => p.v !== null).sort((a, b) => b.v - a.v).slice(0, 5);
    const hardList = hardest.length
      ? `<ol class="gf-top">${hardest.map((p) => {
          const team = p.side === 'a' ? v.away : v.home;
          const bits = [`${p.v.toFixed(1)} mph`, p.d !== null && p.d > 0 ? `${Math.round(p.d)} ft` : null].filter(Boolean).join(' · ');
          return `<li><span class="gf-top__who">${teamLogoCardHtml(team.id)}<span>${playerLink(p.bid, p.bn)}</span></span>` +
            `<span class="gf-top__line"><b style="color:${FLD_COLORS[p.r]}">${esc(p.ev)}</b> · ${esc(bits)} · ${esc(halfLabel(p.t, p.inn))}</span></li>`;
        }).join('')}</ol>`
      : `<p class="hm-note">${dash}</p>`;
    const legend = f.view === 'heat'
      ? `<div class="hm-grad"></div><div class="hm-grad__lbl"><span>Fewer</span><span>More balls</span></div>`
      : `<div class="hm-legend">${FLD_ORDER.map((k) => `<span><i style="background:${FLD_COLORS[k]}"></i>${FLD_NAMES[k]}</span>`).join('')}</div>` +
        `<div class="hm-legend"><span><i class="gf-shape gf-shape--c"></i>${esc(v.away.nick)}</span>` +
        `<span><i class="gf-shape gf-shape--d"></i>${esc(v.home.nick)}</span></div>`;
    const title = f.team === 'a' ? v.away.nick : (f.team === 'h' ? v.home.nick : 'Both teams');
    const sub = shown.length === f.balls.length
      ? `${f.balls.length} ball${f.balls.length === 1 ? '' : 's'} in play${v.live ? ' so far' : ''}`
      : `${shown.length} of ${f.balls.length} shown`;
    const empty = shown.length === 0 ? `<div class="gf-empty">No balls match this filter.</div>` : '';
    const scene = `<svg class="hm-svg" viewBox="0 0 ${LiveKit.SF.W} ${LiveKit.SF.H}" preserveAspectRatio="xMidYMid meet" role="img" ` +
      `aria-label="Baseball field seen from a high camera behind home plate, showing where each ball in play went">${LiveKit.SF.svg(null)}</svg>`;
    root.innerHTML = controls +
      `<div class="hm-layout">` +
        `<div class="hm-field hm-field--3d gf-field">${scene}<canvas class="hm-canvas gf-canvas"></canvas>${empty}<div class="hm-tip" hidden></div></div>` +
        `<div class="hm-side">` +
          `<h3 class="hm-side__title">${esc(title)}</h3><p class="hm-side__sub">${esc(sub)}</p>` +
          `<div class="hm-tiles">${tiles}</div>` +
          `<h4 class="hm-side__h">Spray</h4>${spray}` +
          `<h4 class="hm-side__h">Hardest hit</h4>${hardList}` +
          `<h4 class="hm-side__h">Legend</h4>${legend}` +
          `<p class="hm-note">Balls in play</p>` +
        `</div>` +
      `</div>`;
    const fieldEl = root.querySelector('.gf-field');
    if (fldRO) { fldRO.disconnect(); fldRO = null; }
    if (fieldEl && typeof ResizeObserver === 'function') {
      fldRO = new ResizeObserver(() => fieldDraw());
      fldRO.observe(fieldEl);
    }
    fieldDraw();
  }
  function fieldHover(e) {
    const f = ui.field;
    if (f.view !== 'dots' || !f.pos) return;
    const field = e.currentTarget.querySelector('.gf-field');
    const canvas = field && field.querySelector('.gf-canvas');
    const tip = field && field.querySelector('.hm-tip');
    if (!canvas || !tip) return;
    const rect = canvas.getBoundingClientRect();
    let idx = -1;
    if (rect.width && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const sc = canvas.width / rect.width;
      const mx = (e.clientX - rect.left) * sc, my = (e.clientY - rect.top) * sc;
      const reach = (e.pointerType === 'touch' ? 24 : 12) * sc;
      let bd = reach * reach;
      for (let i = 0; i < f.pos.length; i++) {
        const o = f.pos[i], d = (o.x - mx) * (o.x - mx) + (o.y - my) * (o.y - my);
        if (d <= bd) { bd = d; idx = i; }
      }
    }
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx === f.hover) return;
    f.hover = idx;
    const p = idx >= 0 && view ? f.shown[idx] : null;
    if (!p) {
      tip.hidden = true;
    } else {
      const team = p.side === 'a' ? view.away : view.home;
      const bits = [p.v !== null ? `${p.v.toFixed(1)} mph` : null, p.a !== null ? `${Math.round(p.a)}°` : null,
        p.d !== null && p.d > 0 ? `${Math.round(p.d)} ft` : null].filter(Boolean).join(' · ');
      tip.innerHTML = `<strong>${esc(p.bn)}</strong> · ${esc(team.nick)}<br>` +
        `<span style="color:${FLD_COLORS[p.r]}">${esc(p.ev)}</span> · ${esc(halfLabel(p.t, p.inn))}` +
        (bits ? `<br>${esc(bits)}` : '');
      tip.hidden = false;
      const sc = canvas.width / rect.width, o = f.pos[idx];
      const fw = field.clientWidth, fh = field.clientHeight;
      const left = o.x / sc + 12, top = o.y / sc + 12;
      tip.style.left = `${Math.max(4, Math.min(left, fw - tip.offsetWidth - 4))}px`;
      tip.style.top = `${Math.max(4, Math.min(top, fh - tip.offsetHeight - 4))}px`;
    }
    fieldDraw();
  }
  function fieldHideTip(e) {
    if (e && e.pointerType === 'touch') return;
    const tip = e.currentTarget.querySelector('.hm-tip');
    if (tip) tip.hidden = true;
    if (ui.field.hover !== -1) { ui.field.hover = -1; fieldDraw(); }
  }
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
    const vals = pts.map(p => Number(p[1]) * scale);
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
    const body = vals.length > 2 ? vals.slice(0, -1) : vals;
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
      kpis + moments;
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
function runSearchPage() {
  const LABELS = {
    all: 'Search', teams: 'Teams', players: 'Players', managers: 'Managers', ballparks: 'Ballparks', scores: 'Scores',
    transactions: 'Transactions', draft: 'Draft', awards: 'Awards', leaders: 'Top Players',
  };
  const TYPES = Object.keys(LABELS);
  const TITLES = {
    all: 'Search', teams: 'Teams', players: 'Players', managers: 'Managers', ballparks: 'Ballparks', scores: 'Scores',
    transactions: 'Transactions', draft: 'Draft', awards: 'Awards', leaders: 'Top Players',
  };
  const SEARCHABLE = new Set(['all', 'teams', 'players', 'managers']);
  const PER_TYPE = 12;
  const VIEWS = {
    teams: {
      label: 'Teams',
      run: runTeamsPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <div class="tm-search">
      <svg class="tm-search__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input id="team-search" type="search" placeholder="Search teams…" aria-label="Search teams" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search">
      <button id="team-search-clear" class="tm-search__clear" type="button" aria-label="Clear search" hidden>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div id="team-grid" class="tm-sections"></div>
  </div>
`,
    },
    players: {
      label: 'Players',
      run: runPlayersPage,
      html: `
  <div id="status" class="state-msg" hidden></div>
  <div id="content" hidden>
    <input id="player-search" type="text" placeholder="Search players…">
    <div id="player-grid" class="entity-grid"></div>
  </div>
`,
    },
    managers: {
      label: 'Managers',
      run: runManagersPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <input id="manager-search" type="text" placeholder="Search managers…" aria-label="Search managers" autocomplete="off" spellcheck="false">
    <div id="manager-grid" class="entity-grid"></div>
  </div>
`,
    },
    ballparks: {
      label: 'Ballparks',
      run: runBallparksPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <div id="ballpark-grid" class="entity-grid"></div>
  </div>
`,
    },
    scores: {
      label: 'Scores',
      run: runScoresPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <div class="sc-bar">
      <nav id="year-picker" aria-label="Choose a season"></nav>
      <input id="date-filter" type="date" aria-label="Filter by date">
    </div>
    <div id="scores-table" class="sc-list"></div>
  </div>
`,
    },
    transactions: {
      label: 'Transactions',
      run: runTransactionsPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <div class="tx-bar">
      <nav id="year-picker" aria-label="Choose a season"></nav>
      <nav id="month-picker" aria-label="Choose a month"></nav>
    </div>
    <div id="tx-filters" class="tx-picker tx-picker--wrap tx-filters" role="group" aria-label="Filter by type" hidden></div>
    <div id="tx-list" class="tx-mag"></div>
  </div>
`,
    },
    draft: {
      label: 'Draft',
      run: runDraftPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <nav id="year-picker" aria-label="Choose a season"></nav>
    <div class="table-scroll">
      <table class="ledger" id="draft-table">
        <thead><tr>
          <th>Rd</th><th>Pick</th><th class="left">Player</th><th class="left">Pos</th><th class="left">School</th><th class="left">Team</th>
        </tr></thead>
        <tbody id="draft-body"></tbody>
      </table>
    </div>
  </div>
`,
    },
    awards: {
      label: 'Awards',
      run: runAwardsPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <h1 class="hero__title" id="awards-title" hidden>—</h1>
    <nav id="year-picker" aria-label="Choose a season"></nav>
    <div class="aw-grid" id="awards-table"></div>
  </div>
`,
    },
    leaders: {
      label: 'Top Players',
      run: runLeadersPage,
      html: `
  <div id="status" class="state-msg" role="status" hidden></div>
  <div id="content" hidden>
    <div id="leader-controls"></div>
    <ol class="tp-list" id="leaders-body"></ol>
  </div>
`,
    },
  };
  const viewEl = document.getElementById('search-view');
  const boxEl = document.getElementById('sx-search');
  const inputEl = document.getElementById('sx-input');
  const clearBtn = document.getElementById('sx-clear');
  const typesEl = document.getElementById('sx-types');
  const type = TYPES.includes(qs('type')) ? qs('type') : 'all';
  let query = qs('q') || '';
  const norm = (s) => String(s === null || s === undefined ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  function chipHref(t) {
    const p = new URLSearchParams();
    if (t !== 'all') p.set('type', t);
    if (SEARCHABLE.has(t) && query.trim()) p.set('q', query.trim());
    const s = p.toString();
    return '/archive/' + (s ? `?${s}` : '');
  }
  function renderChips() {
    typesEl.innerHTML = TYPES.map((t) => t === type
      ? `<span class="tx-chip is-active" aria-current="page">${LABELS[t]}</span>`
      : `<a class="tx-chip" href="${chipHref(t)}">${LABELS[t]}</a>`
    ).join('');
  }
  function syncUrl() {
    try {
      const u = new URL(window.location.href);
      if (query.trim()) u.searchParams.set('q', query.trim()); else u.searchParams.delete('q');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (_) { }
  }
  async function runAll() {
    viewEl.innerHTML =
      '<div id="sx-status" class="state-msg" role="status" hidden></div>' +
      '<p id="sx-hint" class="tm-count" aria-live="polite"></p>' +
      '<div id="sx-results"></div>';
    const statusEl = document.getElementById('sx-status');
    const hintEl = document.getElementById('sx-hint');
    const resultsEl = document.getElementById('sx-results');
    setLoading(statusEl);
    let teams, players, managers;
    try {
      const manifest = await loadManifest();
      const [t, p, m] = await Promise.all(['teams', 'players', 'managers'].map((n) => fetchCoreIndex(manifest, n)));
      teams = t.filter((e) => String(e.id) !== '14');
      players = p;
      managers = m;
    } catch (err) {
      setStatus(statusEl, `Couldn't load the archive right now (${err.message}). Try refreshing.`, true);
      return;
    }
    if (teams.length + players.length + managers.length === 0) {
      setStatus(statusEl, 'Nothing to search yet.', true);
      return;
    }
    clearStatus(statusEl);
    const prep = (list) => list.map((e) => ({ e, n: norm(e.name) }));
    const groups = [
      { key: 'teams', label: 'Teams', noun: 'teams', list: prep(teams),
        href: (e) => `/team/?id=${encodeURIComponent(e.id)}`, logo: (e) => e.id },
      { key: 'players', label: 'Players', noun: 'players', list: prep(players),
        href: (e) => `/player/?id=${encodeURIComponent(e.id)}` },
      { key: 'managers', label: 'Managers', noun: 'managers', list: prep(managers),
        href: (e) => `/manager/?id=${encodeURIComponent(e.id)}` },
    ];
    function render() {
      const q = norm(query);
      resultsEl.innerHTML = '';
      if (!q) {
        hintEl.textContent = '';
        return;
      }
      const tokens = q.split(/\s+/).filter(Boolean);
      let total = 0;
      for (const g of groups) {
        const hits = g.list.filter((x) => tokens.every((t) => x.n.includes(t))).map((x) => x.e);
        if (hits.length === 0) continue;
        total += hits.length;
        const sec = document.createElement('section');
        sec.className = 'block sx-section';
        sec.innerHTML =
          `<h2 class="block__heading">${g.label} <span class="sx-count">${hits.length.toLocaleString('en-US')}</span></h2>` +
          `<div class="entity-grid sx-grid"></div>`;
        initEntityBrowser({
          entries: hits.slice(0, PER_TYPE),
          containerEl: sec.querySelector('.sx-grid'),
          searchEl: null,
          hrefFor: g.href,
          logoFor: g.logo,
          maxRender: PER_TYPE,
          emptyMessage: '',
        });
        if (hits.length > PER_TYPE) {
          sec.insertAdjacentHTML('beforeend',
            `<a class="accent-link sx-more" href="/archive/?type=${g.key}&q=${encodeURIComponent(query.trim())}">` +
            `See all ${hits.length.toLocaleString('en-US')} ${g.noun} \u2192</a>`);
        }
        resultsEl.appendChild(sec);
      }
      if (total === 0) {
        hintEl.textContent = '';
        resultsEl.innerHTML = `<p class="state-msg">No teams, players or managers match \u201C${escapeHtml(query.trim())}\u201D.</p>`;
      } else {
        hintEl.textContent = `${total.toLocaleString('en-US')} ${total === 1 ? 'result' : 'results'} for \u201C${query.trim()}\u201D`;
      }
    }
    render();
    renderAll = render;
  }
  let renderAll = () => {};
  function driveInner() {
    const inner = viewEl.querySelector('#team-search, #player-search, #manager-search');
    if (!inner) return;
    inner.value = query;
    inner.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function onQueryChange() {
    query = inputEl.value;
    clearBtn.hidden = query.length === 0;
    syncUrl();
    renderChips();
    if (type === 'all') renderAll(); else driveInner();
  }
  const placeholders = {
    all: 'Search teams, players and managers\u2026', teams: 'Search teams\u2026',
    players: 'Search players\u2026', managers: 'Search managers\u2026',
  };
  document.title = type === 'all' ? 'Search \u2014 Hidden Ball' : `${LABELS[type]} \u2014 Hidden Ball`;
  renderChips();
  const titleEl = document.getElementById('sx-title');
  if (titleEl) {
    const txt = document.getElementById('sx-title-text');
    if (txt) txt.textContent = TITLES[type] || 'Search';
  }
  boxEl.hidden = !SEARCHABLE.has(type);
  inputEl.placeholder = placeholders[type] || '';
  inputEl.value = query;
  clearBtn.hidden = query.length === 0;
  let timer = null;
  inputEl.addEventListener('input', () => {
    clearBtn.hidden = inputEl.value.length === 0;
    clearTimeout(timer);
    timer = setTimeout(onQueryChange, 100);
  });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && inputEl.value) { inputEl.value = ''; onQueryChange(); }
  });
  clearBtn.addEventListener('click', () => { inputEl.value = ''; onQueryChange(); inputEl.focus(); });
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  if (type === 'all') {
    runAll();
  } else {
    viewEl.innerHTML = VIEWS[type].html;
    if (SEARCHABLE.has(type)) {
      const inner = viewEl.querySelector('#team-search, #player-search, #manager-search');
      if (inner) inner.value = query;
    }
    VIEWS[type].run();
  }
  if (SEARCHABLE.has(type) && !window.matchMedia('(pointer: coarse)').matches) {
    inputEl.focus({ preventScroll: true });
  }
}
function initBrand() {
  const brand = document.querySelector('.site-header .brand');
  if (!brand) return;
  brand.querySelectorAll('.brand__logo, .brand__word').forEach((el) => el.remove());
  const word = document.createElement('span');
  word.className = 'brand__word';
  word.setAttribute('aria-hidden', 'true');
  word.innerHTML = 'Hidden <span class="brand__ball">Ball</span>';
  brand.appendChild(word);
}
(function dispatch() {
  initBrand();
  if (document.getElementById('search-view')) { runSearchPage(); return; }
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
  if (document.getElementById('postseason-title')) { runPostseasonPage(); return; }
  if (document.getElementById('awards-title')) { runAwardsPage(); return; }
  if (document.getElementById('draft-title')) { runDraftPage(); return; }
  if (document.getElementById('tx-title')) { runTransactionsPage(); return; }
  if (document.getElementById('leader-controls')) { runLeadersPage(); return; }
  if (document.getElementById('game-matchup')) { runGamePage(); return; }
})();
