const express = require('express');
const { verifyToken, requireUser } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();
router.use(verifyToken, requireUser);

// Notifications are keyed by (actor_type, actor_id) conceptually, but since
// both admins and users can receive them, we key purely on the JWT's id +
// role combo by storing admin notifications under a reserved negative-safe
// scheme is unnecessary here — admins use userId = their admin id in the
// `notifications.user_id` column is fine because admins and users are
// looked up via req.user.role at the call site (sync/target checks only
// ever notify role='user' accounts today).

// ── GET /api/notifications ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const onlyUnread = req.query.unread === 'true';
    const rows = await notificationService.listForUser(req.user.id, { onlyUnread });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// ── GET /api/notifications/unread-count ──────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const count = await notificationService.unreadCount(req.user.id);
    res.json({ count });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load unread count' });
  }
});

// ── PUT /api/notifications/:id/read ───────────────────────────────
router.put('/:id/read', async (req, res) => {
  try {
    await notificationService.markRead(req.user.id, Number(req.params.id));
    res.json({ message: 'Marked read' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ── PUT /api/notifications/read-all ───────────────────────────────
router.put('/read-all', async (req, res) => {
  try {
    await notificationService.markAllRead(req.user.id);
    res.json({ message: 'All marked read' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
