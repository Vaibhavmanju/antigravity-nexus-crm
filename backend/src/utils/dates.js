/**
 * dates.js — timezone-proof date helpers.
 *
 * Everything here works on plain 'YYYY-MM-DD' strings and does its
 * arithmetic in UTC, so the result never depends on the timezone of the
 * machine the server happens to run on (the classic bug where a Monday
 * turns into the previous Sunday after `toISOString()` on a UTC+5:30 box).
 */

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtYmd(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtYmd(d);
}

/** Monday (YYYY-MM-DD) of the week containing the given date string. */
function mondayOf(ymd) {
  const d = parseYmd(ymd);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return fmtYmd(d);
}

/** "Today" as YYYY-MM-DD in the business timezone (APP_TIMEZONE). */
function todayStr() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return fmtYmd(new Date());
  }
}

/** Normalise whatever mysql2 hands back for a DATE column to YYYY-MM-DD. */
function dbDateToStr(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return fmtYmd(v);          // pool timezone is +00:00
  return String(v).slice(0, 10);
}

/** "20 Sep – 26 Sep 2026" label for a Monday. */
function weekLabel(mondayStr) {
  const mon = parseYmd(mondayStr);
  const sun = parseYmd(addDays(mondayStr, 6));
  const f = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return `${f(mon)} – ${f(sun)} ${sun.getUTCFullYear()}`;
}

function dayLabel(ymd, idx) {
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const d = parseYmd(ymd);
  return `${NAMES[idx]} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`;
}

module.exports = {
  APP_TIMEZONE, YMD, parseYmd, fmtYmd, addDays, mondayOf, todayStr,
  dbDateToStr, weekLabel, dayLabel,
};
