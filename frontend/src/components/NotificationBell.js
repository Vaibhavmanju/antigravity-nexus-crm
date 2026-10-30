import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const SEVERITY_COLOR = {
  info: '#00d4ff',
  warning: '#ff9f43',
  critical: '#ff6b6b',
  success: '#00e87a',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await api.getUnreadCount();
      setUnread(count);
    } catch { /* ignore transient errors */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.getNotifications();
      setItems(rows);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 30000);
    return () => clearInterval(t);
  }, [refreshCount]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleMarkAll = async () => {
    await api.markAllNotificationsRead();
    setItems(items.map(i => ({ ...i, is_read: 1 })));
    setUnread(0);
  };

  const handleItemClick = async (item) => {
    if (!item.is_read) {
      await api.markNotificationRead(item.id);
      setItems(items.map(i => i.id === item.id ? { ...i, is_read: 1 } : i));
      setUnread(u => Math.max(0, u - 1));
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)',
          color: '#00d4ff', width: 36, height: 36, borderRadius: 6, cursor: 'pointer', fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, background: '#ff6b6b', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 10, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 44, width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#0a1220', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 200,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid rgba(0,212,255,0.1)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#5a8a9f', letterSpacing: 1.5, textTransform: 'uppercase' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAll} style={{ background: 'none', border: 'none', color: '#00d4ff', fontSize: 10, cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#3a6070', fontSize: 12 }}>No notifications yet</div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer', background: item.is_read ? 'transparent' : 'rgba(0,212,255,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[item.severity] || '#5a8a9f', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#e0f4ff', fontWeight: item.is_read ? 400 : 600 }}>{item.title}</span>
                </div>
                {item.message && <div style={{ fontSize: 11, color: '#5a8a9f', marginTop: 4, paddingLeft: 12 }}>{item.message}</div>}
                <div style={{ fontSize: 9, color: '#3a6070', marginTop: 4, paddingLeft: 12 }}>
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
