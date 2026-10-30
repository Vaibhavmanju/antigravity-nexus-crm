const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { syncUserSheet, syncAllUsers } = require('../services/sheetSync');
const { syncProjectSheet, syncAllProjectSheets } = require('../services/projectSheetSync');
const { syncUserAllSheets, projectLinkOf } = require('../services/sheetSyncAll');
const { ensureSampleData } = require('../services/sampleData');
const { addDays, mondayOf, todayStr } = require('../utils/dates');

const router = express.Router();

// All user routes require admin
router.use(verifyToken, requireAdmin);

// ── PUT /api/users/sync-all ────────────────────────────────────
// Declared early, before any '/:id' routes, so Express doesn't match
// the literal segment "sync-all" as if it were an :id parameter.
router.put('/sync-all', async (req, res) => {
  try {
    const results = await syncAllProjectSheets();
    await db.query(`INSERT INTO activity_log (actor_type, actor_id, action, target_type, meta)
      VALUES ('admin', ?, 'sync_all_sheets', 'user', ?)`,
      [req.user.id, JSON.stringify({ count: results.length, succeeded: results.filter(r => r.success).length })]);
    res.json({ message: 'Sync complete', results });
  } catch (err) {
    console.error('Sync all error:', err);
    res.status(500).json({ error: 'Server error during bulk sync' });
  }
});

