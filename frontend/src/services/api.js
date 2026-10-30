const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// In-memory token used while a Team Leader is working inside one of their
// team members' portals. It takes priority over the stored login token and is
// never persisted, so a page refresh drops back to the Team Leader's own session.
let tokenOverride = null;
export function setTokenOverride(token) { tokenOverride = token || null; }

function getToken() {
  if (tokenOverride) return tokenOverride;
  try { return localStorage.getItem('an_crm_token') || ''; } catch { return ''; }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const resp = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const error = new Error(data.error || `Request failed (${resp.status})`);
    error.status = resp.status;
    throw error;
  }
  return data;
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────
  adminLogin:  (email, password) => request('/auth/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  userLogin:   (email, password) => request('/auth/user/login',  { method: 'POST', body: JSON.stringify({ email, password }) }),
  teamLeadLogin: (email, password) => request('/auth/teamlead/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me:          () => request('/auth/me'),
  // Team Leader → open one of their own team members' personal portal
  teamLeadViewAs: (userId) => request(`/auth/teamlead/view-as/${userId}`, { method: 'POST' }),

  // ── Admin: Users CRUD ────────────────────────────────────
  getUsers:    () => request('/users'),
  getUser:     (id) => request(`/users/${id}`),
  createUser:  (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser:  (id, payload) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser:  (id) => request(`/users/${id}`, { method: 'DELETE' }),
  syncUserSheet: (id) => request(`/users/${id}/sync-sheet`, { method: 'PUT' }),
  syncAllProjectSheets: () => request('/users/sync-all', { method: 'PUT' }),

  // ── Admin: Dashboard / Master Sheet ──────────────────────
  getDashboardSummary: () => request('/dashboard/summary'),
  getMasterSheetLink:  () => request('/settings/master-sheet'),
  setMasterSheetLink:  (link) => request('/settings/master-sheet', { method: 'PUT', body: JSON.stringify({ link }) }),
  getActivity: () => request('/dashboard/activity'),
  getWeekChart: (userId = null, monday = null) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    const qs = params.toString();
    return request(`/dashboard/week-chart${qs ? '?' + qs : ''}`);
  },
  getWeekPie: (userId = null, category = 'market', monday = null) => {
    const params = new URLSearchParams({ category });
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    return request(`/dashboard/week-pie?${params.toString()}`);
  },
  getWeekDayBreakdown: (userId = null, monday = null) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    const qs = params.toString();
    return request(`/dashboard/week-day-breakdown${qs ? '?' + qs : ''}`);
  },
  getRfqCharts: (userId = null, monday = null) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    return request(`/dashboard/rfq-charts${params.toString() ? '?' + params.toString() : ''}`);
  },
  getClientCharts: (userId = null, monday = null) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    return request(`/dashboard/client-charts${params.toString() ? '?' + params.toString() : ''}`);
  },
  getProjectCharts: (userId = null, monday = null) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (monday) params.set('monday', monday);
    return request(`/dashboard/project-charts${params.toString() ? '?' + params.toString() : ''}`);
  },
  // Pull the latest RFQ + Client + Project sheets for one user in one call
  syncUserAllSheets: (userId) => request(`/dashboard/sync-user/${userId}`, { method: 'PUT' }),
  syncRfqSheet:    (userId) => request(`/dashboard/sync-rfq/${userId}`,    { method: 'PUT' }),
  syncClientSheet: (userId) => request(`/dashboard/sync-client/${userId}`,  { method: 'PUT' }),
  syncAllSheets:   ()       => request('/dashboard/sync-all-sheets',        { method: 'PUT' }),

  // ── Logged-in user: self-service ─────────────────────────
  getMyProfile:     () => request('/me/profile'),
  updateMyProfile:  (payload) => request('/me/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  getMyPerformance: (monday = null) => request(`/me/performance${monday ? `?monday=${monday}` : ''}`),
  updateMyPerformance: (dailyData, monday = null) =>
    request(`/me/performance${monday ? `?monday=${monday}` : ''}`, { method: 'PUT', body: JSON.stringify({ dailyData }) }),
  syncMySheet:      () => request('/me/sync-sheet', { method: 'PUT' }),
  getSyncStatus:    () => request('/me/sync-status'),
  getSyncDebug:     () => request('/me/sync-debug'),
  getMyTasks:    () => request('/me/tasks'),
  createMyTask:  (payload) => request('/me/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateMyTask:  (id, payload) => request(`/me/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMyTask:  (id) => request(`/me/tasks/${id}`, { method: 'DELETE' }),

  // ── Reports: day / week / month CSV downloads ─────────────
  // sheet: 'rfq' | 'client' | 'project' | 'consolidated'
  downloadReport: async (sheet, period = 'week', { date = null, userId = null } = {}) => {
    const params = new URLSearchParams({ period });
    if (date)   params.set('date', date);
    if (userId) params.set('userId', userId);
    const path = sheet === 'consolidated' ? '/reports/consolidated' : `/reports/${sheet}`;

    const token = getToken();
    const resp = await fetch(`${API_URL}${path}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) {
      let msg = `Download failed (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await resp.blob();
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `${sheet}-report.csv`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { filename };
  },

  downloadAuditLog: async ({ from = null, to = null } = {}) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const token = getToken();
    const resp = await fetch(`${API_URL}/dashboard/activity/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log-export.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  // ── Analytics: scorecards & team rollups ──────────────────
  getMyScorecard: (period = 'week', date = null) => {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    return request(`/analytics/me/scorecard?${params.toString()}`);
  },
  getUserScorecard: (userId, period = 'week', date = null) => {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    return request(`/analytics/users/${userId}/scorecard?${params.toString()}`);
  },
  getUserPerformanceHistory: (userId, days = 30) =>
    request(`/analytics/users/${userId}/performance-history?days=${days}`),
  getTeamRollup: (period = 'week') => request(`/analytics/team-rollup?period=${period}`),

  // ── Notifications ──────────────────────────────────────────
  getNotifications: (onlyUnread = false) => request(`/notifications${onlyUnread ? '?unread=true' : ''}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PUT' }),

  // ── Power BI Embedded ────────────────────────────────────────
  getPowerBiStatus: () => request('/powerbi/status'),
  getPowerBiEmbedToken: () => request('/powerbi/embed-token'),
};

export function setToken(token) {
  try {
    if (token) localStorage.setItem('an_crm_token', token);
    else localStorage.removeItem('an_crm_token');
  } catch {}
}

export function getStoredToken() {
  return getToken();
}

export default api;
