/**
 * rfqSheetSync.js  — Page 1: RFQ Tracker
 *
 * Headers: SL No, Subject, Date, Client Contact Name, Client Name,
 * Designation, Email id, Industry, RFQ Sent by, methodology,
 * Target Audience, Market, Sample Size, LOI, IR, CPI(USD),
 * Any Additional costs(USD), Total Costs(USD), Quota sent by,
 * Follow up, Comment
 *
 * Bar chart AND pie/KPI charts are all scoped to the selected week
 * (same behaviour as the Project MIS tab). If the selected week has
 * zero rows, everything falls back to all-time totals so the panel
 * doesn't render as blank.
 */

const crypto = require('crypto');
const db     = require('../config/db');
const { toCsvUrl, parseCsv, parseDate, toFloat } = require('./projectSheetSync');
const { mirrorSheet } = require('./sheetMirror');
const { resolveWeek, sampleStats, syncInfo } = require('./weekScope');
const { addDays, mondayOf, todayStr, weekLabel, dayLabel, dbDateToStr } = require('../utils/dates');

const HEADER_MAP = {
  sl_no:           ['sl no','sl. no','sl.no','sno','s.no','serial no','serial number','#','sr no','sr. no'],
  subject:         ['subject','rfq subject','project subject','topic','enquiry subject'],
  entry_date:      ['date','start date','rfq date','entry date','received date','date received','enquiry date'],
  client_contact:  ['client  contact name','client contact name','client contact','contact name','contact person','client contact pm'],
  client_name:     ['client name','client','company','company name','customer','account name'],
  designation:     ['designation','title','position','job title'],
  email:           ['email id','email','e-mail','email address','mail id'],
  industry:        ['industry','sector','vertical','business sector'],
  rfq_sent_by:     ['rfq sent by','sent by','rfq by','submitted by','raised by'],
  methodology:     ['methodology','method','survey type','mode','research method'],
  target_audience: ['target audience ','target audience','audience','respondents','target','respondent profile'],
  market:          ['market','geography','region','country','location'],
  sample_size:     ['sample size','sample','n','requested n','sample n','no. of respondents'],
  loi:             ['loi','length of interview','interview length','length'],
  ir:              ['ir','incidence rate','incidence'],
  cpi_usd:         ['cpi(usd)','cpi (usd)','cpi','cost per interview','cost per complete','cost/ir'],
  additional_cost: ['any additional costs(usd)','any additional costs (usd)','additional costs(usd)','additional costs (usd)','additional cost','add. cost','extra cost'],
  total_cost:      ['total costs(usd)','total costs (usd)','total cost','total costs','total','total (usd)'],
  quota_sent_by:   ['quota sent by','quota by','quota','quotation sent by'],
  follow_up:       ['follow up','followup','follow-up','follow up email','followup status'],
  comment:         ['comment','comments','notes','remarks','remark'],
};

function normalise(s) { return String(s || '').toLowerCase().trim().replace(/\s+/g, ' '); }

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
async function syncRfqSheet(userId, sheetLink) {
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

    let headerRowIdx = -1;
    let colMap = {};
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const candidate = mapHeaders(rows[r]);
      if (Object.keys(candidate).length >= 3) { headerRowIdx = r; colMap = candidate; break; }
    }
    if (headerRowIdx === -1)
      throw new Error('Could not find recognisable RFQ headers. Expected: SL No, Subject, Date, Client Name, Industry, etc.');

    const get = (row, canon) => {
      const entry = Object.entries(colMap).find(([, v]) => v === canon);
      const idx = entry ? parseInt(entry[0]) : -1;
      return idx >= 0 ? (row[idx] || '').trim() : '';
    };

    let inserted = 0, updated = 0, skipped = 0, datesParsed = 0;
    const seenHashes = [];

    for (const row of rows.slice(headerRowIdx + 1)) {
      if (row.every(c => !c.trim())) { skipped++; continue; }

      const rawDate  = get(row, 'entry_date');
      const entryDate = parseDate(rawDate);
      if (entryDate) datesParsed++;

      const hash = rowHash(row);
      seenHashes.push(hash);

      const [result] = await db.query(`
        INSERT INTO rfq_entries
          (user_id, sl_no, subject, entry_date, client_contact, client_name,
           designation, email, industry, rfq_sent_by, methodology, target_audience,
           market, sample_size, loi, ir, cpi_usd, additional_cost, total_cost,
           quota_sent_by, follow_up, comment, row_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          sl_no=VALUES(sl_no), subject=VALUES(subject), entry_date=VALUES(entry_date),
          client_contact=VALUES(client_contact), client_name=VALUES(client_name),
          designation=VALUES(designation), email=VALUES(email), industry=VALUES(industry),
          rfq_sent_by=VALUES(rfq_sent_by), methodology=VALUES(methodology),
          target_audience=VALUES(target_audience), market=VALUES(market),
          sample_size=VALUES(sample_size), loi=VALUES(loi), ir=VALUES(ir),
          cpi_usd=VALUES(cpi_usd), additional_cost=VALUES(additional_cost),
          total_cost=VALUES(total_cost), quota_sent_by=VALUES(quota_sent_by),
          follow_up=VALUES(follow_up), comment=VALUES(comment), synced_at=NOW()
      `, [
        userId,
        get(row,'sl_no')||null, get(row,'subject')||null, entryDate,
        get(row,'client_contact')||null, get(row,'client_name')||null,
        get(row,'designation')||null, get(row,'email')||null,
        get(row,'industry')||null, get(row,'rfq_sent_by')||null,
        get(row,'methodology')||null, get(row,'target_audience')||null,
        get(row,'market')||null,
        toFloat(get(row,'sample_size'), { allowGrouping: false }), toFloat(get(row,'loi'), { allowGrouping: false }),
        toFloat(get(row,'ir'), { allowGrouping: false }), toFloat(get(row,'cpi_usd'), { allowGrouping: false }),
        toFloat(get(row,'additional_cost')), toFloat(get(row,'total_cost')),
        get(row,'quota_sent_by')||null, get(row,'follow_up')||null,
        get(row,'comment')||null, hash,
      ]);

      if (result.affectedRows === 1) inserted++;
      else updated++;
    }

    await mirrorSheet('rfq_entries', userId, seenHashes);

    const monStr = mondayOf(todayStr());
    const sunStr = addDays(monStr, 6);

    const [[wk]]  = await db.query('SELECT COUNT(*) as cnt FROM rfq_entries WHERE user_id=? AND entry_date BETWEEN ? AND ?', [userId, monStr, sunStr]);
    const [[tot]] = await db.query('SELECT COUNT(*) as cnt, COUNT(entry_date) as with_date FROM rfq_entries WHERE user_id=?', [userId]);

    await db.query("UPDATE users SET sync_status='success', last_synced_at=NOW(), sync_error=NULL WHERE id=?", [userId]);

    return {
      inserted, updated, skipped, total: rows.slice(headerRowIdx + 1).length,
      datesParsed, entriesThisWeek: wk.cnt, totalInDB: tot.cnt, entriesWithDate: tot.with_date,
      currentWeek: `${monStr} to ${sunStr}`,
    };

  } catch (err) {
    await db.query("UPDATE users SET sync_status='error', sync_error=? WHERE id=?", [String(err.message).slice(0,490), userId]);
    try { require('./notificationService').notifySyncFailure(userId, err.message); } catch {}
    throw err;
  }
}

