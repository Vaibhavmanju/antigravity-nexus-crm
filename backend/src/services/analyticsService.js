const db = require('../config/db');
const { notifyStreakMilestone } = require('./notificationService');

function toDateStr(d) { return d.toISOString().split('T')[0]; }

/** Monday-Sunday range containing `anchor`, offset by `weekOffset` weeks. */
function weekRange(anchor, weekOffset = 0) {
  const dow = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

function monthRange(anchor, monthOffset = 0) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset + 1, 0);
  return { start: toDateStr(first), end: toDateStr(last), days: last.getDate() };
}

function dayRange(anchor, dayOffset = 0) {
  const d = new Date(anchor);
  d.setDate(d.getDate() + dayOffset);
  const s = toDateStr(d);
  return { start: s, end: s };
}

/** Returns { current: {start,end}, previous: {start,end}, target } for a period. */
function getRanges(period, weeklyTarget, anchorStr) {
  const anchor = anchorStr ? new Date(anchorStr + 'T00:00:00') : new Date();
  if (period === 'day') {
    return { current: dayRange(anchor, 0), previous: dayRange(anchor, -1), target: weeklyTarget / 7 };
  }
  if (period === 'month') {
    const cur = monthRange(anchor, 0);
    const prev = monthRange(anchor, -1);
    return { current: cur, previous: prev, target: (weeklyTarget / 7) * cur.days };
  }
  // default: week
  return { current: weekRange(anchor, 0), previous: weekRange(anchor, -1), target: weeklyTarget };
}

async function sumValue(userId, start, end) {
  const [[row]] = await db.query(
    `SELECT COALESCE(SUM(value),0) AS total FROM daily_performance WHERE user_id = ? AND perf_date BETWEEN ? AND ?`,
    [userId, start, end]
  );
  return Number(row.total) || 0;
}

/**
 * Recomputes current/best streak (consecutive days with value > 0,
 * counted backward from the most recent logged day) and persists it
 * to users.current_streak / users.best_streak.
 */
async function recalcStreak(userId) {
  const [rows] = await db.query(
    `SELECT perf_date, value FROM daily_performance WHERE user_id = ? ORDER BY perf_date DESC LIMIT 120`,
    [userId]
  );
  let current = 0;
  let expected = null;
  for (const r of rows) {
    const d = new Date(r.perf_date);
    if (Number(r.value) <= 0) break;
    if (expected === null) {
      current = 1;
      expected = d;
    } else {
      const diffDays = Math.round((expected - d) / 86400000);
      if (diffDays === 1) { current += 1; expected = d; }
      else break;
    }
  }

  const [[u]] = await db.query('SELECT best_streak FROM users WHERE id = ?', [userId]);
  const best = Math.max(current, u?.best_streak || 0);
  await db.query('UPDATE users SET current_streak = ?, best_streak = ? WHERE id = ?', [current, best, userId]);

  if (current > 0 && current % 5 === 0) {
    // Milestone every 5 days — fire and forget, don't block the response.
    notifyStreakMilestone(userId, current).catch(() => {});
  }
  return { current, best };
}

