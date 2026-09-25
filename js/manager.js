import {
  loadManifest, fetchCoreRecord, fetchSeasonFile, createTeamNameResolver,
  qs, setStatus, clearStatus, fmtOrDash,
} from './common.js';

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
      <td class="left"><a class="team-link" href="team.html?id=${row.teamId}">${name}</a></td>
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
