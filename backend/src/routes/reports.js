const express = require('express');
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { buildSheetReport, buildConsolidatedReport } = require('../services/reportGenerator');
const { buildConsolidatedReportDocx } = require('../services/reportDocxGenerator');

const router = express.Router();
router.use(verifyToken, requireAdmin);

const VALID_PERIODS = ['day', 'week', 'month'];
const VALID_SHEETS  = ['rfq', 'client', 'project'];

function parseQuery(req) {
  const period = VALID_PERIODS.includes(req.query.period) ? req.query.period : 'week';
  const date   = req.query.date || null; // anchor date, YYYY-MM-DD
  const userId = req.query.userId ? Number(req.query.userId) : null;
  return { period, date, userId };
}

function sendCsv(res, filenameBase, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  // BOM so Excel opens UTF-8 correctly
  res.send('\uFEFF' + csv);
}

function sendDocx(res, filenameBase, buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.docx"`);
  res.send(buffer);
}

// ── GET /api/reports/consolidated ───────────────────────────────
// Combined RFQ + Client + Project report for the given period, as a
// clean, branded Word document (was CSV — see /consolidated.csv for
// the old raw-data export if you still need it for spreadsheets).
router.get('/consolidated', async (req, res) => {
  try {
    const { period, date, userId } = parseQuery(req);
    let scopeName = null;
    if (userId) {
      const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
      scopeName = u?.name || null;
    }
    const { buffer, range } = await buildConsolidatedReportDocx(period, date, userId, scopeName);
    sendDocx(res, `consolidated-report-${period}-${range.start}_to_${range.end}`, buffer);
  } catch (e) {
    console.error('Consolidated docx report error:', e);
    res.status(400).json({ error: e.message || 'Failed to build consolidated report' });
  }
});

// ── GET /api/reports/consolidated.csv ─────────────────────────────
// Raw CSV version of the consolidated report, kept for anyone who
// needs to import the data into a spreadsheet.
router.get('/consolidated.csv', async (req, res) => {
  try {
    const { period, date, userId } = parseQuery(req);
    const { csv, range } = await buildConsolidatedReport(period, date, userId);
    sendCsv(res, `consolidated-report-${period}-${range.start}_to_${range.end}`, csv);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build consolidated report' });
  }
});

// ── GET /api/reports/:sheet ──────────────────────────────────────
// Single-sheet report: sheet = rfq | client | project
router.get('/:sheet', async (req, res) => {
  try {
    const sheet = req.params.sheet;
    if (!VALID_SHEETS.includes(sheet)) {
      return res.status(400).json({ error: `Invalid sheet type. Use one of: ${VALID_SHEETS.join(', ')}` });
    }
    const { period, date, userId } = parseQuery(req);
    const { csv, range } = await buildSheetReport(sheet, period, date, userId);
    sendCsv(res, `${sheet}-report-${period}-${range.start}_to_${range.end}`, csv);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Failed to build report' });
  }
});

module.exports = router;
