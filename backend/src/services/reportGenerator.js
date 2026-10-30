const db = require('../config/db');

// ── Date range helpers ──────────────────────────────────────────
function toDateStr(d) { return d.toISOString().split('T')[0]; }

/**
 * Given a period ('day' | 'week' | 'month') and an anchor date string
 * (YYYY-MM-DD, defaults to today), returns { start, end, label } where
 * start/end are YYYY-MM-DD strings (inclusive) covering that period.
 * 'week' always uses a Monday–Sunday window, matching the rest of the app.
 */
function getDateRange(period, anchorStr) {
  const anchor = anchorStr ? new Date(anchorStr + 'T00:00:00') : new Date();
  if (Number.isNaN(anchor.getTime())) throw new Error('Invalid date');

  if (period === 'day') {
    const s = toDateStr(anchor);
    return { start: s, end: s, label: formatPretty(anchor) };
  }

  if (period === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last  = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return {
      start: toDateStr(first),
      end: toDateStr(last),
      label: first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  }

  // default: week (Monday–Sunday)
  const dow = anchor.getDay();
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - (dow === 0 ? 6 : dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: toDateStr(monday),
    end: toDateStr(sunday),
    label: `${formatPretty(monday)} – ${formatPretty(sunday)}`,
  };
}

function formatPretty(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── CSV helpers ──────────────────────────────────────────────────
function csvCell(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(arr) { return arr.map(csvCell).join(',') + '\r\n'; }

function round(n, dp = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10 ** dp) / 10 ** dp;
}
function avg(rows, key) {
  const vals = rows.map(r => Number(r[key])).filter(v => Number.isFinite(v) && v !== 0);
  if (!vals.length) return 0;
  return round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
function sum(rows, key) {
  return round(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));
}

// ── Data fetch ───────────────────────────────────────────────────
async function fetchRows(table, dateCol, start, end, userId) {
  const userClause = userId ? 'AND e.user_id = ?' : '';
  const params = userId ? [start, end, userId] : [start, end];
  const [rows] = await db.query(`
    SELECT e.*, u.name AS user_name
    FROM ${table} e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE e.${dateCol} BETWEEN ? AND ? ${userClause}
    ORDER BY e.${dateCol} ASC
  `, params);
  return rows;
}

// ── Per-sheet CSV sections ───────────────────────────────────────
function rfqSection(rows) {
  const lines = [];
  lines.push(csvRow(['RFQ TRACKER']));
  lines.push(csvRow(['Total RFQs', rows.length]));
  lines.push(csvRow(['Avg CPI (USD)', avg(rows, 'cpi_usd')]));
  lines.push(csvRow(['Avg LOI', avg(rows, 'loi')]));
  lines.push(csvRow(['Avg IR (%)', avg(rows, 'ir') * 100]));
  lines.push(csvRow(['Total Cost (USD)', sum(rows, 'total_cost')]));
  lines.push('\r\n');
  lines.push(csvRow([
    'SL No', 'Subject', 'Date', 'Client Contact Name', 'Client Name', 'Designation',
    'Email id', 'Industry', 'RFQ Sent by', 'Methodology', 'Target Audience', 'Market',
    'Sample Size', 'LOI', 'IR', 'CPI(USD)', 'Any Additional costs(USD)', 'Total Costs(USD)',
    'Quota sent by', 'Follow up', 'Comment', 'Executive',
  ]));
  rows.forEach(r => {
    lines.push(csvRow([
      r.sl_no, r.subject, fmtDate(r.entry_date), r.client_contact, r.client_name, r.designation,
      r.email, r.industry, r.rfq_sent_by, r.methodology, r.target_audience, r.market,
      r.sample_size, r.loi, r.ir, r.cpi_usd, r.additional_cost, r.total_cost,
      r.quota_sent_by, r.follow_up, r.comment, r.user_name,
    ]));
  });
  return lines.join('');
}

function clientSection(rows) {
  const introSent  = rows.filter(r => String(r.intro_mail_sent  || '').trim() !== '').length;
  const followedUp = rows.filter(r => String(r.follow_up_email || '').trim() !== '').length;
  const lines = [];
  lines.push(csvRow(['CLIENT DATABASE']));
  lines.push(csvRow(['Total New Clients', rows.length]));
  lines.push(csvRow(['Intro Mail Sent', introSent]));
  lines.push(csvRow(['Followed Up', followedUp]));
  lines.push(csvRow(['Pending Follow-up', rows.length - followedUp]));
  lines.push('\r\n');
  lines.push(csvRow([
    'Date', 'Company Name', 'Name', 'Email', 'Designation', 'Address', 'Phone number',
    'Intro mail sent from(Anusha)', 'Follow up email 1', 'Comments', 'Executive',
  ]));
  rows.forEach(r => {
    lines.push(csvRow([
      fmtDate(r.entry_date), r.company_name, r.name, r.email, r.designation, r.address, r.phone,
      r.intro_mail_sent, r.follow_up_email, r.comment, r.user_name,
    ]));
  });
  return lines.join('');
}

function projectSection(rows) {
  const lines = [];
  lines.push(csvRow(['PROJECT MIS']));
  lines.push(csvRow(['Total Projects', rows.length]));
  lines.push(csvRow(['Total Requested N', sum(rows, 'requested_n')]));
  lines.push(csvRow(['Total Achieved N', sum(rows, 'achieved_n')]));
  lines.push(csvRow(['Avg LOI', avg(rows, 'loi')]));
  lines.push(csvRow(['Avg IR (%)', avg(rows, 'ir') * 100]));
  lines.push(csvRow(['Avg CPI', avg(rows, 'cpi')]));
  lines.push(csvRow(['Total Cost', sum(rows, 'total')]));
  lines.push(csvRow(['Total Project Gross', sum(rows, 'project_gross')]));
  lines.push(csvRow(['Total Gross Margin', sum(rows, 'gross_margin')]));
  lines.push('\r\n');
  lines.push(csvRow([
    'Project code', 'Start date', 'Project Name', 'End date', 'Client Name', 'Client Contact PM',
    'Market', 'Target Audience', 'Methodology', 'Requested N', 'Achieved N', 'LOI', 'IR', 'CPI',
    'Any additional cost', 'Total', 'Project Status', 'Invoice Status', 'Comment',
    'Project Expenses', 'Project Gross', 'Amount', 'Gross Margin', 'Project Manager Name', 'Executive',
  ]));
  rows.forEach(r => {
    lines.push(csvRow([
      r.project_code, fmtDate(r.start_date), r.project_name, fmtDate(r.end_date), r.client_name,
      r.client_contact_pm, r.market, r.target_audience, r.methodology, r.requested_n, r.achieved_n,
      r.loi, r.ir, r.cpi, r.additional_cost, r.total, r.project_status, r.invoice_status, r.comment,
      r.project_expenses, r.project_gross, r.amount, r.gross_margin, r.project_manager, r.user_name,
    ]));
  });
  return lines.join('');
}

function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
}

// ── Public API ───────────────────────────────────────────────────
const SHEET_CONFIG = {
  rfq:     { table: 'rfq_entries',     dateCol: 'entry_date', section: rfqSection },
  client:  { table: 'client_entries',  dateCol: 'entry_date', section: clientSection },
  project: { table: 'project_entries', dateCol: 'start_date', section: projectSection },
};

/** Build a CSV report for a single sheet ('rfq' | 'client' | 'project'). */
async function buildSheetReport(sheetKey, period, anchorDate, userId) {
  const cfg = SHEET_CONFIG[sheetKey];
  if (!cfg) throw new Error(`Unknown sheet type: ${sheetKey}`);
  const range = getDateRange(period, anchorDate);
  const rows = await fetchRows(cfg.table, cfg.dateCol, range.start, range.end, userId);

  let csv = csvRow([`${sheetLabel(sheetKey)} REPORT — ${periodLabel(period)}: ${range.label}`]);
  csv += '\r\n';
  csv += cfg.section(rows);
  return { csv, range, rowCount: rows.length };
}

/** Build a single CSV combining all 3 sheets for the given period. */
async function buildConsolidatedReport(period, anchorDate, userId) {
  const range = getDateRange(period, anchorDate);
  const [rfqRows, clientRows, projectRows] = await Promise.all([
    fetchRows('rfq_entries',     'entry_date', range.start, range.end, userId),
    fetchRows('client_entries',  'entry_date', range.start, range.end, userId),
    fetchRows('project_entries', 'start_date', range.start, range.end, userId),
  ]);

  let csv = csvRow([`CONSOLIDATED REPORT — ${periodLabel(period)}: ${range.label}`]);
  csv += '\r\n\r\n';
  csv += rfqSection(rfqRows);
  csv += '\r\n\r\n';
  csv += clientSection(clientRows);
  csv += '\r\n\r\n';
  csv += projectSection(projectRows);

  return {
    csv,
    range,
    rowCount: rfqRows.length + clientRows.length + projectRows.length,
  };
}

function sheetLabel(key) {
  return { rfq: 'RFQ TRACKER', client: 'CLIENT DATABASE', project: 'PROJECT MIS' }[key] || key.toUpperCase();
}
function periodLabel(p) {
  return { day: 'Daily', week: 'Weekly', month: 'Monthly' }[p] || p;
}

module.exports = {
  getDateRange, buildSheetReport, buildConsolidatedReport,
  fetchRows, avg, sum, round, periodLabel, fmtDate,
};
