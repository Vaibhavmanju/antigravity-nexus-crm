import React, { useState } from 'react';
import { useAuth, ViewAsUserProvider } from '../context/AuthContext';
import api, { setTokenOverride } from '../services/api';
import UserDashboard from './UserDashboard';
import TeamRollup from './TeamRollup';
import PerformanceScorecard from './PerformanceScorecard';
import PerformanceHistoryGraph from './PerformanceHistoryGraph';
import NotificationBell from './NotificationBell';

export default function TeamLeadDashboard() {
  const { currentUser, logout } = useAuth();
  const [selectedMember, setSelectedMember] = useState(null);
  const [portalMember, setPortalMember] = useState(null); // member whose personal portal is open
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  // Open a team member's own portal (what they see after logging in) so the
  // team leader can review and enter their details.
  const openPortal = async (m) => {
    setPortalError('');
    setPortalLoading(true);
    try {
      const { token } = await api.teamLeadViewAs(m.id);
      setTokenOverride(token);
      const profile = await api.getMyProfile();
      setPortalMember(profile);
    } catch (e) {
      setTokenOverride(null);
      setPortalError(e.message || 'Could not open this user\'s portal');
    }
    setPortalLoading(false);
  };

  const closePortal = () => {
    setTokenOverride(null);
    setPortalMember(null);
  };

  if (portalMember) {
    return (
      <ViewAsUserProvider member={portalMember} onExit={closePortal}>
        <UserDashboard />
      </ViewAsUserProvider>
    );
  }

  return (
    <div className="tld-root">
      <div className="tld-bg-grid" />

      <header className="tld-header">
        <div className="tld-brand">
          <span className="tld-logo">ANTIGRAVITY NEXUS CRM</span>
          <span className="tld-badge">⛁ Team Leader Portal</span>
        </div>
        <div className="tld-header-right">
          <NotificationBell />
          <div className="tld-user">
            <span className="tld-user-name">{currentUser?.name}</span>
            <span className="tld-user-sub">{currentUser?.teamSize ?? 0} direct report{currentUser?.teamSize === 1 ? '' : 's'}</span>
          </div>
          <button className="tld-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="tld-main">
        <div className="tld-welcome">
          <h1>Welcome back, {currentUser?.name?.split(' ')[0] || 'there'}</h1>
          <p>Here's how the users assigned to you by your admin are performing.</p>
        </div>

        <TeamRollup
          title="My Team"
          onSelectMember={(m) => setSelectedMember(prev => (prev?.id === m.id ? null : m))}
          selectedId={selectedMember?.id}
          onOpenPortal={openPortal}
        />

        {portalLoading && <div className="tld-empty-hint">Opening user portal…</div>}
        {portalError && <div className="tld-portal-error">⚠ {portalError}</div>}

        {selectedMember ? (
          <div className="tld-drilldown">
            <div className="tld-drilldown-head">
              <span>Viewing <strong>{selectedMember.name}</strong>'s full performance</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="tld-open-btn" onClick={() => openPortal(selectedMember)} disabled={portalLoading}>
                  ⬡ Open {selectedMember.name.split(' ')[0]}'s User Portal →
                </button>
                <button className="tld-close-btn" onClick={() => setSelectedMember(null)}>✕ Close</button>
              </div>
            </div>
            <div className="tld-drilldown-body">
              <PerformanceScorecard userId={selectedMember.id} title={`${selectedMember.name} — Scorecard`} />
              <PerformanceHistoryGraph userId={selectedMember.id} />
            </div>
          </div>
        ) : (
          <div className="tld-empty-hint">💡 Click any row above to see that person's scorecard, or use “Open Portal” to enter their user page and fill in their details.</div>
        )}
      </main>

      <style>{tldStyles}</style>
    </div>
  );
}

const tldStyles = `
  .tld-root { min-height: 100vh; background: radial-gradient(ellipse at top, #0a1f14 0%, #050a08 60%); font-family: 'Exo 2', sans-serif; color: #d4ffe0; position: relative; }
  .tld-bg-grid { position: fixed; inset: 0; z-index: 0; background-image: linear-gradient(rgba(0,232,122,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,232,122,0.03) 1px, transparent 1px); background-size: 60px 60px; }
  .tld-header {
    position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px; background: rgba(5,10,8,0.85); backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(0,232,122,0.12); flex-wrap: wrap; gap: 12px;
  }
  .tld-brand { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .tld-logo { font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 900; color: #00e87a; letter-spacing: 3px; }
  .tld-badge { font-size: 11px; padding: 4px 12px; border-radius: 20px; background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.3); color: #00e87a; letter-spacing: 1px; }
  .tld-header-right { display: flex; align-items: center; gap: 16px; }
  .tld-user { display: flex; flex-direction: column; align-items: flex-end; }
  .tld-user-name { font-size: 13px; font-weight: 600; color: #d4ffe0; }
  .tld-user-sub { font-size: 10px; color: #4a7f5a; }
  .tld-logout { background: rgba(255,80,80,0.08); border: 1px solid rgba(255,80,80,0.25); color: #ff8888; font-size: 11px; padding: 7px 16px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; }
  .tld-logout:hover { background: rgba(255,80,80,0.16); }
  .tld-main { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 28px 24px 60px; }
  .tld-welcome { margin-bottom: 24px; }
  .tld-welcome h1 { font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 700; color: #d4ffe0; margin: 0 0 6px; }
  .tld-welcome p { font-size: 13px; color: #6a9a7a; margin: 0; }
  .tld-drilldown { margin-top: 20px; background: rgba(10,32,18,0.6); border: 1px solid rgba(0,232,122,0.15); border-radius: 8px; padding: 20px; }
  .tld-drilldown-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-size: 13px; color: #9fd4b0; flex-wrap: wrap; gap: 8px; }
  .tld-close-btn { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.25); color: #00e87a; font-size: 11px; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; }
  .tld-open-btn { background: linear-gradient(135deg, #00e87a, #00a854); border: none; color: #04140a; font-weight: 700; font-size: 11px; padding: 6px 14px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; }
  .tld-open-btn:disabled { opacity: 0.6; cursor: wait; }
  .tld-portal-error { margin-top: 14px; padding: 10px 14px; background: rgba(255,60,60,0.08); border: 1px solid rgba(255,60,60,0.25); border-radius: 6px; color: #ff8888; font-size: 12px; }
  .tld-drilldown-body { display: flex; flex-direction: column; gap: 16px; }
  .tld-empty-hint { margin-top: 16px; font-size: 12px; color: #4a7f5a; text-align: center; padding: 16px; }
  @media (max-width: 700px) {
    .tld-header { padding: 14px 16px; }
    .tld-main { padding: 20px 14px 40px; }
  }
`;
