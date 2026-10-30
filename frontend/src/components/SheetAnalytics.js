import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import WeekPicker from './WeekPicker';
import ReportDownloader from './ReportDownloader';
import PerformanceScorecard from './PerformanceScorecard';

const COLORS = ['#00d4ff','#7b2fff','#00e87a','#ff9f43','#ff6b6b','#a29bfe','#fd79a8','#55efc4','#fdcb6e','#6c5ce7'];

function currentMonday() {
  const now = new Date();
  const day = now.getDay();
  const d = new Date(now);
  d.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  // Local calendar date (toISOString would turn Monday into Sunday east of UTC, e.g. India)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Spinner ───────────────────────────────────────────────────
function Spinner({ color = '#00d4ff', size = 28 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `3px solid rgba(0,212,255,0.15)`,
      borderTop: `3px solid ${color}`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

// ── Chart card wrapper ────────────────────────────────────────
function ChartCard({ title, subtitle, children, fullWidth }) {
  return (
    <div style={{
      background: 'rgba(10,18,32,0.85)',
      border: '1px solid rgba(0,212,255,0.12)',
      borderRadius: 8, padding: 20,
      gridColumn: fullWidth ? '1/-1' : undefined,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: subtitle ? 4 : 14 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: '#3a6070', marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// ── Pie chart section ─────────────────────────────────────────
function PieSection({ title, subtitle, data, loading, fullWidth }) {
  const hasData = Array.isArray(data) && data.length > 0 && data.some(d => d.value > 0);
  return (
    <ChartCard title={title} subtitle={subtitle} fullWidth={fullWidth}>
      {loading ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : !hasData ? (
        <div style={{ height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 28, opacity: 0.2 }}>◌</div>
          <div style={{ fontSize: 11, color: '#3a6070' }}>No data available</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 4, color: '#e0f4ff' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: '#5a8a9f' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ── KPI row ───────────────────────────────────────────────────
function KpiRow({ kpis }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
      {kpis.map(k => (
        <div key={k.label} style={{
          background: 'rgba(10,18,32,0.7)',
          border: '1px solid rgba(0,212,255,0.1)',
          borderRadius: 6, padding: '14px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: k.color || '#00d4ff', fontFamily: "'Orbitron', monospace", marginBottom: 4 }}>
            {k.val === null || k.val === undefined ? '—' : k.val}
          </div>
          <div style={{ fontSize: 10, color: '#5a8a9f', letterSpacing: 1.5, textTransform: 'uppercase' }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Sync button style ─────────────────────────────────────────
const syncBtn = {
  background: 'rgba(123,47,255,0.12)',
  border: '1px solid rgba(123,47,255,0.35)',
  color: '#9b59ff', fontSize: 11, padding: '6px 14px',
  borderRadius: 4, cursor: 'pointer',
  fontFamily: "'Exo 2', sans-serif",
  display: 'flex', alignItems: 'center', gap: 5,
};
const refreshBtn = {
  ...syncBtn,
  background: 'rgba(0,212,255,0.06)',
  borderColor: 'rgba(0,212,255,0.2)',
  color: '#00d4ff',
};

function SyncMsg({ msg }) {
  if (!msg) return null;
  const color = msg.type === 'ok' ? '#00e87a' : msg.type === 'warn' ? '#ff9f43' : '#ff6b6b';
  return (
    <div style={{
      fontSize: 11, color, marginBottom: 16, padding: '10px 16px',
      background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}30`,
      borderRadius: 6, lineHeight: 1.5,
    }}>
      {msg.text}
    </div>
  );
}

// ── Shared notices: nearest-week fallback + sample-data badge ──
function PanelNotices({ data, sheetLabel, onJumpToWeek }) {
  if (!data) return null;
  const sample = data.sample || {};
  const sync = data.sync || null;

  let sampleReason = 'no sync has run yet';
  if (sync) {
    if (!sync.hasLink) sampleReason = `no ${sheetLabel} sheet link is set for this user`;
    else if (sync.syncError) sampleReason = `last sync failed: ${sync.syncError}`;
    else if (sync.lastSyncedAt) sampleReason = 'the linked sheet has no rows yet';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
      {data.fellBack && (
        <div style={{ fontSize: 11, color: '#ff9f43', background: 'rgba(255,159,67,0.08)', border: '1px solid rgba(255,159,67,0.3)', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>⏱ No entries in {data.requestedWeekLabel} — showing the nearest week with data: <b>{data.weekLabel}</b></span>
          {onJumpToWeek && data.mondayStr && (
            <button onClick={() => onJumpToWeek(data.mondayStr)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,159,67,0.5)', color: '#ff9f43', fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Exo 2', sans-serif" }}>
              Go to that week
            </button>
          )}
        </div>
      )}
      {sample.has && (
        <div style={{ fontSize: 11, color: '#a29bfe', background: 'rgba(123,47,255,0.08)', border: '1px solid rgba(123,47,255,0.3)', borderRadius: 6, padding: '8px 14px' }}>
          {sample.only
            ? <>🧪 <b>Sample data</b> — shown because {sampleReason}. It is replaced automatically as soon as the real Google Sheet syncs.</>
            : <>🧪 Includes <b>sample data</b> for users whose {sheetLabel} sheet isn't synced yet. Real data replaces it automatically.</>}
        </div>
      )}
    </div>
  );
}

// ── Data-loading hook shared by the three panels ──────────────
function usePanelData(fetcher, deps) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await fetcher()); }
    catch (e) { setError(e.message || 'Failed to load data'); setData(null); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, load };
}

// ══════════════════════════════════════════════════════════════
// PAGE 1 — RFQ TRACKER
// ══════════════════════════════════════════════════════════════
function RfqAnalytics({ selectedUser, selectedMonday, setSelectedMonday, refreshKey }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const { data, loading, error, load } = usePanelData(
    () => api.getRfqCharts(selectedUser, selectedMonday), [selectedUser, selectedMonday, refreshKey]);

  const syncUser = async () => {
    if (!selectedUser) {
      setSyncMsg({ type: 'warn', text: 'All Users is being synced automatically. Pick a specific user to sync only their RFQ sheet.' });
      return;
    }
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.syncRfqSheet(selectedUser);
      setSyncMsg({ type: 'ok', text: `✓ Synced ${r.total} rows from the RFQ sheet (${r.totalInDB} stored).` });
      await load();
    } catch (e) {
      setSyncMsg({ type: 'err', text: `✕ Sync failed: ${e.message}` });
    }
    setSyncing(false);
  };

  const dayPieData = (data?.days || []).map(d => ({ name: d.label, value: d.count }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {data?.weekLabel && <span style={{ fontSize: 11, color: '#5a8a9f' }}>📅 {data.weekLabel} · {data.weekTotal} RFQs in this week</span>}
          {error && <span style={{ fontSize: 11, color: '#ff6b6b' }}>⚠ {error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ReportDownloader sheet="rfq" anchorDate={selectedMonday} userId={selectedUser} accentColor="#00d4ff" label="Report" />
          <button onClick={syncUser} disabled={syncing} style={syncBtn}>
            <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
            {syncing ? 'Syncing…' : 'Sync RFQ Sheet'}
          </button>
          <button onClick={load} disabled={loading} style={refreshBtn}>↻ Refresh</button>
        </div>
      </div>

      <SyncMsg msg={syncMsg} />
      <PanelNotices data={data} sheetLabel="RFQ" onJumpToWeek={setSelectedMonday} />

      {data && (
        <KpiRow kpis={[
          { label: 'Total RFQs',    val: data.kpi.total,     color: '#00d4ff' },
          { label: 'Avg CPI (USD)', val: data.kpi.avgCpi,    color: '#00e87a' },
          { label: 'Avg LOI',       val: data.kpi.avgLoi,    color: '#ff9f43' },
          { label: 'Avg IR',        val: data.kpi.avgIr,     color: '#7b2fff' },
          { label: 'Total Cost',    val: data.kpi.totalCost, color: '#ff6b6b' },
        ]} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <PieSection title="RFQs By Day" data={dayPieData} loading={loading} />
        <PieSection title="By Industry"    data={data?.byIndustry || []}    loading={loading} />
        <PieSection title="By Methodology" data={data?.byMethodology || []} loading={loading} />
        <PieSection title="By Market"      data={data?.byMarket || []}      loading={loading} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE 2 — CLIENT DATABASE
// ══════════════════════════════════════════════════════════════
function ClientAnalytics({ selectedUser, selectedMonday, setSelectedMonday, refreshKey }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const { data, loading, error, load } = usePanelData(
    () => api.getClientCharts(selectedUser, selectedMonday), [selectedUser, selectedMonday, refreshKey]);

  const syncUser = async () => {
    if (!selectedUser) {
      setSyncMsg({ type: 'warn', text: 'All Users is being synced automatically. Pick a specific user to sync only their Client Database sheet.' });
      return;
    }
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.syncClientSheet(selectedUser);
      setSyncMsg({ type: 'ok', text: `✓ Synced ${r.total} rows from the Client Database sheet (${r.totalInDB} stored).` });
      await load();
    } catch (e) {
      setSyncMsg({ type: 'err', text: `✕ Sync failed: ${e.message}` });
    }
    setSyncing(false);
  };

  const dayPieData = (data?.days || []).map(d => ({ name: d.label, value: d.count }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {data?.weekLabel && <span style={{ fontSize: 11, color: '#5a8a9f' }}>📅 {data.weekLabel} · {data.weekTotal} clients in this week</span>}
          {error && <span style={{ fontSize: 11, color: '#ff6b6b' }}>⚠ {error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ReportDownloader sheet="client" anchorDate={selectedMonday} userId={selectedUser} accentColor="#00d4ff" label="Report" />
          <button onClick={syncUser} disabled={syncing} style={syncBtn}>
            <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
            {syncing ? 'Syncing…' : 'Sync Client Sheet'}
          </button>
          <button onClick={load} disabled={loading} style={refreshBtn}>↻ Refresh</button>
        </div>
      </div>

      <SyncMsg msg={syncMsg} />
      <PanelNotices data={data} sheetLabel="Client Database" onJumpToWeek={setSelectedMonday} />

      {data && (
        <KpiRow kpis={[
          { label: 'New Clients',      val: data.kpi.total,      color: '#00d4ff' },
          { label: 'Intro Sent',       val: data.kpi.introSent,  color: '#00e87a' },
          { label: 'Followed Up',      val: data.kpi.followedUp, color: '#7b2fff' },
          { label: 'Pending Follow-up', val: data.kpi.pending,   color: '#ff9f43' },
        ]} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        <PieSection title="New Clients By Day"   data={dayPieData} loading={loading} />
        <PieSection title="By Designation"       data={data?.byDesignation || []} loading={loading} />
        <PieSection title="By Company"           data={data?.byCompany || []}     loading={loading} />
        <PieSection title="Follow-up Status"     data={data?.followUpPie || []}   loading={loading} />
        <PieSection title="Intro Mail Status"    data={data?.introMailPie || []}  loading={loading} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE 3 — PROJECT TRACKER
// ══════════════════════════════════════════════════════════════
const PIE_CATS = [
  { key: 'market',         label: 'Market' },
  { key: 'methodology',    label: 'Methodology' },
  { key: 'project_status', label: 'Project Status' },
  { key: 'invoice_status', label: 'Invoice Status' },
];

function ProjectAnalytics({ selectedUser, selectedMonday, setSelectedMonday, refreshKey }) {
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState(null);
  const [pieCategory, setPieCategory] = useState('market');
  const { data, loading, error, load } = usePanelData(
    () => api.getProjectCharts(selectedUser, selectedMonday), [selectedUser, selectedMonday, refreshKey]);

  const syncUser = async () => {
    if (!selectedUser) {
      setSyncMsg({ type: 'warn', text: 'All Users is being synced automatically. Pick a specific user to sync only their Project Tracker sheet.' });
      return;
    }
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await api.syncUserSheet(selectedUser);
      setSyncMsg({ type: 'ok', text: `✓ Synced successfully (${r.inserted || 0} new, ${r.updated || 0} updated)` });
      await load();
    } catch (e) {
      setSyncMsg({ type: 'err', text: `✕ Sync failed: ${e.message}` });
    }
    setSyncing(false);
  };

  const dayPieData = (data?.days || []).map(d => ({ name: d.label, value: d.count }));
  const catLabel = PIE_CATS.find(c => c.key === pieCategory)?.label || 'Category';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {data?.weekLabel && <span style={{ fontSize: 11, color: '#5a8a9f' }}>📅 {data.weekLabel} · {data.weekTotal} entries in this week</span>}
          {error && <span style={{ fontSize: 11, color: '#ff6b6b' }}>⚠ {error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ReportDownloader sheet="project" anchorDate={selectedMonday} userId={selectedUser} accentColor="#00d4ff" label="Report" />
          <select
            value={pieCategory}
            onChange={e => setPieCategory(e.target.value)}
            style={{ background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff', fontSize: 11, padding: '5px 8px', borderRadius: 4, outline: 'none', fontFamily: "'Exo 2',sans-serif", cursor: 'pointer' }}
          >
            {PIE_CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button onClick={syncUser} disabled={syncing} style={syncBtn}>
            <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
            {syncing ? 'Syncing…' : 'Sync Project Sheet'}
          </button>
          <button onClick={load} disabled={loading} style={refreshBtn}>↻ Refresh</button>
        </div>
      </div>

      <SyncMsg msg={syncMsg} />
      <PanelNotices data={data} sheetLabel="Project Tracker" onJumpToWeek={setSelectedMonday} />

      {data && (
        <KpiRow kpis={[
          { label: 'Projects',      val: data.kpi.projects,  color: '#00d4ff' },
          { label: 'Achieved N',    val: data.kpi.achievedN, color: '#00e87a' },
          { label: 'Avg CPI (USD)', val: data.kpi.avgCpi,    color: '#ff9f43' },
          { label: 'Gross Margin',  val: data.kpi.avgMargin, color: '#7b2fff' },
          { label: 'Amount',        val: data.kpi.amount,    color: '#ff6b6b' },
        ]} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <PieSection title="Project Entries By Day" data={dayPieData} loading={loading} />
        <PieSection title={`By ${catLabel}`} data={data?.pies?.[pieCategory] || []} loading={loading} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SHEET DEFINITIONS
// ══════════════════════════════════════════════════════════════
const SHEETS = [
  { key: 'rfq',     label: 'RFQ Tracker',    icon: '📋', desc: 'Page 1 — RFQ enquiries, industries, cost analysis' },
  { key: 'client',  label: 'Client Database', icon: '🏢', desc: 'Page 2 — New clients, follow-ups, intro mail tracking' },
  { key: 'project', label: 'Project Tracker', icon: '📊', desc: 'Page 3 — Projects, achieved N, CPI, gross margin' },
];

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════
export default function SheetAnalytics() {
  const { users } = useAuth();
  const [activeSheet,    setActiveSheet]    = useState('rfq');
  const [selectedUser,   setSelectedUser]   = useState(null);
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);

  // ── Auto-sync ──────────────────────────────────────────────
  // Whenever a user (or "All Users") is opened, pull the latest RFQ, Client
  // and Project sheets first, then reload the charts — so the panels always
  // reflect the live Google Sheets without pressing any button.
  // Throttled to once per 90 s per selection.
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoSync, setAutoSync] = useState({ state: 'idle', text: '' });
  const lastSyncRef = useRef({});

  const runAutoSync = useCallback(async (userId, force = false) => {
    const key = userId || 'all';
    const last = lastSyncRef.current[key] || 0;
    if (!force && Date.now() - last < 90 * 1000) return;
    lastSyncRef.current[key] = Date.now();
    setAutoSync({ state: 'syncing', text: 'Syncing latest data from Google Sheets…' });
    try {
      const r = userId ? await api.syncUserAllSheets(userId) : await api.syncAllSheets();
      const linked = (r.results || []).filter(x => x.linked !== false && !x.skipped);
      const failed = linked.filter(x => !x.success);
      const names = { rfq: 'RFQ', client: 'Client DB', project: 'Project' };
      if (linked.length === 0) {
        setAutoSync({ state: 'info', text: 'No Google Sheet links set yet — showing stored / sample data.' });
      } else if (failed.length) {
        setAutoSync({ state: 'warn', text: `Synced with issues — ${failed.map(f => `${names[f.sheet] || f.sheet}: ${f.error}`).join(' · ')}` });
      } else {
        setAutoSync({ state: 'ok', text: `Up to date · synced ${new Date().toLocaleTimeString()}` });
      }
    } catch (e) {
      setAutoSync({ state: 'warn', text: `Auto-sync unavailable (${e.message}) — showing stored data.` });
    }
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => { runAutoSync(selectedUser); }, [selectedUser, runAutoSync]);

  const activeUsers = users.filter(u => u.status === 'Active');

  const activeSheetMeta = SHEETS.find(s => s.key === activeSheet);

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: "'Orbitron', monospace", fontSize: 22, fontWeight: 700, color: '#e0f4ff', marginBottom: 6 }}>
            Sheet Analytics
          </h1>
          <p style={{ fontSize: 12, color: '#5a8a9f' }}>
            Live charts from each user's Google Spreadsheet — pick a sheet type and user below
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <WeekPicker selectedMonday={selectedMonday} onChange={setSelectedMonday} accentColor="#00d4ff" />
          <ReportDownloader
            sheet="consolidated"
            anchorDate={selectedMonday}
            userId={selectedUser}
            accentColor="#7b2fff"
            label="Consolidated Report"
          />
        </div>
      </div>

      {autoSync.state !== 'idle' && (
        <div style={{ fontSize: 11, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          color: autoSync.state === 'ok' ? '#00e87a' : autoSync.state === 'warn' ? '#ff9f43' : autoSync.state === 'syncing' ? '#00d4ff' : '#5a8a9f' }}>
          <span style={{ display: 'inline-block', animation: autoSync.state === 'syncing' ? 'spin 1s linear infinite' : 'none' }}>{autoSync.state === 'ok' ? '✓' : autoSync.state === 'warn' ? '⚠' : '⟳'}</span>
          <span>{autoSync.text}</span>
          {autoSync.state !== 'syncing' && (
            <button onClick={() => runAutoSync(selectedUser, true)} style={{ background: 'none', border: '1px solid currentColor', color: 'inherit', fontSize: 10, padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: "'Exo 2', sans-serif" }}>Sync now</button>
          )}
        </div>
      )}

      {/* Sheet type + User selector row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Sheet type */}
        <div style={{ background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>
            📂 Sheet Type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SHEETS.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveSheet(s.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 6, border: `1px solid ${activeSheet === s.key ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.08)'}`,
                  background: activeSheet === s.key ? 'rgba(0,212,255,0.09)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: activeSheet === s.key ? '#00d4ff' : '#a0c8d8', fontSize: 13, fontWeight: 600, fontFamily: "'Exo 2', sans-serif" }}>{s.label}</div>
                  <div style={{ color: '#3a6070', fontSize: 10, marginTop: 2 }}>{s.desc}</div>
                </div>
                {activeSheet === s.key && <span style={{ marginLeft: 'auto', color: '#00d4ff', fontSize: 8 }}>●</span>}
              </button>
            ))}
          </div>
        </div>

        {/* User selector */}
        <div style={{ background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 8, padding: 20, overflowY: 'auto', maxHeight: 280 }}>
          <div style={{ fontSize: 11, color: '#5a8a9f', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, fontWeight: 600 }}>
            👤 User
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* All Users option */}
            <button
              onClick={() => setSelectedUser(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 5, width: '100%',
                border: `1px solid ${selectedUser === null ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.08)'}`,
                background: selectedUser === null ? 'rgba(0,212,255,0.09)' : 'transparent',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#00d4ff,#0050cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0 }}>⬡</div>
              <div>
                <div style={{ color: selectedUser === null ? '#00d4ff' : '#a0c8d8', fontSize: 13, fontWeight: 600, fontFamily: "'Exo 2', sans-serif" }}>All Users</div>
                <div style={{ color: '#3a6070', fontSize: 10 }}>Aggregate across all users</div>
              </div>
              {selectedUser === null && <span style={{ marginLeft: 'auto', color: '#00d4ff', fontSize: 8 }}>●</span>}
            </button>

            {/* Individual users */}
            {activeUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUser(u.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 5, width: '100%',
                  border: `1px solid ${selectedUser === u.id ? 'rgba(0,212,255,0.45)' : 'rgba(0,212,255,0.08)'}`,
                  background: selectedUser === u.id ? 'rgba(0,212,255,0.09)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#7b2fff,#0050cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                  {u.name[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: selectedUser === u.id ? '#00d4ff' : '#a0c8d8', fontSize: 13, fontWeight: 600, fontFamily: "'Exo 2', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name}
                  </div>
                  <div style={{ color: '#3a6070', fontSize: 10 }}>{u.role} · {u.department}</div>
                </div>
                {selectedUser === u.id && <span style={{ color: '#00d4ff', fontSize: 8, flexShrink: 0 }}>●</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedUser && (
        <div style={{ marginBottom: 20 }}>
          <PerformanceScorecard
            userId={selectedUser}
            title={`${users.find(u => u.id === selectedUser)?.name || 'User'} — Performance Scorecard`}
          />
        </div>
      )}

      {/* Analytics panel */}
      <div style={{ background: 'rgba(10,18,32,0.85)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 8, padding: 24 }}>
        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, borderBottom: '1px solid rgba(0,212,255,0.08)', paddingBottom: 16 }}>
          <span style={{ fontSize: 24 }}>{activeSheetMeta?.icon}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e0f4ff', fontFamily: "'Exo 2', sans-serif" }}>
              {activeSheetMeta?.label}
            </div>
            <div style={{ fontSize: 11, color: '#5a8a9f', marginTop: 2 }}>
              {selectedUser
                ? `Viewing: ${users.find(u => u.id === selectedUser)?.name || 'Selected User'}`
                : 'Viewing: All Users (aggregated)'}
              {' · '}
              {activeSheet === 'rfq'     && 'RFQ enquiries, cost and audience breakdown'}
              {activeSheet === 'client'  && 'New client contacts, follow-up and intro mail tracking'}
              {activeSheet === 'project' && 'Project entries, market and methodology breakdown'}
            </div>
          </div>
        </div>

        {/* Active analytics component */}
        {activeSheet === 'rfq'     && <RfqAnalytics     selectedUser={selectedUser} selectedMonday={selectedMonday} setSelectedMonday={setSelectedMonday} refreshKey={refreshKey} />}
        {activeSheet === 'client'  && <ClientAnalytics  selectedUser={selectedUser} selectedMonday={selectedMonday} setSelectedMonday={setSelectedMonday} refreshKey={refreshKey} />}
        {activeSheet === 'project' && <ProjectAnalytics selectedUser={selectedUser} selectedMonday={selectedMonday} setSelectedMonday={setSelectedMonday} refreshKey={refreshKey} />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
