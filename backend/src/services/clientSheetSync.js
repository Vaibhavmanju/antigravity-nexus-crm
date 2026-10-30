/**
 * clientSheetSync.js  — Page 2: Client Database
 *
 * Headers: Date, Company Name, Name, Email, Designatior (sic),
 * Address, Phone, number, Intro mail sent from(Anusha),
 * Follow up email 1, Comments
 *
 * Bar chart AND pie/KPI charts are all scoped to the selected week
 * (same behaviour as the Project MIS tab). If the selected week has
 * zero rows, everything falls back to all-time totals so the panel
 * doesn't render as blank.
 */

const crypto = require('crypto');
const db     = require('../config/db');
const { toCsvUrl, parseCsv, parseDate } = require('./projectSheetSync');
const { mirrorSheet } = require('./sheetMirror');
const { resolveWeek, sampleStats, syncInfo } = require('./weekScope');
const { addDays, mondayOf, todayStr, dayLabel, dbDateToStr } = require('../utils/dates');

const HEADER_MAP = {
  entry_date:   ['date','entry date','contact date','added date','date added','date of contact'],
  company_name: ['company name','company','organisation','organization','firm','company/institution'],
  name:         ['name','contact name','person name','full name'],
  email:        ['email','email id','e-mail','email address','mail id'],
  designation:  ['designation','designatior','designator','title','position','job title','role'],
  address:      ['address','location','city','place'],
  phone:        ['phone','phone number','mobile','contact number','tel','mobile number'],
  phone2:       ['number','phone2','alt phone','alternate phone','secondary phone'],
  intro_mail:   [
    'intro mail sent from(anusha)','intro mail sent from (anusha)',
    'intro mail sent from','intro mail sent','intro mail','introduction mail',
    'intro email','intro email sent','mail sent',
  ],
  follow_up:    [
    'follow up email 1','follow up email 1 ',
    'follow up email','follow up 1','follow up','followup','follow-up',
    'follow up mail','follow-up email',
  ],
  comment:      ['comments','comment','notes','remarks','note'],
};

function normalise(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function mapHeaders(headerRow) {
  const result = {};
  headerRow.forEach((cell, idx) => {
    const norm = normalise(cell);
    if (!norm) return;
    for (const [canon, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.includes(norm)) { result[idx] = canon; break; }
    }
  });
  return result;
}

function rowHash(cells) {
  return crypto.createHash('sha256').update(cells.join('|')).digest('hex');
}

// ── Sync ──────────────────────────────────────────────────────
async function syncClientSheet(userId, sheetLink) {
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
    if (text.trim().startsWith('<!') || text.trim().startsWith('<html'))
      throw new Error('Sheet is private or the link is wrong. Share it as "Anyone with the link can view".');

    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('Sheet appears to be empty');

    // Find header row
    let headerRowIdx = -1;
    let colMap = {};
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const candidate = mapHeaders(rows[r]);
      if (Object.keys(candidate).length >= 3) { headerRowIdx = r; colMap = candidate; break; }
    }
    if (headerRowIdx === -1)
      throw new Error('Could not find recognisable Client DB headers. Expected: Date, Company Name, Name, Email, Designation, Phone, etc.');

    const getByCanon = (row, canon) => {
      const entry = Object.entries(colMap).find(([, v]) => v === canon);
      const idx = entry ? parseInt(entry[0]) : -1;
      return idx >= 0 ? (row[idx] || '').trim() : '';
    };

    let inserted = 0, updated = 0, skipped = 0, datesParsed = 0;
    const seenHashes = [];

    for (const row of rows.slice(headerRowIdx + 1)) {
      if (row.every(c => !c.trim())) { skipped++; continue; }

      const phone1 = getByCanon(row, 'phone');
      const phone2 = getByCanon(row, 'phone2');
      const phone  = [phone1, phone2].filter(Boolean).join(' / ') || null;

      const rawDate   = getByCanon(row, 'entry_date');
      const entryDate = parseDate(rawDate);
      if (entryDate) datesParsed++;

      const hash = rowHash(row);
      seenHashes.push(hash);

      const [result] = await db.query(`
        INSERT INTO client_entries
          (user_id, entry_date, company_name, name, email, designation,
           address, phone, intro_mail_sent, follow_up_email, comment, row_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          entry_date       = VALUES(entry_date),
          company_name     = VALUES(company_name),
          name             = VALUES(name),
          email            = VALUES(email),
          designation      = VALUES(designation),
          address          = VALUES(address),
          phone            = VALUES(phone),
          intro_mail_sent  = VALUES(intro_mail_sent),
          follow_up_email  = VALUES(follow_up_email),
          comment          = VALUES(comment),
          synced_at        = NOW()
      `, [
        userId,
        entryDate,
        getByCanon(row, 'company_name') || null,
        getByCanon(row, 'name')         || null,
        getByCanon(row, 'email')        || null,
        getByCanon(row, 'designation')  || null,
        getByCanon(row, 'address')      || null,
        phone,
        getByCanon(row, 'intro_mail')   || null,
        getByCanon(row, 'follow_up')    || null,
        getByCanon(row, 'comment')      || null,
        hash,
      ]);

      if (result.affectedRows === 1) inserted++;
      else updated++;
    }

    await mirrorSheet('client_entries', userId, seenHashes);

    // Count this-week entries
    const monStr = mondayOf(todayStr());
    const sunStr = addDays(monStr, 6);

    const [[wk]]  = await db.query('SELECT COUNT(*) as cnt FROM client_entries WHERE user_id=? AND entry_date BETWEEN ? AND ?', [userId, monStr, sunStr]);
    const [[tot]] = await db.query('SELECT COUNT(*) as cnt, COUNT(entry_date) as with_date FROM client_entries WHERE user_id=?', [userId]);

    await db.query("UPDATE users SET sync_status='success', last_synced_at=NOW(), sync_error=NULL WHERE id=?", [userId]);

    return {
      inserted, updated, skipped, total: rows.slice(headerRowIdx + 1).length,
      datesParsed, entriesThisWeek: wk.cnt, totalInDB: tot.cnt, entriesWithDate: tot.with_date,
      currentWeek: `${monStr} to ${sunStr}`,
    };

  } catch (err) {
    await db.query("UPDATE users SET sync_status='error', sync_error=? WHERE id=?", [String(err.message).slice(0, 490), userId]);
    try { require('./notificationService').notifySyncFailure(userId, err.message); } catch {}
    throw err;
  }
}

