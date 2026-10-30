import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdminLogin({ onClose }) {
  const { adminLogin } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await adminLogin(form.email, form.password);
    setLoading(false);
    if (!ok) setError('Invalid credentials. Please check your admin email and password.');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-header">
          <div className="modal-icon">⬡</div>
          <h2>Admin Portal</h2>
          <p>Antigravity Nexus CRM</p>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="field">
            <label>Email Address</label>
            <input name="email" type="email" value={form.email} onChange={handle} placeholder="admin@yourcompany.com" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Verifying…' : 'Access Dashboard'}
          </button>
        </form>
      </div>
      <style>{modalStyles}</style>
    </div>
  );
}

const modalStyles = `
  .modal-overlay {
    position: fixed; inset: 0; z-index: 999;
    background: rgba(2,4,8,0.85); backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
  }
  .modal-box {
    position: relative; width: 420px;
    background: #0a1220;
    border: 1px solid rgba(0,212,255,0.2);
    border-radius: 8px; padding: 40px;
    box-shadow: 0 0 60px rgba(0,100,255,0.15);
  }
  .modal-close {
    position: absolute; top: 16px; right: 16px;
    background: none; border: none; color: #5a8a9f; cursor: pointer; font-size: 18px;
  }
  .modal-header { text-align: center; margin-bottom: 28px; }
  .modal-icon { font-size: 40px; color: #00d4ff; margin-bottom: 12px; text-shadow: 0 0 20px rgba(0,212,255,0.6); }
  .modal-header h2 { font-family: 'Orbitron', monospace; font-size: 20px; font-weight: 700; color: #e0f4ff; margin-bottom: 4px; }
  .modal-header p { font-size: 12px; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .modal-form { display: flex; flex-direction: column; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field label { font-size: 11px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .field input {
    padding: 12px 14px; background: rgba(0,212,255,0.04); border-radius: 4px;
    border: 1px solid rgba(0,212,255,0.15); color: #e0f4ff;
    font-family: 'Exo 2', sans-serif; font-size: 14px; outline: none;
    transition: border-color 0.2s;
  }
  .field input:focus { border-color: rgba(0,212,255,0.5); background: rgba(0,212,255,0.07); }
  .field input::placeholder { color: #3a6070; }
  .error-msg { padding: 10px 14px; background: rgba(255,60,60,0.08); border: 1px solid rgba(255,60,60,0.25); border-radius: 4px; color: #ff6b6b; font-size: 13px; }
  .submit-btn {
    padding: 14px; border-radius: 4px; cursor: pointer; border: none;
    font-family: 'Exo 2', sans-serif; font-size: 14px; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase; color: #fff;
    background: linear-gradient(135deg, #00b8e0 0%, #0050cc 100%);
    box-shadow: 0 0 20px rgba(0,150,255,0.3); transition: all 0.2s;
    margin-top: 4px;
  }
  .submit-btn:hover:not(:disabled) { box-shadow: 0 0 30px rgba(0,150,255,0.5); transform: translateY(-1px); }
  .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
`;
