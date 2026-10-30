const db = require('../config/db');
const { sendMail, isEmailConfigured } = require('./emailService');

/**
 * Central place to create in-app notifications. Every notification is
 * persisted to MySQL so the bell icon works even if email isn't
 * configured; email is sent best-effort on top when SMTP is set up.
 */
async function createNotification({ userId, type = 'system', severity = 'info', title, message = '' }) {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, type, severity, title, message) VALUES (?, ?, ?, ?, ?)`,
    [userId, type, severity, title, message]
  );
  return { id: result.insertId, userId, type, severity, title, message };
}

async function listForUser(userId, { onlyUnread = false, limit = 50 } = {}) {
  const clause = onlyUnread ? 'AND is_read = 0' : '';
  const [rows] = await db.query(
    `SELECT id, type, severity, title, message, is_read, created_at
     FROM notifications WHERE user_id = ? ${clause}
     ORDER BY created_at DESC LIMIT ?`,
    [userId, limit]
  );
  return rows;
}

async function unreadCount(userId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId]
  );
  return row.cnt;
}

async function markRead(userId, id) {
  await db.query(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, userId]);
}

async function markAllRead(userId) {
  await db.query(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
}

/** Fired from the Google Sheet sync services whenever a sync fails. */
async function notifySyncFailure(userId, errorMessage) {
  try {
    const message = String(errorMessage || 'Unknown error').slice(0, 490);
    // The background sync retries every few minutes — don't repeat the same
    // failure notification more than once per 6 hours.
    const [[dup]] = await db.query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'sync_error' AND message = ?
         AND created_at > DATE_SUB(NOW(), INTERVAL 6 HOUR) LIMIT 1`,
      [userId, message]
    );
    if (dup) return;
    await createNotification({
      userId,
      type: 'sync_error',
      severity: 'critical',
      title: 'Sheet sync failed',
      message,
    });
  } catch (e) {
    console.error('notifySyncFailure failed:', e.message);
  }
}

/** Fired by the scheduled target-check for anyone under their weekly goal. */
async function notifyMissedTarget(userId, achieved, target) {
  try {
    await createNotification({
      userId,
      type: 'missed_target',
      severity: 'warning',
      title: 'Behind on weekly target',
      message: `You're at ${achieved}/${target} (${Math.round((achieved / (target || 1)) * 100)}%) for this week.`,
    });
    const [[user]] = await db.query('SELECT email, name, email_reports_enabled FROM users WHERE id = ?', [userId]);
    if (user?.email_reports_enabled && isEmailConfigured()) {
      await sendMail({
        to: user.email,
        subject: 'Antigravity Nexus — behind on your weekly target',
        text: `Hi ${user.name},\n\nYou're currently at ${achieved}/${target} for this week's target. There's still time to catch up!\n\n— Antigravity Nexus CRM`,
      });
    }
  } catch (e) {
    console.error('notifyMissedTarget failed:', e.message);
  }
}

async function notifyGoalAchieved(userId, achieved, target) {
  try {
    await createNotification({
      userId,
      type: 'goal_achieved',
      severity: 'success',
      title: 'Weekly target reached! 🎉',
      message: `You hit ${achieved}/${target} for this week. Great work!`,
    });
  } catch (e) {
    console.error('notifyGoalAchieved failed:', e.message);
  }
}

async function notifyStreakMilestone(userId, streak) {
  try {
    await createNotification({
      userId,
      type: 'streak',
      severity: 'success',
      title: `${streak}-day streak!`,
      message: `You've logged performance ${streak} days in a row. Keep it going.`,
    });
  } catch (e) {
    console.error('notifyStreakMilestone failed:', e.message);
  }
}

module.exports = {
  createNotification,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
  notifySyncFailure,
  notifyMissedTarget,
  notifyGoalAchieved,
  notifyStreakMilestone,
};
