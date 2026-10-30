/**
 * projectSheetSync.js
 *
 * Parses the project-tracking Google Sheet (Project code, Project Name,
 * Start date, End date, Client Name, Client Contact PM, Market, Target Audience,
 * Methodology, Requested N, Achieved N, LOI, IR, CPI, Any additional cost,
 * Total, Project status, Invoice Status, Comment, Project Expenses,
 * Project Gross, Amount, Gross Margin, Project Manager Name)
 *
 * and stores every row into the `project_entries` MySQL table.
 *
 * A SHA-256-like row hash (built from all cell values) is used as the
 * unique key so re-syncing is idempotent — duplicate rows are updated,
 * not duplicated.
 *
 * The sheet must be shared as "Anyone with the link can view".
 */

const crypto = require('crypto');
const db     = require('../config/db');
const { mirrorSheet } = require('./sheetMirror');
const { resolveWeek, sampleStats, syncInfo } = require('./weekScope');
const { addDays, mondayOf, todayStr, weekLabel, dayLabel, dbDateToStr, fmtYmd } = require('../utils/dates');

// ── Header aliases: all variations we accept for each canonical column ──────
const HEADER_MAP = {
  project_code:      ['project code', 'proj code', 'code', 'proj. code'],
  project_name:      ['project name', 'proj name', 'project', 'name'],
  start_date:        ['start date', 'startdate', 'start', 'date started', 'project start date'],
  end_date:          ['end date', 'enddate', 'end', 'date ended', 'project end date'],
  client_name:       ['client name', 'client', 'customer', 'customer name'],
  client_contact_pm: ['client contact pm', 'client contact', 'contact pm', 'contact', 'client pm'],
  market:            ['market', 'markets', 'region', 'geography'],
  target_audience:   ['target audience', 'audience', 'target', 'respondents'],
  methodology:       ['methodology', 'method', 'survey type', 'mode'],
  requested_n:       ['requested n', 'req n', 'requested', 'n requested', 'sample requested', 'n req'],
  achieved_n:        ['achieved n', 'ach n', 'achieved', 'n achieved', 'completes', 'n ach'],
  loi:               ['loi', 'length of interview', 'interview length', 'length'],
  ir:                ['ir', 'incidence rate', 'incidence', 'inc rate'],
  cpi:               ['cpi', 'cost per interview', 'cost per complete', 'cost/complete'],
  additional_cost:   ['any additional cost', 'additional cost', 'add. cost', 'extra cost', 'addl cost'],
  total:             ['total', 'total cost', 'project total', 'grand total'],
  project_status:    ['project status', 'status', 'proj status'],
  invoice_status:    ['invoice status', 'invoice', 'inv status', 'billing status'],
  comment:           ['comment', 'comments', 'notes', 'remarks', 'remark'],
  project_expenses:  ['project expenses', 'expenses', 'exp', 'project exp'],
  project_gross:     ['project gross', 'gross', 'proj gross', 'gross revenue'],
  amount:            ['amount', 'amt', 'revenue', 'invoice amount'],
  gross_margin:      ['gross margin', 'margin', 'gm', 'gross margin %', 'margin %'],
  project_manager:   ['project manager name', 'project manager', 'pm name', 'pm', 'manager', 'project manager name'],
};

function normalise(str) {
  return String(str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function mapHeaders(headerRow) {
  // Returns { colIndex: canonicalKey } for each recognised header
  const result = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalise(cell);
    for (const [canon, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(norm)) {
        result[idx] = canon;
        break;
      }
    }
  });
  return result;
}

