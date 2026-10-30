import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function UserLogin({ onClose }) {
  const { userLogin } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await userLogin(form.email, form.password);
    if (!ok) setError('Invalid credentials. Please use the email and password assigned by your admin.');
    setLoading(false);
  };

  return (
    <div className="ul-overlay" onClick={onClose}>
      <div className="ul-box" onClick={e => e.stopPropagation()}>
        <button className="ul-close" onClick={onClose}>✕</button>
        <div className="ul-header">
          <div className="ul-icon">◉</div>
          <h2>User Portal</h2>
          <p>Antigravity Nexus CRM</p>
        </div>
        <form onSubmit={submit} className="ul-form">
          <div className="ul-field">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="yourname@example.com" required autoComplete="username" />
          </div>
          <div className="ul-field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" required autoComplete="current-password" />
          </div>
          {error && <div className="ul-error">{error}</div>}
          <div className="ul-hint">Use credentials assigned by your administrator</div>
          <button type="submit" className="ul-submit" disabled={loading}>
            {loading ? 'Signing In…' : 'Access Dashboard'}
          </button>
        </form>
        <div className="ul-demo">
          <div className="ul-demo-title">Demo Credentials</div>
          <div className="ul-demo-row"><span>alice@example.com</span><span>alice123</span></div>
          <div className="ul-demo-row"><span>bob@example.com</span><span>bob123</span></div>
        </div>
      </div>
      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .ul-overlay {
    position: fixed; inset: 0; z-index: 999;
    background: rgba(2,4,8,0.9); backdrop-filter: blur(14px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }
  .ul-box {
    position: relative; width: 100%; max-width: 420px;
    background: linear-gradient(145deg, #0a0e1a, #0e1525);
    border: 1px solid rgba(123,47,255,0.3);
    border-radius: 12px; padding: 40px 36px;
    box-shadow: 0 0 60px rgba(120,0,255,0.15), 0 0 120px rgba(0,0,0,0.5);
  }
  .ul-close {
    position: absolute; top: 16px; right: 16px;
    background: none; border: none; color: #5a4a7f; cursor: pointer; font-size: 18px;
    transition: color 0.2s;
  }
  .ul-close:hover { color: #e0d4ff; }
  .ul-header { text-align: center; margin-bottom: 32px; }
  .ul-icon { font-size: 42px; color: #9b59ff; margin-bottom: 14px; text-shadow: 0 0 24px rgba(155,89,255,0.7); }
  .ul-header h2 { font-family: 'Orbitron', monospace; font-size: 20px; font-weight: 700; color: #e0d4ff; margin-bottom: 6px; }
  .ul-header p { font-size: 12px; color: #6a5a8f; letter-spacing: 2px; text-transform: uppercase; }
  .ul-form { display: flex; flex-direction: column; gap: 18px; }
  .ul-field { display: flex; flex-direction: column; gap: 7px; }
  .ul-field label { font-size: 11px; font-weight: 600; color: #6a5a8f; letter-spacing: 2px; text-transform: uppercase; }
  .ul-field input {
    padding: 12px 14px; background: rgba(123,47,255,0.05); border-radius: 6px;
    border: 1px solid rgba(123,47,255,0.2); color: #e0d4ff;
    font-family: 'Exo 2', sans-serif; font-size: 14px; outline: none;
    transition: border-color 0.2s, background 0.2s;
  }
  .ul-field input:focus { border-color: rgba(155,89,255,0.6); background: rgba(123,47,255,0.1); }
  .ul-field input::placeholder { color: #4a3a6f; }
  .ul-error { padding: 10px 14px; background: rgba(255,60,60,0.08); border: 1px solid rgba(255,60,60,0.25); border-radius: 6px; color: #ff8888; font-size: 13px; }
  .ul-hint { font-size: 12px; color: #4a3a6f; text-align: center; font-style: italic; }
  .ul-submit {
    padding: 14px; border-radius: 6px; cursor: pointer; border: none;
    font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase; color: #fff;
    background: linear-gradient(135deg, #7b2fff 0%, #4a0acc 100%);
    box-shadow: 0 0 24px rgba(123,47,255,0.4); transition: all 0.2s;
    margin-top: 4px;
  }
  .ul-submit:hover:not(:disabled) { box-shadow: 0 0 36px rgba(123,47,255,0.6); transform: translateY(-1px); }
  .ul-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .ul-demo { margin-top: 24px; padding: 14px; background: rgba(123,47,255,0.05); border: 1px solid rgba(123,47,255,0.15); border-radius: 6px; }
  .ul-demo-title { font-size: 10px; font-weight: 600; color: #5a4a7f; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
  .ul-demo-row { display: flex; justify-content: space-between; font-size: 12px; color: #9b7fd4; padding: 3px 0; font-family: monospace; }
`;
