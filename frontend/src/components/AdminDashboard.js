import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import UserDetails from './UserDetails';
import IndividualUserView from './IndividualUserView';
import MasterSheet from './MasterSheet';
import DashboardHome from './DashboardHome';
import ActivityFeed from './ActivityFeed';
import SheetAnalytics from './SheetAnalytics';
import PowerBIPanel from './PowerBIPanel';
import TeamRollup from './TeamRollup';
import NotificationBell from './NotificationBell';

const menuItems = [
  { id: 'dashboard',      label: 'Dashboard',       icon: '◈' },
  { id: 'sheet-analytics',label: 'Sheet Analytics', icon: '📊' },
  { id: 'powerbi',        label: 'Power BI Insights', icon: '📈' },
  { id: 'team',           label: 'Team Rollup',     icon: '⛁' },
  { id: 'users',          label: 'User Details',    icon: '◉' },
  { id: 'individual',     label: 'Individual Users',icon: '⬡' },
  { id: 'mastersheet',    label: 'Master Sheet',    icon: '▦' },
  { id: 'activity',       label: 'Activity Feed',   icon: '⟁' },
];

export default function AdminDashboard() {
  const { logout, currentUser } = useAuth();
  const [active, setActive] = useState('dashboard');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleUserSelect = (id) => {
    setSelectedUserId(id);
    setActive('individual');
    setSidebarOpen(false);
  };

  return (
    <div className="dash-root">
      <div className="grid-bg" />

      {/* Mobile hamburger */}
      <button className="ad-hamburger" onClick={() => setSidebarOpen(o => !o)}>
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-logo">AN</div>
          <div className="brand-text">
            <div className="brand-name">ANTIGRAVITY</div>
            <div className="brand-sub">NEXUS CRM PLATFORM</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${active === item.id ? 'active' : ''}`}
              onClick={() => { setActive(item.id); if (item.id !== 'individual') setSelectedUserId(null); setSidebarOpen(false); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {active === item.id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="admin-avatar">A</div>
          <div className="admin-info">
            <div className="admin-name">{currentUser?.name || 'Admin'}</div>
            <div className="admin-role">Administrator</div>
          </div>
          <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
        </div>
      </aside>

      {sidebarOpen && <div className="ad-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main Content */}
      <main className="dash-main">
        <header className="dash-header">
          <div className="header-breadcrumb">
            <span className="bc-root">CRM</span>
            <span className="bc-sep">›</span>
            <span className="bc-current">{menuItems.find(m => m.id === active)?.label || 'Dashboard'}</span>
          </div>
          <div className="header-right">
            <NotificationBell />
            <div className="header-status"><span className="status-dot" />LIVE</div>
            <div className="header-time">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          </div>
        </header>

        <div className="dash-content">
          {active === 'dashboard'       && <DashboardHome onNavigate={setActive} onUserSelect={handleUserSelect} />}
          {active === 'sheet-analytics' && <SheetAnalytics />}
          {active === 'powerbi'         && <PowerBIPanel />}
          {active === 'team'            && <TeamRollup title="Organization-wide Team Rollup" />}
          {active === 'users'           && <UserDetails onUserSelect={handleUserSelect} />}
          {active === 'individual'      && <IndividualUserView selectedUserId={selectedUserId} onUserSelect={setSelectedUserId} />}
          {active === 'mastersheet'     && <MasterSheet />}
          {active === 'activity'        && <ActivityFeed />}
        </div>
      </main>

      <style>{dashStyles}</style>
    </div>
  );
}

const dashStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .dash-root { display: flex; min-height: 100vh; background: #020408; font-family: 'Exo 2', sans-serif; color: #e0f4ff; position: relative; }
  .grid-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; background-image: linear-gradient(rgba(0,200,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.03) 1px, transparent 1px); background-size: 40px 40px; }

  .ad-hamburger { display: none; position: fixed; top: 14px; left: 14px; z-index: 200; background: rgba(5,10,20,0.9); border: 1px solid rgba(0,212,255,0.3); color: #00d4ff; font-size: 20px; width: 40px; height: 40px; border-radius: 8px; cursor: pointer; align-items: center; justify-content: center; }
  .ad-overlay { display: none; position: fixed; inset: 0; z-index: 45; background: rgba(2,4,8,0.7); }

  .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 240px; z-index: 50; background: rgba(5,10,20,0.97); backdrop-filter: blur(20px); border-right: 1px solid rgba(0,212,255,0.1); display: flex; flex-direction: column; transition: transform 0.3s; }
  .sidebar-brand { padding: 28px 20px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(0,212,255,0.08); }
  .brand-logo { width: 38px; height: 38px; border-radius: 6px; background: linear-gradient(135deg, #00b8e0, #0050cc); display: flex; align-items: center; justify-content: center; font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 900; color: #fff; box-shadow: 0 0 16px rgba(0,150,255,0.4); }
  .brand-name { font-family: 'Orbitron', monospace; font-size: 14px; font-weight: 700; color: #00d4ff; letter-spacing: 2px; }
  .brand-sub { font-size: 9px; color: #3a6070; letter-spacing: 3px; text-transform: uppercase; margin-top: 2px; }
  .sidebar-nav { flex: 1; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nav-item { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 6px; cursor: pointer; background: transparent; border: none; color: #5a8a9f; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 500; text-align: left; transition: all 0.2s; letter-spacing: 0.5px; width: 100%; }
  .nav-item:hover { background: rgba(0,212,255,0.06); color: #a0c8d8; }
  .nav-item.active { background: rgba(0,212,255,0.1); color: #00d4ff; }
  .nav-icon { font-size: 16px; width: 20px; text-align: center; }
  .nav-indicator { position: absolute; left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 20px; background: #00d4ff; border-radius: 0 2px 2px 0; box-shadow: 0 0 8px rgba(0,212,255,0.6); }
  .sidebar-footer { padding: 16px; border-top: 1px solid rgba(0,212,255,0.08); display: flex; align-items: center; gap: 10px; }
  .admin-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #7b2fff); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .admin-info { flex: 1; min-width: 0; }
  .admin-name { font-size: 13px; font-weight: 600; color: #e0f4ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .admin-role { font-size: 10px; color: #3a6070; letter-spacing: 1.5px; text-transform: uppercase; }
  .logout-btn { background: none; border: none; color: #5a8a9f; cursor: pointer; font-size: 18px; padding: 4px; transition: color 0.2s; }
  .logout-btn:hover { color: #ff6b6b; }
  
  .dash-main { margin-left: 240px; flex: 1; display: flex; flex-direction: column; min-height: 100vh; position: relative; z-index: 1; }
  .dash-header { padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; background: rgba(5,10,20,0.7); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,212,255,0.08); position: sticky; top: 0; z-index: 10; }
  .header-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .bc-root { color: #3a6070; }
  .bc-sep { color: #3a6070; }
  .bc-current { color: #e0f4ff; font-weight: 600; }
  .header-right { display: flex; align-items: center; gap: 20px; }
  .header-status { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: #00e87a; letter-spacing: 2px; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #00e87a; box-shadow: 0 0 8px #00e87a; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .header-time { font-size: 12px; color: #5a8a9f; }
  .dash-content { flex: 1; padding: 32px; overflow-y: auto; }

  @media (max-width: 900px) {
    .ad-hamburger { display: flex; }
    .ad-overlay { display: block; }
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .dash-main { margin-left: 0; }
    .dash-header { padding: 16px 16px 16px 64px; }
    .dash-content { padding: 20px 16px; }
  }
`;
