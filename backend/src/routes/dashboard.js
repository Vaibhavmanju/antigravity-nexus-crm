const express = require('express');
const db      = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { getWeekBarData, getWeekPieData, getWeekDayBreakdown, getProjectCharts } = require('../services/projectSheetSync');
const { syncUserAllSheets, syncEveryone } = require('../services/sheetSyncAll');
const { addDays, mondayOf, todayStr, parseYmd, dbDateToStr } = require('../utils/dates');
const { syncRfqSheet,    getRfqCharts }    = require('../services/rfqSheetSync');
const { syncClientSheet, getClientCharts } = require('../services/clientSheetSync');

const router = express.Router();

// Every route needs a valid login. Admin-only routes add `requireAdmin`
// individually; the chart routes are shared with the User and Team Leader
// portals and are scoped so people only ever see data they may see.
router.use(verifyToken);

/**
 * Which user's data may this request read?
 *   admin     → any user (or null = everyone, aggregated)
 *   team lead → themselves or one of their direct reports
 *   user      → only themselves
 */
async function scopedUserId(req) {
  const requested = req.query.userId ? parseInt(req.query.userId, 10) : null;
  if (req.user.role === 'admin') return requested;
  if (req.user.role === 'teamlead' && requested && requested !== req.user.id) {
    const [[member]] = await db.query('SELECT id FROM users WHERE id = ? AND manager_id = ?', [requested, req.user.id]);
    if (member) return requested;
  }
  return req.user.id;
}

async function canAccessUser(req, targetId) {
  if (req.user.role === 'admin' || req.user.id === targetId) return true;
  if (req.user.role === 'teamlead') {
    const [[member]] = await db.query('SELECT id FROM users WHERE id = ? AND manager_id = ?', [targetId, req.user.id]);
    return !!member;
  }
  return false;
}

function validMonday(req) {
  return req.query.monday && /^\d{4}-\d{2}-\d{2}$/.test(req.query.monday) ? req.query.monday : null;
}

