import {
  loadManifest, fetchSeasonFile,
  qs, setStatus, clearStatus, fmtDate,
} from './common.js';

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