/**
 * RFC-4180 CSV parser: handles quoted cells containing commas, doubled
 * quotes ("") and line breaks inside a cell (common in "Comment" columns),
 * which a naive split-by-newline parser would tear into bogus rows.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  // Google Sheets exports sometimes pepper "empty" template cells with
  // zero-width characters (U+200B..200D) instead of leaving them truly
  // empty, which defeats the `row.every(c => !c.trim())` blank-row check
  // (JS trim() does not strip these). Strip them everywhere, plus a stray
  // BOM anywhere in the file (not just the first byte).
  const src = String(text).replace(/[\u200B-\u200D\uFEFF]/g, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur.trim()); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur.trim()); rows.push(row);
      row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row); }

  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

/** Convert Google Sheets share URL → CSV export URL */
function toCsvUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (url.includes('/export?format=csv') || url.includes('output=csv')) return url;
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gidMatch ? gidMatch[1] : '0'}`;
}

/** Parse a date string in ANY common format → YYYY-MM-DD or null */
function parseDate(raw) {
  if (!raw) return null;
  // Strip ordinal suffixes ("13th June 2019" -> "13 June 2019") so the
  // Mon/day-name matchers below can recognise them — common in sheets
  // where dates were typed by hand rather than picked from a calendar.
  let s = String(raw).replace(/\u00A0/g, ' ').trim().replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
  if (!s || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'na' || s === '0') return null;

  // 1. Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    return isNaN(d) ? null : s;
  }

  // 2. Excel serial number (integer between 1 and 100000)
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 1 && serial < 100000) {
      // Excel epoch: Dec 30 1899
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d)) return d.toISOString().split('T')[0];
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy1) {
    const [, d, m, y] = dmy1;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
    if (!isNaN(dt)) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // 4. MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
    if (!isNaN(dt)) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // 5. DD/MM/YY or DD-MM-YY (2-digit year)
  const dmy2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmy2) {
    const [, d, m, yy] = dmy2;
    const y = parseInt(yy) >= 50 ? `19${yy}` : `20${yy}`;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
    if (!isNaN(dt)) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // 6. DD-Mon-YYYY or DD-Mon-YY  e.g. 15-Jun-2026, 15-Jun-26
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const dmonY = s.match(/^(\d{1,2})[\-\/\s]([A-Za-z]{3,9})[\-\/\s](\d{2,4})$/);
  if (dmonY) {
    const [, d, mon, yr] = dmonY;
    const mNum = MONTHS[mon.toLowerCase().slice(0, 3)];
    if (mNum) {
      const y = yr.length === 2 ? (parseInt(yr) >= 50 ? `19${yr}` : `20${yr}`) : yr;
      const mm = String(mNum).padStart(2, '0');
      const dd = d.padStart(2, '0');
      const dt = new Date(`${y}-${mm}-${dd}T00:00:00`);
      if (!isNaN(dt)) return `${y}-${mm}-${dd}`;
    }
  }

  // 7. Mon-DD-YYYY or Mon DD, YYYY  e.g. Jun-15-2026, June 15, 2026
  const monDY = s.match(/^([A-Za-z]{3,9})[\-\/\s](\d{1,2})[,\s]*(\d{4})$/);
  if (monDY) {
    const [, mon, d, y] = monDY;
    const mNum = MONTHS[mon.toLowerCase().slice(0, 3)];
    if (mNum) {
      const mm = String(mNum).padStart(2, '0');
      const dd = d.padStart(2, '0');
      const dt = new Date(`${y}-${mm}-${dd}T00:00:00`);
      if (!isNaN(dt)) return `${y}-${mm}-${dd}`;
    }
  }

  // 8. YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const dt = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
    if (!isNaN(dt)) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // 9. Last resort: JS Date parser (handles "June 15 2026", "2026 Jun 15" etc.)
  // Avoid ambiguous formats like "01/02/03"
  if (!/^\d+$/.test(s) && s.length > 5) {
    const dt = new Date(s);
    if (!isNaN(dt.getTime()) && dt.getFullYear() > 2000 && dt.getFullYear() < 2100) {
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${dt.getFullYear()}-${mm}-${dd}`;
    }
  }

  return null;
}

/**
 * Parse a messy numeric cell → float, or null.
 *
 * Real sheets mix genuine thousands-grouped numbers ("2,35,560.00", Indian
 * lakh style) with values where a comma/slash/dash actually separates two
 * DIFFERENT numbers typed into one cell ("70,90", "400-550", "240/40",
 * "25-50%") — a common shorthand for "either of these". Comma-stripping
 * blindly would turn "70,90" into 7090. Instead:
 *   - allowGrouping=true (money/count fields: totals, amounts, sample
 *     sizes): a value that already looks like ONE cleanly grouped number
 *     is parsed as such; anything else falls through to "first number".
 *   - allowGrouping=false (rate-like fields: LOI/IR/CPI, always well under
 *     1000 in practice): commas are always treated as a list separator —
 *     the first value typed is used.
 */
