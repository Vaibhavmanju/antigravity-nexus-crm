import React, { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../services/api';

const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
];

function fmtTick(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  return days > 30
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/**
 * Historical performance graph for one user, sourced from the same
 * `daily_performance` data their own "Update My Performance" entries
 * (or linked-sheet sync) write into — reflected here in the admin panel.
 */
export default function PerformanceHistoryGraph({ userId }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.getUserPerformanceHistory(userId, days);
      setData(res);
    } catch (e) {
      setErr(e.message || 'Failed to load performance history');
    }
    setLoading(false);
  }, [userId, days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div className="chart-title" style={{ marginBottom: 0 }}>
          Performance History <span className="chart-source"> · self-reported by user</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGE_OPTIONS.map(o => (
            <button
              key={o.days}
              onClick={() => setDays(o.days)}
              style={{
                background: days === o.days ? 'rgba(0,212,255,0.15)' : 'transparent',
                border: `1px solid ${days === o.days ? '#00d4ff' : 'rgba(0,212,255,0.2)'}`,
                color: days === o.days ? '#00d4ff' : '#5a8a9f',
                fontSize: 10, padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontFamily: "'Exo 2', sans-serif",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="chart-loading">⟳ Loading performance history…</div>
      ) : err ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#ff6b6b', fontSize: 12 }}>⚠ {err}</div>
      ) : !data || data.activeDays === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#5a8a9f', fontSize: 12 }}>
          No self-reported performance entries in the last {days} days yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <Stat label="Total" value={data.total} color="#00d4ff" />
            <Stat label="Avg / Active Day" value={data.avgPerActiveDay} color="#00e87a" />
            <Stat label="Best Day" value={data.bestDay} color="#7b2fff" />
            <Stat label="Active Days" value={`${data.activeDays}/${data.days}`} color="#ff9f43" />
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.series} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="perfHistGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={d => fmtTick(d, days)}
                tick={{ fill: '#5a8a9f', fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval={days > 30 ? Math.floor(days / 10) : 0}
              />
              <YAxis tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }}
                labelFormatter={d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
              />
              <Area type="monotone" dataKey="value" stroke="#00d4ff" strokeWidth={2} fill="url(#perfHistGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'Orbitron', monospace" }}>{value}</div>
      <div style={{ fontSize: 9, color: '#5a8a9f', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}
