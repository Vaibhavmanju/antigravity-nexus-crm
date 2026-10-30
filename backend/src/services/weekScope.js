/**
 * weekScope.js
 *
 * Decides WHICH week a Sheet Analytics panel should actually draw.
 *
 *   1. The week the admin picked, if it has rows.
 *   2. Otherwise the nearest week that does have rows (latest one before
 *      the picked week, or the first one after it if nothing earlier
 *      exists) — so the charts are never blank just because the admin
 *      happens to be looking at a week with no entries.
 *
 * Rows whose sheet "Date" cell could not be parsed are counted on the day
 * they were synced (see EFFECTIVE_DATE_SQL), so they still appear.
 */

const db = require('../config/db');
const { addDays, mondayOf, todayStr, weekLabel } = require('../utils/dates');

// SQL expression: the date a row is charted on.
const EFFECTIVE_DATE = {
  rfq_entries:     'COALESCE(entry_date, DATE(synced_at))',
  client_entries:  'COALESCE(entry_date, DATE(synced_at))',
  project_entries: 'COALESCE(start_date, DATE(synced_at))',
};

async function resolveWeek({ table, userId = null, mondayDate = null }) {
  const dateExpr = EFFECTIVE_DATE[table];
  if (!dateExpr) throw new Error(`Unknown table ${table}`);

  const requestedMonday = mondayOf(mondayDate || todayStr());
  const requestedSunday = addDays(requestedMonday, 6);
  const userClause = userId ? 'AND user_id = ?' : '';
  const userParam = userId ? [userId] : [];

  const [[inWeek]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${dateExpr} BETWEEN ? AND ? ${userClause}`,
    [requestedMonday, requestedSunday, ...userParam]
  );

  let monday = requestedMonday;
  let fellBack = false;

  if (Number(inWeek.cnt) === 0) {
    const [[prev]] = await db.query(
      `SELECT MAX(${dateExpr}) AS d FROM ${table} WHERE ${dateExpr} < ? ${userClause}`,
      [requestedMonday, ...userParam]
    );
    let anchor = prev?.d || null;
    if (!anchor) {
      const [[next]] = await db.query(
        `SELECT MIN(${dateExpr}) AS d FROM ${table} WHERE ${dateExpr} > ? ${userClause}`,
        [requestedSunday, ...userParam]
      );
      anchor = next?.d || null;
    }
    if (anchor) {
      const a = anchor instanceof Date ? anchor.toISOString().slice(0, 10) : String(anchor).slice(0, 10);
      monday = mondayOf(a);
      fellBack = true;
    }
  }

  return {
    dateExpr,
    monday,
    sunday: addDays(monday, 6),
    fellBack,
    requestedMonday,
    requestedLabel: weekLabel(requestedMonday),
    label: weekLabel(monday),
    userClause,
    userParam,
  };
}

/** How much of this user's (or everyone's) data is placeholder sample data? */
async function sampleStats(table, userId = null) {
  const [[r]] = await db.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(row_hash LIKE 'demo-%'), 0) AS demo
     FROM ${table} ${userId ? 'WHERE user_id = ?' : ''}`,
    userId ? [userId] : []
  );
  const n = Number(r.n) || 0;
  const demo = Number(r.demo) || 0;
  return { total: n, sampleRows: demo, has: demo > 0, only: n > 0 && demo === n };
}

/** Link + last-sync info for the "why is this sample data?" hint. */
async function syncInfo(userId, linkColumns) {
  if (!userId) return null;
  const cols = linkColumns.join(', ');
  const [[u]] = await db.query(
    `SELECT ${cols}, last_synced_at, sync_status, sync_error FROM users WHERE id = ?`, [userId]
  );
  if (!u) return null;
  const link = linkColumns.map(c => u[c]).find(v => v && String(v).trim());
  return {
    hasLink: !!link,
    lastSyncedAt: u.last_synced_at,
    syncStatus: u.sync_status,
    syncError: u.sync_error || null,
  };
}

module.exports = { resolveWeek, sampleStats, syncInfo, EFFECTIVE_DATE };
