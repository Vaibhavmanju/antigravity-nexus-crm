import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import AdminLogin from './AdminLogin';
import AdminDashboard from './AdminDashboard';
import UserLogin from './UserLogin';
import UserDashboard from './UserDashboard';
import TeamLeadLogin from './TeamLeadLogin';
import TeamLeadDashboard from './TeamLeadDashboard';

export default function LandingPage() {
  const { isAdmin, isUserLoggedIn, isTeamLeadLoggedIn } = useAuth();
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showTeamLeadModal, setShowTeamLeadModal] = useState(false);

  if (isAdmin) return <AdminDashboard />;
  if (isTeamLeadLoggedIn) return <TeamLeadDashboard />;
  if (isUserLoggedIn) return <UserDashboard />;

  return (
    <div className="landing-root">
      <div className="grid-bg" />
      <div className="nebula-1" />
      <div className="nebula-2" />

      {/* Top Nav */}
      <nav className="top-nav">
        <div className="nav-logo">AN</div>
        <div className="nav-actions">
          <button className="btn-nav" onClick={() => setShowAdminModal(true)}>
            <span className="btn-icon">⬡</span> Admin
          </button>
          <button className="btn-nav btn-nav-teamlead" onClick={() => setShowTeamLeadModal(true)}>
            <span className="btn-icon">⛁</span> Team Leader
          </button>
          <button className="btn-nav btn-nav-user" onClick={() => setShowUserModal(true)}>
            <span className="btn-icon">◉</span> User Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="hero">
        <div className="hero-badge">NEXT-GEN CRM PLATFORM</div>
        <h1 className="hero-title">
          <span className="title-top">ANTIGRAVITY</span>
          <span className="title-mid">NEXUS</span>
          <span className="title-bot">CRM</span>
        </h1>
        <p className="hero-sub">
          Transcend conventional limits. Manage your teams, track performance,<br />
          and connect your data across dimensions.
        </p>
        <div className="hero-cta-group">
          <button className="btn-primary" onClick={() => setShowAdminModal(true)}>
            Launch Admin Portal
          </button>
          <button className="btn-outline-teamlead" onClick={() => setShowTeamLeadModal(true)}>
            Team Leader Login
          </button>
          <button className="btn-outline-user" onClick={() => setShowUserModal(true)}>
            User Login
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          {[['4+', 'Team Members'], ['100%', 'Data Sync'], ['Real-time', 'Analytics'], ['Secure', 'Access Control']].map(([val, label]) => (
            <div className="stat-card" key={label}>
              <span className="stat-val">{val}</span>
              <span className="stat-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Role cards */}
        <div className="role-cards">
          <div className="role-card admin-card" onClick={() => setShowAdminModal(true)}>
            <div className="rc-icon">⬡</div>
            <div className="rc-title">Admin Portal</div>
            <div className="rc-desc">Full control over users, data, Google Sheets, and performance analytics</div>
            <div className="rc-cta">Enter Admin →</div>
          </div>
          <div className="role-card teamlead-card" onClick={() => setShowTeamLeadModal(true)}>
            <div className="rc-icon">⛁</div>
            <div className="rc-title">Team Leader Portal</div>
            <div className="rc-desc">View the performance of the users your admin has assigned to you</div>
            <div className="rc-cta">Enter Team Portal →</div>
          </div>
          <div className="role-card user-card" onClick={() => setShowUserModal(true)}>
            <div className="rc-icon">◉</div>
            <div className="rc-title">User Portal</div>
            <div className="rc-desc">Log your performance, manage tasks, and access your personal dashboard</div>
            <div className="rc-cta">Login as User →</div>
          </div>
        </div>
      </main>

      {showAdminModal && <AdminLogin onClose={() => setShowAdminModal(false)} />}
      {showUserModal && <UserLogin onClose={() => setShowUserModal(false)} />}
      {showTeamLeadModal && <TeamLeadLogin onClose={() => setShowTeamLeadModal(false)} />}

      <style>{landingStyles}</style>
    </div>
  );
}

const landingStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #020408; }
  .landing-root { min-height: 100vh; background: #020408; font-family: 'Exo 2', sans-serif; color: #e0f4ff; overflow-x: hidden; position: relative; }
  .grid-bg { position: fixed; inset: 0; z-index: 0; background-image: linear-gradient(rgba(0,200,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.04) 1px, transparent 1px); background-size: 60px 60px; }
  .nebula-1 { position: fixed; top: -200px; right: -200px; width: 700px; height: 700px; border-radius: 50%; background: radial-gradient(circle, rgba(0,150,255,0.1) 0%, transparent 70%); z-index: 0; }
  .nebula-2 { position: fixed; bottom: -300px; left: -200px; width: 800px; height: 800px; border-radius: 50%; background: radial-gradient(circle, rgba(120,0,255,0.07) 0%, transparent 70%); z-index: 0; }
  .top-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 18px 48px; background: rgba(2,4,8,0.8); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(0,200,255,0.1); }
  .nav-logo { font-family: 'Orbitron', monospace; font-size: 20px; font-weight: 900; color: #00d4ff; letter-spacing: 4px; text-shadow: 0 0 20px rgba(0,212,255,0.6); }
  .nav-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .btn-nav { display: flex; align-items: center; gap: 8px; padding: 10px 24px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.4); color: #00d4ff; transition: all 0.2s; }
  .btn-nav:hover { background: rgba(0,212,255,0.2); box-shadow: 0 0 20px rgba(0,212,255,0.2); }
  .btn-nav-user { background: rgba(123,47,255,0.1); border-color: rgba(123,47,255,0.4); color: #9b59ff; }
  .btn-nav-user:hover { background: rgba(123,47,255,0.2); box-shadow: 0 0 20px rgba(123,47,255,0.2); }
  .btn-nav-teamlead { background: rgba(0,232,122,0.1); border-color: rgba(0,232,122,0.4); color: #00e87a; }
  .btn-nav-teamlead:hover { background: rgba(0,232,122,0.2); box-shadow: 0 0 20px rgba(0,232,122,0.2); }
  .btn-icon { font-size: 16px; }
  .hero { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 100px 24px 60px; }
  .hero-badge { display: inline-block; padding: 6px 20px; border-radius: 2px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.3); color: #00d4ff; font-size: 11px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 40px; }
  .hero-title { display: flex; flex-direction: column; line-height: 0.9; font-family: 'Orbitron', monospace; margin-bottom: 32px; }
  .title-top { display: block; font-size: clamp(16px, 3vw, 38px); font-weight: 700; letter-spacing: 16px; color: #00d4ff; text-shadow: 0 0 24px rgba(0,212,255,0.45); margin-bottom: 4px; }
  .title-mid { font-size: clamp(56px, 12vw, 160px); font-weight: 900; letter-spacing: 8px; background: linear-gradient(135deg, #00d4ff 0%, #7b2fff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0 0 40px rgba(0,212,255,0.3)); }
  .title-bot { font-size: clamp(28px, 5vw, 80px); font-weight: 400; color: rgba(224,244,255,0.3); letter-spacing: 20px; }
  .hero-sub { max-width: 540px; font-size: 15px; line-height: 1.7; color: #7aa8bf; margin-bottom: 48px; font-weight: 300; }
  .hero-cta-group { display: flex; gap: 16px; margin-bottom: 60px; flex-wrap: wrap; justify-content: center; }
  .btn-primary { padding: 14px 36px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; background: linear-gradient(135deg, #00b8e0 0%, #0070ff 100%); border: none; color: #fff; box-shadow: 0 0 30px rgba(0,150,255,0.4); transition: all 0.2s; }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 4px 40px rgba(0,150,255,0.6); }
  .btn-outline-user { padding: 14px 36px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; background: rgba(123,47,255,0.1); border: 1px solid rgba(123,47,255,0.5); color: #9b59ff; transition: all 0.2s; }
  .btn-outline-user:hover { background: rgba(123,47,255,0.2); box-shadow: 0 0 24px rgba(123,47,255,0.3); }
  .btn-outline-teamlead { padding: 14px 36px; border-radius: 4px; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; background: rgba(0,232,122,0.1); border: 1px solid rgba(0,232,122,0.5); color: #00e87a; transition: all 0.2s; }
  .btn-outline-teamlead:hover { background: rgba(0,232,122,0.2); box-shadow: 0 0 24px rgba(0,232,122,0.3); }
  .stats-row { display: flex; gap: 2px; background: rgba(0,212,255,0.06); border: 1px solid rgba(0,212,255,0.1); border-radius: 6px; overflow: hidden; margin-bottom: 48px; flex-wrap: wrap; }
  .stat-card { flex: 1; min-width: 120px; padding: 20px 24px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: rgba(2,4,8,0.6); border-right: 1px solid rgba(0,212,255,0.08); }
  .stat-card:last-child { border-right: none; }
  .stat-val { font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 700; color: #00d4ff; }
  .stat-label { font-size: 11px; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .role-cards { display: flex; gap: 20px; max-width: 940px; width: 100%; flex-wrap: wrap; justify-content: center; }
  .role-card { flex: 1; min-width: 260px; padding: 32px; border-radius: 10px; cursor: pointer; transition: all 0.25s; text-align: left; }
  .admin-card { background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.2); }
  .admin-card:hover { border-color: rgba(0,212,255,0.5); background: rgba(0,212,255,0.08); transform: translateY(-3px); box-shadow: 0 8px 40px rgba(0,212,255,0.1); }
  .user-card { background: rgba(123,47,255,0.04); border: 1px solid rgba(123,47,255,0.2); }
  .user-card:hover { border-color: rgba(123,47,255,0.5); background: rgba(123,47,255,0.08); transform: translateY(-3px); box-shadow: 0 8px 40px rgba(123,47,255,0.1); }
  .teamlead-card { background: rgba(0,232,122,0.04); border: 1px solid rgba(0,232,122,0.2); }
  .teamlead-card:hover { border-color: rgba(0,232,122,0.5); background: rgba(0,232,122,0.08); transform: translateY(-3px); box-shadow: 0 8px 40px rgba(0,232,122,0.1); }
  .rc-icon { font-size: 32px; margin-bottom: 14px; }
  .admin-card .rc-icon { color: #00d4ff; }
  .user-card .rc-icon { color: #9b59ff; }
  .teamlead-card .rc-icon { color: #00e87a; }
  .rc-title { font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 700; color: #e0f4ff; margin-bottom: 8px; }
  .rc-desc { font-size: 13px; color: #5a8a9f; line-height: 1.6; margin-bottom: 16px; }
  .rc-cta { font-size: 12px; font-weight: 600; letter-spacing: 1px; }
  .admin-card .rc-cta { color: #00d4ff; }
  .user-card .rc-cta { color: #9b59ff; }
  .teamlead-card .rc-cta { color: #00e87a; }
  @media (max-width: 600px) {
    .top-nav { padding: 14px 20px; }
    .btn-nav { padding: 8px 14px; font-size: 11px; }
    .hero { padding: 80px 16px 40px; }
    .hero-sub { font-size: 13px; }
    .role-cards { flex-direction: column; }
    .role-card { min-width: unset; }
  }
`;