/** Full scorecard for one user: totals, % to goal, trend arrow, streaks, sparkline. */
async function getScorecard(userId, period = 'week', anchorStr = null) {
  const [[user]] = await db.query(
    'SELECT id, name, weekly_target, current_streak, best_streak FROM users WHERE id = ?',
    [userId]
  );
  if (!user) throw new Error('User not found');

  const { current, previous, target } = getRanges(period, user.weekly_target || 0, anchorStr);
  const [currentTotal, previousTotal] = await Promise.all([
    sumValue(userId, current.start, current.end),
    sumValue(userId, previous.start, previous.end),
  ]);

  let trend = 'flat';
  let trendPct = 0;
  if (previousTotal > 0) {
    trendPct = Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10;
    trend = trendPct > 1 ? 'up' : trendPct < -1 ? 'down' : 'flat';
  } else if (currentTotal > 0) {
    trend = 'up';
    trendPct = 100;
  }

  const pctToGoal = target > 0 ? Math.round((currentTotal / target) * 1000) / 10 : 0;
  const { current: streakCurrent, best: streakBest } = await recalcStreak(userId);

  const [history] = await db.query(
    `SELECT perf_date, value FROM daily_performance
     WHERE user_id = ? AND perf_date BETWEEN DATE_SUB(?, INTERVAL 13 DAY) AND ?
     ORDER BY perf_date ASC`,
    [userId, current.end, current.end]
  );

  return {
    userId,
    userName: user.name,
    period,
    range: current,
    total: Math.round(currentTotal * 100) / 100,
    target: Math.round(target * 100) / 100,
    pctToGoal,
    previousTotal: Math.round(previousTotal * 100) / 100,
    trend,
    trendPct,
    currentStreak: streakCurrent,
    bestStreak: streakBest,
    history: history.map(h => ({ date: h.perf_date, value: Number(h.value) })),
  };
}

/**
 * Team-level rollup. Admins get every active employee; a team lead
 * gets only the users whose manager_id points at them.
 */
async function getTeamRollup({ managerId = null, isAdmin = false, period = 'week' } = {}) {
  const clause = isAdmin ? '' : 'WHERE manager_id = ?';
  const params = isAdmin ? [] : [managerId];
  const [members] = await db.query(
    `SELECT id, name, department, role, weekly_target, achieved, current_streak, best_streak
     FROM users ${clause} ORDER BY name ASC`,
    params
  );

  const rows = await Promise.all(members.map(async m => {
    const card = await getScorecard(m.id, period);
    return {
      id: m.id,
      name: m.name,
      department: m.department,
      role: m.role,
      total: card.total,
      target: card.target,
      pctToGoal: card.pctToGoal,
      trend: card.trend,
      trendPct: card.trendPct,
      currentStreak: card.currentStreak,
      bestStreak: card.bestStreak,
    };
  }));

  const teamTotal = rows.reduce((s, r) => s + r.total, 0);
  const teamTarget = rows.reduce((s, r) => s + r.target, 0);

  return {
    period,
    members: rows,
    teamTotal: Math.round(teamTotal * 100) / 100,
    teamTarget: Math.round(teamTarget * 100) / 100,
    teamPct: teamTarget > 0 ? Math.round((teamTotal / teamTarget) * 1000) / 10 : 0,
  };
}

/**
 * Zero-filled daily performance series for one user over the last `days`
 * days (today inclusive). This is the self-reported data from
 * `daily_performance` — written either by manual "Update My Performance"
 * entry or by that user's linked Google Sheet sync. Powers the admin
 * panel's per-user Performance History graph.
 */
async function getPerformanceHistory(userId, days = 30) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  const [rows] = await db.query(
    `SELECT perf_date, value FROM daily_performance WHERE user_id = ? AND perf_date BETWEEN ? AND ? ORDER BY perf_date ASC`,
    [userId, toDateStr(start), toDateStr(end)]
  );
  const byDate = {};
  rows.forEach(r => { byDate[toDateStr(new Date(r.perf_date))] = Number(r.value) || 0; });

  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = toDateStr(d);
    series.push({ date: key, value: byDate[key] || 0 });
  }

  const activeDays = series.filter(p => p.value > 0).length;
  const total = series.reduce((s, p) => s + p.value, 0);
  const max = series.reduce((m, p) => Math.max(m, p.value), 0);

  return {
    days,
    series,
    total: Math.round(total * 100) / 100,
    avgPerActiveDay: activeDays ? Math.round((total / activeDays) * 100) / 100 : 0,
    bestDay: max,
    activeDays,
  };
}

module.exports = { getScorecard, getTeamRollup, recalcStreak, getRanges, getPerformanceHistory };
