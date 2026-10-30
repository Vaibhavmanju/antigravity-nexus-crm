import React, { useState } from 'react';
import api from '../services/api';

/**
 * sheet: 'rfq' | 'client' | 'project' | 'consolidated'
 * anchorDate: YYYY-MM-DD used to resolve the day/week/month window (defaults to today)
 * userId: optional — restrict the report to one user
 * accentColor: theme color for the control
 * label: button label override
 */
export default function ReportDownloader({ sheet, anchorDate = null, userId = null, accentColor = '#00d4ff', label = 'Download Report' }) {
  const [period, setPeriod] = useState('week');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const download = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.downloadReport(sheet, period, { date: anchorDate, userId });
    } catch (e) {
      setErr(e.message || 'Download failed');
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <select
        value={period}
        onChange={e => setPeriod(e.target.value)}
        style={{
          background: `${accentColor}12`, border: `1px solid ${accentColor}40`,
          color: accentColor, fontSize: 11, padding: '6px 8px', borderRadius: 4,
          outline: 'none', fontFamily: "'Exo 2',sans-serif", cursor: 'pointer',
        }}
      >
        <option value="day">Daily</option>
        <option value="week">Weekly</option>
        <option value="month">Monthly</option>
      </select>
      <button
        onClick={download}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: `${accentColor}15`, border: `1px solid ${accentColor}45`,
          color: accentColor, fontSize: 11, padding: '6px 14px', borderRadius: 4,
          cursor: busy ? 'not-allowed' : 'pointer', fontFamily: "'Exo 2', sans-serif",
        }}
      >
        {busy ? '⟳ Preparing…' : `⬇ ${label}`}
      </button>
      {err && <span style={{ fontSize: 10, color: '#ff6b6b' }}>⚠ {err}</span>}
    </div>
  );
}
