const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType, PageBreak,
} = require('docx');
const { getDateRange, fetchRows, avg, sum, periodLabel, fmtDate } = require('./reportGenerator');

const BRAND = '0050CC';
const ACCENT = '00B8E0';
const INK = '1A2733';
const MUTED = '5A6B78';
const MAX_ROWS_PER_SECTION = 300; // keeps the .docx clean & fast to open; full data stays in CSV export

function heading(text, color = BRAND) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color, size: 26 })],
  });
}

function subtitle(text) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, italics: true, color: MUTED, size: 20 })],
  });
}

function cellText(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({ text: text === null || text === undefined ? '' : String(text), bold: !!opts.bold, color: opts.color || INK, size: 16 })],
  });
}

function headerCell(text) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: BRAND },
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [cellText(text, { bold: true, color: 'FFFFFF' })],
  });
}

function dataCell(text, shaded = false) {
  return new TableCell({
    shading: shaded ? { type: ShadingType.CLEAR, fill: 'F2F8FC' } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [cellText(text)],
  });
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'D5E3EC' };
const TABLE_BORDERS = {
  top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER,
  insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
};

function dataTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(headerCell) }),
      ...rows.map((r, i) => new TableRow({ children: r.map(c => dataCell(c, i % 2 === 1)) })),
    ],
  });
}

/** Small 2-column KPI summary table. */
function kpiTable(pairs) {
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: pairs.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: 'EAF6FF' },
          margins: { top: 60, bottom: 60, left: 100, right: 80 },
          children: [cellText(label, { bold: true, color: MUTED })],
        }),
        new TableCell({
          margins: { top: 60, bottom: 60, left: 100, right: 80 },
          children: [cellText(value, { bold: true, color: BRAND })],
        }),
      ],
    })),
  });
}

function spacer(size = 160) {
  return new Paragraph({ spacing: { after: size }, children: [] });
}

function capNote(total) {
  if (total <= MAX_ROWS_PER_SECTION) return null;
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [new TextRun({
      text: `Showing the first ${MAX_ROWS_PER_SECTION} of ${total} rows. Use the CSV export for the complete dataset.`,
      italics: true, color: MUTED, size: 16,
    })],
  });
}

// ── Section builders ────────────────────────────────────────────
function rfqSectionDocx(rows) {
  const kpis = kpiTable([
    ['Total RFQs', String(rows.length)],
    ['Avg CPI (USD)', String(avg(rows, 'cpi_usd'))],
    ['Avg LOI', String(avg(rows, 'loi'))],
    ['Avg IR (%)', String(Math.round(avg(rows, 'ir') * 10000) / 100)],
    ['Total Cost (USD)', String(sum(rows, 'total_cost'))],
  ]);
  const headers = ['Date', 'Client', 'Contact', 'Market', 'Methodology', 'Sample', 'LOI', 'IR', 'CPI', 'Total Cost', 'Executive'];
  const body = rows.slice(0, MAX_ROWS_PER_SECTION).map(r => [
    fmtDate(r.entry_date), r.client_name, r.client_contact, r.market, r.methodology,
    r.sample_size, r.loi, r.ir, r.cpi_usd, r.total_cost, r.user_name,
  ]);
  return [heading('RFQ Tracker', ACCENT), kpis, spacer(), dataTable(headers, body), capNote(rows.length)].filter(Boolean);
}

function clientSectionDocx(rows) {
  const followedUp = rows.filter(r => String(r.follow_up_email || '').trim() !== '').length;
  const kpis = kpiTable([
    ['Total New Clients', String(rows.length)],
    ['Followed Up', String(followedUp)],
    ['Pending Follow-up', String(rows.length - followedUp)],
  ]);
  const headers = ['Date', 'Company', 'Contact Name', 'Email', 'Designation', 'Phone', 'Executive'];
  const body = rows.slice(0, MAX_ROWS_PER_SECTION).map(r => [
    fmtDate(r.entry_date), r.company_name, r.name, r.email, r.designation, r.phone, r.user_name,
  ]);
  return [heading('Client Database', ACCENT), kpis, spacer(), dataTable(headers, body), capNote(rows.length)].filter(Boolean);
}

function projectSectionDocx(rows) {
  const kpis = kpiTable([
    ['Total Projects', String(rows.length)],
    ['Total Requested N', String(sum(rows, 'requested_n'))],
    ['Total Achieved N', String(sum(rows, 'achieved_n'))],
    ['Avg IR (%)', String(Math.round(avg(rows, 'ir') * 10000) / 100)],
    ['Total Cost', String(sum(rows, 'total'))],
    ['Total Gross Margin', String(sum(rows, 'gross_margin'))],
  ]);
  const headers = ['Start Date', 'Project', 'Client', 'Market', 'Methodology', 'Achieved N', 'Status', 'Invoice', 'Total', 'PM'];
  const body = rows.slice(0, MAX_ROWS_PER_SECTION).map(r => [
    fmtDate(r.start_date), r.project_name, r.client_name, r.market, r.methodology,
    r.achieved_n, r.project_status, r.invoice_status, r.total, r.project_manager,
  ]);
  return [heading('Project MIS', ACCENT), kpis, spacer(), dataTable(headers, body), capNote(rows.length)].filter(Boolean);
}

/**
 * Builds a clean, branded .docx buffer combining RFQ + Client + Project
 * data for the given period — the Word replacement for the old
 * consolidated CSV export.
 */
async function buildConsolidatedReportDocx(period, anchorDate, userId, scopeName = null) {
  const range = getDateRange(period, anchorDate);
  const [rfqRows, clientRows, projectRows] = await Promise.all([
    fetchRows('rfq_entries',     'entry_date', range.start, range.end, userId),
    fetchRows('client_entries',  'entry_date', range.start, range.end, userId),
    fetchRows('project_entries', 'start_date', range.start, range.end, userId),
  ]);

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: 'ANTIGRAVITY NEXUS CRM', bold: true, color: BRAND, size: 20 })],
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: 'Consolidated Performance Report', bold: true, color: INK, size: 40 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({
        text: `${periodLabel(period)} · ${range.label}${scopeName ? ` · ${scopeName}` : ' · All Employees'}`,
        color: MUTED, size: 20,
      })],
    }),
    ...rfqSectionDocx(rfqRows),
    new Paragraph({ children: [new PageBreak()] }),
    ...clientSectionDocx(clientRows),
    new Paragraph({ children: [new PageBreak()] }),
    ...projectSectionDocx(projectRows),
    spacer(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${new Date().toLocaleString()} · Antigravity Nexus CRM`, italics: true, color: MUTED, size: 14 })],
    }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, range, rowCount: rfqRows.length + clientRows.length + projectRows.length };
}

module.exports = { buildConsolidatedReportDocx };
