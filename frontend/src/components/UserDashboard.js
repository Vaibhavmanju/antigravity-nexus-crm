import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import WeekPicker from './WeekPicker';
import PerformanceScorecard from './PerformanceScorecard';
import PowerBIPanel from './PowerBIPanel';
import TeamRollup from './TeamRollup';
import NotificationBell from './NotificationBell';

/** Get Monday of current week as YYYY-MM-DD */
function currentMonday() {
  const now = new Date();
  const day = now.getDay();
  const d = new Date(now);
  d.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  // Local calendar date (NOT toISOString — that shifts Monday to Sunday in timezones ahead of UTC)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function UserDashboard() {
  const { currentUser, logout, updateUser, users, sheetData, viewAs } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Always pull fresh user data from users array
  const user = users.find(u => u.id === currentUser.id) || currentUser;
  const sd = sheetData[user.id] || {};

  // ── Sync + chart state ───────────────────────────────────────
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);
  const [weekData,      setWeekData]      = useState(null);
  const [pieData,       setPieData]       = useState([]);
  const [weekLoading,   setWeekLoading]   = useState(true);
  const [noProjectData, setNoProjectData] = useState(false);
  const [syncStatus,    setSyncStatus]    = useState('idle');  // idle | syncing | success | error | no-sheet
  const [syncError,     setSyncError]     = useState(null);
  const [syncMessage,   setSyncMessage]   = useState(null);
  const [lastSynced,    setLastSynced]    = useState(null);

  // ── Step 1: fetch chart data from DB (after sync is done) ───
  const fetchCharts = useCallback(async (monday) => {
    setWeekLoading(true);
    try {
      const [bar, pie] = await Promise.all([
        api.getWeekChart(user.id, monday),
        api.getWeekPie(user.id, 'market', monday),
      ]);
      setWeekData(bar);
      setPieData(pie);
      setNoProjectData(bar.weekTotal === 0);
    } catch {
      setNoProjectData(true);
    }
    setWeekLoading(false);
  }, [user.id]);

  // ── Step 2: sync sheet then refresh charts ───────────────────
  const syncAndRefresh = useCallback(async (monday, silent = false) => {
    if (!user.googleSheetLink) {
      setSyncStatus('no-sheet');
      setNoProjectData(true);
      setWeekLoading(false);
      return;
    }

    if (!silent) setSyncStatus('syncing');

    try {
      // Check if we need a full re-sync or can use cached data.
      // If a sync happened in the last 4 minutes, skip the HTTP sheet fetch
      // and just re-pull chart data (avoids hammering Google's servers).
      let shouldSync = true;
      if (silent && lastSynced) {
        const ageMs = Date.now() - lastSynced.getTime();
        if (ageMs < 4 * 60 * 1000) shouldSync = false;
      }

      if (shouldSync) {
        const result = await api.syncMySheet();
        setLastSynced(new Date());
        setSyncStatus('success');
        setSyncError(null);
        // Store the message from backend (e.g. "Synced 12 rows but none fall in current week")
        setSyncMessage(result.message || null);
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncError(err.message || 'Sync failed');
      // Still try to show whatever data is already in the DB
    }

    // Always fetch chart data regardless of sync outcome
    await fetchCharts(monday);
  }, [user.googleSheetLink, user.id, lastSynced, fetchCharts]);

  // ── On mount and week change: sync then load ─────────────────
  useEffect(() => {
    // For current week always sync first to get live data.
    // For historical weeks skip the sync (data won't change).
    const cm = currentMonday();
    if (selectedMonday === cm) {
      syncAndRefresh(selectedMonday, false);
    } else {
      setWeekLoading(true);
      fetchCharts(selectedMonday);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonday]);

  // ── Auto-refresh every 5 min for current week ────────────────
  useEffect(() => {
    const id = setInterval(() => {
      if (selectedMonday === currentMonday()) {
        syncAndRefresh(selectedMonday, true); // silent = skip sync if recently done
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [syncAndRefresh, selectedMonday]);

  const isCurrentWeek = selectedMonday === currentMonday();
  const isSyncing     = syncStatus === 'syncing';

  // Build bar data from project entries (with date labels), or zeros if none
  const barData = weekData
    ? weekData.days.map(d => ({ day: d.label, value: d.count }))
    : DAYS.map(d => ({ day: d, value: 0 }));

  // Pie: project entries breakdown by market; fallback to achieved/remaining
  const activeAchieved = sd.achieved != null && !sd.loading ? sd.achieved : (user.achieved || 0);
  const pct = Math.round((activeAchieved / (user.weeklyTarget || 1)) * 100);
  const activePie = (!noProjectData && pieData.length > 0)
    ? pieData
    : [
        { name: 'Achieved',  value: activeAchieved },
        { name: 'Remaining', value: Math.max(0, (user.weeklyTarget || 0) - activeAchieved) },
      ];

  return (
    <div className="ud-root">
      <div className="ud-grid-bg" />

      {/* Mobile hamburger */}
      <button className="ud-hamburger" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside className={`ud-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="ud-brand">
          <div className="ud-brand-logo">AN</div>
          <div>
            <div className="ud-brand-name">ANTIGRAVITY</div>
            <div className="ud-brand-sub">NEXUS · USER PORTAL</div>
          </div>
        </div>
        <nav className="ud-nav">
          {[
            { id: 'overview', label: 'Overview', icon: '◈' },
            { id: 'performance', label: 'Performance', icon: '▦' },
            { id: 'insights', label: 'Insights', icon: '★' },
            { id: 'powerbi', label: 'Power BI', icon: '📈' },
            ...(user.is_team_lead ? [{ id: 'team', label: 'My Team', icon: '⛁' }] : []),
            { id: 'tasks', label: 'My Tasks', icon: '◉' },
            { id: 'sheet', label: 'My Sheet', icon: '⬡' },
            { id: 'profile', label: 'Profile', icon: '◎' },
          ].map(tab => (
            <button
              key={tab.id}
              className={`ud-nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
            >
              <span className="ud-nav-icon">{tab.icon}</span>
              <span>{tab.label}</span>
              {activeTab === tab.id && <span className="ud-nav-ind" />}
            </button>
          ))}
        </nav>
        <div className="ud-sidebar-foot">
          <div className="ud-av">{user.name?.[0] || 'U'}</div>
          <div className="ud-foot-info">
            <div className="ud-foot-name">{user.name}</div>
            <div className="ud-foot-role">{user.role}</div>
          </div>
          <button className="ud-logout" onClick={logout} title={viewAs ? 'Back to Team Leader Portal' : 'Logout'}>{viewAs ? '←' : '⏻'}</button>
        </div>
      </aside>

      {sidebarOpen && <div className="ud-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className="ud-main">
        <header className="ud-header">
          <div className="ud-bc">
            <span className="ud-bc-root">Portal</span>
            <span className="ud-bc-sep">›</span>
            <span className="ud-bc-cur">{['overview','performance','tasks','sheet','profile'].includes(activeTab) ? activeTab.charAt(0).toUpperCase()+activeTab.slice(1) : activeTab}</span>
          </div>
          <div className="ud-header-right">
            {!viewAs && <NotificationBell />}
            <div className="ud-live"><span className="ud-dot" />LIVE</div>
            <div className="ud-date">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
        </header>

        {viewAs && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 20px', background: 'rgba(0,232,122,0.08)', borderBottom: '1px solid rgba(0,232,122,0.3)', color: '#00e87a', fontSize: 12 }}>
            <span>⛁ Team Leader view — you are inside <strong>{viewAs.memberName}</strong>'s portal. Anything you enter is saved to their account.</span>
            <button onClick={viewAs.exit} style={{ background: 'rgba(0,232,122,0.15)', border: '1px solid rgba(0,232,122,0.5)', color: '#00e87a', fontSize: 11, padding: '5px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Exo 2', sans-serif" }}>← Back to Team Portal</button>
          </div>
        )}

        <div className="ud-content">
          {activeTab === 'overview'     && <OverviewTab     user={user} pct={pct} barData={barData} pieData={activePie} setActiveTab={setActiveTab} sd={sd} activeAchieved={activeAchieved} weekData={weekData} weekLoading={weekLoading} isSyncing={isSyncing} syncStatus={syncStatus} syncError={syncError} syncMessage={syncMessage} lastSynced={lastSynced} onSyncNow={() => syncAndRefresh(selectedMonday, false)} noProjectData={noProjectData} selectedMonday={selectedMonday} setSelectedMonday={setSelectedMonday} isCurrentWeek={isCurrentWeek} />}
          {activeTab === 'performance'  && <PerformanceTab  user={user} barData={barData} pct={pct} updateUser={updateUser} sd={sd} activeAchieved={activeAchieved} weekData={weekData} selectedMonday={selectedMonday} setSelectedMonday={setSelectedMonday} isCurrentWeek={isCurrentWeek} isSyncing={isSyncing} syncStatus={syncStatus} onSyncNow={() => syncAndRefresh(selectedMonday, false)} />}
          {activeTab === 'insights' && <PerformanceScorecard title="My Performance Scorecard" />}
          {activeTab === 'powerbi' && <PowerBIPanel />}
          {activeTab === 'team' && user.is_team_lead && <TeamRollup title="My Team" />}
          {activeTab === 'tasks' && <TasksTab user={user} />}
          {activeTab === 'sheet' && <SheetTab user={user} updateUser={updateUser} />}
          {activeTab === 'profile' && <ProfileTab user={user} updateUser={updateUser} />}
        </div>
      </main>

      <style>{udStyles}</style>
    </div>
  );
}

function OverviewTab({ user, pct, barData, pieData, setActiveTab, sd, activeAchieved, weekData, weekLoading, isSyncing, syncStatus, syncError, syncMessage, lastSynced, onSyncNow, noProjectData, selectedMonday, setSelectedMonday, isCurrentWeek }) {

  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const runDebug = async () => {
    setDebugLoading(true);
    setShowDebug(true);
    try {
      const data = await api.getSyncDebug();
      setDebugData(data);
    } catch (e) {
      setDebugData({ error: e.message });
    }
    setDebugLoading(false);
  };

  // ── Sync status banner ────────────────────────────────────────
  const SyncBanner = () => {
    if (syncStatus === 'no-sheet') return (
      <div style={bannerStyle('#ff9f43', 'rgba(255,159,67,0.08)')}>
        <span>⚠ No Google Sheet linked to your account.</span>
        <button onClick={() => setActiveTab('sheet')} style={bannerBtn('#ff9f43')}>Go to My Sheet →</button>
      </div>
    );
    if (syncStatus === 'syncing') return (
      <div style={bannerStyle('#00d4ff', 'rgba(0,212,255,0.06)')}>
        <span style={{ animation:'spin 1s linear infinite', display:'inline-block', marginRight:6 }}>⟳</span>
        Syncing data from your Google Sheet…
      </div>
    );
    if (syncStatus === 'error') return (
      <div style={bannerStyle('#ff6b6b', 'rgba(255,107,107,0.08)')}>
        <span>✕ Sync failed: {syncError}</span>
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          <button onClick={runDebug} style={bannerBtn('#ff9f43')}>🔍 Diagnose</button>
          <button onClick={onSyncNow} style={bannerBtn('#ff6b6b')}>Retry →</button>
        </div>
      </div>
    );
    if (syncStatus === 'success' && lastSynced) {
      // Check if the message indicates a problem despite "success"
      const isWarning = syncMessage && syncMessage !== 'Sheet synced successfully';
      const color = isWarning ? '#ff9f43' : '#00e87a';
      const bg    = isWarning ? 'rgba(255,159,67,0.08)' : 'rgba(0,232,122,0.06)';
      return (
        <div style={bannerStyle(color, bg)}>
          <div style={{ flex:1 }}>
            <div>{isWarning ? '⚠' : '✓'} {syncMessage || 'Sheet synced'} · Last updated {lastSynced.toLocaleTimeString()}</div>
            {isWarning && (
              <div style={{ fontSize:11, marginTop:4, opacity:0.8 }}>
                💡 Tip: Open the debug panel to see exactly what dates were found in your sheet.
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
            {isWarning && <button onClick={runDebug} style={bannerBtn('#ff9f43')}>🔍 Diagnose</button>}
            {isCurrentWeek && <button onClick={onSyncNow} disabled={isSyncing} style={bannerBtn(color)}>Sync Again</button>}
          </div>
        </div>
      );
    }
    return null;
  };

  // ── Debug Panel ───────────────────────────────────────────────
  const DebugPanel = () => {
    if (!showDebug) return null;
    return (
      <div style={{ background:'#050c18', border:'1px solid rgba(255,159,67,0.3)', borderRadius:6, padding:16, marginBottom:16, fontSize:11, fontFamily:'monospace', color:'#a0c8d8' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ color:'#ff9f43', fontWeight:700 }}>🔍 Sheet Sync Diagnostics</span>
          <button onClick={() => setShowDebug(false)} style={{ background:'none', border:'none', color:'#5a8a9f', cursor:'pointer', fontSize:14 }}>✕</button>
        </div>
        {debugLoading && <div style={{ color:'#00d4ff' }}>Loading diagnostics…</div>}
        {debugData && !debugLoading && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {debugData.error && <div style={{ color:'#ff6b6b' }}>Error: {debugData.error}</div>}
            {debugData.hasStartDateColumn === false && (
              <div style={{ color:'#ff6b6b', background:'rgba(255,100,100,0.08)', padding:'8px 12px', borderRadius:4 }}>
                ✕ No "Start date" column found! Your sheet headers must include a column named exactly "start date" or "Start date".
              </div>
            )}
            {debugData.sampleRows && debugData.sampleRows.some(r => !r.parseSuccess) && (
              <div style={{ color:'#ff9f43', background:'rgba(255,159,67,0.08)', padding:'8px 12px', borderRadius:4 }}>
                ⚠ Some dates could not be parsed. Supported formats: DD/MM/YYYY · DD-MM-YYYY · 15-Jun-2026 · June 15 2026
              </div>
            )}
            <div><span style={{ color:'#5a8a9f' }}>Recognised columns:</span> {debugData.recognisedColumns ? Object.values(debugData.recognisedColumns).join(', ') : 'None'}</div>
            <div><span style={{ color:'#5a8a9f' }}>Current week:</span> {debugData.currentWeek?.monday} → {debugData.currentWeek?.sunday}</div>
            <div><span style={{ color:'#5a8a9f' }}>DB stats:</span> {JSON.stringify(debugData.dbStats)}</div>
            {debugData.sampleRows?.length > 0 && (
              <div>
                <div style={{ color:'#5a8a9f', marginBottom:4 }}>Sample rows (Start date parsing):</div>
                {debugData.sampleRows.map((r, i) => (
                  <div key={i} style={{ padding:'4px 8px', background: r.parseSuccess ? 'rgba(0,232,122,0.05)' : 'rgba(255,107,107,0.05)', borderRadius:3, marginBottom:2 }}>
                    Row {r.rowNum}: raw=<span style={{ color:'#e0f4ff' }}>"{r.rawStartDate}"</span>
                    → parsed=<span style={{ color: r.parseSuccess ? '#00e87a' : '#ff6b6b' }}>{r.parsedStartDate || 'FAILED'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Welcome */}
      <div className="ud-page-head">
        <h1 className="ud-page-title">Welcome back, {user.name?.split(' ')[0]}!</h1>
        <p className="ud-page-sub">Here's your performance overview for this week</p>
      </div>

      {/* Sync status banner */}
      <SyncBanner />

      {/* Debug panel — shown when user clicks Diagnose */}
      <DebugPanel />

      {/* KPI Cards */}
      <div className="ud-kpi-grid">
        {[
          { label:'Weekly Target',  val: user.weeklyTarget || 0,  icon:'◈', color:'#ff9f43' },
          { label:'Achieved',       val: weekData ? weekData.weekTotal : (activeAchieved || 0), icon:'▦', color:'#00e87a' },
          { label:'Completion',     val: pct+'%',                  icon:'◉', color:'#00d4ff' },
          { label:'Department',     val: user.department || 'N/A', icon:'⬡', color:'#7b2fff' },
        ].map(k => (
          <div className="ud-kpi" key={k.label} style={{ '--c': k.color }}>
            <div className="ud-kpi-icon" style={{ color: k.color }}>{k.icon}</div>
            <div className="ud-kpi-val"  style={{ color: k.color }}>{k.val}</div>
            <div className="ud-kpi-lbl">{k.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="ud-charts">

        {/* Bar Chart */}
        <div className="ud-card">
          <div className="ud-card-title" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
            <div>
              <div>
                Project Entries
                {isSyncing
                  ? <span style={{ color:'#00d4ff', fontSize:9, marginLeft:6 }}>⟳ Syncing…</span>
                  : isCurrentWeek
                    ? <span style={{ color:'#00e87a', fontSize:9, marginLeft:6, animation:'livePulse 2s infinite' }}>● LIVE</span>
                    : <span style={{ color:'#ff9f43', fontSize:9, marginLeft:6 }}>◌ HISTORICAL</span>}
              </div>
              {weekData && !weekLoading && (
                <div style={{ fontSize:10, color:'#7b2fff', marginTop:3, fontWeight:400 }}>
                  📅 {weekData.weekLabel}
                  <span style={{ color:'#5a8a9f' }}> · {weekData.weekTotal} entries</span>
                </div>
              )}
              {noProjectData && !isSyncing && syncStatus !== 'syncing' && (
                <div style={{ fontSize:10, color:'#3a6070', marginTop:3 }}>
                  {syncStatus === 'no-sheet'
                    ? 'Link your Google Sheet to see project data here'
                    : 'No entries found for this week in your sheet'}
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
              <WeekPicker selectedMonday={selectedMonday} onChange={setSelectedMonday} accentColor="#7b2fff" />
              <button
                onClick={onSyncNow}
                disabled={isSyncing || !user.googleSheetLink}
                title={!user.googleSheetLink ? 'No sheet linked' : 'Sync from Google Sheet'}
                style={{
                  background: isSyncing ? 'rgba(123,47,255,0.05)' : 'rgba(123,47,255,0.12)',
                  border: '1px solid rgba(123,47,255,0.35)',
                  color: '#9b59ff', fontSize: 11, padding: '5px 12px',
                  borderRadius: 4, cursor: isSyncing || !user.googleSheetLink ? 'not-allowed' : 'pointer',
                  fontFamily: 'Exo 2,sans-serif', whiteSpace:'nowrap',
                  opacity: !user.googleSheetLink ? 0.4 : 1,
                  display: 'flex', alignItems:'center', gap:5,
                }}
              >
                <span style={{ display:'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
                {isSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          </div>

          {/* Loading skeleton while syncing */}
          {(weekLoading || isSyncing) ? (
            <div style={{ height:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
              <div style={{ width:32, height:32, border:'3px solid rgba(123,47,255,0.2)', borderTop:'3px solid #7b2fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              <div style={{ fontSize:12, color:'#5a8a9f' }}>
                {isSyncing ? 'Fetching data from Google Sheet…' : 'Loading chart…'}
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <XAxis dataKey="day" tick={{ fill: '#5a8a9f', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0e1525', border: '1px solid rgba(123,47,255,0.3)', borderRadius: 4, color: '#e0d4ff' }}
                  cursor={{ fill: 'rgba(123,47,255,0.05)' }}
                  formatter={(v) => [v, 'Project Entries']}
                />
                <Bar dataKey="value" fill="url(#uvBarGrad)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="uvBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#9b59ff" />
                    <stop offset="100%" stopColor="#4a0acc" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart */}
        <div className="ud-card">
          <div className="ud-card-title">
            {noProjectData ? 'Target vs Achieved' : 'Entries by Market'}
          </div>
          {(weekLoading || isSyncing) ? (
            <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ width:24, height:24, border:'3px solid rgba(123,47,255,0.2)', borderTop:'3px solid #7b2fff', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={4} dataKey="value">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={['#7b2fff','#00d4ff','#00e87a','#ff9f43','#ff6b6b','#a29bfe'][i % 6]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#0e1525', border: '1px solid rgba(123,47,255,0.3)', borderRadius: 4, color: '#e0d4ff' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#6a5a8f' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Quick-action cards */}
      <div className="ud-quick-grid">
        {[
          { label:'Update Performance', sub:'Log your daily numbers',      icon:'▦', tab:'performance' },
          { label:'Manage Tasks',       sub:'Track your to-dos',           icon:'◉', tab:'tasks'       },
          { label:'My Sheet',           sub:'View your Google Sheet',      icon:'⬡', tab:'sheet'       },
        ].map(c => (
          <div key={c.tab} className="ud-quick-card" onClick={() => setActiveTab(c.tab)}>
            <div className="ud-quick-icon">{c.icon}</div>
            <div className="ud-quick-label">{c.label}</div>
            <div className="ud-quick-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

function bannerStyle(color, bg) {
  return {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: '10px 16px', borderRadius: 6, marginBottom: 20,
    background: bg, border: `1px solid ${color}40`,
    color, fontSize: 12, fontFamily: "'Exo 2', sans-serif",
  };
}
function bannerBtn(color) {
  return {
    marginLeft: 'auto', background: 'none', border: `1px solid ${color}60`,
    color, fontSize: 11, padding: '3px 10px', borderRadius: 3,
    cursor: 'pointer', fontFamily: "'Exo 2', sans-serif', whiteSpace:'nowrap",
  };
}
function PerformanceTab({ user, barData, pct, updateUser, sd, activeAchieved, weekData, selectedMonday, setSelectedMonday, isCurrentWeek, isSyncing, syncStatus, onSyncNow }) {
  const hasSheet = !!user.googleSheetLink;

  // Manual entry is always available to every employee — it's how "Achieved"
  // is self-reported, independent of (and in addition to) any Google Sheet
  // sync, which only drives the raw "project entries" bar chart below.
  const [editing, setEditing] = useState(false);
  const [dailyEdit, setDailyEdit] = useState(user.dailyData ? [...user.dailyData] : [0,0,0,0,0,0,0]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const save = () => {
    const total = dailyEdit.reduce((s, v) => s + Number(v || 0), 0);
    updateUser(user.id, { dailyData: dailyEdit.map(Number), achieved: total, monday: selectedMonday });
    setEditing(false);
  };

  const startEdit = async () => {
    setLoadingWeek(true);
    try {
      const { dailyData } = await api.getMyPerformance(selectedMonday);
      setDailyEdit(dailyData);
    } catch {
      setDailyEdit(user.dailyData ? [...user.dailyData] : [0,0,0,0,0,0,0]);
    }
    setLoadingWeek(false);
    setEditing(true);
  };

  // Chart data: sheet-synced bar data when a sheet is linked (raw entry
  // counts); manual "Achieved" entry otherwise, or live while editing.
  const chartData = editing
    ? DAYS.map((day, i) => ({ day, value: Number(dailyEdit[i] || 0) }))
    : hasSheet
      ? barData
      : DAYS.map((day, i) => ({ day, value: user.dailyData?.[i] || 0 }));

  return (
    <div>
      <div className="ud-page-head">
        <h1 className="ud-page-title">Performance</h1>
        <p className="ud-page-sub">
          {hasSheet ? 'Project entries auto-sync from your Google Sheet — "Achieved" below is self-reported' : 'Track and update your weekly performance data'}
        </p>
      </div>

      <div className="ud-kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Weekly Target', val: user.weeklyTarget || 0, color: '#ff9f43' },
          { label: 'Achieved', val: activeAchieved, color: '#00e87a' },
          { label: 'Completion', val: pct + '%', color: '#00d4ff' },
        ].map(k => (
          <div className="ud-kpi" key={k.label}>
            <div className="ud-kpi-val" style={{ color: k.color }}>{k.val}</div>
            <div className="ud-kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="ud-card" style={{ marginBottom: 20 }}>
        <div className="ud-card-head">
          <div className="ud-card-title" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
            <div>
              <div>
                {editing ? 'Manual Entry' : 'Project Entries'}
                {editing
                  ? <span style={{ color:'#9b59ff', fontSize:9, marginLeft:6 }}>✎ EDITING</span>
                  : !hasSheet
                    ? <span style={{ color:'#5a8a9f', fontSize:9, marginLeft:6 }}>◌ MANUAL</span>
                    : isSyncing
                      ? <span style={{ color:'#00d4ff', fontSize:9, marginLeft:6 }}>⟳ Syncing…</span>
                      : isCurrentWeek
                        ? <span style={{ color:'#00e87a', fontSize:9, marginLeft:6 }}>● LIVE</span>
                        : <span style={{ color:'#ff9f43', fontSize:9, marginLeft:6 }}>◌ HISTORICAL</span>}
              </div>
              {hasSheet && !editing && weekData && (
                <span style={{ fontSize:9, color:'#7b2fff', marginTop:3, fontWeight:400, letterSpacing:1 }}>
                  📅 {weekData.weekLabel} · {weekData.weekTotal} entries
                </span>
              )}
            </div>
            {hasSheet && !editing && (
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <WeekPicker selectedMonday={selectedMonday} onChange={setSelectedMonday} accentColor="#7b2fff" />
                <button
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  style={{ background:'rgba(123,47,255,0.1)', border:'1px solid rgba(123,47,255,0.3)', color:'#9b59ff', fontSize:10, padding:'5px 8px', borderRadius:3, cursor: isSyncing ? 'not-allowed' : 'pointer', fontFamily:'Exo 2,sans-serif' }}
                >
                  <span style={{ display:'inline-block', animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
                </button>
              </div>
            )}
          </div>
          {!editing && (
            <button className="ud-edit-btn" onClick={startEdit} disabled={loadingWeek}>
              {loadingWeek ? '⟳ Loading…' : '✎ Update My Performance'}
            </button>
          )}
        </div>
        <div style={{ fontSize:11, color:'#5a8a9f', marginBottom:12 }}>
          {editing
            ? `💡 Enter your achieved numbers for the week of ${selectedMonday}. This is saved as your self-reported "Achieved" total, separate from any sheet-synced entry counts.`
            : !hasSheet
              ? '💡 Link a Google Sheet in the "My Sheet" tab to also track raw entry counts — "Achieved" is always yours to update manually.'
              : '💡 "Achieved" is self-reported — use "Update My Performance" any time to log it, even with a sheet linked.'}
        </div>
        {editing ? (
          <div>
            <div className="perf-grid">
              {DAYS.map((day, i) => (
                <div className="perf-field" key={day}>
                  <label>{DAY_LABELS[i]}</label>
                  <input
                    type="number" min="0"
                    value={dailyEdit[i]}
                    onChange={e => { const d = [...dailyEdit]; d[i] = e.target.value; setDailyEdit(d); }}
                  />
                </div>
              ))}
            </div>
            <div className="perf-total">
              Total this week: <strong style={{ color: '#00e87a' }}>{dailyEdit.reduce((s, v) => s + Number(v || 0), 0)}</strong>
            </div>
            <div className="perf-actions">
              <button className="ud-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="ud-save-btn" onClick={save}>Save Performance</button>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <XAxis dataKey="day" tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#5a8a9f', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0e1525', border: '1px solid rgba(123,47,255,0.3)', borderRadius: 4, color: '#e0d4ff' }} cursor={{ fill: 'rgba(123,47,255,0.05)' }} />
              <Bar dataKey="value" fill="url(#pBarGrad)" radius={[4, 4, 0, 0]} />
              <defs>
                <linearGradient id="pBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#9b59ff" />
                  <stop offset="100%" stopColor="#4a0acc" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="ud-card">
        <div className="ud-card-title">Progress Bar</div>
        <div className="ud-prog-wrap">
          <div className="ud-prog-info">
            <span style={{ color: '#e0d4ff' }}>{activeAchieved} achieved</span>
            <span style={{ color: '#7b2fff' }}>{pct}%</span>
            <span style={{ color: '#6a5a8f' }}>of {user.weeklyTarget || 0}</span>
          </div>
          <div className="ud-prog-bar">
            <div className="ud-prog-fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TasksTab({ user }) {
  const auth = useAuth();

  // Map backend task shape -> the { text, done, createdAt } shape this UI expects
  const toUi = (t) => ({
    id: t.id,
    text: t.title,
    priority: t.priority,
    done: t.status === 'Done',
    createdAt: t.created_at ? new Date(t.created_at).toLocaleDateString() : (t.createdAt || ''),
  });

  // Always load the authoritative task list from the server on mount,
  // rather than trusting `user.tasks` (a snapshot taken at login that
  // goes stale after any add/edit and made newly-added tasks disappear
  // whenever this tab remounted).
  const [tasks, setTasks] = useState((user.tasks || []).map(toUi));
  const [newTask, setNewTask] = useState('');
  const [newPriority, setNewPriority] = useState('Medium');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.getMyTasks();
        if (!cancelled) setTasks(rows.map(toUi));
      } catch (err) {
        console.error('Load tasks failed:', err);
        if (!cancelled) setError('Could not load your latest tasks — showing the last known list.');
      }
      if (!cancelled) setFetching(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTask = async () => {
    if (!newTask.trim()) return;
    setLoading(true);
    setError('');
    try {
      const id = await auth.addTask({ title: newTask.trim(), priority: newPriority, status: 'Pending' });
      setTasks(prev => [{ id, text: newTask.trim(), priority: newPriority, done: false, createdAt: new Date().toLocaleDateString() }, ...prev]);
      setNewTask('');
    } catch (err) {
      console.error('Add task failed:', err);
      setError(err.message || 'Failed to add task — please try again.');
    }
    setLoading(false);
  };

  const toggle = async (id) => {
    const t = tasks.find(x => x.id === id);
    const newDone = !t.done;
    setTasks(prev => prev.map(x => x.id === id ? { ...x, done: newDone } : x));
    try { await auth.updateTask(id, { status: newDone ? 'Done' : 'Pending' }); } catch (err) { console.error(err); }
  };

  const remove = async (id) => {
    setTasks(prev => prev.filter(x => x.id !== id));
    try { await auth.removeTask(id); } catch (err) { console.error(err); }
  };

  const prioColor = { High: '#ff6b6b', Medium: '#ff9f43', Low: '#00e87a' };

  return (
    <div>
      <div className="ud-page-head">
        <h1 className="ud-page-title">My Tasks</h1>
        <p className="ud-page-sub">Manage your personal task list — data is saved automatically</p>
      </div>

      <div className="ud-card" style={{ marginBottom: 20 }}>
        <div className="ud-card-title">Add New Task</div>
        <div className="task-add-row">
          <input
            className="task-input" placeholder="Enter task description..."
            value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <select className="task-prio" value={newPriority} onChange={e => setNewPriority(e.target.value)}>
            <option>High</option><option>Medium</option><option>Low</option>
          </select>
          <button className="ud-save-btn" onClick={addTask} disabled={loading}>{loading ? '⟳ Adding…' : '+ Add'}</button>
        </div>
        {error && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 8 }}>⚠ {error}</div>}
      </div>

      <div className="ud-card">
        <div className="ud-card-head">
          <div className="ud-card-title">Task List ({tasks.filter(t => !t.done).length} pending)</div>
          {fetching && <span style={{ fontSize: 10, color: '#3a6070' }}>⟳ Loading…</span>}
        </div>
        {tasks.length === 0 && <div className="ud-empty">No tasks yet. Add your first task above.</div>}
        <div className="task-list">
          {tasks.map(t => (
            <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
              <div className="task-check" onClick={() => toggle(t.id)}>{t.done ? '✓' : ''}</div>
              <div className="task-body">
                <span className="task-text">{t.text}</span>
                <span className="task-date">{t.createdAt}</span>
              </div>
              <span className="task-prio-badge" style={{ '--pc': prioColor[t.priority] }}>{t.priority}</span>
              <button className="task-del" onClick={() => remove(t.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SheetTab({ user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [linkVal, setLinkVal] = useState(user.googleSheetLink || '');

  const save = () => {
    updateUser(user.id, { googleSheetLink: linkVal });
    setEditing(false);
  };

  return (
    <div>
      <div className="ud-page-head">
        <h1 className="ud-page-title">My Sheet</h1>
        <p className="ud-page-sub">Access your assigned Google Spreadsheet</p>
      </div>

      <div className="ud-card">
        <div className="ud-card-title">Google Spreadsheet</div>
        {user.googleSheetLink && !editing ? (
          <div>
            <div className="sheet-url-box">{user.googleSheetLink}</div>
            <div className="sheet-btns">
              <a href={user.googleSheetLink} target="_blank" rel="noopener noreferrer" className="ud-save-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
                Open Sheet ↗
              </a>
              <button className="ud-edit-btn" onClick={() => { setLinkVal(user.googleSheetLink); setEditing(true); }}>Change</button>
            </div>
          </div>
        ) : editing ? (
          <div>
            <input className="sheet-link-inp" value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            <div className="sheet-btns">
              <button className="ud-save-btn" onClick={save}>Save</button>
              <button className="ud-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="ud-empty">
            <p style={{ marginBottom: 16 }}>No Google Sheet linked. Your admin will assign one, or you can add it below.</p>
            <button className="ud-save-btn" onClick={() => setEditing(true)}>+ Add Sheet Link</button>
          </div>
        )}
      </div>

      {user.googleSheetLink && !editing && (
        <div className="ud-card" style={{ marginTop: 20 }}>
          <div className="ud-card-title">Sheet Preview</div>
          <iframe
            src={user.googleSheetLink.includes('/edit') ? user.googleSheetLink.replace('/edit', '/pubhtml') : user.googleSheetLink + '/pubhtml'}
            style={{ width: '100%', height: 400, border: 'none', borderRadius: 6, background: '#fff' }}
            title="Google Sheet Preview"
          />
          <p style={{ fontSize: 12, color: '#5a8a9f', marginTop: 8 }}>Note: Preview requires the sheet to be published publicly.</p>
        </div>
      )}
    </div>
  );
}

function ProfileTab({ user, updateUser }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user.name, phone: user.phone, notes: user.notes || '' });
  const [saved, setSaved] = useState(false);

  const save = () => {
    updateUser(user.id, form);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div className="ud-page-head">
        <h1 className="ud-page-title">Profile</h1>
        <p className="ud-page-sub">Your account information</p>
      </div>

      <div className="ud-card">
        <div className="ud-card-head">
          <div className="ud-card-title">Personal Information</div>
          {!editing && <button className="ud-edit-btn" onClick={() => { setForm({ name: user.name, phone: user.phone, notes: user.notes || '' }); setEditing(true); }}>✎ Edit</button>}
        </div>

        <div className="profile-avatar-row">
          <div className="ud-big-av">{user.name?.[0] || 'U'}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e0d4ff', fontFamily: 'Orbitron, monospace' }}>{user.name}</div>
            <div style={{ fontSize: 13, color: '#6a5a8f', marginTop: 4 }}>{user.email}</div>
          </div>
        </div>

        {editing ? (
          <div className="perf-grid">
            <div className="perf-field">
              <label>Full Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="perf-field">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="perf-field" style={{ gridColumn: '1/-1' }}>
              <label>Notes / Bio</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div className="perf-actions" style={{ gridColumn: '1/-1' }}>
              <button className="ud-cancel-btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="ud-save-btn" onClick={save}>Save Profile</button>
            </div>
          </div>
        ) : (
          <div className="profile-details">
            {[
              { label: 'Email', val: user.email },
              { label: 'Phone', val: user.phone || '—' },
              { label: 'Role', val: user.role },
              { label: 'Department', val: user.department },
              { label: 'Status', val: user.status },
              { label: 'Join Date', val: user.joinDate || '—' },
            ].map(r => (
              <div className="profile-row" key={r.label}>
                <span className="profile-key">{r.label}</span>
                <span className="profile-val">{r.val}</span>
              </div>
            ))}
            {user.notes && (
              <div className="profile-row" style={{ flexDirection: 'column', gap: 6 }}>
                <span className="profile-key">Notes</span>
                <span className="profile-val">{user.notes}</span>
              </div>
            )}
          </div>
        )}
        {saved && <div style={{ color: '#00e87a', fontSize: 13, marginTop: 12 }}>✓ Profile saved</div>}
      </div>
    </div>
  );
}

const udStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .ud-root { display: flex; min-height: 100vh; background: #020408; font-family: 'Exo 2', sans-serif; color: #e0d4ff; position: relative; }
  .ud-grid-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; background-image: linear-gradient(rgba(123,47,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(123,47,255,0.03) 1px, transparent 1px); background-size: 40px 40px; }
  
  .ud-hamburger { display: none; position: fixed; top: 14px; left: 14px; z-index: 200; background: rgba(10,14,26,0.9); border: 1px solid rgba(123,47,255,0.3); color: #9b59ff; font-size: 20px; width: 40px; height: 40px; border-radius: 8px; cursor: pointer; }
  
  .ud-sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; z-index: 100; background: rgba(5,6,14,0.97); backdrop-filter: blur(20px); border-right: 1px solid rgba(123,47,255,0.12); display: flex; flex-direction: column; transition: transform 0.3s; }
  .ud-overlay { display: none; position: fixed; inset: 0; z-index: 90; background: rgba(2,4,8,0.7); }
  
  .ud-brand { padding: 28px 20px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(123,47,255,0.08); }
  .ud-brand-logo { width: 38px; height: 38px; border-radius: 6px; background: linear-gradient(135deg, #7b2fff, #4a0acc); display: flex; align-items: center; justify-content: center; font-family: 'Orbitron', monospace; font-size: 13px; font-weight: 900; color: #fff; box-shadow: 0 0 16px rgba(123,47,255,0.5); }
  .ud-brand-name { font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 700; color: #9b59ff; letter-spacing: 2px; }
  .ud-brand-sub { font-size: 9px; color: #4a3a6f; letter-spacing: 3px; text-transform: uppercase; margin-top: 2px; }
  
  .ud-nav { flex: 1; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; }
  .ud-nav-btn { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 6px; cursor: pointer; background: transparent; border: none; color: #5a4a7f; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s; letter-spacing: 0.5px; }
  .ud-nav-btn:hover { background: rgba(123,47,255,0.08); color: #b08adf; }
  .ud-nav-btn.active { background: rgba(123,47,255,0.12); color: #9b59ff; }
  .ud-nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .ud-nav-ind { position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 20px; background: #7b2fff; border-radius: 0 2px 2px 0; box-shadow: 0 0 8px rgba(123,47,255,0.7); }
  
  .ud-sidebar-foot { padding: 16px; border-top: 1px solid rgba(123,47,255,0.08); display: flex; align-items: center; gap: 10px; }
  .ud-av { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #7b2fff, #4a0acc); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .ud-foot-info { flex: 1; min-width: 0; }
  .ud-foot-name { font-size: 13px; font-weight: 600; color: #e0d4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ud-foot-role { font-size: 10px; color: #4a3a6f; letter-spacing: 1.5px; text-transform: uppercase; }
  .ud-logout { background: none; border: none; color: #5a4a7f; cursor: pointer; font-size: 18px; padding: 4px; transition: color 0.2s; }
  .ud-logout:hover { color: #ff6b6b; }
  
  .ud-main { margin-left: 240px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; position: relative; z-index: 1; }
  .ud-header { padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; background: rgba(5,6,14,0.7); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(123,47,255,0.08); position: sticky; top: 0; z-index: 10; }
  .ud-bc { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .ud-bc-root { color: #4a3a6f; }
  .ud-bc-sep { color: #4a3a6f; }
  .ud-bc-cur { color: #e0d4ff; font-weight: 600; }
  .ud-header-right { display: flex; align-items: center; gap: 20px; }
  .ud-live { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: #9b59ff; letter-spacing: 2px; }
  .ud-dot { width: 6px; height: 6px; border-radius: 50%; background: #7b2fff; box-shadow: 0 0 8px #7b2fff; animation: udPulse 2s infinite; }
  @keyframes udPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .ud-date { font-size: 12px; color: #5a4a7f; }
  .ud-content { flex: 1; padding: 32px; overflow-y: auto; }
  
  .ud-page-head { margin-bottom: 28px; }
  .ud-page-title { font-family: 'Orbitron', monospace; font-size: 24px; font-weight: 700; color: #e0d4ff; margin-bottom: 6px; }
  .ud-page-sub { font-size: 13px; color: #5a4a7f; }
  
  .ud-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .ud-kpi { background: rgba(10,14,26,0.8); border: 1px solid rgba(123,47,255,0.12); border-radius: 8px; padding: 22px; }
  .ud-kpi:hover { border-color: rgba(123,47,255,0.3); }
  .ud-kpi-val { font-family: 'Orbitron', monospace; font-size: 26px; font-weight: 700; margin-bottom: 6px; }
  .ud-kpi-lbl { font-size: 11px; color: #5a4a7f; letter-spacing: 2px; text-transform: uppercase; }
  
  .ud-charts-row { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-bottom: 24px; }
  .ud-card { background: rgba(10,14,26,0.8); border: 1px solid rgba(123,47,255,0.12); border-radius: 8px; padding: 24px; }
  .ud-card-title { font-size: 12px; font-weight: 600; color: #5a4a7f; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; }
  .ud-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .ud-card-head .ud-card-title { margin-bottom: 0; }
  
  .ud-quick-links { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .ud-ql-card { background: rgba(10,14,26,0.8); border: 1px solid rgba(123,47,255,0.12); border-radius: 8px; padding: 24px; cursor: pointer; transition: all 0.2s; text-align: center; }
  .ud-ql-card:hover { border-color: rgba(123,47,255,0.4); background: rgba(123,47,255,0.05); transform: translateY(-2px); }
  .ud-ql-icon { font-size: 28px; color: #7b2fff; margin-bottom: 10px; }
  .ud-ql-label { font-size: 14px; font-weight: 600; color: #e0d4ff; margin-bottom: 4px; }
  .ud-ql-desc { font-size: 12px; color: #5a4a7f; }
  
  .ud-edit-btn { padding: 8px 16px; border-radius: 4px; cursor: pointer; background: rgba(123,47,255,0.1); border: 1px solid rgba(123,47,255,0.3); color: #9b59ff; font-family: 'Exo 2', sans-serif; font-size: 12px; }
  .ud-edit-btn:hover { background: rgba(123,47,255,0.2); }
  .ud-save-btn { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: linear-gradient(135deg, #7b2fff, #4a0acc); border: none; color: #fff; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 600; }
  .ud-save-btn:hover { box-shadow: 0 0 20px rgba(123,47,255,0.4); }
  .ud-cancel-btn { padding: 10px 20px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid rgba(224,212,255,0.15); color: #8a7abf; font-family: 'Exo 2', sans-serif; font-size: 13px; }
  .ud-empty { color: #5a4a7f; font-size: 14px; padding: 24px 0; text-align: center; }
  
  .perf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-bottom: 16px; }
  .perf-field { display: flex; flex-direction: column; gap: 6px; }
  .perf-field label { font-size: 10px; font-weight: 600; color: #5a4a7f; letter-spacing: 2px; text-transform: uppercase; }
  .perf-field input, .perf-field textarea { padding: 10px 12px; background: rgba(123,47,255,0.05); border: 1px solid rgba(123,47,255,0.2); border-radius: 4px; color: #e0d4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .perf-field input:focus, .perf-field textarea:focus { border-color: rgba(155,89,255,0.5); }
  .perf-total { font-size: 13px; color: #6a5a8f; margin-bottom: 16px; }
  .perf-actions { display: flex; gap: 12px; }
  
  .ud-prog-wrap { padding: 8px 0; }
  .ud-prog-info { display: flex; gap: 12px; margin-bottom: 10px; font-size: 13px; }
  .ud-prog-bar { height: 10px; background: rgba(255,255,255,0.06); border-radius: 5px; overflow: hidden; }
  .ud-prog-fill { height: 100%; background: linear-gradient(90deg, #7b2fff, #9b59ff); border-radius: 5px; transition: width 0.6s; }
  
  .task-add-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .task-input { flex: 1; min-width: 200px; padding: 10px 14px; background: rgba(123,47,255,0.05); border: 1px solid rgba(123,47,255,0.2); border-radius: 4px; color: #e0d4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .task-input:focus { border-color: rgba(155,89,255,0.5); }
  .task-prio { padding: 10px 12px; background: rgba(123,47,255,0.05); border: 1px solid rgba(123,47,255,0.2); border-radius: 4px; color: #e0d4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .task-prio option { background: #0e1525; }
  .task-list { display: flex; flex-direction: column; gap: 8px; }
  .task-item { display: flex; align-items: center; gap: 12px; padding: 14px; background: rgba(123,47,255,0.04); border: 1px solid rgba(123,47,255,0.1); border-radius: 6px; transition: all 0.2s; }
  .task-item.done { opacity: 0.5; }
  .task-check { width: 22px; height: 22px; border-radius: 4px; border: 2px solid rgba(123,47,255,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #9b59ff; flex-shrink: 0; transition: all 0.2s; }
  .task-item.done .task-check { background: rgba(123,47,255,0.3); }
  .task-body { flex: 1; min-width: 0; }
  .task-text { display: block; font-size: 14px; color: #e0d4ff; }
  .task-item.done .task-text { text-decoration: line-through; }
  .task-date { font-size: 11px; color: #5a4a7f; }
  .task-prio-badge { padding: 3px 10px; border-radius: 3px; font-size: 11px; background: rgba(var(--pc), 0.1); border: 1px solid rgba(var(--pc), 0.3); color: var(--pc); white-space: nowrap; }
  .task-del { background: none; border: none; color: #5a4a7f; cursor: pointer; font-size: 14px; padding: 2px 6px; transition: color 0.2s; }
  .task-del:hover { color: #ff6b6b; }
  
  .sheet-url-box { font-size: 12px; color: #6a5a8f; word-break: break-all; background: rgba(123,47,255,0.04); padding: 12px; border-radius: 4px; border: 1px solid rgba(123,47,255,0.12); margin-bottom: 14px; }
  .sheet-btns { display: flex; gap: 10px; flex-wrap: wrap; }
  .sheet-link-inp { width: 100%; padding: 10px 12px; background: rgba(123,47,255,0.05); border: 1px solid rgba(123,47,255,0.2); border-radius: 4px; color: #e0d4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; margin-bottom: 14px; }
  
  .profile-avatar-row { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; }
  .ud-big-av { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #7b2fff, #4a0acc); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; color: #fff; flex-shrink: 0; box-shadow: 0 0 24px rgba(123,47,255,0.4); }
  .profile-details { display: flex; flex-direction: column; gap: 4px; }
  .profile-row { display: flex; align-items: baseline; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(123,47,255,0.06); }
  .profile-row:last-child { border-bottom: none; }
  .profile-key { font-size: 11px; font-weight: 600; color: #5a4a7f; letter-spacing: 2px; text-transform: uppercase; min-width: 100px; }
  .profile-val { font-size: 14px; color: #c0b4e0; }
  
  @media (max-width: 900px) {
    .ud-hamburger { display: flex; align-items: center; justify-content: center; }
    .ud-sidebar { transform: translateX(-100%); }
    .ud-sidebar.open { transform: translateX(0); }
    .ud-overlay { display: block; }
    .ud-main { margin-left: 0; }
    .ud-header { padding: 16px 16px 16px 64px; }
    .ud-content { padding: 20px 16px; }
    .ud-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .ud-charts-row { grid-template-columns: 1fr; }
    .ud-quick-links { grid-template-columns: 1fr; }
    .perf-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  }
  @media (max-width: 480px) {
    .ud-kpi-grid { grid-template-columns: 1fr 1fr; }
    .task-add-row { flex-direction: column; }
    .task-item { flex-wrap: wrap; }
    .ud-page-title { font-size: 18px; }
  }
`;