// ── GET /api/dashboard/summary ────────────────────────────────
// Combined KPI + chart data for AdminDashboard / DashboardHome / MasterSheet
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const [[counts]] = await db.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(status = 'Active') AS active_users,
        SUM(weekly_target) AS total_target,
        SUM(achieved) AS total_achieved
      FROM users
    `);

    const mondayStr = mondayOf(todayStr());
    const sundayStr = addDays(mondayStr, 6);

    // Combined daily totals across all users (Mon..Sun)
    const [dailyRows] = await db.query(`
      SELECT perf_date, SUM(value) AS total
      FROM daily_performance
      WHERE perf_date BETWEEN ? AND ?
      GROUP BY perf_date
    `, [mondayStr, sundayStr]);

    const dailyTotals = [0,0,0,0,0,0,0];
    dailyRows.forEach(r => {
      const idx = Math.round((parseYmd(dbDateToStr(r.perf_date)) - parseYmd(mondayStr)) / 86400000);
      if (idx >= 0 && idx <= 6) dailyTotals[idx] = parseFloat(r.total) || 0;
    });

    // Role / department / status distribution
    const [roleDist]   = await db.query(`SELECT role AS name, COUNT(*) AS value, SUM(achieved) AS achieved_sum FROM users GROUP BY role`);
    const [deptDist]   = await db.query(`SELECT department AS name, COUNT(*) AS value, SUM(achieved) AS achieved_sum FROM users GROUP BY department`);
    const [statusDist] = await db.query(`SELECT status AS name, COUNT(*) AS value FROM users GROUP BY status`);

    // Recent users
    const [recentUsers] = await db.query(`
      SELECT id, name, role, status, achieved, weekly_target
      FROM users ORDER BY created_at DESC LIMIT 5
    `);

    res.json({
      totalUsers: counts.total_users || 0,
      activeUsers: counts.active_users || 0,
      totalTarget: counts.total_target || 0,
      totalAchieved: counts.total_achieved || 0,
      dailyTotals,
      roleDistribution: roleDist,
      departmentDistribution: deptDist,
      statusDistribution: statusDist,
      recentUsers: recentUsers.map(u => ({
        id: u.id, name: u.name, role: u.role, status: u.status,
        achieved: u.achieved, weeklyTarget: u.weekly_target
      })),
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/settings/master-sheet ────────────────────────────
router.get('/master-sheet', requireAdmin, async (req, res) => {
  try {
    const [[row]] = await db.query("SELECT `value` FROM settings WHERE `key` = 'master_sheet_link'");
    res.json({ masterSheetLink: row?.value || '' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/settings/master-sheet ────────────────────────────
router.put('/master-sheet', requireAdmin, async (req, res) => {
  try {
    const { link } = req.body;
    await db.query(`
      INSERT INTO settings (\`key\`, \`value\`) VALUES ('master_sheet_link', ?)
      ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)
    `, [link || '']);
    res.json({ message: 'Master sheet link updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dashboard/activity ───────────────────────────────
router.get('/activity', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dashboard/activity/export ──────────────────────────
// Audit-log export as CSV, optionally bounded by ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Retention note: activity_log rows older than 1 year can be purged with
//   DELETE FROM activity_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)
// run this on a schedule (cron) if you need to cap table growth.
router.get('/activity/export', requireAdmin, async (req, res) => {
  try {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null;
    const to   = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to   || '') ? req.query.to   : null;
    const clauses = [];
    const params = [];
    if (from) { clauses.push('created_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to)   { clauses.push('created_at <= ?'); params.push(`${to} 23:59:59`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const [rows] = await db.query(
      `SELECT id, actor_type, actor_id, action, target_type, target_id, meta, created_at
       FROM activity_log ${where} ORDER BY created_at DESC LIMIT 5000`,
      params
    );

    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['id', 'actor_type', 'actor_id', 'action', 'target_type', 'target_id', 'meta', 'created_at'];
    const csv = '\uFEFF' + [header.join(','), ...rows.map(r => header.map(h => esc(r[h])).join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-export.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to export audit log' });
  }
});

// ── GET /api/dashboard/week-chart ─────────────────────────────
// ?userId=X      — scope to one user (non-admins are auto-scoped, see scopedUserId)
// ?monday=YYYY-MM-DD — a date inside the desired week (defaults to current week)
router.get('/week-chart', async (req, res) => {
  try {
    res.json(await getWeekBarData(await scopedUserId(req), validMonday(req)));
  } catch (err) {
    console.error('week-chart error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dashboard/week-pie ───────────────────────────────
// ?category=market|methodology|project_status|invoice_status
router.get('/week-pie', async (req, res) => {
  try {
    const category = req.query.category || 'market';
    res.json(await getWeekPieData(await scopedUserId(req), category, validMonday(req)));
  } catch (err) {
    console.error('week-pie error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dashboard/week-day-breakdown ─────────────────────
// Per-day, all-column breakdown used by the admin dashboard's pie tooltip.
router.get('/week-day-breakdown', async (req, res) => {
  try {
    res.json(await getWeekDayBreakdown(await scopedUserId(req), validMonday(req)));
  } catch (err) {
    console.error('week-day-breakdown error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/dashboard/rfq-charts | client-charts | project-charts ──
// Sheet Analytics panels. Each is always drawn for one concrete week
// (the picked week, or the nearest week with data) and never comes back empty.
router.get('/rfq-charts', async (req, res) => {
  try {
    res.json(await getRfqCharts(await scopedUserId(req), validMonday(req)));
  } catch (err) {
    console.error('rfq-charts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/client-charts', async (req, res) => {
  try {
    res.json(await getClientCharts(await scopedUserId(req), validMonday(req)));
  } catch (err) {
    console.error('client-charts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/project-charts', async (req, res) => {
  try {
    res.json(await getProjectCharts(await scopedUserId(req), validMonday(req)));
  } catch (err) {
    console.error('project-charts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/dashboard/sync-user/:userId ─────────────────────
// Pull the latest RFQ + Client + Project sheets for one user in a single
// call. Sheet Analytics calls this whenever a user/panel is opened so the
// charts always show fresh sheet data.
router.put('/sync-user/:userId', async (req, res) => {
  try {
    const uid = parseInt(req.params.userId, 10);
    if (!(await canAccessUser(req, uid))) return res.status(403).json({ error: 'Not authorised for this user' });
    const results = await syncUserAllSheets(uid);
    res.json({ message: 'Sheets synced', results });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ── PUT /api/dashboard/sync-rfq/:userId ──────────────────────
// Admin manually syncs one user's RFQ sheet
router.put('/sync-rfq/:userId', requireAdmin, async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT rfq_sheet_link, name FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.rfq_sheet_link) return res.status(400).json({ error: 'No RFQ sheet link set for this user' });
    const result = await syncRfqSheet(parseInt(req.params.userId), user.rfq_sheet_link);
    res.json({ message: 'RFQ sheet synced', ...result });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ── PUT /api/dashboard/sync-client/:userId ────────────────────
router.put('/sync-client/:userId', requireAdmin, async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT client_sheet_link, name FROM users WHERE id = ?', [req.params.userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.client_sheet_link) return res.status(400).json({ error: 'No Client sheet link set for this user' });
    const result = await syncClientSheet(parseInt(req.params.userId), user.client_sheet_link);
    res.json({ message: 'Client sheet synced', ...result });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ── PUT /api/dashboard/sync-all-sheets ───────────────────────
// Sync all 3 sheet types for all users in one call
router.put('/sync-all-sheets', requireAdmin, async (req, res) => {
  try {
    const results = await syncEveryone();
    res.json({ message: 'All sheets synced', results });
  } catch (err) {
    console.error('sync-all-sheets error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
