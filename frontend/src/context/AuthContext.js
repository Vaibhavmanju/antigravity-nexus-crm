import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setToken, getStoredToken } from '../services/api';

export const AuthContext = createContext(null);

const LS_SESSION_KEY = 'an_crm_session'; // stores { role: 'admin'|'user' } only, token kept separately

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);
  const [isTeamLeadLoggedIn, setIsTeamLeadLoggedIn] = useState(false);
  const [users, setUsers] = useState([]);
  const [masterSheetLink, setMasterSheetLinkState] = useState('');
  const [bootLoading, setBootLoading] = useState(true);

  // sheetData[userId] = { loading, error, lastFetched } — mirrors the shape
  // the original prototype's components (MasterSheet, IndividualUserView)
  // already expect, so no changes were needed in their JSX. Now backed by a
  // REAL sync against each user's Google Sheet rather than a no-op.
  const [sheetData, setSheetData] = useState({});

  // ── Bootstrap: restore session from token ───────────────
  useEffect(() => {
    const boot = async () => {
      const token = getStoredToken();
      if (!token) { setBootLoading(false); return; }

      try {
        const me = await api.me();
        if (me.role === 'admin') {
          setCurrentUser(me);
          setIsAdmin(true);
          await refreshUsers();
          await refreshMasterSheet();
        } else if (me.role === 'teamlead') {
          setCurrentUser(me);
          setIsTeamLeadLoggedIn(true);
        } else {
          const profile = await api.getMyProfile();
          setCurrentUser(profile);
          setIsUserLoggedIn(true);
        }
      } catch {
        setToken(null); // invalid/expired token
      } finally {
        setBootLoading(false);
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUsers = useCallback(async () => {
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  const refreshMasterSheet = useCallback(async () => {
    try {
      const { masterSheetLink: link } = await api.getMasterSheetLink();
      setMasterSheetLinkState(link || '');
    } catch (err) {
      console.error('Failed to load master sheet link:', err);
    }
  }, []);

  const setMasterSheetLink = async (link) => {
    setMasterSheetLinkState(link);
    try { await api.setMasterSheetLink(link); } catch (err) { console.error(err); }
  };

  // ── Auth actions ─────────────────────────────────────────
  const adminLogin = async (email, password) => {
    try {
      const { token, user } = await api.adminLogin(email, password);
      setToken(token);
      setCurrentUser(user);
      setIsAdmin(true);
      await refreshUsers();
      await refreshMasterSheet();
      return true;
    } catch {
      return false;
    }
  };

  // Admin self-signup is disabled in the MySQL-backed version — admin account
  // is provisioned once via the database seed script for security reasons.
  const adminSignup = async () => false;

  const userLogin = async (email, password) => {
    try {
      const { token, user } = await api.userLogin(email, password);
      setToken(token);
      setCurrentUser(user);
      setIsUserLoggedIn(true);
      return true;
    } catch {
      return false;
    }
  };

  const teamLeadLogin = async (email, password) => {
    try {
      const { token, user } = await api.teamLeadLogin(email, password);
      setToken(token);
      setCurrentUser(user);
      setIsTeamLeadLoggedIn(true);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setIsAdmin(false);
    setIsUserLoggedIn(false);
    setIsTeamLeadLoggedIn(false);
    setUsers([]);
  };

  // ── User management (admin) ─────────────────────────────
  const updateUser = async (id, updates) => {
    // Optimistic local update for snappy UI
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
    if (currentUser && currentUser.id === id) {
      setCurrentUser(prev => ({ ...prev, ...updates }));
    }

    try {
      if (isAdmin) {
        await api.updateUser(id, updates);
        // Re-sync this one user to pick up server-calculated fields (e.g. achieved)
        const fresh = await api.getUser(id);
        setUsers(prev => prev.map(u => u.id === id ? fresh : u));
      } else if (isUserLoggedIn && currentUser?.id === id) {
        // Logged-in user editing their own profile/performance/tasks
        if (updates.dailyData) {
          const { achieved } = await api.updateMyPerformance(updates.dailyData, updates.monday || null);
          setCurrentUser(prev => ({ ...prev, achieved }));
        }
        const profileFields = {};
        ['name', 'phone', 'notes', 'googleSheetLink'].forEach(k => {
          if (updates[k] !== undefined) profileFields[k] = updates[k];
        });
        if (Object.keys(profileFields).length > 0) {
          await api.updateMyProfile(profileFields);
        }
        if (updates.tasks) {
          // Tasks are synced individually elsewhere; this branch just keeps
          // local state consistent if tasks array is passed wholesale.
        }
      }
    } catch (err) {
      console.error('updateUser failed:', err);
    }
  };

  const addUser = async (user) => {
    try {
      const { id } = await api.createUser(user);
      const fresh = await api.getUser(id);
      setUsers(prev => [fresh, ...prev]);
    } catch (err) {
      console.error('addUser failed:', err);
      throw err;
    }
  };

  const deleteUser = async (id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    try { await api.deleteUser(id); } catch (err) { console.error('deleteUser failed:', err); }
  };

  // ── Task helpers exposed for UserDashboard's Tasks tab ───
  const addTask = async (payload) => {
    if (!currentUser) return;
    const { id } = await api.createMyTask(payload);
    return id;
  };
  const updateTask = async (id, payload) => api.updateMyTask(id, payload);
  const removeTask = async (id) => api.deleteMyTask(id);

  // ── Google Sheets sync (real) ───────────────────────────
  // Syncs ONE user's Google Sheet into MySQL, with loading/error/lastFetched
  // tracked per-user so the UI can show live status badges.
  const fetchSheetData = useCallback(async (userId) => {
    setSheetData(prev => ({ ...prev, [userId]: { ...(prev[userId] || {}), loading: true, error: null } }));
    try {
      const result = await api.syncUserSheet(userId);
      setSheetData(prev => ({
        ...prev,
        [userId]: {
          loading: false, error: null, lastFetched: new Date().toISOString(),
          dailyData: result.dailyData, achieved: result.achieved,
        }
      }));
      // Pull the fresh user record (admin) so the main users[] list also reflects the sync
      if (isAdmin) {
        const fresh = await api.getUser(userId);
        setUsers(prev => prev.map(u => u.id === userId ? fresh : u));
      }
      return result;
    } catch (err) {
      setSheetData(prev => ({
        ...prev,
        [userId]: { ...(prev[userId] || {}), loading: false, error: err.message || 'Sync failed' }
      }));
      throw err;
    }
  }, [isAdmin]);

  // Syncs every user that has a Google Sheet link configured, in one batch
  // call to the backend (which itself isolates per-user failures).
  const fetchAllSheetData = useCallback(async () => {
    const usersWithSheets = users.filter(u => u.googleSheetLink);
    setSheetData(prev => {
      const next = { ...prev };
      usersWithSheets.forEach(u => { next[u.id] = { ...(next[u.id] || {}), loading: true, error: null }; });
      return next;
    });

    try {
      const { results } = await api.syncAllProjectSheets();
      setSheetData(prev => {
        const next = { ...prev };
        results.forEach(r => {
          next[r.userId] = {
            loading: false,
            error: r.success ? null : r.error,
            lastFetched: r.success ? new Date().toISOString() : prev[r.userId]?.lastFetched,
            dailyData: r.success ? r.dailyData : prev[r.userId]?.dailyData,
            achieved: r.success ? r.achieved : prev[r.userId]?.achieved,
          };
        });
        return next;
      });
      await refreshUsers();
      return results;
    } catch (err) {
      setSheetData(prev => {
        const next = { ...prev };
        usersWithSheets.forEach(u => { next[u.id] = { ...next[u.id], loading: false, error: err.message }; });
        return next;
      });
      throw err;
    }
  }, [users, refreshUsers]);

  if (bootLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#020408', color: '#00d4ff', fontFamily: 'Exo 2, sans-serif', fontSize: 14,
        letterSpacing: 2, textTransform: 'uppercase',
      }}>
        Initializing Antigravity Nexus…
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      currentUser, isAdmin, isUserLoggedIn, isTeamLeadLoggedIn, users,
      masterSheetLink, setMasterSheetLink,
      sheetData, fetchSheetData, fetchAllSheetData,
      adminLogin, adminSignup, userLogin, teamLeadLogin, logout,
      updateUser, addUser, deleteUser,
      addTask, updateTask, removeTask,
      refreshUsers,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/**
 * ViewAsUserProvider
 *
 * Lets a Team Leader open one of their own team members' personal portal
 * (the exact screen that person sees after logging in) and enter/review
 * details on their behalf. Inside this provider the app "is" that user:
 * API calls use a short-lived token issued by the backend for that member
 * (only for users assigned to this team leader), and `logout` simply exits
 * back to the Team Leader Portal.
 */
export function ViewAsUserProvider({ member, onExit, children }) {
  const parent = useContext(AuthContext);
  const [profile, setProfile] = useState(member);

  const updateUser = async (id, updates) => {
    setProfile(prev => ({ ...prev, ...updates }));
    try {
      if (updates.dailyData) {
        const { achieved } = await api.updateMyPerformance(updates.dailyData, updates.monday || null);
        setProfile(prev => ({ ...prev, achieved }));
      }
      const profileFields = {};
      ['name', 'phone', 'notes', 'googleSheetLink'].forEach(k => {
        if (updates[k] !== undefined) profileFields[k] = updates[k];
      });
      if (Object.keys(profileFields).length > 0) await api.updateMyProfile(profileFields);
    } catch (err) {
      console.error('updateUser (team lead view) failed:', err);
    }
  };

  const value = {
    ...parent,
    currentUser: profile,
    isAdmin: false,
    isUserLoggedIn: true,
    isTeamLeadLoggedIn: false,
    users: [],
    sheetData: {},
    logout: onExit,
    updateUser,
    addTask: async (payload) => (await api.createMyTask(payload)).id,
    updateTask: (id, payload) => api.updateMyTask(id, payload),
    removeTask: (id) => api.deleteMyTask(id),
    viewAs: { memberName: profile.name, exit: onExit },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
