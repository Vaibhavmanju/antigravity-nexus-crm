import React, { useState, useEffect, useCallback } from 'react';
import { PowerBIEmbed } from 'powerbi-client-react';
import { models } from 'powerbi-client';
import api from '../services/api';

/**
 * Embeds the org's Power BI report. Admins see the unrestricted report;
 * employees get a Row-Level-Security-scoped embed token (see
 * backend/src/services/powerbiService.js) so they only ever see their
 * own rows — enforced server-side by Power BI itself.
 */
export default function PowerBIPanel() {
  const [status, setStatus] = useState('checking'); // checking | not-configured | loading | ready | error
  const [embed, setEmbed] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setStatus('checking');
    try {
      const s = await api.getPowerBiStatus();
      if (!s.configured) {
        setStatus('not-configured');
        return;
      }
      setStatus('loading');
      const token = await api.getPowerBiEmbedToken();
      setEmbed(token);
      setStatus('ready');
    } catch (e) {
      setErr(e.message || 'Failed to load Power BI report');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === 'checking' || status === 'loading') {
    return (
      <Panel>
        <div style={{ padding: 60, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>⟳ Loading Power BI report…</div>
      </Panel>
    );
  }

  if (status === 'not-configured') {
    return (
      <Panel>
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📊</div>
          <div style={{ fontSize: 13, color: '#e0f4ff', marginBottom: 8, fontWeight: 600 }}>Power BI isn't connected yet</div>
          <div style={{ fontSize: 11, color: '#5a8a9f', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
            An admin needs to register an Azure AD app, publish a report to a Power BI workspace
            connected to this MySQL database, and fill in the <code>POWERBI_*</code> variables in
            <code> backend/.env</code>. See the README's "Power BI Analytics" section for the full setup guide.
          </div>
        </div>
      </Panel>
    );
  }

  if (status === 'error') {
    return (
      <Panel>
        <div style={{ padding: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#ff6b6b', marginBottom: 10 }}>⚠ {err}</div>
          <button onClick={load} style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', fontSize: 11, padding: '6px 16px', borderRadius: 4, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div style={{ height: 640, borderRadius: 6, overflow: 'hidden' }}>
        <PowerBIEmbed
          embedConfig={{
            type: 'report',
            id: embed.reportId,
            embedUrl: embed.embedUrl,
            accessToken: embed.embedToken,
            tokenType: models.TokenType.Embed,
            settings: {
              panes: { filters: { visible: false }, pageNavigation: { visible: true } },
              background: models.BackgroundType.Transparent,
            },
          }}
          cssClassName="powerbi-embed-frame"
          getEmbeddedComponent={() => {}}
        />
      </div>
    </Panel>
  );
}

function Panel({ children }) {
  return (
    <div style={{
      background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.12)',
      borderRadius: 8, padding: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
        Power BI Insights
      </div>
      {children}
    </div>
  );
}
