const express = require('express');
const db = require('../config/db');
const { verifyToken, requireUser } = require('../middleware/auth');
const { getScorecard, getTeamRollup, getPerformanceHistory } = require('../services/analyticsService');

const router = express.Router();
router.use(verifyToken, requireUser);

const VALID_PERIODS = ['day', 'week', 'month'];

function parsePeriod(req) {
  return VALID_PERIODS.includes(req.query.period) ? req.query.period : 'week';
}

// ── GET /api/analytics/me/scorecard ─────────────────────────────
// Employee's own performance scorecard (streaks, % to goal, trend).
router.get('/me/scorecard', async (req, res) => {
  try {
    if (req.user.role !== 'user') return res.status(403).json({ error: 'User accounts only' });
    const card = await getScorecard(req.user.id, parsePeriod(req), req.query.date || null);
    res.json(card);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build scorecard' });
  }
});

// ── GET /api/analytics/users/:id/scorecard ──────────────────────
// Admin (any user) or a team lead viewing one of their own direct reports.
router.get('/users/:id/scorecard', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (req.user.role !== 'admin') {
      const [[me]] = await db.query('SELECT is_team_lead FROM users WHERE id = ?', [req.user.id]);
      const [[target]] = await db.query('SELECT manager_id FROM users WHERE id = ?', [targetId]);
      const allowed = req.user.id === targetId || (me?.is_team_lead && target?.manager_id === req.user.id);
      if (!allowed) return res.status(403).json({ error: 'Not authorized to view this scorecard' });
    }
    const card = await getScorecard(targetId, parsePeriod(req), req.query.date || null);
    res.json(card);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build scorecard' });
  }
});

// ── GET /api/analytics/users/:id/performance-history ────────────
// ?days=7|30|90 — zero-filled daily series, self-reported "Achieved"
// data. Powers the admin panel's Individual Users performance graph.
router.get('/users/:id/performance-history', async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (req.user.role !== 'admin') {
      const [[me]] = await db.query('SELECT is_team_lead FROM users WHERE id = ?', [req.user.id]);
      const [[target]] = await db.query('SELECT manager_id FROM users WHERE id = ?', [targetId]);
      const allowed = req.user.id === targetId || (me?.is_team_lead && target?.manager_id === req.user.id);
      if (!allowed) return res.status(403).json({ error: 'Not authorized to view this data' });
    }
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const data = await getPerformanceHistory(targetId, days);
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build performance history' });
  }
});

// ── GET /api/analytics/team-rollup ──────────────────────────────
// Admins see the whole org; team leads see their direct reports.
router.get('/team-rollup', async (req, res) => {
  try {
    const period = parsePeriod(req);
    if (req.user.role === 'admin') {
      const rollup = await getTeamRollup({ isAdmin: true, period });
      return res.json(rollup);
    }
    const [[me]] = await db.query('SELECT is_team_lead FROM users WHERE id = ?', [req.user.id]);
    if (!me?.is_team_lead) return res.status(403).json({ error: 'Team-lead access required' });
    const rollup = await getTeamRollup({ managerId: req.user.id, isAdmin: false, period });
    res.json(rollup);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build team rollup' });
  }
});

module.exports = router;
