const express = require('express');
const db      = require('../config/db');
const { verifyToken, requireUser } = require('../middleware/auth');
const { syncProjectSheet } = require('../services/projectSheetSync');

const router = express.Router();
router.use(verifyToken, requireUser);

// When a team lead is working inside a member's portal (token carries
// `viewAsBy`), leave an audit trail for every change they make.
router.use(async (req, res, next) => {
  if (req.user?.viewAsBy && req.method !== 'GET') {
    try {
      await db.query(
        `INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id, meta)
         VALUES ('user', ?, 'teamlead_edit_user_portal', 'user', ?, ?)`,
        [req.user.viewAsBy, req.user.id, JSON.stringify({ method: req.method, path: req.originalUrl.split('?')[0] })]
      );
    } catch { /* auditing must never block the request */ }
  }
  next();
});

function getMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday;
}

// ── GET /api/me/profile ───────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    if (req.user.role !== 'user') return res.status(403).json({ error: 'User accounts only' });

    const [[user]] = await db.query(`
      SELECT id, name, email, role, department, phone, status, join_date,
             google_sheet_link, weekly_target, achieved, notes,
             manager_id, is_team_lead, current_streak, best_streak, email_reports_enabled
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const monday = getMonday();
    const mondayStr = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];

    const [dp] = await db.query(`
      SELECT perf_date, value FROM daily_performance
      WHERE user_id = ? AND perf_date BETWEEN ? AND ?
    `, [req.user.id, mondayStr, sundayStr]);

    const dailyData = [0,0,0,0,0,0,0];
    dp.forEach(r => {
      const idx = Math.round((new Date(r.perf_date) - monday) / 86400000);
      if (idx >= 0 && idx <= 6) dailyData[idx] = parseFloat(r.value) || 0;
    });

    const [tasks] = await db.query(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]
    );

    res.json({
      id: user.id, name: user.name, email: user.email, role: user.role,
      department: user.department, phone: user.phone || '',
      status: user.status, joinDate: user.join_date,
      googleSheetLink: user.google_sheet_link || '',
      weeklyTarget: user.weekly_target || 500,
      achieved: user.achieved || 0, notes: user.notes || '',
      dailyData, tasks,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/me/profile ───────────────────────────────────────
router.put('/profile', async (req, res) => {
  try {
    const { name, phone, notes, googleSheetLink, emailReportsEnabled } = req.body;
    const fields = [];
    const vals = [];

    if (name !== undefined)            { fields.push('name = ?');              vals.push(name); }
    if (phone !== undefined)           { fields.push('phone = ?');             vals.push(phone); }
    if (notes !== undefined)           { fields.push('notes = ?');             vals.push(notes); }
    if (googleSheetLink !== undefined) { fields.push('google_sheet_link = ?'); vals.push(googleSheetLink); }
    if (emailReportsEnabled !== undefined) { fields.push('email_reports_enabled = ?'); vals.push(emailReportsEnabled ? 1 : 0); }

    if (fields.length > 0) {
      vals.push(req.user.id);
      await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, vals);
    }

    res.json({ message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/me/performance ─────────────────────────────────────
// ?monday=YYYY-MM-DD — defaults to the current week. Lets the
// Performance tab pre-fill the manual-entry form for whichever week
// is selected in the WeekPicker, not just the current week.
router.get('/performance', async (req, res) => {
  try {
    let monday = getMonday();
    if (req.query.monday && /^\d{4}-\d{2}-\d{2}$/.test(req.query.monday)) {
      monday = new Date(req.query.monday + 'T00:00:00');
    }
    const mondayStr = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const sundayStr = sunday.toISOString().split('T')[0];

    const [dp] = await db.query(`
      SELECT perf_date, value FROM daily_performance
      WHERE user_id = ? AND perf_date BETWEEN ? AND ?
    `, [req.user.id, mondayStr, sundayStr]);

    const dailyData = [0, 0, 0, 0, 0, 0, 0];
    dp.forEach(r => {
      const idx = Math.round((new Date(r.perf_date) - monday) / 86400000);
      if (idx >= 0 && idx <= 6) dailyData[idx] = parseFloat(r.value) || 0;
    });

    res.json({ dailyData, mondayStr, sundayStr });
  } catch (err) {
    console.error('Get performance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/me/performance ───────────────────────────────────
// Body: { dailyData: [number x7] }  -- Mon..Sun of the target week
// ?monday=YYYY-MM-DD selects which week to write into (defaults to
// the current week). This is the manual/self-reported performance
// entry — always available to every employee, sheet-linked or not.
router.put('/performance', async (req, res) => {
  try {
    const { dailyData } = req.body;
    if (!Array.isArray(dailyData) || dailyData.length !== 7) {
      return res.status(400).json({ error: 'dailyData must be an array of 7 numbers' });
    }

    let monday = getMonday();
    if (req.query.monday && /^\d{4}-\d{2}-\d{2}$/.test(req.query.monday)) {
      monday = new Date(req.query.monday + 'T00:00:00');
    }

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const val = parseFloat(dailyData[i]) || 0;

      await db.query(`
        INSERT INTO daily_performance (user_id, perf_date, value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
      `, [req.user.id, dateStr, val]);
    }

    // `users.achieved` mirrors the most recently saved week's total —
    // used as the headline KPI when no fresher scorecard total is loaded.
    const total = dailyData.reduce((s, v) => s + (parseFloat(v) || 0), 0);
    await db.query('UPDATE users SET achieved = ? WHERE id = ?', [total, req.user.id]);

    res.json({ message: 'Performance updated', achieved: total });
  } catch (err) {
    console.error('Update performance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Task routes (self-service) ──────────────────────────────────
router.get('/tasks', async (req, res) => {
  try {
    const [tasks] = await db.query(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]
    );
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tasks', async (req, res) => {
  try {
    const { title, description, priority, dueDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const [result] = await db.query(`
      INSERT INTO tasks (user_id, title, description, priority, due_date)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, title, description || '', priority || 'Medium', dueDate || null]);

    res.status(201).json({ id: result.insertId, message: 'Task created' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;
    const fields = []; const vals = [];

    if (title !== undefined)       { fields.push('title = ?');       vals.push(title); }
    if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
    if (status !== undefined)      { fields.push('status = ?');      vals.push(status); }
    if (priority !== undefined)    { fields.push('priority = ?');    vals.push(priority); }
    if (dueDate !== undefined)     { fields.push('due_date = ?');    vals.push(dueDate); }

    if (fields.length > 0) {
      vals.push(req.params.id, req.user.id);
      await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    }
    res.json({ message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/me/sync-sheet ────────────────────────────────────
// Self-service: logged-in user syncs their own Google Sheet.
// Called automatically when Overview loads (if sheet link exists),
// and on manual "Sync Now" click. No admin token needed.
router.put('/sync-sheet', async (req, res) => {
  try {
    const uid = req.user.id;
    const [[user]] = await db.query(
      'SELECT google_sheet_link, name FROM users WHERE id = ?', [uid]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.google_sheet_link) {
      return res.status(400).json({
        error: 'No Google Sheet linked to your account. Ask your admin to add your sheet link.',
      });
    }

    const result = await syncProjectSheet(uid, user.google_sheet_link);

    // Log the self-sync in activity_log
    await db.query(
      `INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id, meta)
       VALUES ('user', ?, 'self_sync_sheet', 'user', ?, ?)`,
      [uid, uid, JSON.stringify({ name: user.name, ...result })]
    );

    // Give meaningful feedback based on what was actually found
    let message = 'Sheet synced successfully';
    if (result.total === 0) {
      message = 'Sheet appears empty — no data rows found';
    } else if (result.entriesWithDate === 0) {
      message = `Synced ${result.total} rows but could not parse any Start dates. Check your date format (use DD/MM/YYYY or DD-Mon-YYYY).`;
    } else if (result.entriesThisWeek === 0) {
      message = `Synced ${result.total} rows but none fall in the current week (${result.currentWeek}). Try selecting a past week to see historical data.`;
    }

    res.json({ message, ...result });
  } catch (err) {
    // Return 422 so the frontend can display the specific error message
    res.status(422).json({ error: err.message || 'Failed to sync sheet' });
  }
});

// ── GET /api/me/sync-status ───────────────────────────────────
// Returns last sync timestamp and status so the UI can decide
// whether to trigger a fresh sync or use cached data.
router.get('/sync-status', async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT last_synced_at, sync_status, sync_error, google_sheet_link FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({
      lastSyncedAt:   row.last_synced_at,
      syncStatus:     row.sync_status || 'idle',
      syncError:      row.sync_error  || null,
      hasSheetLink:   !!(row.google_sheet_link),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/me/sync-debug ────────────────────────────────────
// Returns raw CSV data, parsed headers, and date parsing results
// so you can see exactly what the backend sees from your sheet.
// Remove this endpoint after debugging is complete.
router.get('/sync-debug', async (req, res) => {
  try {
    const uid = req.user.id;
    const [[user]] = await db.query(
      'SELECT google_sheet_link FROM users WHERE id = ?', [uid]
    );
    if (!user?.google_sheet_link) {
      return res.json({ error: 'No sheet link on your account' });
    }

    const { toCsvUrl, parseCsv, mapHeaders, parseDate } = require('../services/projectSheetSync');

    const csvUrl = toCsvUrl(user.google_sheet_link);
    let rawText = '';
    let fetchError = null;
    try {
      const resp = await fetch(csvUrl, { redirect: 'follow' });
      rawText = await resp.text();
      if (rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html')) {
        return res.json({ error: 'Sheet is private — share as "Anyone with the link can view"', csvUrl });
      }
    } catch (e) {
      fetchError = e.message;
    }

    const rows = parseCsv(rawText);
    const first5Rows = rows.slice(0, 5).map(r => r.join(' | '));

    // Find header row
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

    // Sample first 5 data rows with date parsing
    const sampleRows = [];
    if (headerRowIdx !== -1) {
      const startDateColIdx = Object.entries(colMap).find(([, v]) => v === 'start_date')?.[0];
      rows.slice(headerRowIdx + 1, headerRowIdx + 6).forEach((row, i) => {
        const rawDate = startDateColIdx !== undefined ? row[startDateColIdx] : 'N/A (no start_date col)';
        const parsedDate = rawDate ? parseDate(rawDate) : null;
        sampleRows.push({
          rowNum: headerRowIdx + 2 + i,
          rawStartDate: rawDate,
          parsedStartDate: parsedDate,
          parseSuccess: !!parsedDate,
          allCells: row.slice(0, 6).join(' | '),
        });
      });
    }

    // What week are we currently in?
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // How many project_entries exist for this user in DB?
    const [[countRow]] = await db.query(
      'SELECT COUNT(*) as total, COUNT(start_date) as with_date, COUNT(CASE WHEN start_date BETWEEN ? AND ? THEN 1 END) as this_week FROM project_entries WHERE user_id = ?',
      [monday.toISOString().split('T')[0], sunday.toISOString().split('T')[0], uid]
    );

    // Sample of what's actually in the DB
    const [dbSample] = await db.query(
      'SELECT project_code, project_name, start_date, row_hash FROM project_entries WHERE user_id = ? ORDER BY synced_at DESC LIMIT 5',
      [uid]
    );

    res.json({
      csvUrl,
      fetchError,
      totalRows: rows.length,
      first5Rows,
      headerRowIdx,
      recognisedColumns: colMap,
      hasStartDateColumn: Object.values(colMap).includes('start_date'),
      sampleRows,
      currentWeek: {
        monday: monday.toISOString().split('T')[0],
        sunday: sunday.toISOString().split('T')[0],
      },
      dbStats: {
        totalEntries: countRow.total,
        entriesWithDate: countRow.with_date,
        entriesThisWeek: countRow.this_week,
      },
      dbSample,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
