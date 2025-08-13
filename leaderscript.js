// Leaderboard script
// This script fetches participant data from a published Google Sheet,
// parses the CSV, sorts entries by score and updates the table. It
// periodically refreshes the data every hour.

// URL to the published CSV. If this fetch fails due to CORS or other
// restrictions, a CORS proxy will be tried automatically.
const SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSLR7bXsB-PSdKArkvh4vrTP3QCXg9SkvXL7wYD49VFomRw0UqmQiXeRxkJJ0Ei7Fpo8rz5UgT25gCw/pub?gid=1152586903&single=true&output=csv';

// How often (in milliseconds) to refresh the leaderboard. One hour = 3.6e6 ms.
const REFRESH_INTERVAL_MS = 3.6e6;

/**
 * Fetches a CSV from a given URL. If the initial request fails (for example
 * due to CORS), it falls back to a free CORS proxy. The proxy simply
 * forwards the response while adding the appropriate headers to allow the
 * browser to read the data. A number of proxies exist; here we use
 * api.allorigins.win which has a simple interface.
 *
 * @param {string} url The URL to fetch
 * @returns {Promise<string>} The CSV text
 */
async function fetchCSV(url) {
  /**
   * Attempt to fetch the CSV using a list of proxy prefixes. The first entry
   * should be an empty string to represent the direct request. Each subsequent
   * entry will be prepended to the URL. For example, if url="https://foo.com",
   * and proxy="https://corsproxy.io/?", then the request will be made to
   * "https://corsproxy.io/?https://foo.com". If a fetch fails (due to CORS,
   * network errors, etc.), the next proxy in the list will be tried.
   */
  const proxies = [ '', 'https://corsproxy.io/?', 'https://api.allorigins.win/raw?url=' ];
  let lastError;
  for (const prefix of proxies) {
    const target = prefix ? prefix + encodeURIComponent(url) : url;
    try {
      const resp = await fetch(target);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      // If we successfully got some text, return it.
      if (text && text.trim().length > 0) {
        return text;
      }
    } catch (err) {
      lastError = err;
      // Try next proxy
    }
  }
  // If all proxies failed, throw the last captured error.
  throw lastError || new Error('Unable to fetch CSV');
}

/**
 * Parses a CSV string into an array of objects. The first line is assumed
 * to contain column headers. Cells are split on commas without regard to
 * quoted values for simplicity. If your sheet contains commas within
 * values, consider using a more robust CSV parser. Leading and trailing
 * whitespace around cell values is trimmed.
 *
 * @param {string} csv The CSV data as a string
 * @returns {Array<Object>} Array of row objects keyed by column name
 */
function parseCSV(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    if (cells.length === 1 && cells[0] === '') continue; // skip empty lines
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (cells[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Given an array of participant objects, sorts them descending by the
 * "Total Score" (converted to a number) and returns a new array with
 * combined name and numeric score.
 *
 * @param {Array<Object>} rows Rows from the parsed CSV
 * @returns {Array<{name: string, dealership: string, score: number}>}
 */
function transformData(rows) {
  return rows
    .map(row => {
      const firstName = row['First Name'] || row['First name'] || row['First'];
      const lastName = row['Last Name'] || row['Last name'] || row['Last'];
      const dealership = row['Dealership'] || row['Dealer'] || row['Company'];
      const scoreStr = row['Total Score'] || row['Score'] || row['Total'];
      const score = parseFloat(scoreStr);
      const name = [firstName, lastName].filter(Boolean).join(' ');
      return { name, dealership, score: isNaN(score) ? 0 : score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Renders leaderboard rows into the table body. It applies special
 * classes to the top three participants for enhanced styling and
 * uses badge elements for the rank numbers. The function clears
 * existing rows before rendering the new ones.
 *
 * @param {Array<{name:string, dealership:string, score:number}>} data Sorted participant data
 */
function renderLeaderboard(data) {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach((entry, index) => {
    const rank = index + 1;
    const tr = document.createElement('tr');
    // Apply rank-specific styling classes
    if (rank === 1) tr.classList.add('rank-1');
    else if (rank === 2) tr.classList.add('rank-2');
    else if (rank === 3) tr.classList.add('rank-3');
    else tr.classList.add('rank-default');
    // Create rank cell with badge
    const tdRank = document.createElement('td');
    tdRank.className = 'text-center py-2 px-2';
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    // Top three ranks can have unique colours; others share the same palette
    let badgeBg = '#3893B7';
    let badgeBorder = '#21A4D2';
    let badgeColor = '#FCF7EF';
    if (rank === 1) {
      badgeBg = '#3893B7';
      badgeBorder = '#21A4D2';
    } else if (rank === 2) {
      badgeBg = '#E8F4F8';
      badgeBorder = '#3893B7';
      badgeColor = '#3893B7';
    } else if (rank === 3) {
      badgeBg = '#FCF7EF';
      badgeBorder = '#21A4D2';
      badgeColor = '#21A4D2';
    }
    badge.style.backgroundColor = badgeBg;
    badge.style.borderColor = badgeBorder;
    badge.style.color = badgeColor;
    badge.textContent = `#${rank}`;
    tdRank.appendChild(badge);
    tr.appendChild(tdRank);
    // Name cell
    const tdName = document.createElement('td');
    tdName.className = 'font-semibold text-gray-800 py-2 px-2 sm:px-4';
    // Name with dealership on small screens
    const nameDiv = document.createElement('div');
    nameDiv.className = 'flex flex-col';
    const spanName = document.createElement('span');
    spanName.textContent = entry.name;
    nameDiv.appendChild(spanName);
    const spanDealershipSmall = document.createElement('span');
    spanDealershipSmall.className = 'sm:hidden text-xs text-gray-500 font-normal';
    spanDealershipSmall.textContent = entry.dealership;
    nameDiv.appendChild(spanDealershipSmall);
    tdName.appendChild(nameDiv);
    tr.appendChild(tdName);
    // Dealership cell (hidden on small screens)
    const tdDealer = document.createElement('td');
    tdDealer.className = 'font-medium text-gray-600 py-2 px-4 hidden sm:table-cell';
    tdDealer.textContent = entry.dealership;
    tr.appendChild(tdDealer);
    // Score cell
    const tdScore = document.createElement('td');
    tdScore.className = 'text-center py-2 px-4';
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'font-bold px-2 sm:px-3 py-1 rounded-full border-2';
    scoreSpan.style.color = '#21A4D2';
    scoreSpan.style.backgroundColor = '#E8F4F8';
    scoreSpan.style.borderColor = '#21A4D2';
    scoreSpan.textContent = `${entry.score}%`;
    tdScore.appendChild(scoreSpan);
    tr.appendChild(tdScore);
    tbody.appendChild(tr);
  });
}

/**
 * Retrieves the latest leaderboard data and updates the table. Errors are
 * logged to the console so that issues can be diagnosed without
 * interrupting the user experience. In a production setting you might
 * display a toast notification or fallback to cached results.
 */
async function refreshLeaderboard() {
  try {
    const csv = await fetchCSV(SHEET_CSV_URL);
    const parsed = parseCSV(csv);
    const transformed = transformData(parsed);
    renderLeaderboard(transformed);
  } catch (error) {
    console.error('Failed to update leaderboard:', error);
  }
}

// Initial load
refreshLeaderboard();
// Periodic refresh
setInterval(refreshLeaderboard, REFRESH_INTERVAL_MS);