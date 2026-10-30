/**
 * Power BI Embedded integration (Path A from the roadmap discussion).
 *
 * Flow:
 *  1. Get an Azure AD app-only access token via the client-credentials
 *     grant (POWERBI_TENANT_ID / POWERBI_CLIENT_ID / POWERBI_CLIENT_SECRET).
 *  2. Call the Power BI REST API's GenerateToken endpoint for the
 *     configured report, passing a Row-Level-Security identity so each
 *     employee only ever sees their own rows (admins see everything).
 *
 * Nothing here requires a new npm dependency — Node 18+ has a global
 * `fetch`. If the Power BI env vars aren't set, isConfigured() returns
 * false and routes/powerbi.js responds with a friendly "not configured"
 * message instead of throwing.
 */

const AAD_TOKEN_URL = (tenantId) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const POWERBI_API = 'https://api.powerbi.com/v1.0/myorg';

function isConfigured() {
  return Boolean(
    process.env.POWERBI_TENANT_ID &&
    process.env.POWERBI_CLIENT_ID &&
    process.env.POWERBI_CLIENT_SECRET &&
    process.env.POWERBI_WORKSPACE_ID &&
    process.env.POWERBI_REPORT_ID
  );
}

let cachedAadToken = null; // { token, expiresAt }

async function getAadToken() {
  if (cachedAadToken && cachedAadToken.expiresAt > Date.now() + 30000) {
    return cachedAadToken.token;
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.POWERBI_CLIENT_ID,
    client_secret: process.env.POWERBI_CLIENT_SECRET,
    scope: 'https://analysis.windows.net/powerbi/api/.default',
  });

  const resp = await fetch(AAD_TOKEN_URL(process.env.POWERBI_TENANT_ID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Azure AD token request failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  cachedAadToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedAadToken.token;
}

async function getReportMeta() {
  const token = await getAadToken();
  const url = `${POWERBI_API}/groups/${process.env.POWERBI_WORKSPACE_ID}/reports/${process.env.POWERBI_REPORT_ID}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to fetch report metadata (${resp.status}): ${text.slice(0, 300)}`);
  }
  return resp.json();
}

/**
 * Generates an embed token scoped to a single user via RLS. `identity`
 * should be the employee's email (or 'admin' for the unrestricted role)
 * matching whatever RLS role/username scheme the .pbix was published with
 * (e.g. a role called "Employee" filtering `users[email] = USERNAME()`).
 */
async function getEmbedToken({ identity, isAdmin }) {
  if (!isConfigured()) {
    throw new Error('Power BI is not configured on this server yet.');
  }
  const token = await getAadToken();
  const datasetId = process.env.POWERBI_DATASET_ID || undefined;

  const genUrl = `${POWERBI_API}/groups/${process.env.POWERBI_WORKSPACE_ID}/reports/${process.env.POWERBI_REPORT_ID}/GenerateToken`;

  const payload = {
    accessLevel: 'View',
  };
  if (!isAdmin) {
    payload.identities = [
      {
        username: identity,
        roles: ['Employee'],
        datasets: datasetId ? [datasetId] : undefined,
      },
    ];
  }

  const resp = await fetch(genUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`GenerateToken failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const meta = await getReportMeta();

  return {
    embedToken: data.token,
    expiration: data.expiration,
    embedUrl: meta.embedUrl,
    reportId: process.env.POWERBI_REPORT_ID,
  };
}

module.exports = { isConfigured, getEmbedToken };
