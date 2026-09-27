import {
  loadManifest, createTeamNameResolver,
  qs, setStatus, clearStatus,
} from './common.js';

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
      <td class="left"><a class="team-link" href="team.html?id=${teamId}">${teamName}</a></td>
    </tr>`);
  }
  body.innerHTML = rows.join('');
}

main();