function toFloat(raw, { allowGrouping = true } = {}) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).replace(/\u00A0/g, ' ').trim();
  // Sheets sometimes prefixes a number with ' or ` to force it to stay text.
  // Only strip a currency symbol and any whitespace immediately after it
  // ("$ 45" → "45") — NOT all internal whitespace, or multi-token junk like
  // "8 10 2001" would merge into one bogus number (8102001).
  s = s.replace(/^['`]+/, '').replace(/[₹$]\s*/g, '').replace(/[()]/g, '').trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s)) return null;

  if (allowGrouping) {
    const noPercent = s.replace(/%/g, '');
    if (/^-?\d{1,3}(,\d{2,3})*(\.\d+)?$/.test(noPercent)) {
      const n = parseFloat(noPercent.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
  }

  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function rowHash(cells) {
  return crypto.createHash('sha256').update(cells.join('|')).digest('hex');
}

/**
 * Fetch + parse the project sheet for one user and upsert all rows into
 * `project_entries`. Returns { inserted, updated, skipped, total }.
 */
async function syncProjectSheet(userId, sheetLink) {
  // Mark user as syncing
  await db.query("UPDATE users SET sync_status='syncing' WHERE id=?", [userId]);

  try {
    const csvUrl = toCsvUrl(sheetLink);
    if (!csvUrl) throw new Error('Invalid Google Sheets link format');

    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403)
        throw new Error('Sheet is private. Share it as "Anyone with the link can view".');
      throw new Error(`Could not fetch sheet (HTTP ${resp.status})`);
    }

    const text = await resp.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html'))
      throw new Error('Sheet is private or link is wrong. Share it as "Anyone with the link can view".');

    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('Sheet has no data rows (need at least a header row + one data row)');

    // Find the header row — it's the first row that contains at least 3 recognisable column headers
    let headerRowIdx = -1;
    let colMap = {};
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const candidate = mapHeaders(rows[r]);
      if (Object.keys(candidate).length >= 3) {
        headerRowIdx = r;
        colMap = candidate;
        break;
      }
    }
    if (headerRowIdx === -1) throw new Error('Could not find recognisable column headers in the first 5 rows');
    if (!Object.values(colMap).includes('start_date'))
      throw new Error('Sheet must have a "Start date" column so entries can be assigned to a day');

    const dataRows = rows.slice(headerRowIdx + 1);
    let inserted = 0, updated = 0, skipped = 0;
    const seenHashes = [];

    for (const row of dataRows) {
      // Skip completely empty rows
      if (row.every(c => !c.trim())) { skipped++; continue; }

      const get = (canon) => {
        const idx = Object.entries(colMap).find(([, v]) => v === canon)?.[0];
        return idx !== undefined ? (row[idx] || '').trim() : '';
      };

      const startDate = parseDate(get('start_date'));
      // Rows without a valid start date can't be charted — store them anyway but note missing date
      const hash = rowHash(row);
      seenHashes.push(hash);

      const vals = [
        userId,
        get('project_code')   || null,
        get('project_name')   || null,
        startDate,
        parseDate(get('end_date')),
        get('client_name')       || null,
        get('client_contact_pm') || null,
        get('market')            || null,
        get('target_audience')   || null,
        get('methodology')       || null,
        toFloat(get('requested_n'), { allowGrouping: false }),
        toFloat(get('achieved_n'), { allowGrouping: false }),
        toFloat(get('loi'), { allowGrouping: false }),
        toFloat(get('ir'), { allowGrouping: false }),
        toFloat(get('cpi'), { allowGrouping: false }),
        toFloat(get('additional_cost')),
        toFloat(get('total')),
        get('project_status')   || null,
        get('invoice_status')   || null,
        get('comment')          || null,
        toFloat(get('project_expenses')),
        toFloat(get('project_gross')),
        toFloat(get('amount')),
        toFloat(get('gross_margin')),
        get('project_manager')  || null,
        hash,
      ];

      const [result] = await db.query(`
        INSERT INTO project_entries
          (user_id, project_code, project_name, start_date, end_date,
           client_name, client_contact_pm, market, target_audience,
           methodology, requested_n, achieved_n, loi, ir, cpi,
           additional_cost, total, project_status, invoice_status,
           comment, project_expenses, project_gross, amount,
           gross_margin, project_manager, row_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          project_code=VALUES(project_code), project_name=VALUES(project_name),
          start_date=VALUES(start_date), end_date=VALUES(end_date),
          client_name=VALUES(client_name), client_contact_pm=VALUES(client_contact_pm),
          market=VALUES(market), target_audience=VALUES(target_audience),
          methodology=VALUES(methodology), requested_n=VALUES(requested_n),
          achieved_n=VALUES(achieved_n), loi=VALUES(loi), ir=VALUES(ir),
          cpi=VALUES(cpi), additional_cost=VALUES(additional_cost),
          total=VALUES(total), project_status=VALUES(project_status),
          invoice_status=VALUES(invoice_status), comment=VALUES(comment),
          project_expenses=VALUES(project_expenses), project_gross=VALUES(project_gross),
          amount=VALUES(amount), gross_margin=VALUES(gross_margin),
          project_manager=VALUES(project_manager),
          synced_at=NOW()
      `, vals);

      // affectedRows: 1=inserted, 2=updated, 0=unchanged (MySQL quirk)
      if (result.affectedRows === 1)     inserted++;
      else if (result.affectedRows >= 2) updated++;
      else                               updated++; // unchanged row, still counts as processed
    }

    // Make the DB an exact mirror of the sheet (drops removed/edited rows and
    // replaces placeholder sample rows with the real data).
    await mirrorSheet('project_entries', userId, seenHashes);

    // Update user sync status
    await db.query(`
      UPDATE users SET sync_status='success', last_synced_at=NOW(), sync_error=NULL WHERE id=?
    `, [userId]);

    // Count how many entries fall in the current week (for immediate feedback)
    const mondayStr = mondayOf(todayStr());
    const sundayStr = addDays(mondayStr, 6);

    const [[weekCount]] = await db.query(
      'SELECT COUNT(*) as cnt FROM project_entries WHERE user_id = ? AND start_date BETWEEN ? AND ?',
      [userId, mondayStr, sundayStr]
    );

    const [[totalCount]] = await db.query(
      'SELECT COUNT(*) as cnt, COUNT(start_date) as with_date FROM project_entries WHERE user_id = ?',
      [userId]
    );

    // ── Per-day counts for the current week (Mon..Sun), so "Achieved"
    // and the Performance-tab bar chart are driven by the sheet, not by
    // whatever was last typed in manually.
    const [dayRows] = await db.query(
      'SELECT start_date, COUNT(*) AS cnt FROM project_entries WHERE user_id = ? AND start_date BETWEEN ? AND ? GROUP BY start_date',
      [userId, mondayStr, sundayStr]
    );
    const dayCountMap = {};
    dayRows.forEach(r => { dayCountMap[dbDateToStr(r.start_date)] = Number(r.cnt); });
    const dailyData = [];
    for (let i = 0; i < 7; i++) dailyData.push(dayCountMap[addDays(mondayStr, i)] || 0);
    const achieved = Number(weekCount.cnt) || 0;

    // Persist the auto-synced total so every screen that reads users.achieved
    // directly (e.g. the admin dashboard table) shows the real, current number
    // without needing its own copy of the sheet-sync logic.
    await db.query('UPDATE users SET achieved = ? WHERE id = ?', [achieved, userId]);

    return {
      inserted,
      updated,
      skipped,
      total: dataRows.length,
      entriesThisWeek: weekCount.cnt,
      totalInDB: totalCount.cnt,
      entriesWithDate: totalCount.with_date,
      currentWeek: `${mondayStr} to ${sundayStr}`,
      achieved,
      dailyData,
    };

  } catch (err) {
    await db.query(
      "UPDATE users SET sync_status='error', sync_error=? WHERE id=?",
      [String(err.message).slice(0, 490), userId]
    );
    try {
      require('./notificationService').notifySyncFailure(userId, err.message);
    } catch { /* never let a notification failure break sync */ }
    throw err;
  }
}

/** Sync every user that has a google_sheet_link. Per-user errors are isolated. */
async function syncAllProjectSheets() {
  const [users] = await db.query(
    `SELECT id, COALESCE(NULLIF(TRIM(project_sheet_link), ''), NULLIF(TRIM(google_sheet_link), '')) AS link
     FROM users
     WHERE NULLIF(TRIM(project_sheet_link), '') IS NOT NULL OR NULLIF(TRIM(google_sheet_link), '') IS NOT NULL`
  );
  const results = [];
  for (const u of users) {
    try {
      const r = await syncProjectSheet(u.id, u.link);
      results.push({ userId: u.id, success: true, ...r });
    } catch (err) {
      results.push({ userId: u.id, success: false, error: err.message });
    }
  }
  return results;
}

// Sample rows (row_hash 'demo-…') are placeholders for the admin's Sheet
// Analytics page only — the user portal and dashboard widgets below must
// never present them as real project entries.
const REAL_ONLY = "AND row_hash NOT LIKE 'demo-%'";

function resolveMonday(mondayDate) {
  return mondayOf(mondayDate || todayStr());
}

/**
 * Get bar chart data for any week.
 * @param {number|null} userId - null = all users
 * @param {string|null} mondayDate - ISO date string 'YYYY-MM-DD' inside the
 *                                   desired week. Defaults to current week.
 */
async function getWeekBarData(userId = null, mondayDate = null) {
  const monday = resolveMonday(mondayDate);
  const sunday = addDays(monday, 6);

  const params = [monday, sunday];
  let whereUser = '';
  if (userId) { whereUser = ' AND user_id = ?'; params.push(userId); }

  const [rows] = await db.query(`
    SELECT start_date, COUNT(*) AS cnt
    FROM project_entries
    WHERE start_date BETWEEN ? AND ?${whereUser} ${REAL_ONLY}
    GROUP BY start_date
  `, params);

  const countMap = {};
  rows.forEach(r => { countMap[dbDateToStr(r.start_date)] = Number(r.cnt); });

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    days.push({ date, label: dayLabel(date, i), count: countMap[date] || 0 });
  }

  const weekTotal = days.reduce((s, d) => s + d.count, 0);
  return { weekLabel: weekLabel(monday), days, weekTotal, mondayStr: monday, sundayStr: sunday };
}

