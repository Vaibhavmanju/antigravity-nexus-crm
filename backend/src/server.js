// The whole backend does its "which week is it?" arithmetic in UTC (matching the
// MySQL pool's +00:00 timezone), so a Monday can never turn into a Sunday just
// because the host machine runs in another timezone (e.g. IST). The business
// timezone used for "today" is APP_TIMEZONE (see utils/dates.js).
process.env.TZ = 'UTC';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const authRoutes         = require('./routes/auth');
const usersRoutes        = require('./routes/users');
const meRoutes            = require('./routes/me');
const dashboardRoutes    = require('./routes/dashboard');
const reportsRoutes      = require('./routes/reports');
const analyticsRoutes    = require('./routes/analytics');
const notificationsRoutes = require('./routes/notifications');
const powerbiRoutes      = require('./routes/powerbi');
const { syncEveryone }         = require('./services/sheetSyncAll');
const { ensureSampleDataFor }  = require('./services/sampleData');
const { runTargetChecks }      = require('./services/targetCheckJob');

const app = express();
const PORT = process.env.PORT || 5000;
const SHEET_SYNC_INTERVAL_MS = (parseInt(process.env.SHEET_SYNC_INTERVAL_MINUTES) || 5) * 60 * 1000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/me', meRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', dashboardRoutes); // master-sheet endpoints share the dashboard router
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/powerbi', powerbiRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Antigravity Nexus CRM API' });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Error handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀  Antigravity Nexus CRM API running on http://localhost:${PORT}`);
  console.log(`    Health check: http://localhost:${PORT}/api/health\n`);

  // ── Background Google Sheets auto-sync ──────────────────────
  // Runs once shortly after boot, then on a recurring interval.
  // Each user's sheet is synced independently — one failure never
  // blocks the others. Safe to disable by setting SHEET_AUTO_SYNC=false.
  if (process.env.SHEET_AUTO_SYNC !== 'false') {
    console.log(`🔄  Auto-sync enabled — syncing all linked sheets every ${SHEET_SYNC_INTERVAL_MS / 60000} minute(s)`);

    let syncRunning = false;
    const runSync = async () => {
      if (syncRunning) return; // previous round still going — don't pile up
      syncRunning = true;
      try {
        const results = await syncEveryone();
        const attempted = results.filter(r => r.linked);
        const ok = attempted.filter(r => r.success).length;
        if (attempted.length > 0) console.log(`🔄  Auto-sync: ${ok} succeeded, ${attempted.length - ok} failed`);
      } catch (err) {
        console.error('Auto-sync run failed:', err.message);
      } finally {
        syncRunning = false;
      }
    };

    setTimeout(runSync, 10000); // first run shortly after boot, once DB pool is warm
    setInterval(runSync, SHEET_SYNC_INTERVAL_MS);
  }

  // ── Sheet Analytics placeholders ───────────────────────────
  // Any user with no rows at all in a sheet table gets clearly-labelled sample
  // rows so no Sheet Analytics panel is ever blank. Real synced data replaces
  // them automatically. Disable with SAMPLE_DATA_FALLBACK=false.
  setTimeout(() => ensureSampleDataFor().catch(err => console.error('Sample data backfill failed:', err.message)), 4000);

  // ── Notification scheduler ────────────────────────────────────
  // Checks everyone's progress toward their weekly target, fires
  // "missed target" / "goal achieved" notifications (and an optional
  // email digest if REPORTS_AUTO_EMAIL=true), and keeps streaks fresh.
  const NOTIF_INTERVAL_MS = (parseInt(process.env.NOTIFICATIONS_CHECK_INTERVAL_MINUTES) || 60) * 60 * 1000;
  console.log(`🔔  Notification scheduler enabled — checking targets every ${NOTIF_INTERVAL_MS / 60000} minute(s)`);
  setTimeout(() => runTargetChecks().catch(err => console.error('Target check failed:', err.message)), 20000);
  setInterval(() => runTargetChecks().catch(err => console.error('Target check failed:', err.message)), NOTIF_INTERVAL_MS);
});
