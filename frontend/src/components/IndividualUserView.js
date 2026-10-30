import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';
import PerformanceHistoryGraph from './PerformanceHistoryGraph';
import api from '../services/api';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SHEET_TYPES = [
  { key: 'rfqSheetLink',     label: 'RFQ Tracker — Page 1',      hint: 'Headers: SL No, Subject, Start Date, Client Name, Industry, Methodology, Market, CPI(USD)…', sync: (id) => api.syncRfqSheet(id) },
  { key: 'clientSheetLink',  label: 'Client Database — Page 2',  hint: 'Headers: Date, Company Name, Name, Email, Designation, Phone, Intro mail sent, Follow up…', sync: (id) => api.syncClientSheet(id) },
  { key: 'projectSheetLink', label: 'Project Tracker — Page 3',  hint: 'Headers: Project code, Start date, Project Name, Client Name, Market, Methodology, CPI…', sync: (id) => api.syncUserSheet(id) },
];

/**
 * One RFQ / Client / Project sheet-link row: its own edit box and its own
 * sync button. Each sheet type is synced with the matching endpoint, so
 * pasting (say) a Client Database link here can never be mistaken for a
 * Project Tracker link the way the old single "Google Spreadsheet" field
 * was. A sync failure is caught and shown inline — it never crashes the page.
 */
