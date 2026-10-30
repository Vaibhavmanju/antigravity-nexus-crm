/**
 * sampleData.js
 *
 * Guarantees that every Sheet Analytics panel (RFQ Tracker, Client
 * Database, Project Tracker) always has something to draw, even for a
 * user whose Google Sheet hasn't been linked / shared / synced yet.
 *
 * - Sample rows are tagged with row_hash 'demo-…' so they can always be
 *   told apart from real data. The UI labels them "Sample data".
 * - The moment a REAL sheet sync brings in at least one row, that user's
 *   sample rows for that sheet are deleted automatically
 *   (see clearSampleRows) — real data always wins.
 * - Sample data is only ever created for a user/sheet that has NO rows at
 *   all. Set SAMPLE_DATA_FALLBACK=false in .env to switch it off.
 */

const db = require('../config/db');
const { addDays, mondayOf, todayStr, parseYmd } = require('../utils/dates');

const ENABLED = process.env.SAMPLE_DATA_FALLBACK !== 'false';
const WEEKS_BACK = 8; // this week + 7 earlier weeks

// ── deterministic PRNG so a user's sample data is stable ──────────
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
const between = (rand, lo, hi) => lo + rand() * (hi - lo);
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

const POOLS = {
  industries:   ['Healthcare', 'Technology', 'Financial Services', 'Automotive', 'Retail', 'FMCG', 'Telecom', 'Energy'],
  methodology:  ['Online Survey (CAWI)', 'CATI', 'Online Community', 'IDI (Qualitative)', 'Focus Group', 'Mobile Survey'],
  audience:     ['B2B Decision Makers', 'General Consumers 18-54', 'Physicians', 'IT Professionals', 'Finance Managers', 'Parents of Teens'],
  markets:      ['USA', 'UK', 'Germany', 'India', 'UAE', 'Canada', 'Australia', 'France'],
  clients:      ['Northwind Insights', 'BlueRiver Research', 'Helix Analytics', 'Orion Market Labs', 'Kestrel Consulting', 'Luma Brands', 'Vantage Research', 'Zenith Panels'],
  contacts:     ['Emma Clarke', 'Rahul Menon', 'Sofia Rossi', 'Liam Walker', 'Aisha Khan', 'Noah Fischer', 'Priya Nair', 'Lucas Martin'],
  designations: ['Project Manager', 'Research Director', 'Senior Associate', 'Vendor Manager', 'Procurement Lead', 'Fieldwork Manager'],
  subjects:     ['Brand tracking wave', 'Patient journey study', 'Ad concept test', 'Usage & attitude study', 'Pricing sensitivity survey', 'Customer satisfaction pulse', 'Product feature preference', 'Market sizing study'],
  cities:       ['Bengaluru', 'Mumbai', 'London', 'New York', 'Berlin', 'Dubai', 'Toronto', 'Sydney'],
  followUp:     ['Sent', 'Sent', 'Sent', 'Pending', 'Won', 'Lost'],
  projStatus:   ['Completed', 'Completed', 'In Progress', 'Fielding', 'On Hold', 'Delivered'],
  invoiceStatus:['Paid', 'Invoiced', 'Invoiced', 'Pending', 'Not Invoiced'],
};

/** Every date (YYYY-MM-DD) that should get sample rows, oldest → newest. */
function sampleDates() {
  const today = todayStr();
  const thisMonday = mondayOf(today);
  const out = [];
  for (let w = WEEKS_BACK - 1; w >= 0; w--) {
    const monday = addDays(thisMonday, -7 * w);
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (d > today) break;
      out.push(d);
    }
  }
  return out;
}

function countForDay(rand, ymd, today) {
  const dow = parseYmd(ymd).getUTCDay(); // 0 Sun … 6 Sat
  if (ymd === today) return 2 + Math.floor(rand() * 2);      // today always has data
  if (dow === 0) return rand() < 0.3 ? 1 : 0;                // Sundays: quiet
  if (dow === 6) return rand() < 0.5 ? 1 : 0;                // Saturdays: light
  return 1 + Math.floor(rand() * 3);                          // weekdays: 1–3
}

async function tableIsEmpty(table, userId) {
  const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [userId]);
  return Number(r.n) === 0;
}

async function bulkInsert(table, columns, rows) {
  if (!rows.length) return;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.query(
      `INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES ?`,
      [rows.slice(i, i + CHUNK)]
    );
  }
}

// ── RFQ Tracker ────────────────────────────────────────────────────
async function seedRfq(user) {
  const rand = rng(user.id * 1009 + 11);
  const today = todayStr();
  const cols = ['user_id','sl_no','subject','entry_date','client_contact','client_name','designation','email',
    'industry','rfq_sent_by','methodology','target_audience','market','sample_size','loi','ir','cpi_usd',
    'additional_cost','total_cost','quota_sent_by','follow_up','comment','row_hash'];
  const rows = [];
  let n = 0;
  for (const d of sampleDates()) {
    const c = countForDay(rand, d, today);
    for (let k = 0; k < c; k++) {
      n++;
      const contact = pick(rand, POOLS.contacts);
      const client = pick(rand, POOLS.clients);
      const size = Math.round(between(rand, 100, 1200) / 50) * 50;
      const cpi = round(between(rand, 3, 42));
      const extra = round(between(rand, 0, 400), 0);
      rows.push([
        user.id, String(n), `${pick(rand, POOLS.subjects)} — ${pick(rand, POOLS.markets)}`, d,
        contact, client, pick(rand, POOLS.designations),
        `${contact.split(' ')[0].toLowerCase()}@${client.split(' ')[0].toLowerCase()}.com`,
        pick(rand, POOLS.industries), user.name, pick(rand, POOLS.methodology),
        pick(rand, POOLS.audience), pick(rand, POOLS.markets), size,
        round(between(rand, 5, 25), 0), round(between(rand, 8, 65), 0), cpi, extra,
        round(cpi * size + extra), user.name, pick(rand, POOLS.followUp),
        'Sample entry — replaced automatically once the real sheet is synced',
        `demo-${user.id}-${n}`,
      ]);
    }
  }
  await bulkInsert('rfq_entries', cols, rows);
  return rows.length;
}

