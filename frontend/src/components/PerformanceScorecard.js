import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, Tooltip,
} from 'recharts';
import api from '../services/api';

const ACCENT = '#00d4ff';

function TrendBadge({ trend, trendPct }) {
  const cfg = {
    up:   { icon: '▲', color: '#00e87a' },
    down: { icon: '▼', color: '#ff6b6b' },
    flat: { icon: '▬', color: '#5a8a9f' },
  }[trend] || { icon: '▬', color: '#5a8a9f' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: cfg.color, fontSize: 12, fontWeight: 600 }}>
      {cfg.icon} {Math.abs(trendPct)}%
    </span>
  );
}

function Kpi({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'rgba(10,18,32,0.7)', border: '1px solid rgba(0,212,255,0.1)',
      borderRadius: 6, padding: '14px 16px', textAlign: 'center', flex: 1, minWidth: 110,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || ACCENT, fontFamily: "'Orbitron', monospace", marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: '#5a8a9f', letterSpacing: 1.5, textTransform: 'uppercase' }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#3a6070', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/**
 * userId: null → the logged-in employee's own scorecard (/analytics/me/scorecard)
 *         number → an admin/team-lead viewing someone else's scorecard
 */
export default function PerformanceScorecard({ userId = null, title = 'Performance Scorecard' }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const card = userId ? await api.getUserScorecard(userId, period) : await api.getMyScorecard(period);
      setData(card);
    } catch (e) {
      setErr(e.message || 'Failed to load scorecard');
    }
    setLoading(false);
  }, [userId, period]);

  useEffect(() => { load(); }, [load]);

  const goalColor = data && data.pctToGoal >= 100 ? '#00e87a' : data && data.pctToGoal >= 70 ? '#ff9f43' : '#ff6b6b';

  return (
    <div style={{
      background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.12)',
      borderRadius: 8, padding: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['day', 'week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? `${ACCENT}22` : 'transparent',
                border: `1px solid ${period === p ? ACCENT : 'rgba(0,212,255,0.2)'}`,
                color: period === p ? ACCENT : '#5a8a9f',
                fontSize: 10, padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                textTransform: 'capitalize', fontFamily: "'Exo 2', sans-serif",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>Loading scorecard…</div>
      ) : err ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#ff6b6b', fontSize: 12 }}>⚠ {err}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Kpi label="Total" value={data.total} sub={`Target: ${data.target}`} />
            <Kpi label="Goal Attainment" value={`${data.pctToGoal}%`} color={goalColor} />
            <Kpi label="Vs Previous" value={<TrendBadge trend={data.trend} trendPct={data.trendPct} />} />
            <Kpi label="Current Streak" value={`${data.currentStreak}d`} color="#7b2fff" />
            <Kpi label="Best Streak" value={`${data.bestStreak}d`} color="#9b59ff" />
          </div>

          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.history}>
                <defs>
                  <linearGradient id="scAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <Tooltip
                  contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff', fontSize: 11 }}
                  labelFormatter={(l) => l}
                />
                <Area type="monotone" dataKey="value" stroke={ACCENT} fill="url(#scAreaFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: '#3a6070', marginTop: 6, textAlign: 'right' }}>
            14-day trend · {data.range.start} → {data.range.end}
          </div>
        </>
      )}
    </div>
  );
}
