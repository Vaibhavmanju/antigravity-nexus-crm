let nodemailer;
try {
  // Optional dependency — only required if SMTP_HOST is set.
  // eslint-disable-next-line global-require
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function isEmailConfigured() {
  return Boolean(nodemailer && process.env.SMTP_HOST);
}

let transporter = null;
function getTransporter() {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

/**
 * Sends an email. Silently no-ops (with a console log) if SMTP isn't
 * configured, so the rest of the app never breaks in a demo/dev setup
 * without mail credentials.
 */
async function sendMail({ to, subject, text, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    console.log(`✉️   [email disabled] Would have sent "${subject}" to ${to}`);
    return { sent: false, reason: 'SMTP not configured' };
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || 'Antigravity Nexus CRM <no-reply@nexus-crm.local>',
    to,
    subject,
    text,
    html,
    attachments,
  });
  return { sent: true };
}

module.exports = { sendMail, isEmailConfigured };
