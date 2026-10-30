const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../config/db');
const { signToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/admin/login ────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [[admin]] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: admin.id, email: admin.email, name: admin.name, role: 'admin' });

    res.json({
      token,
      user: { id: admin.id, email: admin.email, name: admin.name, role: 'admin' }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/user/login ─────────────────────────────────
router.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'Inactive') {
      return res.status(403).json({ error: 'Your account is inactive. Contact your admin.' });
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: 'user' });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        phone: user.phone,
        status: user.status,
        joinDate: user.join_date,
        googleSheetLink: user.google_sheet_link || '',
        weeklyTarget: user.weekly_target,
        achieved: user.achieved,
        notes: user.notes || '',
      }
    });
  } catch (err) {
    console.error('User login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/teamlead/login ───────────────────────────────
// Team leads are regular `users` rows with is_team_lead = 1 — same
// credentials the admin set when creating/promoting them, but this
// endpoint issues a token with role: 'teamlead' so the frontend routes
// them straight to the Team Leader Portal instead of the employee
// dashboard, and rejects anyone who isn't flagged as a team lead.
router.post('/teamlead/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [[user]] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.status === 'Inactive') {
      return res.status(403).json({ error: 'Your account is inactive. Contact your admin.' });
    }
    if (!user.is_team_lead) {
      return res.status(403).json({ error: 'This account is not registered as a Team Lead. Use the Employee Login instead, or ask your admin to grant Team Lead access.' });
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: 'teamlead' });

    const [[{ teamSize }]] = await db.query('SELECT COUNT(*) AS teamSize FROM users WHERE manager_id = ?', [user.id]);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'teamlead',
        department: user.department,
        phone: user.phone,
        teamSize,
      }
    });
  } catch (err) {
    console.error('Team lead login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/teamlead/view-as/:userId ─────────────────────
// A team lead opens the personal portal of one of THEIR OWN direct reports
// (the same screen that person sees after logging in) so they can review
// and enter details on their behalf. Returns a short-lived token that acts
// as that user; it carries `viewAsBy` so every write is audit-logged.
// Only works for users whose manager_id points at the calling team lead.
router.post('/teamlead/view-as/:userId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'teamlead') {
      return res.status(403).json({ error: 'Team Leader access required' });
    }
    const targetId = parseInt(req.params.userId, 10);
    if (!targetId) return res.status(400).json({ error: 'Invalid user' });

    const [[lead]] = await db.query('SELECT id, name, is_team_lead FROM users WHERE id = ?', [req.user.id]);
    if (!lead || !lead.is_team_lead) return res.status(403).json({ error: 'Team Leader access required' });

    const [[member]] = await db.query('SELECT * FROM users WHERE id = ? AND manager_id = ?', [targetId, lead.id]);
    if (!member) return res.status(403).json({ error: 'This user is not assigned to you' });

    const token = signToken(
      { id: member.id, email: member.email, name: member.name, role: 'user', viewAsBy: lead.id },
      '6h'
    );

    await db.query(
      `INSERT INTO activity_log (actor_type, actor_id, action, target_type, target_id, meta)
       VALUES ('user', ?, 'teamlead_open_user_portal', 'user', ?, ?)`,
      [lead.id, member.id, JSON.stringify({ teamLead: lead.name, member: member.name })]
    );

    res.json({
      token,
      user: {
        id: member.id, name: member.name, email: member.email, role: member.role,
        department: member.department, phone: member.phone, status: member.status,
        joinDate: member.join_date, googleSheetLink: member.google_sheet_link || '',
        weeklyTarget: member.weekly_target, achieved: member.achieved, notes: member.notes || '',
      },
    });
  } catch (err) {
    console.error('Team lead view-as error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const [[admin]] = await db.query('SELECT id, name, email FROM admins WHERE id = ?', [req.user.id]);
      return res.json({ ...admin, role: 'admin' });
    }

    const [[user]] = await db.query(`
      SELECT id, name, email, role, department, phone, status, join_date,
             google_sheet_link, weekly_target, achieved, notes,
             manager_id, is_team_lead, current_streak, best_streak, email_reports_enabled
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Preserve whichever portal they actually logged in through (JWT's
    // role claim) rather than always reporting 'user' — a team-lead
    // token should restore straight back into the Team Leader Portal.
    res.json({
      ...user,
      role: req.user.role === 'teamlead' ? 'teamlead' : 'user',
      managerId: user.manager_id,
      isTeamLead: !!user.is_team_lead,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
