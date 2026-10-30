/**
 * sheetSync.js
 *
 * Pulls daily performance numbers (Mon..Sun) from a user's public Google Sheet
 * and writes them into the `daily_performance` table, exactly like the manual
 * "Update Performance" flow already does.
 *
 * Supported sheet layouts (auto-detected):
 *
 *   Layout A — Day names as header row, values in the row below:
 *     Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
 *     120,     145,     98,        160,      134,    175,      155
 *
 *   Layout B — Two columns, one row per day, in any order:
 *     Day        Value
 *     Monday     120
 *     Tuesday    145
 *     ...
 *
 *   Layout C — Fallback: first 7 numeric cells found anywhere in the sheet,
 *     read left-to-right, top-to-bottom, are treated as Mon..Sun in order.
 *
 * The sheet must be shared as "Anyone with the link can view" (or published
 * to the web) since we use the public CSV export endpoint — no Google API
 * key or service account is required.
 */

const db = require('../config/db');

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ABBREV = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Convert any normal Google Sheets share URL into its CSV export URL.
 * Handles:
 *   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?usp=sharing
 *   https://docs.google.com/spreadsheets/d/<ID>/
 *   Already-a-CSV-export URL (passed through unchanged)
 */
function toCsvExportUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = rawUrl.trim();

  if (url.includes('/export?format=csv') || url.includes('output=csv')) {
    return url; // already a CSV export link
  }

  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const sheetId = idMatch[1];

  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/** Minimal CSV line parser (handles quoted fields with commas). */
function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map(line => {
      const cells = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
}

function toNumber(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(/[,₹$%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function matchDayIndex(label) {
  if (!label) return -1;
  const norm = label.toLowerCase().trim();
  let idx = DAY_NAMES.indexOf(norm);
  if (idx !== -1) return idx;
  idx = DAY_ABBREV.indexOf(norm.slice(0, 3));
  return idx;
}

/**
 * Parse CSV rows into a [Mon, Tue, Wed, Thu, Fri, Sat, Sun] array of numbers
 * (0 for any day not found). Tries Layout A, then B, then C.
 */
function extractWeeklyValues(rows) {
  if (!rows.length) throw new Error('Sheet appears to be empty');

  // ── Layout A: a header row containing day names, values in the next row ──
  for (let r = 0; r < Math.min(rows.length - 1, 5); r++) {
    const headerRow = rows[r];
    const dayHits = headerRow.map(matchDayIndex);
    const foundDays = dayHits.filter(d => d !== -1).length;
    if (foundDays >= 4) { // confident this is a day-name header row
      const valueRow = rows[r + 1];
      const result = [0, 0, 0, 0, 0, 0, 0];
      headerRow.forEach((cell, colIdx) => {
        const dayIdx = matchDayIndex(cell);
        if (dayIdx !== -1) {
          const num = toNumber(valueRow[colIdx]);
          if (num !== null) result[dayIdx] = num;
        }
      });
      return result;
    }
  }

  // ── Layout B: two columns, "Day" / "Value" pairs, one per row ──
  const dayValuePairs = [];
  for (const row of rows) {
    const dayIdx = matchDayIndex(row[0]);
    if (dayIdx !== -1) {
      const num = toNumber(row[1]);
      if (num !== null) dayValuePairs.push([dayIdx, num]);
    }
  }
  if (dayValuePairs.length >= 4) {
    const result = [0, 0, 0, 0, 0, 0, 0];
    dayValuePairs.forEach(([idx, num]) => { result[idx] = num; });
    return result;
  }

  // ── Layout C: fallback — first 7 numeric cells anywhere, in reading order ──
  const flatNumbers = [];
  for (const row of rows) {
    for (const cell of row) {
      const num = toNumber(cell);
      if (num !== null) flatNumbers.push(num);
      if (flatNumbers.length >= 7) break;
    }
    if (flatNumbers.length >= 7) break;
  }
  if (flatNumbers.length === 0) {
    throw new Error('Could not find any recognizable daily values in the sheet');
  }
  while (flatNumbers.length < 7) flatNumbers.push(0);
  return flatNumbers.slice(0, 7);
}

function getMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Fetch + parse a single user's sheet and persist the result.
 * Returns { success, dailyData, achieved } or throws with a descriptive message.
 */
async function syncUserSheet(userId, sheetLink) {
  await db.query("UPDATE users SET sync_status = 'syncing' WHERE id = ?", [userId]);

  try {
    const csvUrl = toCsvExportUrl(sheetLink);
    if (!csvUrl) {
      throw new Error('Invalid Google Sheets link format');
    }

    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Sheet is private. Share it as "Anyone with the link can view".');
      }
      throw new Error(`Could not fetch sheet (HTTP ${resp.status})`);
    }

    const text = await resp.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error('Sheet is private or link is wrong. Share it as "Anyone with the link can view".');
    }

    const rows = parseCsv(text);
    const dailyData = extractWeeklyValues(rows);

    // Persist into daily_performance for the current week (Mon..Sun)
    const monday = getMonday();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      await db.query(`
        INSERT INTO daily_performance (user_id, perf_date, value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [userId, dateStr, dailyData[i]]);
    }

    const achieved = dailyData.reduce((s, v) => s + v, 0);
    await db.query(`
      UPDATE users
      SET achieved = ?, last_synced_at = NOW(), sync_status = 'success', sync_error = NULL
      WHERE id = ?
    `, [achieved, userId]);

    return { success: true, dailyData, achieved };
  } catch (err) {
    await db.query(`
      UPDATE users SET sync_status = 'error', sync_error = ? WHERE id = ?
    `, [String(err.message).slice(0, 490), userId]);
    throw err;
  }
}

/** Sync every user that has a non-empty google_sheet_link. Errors per-user are isolated. */
async function syncAllUsers() {
  const [users] = await db.query(
    "SELECT id, google_sheet_link FROM users WHERE google_sheet_link IS NOT NULL AND google_sheet_link != ''"
  );

  const results = [];
  for (const u of users) {
    try {
      const r = await syncUserSheet(u.id, u.google_sheet_link);
      results.push({ userId: u.id, success: true, achieved: r.achieved, dailyData: r.dailyData });
    } catch (err) {
      results.push({ userId: u.id, success: false, error: err.message });
    }
  }
  return results;
}

module.exports = { syncUserSheet, syncAllUsers, toCsvExportUrl, extractWeeklyValues, parseCsv };
