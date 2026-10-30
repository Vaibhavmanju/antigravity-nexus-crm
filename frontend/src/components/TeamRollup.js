import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const TREND_ICON = { up: '▲', down: '▼', flat: '▬' };
const TREND_COLOR = { up: '#00e87a', down: '#ff6b6b', flat: '#5a8a9f' };

export default function TeamRollup({ title = 'Team Rollup', onSelectMember = null, selectedId = null, onOpenPortal = null }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rollup = await api.getTeamRollup(period);
      setData(rollup);
    } catch (e) {
      setErr(e.message || 'Failed to load team rollup');
    }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 8, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['day', 'week', 'month'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? 'rgba(0,212,255,0.15)' : 'transparent',
                border: `1px solid ${period === p ? '#00d4ff' : 'rgba(0,212,255,0.2)'}`,
                color: period === p ? '#00d4ff' : '#5a8a9f',
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
        <div style={{ padding: 30, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>Loading team rollup…</div>
      ) : err ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#ff6b6b', fontSize: 12 }}>⚠ {err}</div>
      ) : !data || data.members.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>No team members found.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 12 }}>
            <span style={{ color: '#5a8a9f' }}>Team total: <b style={{ color: '#00d4ff' }}>{data.teamTotal}</b> / {data.teamTarget}</span>
            <span style={{ color: '#5a8a9f' }}>Team attainment: <b style={{ color: data.teamPct >= 100 ? '#00e87a' : data.teamPct >= 70 ? '#ff9f43' : '#ff6b6b' }}>{data.teamPct}%</b></span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(0,212,255,0.15)' }}>
                  {['Name', 'Dept', 'Total', 'Target', '% Goal', 'Trend', 'Streak', ...(onOpenPortal ? ['Portal'] : [])].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#5a8a9f', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.members.map(m => (
                  <tr
                    key={m.id}
                    onClick={onSelectMember ? () => onSelectMember(m) : undefined}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: onSelectMember ? 'pointer' : 'default',
                      background: selectedId === m.id ? 'rgba(0,212,255,0.06)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: '#e0f4ff' }}>
                      {m.name}
                      {onSelectMember && <span style={{ marginLeft: 8, fontSize: 10, color: '#00d4ff' }}>{selectedId === m.id ? '● viewing' : '→'}</span>}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#5a8a9f' }}>{m.department}</td>
                    <td style={{ padding: '8px 10px', color: '#e0f4ff', fontFamily: "'Orbitron', monospace" }}>{m.total}</td>
                    <td style={{ padding: '8px 10px', color: '#5a8a9f' }}>{m.target}</td>
                    <td style={{ padding: '8px 10px', color: m.pctToGoal >= 100 ? '#00e87a' : m.pctToGoal >= 70 ? '#ff9f43' : '#ff6b6b', fontWeight: 600 }}>{m.pctToGoal}%</td>
                    <td style={{ padding: '8px 10px', color: TREND_COLOR[m.trend] }}>{TREND_ICON[m.trend]} {Math.abs(m.trendPct)}%</td>
                    <td style={{ padding: '8px 10px', color: '#7b2fff' }}>{m.currentStreak}d <span style={{ color: '#3a6070' }}>(best {m.bestStreak}d)</span></td>
                    {onOpenPortal && (
                      <td style={{ padding: '8px 10px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenPortal(m); }}
                          style={{ background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.35)', color: '#00e87a', fontSize: 10, padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Exo 2', sans-serif", whiteSpace: 'nowrap' }}
                        >Open Portal →</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