// ── GET /api/users ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.department, u.phone, u.status,
             u.join_date, u.google_sheet_link, u.rfq_sheet_link, u.client_sheet_link,
             u.project_sheet_link, u.weekly_target, u.achieved, u.notes,
             u.last_synced_at, u.sync_status, u.sync_error,
             u.manager_id, u.is_team_lead, u.current_streak, u.best_streak, u.email_reports_enabled,
             GROUP_CONCAT(
               JSON_OBJECT('day_index', dp.day_index, 'value', dp.value)
               ORDER BY dp.day_index
             ) AS daily_data_raw
      FROM users u
      LEFT JOIN (
        SELECT user_id,
               DATEDIFF(perf_date, (
                 SELECT DATE_SUB(perf_date, INTERVAL WEEKDAY(perf_date) DAY)
                 FROM daily_performance dp2 WHERE dp2.user_id = dp1.user_id LIMIT 1
               )) AS day_index,
               value,
               perf_date
        FROM daily_performance dp1
        WHERE perf_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      ) dp ON dp.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    // Also fetch daily_performance properly
    const [allDP] = await db.query(`
      SELECT user_id, perf_date, value,
             WEEKDAY(perf_date) AS day_idx
      FROM daily_performance
      WHERE perf_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        AND perf_date <= DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
    `);

    // Build dailyData map per user
    const dailyMap = {};
    allDP.forEach(row => {
      if (!dailyMap[row.user_id]) dailyMap[row.user_id] = [0,0,0,0,0,0,0];
      dailyMap[row.user_id][row.day_idx] = parseFloat(row.value) || 0;
    });

    // Fetch tasks for all users
    const [allTasks] = await db.query(`
      SELECT id, user_id, title, description, status, priority, due_date, created_at
      FROM tasks ORDER BY created_at DESC
    `);
    const taskMap = {};
    allTasks.forEach(t => {
      if (!taskMap[t.user_id]) taskMap[t.user_id] = [];
      taskMap[t.user_id].push(t);
    });

    const formatted = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      phone: u.phone || '',
      status: u.status,
      joinDate: u.join_date,
      googleSheetLink:   u.google_sheet_link   || '',
      rfqSheetLink:      u.rfq_sheet_link      || '',
      clientSheetLink:   u.client_sheet_link   || '',
      projectSheetLink:  u.project_sheet_link  || '',
      weeklyTarget: u.weekly_target || 500,
      achieved: u.achieved || 0,
      notes: u.notes || '',
      lastSyncedAt: u.last_synced_at,
      syncStatus: u.sync_status || 'idle',
      syncError: u.sync_error || null,
      managerId: u.manager_id || null,
      isTeamLead: !!u.is_team_lead,
      currentStreak: u.current_streak || 0,
      bestStreak: u.best_streak || 0,
      emailReportsEnabled: u.email_reports_enabled !== 0,
      dailyData: dailyMap[u.id] || [0,0,0,0,0,0,0],
      tasks: taskMap[u.id] || [],
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/users/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [[user]] = await db.query(`
      SELECT id, name, email, role, department, phone, status,
             join_date, google_sheet_link, rfq_sheet_link, client_sheet_link,
             project_sheet_link, weekly_target, achieved, notes,
             last_synced_at, sync_status, sync_error,
             manager_id, is_team_lead, current_streak, best_streak, email_reports_enabled
      FROM users WHERE id = ?
    `, [req.params.id]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const [dp] = await db.query(`
      SELECT perf_date, value, WEEKDAY(perf_date) AS day_idx
      FROM daily_performance
      WHERE user_id = ?
        AND perf_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
        AND perf_date <= DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
    `, [req.params.id]);

    const dailyData = [0,0,0,0,0,0,0];
    dp.forEach(r => { dailyData[r.day_idx] = parseFloat(r.value) || 0; });

    const [tasks] = await db.query(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [req.params.id]
    );

    res.json({
      id: user.id, name: user.name, email: user.email, role: user.role,
      department: user.department, phone: user.phone || '',
      status: user.status, joinDate: user.join_date,
      googleSheetLink:   user.google_sheet_link  || '',
      rfqSheetLink:      user.rfq_sheet_link     || '',
      clientSheetLink:   user.client_sheet_link  || '',
      projectSheetLink:  user.project_sheet_link || '',
      weeklyTarget: user.weekly_target || 500,
      achieved: user.achieved || 0, notes: user.notes || '',
      lastSyncedAt: user.last_synced_at,
      syncStatus: user.sync_status || 'idle',
      syncError: user.sync_error || null,
      managerId: user.manager_id || null,
      isTeamLead: !!user.is_team_lead,
      currentStreak: user.current_streak || 0,
      bestStreak: user.best_streak || 0,
      emailReportsEnabled: user.email_reports_enabled !== 0,
      dailyData, tasks,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/users ───────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, email, password, phone, role, department, status, joinDate, googleSheetLink, weeklyTarget, notes,
            managerId, isTeamLead } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already in use' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.query(`
      INSERT INTO users (name, email, password_hash, phone, role, department, status, join_date,
                         google_sheet_link, weekly_target, notes, manager_id, is_team_lead)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, email, hash, phone || '', role || 'Sales', department || 'Sales',
        status || 'Active', joinDate || todayStr(),
        googleSheetLink || '', weeklyTarget || 500, notes || '',
        managerId || null, isTeamLead ? 1 : 0]);

    // Log activity
    await db.query(`INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id)
      VALUES ('admin', ?, 'create_user', 'user', ?)`, [req.user.id, result.insertId]);

    // Give the new user's Sheet Analytics panels something to show right away
    // (placeholder rows, replaced automatically by real sheet data on sync).
    await ensureSampleData(result.insertId);

    res.status(201).json({ id: result.insertId, message: 'User created successfully' });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/users/:id ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, email, password, phone, role, department, status, joinDate,
            googleSheetLink, rfqSheetLink, clientSheetLink, projectSheetLink,
            weeklyTarget, achieved, notes, dailyData,
            managerId, isTeamLead, emailReportsEnabled } = req.body;
    const uid = req.params.id;

    // Remember the current sheet links so we can tell if one actually changed.
    const [[before]] = await db.query(
      'SELECT google_sheet_link, rfq_sheet_link, client_sheet_link, project_sheet_link FROM users WHERE id = ?', [uid]);

    // Build update fields
    const fields = [];
    const vals   = [];

    if (name)            { fields.push('name = ?');              vals.push(name); }
    if (email)           { fields.push('email = ?');             vals.push(email); }
    if (phone !== undefined)  { fields.push('phone = ?');        vals.push(phone); }
    if (role)            { fields.push('role = ?');              vals.push(role); }
    if (department)      { fields.push('department = ?');        vals.push(department); }
    if (status)          { fields.push('status = ?');            vals.push(status); }
    if (joinDate)        { fields.push('join_date = ?');         vals.push(joinDate); }
    if (googleSheetLink !== undefined)  { fields.push('google_sheet_link = ?');  vals.push(googleSheetLink); }
    if (rfqSheetLink !== undefined)     { fields.push('rfq_sheet_link = ?');     vals.push(rfqSheetLink); }
    if (clientSheetLink !== undefined)  { fields.push('client_sheet_link = ?');  vals.push(clientSheetLink); }
    if (projectSheetLink !== undefined) { fields.push('project_sheet_link = ?'); vals.push(projectSheetLink); }
    if (weeklyTarget !== undefined)     { fields.push('weekly_target = ?');      vals.push(weeklyTarget); }
    if (achieved !== undefined)        { fields.push('achieved = ?');          vals.push(achieved); }
    if (notes !== undefined)           { fields.push('notes = ?');             vals.push(notes); }
    if (managerId !== undefined)       { fields.push('manager_id = ?');        vals.push(managerId || null); }
    if (isTeamLead !== undefined)      { fields.push('is_team_lead = ?');      vals.push(isTeamLead ? 1 : 0); }
    if (emailReportsEnabled !== undefined) { fields.push('email_reports_enabled = ?'); vals.push(emailReportsEnabled ? 1 : 0); }
    if (password)        {
      const hash = await bcrypt.hash(password, 12);
      fields.push('password_hash = ?'); vals.push(hash);
    }

    if (fields.length > 0) {
      vals.push(uid);
      await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    }

    // Update daily performance if provided
    if (dailyData && Array.isArray(dailyData)) {
      const monday = mondayOf(todayStr());

      for (let i = 0; i < 7; i++) {
        const dateStr = addDays(monday, i);
        const val = parseFloat(dailyData[i]) || 0;

        await db.query(`
          INSERT INTO daily_performance (user_id, perf_date, value)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE value = VALUES(value)
        `, [uid, dateStr, val]);
      }
      // Recalculate achieved from daily sum
      const total = dailyData.reduce((s, v) => s + (parseFloat(v) || 0), 0);
      await db.query('UPDATE users SET achieved = ? WHERE id = ?', [total, uid]);
    }

    await db.query(`INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id)
      VALUES ('admin', ?, 'update_user', 'user', ?)`, [req.user.id, uid]);

    // A sheet link was added/changed → pull that data in now (in the
    // background) so Sheet Analytics is up to date without a manual sync.
    const changed = (incoming, old) => incoming !== undefined && String(incoming || '').trim() && String(incoming).trim() !== String(old || '').trim();
    const linkChanged = !!before && (
      changed(googleSheetLink,  before.google_sheet_link)  || changed(rfqSheetLink,     before.rfq_sheet_link) ||
      changed(clientSheetLink,  before.client_sheet_link)  || changed(projectSheetLink, before.project_sheet_link));
    if (linkChanged) {
      syncUserAllSheets(parseInt(uid, 10)).catch(err => console.error('Background sync after link update failed:', err.message));
    }

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/users/:id ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT name FROM users WHERE id = ?', [req.params.id]);
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await db.query(`INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id, meta)
      VALUES ('admin', ?, 'delete_user', 'user', ?, ?)`,
      [req.user.id, req.params.id, JSON.stringify({ name: user?.name || 'Unknown' })]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/users/:id/sync-sheet ─────────────────────────────
router.put('/:id/sync-sheet', async (req, res) => {
  try {
    const [[user]] = await db.query('SELECT google_sheet_link, project_sheet_link, name FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const link = projectLinkOf(user);
    if (!link) return res.status(400).json({ error: 'This user has no Google Sheet link configured' });

    const result = await syncProjectSheet(req.params.id, link);

    await db.query(`INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id, meta)
      VALUES ('admin', ?, 'sync_sheet', 'user', ?, ?)`,
      [req.user.id, req.params.id, JSON.stringify({ name: user.name, ...result })]);

    res.json({ message: 'Sheet synced successfully', ...result });
  } catch (err) {
    res.status(422).json({ error: err.message || 'Failed to sync sheet' });
  }
});

module.exports = router;