// ── Client Database ────────────────────────────────────────────────
async function seedClient(user) {
  const rand = rng(user.id * 2003 + 23);
  const today = todayStr();
  const cols = ['user_id','entry_date','company_name','name','email','designation','address','phone',
    'intro_mail_sent','follow_up_email','comment','row_hash'];
  const rows = [];
  let n = 0;
  for (const d of sampleDates()) {
    const c = countForDay(rand, d, today);
    for (let k = 0; k < c; k++) {
      n++;
      const person = pick(rand, POOLS.contacts);
      const company = pick(rand, POOLS.clients);
      const introSent = rand() < 0.8;
      const followed = introSent && rand() < 0.55;
      rows.push([
        user.id, d, company, person,
        `${person.split(' ')[0].toLowerCase()}.${person.split(' ')[1].toLowerCase()}@${company.split(' ')[0].toLowerCase()}.com`,
        pick(rand, POOLS.designations), pick(rand, POOLS.cities),
        `+${Math.floor(between(rand, 44, 91))} ${Math.floor(between(rand, 70000, 99999))} ${Math.floor(between(rand, 10000, 99999))}`,
        introSent ? `Sent by ${user.name.split(' ')[0]}` : null,
        followed ? 'Follow-up 1 sent' : null,
        'Sample entry — replaced automatically once the real sheet is synced',
        `demo-${user.id}-${n}`,
      ]);
    }
  }
  await bulkInsert('client_entries', cols, rows);
  return rows.length;
}

// ── Project Tracker ────────────────────────────────────────────────
async function seedProject(user) {
  const rand = rng(user.id * 3001 + 37);
  const today = todayStr();
  const cols = ['user_id','project_code','project_name','start_date','end_date','client_name','client_contact_pm',
    'market','target_audience','methodology','requested_n','achieved_n','loi','ir','cpi','additional_cost','total',
    'project_status','invoice_status','comment','project_expenses','project_gross','amount','gross_margin',
    'project_manager','row_hash'];
  const rows = [];
  let n = 0;
  for (const d of sampleDates()) {
    const base = countForDay(rand, d, today);
    const c = base > 1 ? 1 + Math.floor(rand() * 2) : base;
    for (let k = 0; k < c; k++) {
      n++;
      const requested = Math.round(between(rand, 100, 1000) / 50) * 50;
      const achieved = Math.round(requested * between(rand, 0.85, 1.05));
      const cpi = round(between(rand, 4, 40));
      const extra = round(between(rand, 0, 300), 0);
      const total = round(cpi * achieved + extra);
      const expenses = round(total * between(rand, 0.55, 0.85));
      const gross = round(total - expenses);
      rows.push([
        user.id, `PRJ-${String(user.id).padStart(2, '0')}-${String(n).padStart(3, '0')}`,
        `${pick(rand, POOLS.subjects)} (${pick(rand, POOLS.markets)})`, d, addDays(d, Math.floor(between(rand, 3, 21))),
        pick(rand, POOLS.clients), pick(rand, POOLS.contacts), pick(rand, POOLS.markets),
        pick(rand, POOLS.audience), pick(rand, POOLS.methodology), requested, achieved,
        round(between(rand, 5, 25), 0), round(between(rand, 8, 65), 0), cpi, extra, total,
        pick(rand, POOLS.projStatus), pick(rand, POOLS.invoiceStatus),
        'Sample entry — replaced automatically once the real sheet is synced',
        expenses, gross, total, round((gross / total) * 100, 1), user.name, `demo-${user.id}-${n}`,
      ]);
    }
  }
  await bulkInsert('project_entries', cols, rows);
  return rows.length;
}

const SEEDERS = { rfq_entries: seedRfq, client_entries: seedClient, project_entries: seedProject };

/**
 * Make sure one user has data in all three sheet tables. Only tables that
 * are completely empty for that user are touched.
 */
async function ensureSampleData(userId) {
  if (!ENABLED || !userId) return;
  const [[user]] = await db.query('SELECT id, name FROM users WHERE id = ?', [userId]);
  if (!user) return;
  for (const [table, seed] of Object.entries(SEEDERS)) {
    try {
      if (await tableIsEmpty(table, user.id)) await seed(user);
    } catch (err) {
      console.error(`Sample data (${table}, user ${user.id}) failed:`, err.message);
    }
  }
}

/** Same, for the whole organisation (or a single user when userId given). */
async function ensureSampleDataFor(userId = null) {
  if (!ENABLED) return;
  if (userId) return ensureSampleData(userId);
  const [users] = await db.query("SELECT id FROM users WHERE status = 'Active'");
  for (const u of users) await ensureSampleData(u.id);
}

/** Called after a successful real sync — real data replaces the samples. */
async function clearSampleRows(table, userId) {
  await db.query(`DELETE FROM ${table} WHERE user_id = ? AND row_hash LIKE 'demo-%'`, [userId]);
}

module.exports = { ensureSampleData, ensureSampleDataFor, clearSampleRows, ENABLED };