/**
 * Get pie chart breakdown for any week.
 */
async function getWeekPieData(userId = null, category = 'market', mondayDate = null) {
  const monday = resolveMonday(mondayDate);
  const sunday = addDays(monday, 6);

  const allowed = ['market','methodology','project_status','invoice_status','target_audience','project_manager'];
  const col = allowed.includes(category) ? category : 'market';

  const params = [monday, sunday];
  let whereUser = '';
  if (userId) { whereUser = ' AND user_id = ?'; params.push(userId); }

  const [rows] = await db.query(`
    SELECT COALESCE(NULLIF(TRIM(${col}),''), 'Unspecified') AS name,
           COUNT(*) AS value
    FROM project_entries
    WHERE start_date BETWEEN ? AND ?${whereUser} ${REAL_ONLY}
    GROUP BY name
    ORDER BY value DESC
    LIMIT 10
  `, params);

  return rows.map(r => ({ name: String(r.name), value: Number(r.value) }));
}

/**
 * Per-day, all-column breakdown for the given week. Powers the admin
 * dashboard's "Project Entries" pie chart hover tooltip.
 */
async function getWeekDayBreakdown(userId = null, mondayDate = null) {
  const monday = resolveMonday(mondayDate);
  const sunday = addDays(monday, 6);

  const params = [monday, sunday];
  let whereUser = '';
  if (userId) { whereUser = ' AND user_id = ?'; params.push(userId); }

  const COLUMNS = ['market', 'methodology', 'project_status', 'invoice_status'];
  const [rows] = await db.query(`
    SELECT start_date, market, methodology, project_status, invoice_status
    FROM project_entries
    WHERE start_date BETWEEN ? AND ?${whereUser} ${REAL_ONLY}
  `, params);

  const byDate = {};
  rows.forEach(r => {
    const key = dbDateToStr(r.start_date);
    if (!byDate[key]) {
      byDate[key] = { count: 0, columns: { market: {}, methodology: {}, project_status: {}, invoice_status: {} } };
    }
    byDate[key].count += 1;
    COLUMNS.forEach(col => {
      const val = (r[col] && String(r[col]).trim()) || 'Unspecified';
      byDate[key].columns[col][val] = (byDate[key].columns[col][val] || 0) + 1;
    });
  });

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(monday, i);
    const entry = byDate[date];
    const columns = {};
    COLUMNS.forEach(col => {
      const dist = entry ? entry.columns[col] : {};
      columns[col] = Object.entries(dist)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 4);
    });
    days.push({ date, label: dayLabel(date, i), count: entry ? entry.count : 0, columns });
  }

  return { days, mondayStr: monday, sundayStr: sunday };
}

