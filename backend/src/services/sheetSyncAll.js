/**
 * sheetSyncAll.js — sync every linked sheet (RFQ, Client, Project) for one
 * user, isolating failures per sheet so one bad link never blocks the rest.
 */

const db = require('../config/db');
const { syncRfqSheet }     = require('./rfqSheetSync');
const { syncClientSheet }  = require('./clientSheetSync');
const { syncProjectSheet } = require('./projectSheetSync');

const clean = (v) => (v && String(v).trim()) || '';

/** Project tracker link: the dedicated Page-3 link, else the legacy "Google Sheet" link. */
function projectLinkOf(u) {
  return clean(u.project_sheet_link) || clean(u.google_sheet_link);
}

async function syncUserAllSheets(userId) {
  const [[u]] = await db.query(
    'SELECT id, rfq_sheet_link, client_sheet_link, project_sheet_link, google_sheet_link FROM users WHERE id = ?',
    [userId]
  );
  if (!u) throw new Error('User not found');

  const jobs = [
    { sheet: 'rfq',     link: clean(u.rfq_sheet_link),    run: syncRfqSheet },
    { sheet: 'client',  link: clean(u.client_sheet_link), run: syncClientSheet },
    { sheet: 'project', link: projectLinkOf(u),           run: syncProjectSheet },
  ];

  const results = [];
  for (const job of jobs) {
    if (!job.link) { results.push({ sheet: job.sheet, linked: false, success: false, skipped: true }); continue; }
    try {
      const r = await job.run(userId, job.link);
      results.push({ sheet: job.sheet, linked: true, success: true, ...r });
    } catch (err) {
      results.push({ sheet: job.sheet, linked: true, success: false, error: err.message });
    }
  }
  return results;
}

/** Sync every user that has at least one link. Used by the background job and the admin "sync all". */
async function syncEveryone() {
  const [users] = await db.query(`
    SELECT id FROM users
    WHERE NULLIF(TRIM(rfq_sheet_link), '') IS NOT NULL
       OR NULLIF(TRIM(client_sheet_link), '') IS NOT NULL
       OR NULLIF(TRIM(project_sheet_link), '') IS NOT NULL
       OR NULLIF(TRIM(google_sheet_link), '') IS NOT NULL
  `);
  const all = [];
  for (const { id } of users) {
    const results = await syncUserAllSheets(id);
    results.forEach(r => all.push({ userId: id, ...r }));
  }
  return all;
}

module.exports = { syncUserAllSheets, syncEveryone, projectLinkOf };
