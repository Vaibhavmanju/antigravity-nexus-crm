import React, { useEffect, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, Sector } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import WeekPicker from './WeekPicker';
import ReportDownloader from './ReportDownloader';

const PIE_COLORS = ['#00d4ff','#7b2fff','#00e87a','#ff9f43','#ff6b6b','#a29bfe','#fd79a8','#55efc4'];

const PIE_CATEGORIES = [
  { key: 'market',         label: 'Market' },
  { key: 'methodology',    label: 'Methodology' },
  { key: 'project_status', label: 'Project Status' },
  { key: 'invoice_status', label: 'Invoice Status' },
];

const BREAKDOWN_COLUMNS = [
  { key: 'market',         label: 'Market',         color: '#00d4ff' },
  { key: 'methodology',    label: 'Methodology',    color: '#7b2fff' },
  { key: 'project_status', label: 'Project Status', color: '#00e87a' },
  { key: 'invoice_status', label: 'Invoice Status', color: '#ff9f43' },
];

/** Grows + outlines the hovered slice so the highlighted day is unmistakable. */
function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8}
        startAngle={startAngle} endAngle={endAngle} fill={fill}
        stroke="#e0f4ff" strokeWidth={2}
      />
      <Sector
        cx={cx} cy={cy} innerRadius={outerRadius + 11} outerRadius={outerRadius + 14}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.5}
      />
    </g>
  );
}