function SheetLinkRow({ type, user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(user[type.key] || '');
  const [status, setStatus] = useState({ state: 'idle', text: '' });

  const link = user[type.key];

  const save = async () => {
    await updateUser(user.id, { [type.key]: val });
    setEditing(false);
    if (val && val.trim()) doSync(true);
  };

  const doSync = async (silent = false) => {
    if (!silent) setStatus({ state: 'loading', text: 'Syncing…' });
    else setStatus({ state: 'loading', text: 'Syncing newly saved link…' });
    try {
      const r = await type.sync(user.id);
      setStatus({ state: 'ok', text: `✓ Synced ${r.total ?? r.inserted ?? ''} rows` });
    } catch (err) {
      // Caught here — a bad/mismatched sheet link shows as an inline
      // message instead of crashing the page.
      setStatus({ state: 'error', text: err.message || 'Sync failed' });
    }
  };

  return (
    <div className="sheet-type-row">
      <div className="sheet-type-head">
        <span className="sheet-type-label">{type.label}</span>
        {link && (
          <button className="btn-refresh" onClick={() => doSync(false)} disabled={status.state === 'loading'}>
            {status.state === 'loading' ? '⟳ Syncing…' : '⟳ Sync'}
          </button>
        )}
      </div>
      {status.state !== 'idle' && (
        <div className={`sheet-status ${status.state === 'error' ? 'error' : status.state === 'ok' ? 'ok' : 'loading'}`}>
          {status.state === 'error' ? `⚠ ${status.text}` : status.text}
        </div>
      )}
      {link && !editing ? (
        <div className="sheet-linked">
          <div className="sheet-url">{link}</div>
          <div className="sheet-btns">
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn-open">Open ↗</a>
            <button onClick={() => { setVal(link); setEditing(true); }} className="btn-edit-link">Change</button>
          </div>
        </div>
      ) : editing ? (
        <div className="sheet-edit">
          <input className="link-input" value={val} onChange={e => setVal(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
          <div className="sheet-btns">
            <button onClick={save} className="btn-open">Save & Sync</button>
            <button onClick={() => setEditing(false)} className="btn-edit-link">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setVal(''); setEditing(true); }} className="btn-edit-link" style={{ alignSelf: 'flex-start' }}>+ Add {type.label.split(' — ')[0]} link</button>
      )}
      <span className="gf-hint">{type.hint}</span>
    </div>
  );
}

export default function IndividualUserView({ selectedUserId, onUserSelect }) {
  const { users, updateUser, sheetData, fetchSheetData } = useAuth();
  const [linkVal, setLinkVal] = useState('');
  const [editingLink, setEditingLink] = useState(false);

  const user = users.find(u => u.id === selectedUserId);
  const sd = selectedUserId ? (sheetData[selectedUserId] || {}) : {};

  // Auto-fetch sheet data when a user is selected and has a sheet link.
  // A sync failure is already captured into sheetData[id].error and shown
  // as an inline banner below — it must be caught here too, or the
  // rejected promise crashes the whole page.
  useEffect(() => {
    if (selectedUserId && user && user.googleSheetLink) {
      fetchSheetData(selectedUserId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, user?.googleSheetLink]);

  if (!selectedUserId) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Individual Users</h1>
          <p className="page-sub">Select a user to view their data and Google Sheet</p>
        </div>
        <div className="user-list-grid">
          {users.map(u => (
            <div className="user-card" key={u.id} onClick={() => onUserSelect(u.id)}>
              <div className="uc-avatar">{u.name[0]}</div>
              <div className="uc-name">{u.name}</div>
              <div className="uc-role">{u.role}</div>
              <span className={`uc-status ${u.status === 'Active' ? 'active' : 'inactive'}`}>{u.status}</span>
              <div className="uc-progress">
                <div className="uc-prog-bar"><div className="uc-prog-fill" style={{ width: `${Math.min(100, (u.achieved / u.weeklyTarget) * 100)}%` }} /></div>
                <span className="uc-prog-label">{Math.round((u.achieved / u.weeklyTarget) * 100)}%</span>
              </div>
              <div className="uc-link">{u.googleSheetLink ? '🔗 Sheet Linked' : '⚪ No Sheet'}</div>
            </div>
          ))}
        </div>
        <style>{iuvStyles}</style>
      </div>
    );
  }

  if (!user) return <div style={{ color: '#5a8a9f', padding: '40px' }}>User not found.</div>;

  // Use sheet-derived daily data if available, else fall back to stored dailyData
  const activeDailyData = (sd.dailyData && sd.dailyData.some(v => v > 0)) ? sd.dailyData : user.dailyData;
  const activeAchieved = sd.achieved != null ? sd.achieved : user.achieved;

  const barData = DAYS.map((day, i) => ({ day, value: activeDailyData[i] || 0 }));
  const pieData = [
    { name: 'Achieved', value: activeAchieved },
    { name: 'Remaining', value: Math.max(0, user.weeklyTarget - activeAchieved) },
  ];
  const completionPct = Math.round((activeAchieved / user.weeklyTarget) * 100);

  const startEditLink = () => { setLinkVal(user.googleSheetLink || ''); setEditingLink(true); };
  const saveLink = () => {
    updateUser(user.id, { googleSheetLink: linkVal });
    setEditingLink(false);
  };

  const handleRefresh = () => {
    if (user.googleSheetLink) fetchSheetData(user.id).catch(() => {});
  };

  return (
    <div>
      <div className="page-header">
        <button className="back-btn" onClick={() => onUserSelect(null)}>← All Users</button>
        <h1 className="page-title">{user.name}</h1>
        <p className="page-sub">{user.role} · {user.department} · {user.email}</p>
      </div>

      {/* Profile + Sheet */}
      <div className="iuv-top-row">
        <div className="profile-card">
          <div className="profile-avatar">{user.name[0]}</div>
          <div className="profile-info">
            <div className="profile-name">{user.name}</div>
            <div className="profile-meta">{user.email}</div>
            <div className="profile-meta">{user.phone}</div>
          </div>
          <div className="profile-badges">
            <span className="tag-blue">{user.role}</span>
            <span className={`status-dot-badge ${user.status === 'Active' ? 'active' : 'inactive'}`}>{user.status}</span>
          </div>
        </div>

        <div className="sheet-card">
          <div className="sheet-header">
            <span className="sheet-icon">▦</span>
            <span className="sheet-title">Google Spreadsheet</span>
            {user.googleSheetLink && (
              <button
                onClick={handleRefresh}
                className="btn-refresh"
                disabled={sd.loading}
                title="Refresh data from sheet"
              >
                {sd.loading ? '⟳ Loading…' : '⟳ Refresh'}
              </button>
            )}
          </div>

          {/* Sheet status banner */}
          {user.googleSheetLink && (
            <div className="sheet-status-row">
              {sd.loading && <span className="sheet-status loading">⟳ Fetching sheet data…</span>}
              {sd.error && <span className="sheet-status error">⚠ Could not load sheet: {sd.error}. Showing stored data.</span>}
              {!sd.loading && !sd.error && sd.lastFetched && (
                <span className="sheet-status ok">
                  ✓ Sheet data loaded · {sd.rowCount || 0} rows · {DAYS.map((d, i) => activeDailyData[i] > 0 ? `${d}: ${activeDailyData[i]}` : null).filter(Boolean).join(', ') || 'No entries this week'}
                </span>
              )}
            </div>
          )}

          {user.googleSheetLink && !editingLink ? (
            <div className="sheet-linked">
              <div className="sheet-url">{user.googleSheetLink}</div>
              <div className="sheet-btns">
                <a href={user.googleSheetLink} target="_blank" rel="noopener noreferrer" className="btn-open">Open Sheet ↗</a>
                <button onClick={startEditLink} className="btn-edit-link">Change</button>
              </div>
            </div>
          ) : editingLink ? (
            <div className="sheet-edit">
              <input className="link-input" value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
              <div className="sheet-btns">
                <button onClick={saveLink} className="btn-open">Save</button>
                <button onClick={() => setEditingLink(false)} className="btn-edit-link">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="sheet-empty">
              <p>No Google Sheet linked yet</p>
              <button onClick={startEditLink} className="btn-open">+ Add Google Sheet Link</button>
            </div>
          )}
        </div>
      </div>

      {/* RFQ / Client / Project sheet links — the three sheets used by
          Admin → Sheet Analytics. Each has its own field and its own sync,
          so the RFQ, Client Database and Project Tracker links can never be
          mixed up the way a single generic field allowed. */}
      <div className="sheet-types-card">
        <div className="sheet-header">
          <span className="sheet-icon">▦</span>
          <span className="sheet-title">RFQ / Client / Project Sheets</span>
        </div>
        <span className="gf-hint" style={{ display: 'block', marginBottom: 14 }}>
          Each sheet must be shared as "Anyone with the link can view". These are also editable from User Details, and drive the Admin → Sheet Analytics charts.
        </span>
        <div className="sheet-types-grid">
          {SHEET_TYPES.map(type => (
            <SheetLinkRow key={type.key} type={type} user={user} updateUser={updateUser} />
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-4">
        {[
          { label: 'Weekly Target', val: user.weeklyTarget, color: '#ff9f43' },
          { label: 'Achieved', val: activeAchieved, color: '#00e87a' },
          { label: 'Completion', val: completionPct + '%', color: '#00d4ff' },
          { label: 'Joined', val: user.joinDate, color: '#7b2fff' },
        ].map(k => (
          <div className="kpi-sm" key={k.label} style={{ '--c': k.color }}>
            <div className="kpi-sm-val" style={{ color: k.color }}>{k.val}</div>
            <div className="kpi-sm-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <div className="chart-title">
            Daily Performance This Week
            {sd.lastFetched && !sd.loading && <span className="chart-source"> · from Google Sheet</span>}
          </div>
          {sd.loading ? (
            <div className="chart-loading">⟳ Loading sheet data…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <XAxis dataKey="day" tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} cursor={{ fill: 'rgba(0,212,255,0.05)' }} />
                <Bar dataKey="value" fill="url(#barGrad2)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="barGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e87a" />
                    <stop offset="100%" stopColor="#007a3a" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Target vs Achieved</div>
          {sd.loading ? (
            <div className="chart-loading">⟳ Loading sheet data…</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={i === 0 ? '#00e87a' : '#1a2a3a'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#5a8a9f' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Historical performance graph — self-reported (manual entry / linked sheet) */}
      <div className="charts-row" style={{ marginBottom: 20 }}>
        <PerformanceHistoryGraph userId={user.id} />
      </div>

      {/* Sheet format hint */}
      <div className="sheet-hint">
        <span className="hint-icon">💡</span>
        <span>
          Sheet format: your Google Sheet should have a <strong>date</strong> column (e.g. "Date", "Day", "Timestamp") and a <strong>value</strong> column (e.g. "Value", "Amount", "Sales", "Score", "Count").
          Each row is one entry. Rows dated within the current Mon–Sun week populate the daily bar chart; all rows sum to your total achieved.
          Make sure the sheet is publicly accessible (Share → Anyone with the link → Viewer).
        </span>
      </div>

      <style>{iuvStyles}</style>
    </div>
  );
}

const iuvStyles = `
  .page-header { margin-bottom: 24px; }
  .page-title { font-family: 'Orbitron', monospace; font-size: 24px; font-weight: 700; color: #e0f4ff; margin-bottom: 4px; }
  .page-sub { font-size: 13px; color: #5a8a9f; }
  .back-btn { background: none; border: none; color: #00d4ff; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 13px; margin-bottom: 8px; padding: 0; }
  .back-btn:hover { text-decoration: underline; }
  .user-list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .user-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; transition: all 0.2s; }
  .user-card:hover { border-color: rgba(0,212,255,0.4); background: rgba(0,212,255,0.04); transform: translateY(-2px); }
  .uc-avatar { width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #0050cc); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: #fff; }
  .uc-name { font-weight: 600; font-size: 14px; color: #e0f4ff; text-align: center; }
  .uc-role { font-size: 12px; color: #5a8a9f; }
  .uc-status { padding: 3px 12px; border-radius: 2px; font-size: 11px; }
  .uc-status.active { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); color: #00e87a; }
  .uc-status.inactive { background: rgba(255,100,100,0.08); border: 1px solid rgba(255,100,100,0.2); color: #ff6b6b; }
  .uc-progress { width: 100%; }
  .uc-prog-bar { width: 100%; height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
  .uc-prog-fill { height: 100%; background: linear-gradient(90deg, #00d4ff, #7b2fff); border-radius: 2px; transition: width 0.5s; }
  .uc-prog-label { font-size: 10px; color: #5a8a9f; text-align: right; display: block; }
  .uc-link { font-size: 11px; color: #5a8a9f; }
  .iuv-top-row { display: grid; grid-template-columns: 1fr 1.2fr; gap: 16px; margin-bottom: 20px; }
  .profile-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .profile-avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #7b2fff); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; }
  .profile-name { font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 600; color: #e0f4ff; }
  .profile-meta { font-size: 12px; color: #5a8a9f; }
  .profile-badges { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .tag-blue { padding: 3px 10px; border-radius: 2px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; }
  .status-dot-badge { padding: 3px 10px; border-radius: 2px; font-size: 11px; }
  .status-dot-badge.active { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); color: #00e87a; }
  .status-dot-badge.inactive { background: rgba(255,100,100,0.08); border: 1px solid rgba(255,100,100,0.2); color: #ff6b6b; }
  .sheet-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; }
  .sheet-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .sheet-icon { font-size: 20px; color: #00d4ff; }
  .sheet-title { font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; flex: 1; }
  .btn-refresh { background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; border-radius: 4px; padding: 4px 10px; font-size: 11px; cursor: pointer; font-family: 'Exo 2', sans-serif; transition: background 0.2s; }
  .btn-refresh:hover:not(:disabled) { background: rgba(0,212,255,0.15); }
  .btn-refresh:disabled { opacity: 0.5; cursor: default; }
  .sheet-status-row { margin-bottom: 12px; }
  .sheet-status { font-size: 11px; display: block; padding: 6px 10px; border-radius: 4px; }
  .sheet-status.loading { color: #00d4ff; background: rgba(0,212,255,0.05); }
  .sheet-status.error { color: #ff9f43; background: rgba(255,159,67,0.08); border: 1px solid rgba(255,159,67,0.2); }
  .sheet-status.ok { color: #00e87a; background: rgba(0,232,122,0.05); word-break: break-word; }
  .sheet-linked, .sheet-edit, .sheet-empty { display: flex; flex-direction: column; gap: 12px; }
  .sheet-url { font-size: 12px; color: #5a8a9f; word-break: break-all; background: rgba(0,212,255,0.04); padding: 10px; border-radius: 4px; border: 1px solid rgba(0,212,255,0.1); }
  .sheet-btns { display: flex; gap: 10px; }
  .btn-open { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: linear-gradient(135deg, #00b8e0, #0050cc); border: none; color: #fff; font-family: 'Exo 2', sans-serif; font-size: 12px; font-weight: 600; text-decoration: none; display: inline-block; }
  .btn-edit-link { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid rgba(224,244,255,0.15); color: #8ab4c8; font-family: 'Exo 2', sans-serif; font-size: 12px; }
  .link-input { width: 100%; padding: 10px 12px; background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.15); border-radius: 4px; color: #e0f4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .sheet-empty p { font-size: 13px; color: #5a8a9f; }
  .sheet-types-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; margin-bottom: 20px; }
  .sheet-types-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
  .sheet-type-row { background: rgba(0,212,255,0.03); border: 1px solid rgba(0,212,255,0.08); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .sheet-type-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sheet-type-label { font-size: 12px; font-weight: 600; color: #e0f4ff; }
  .kpi-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
  .kpi-sm { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 20px; text-align: center; }
  .kpi-sm-val { font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 700; margin-bottom: 6px; }
  .kpi-sm-label { font-size: 10px; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .charts-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 20px; }
  .chart-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; }
  .chart-title { font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }
  .chart-source { font-size: 10px; color: #00e87a; letter-spacing: 1px; }
  .chart-loading { color: #00d4ff; font-size: 13px; padding: 80px 0; text-align: center; }
  .sheet-hint { background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.1); border-radius: 6px; padding: 12px 16px; font-size: 11px; color: #5a8a9f; line-height: 1.6; display: flex; gap: 10px; }
  .hint-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
  .sheet-hint strong { color: #a0c8d8; }
`;