// ── Analytics ─────────────────────────────────────────────────
// Everything on the panel is drawn for ONE week: the picked week if it has
// rows, otherwise the nearest week that does (see weekScope.js).
async function getClientCharts(userId = null, mondayDate = null) {
  const { ensureSampleDataFor } = require('./sampleData');
  await ensureSampleDataFor(userId);

  const scope = await resolveWeek({ table: 'client_entries', userId, mondayDate });
  const { dateExpr, monday, sunday, userClause, userParam } = scope;
  const weekWhere  = `WHERE ${dateExpr} BETWEEN ? AND ? ${userClause}`;
  const weekParams = [monday, sunday, ...userParam];

  const [dayRows] = await db.query(
    `SELECT ${dateExpr} AS d, COUNT(*) AS cnt FROM client_entries ${weekWhere} GROUP BY d`, weekParams
  );
  const countMap = {};
  dayRows.forEach(r => { countMap[dbDateToStr(r.d)] = Number(r.cnt); });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, label: dayLabel(date, i), count: countMap[date] || 0 };
  });
  const weekTotal = days.reduce((s, d) => s + d.count, 0);

  const [[k]] = await db.query(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN TRIM(IFNULL(follow_up_email,'')) != '' THEN 1 ELSE 0 END) AS followed_up,
      SUM(CASE WHEN TRIM(IFNULL(intro_mail_sent,'')) != '' THEN 1 ELSE 0 END) AS intro_sent
    FROM client_entries ${weekWhere}`, weekParams);

  const total      = Number(k.total) || 0;
  const followedUp = Number(k.followed_up) || 0;
  const introSent  = Number(k.intro_sent) || 0;

  const pie = async (col) => {
    const [rows] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(${col}),''),'Unspecified') AS name, COUNT(*) AS value
      FROM client_entries ${weekWhere} GROUP BY name ORDER BY value DESC LIMIT 10`, weekParams);
    return rows.map(r => ({ name: r.name, value: Number(r.value) }));
  };
  const [byDesignation, byCompany] = await Promise.all([pie('designation'), pie('company_name')]);

  const [[tot]] = await db.query(
    `SELECT COUNT(*) AS n FROM client_entries ${userId ? 'WHERE user_id = ?' : ''}`, userId ? [userId] : []);

  return {
    weekLabel: scope.label,
    weekTotal, days,
    mondayStr: monday,
    fellBack: scope.fellBack,
    requestedWeekLabel: scope.requestedLabel,
    requestedMonday: scope.requestedMonday,
    totalInDB: Number(tot.n) || 0,
    isAllTime: false, // legacy field
    sample: await sampleStats('client_entries', userId),
    sync: await syncInfo(userId, ['client_sheet_link']),
    byDesignation,
    byCompany,
    followUpPie: [
      { name: 'Follow-up Sent',    value: followedUp },
      { name: 'Pending Follow-up', value: Math.max(0, total - followedUp) },
    ],
    introMailPie: [
      { name: 'Intro Mail Sent',    value: introSent },
      { name: 'Intro Mail Pending', value: Math.max(0, total - introSent) },
    ],
    kpi: { total, followedUp, introSent, pending: Math.max(0, total - followedUp) },
  };
}

module.exports = { syncClientSheet, getClientCharts, mapHeaders };