/**
 * Everything the admin's Sheet Analytics → Project Tracker panel draws, for
 * ONE week (the picked week, or the nearest week that has rows — see
 * weekScope.js): per-day counts, KPIs and all four category pies.
 */
async function getProjectCharts(userId = null, mondayDate = null) {
  const { ensureSampleDataFor } = require('./sampleData');
  await ensureSampleDataFor(userId);

  const scope = await resolveWeek({ table: 'project_entries', userId, mondayDate });
  const { dateExpr, monday, sunday, userClause, userParam } = scope;
  const weekWhere  = `WHERE ${dateExpr} BETWEEN ? AND ? ${userClause}`;
  const weekParams = [monday, sunday, ...userParam];

  const [dayRows] = await db.query(
    `SELECT ${dateExpr} AS d, COUNT(*) AS cnt FROM project_entries ${weekWhere} GROUP BY d`, weekParams
  );
  const countMap = {};
  dayRows.forEach(r => { countMap[dbDateToStr(r.d)] = Number(r.cnt); });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, label: dayLabel(date, i), count: countMap[date] || 0 };
  });
  const weekTotal = days.reduce((s, d) => s + d.count, 0);

  // Gross margin may be typed as 32 (percent) or 0.32 (fraction).
  const [[k]] = await db.query(`
    SELECT COUNT(*) AS projects,
           SUM(achieved_n) AS achieved_n,
           SUM(requested_n) AS requested_n,
           AVG(cpi) AS avg_cpi,
           AVG(CASE WHEN gross_margin IS NULL THEN NULL WHEN ABS(gross_margin) <= 1 THEN gross_margin * 100 ELSE gross_margin END) AS avg_gm,
           SUM(COALESCE(amount, total)) AS amount
    FROM project_entries ${weekWhere}`, weekParams);

  const pie = async (col) => {
    const [rows] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(${col}),''),'Unspecified') AS name, COUNT(*) AS value
      FROM project_entries ${weekWhere} GROUP BY name ORDER BY value DESC LIMIT 10`, weekParams);
    return rows.map(r => ({ name: String(r.name), value: Number(r.value) }));
  };
  const [market, methodology, project_status, invoice_status] = await Promise.all([
    pie('market'), pie('methodology'), pie('project_status'), pie('invoice_status'),
  ]);

  const [[tot]] = await db.query(
    `SELECT COUNT(*) AS n FROM project_entries ${userId ? 'WHERE user_id = ?' : ''}`, userId ? [userId] : []);

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    weekLabel: scope.label,
    weekTotal, days,
    mondayStr: monday,
    fellBack: scope.fellBack,
    requestedWeekLabel: scope.requestedLabel,
    requestedMonday: scope.requestedMonday,
    totalInDB: Number(tot.n) || 0,
    sample: await sampleStats('project_entries', userId),
    sync: await syncInfo(userId, ['project_sheet_link', 'google_sheet_link']),
    pies: { market, methodology, project_status, invoice_status },
    kpi: {
      projects:   Number(k.projects) || 0,
      achievedN:  num(k.achieved_n) !== null ? Math.round(num(k.achieved_n)).toLocaleString('en-US') : 'N/A',
      avgCpi:     num(k.avg_cpi) ? '$' + num(k.avg_cpi).toFixed(2) : 'N/A',
      avgMargin:  num(k.avg_gm) !== null ? num(k.avg_gm).toFixed(1) + '%' : 'N/A',
      amount:     num(k.amount) ? '$' + Math.round(num(k.amount)).toLocaleString('en-US') : 'N/A',
    },
  };
}

module.exports = {
  syncProjectSheet, syncAllProjectSheets,
  getWeekBarData, getWeekPieData, getWeekDayBreakdown, getProjectCharts,
  toCsvUrl, parseCsv, mapHeaders, parseDate, toFloat,
};
