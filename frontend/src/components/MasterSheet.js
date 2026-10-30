import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#00d4ff', '#7b2fff', '#00e87a', '#ff9f43'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MasterSheet() {
  const { users, masterSheetLink, setMasterSheetLink, sheetData, fetchAllSheetData } = useAuth();
  const [editingLink, setEditingLink] = useState(false);
  const [linkVal, setLinkVal] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Auto-fetch all sheets on first mount. fetchAllSheetData() re-throws on
  // failure so per-user callers can react to it — here there's nothing
  // extra to do (each user's own error already lands in sheetData[id].error
  // and renders inline), so it must be caught or a single bad sheet link
  // anywhere in the org would crash this page with an unhandled rejection.
  useEffect(() => {
    fetchAllSheetData().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await fetchAllSheetData();
    } catch {
      // per-user errors already shown inline via sheetData[id].error
    }
    setRefreshing(false);
  };

  // For each user, resolve the best daily data: sheet-fetched if available, else stored
  const resolvedUsers = users.map(u => {
    const sd = sheetData[u.id];
    const hasFetchedData = sd && !sd.loading && !sd.error && sd.dailyData && sd.dailyData.some(v => v > 0);
    return {
      ...u,
      dailyData: hasFetchedData ? sd.dailyData : u.dailyData,
      achieved: (sd && sd.achieved != null && !sd.loading && !sd.error) ? sd.achieved : u.achieved,
    };
  });

  // Combined bar chart: sum all users per day
  const totalData = DAYS.map((day, i) => ({
    day,
    total: resolvedUsers.reduce((s, u) => s + (u.dailyData[i] || 0), 0),
  }));

  // Dept pie: total achieved per department
  const deptMap = {};
  resolvedUsers.forEach(u => {
    deptMap[u.department] = (deptMap[u.department] || 0) + u.achieved;
  });
  const deptData = Object.entries(deptMap).map(([name, value]) => ({ name, value }));

  // Role pie: total achieved per role
  const roleMap = {};
  resolvedUsers.forEach(u => {
    roleMap[u.role] = (roleMap[u.role] || 0) + u.achieved;
  });
  const roleData = Object.entries(roleMap).map(([name, value]) => ({ name, value }));

  const anyLoading = users.some(u => sheetData[u.id]?.loading);
  const anyError = users.some(u => sheetData[u.id]?.error);
  const anyFetched = users.some(u => sheetData[u.id]?.lastFetched);

  const saveLink = () => { setMasterSheetLink(linkVal); setEditingLink(false); };
  const startEdit = () => { setLinkVal(masterSheetLink); setEditingLink(true); };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">Master Sheet</h1>
            <p className="page-sub">Consolidated view of all users and performance data</p>
          </div>
          <button
            className="btn-refresh-all"
            onClick={handleRefreshAll}
            disabled={refreshing || anyLoading}
          >
            {(refreshing || anyLoading) ? '⟳ Refreshing…' : '⟳ Refresh All Sheets'}
          </button>
        </div>

        {/* Sheet sync status */}
        <div className="sync-status-row">
          {anyLoading && <span className="sync-badge loading">⟳ Fetching sheet data for all users…</span>}
          {!anyLoading && anyError && <span className="sync-badge warn">⚠ Some sheets could not be loaded — showing stored data for those users</span>}
          {!anyLoading && !anyError && anyFetched && (
            <span className="sync-badge ok">
              ✓ Live data — {users.filter(u => sheetData[u.id]?.lastFetched).map(u => {
                const sd = sheetData[u.id];
                return `${u.name.split(' ')[0]}: ${sd.rowCount || 0} rows`;
              }).join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* Master Sheet Link */}
      <div className="ms-link-card">
        <div className="ms-link-head">
          <span className="ms-icon">▦</span>
          <span className="ms-title">Master Google Spreadsheet</span>
        </div>
        {masterSheetLink && !editingLink ? (
          <div className="ms-linked">
            <div className="ms-url">{masterSheetLink}</div>
            <div className="ms-btns">
              <a href={masterSheetLink} target="_blank" rel="noopener noreferrer" className="btn-open">Open Master Sheet ↗</a>
              <button onClick={startEdit} className="btn-edit-link">Change Link</button>
            </div>
          </div>
        ) : editingLink ? (
          <div className="ms-edit">
            <input className="link-input" value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            <div className="ms-btns">
              <button onClick={saveLink} className="btn-open">Save</button>
              <button onClick={() => setEditingLink(false)} className="btn-edit-link">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="ms-empty">
            <p>No master spreadsheet linked yet. Add a consolidated Google Sheet for your entire team.</p>
            <button onClick={startEdit} className="btn-open">+ Add Master Google Sheet Link</button>
          </div>
        )}
      </div>

      {/* Summary Table */}
      <div className="table-card" style={{ marginBottom: 20 }}>
        <div className="table-head-title">All Users Summary</div>
        <table className="data-table">
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Department', 'Status', 'Target', 'Achieved', 'Completion', 'Sheet'].map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {resolvedUsers.map(u => {
              const pct = Math.round((u.achieved / u.weeklyTarget) * 100);
              const sd = sheetData[u.id];
              return (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="u-av">{u.name[0]}</div>
                      {u.name}
                      {sd?.lastFetched && !sd.loading && !sd.error && (
                        <span className="live-dot" title="Live data from sheet">●</span>
                      )}
                    </div>
                  </td>
                  <td className="dim">{u.email}</td>
                  <td><span className="tag-blue">{u.role}</span></td>
                  <td className="dim">{u.department}</td>
                  <td><span className={`status-badge ${u.status === 'Active' ? 'active' : 'inactive'}`}>{u.status}</span></td>
                  <td className="num">{u.weeklyTarget}</td>
                  <td className="num">
                    {sd?.loading ? <span className="dim">…</span> : u.achieved}
                  </td>
                  <td>
                    <div className="prog-row">
                      <div className="prog-bar"><div className="prog-fill" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#00e87a' : '#00d4ff' }} /></div>
                      <span className="prog-pct" style={{ color: pct >= 100 ? '#00e87a' : '#00d4ff' }}>{pct}%</span>
                    </div>
                  </td>
                  <td>
                    {u.googleSheetLink
                      ? <a href={u.googleSheetLink} target="_blank" rel="noopener noreferrer" className="sheet-link-sm">Open ↗</a>
                      : <span className="dim">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="charts-3">
        <div className="chart-card">
          <div className="chart-title">
            Combined Daily Performance
            {anyFetched && !anyLoading && <span className="chart-source"> · live</span>}
          </div>
          {anyLoading ? (
            <div className="chart-loading">⟳ Loading sheet data…</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={totalData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <XAxis dataKey="day" tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} cursor={{ fill: 'rgba(0,212,255,0.05)' }} />
                <Bar dataKey="total" fill="url(#mg1)" radius={[3, 3, 0, 0]} />
                <defs>
                  <linearGradient id="mg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d4ff" /><stop offset="100%" stopColor="#0050cc" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">
            By Department
            <span className="chart-sub"> (achieved)</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={deptData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value">
                {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} formatter={(v) => [v, 'Achieved']} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, color: '#5a8a9f' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-title">
            By Role
            <span className="chart-sub"> (achieved)</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={roleData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value">
                {roleData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} formatter={(v) => [v, 'Achieved']} />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, color: '#5a8a9f' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <style>{msStyles}</style>
    </div>
  );
}

const msStyles = `
  .page-header { margin-bottom: 24px; }
  .page-title { font-family: 'Orbitron', monospace; font-size: 24px; font-weight: 700; color: #e0f4ff; margin-bottom: 4px; }
  .page-sub { font-size: 13px; color: #5a8a9f; }
  .btn-refresh-all { background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; border-radius: 4px; padding: 8px 16px; font-size: 12px; cursor: pointer; font-family: 'Exo 2', sans-serif; transition: background 0.2s; white-space: nowrap; }
  .btn-refresh-all:hover:not(:disabled) { background: rgba(0,212,255,0.15); }
  .btn-refresh-all:disabled { opacity: 0.5; cursor: default; }
  .sync-status-row { margin-top: 8px; }
  .sync-badge { display: inline-block; font-size: 11px; padding: 5px 10px; border-radius: 4px; }
  .sync-badge.loading { color: #00d4ff; background: rgba(0,212,255,0.05); }
  .sync-badge.warn { color: #ff9f43; background: rgba(255,159,67,0.08); border: 1px solid rgba(255,159,67,0.2); }
  .sync-badge.ok { color: #00e87a; background: rgba(0,232,122,0.05); }
  .ms-link-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.15); border-radius: 8px; padding: 24px; margin-bottom: 20px; }
  .ms-link-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .ms-icon { font-size: 20px; color: #00d4ff; }
  .ms-title { font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .ms-linked, .ms-edit, .ms-empty { display: flex; flex-direction: column; gap: 12px; }
  .ms-url { font-size: 12px; color: #5a8a9f; word-break: break-all; background: rgba(0,212,255,0.04); padding: 10px; border-radius: 4px; border: 1px solid rgba(0,212,255,0.1); }
  .ms-btns { display: flex; gap: 10px; }
  .btn-open { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: linear-gradient(135deg, #00b8e0, #0050cc); border: none; color: #fff; font-family: 'Exo 2', sans-serif; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block; }
  .btn-edit-link { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid rgba(224,244,255,0.15); color: #8ab4c8; font-family: 'Exo 2', sans-serif; font-size: 12px; }
  .link-input { width: 100%; padding: 10px 12px; background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.15); border-radius: 4px; color: #e0f4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .ms-empty p { font-size: 13px; color: #5a8a9f; }
  .table-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; overflow: auto; }
  .table-head-title { padding: 16px 20px 0; font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .data-table { width: 100%; border-collapse: collapse; min-width: 860px; }
  .data-table th { text-align: left; font-size: 10px; font-weight: 600; color: #3a6070; letter-spacing: 2px; text-transform: uppercase; padding: 12px 16px; border-bottom: 1px solid rgba(0,212,255,0.08); }
  .data-table td { padding: 11px 16px; border-bottom: 1px solid rgba(0,212,255,0.04); font-size: 13px; color: #a0c8d8; vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: none; }
  .user-cell { display: flex; align-items: center; gap: 8px; }
  .u-av { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #0050cc); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .live-dot { color: #00e87a; font-size: 8px; }
  .dim { color: #5a8a9f !important; }
  .num { font-family: 'Orbitron', monospace; font-size: 12px; color: #e0f4ff; }
  .tag-blue { padding: 2px 8px; border-radius: 2px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; }
  .status-badge { padding: 2px 8px; border-radius: 2px; font-size: 11px; }
  .status-badge.active { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); color: #00e87a; }
  .status-badge.inactive { background: rgba(255,100,100,0.08); border: 1px solid rgba(255,100,100,0.2); color: #ff6b6b; }
  .prog-row { display: flex; align-items: center; gap: 8px; }
  .prog-bar { flex: 1; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
  .prog-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .prog-pct { font-size: 11px; font-family: 'Orbitron', monospace; min-width: 32px; }
  .sheet-link-sm { color: #00d4ff; font-size: 12px; text-decoration: none; }
  .sheet-link-sm:hover { text-decoration: underline; }
  .charts-3 { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 16px; }
  .chart-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 20px; }
  .chart-title { font-size: 11px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
  .chart-source { font-size: 9px; color: #00e87a; letter-spacing: 1px; font-weight: 400; }
  .chart-sub { font-size: 9px; color: #3a6070; letter-spacing: 1px; font-weight: 400; }
  .chart-loading { color: #00d4ff; font-size: 13px; padding: 70px 0; text-align: center; }
`;