// ── Analytics ─────────────────────────────────────────────────
// Everything on the panel (bar/day chart, pies and KPIs) is drawn for ONE
// week: the picked week if it has rows, otherwise the nearest week that
// does (see weekScope.js) — so the panel is never blank.
async function getRfqCharts(userId = null, mondayDate = null) {
  const { ensureSampleDataFor } = require('./sampleData');
  await ensureSampleDataFor(userId);

  const scope = await resolveWeek({ table: 'rfq_entries', userId, mondayDate });
  const { dateExpr, monday, sunday, userClause, userParam } = scope;
  const weekWhere  = `WHERE ${dateExpr} BETWEEN ? AND ? ${userClause}`;
  const weekParams = [monday, sunday, ...userParam];

  // Day-by-day counts for the effective week
  const [dayRows] = await db.query(
    `SELECT ${dateExpr} AS d, COUNT(*) AS cnt FROM rfq_entries ${weekWhere} GROUP BY d`, weekParams
  );
  const countMap = {};
  dayRows.forEach(r => { countMap[dbDateToStr(r.d)] = Number(r.cnt); });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { date, label: dayLabel(date, i), count: countMap[date] || 0 };
  });
  const weekTotal = days.reduce((s, d) => s + d.count, 0);

  // KPIs — IR may be typed as 45 (percent) or 0.45 (fraction); normalise both.
  const [[k]] = await db.query(`
    SELECT COUNT(*) AS total,
           AVG(cpi_usd) AS avg_cpi,
           AVG(loi)     AS avg_loi,
           AVG(CASE WHEN ir IS NULL THEN NULL WHEN ir <= 1 THEN ir * 100 ELSE ir END) AS avg_ir,
           SUM(COALESCE(total_cost, cpi_usd * sample_size + COALESCE(additional_cost, 0))) AS total_cost
    FROM rfq_entries ${weekWhere}`, weekParams);

  const pie = async (col) => {
    const [rows] = await db.query(`
      SELECT COALESCE(NULLIF(TRIM(${col}),''),'Unspecified') AS name, COUNT(*) AS value
      FROM rfq_entries ${weekWhere} GROUP BY name ORDER BY value DESC LIMIT 10`, weekParams);
    return rows.map(r => ({ name: r.name, value: Number(r.value) }));
  };
  const [byIndustry, byMethodology, byMarket] = await Promise.all([pie('industry'), pie('methodology'), pie('market')]);

  const [[tot]] = await db.query(
    `SELECT COUNT(*) AS n FROM rfq_entries ${userId ? 'WHERE user_id = ?' : ''}`, userId ? [userId] : []);

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    weekLabel: scope.label,
    weekTotal, days,
    mondayStr: monday,
    fellBack: scope.fellBack,
    requestedWeekLabel: scope.requestedLabel,
    requestedMonday: scope.requestedMonday,
    totalInDB: Number(tot.n) || 0,
    isAllTime: false, // legacy field — the panel now always draws one concrete week
    sample: await sampleStats('rfq_entries', userId),
    sync: await syncInfo(userId, ['rfq_sheet_link']),
    byIndustry, byMethodology, byMarket,
    kpi: {
      total:     Number(k.total) || 0,
      avgCpi:    num(k.avg_cpi)    ? '$' + num(k.avg_cpi).toFixed(2)          : 'N/A',
      avgLoi:    num(k.avg_loi)    ? num(k.avg_loi).toFixed(1) + ' min'       : 'N/A',
      avgIr:     num(k.avg_ir)     ? num(k.avg_ir).toFixed(1) + '%'           : 'N/A',
      totalCost: num(k.total_cost) ? '$' + Math.round(num(k.total_cost)).toLocaleString('en-US') : 'N/A',
    },
  };
}

module.exports = { syncRfqSheet, getRfqCharts, mapHeaders };
