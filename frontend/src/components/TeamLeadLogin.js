import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TeamLeadLogin({ onClose }) {
  const { teamLeadLogin } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await teamLeadLogin(form.email, form.password);
    if (!result.success) {
      setError(result.error || 'Invalid credentials. Please use the Team Lead email and password assigned by your admin.');
    }
    setLoading(false);
  };

  return (
    <div className="tl-overlay" onClick={onClose}>
      <div className="tl-box" onClick={e => e.stopPropagation()}>
        <button className="tl-close" onClick={onClose}>✕</button>
        <div className="tl-header">
          <div className="tl-icon">⛁</div>
          <h2>Team Leader Portal</h2>
          <p>Antigravity Nexus CRM</p>
        </div>
        <form onSubmit={submit} className="tl-form">
          <div className="tl-field">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="teamlead@example.com" required autoComplete="username" />
          </div>
          <div className="tl-field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" required autoComplete="current-password" />
          </div>
          {error && <div className="tl-error">{error}</div>}
          <div className="tl-hint">Use the Team Lead credentials assigned by your administrator</div>
          <button type="submit" className="tl-submit" disabled={loading}>
            {loading ? 'Signing In…' : 'Enter Team Portal'}
          </button>
        </form>
        <div className="tl-note">
          <div className="tl-note-title">Not seeing your team here?</div>
          <div className="tl-note-body">Your admin needs to mark your account as a Team Lead and assign users to report to you from the Admin Panel's User Details screen.</div>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .tl-overlay {
    position: fixed; inset: 0; z-index: 999;
    background: rgba(2,4,8,0.9); backdrop-filter: blur(14px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .tl-box {
    position: relative; width: 100%; max-width: 420px;
    background: linear-gradient(145deg, #071510, #0a1f18);
    border: 1px solid rgba(0,232,122,0.3);
    border-radius: 12px; padding: 40px 36px;
    box-shadow: 0 0 60px rgba(0,200,120,0.15), 0 0 120px rgba(0,0,0,0.5);
  }
  .tl-close {
    position: absolute; top: 16px; right: 16px;
    background: none; border: none; color: #4a7f5a; cursor: pointer; font-size: 18px;
    transition: color 0.2s;
  }
  .tl-close:hover { color: #d4ffe0; }
  .tl-header { text-align: center; margin-bottom: 32px; }
  .tl-icon { font-size: 42px; color: #00e87a; margin-bottom: 14px; text-shadow: 0 0 24px rgba(0,232,122,0.7); }
  .tl-header h2 { font-family: 'Orbitron', monospace; font-size: 20px; font-weight: 700; color: #d4ffe0; margin-bottom: 6px; }
  .tl-header p { font-size: 12px; color: #4a7f5a; letter-spacing: 2px; text-transform: uppercase; }
  .tl-form { display: flex; flex-direction: column; gap: 18px; }
  .tl-field { display: flex; flex-direction: column; gap: 7px; }
  .tl-field label { font-size: 11px; font-weight: 600; color: #4a7f5a; letter-spacing: 2px; text-transform: uppercase; }
  .tl-field input {
    padding: 12px 14px; background: rgba(0,232,122,0.05); border-radius: 6px;
    border: 1px solid rgba(0,232,122,0.2); color: #d4ffe0;
    font-family: 'Exo 2', sans-serif; font-size: 14px; outline: none;
    transition: border-color 0.2s, background 0.2s;
  }
  .tl-field input:focus { border-color: rgba(0,232,122,0.6); background: rgba(0,232,122,0.1); }
  .tl-field input::placeholder { color: #3a5f4a; }
  .tl-error { padding: 10px 14px; background: rgba(255,60,60,0.08); border: 1px solid rgba(255,60,60,0.25); border-radius: 6px; color: #ff8888; font-size: 13px; }
  .tl-hint { font-size: 12px; color: #3a5f4a; text-align: center; font-style: italic; }
  .tl-submit {
    padding: 14px; border-radius: 6px; cursor: pointer; border: none;
    font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase; color: #04140a;
    background: linear-gradient(135deg, #00e87a 0%, #00a854 100%);
    box-shadow: 0 0 24px rgba(0,232,122,0.4); transition: all 0.2s;
    margin-top: 4px;
  }
  .tl-submit:hover:not(:disabled) { box-shadow: 0 0 36px rgba(0,232,122,0.6); transform: translateY(-1px); }
  .tl-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .tl-note { margin-top: 24px; padding: 14px; background: rgba(0,232,122,0.05); border: 1px solid rgba(0,232,122,0.15); border-radius: 6px; }
  .tl-note-title { font-size: 10px; font-weight: 600; color: #4a7f5a; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
  .tl-note-body { font-size: 12px; color: #7fb894; line-height: 1.6; }
`;
