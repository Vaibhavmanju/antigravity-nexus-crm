const db = require('../config/db');
const { getScorecard } = require('./analyticsService');
const notificationService = require('./notificationService');
const { sendMail, isEmailConfigured } = require('./emailService');
const { buildConsolidatedReport } = require('./reportGenerator');

/**
 * Runs on a timer from server.js. For every active employee:
 *  - refreshes their scorecard (also recalculates streaks)
 *  - on Sunday (last day of the Mon–Sun week) fires a missed-target or
 *    goal-achieved notification once the week is basically over
 *  - if REPORTS_AUTO_EMAIL=true, emails a consolidated CSV report on the
 *    configured cadence
 * Each user is isolated in a try/catch so one bad row never blocks the rest.
 */
async function runTargetChecks() {
  const [users] = await db.query(
    `SELECT id, name, email, weekly_target, email_reports_enabled FROM users WHERE status = 'Active'`
  );

  const now = new Date();
  const isLateInWeek = now.getDay() === 0 || now.getDay() === 6; // Sat/Sun — near end of the Mon-Sun week

  for (const u of users) {
    try {
      const card = await getScorecard(u.id, 'week');
      if (isLateInWeek) {
        if (card.pctToGoal >= 100) {
          await notificationService.notifyGoalAchieved(u.id, card.total, card.target);
        } else if (card.pctToGoal < 70) {
          await notificationService.notifyMissedTarget(u.id, card.total, card.target);
        }
      }
    } catch (e) {
      console.error(`Target check failed for user ${u.id}:`, e.message);
    }
  }

  if (process.env.REPORTS_AUTO_EMAIL === 'true' && isEmailConfigured()) {
    await sendWeeklyDigests(users);
  }
}

async function sendWeeklyDigests(users) {
  for (const u of users) {
    if (!u.email_reports_enabled) continue;
    try {
      const { csv, range } = await buildConsolidatedReport('week', null, u.id);
      await sendMail({
        to: u.email,
        subject: `Your weekly performance report (${range.label})`,
        text: `Hi ${u.name},\n\nAttached is your consolidated performance report for ${range.label}.\n\n— Antigravity Nexus CRM`,
        attachments: [{ filename: `weekly-report-${range.start}_to_${range.end}.csv`, content: csv }],
      });
    } catch (e) {
      console.error(`Weekly digest email failed for user ${u.id}:`, e.message);
    }
  }
}

module.exports = { runTargetChecks };
