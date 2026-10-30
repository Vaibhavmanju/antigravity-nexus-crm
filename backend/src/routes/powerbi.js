const express = require('express');
const db = require('../config/db');
const { verifyToken, requireUser } = require('../middleware/auth');
const powerbiService = require('../services/powerbiService');

const router = express.Router();
router.use(verifyToken, requireUser);

// ── GET /api/powerbi/status ───────────────────────────────────────
// Lets the frontend show a friendly "not configured yet" state instead
// of a broken embed if the admin hasn't wired up Azure AD / Power BI.
router.get('/status', (req, res) => {
  res.json({ configured: powerbiService.isConfigured() });
});

// ── GET /api/powerbi/embed-token ──────────────────────────────────
// Admins get an unrestricted (whole-org) view. Employees get a token
// scoped by Row-Level Security to their own email, so they can only
// ever see their own rows inside the embedded report — enforced by
// Power BI itself, not just hidden in the UI.
router.get('/embed-token', async (req, res) => {
  try {
    if (!powerbiService.isConfigured()) {
      return res.status(503).json({
        error: 'Power BI is not configured. An admin needs to set POWERBI_* variables in backend/.env.',
        configured: false,
      });
    }

    let identity = null;
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin) {
      const [[user]] = await db.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
      if (!user) return res.status(404).json({ error: 'User not found' });
      identity = user.email;
    }

    const result = await powerbiService.getEmbedToken({ identity, isAdmin });
    res.json({ ...result, configured: true });
  } catch (e) {
    console.error('Power BI embed-token error:', e.message);
    res.status(502).json({ error: e.message || 'Failed to generate Power BI embed token', configured: true });
  }
});

module.exports = router;