/** Rich tooltip: the count *and* every tracked column's breakdown for that date. */
function DayBreakdownTooltip({ active, payload, breakdownByDate }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload; // { name: 'Mon 13 Jul', value, date }
  const info = breakdownByDate[p.date];
  return (
    <div style={{
      background: '#0a1220', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6,
      padding: '12px 14px', minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e0f4ff', marginBottom: 2 }}>{p.name}</div>
      <div style={{ fontSize: 11, color: '#00d4ff', marginBottom: 8 }}>{p.value} record{p.value === 1 ? '' : 's'} entered</div>
      {info && info.count > 0 ? (
        BREAKDOWN_COLUMNS.map(col => {
          const items = info.columns[col.key] || [];
          if (items.length === 0) return null;
          return (
            <div key={col.key} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: col.color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{col.label}</div>
              {items.map(it => (
                <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#a0c8d8' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{it.name}</span>
                  <span style={{ color: '#e0f4ff', fontWeight: 600 }}>{it.value}</span>
                </div>
              ))}
            </div>
          );
        })
      ) : (
        <div style={{ fontSize: 11, color: '#3a6070' }}>No entries on this date</div>
      )}
    </div>
  );
}

/** Get Monday of the current week as YYYY-MM-DD */
function currentMonday() {
  const now = new Date();
  const day = now.getDay();
  const d = new Date(now);
  d.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardHome({ onNavigate, onUserSelect }) {
  const { users } = useAuth();

  // ── Selected week ───────────────────────────────────────────
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);

  // ── Week bar chart state ────────────────────────────────────
  const [weekData,    setWeekData]    = useState(null);
  const [loadingBar,  setLoadingBar]  = useState(true);
  const [lastFetched, setLastFetched] = useState(null);

  // ── Pie chart state ─────────────────────────────────────────
  const [pieCategory,    setPieCategory]    = useState('market');
  const [pieData,        setPieData]        = useState([]);
  const [loadingPie,     setLoadingPie]     = useState(true);
  const [noProjectData,  setNoProjectData]  = useState(false);

  // ── Day-breakdown state (first pie chart — all-column hover detail) ──
  const [dayBreakdown, setDayBreakdown] = useState({}); // { 'YYYY-MM-DD': { count, columns } }
  const [activeDayIndex, setActiveDayIndex] = useState(null);

  const fetchDayBreakdown = useCallback(async (monday) => {
    try {
      const data = await api.getWeekDayBreakdown(null, monday);
      const map = {};
      data.days.forEach(d => { map[d.date] = { count: d.count, columns: d.columns }; });
      setDayBreakdown(map);
    } catch { setDayBreakdown({}); }
  }, []);

  // ── Auto-sync trigger: fires on mount + whenever week changes ─
  const fetchBar = useCallback(async (monday) => {
    setLoadingBar(true);
    try {
      const data = await api.getWeekChart(null, monday);
      setWeekData(data);
      setNoProjectData(data.weekTotal === 0);
      setLastFetched(new Date());
    } catch { setNoProjectData(true); }
    setLoadingBar(false);
  }, []);

  const fetchPie = useCallback(async (cat, monday) => {
    setLoadingPie(true);
    try {
      const data = await api.getWeekPie(null, cat, monday);
      setPieData(data);
    } catch { setPieData([]); }
    setLoadingPie(false);
  }, []);

  // Re-fetch whenever selectedMonday or pieCategory changes
  useEffect(() => {
    fetchBar(selectedMonday);
    fetchDayBreakdown(selectedMonday);
  }, [fetchBar, fetchDayBreakdown, selectedMonday]);

  useEffect(() => {
    fetchPie(pieCategory, selectedMonday);
  }, [fetchPie, pieCategory, selectedMonday]);

  // Auto-refresh every 5 min (only for current week)
  useEffect(() => {
    const id = setInterval(() => {
      const cm = currentMonday();
      if (selectedMonday === cm) {
        fetchBar(cm);
        fetchPie(pieCategory, cm);
        fetchDayBreakdown(cm);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchBar, fetchPie, fetchDayBreakdown, pieCategory, selectedMonday]);

  const isCurrentWeek = selectedMonday === currentMonday();

  const totalTarget  = users.reduce((s, u) => s + (u.weeklyTarget || 0), 0);

  const barData = weekData
    ? weekData.days.map(d => ({ day: d.label, count: d.count, date: d.date }))
    : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => ({ day: d, count: 0 }));

  const dayPieData = barData.map(d => ({ name: d.day, value: d.count, date: d.date }));

  const fallbackPie = [
    { name: 'Active',    value: users.filter(u => u.status === 'Active').length },
    { name: 'Inactive',  value: users.filter(u => u.status === 'Inactive').length },
    { name: 'Sales',     value: users.filter(u => u.role === 'Sales').length },
    { name: 'Support',   value: users.filter(u => u.role === 'Support').length },
  ];
  const activePie = (!loadingPie && pieData.length > 0) ? pieData : (noProjectData ? fallbackPie : []);

  return (
    <div>
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <h1 className="page-title">Command Center</h1>
            <p className="page-sub">
              {isCurrentWeek ? 'Live data — auto-refreshes every 5 minutes' : 'Historical data for the selected week'}
              {lastFetched && <span style={{ marginLeft:8, color:'#3a6070', fontSize:11 }}>· Last updated {lastFetched.toLocaleTimeString()}</span>}
            </p>
          </div>
          {/* Week Picker + consolidated report download — top right of admin dashboard */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <WeekPicker
              selectedMonday={selectedMonday}
              onChange={(monday) => { setSelectedMonday(monday); }}
              accentColor="#00d4ff"
            />
            <ReportDownloader
              sheet="consolidated"
              anchorDate={selectedMonday}
              accentColor="#7b2fff"
              label="Consolidated Report"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {[
          { label: 'Total Users',   val: users.length,                                         icon: '◉', color: '#00d4ff' },
          { label: 'Active Users',  val: users.filter(u => u.status === 'Active').length,      icon: '⬡', color: '#00e87a' },
          { label: 'Weekly Target', val: totalTarget.toLocaleString(),                         icon: '◈', color: '#ff9f43' },
          { label: 'Week Entries',  val: weekData ? weekData.weekTotal.toLocaleString() : '—', icon: '▦', color: '#7b2fff' },
        ].map(k => (
          <div className="kpi-card" key={k.label} style={{ '--accent': k.color }}>
            <div className="kpi-icon" style={{ color: k.color }}>{k.icon}</div>
            <div className="kpi-val"  style={{ color: k.color }}>{k.val}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="charts-row">

        {/* Pie Chart — entries by day of week */}
        <div className="chart-card wide">
          <div className="chart-head">
            <div>
              <div className="chart-title">
                Project Entries
                {isCurrentWeek
                  ? <span className="live-dot"> ● LIVE</span>
                  : <span className="hist-dot"> ◌ HISTORICAL</span>}
              </div>
              {weekData && (
                <div className="week-label">
                  📅 {weekData.weekLabel}
                  <span className="week-total"> · {weekData.weekTotal} total entries</span>
                </div>
              )}
              {noProjectData && (
                <div className="no-data-hint">
                  No project entries found for this week. Sync a user's Google Sheet to populate data.
                </div>
              )}
            </div>
            <button
              className="refresh-btn"
              onClick={() => { fetchBar(selectedMonday); fetchPie(pieCategory, selectedMonday); }}
              disabled={loadingBar || loadingPie}
            >
              {(loadingBar || loadingPie) ? '⟳' : '↻'} Refresh
            </button>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={dayPieData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                paddingAngle={3} dataKey="value"
                activeIndex={activeDayIndex}
                activeShape={renderActiveShape}
                onMouseEnter={(_, index) => setActiveDayIndex(index)}
                onMouseLeave={() => setActiveDayIndex(null)}
              >
                {dayPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<DayBreakdownTooltip breakdownByDate={dayBreakdown} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: '#5a8a9f' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="chart-card">
          <div className="chart-head">
            <div className="chart-title">Breakdown</div>
            <select
              className="pie-select"
              value={pieCategory}
              onChange={e => setPieCategory(e.target.value)}
            >
              {PIE_CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          {noProjectData && (
            <div className="no-data-hint" style={{ fontSize: 11 }}>
              Showing user distribution (no project data for this week)
            </div>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={activePie}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={80}
                paddingAngle={3} dataKey="value"
              >
                {activePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: '#5a8a9f' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Users */}
      <div className="section-card">
        <div className="section-head">
          <span className="section-title">Team Members</span>
          <button className="section-link" onClick={() => onNavigate('users')}>View All →</button>
        </div>
        <table className="mini-table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Status</th><th>Achieved</th><th>Action</th></tr>
          </thead>
          <tbody>
            {users.slice(0, 4).map(u => (
              <tr key={u.id}>
                <td><div className="user-mini"><div className="u-dot">{u.name[0]}</div>{u.name}</div></td>
                <td><span className="role-badge">{u.role}</span></td>
                <td><span className={`status-badge ${u.status === 'Active' ? 'active' : 'inactive'}`}>{u.status}</span></td>
                <td className="achieved-cell">{u.achieved}/{u.weeklyTarget}</td>
                <td><button className="view-btn" onClick={() => onUserSelect(u.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{homeStyles}</style>
    </div>
  );
}

const homeStyles = `
  .page-header { margin-bottom: 28px; }
  .page-title { font-family: 'Orbitron', monospace; font-size: 26px; font-weight: 700; color: #e0f4ff; margin-bottom: 6px; }
  .page-sub { font-size: 12px; color: #5a8a9f; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .kpi-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; position: relative; overflow: hidden; transition: border-color 0.2s; }
  .kpi-card:hover { border-color: var(--accent, rgba(0,212,255,0.3)); }
  .kpi-card::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 0% 0%, rgba(0,212,255,0.04) 0%, transparent 60%); }
  .kpi-icon { font-size: 24px; margin-bottom: 12px; }
  .kpi-val  { font-family: 'Orbitron', monospace; font-size: 28px; font-weight: 700; margin-bottom: 6px; }
  .kpi-label { font-size: 11px; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .charts-row { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; margin-bottom: 24px; }
  .chart-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; }
  .chart-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; gap: 8px; }
  .chart-title { font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  .live-dot  { color: #00e87a; font-size: 9px; animation: livePulse 2s infinite; }
  .hist-dot  { color: #ff9f43; font-size: 9px; }
  @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .week-label { font-size: 12px; color: #00d4ff; font-family: 'Exo 2', sans-serif; }
  .week-total { color: #5a8a9f; }
  .refresh-btn { background: rgba(0,212,255,0.07); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; white-space: nowrap; flex-shrink: 0; }
  .refresh-btn:hover:not(:disabled) { background: rgba(0,212,255,0.15); }
  .refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .pie-select { background: rgba(0,212,255,0.07); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; padding: 4px 8px; border-radius: 4px; outline: none; font-family: 'Exo 2', sans-serif; cursor: pointer; }
  .pie-select option { background: #0a1220; }
  .no-data-hint { font-size: 11px; color: #3a6070; padding: 4px 0 10px; font-style: italic; }
  .section-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; padding: 24px; }
  .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .section-title { font-size: 12px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .section-link { background: none; border: none; color: #00d4ff; font-size: 12px; cursor: pointer; font-family: 'Exo 2', sans-serif; }
  .mini-table { width: 100%; border-collapse: collapse; }
  .mini-table th { text-align: left; font-size: 10px; font-weight: 600; color: #3a6070; letter-spacing: 2px; text-transform: uppercase; padding: 8px 12px; border-bottom: 1px solid rgba(0,212,255,0.08); }
  .mini-table td { padding: 12px; border-bottom: 1px solid rgba(0,212,255,0.04); font-size: 13px; color: #a0c8d8; }
  .mini-table tr:last-child td { border-bottom: none; }
  .user-mini { display: flex; align-items: center; gap: 10px; }
  .u-dot { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #0050cc); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .role-badge { padding: 3px 10px; border-radius: 2px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; }
  .status-badge { padding: 3px 10px; border-radius: 2px; font-size: 11px; }
  .status-badge.active   { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); color: #00e87a; }
  .status-badge.inactive { background: rgba(255,100,100,0.08); border: 1px solid rgba(255,100,100,0.2); color: #ff6b6b; }
  .achieved-cell { font-family: 'Orbitron', monospace; font-size: 12px; color: #e0f4ff; }
  .view-btn { padding: 5px 14px; border-radius: 3px; cursor: pointer; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; font-family: 'Exo 2', sans-serif; }
  .view-btn:hover { background: rgba(0,212,255,0.15); }
  @media (max-width: 900px) { .kpi-grid { grid-template-columns: repeat(2,1fr); } .charts-row { grid-template-columns: 1fr; } }
  @media (max-width: 500px) { .kpi-grid { grid-template-columns: 1fr 1fr; } .page-title { font-size: 18px; } }
`;
