import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const ROLES = ['Sales', 'Support', 'Marketing', 'Engineering', 'Accountant', 'Project Manager', 'CEO', 'Digital Marketing'];
const DEPTS = ['Sales', 'Support', 'Marketing', 'Engineering', 'Finance', 'Management', 'Executive', 'HR'];
const emptyForm = {
  name: '', email: '', password: '', phone: '', role: 'Sales', department: 'Sales',
  status: 'Active', joinDate: '', weeklyTarget: 500,
  googleSheetLink: '', rfqSheetLink: '', clientSheetLink: '', projectSheetLink: '',
  isTeamLead: false, managerId: '',
};

export default function UserDetails({ onUserSelect }) {
  const { users, addUser, deleteUser, updateUser, fetchSheetData } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [linkModal, setLinkModal] = useState(null);
  const [linkVal, setLinkVal] = useState('');
  const [syncingId, setSyncingId] = useState(null);
  const [sheetEditModal, setSheetEditModal] = useState(null);
  const [sheetData, setSheetData] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(emptyForm); setEditUser(null); setFormError(''); setShowModal(true); };
  const openEdit = (u) => { setForm({ ...u, password: u.password || '' }); setEditUser(u.id); setFormError(''); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditUser(null); };

  const [formError, setFormError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      if (editUser) await updateUser(editUser, form);
      else await addUser(form);
      closeModal();
    } catch (err) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    }
  };

  const openLink = (u) => { setLinkModal(u.id); setLinkVal(u.googleSheetLink || ''); };
  const saveLink = () => { updateUser(linkModal, { googleSheetLink: linkVal }); setLinkModal(null); };

  const syncOne = async (userId) => {
    setSyncingId(userId);
    try {
      await fetchSheetData(userId);
    } catch (err) {
      // Error is already captured per-user in sheetData/syncStatus; nothing else to do here.
    }
    setSyncingId(null);
  };

  const openSheetEdit = (u) => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    setSheetData({
      userId: u.id,
      name: u.name,
      dailyData: [...(u.dailyData || [0,0,0,0,0,0,0])],
      weeklyTarget: u.weeklyTarget || 500,
      achieved: u.achieved || 0,
      days
    });
    setSheetEditModal(true);
  };

  const saveSheetData = () => {
    updateUser(sheetData.userId, {
      dailyData: sheetData.dailyData.map(Number),
      weeklyTarget: Number(sheetData.weeklyTarget),
      achieved: sheetData.dailyData.reduce((s, v) => s + Number(v || 0), 0)
    });
    setSheetEditModal(false);
    setSheetData(null);
  };

  const confirmDelete = (u) => setDeleteConfirm(u);
  const doDelete = () => { deleteUser(deleteConfirm.id); setDeleteConfirm(null); };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Details</h1>
        <p className="page-sub">Manage and monitor all CRM users</p>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">◎</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="search-input" />
        </div>
        <button className="add-btn" onClick={openAdd}>+ Add User</button>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              {['Name', 'Email', 'Phone', 'Role', 'Dept', 'Status', 'Target', 'Sheet', 'Actions'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="user-cell">
                    <div className="u-avatar">{u.name[0]}</div>
                    <span>{u.name}</span>
                    {u.isTeamLead && <span className="tag-blue" style={{ background: 'rgba(123,47,255,0.12)', borderColor: 'rgba(123,47,255,0.35)', color: '#b18aff', marginLeft: 6 }}>★ Team Lead</span>}
                  </div>
                </td>
                <td className="dim">{u.email}</td>
                <td className="dim">{u.phone}</td>
                <td><span className="tag-blue">{u.role}</span></td>
                <td className="dim">{u.department}</td>
                <td><span className={`status-dot-badge ${u.status === 'Active' ? 'active' : 'inactive'}`}>{u.status}</span></td>
                <td className="num">{u.weeklyTarget}</td>
                <td>
                  {u.googleSheetLink
                    ? <a href={u.googleSheetLink} target="_blank" rel="noopener noreferrer" className="sheet-link">Open ↗</a>
                    : <span className="no-link">—</span>}
                  <button className="icon-btn" onClick={() => openLink(u)} title="Set Google Sheet Link">🔗</button>
                  {u.googleSheetLink && (
                    <button className="icon-btn" onClick={() => syncOne(u.id)} disabled={syncingId === u.id} title="Sync now from Google Sheet">
                      {syncingId === u.id ? '⟳' : '↻'}
                    </button>
                  )}
                  {u.googleSheetLink && u.syncStatus === 'success' && <span className="sync-dot ok" title={`Last synced: ${u.lastSyncedAt ? new Date(u.lastSyncedAt).toLocaleString() : ''}`}>●</span>}
                  {u.googleSheetLink && u.syncStatus === 'error' && <span className="sync-dot err" title={u.syncError || 'Sync failed'}>●</span>}
                </td>
                <td>
                  <div className="action-group">
                    <button className="action-btn view" onClick={() => onUserSelect(u.id)}>View</button>
                    <button className="action-btn edit" onClick={() => openEdit(u)}>Edit</button>
                    <button className="action-btn sheet-edit" onClick={() => openSheetEdit(u)} title="Edit Sheet Data">📊</button>
                    <button className="action-btn del" onClick={() => confirmDelete(u)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="empty-row">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="form-modal" onClick={e => e.stopPropagation()}>
            <div className="form-modal-head">
              <h3>{editUser ? 'Edit User' : 'Add New User'}</h3>
              <button onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={submit} className="grid-form">
              {[['name','Full Name','text'],['email','Email','email'],['password','Password','password'],['phone','Phone','text'],['joinDate','Join Date','date']].map(([k,l,t]) => (
                <div className="gf-field" key={k}>
                  <label>{l}</label>
                  <input type={t} value={form[k] || ''} onChange={e => setForm({...form,[k]:e.target.value})} required={k!=='phone' && !(k==='password' && editUser)} placeholder={k==='password' ? (editUser ? 'Leave blank to keep current' : 'Set user password') : ''} />
                </div>
              ))}
              {[
                ['role','Role', ROLES],
                ['department','Department', DEPTS],
                ['status','Status',['Active','Inactive']]
              ].map(([k,l,opts]) => (
                <div className="gf-field" key={k}>
                  <label>{l}</label>
                  <select value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})}>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div className="gf-field">
                <label>Weekly Target</label>
                <input type="number" min="0" value={form.weeklyTarget || 500} onChange={e => setForm({...form, weeklyTarget: e.target.value})} />
              </div>

              <div className="gf-field full" style={{ background: 'rgba(123,47,255,0.05)', border: '1px solid rgba(123,47,255,0.15)', borderRadius: 6, padding: '12px 14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13, color: '#e0d4ff' }}>
                  <input
                    type="checkbox"
                    checked={!!form.isTeamLead}
                    onChange={e => setForm({ ...form, isTeamLead: e.target.checked, managerId: e.target.checked ? '' : form.managerId })}
                    style={{ width: 16, height: 16, accentColor: '#9b59ff' }}
                  />
                  Make this user a Team Lead
                </label>
                <span className="gf-hint">Team leads get a dedicated Team Leader login and can view the performance of whichever users report to them below — separate from the regular admin/employee logins.</span>
              </div>

              {!form.isTeamLead && (
                <div className="gf-field full">
                  <label>Reports To (Team Lead)</label>
                  <select value={form.managerId || ''} onChange={e => setForm({ ...form, managerId: e.target.value || null })}>
                    <option value="">— None —</option>
                    {users.filter(u => u.isTeamLead && u.id !== editUser).map(tl => (
                      <option key={tl.id} value={tl.id}>{tl.name} ({tl.email})</option>
                    ))}
                  </select>
                  <span className="gf-hint">
                    {users.filter(u => u.isTeamLead).length === 0
                      ? 'No team leads yet — save a user with "Make this user a Team Lead" checked first, then assign their reports here.'
                      : 'Selecting a team lead here is what makes this user show up on that team lead\'s dashboard.'}
                  </span>
                </div>
              )}
              <div className="gf-field full">
                <label>Google Sheet Link (Legacy)</label>
                <input type="url" value={form.googleSheetLink || ''} onChange={e => setForm({...form,googleSheetLink:e.target.value})} placeholder="https://docs.google.com/spreadsheets/d/..." />
                <span className="gf-hint">Sheet must be shared as "Anyone with the link can view". Row 1: day names (Monday…Sunday), Row 2: values.</span>
              </div>
              <div className="gf-field full">
                <label>RFQ Tracker Sheet Link — Page 1</label>
                <input type="url" value={form.rfqSheetLink || ''} onChange={e => setForm({...form,rfqSheetLink:e.target.value})} placeholder="https://docs.google.com/spreadsheets/d/..." />
                <span className="gf-hint">Headers: SL No, Subject, Date, Client Name, Industry, Methodology, Market, CPI(USD), Total Costs…</span>
              </div>
              <div className="gf-field full">
                <label>Client Database Sheet Link — Page 2</label>
                <input type="url" value={form.clientSheetLink || ''} onChange={e => setForm({...form,clientSheetLink:e.target.value})} placeholder="https://docs.google.com/spreadsheets/d/..." />
                <span className="gf-hint">Headers: Date, Company Name, Name, Email, Designation, Phone, Intro mail sent, Follow up…</span>
              </div>
              <div className="gf-field full">
                <label>Project Tracker Sheet Link — Page 3</label>
                <input type="url" value={form.projectSheetLink || ''} onChange={e => setForm({...form,projectSheetLink:e.target.value})} placeholder="https://docs.google.com/spreadsheets/d/..." />
                <span className="gf-hint">Headers: Project code, Start date, Project Name, Client Name, Market, Methodology, Requested N, CPI…</span>
              </div>
              {formError && <div className="gf-field full" style={{ color: '#ff6b6b', fontSize: 13 }}>{formError}</div>}
              <div className="gf-actions full">
                <button type="button" onClick={closeModal} className="btn-cancel">Cancel</button>
                <button type="submit" className="btn-save">{editUser ? 'Update' : 'Create'} User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Link Modal */}
      {linkModal && (
        <div className="modal-overlay" onClick={() => setLinkModal(null)}>
          <div className="link-modal" onClick={e => e.stopPropagation()}>
            <h3>Set Google Sheet Link</h3>
            <p className="link-sub">Paste the Google Spreadsheet URL for this user</p>
            <p className="link-sub" style={{ fontSize: 11, opacity: 0.8 }}>Sheet must be shared as "Anyone with the link can view". Row 1: day names, Row 2: values.</p>
            <input className="link-input" value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
            <div className="link-actions">
              <button onClick={() => setLinkModal(null)} className="btn-cancel">Cancel</button>
              <button onClick={saveLink} className="btn-save">Save Link</button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet Data Edit Modal */}
      {sheetEditModal && sheetData && (
        <div className="modal-overlay" onClick={() => setSheetEditModal(false)}>
          <div className="form-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="form-modal-head">
              <h3>Edit Sheet Data — {sheetData.name}</h3>
              <button onClick={() => setSheetEditModal(false)}>✕</button>
            </div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#5a8a9f' }}>Edit daily performance data for this user. Achieved total is calculated automatically.</div>
            <div className="sheet-data-grid">
              {sheetData.days.map((day, i) => (
                <div className="gf-field" key={day}>
                  <label>{day}</label>
                  <input
                    type="number" min="0"
                    value={sheetData.dailyData[i]}
                    onChange={e => {
                      const d = [...sheetData.dailyData]; d[i] = e.target.value;
                      setSheetData({ ...sheetData, dailyData: d });
                    }}
                  />
                </div>
              ))}
              <div className="gf-field">
                <label>Weekly Target</label>
                <input type="number" min="0" value={sheetData.weeklyTarget} onChange={e => setSheetData({ ...sheetData, weeklyTarget: e.target.value })} />
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#5a8a9f', margin: '12px 0' }}>
              Auto-calculated total: <strong style={{ color: '#00e87a' }}>{sheetData.dailyData.reduce((s,v) => s + Number(v||0), 0)}</strong>
            </div>
            <div className="gf-actions">
              <button className="btn-cancel" onClick={() => setSheetEditModal(false)}>Cancel</button>
              <button className="btn-save" onClick={saveSheetData}>Save Data</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="link-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#ff6b6b' }}>Delete User</h3>
            <p className="link-sub">Are you sure you want to delete <strong style={{ color: '#e0f4ff' }}>{deleteConfirm.name}</strong>? This action cannot be undone.</p>
            <div className="link-actions">
              <button onClick={() => setDeleteConfirm(null)} className="btn-cancel">Cancel</button>
              <button onClick={doDelete} className="btn-save" style={{ background: 'linear-gradient(135deg,#ff4444,#cc0000)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{udStyles}</style>
    </div>
  );
}

const udStyles = `
  .page-header { margin-bottom: 24px; }
  .page-title { font-family: 'Orbitron', monospace; font-size: 24px; font-weight: 700; color: #e0f4ff; margin-bottom: 4px; }
  .page-sub { font-size: 13px; color: #5a8a9f; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .search-box { display: flex; align-items: center; gap: 10px; background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.15); border-radius: 6px; padding: 10px 16px; width: 320px; max-width: 100%; }
  .search-icon { color: #3a6070; font-size: 14px; }
  .search-input { background: none; border: none; color: #e0f4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; width: 100%; }
  .search-input::placeholder { color: #3a6070; }
  .add-btn { padding: 10px 24px; border-radius: 4px; cursor: pointer; background: linear-gradient(135deg, #00b8e0, #0050cc); border: none; color: #fff; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 1px; white-space: nowrap; }
  .add-btn:hover { box-shadow: 0 0 20px rgba(0,150,255,0.4); }
  .table-card { background: rgba(10,18,32,0.8); border: 1px solid rgba(0,212,255,0.1); border-radius: 8px; overflow: auto; }
  .data-table { width: 100%; border-collapse: collapse; min-width: 900px; }
  .data-table th { text-align: left; font-size: 10px; font-weight: 600; color: #3a6070; letter-spacing: 2px; text-transform: uppercase; padding: 14px 16px; border-bottom: 1px solid rgba(0,212,255,0.08); }
  .data-table td { padding: 13px 16px; border-bottom: 1px solid rgba(0,212,255,0.04); font-size: 13px; color: #a0c8d8; vertical-align: middle; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: rgba(0,212,255,0.02); }
  .user-cell { display: flex; align-items: center; gap: 10px; }
  .u-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, #00d4ff, #0050cc); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; }
  .dim { color: #5a8a9f !important; }
  .num { font-family: 'Orbitron', monospace; font-size: 12px; color: #e0f4ff; }
  .tag-blue { padding: 3px 10px; border-radius: 2px; background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.2); color: #00d4ff; font-size: 11px; }
  .status-dot-badge { padding: 3px 10px; border-radius: 2px; font-size: 11px; }
  .status-dot-badge.active { background: rgba(0,232,122,0.08); border: 1px solid rgba(0,232,122,0.2); color: #00e87a; }
  .status-dot-badge.inactive { background: rgba(255,100,100,0.08); border: 1px solid rgba(255,100,100,0.2); color: #ff6b6b; }
  .sheet-link { color: #00d4ff; font-size: 12px; text-decoration: none; margin-right: 6px; }
  .sheet-link:hover { text-decoration: underline; }
  .no-link { color: #3a6070; font-size: 12px; margin-right: 6px; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px 4px; opacity: 0.6; }
  .icon-btn:hover { opacity: 1; }
  .action-group { display: flex; gap: 5px; flex-wrap: wrap; }
  .action-btn { padding: 5px 9px; border-radius: 3px; cursor: pointer; font-family: 'Exo 2', sans-serif; font-size: 11px; font-weight: 600; border: 1px solid; transition: all 0.2s; white-space: nowrap; }
  .action-btn.view { background: rgba(0,212,255,0.08); border-color: rgba(0,212,255,0.3); color: #00d4ff; }
  .action-btn.edit { background: rgba(255,159,67,0.08); border-color: rgba(255,159,67,0.3); color: #ff9f43; }
  .action-btn.sheet-edit { background: rgba(0,232,122,0.08); border-color: rgba(0,232,122,0.3); color: #00e87a; }
  .action-btn.del { background: rgba(255,100,100,0.08); border-color: rgba(255,100,100,0.3); color: #ff6b6b; }
  .action-btn:hover { opacity: 0.8; transform: translateY(-1px); }
  .empty-row { text-align: center; color: #3a6070; padding: 40px !important; }
  .modal-overlay { position: fixed; inset: 0; z-index: 999; background: rgba(2,4,8,0.88); backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .form-modal { background: #0a1220; border: 1px solid rgba(0,212,255,0.2); border-radius: 8px; padding: 32px; width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; }
  .form-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .form-modal-head h3 { font-family: 'Orbitron', monospace; font-size: 16px; color: #e0f4ff; }
  .form-modal-head button { background: none; border: none; color: #5a8a9f; cursor: pointer; font-size: 18px; }
  .grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .sheet-data-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
  .gf-field { display: flex; flex-direction: column; gap: 6px; }
  .gf-field.full { grid-column: 1/-1; }
  .gf-field label { font-size: 10px; font-weight: 600; color: #5a8a9f; letter-spacing: 2px; text-transform: uppercase; }
  .gf-field input, .gf-field select { padding: 10px 12px; background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.15); border-radius: 4px; color: #e0f4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; }
  .gf-field input:focus, .gf-field select:focus { border-color: rgba(0,212,255,0.4); }
  .gf-field select option { background: #0a1220; }
  .gf-hint { font-size: 10px; color: #3a6070; line-height: 1.4; }
  .sync-dot { font-size: 9px; margin-left: 4px; cursor: default; }
  .sync-dot.ok { color: #00e87a; text-shadow: 0 0 6px #00e87a; }
  .sync-dot.err { color: #ff6b6b; text-shadow: 0 0 6px #ff6b6b; }
  .gf-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; }
  .btn-cancel { padding: 10px 24px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid rgba(224,244,255,0.15); color: #8ab4c8; font-family: 'Exo 2', sans-serif; font-size: 13px; }
  .btn-save { padding: 10px 24px; border-radius: 4px; cursor: pointer; background: linear-gradient(135deg, #00b8e0, #0050cc); border: none; color: #fff; font-family: 'Exo 2', sans-serif; font-size: 13px; font-weight: 600; }
  .link-modal { background: #0a1220; border: 1px solid rgba(0,212,255,0.2); border-radius: 8px; padding: 32px; width: 100%; max-width: 480px; }
  .link-modal h3 { font-family: 'Orbitron', monospace; font-size: 16px; color: #e0f4ff; margin-bottom: 8px; }
  .link-sub { font-size: 13px; color: #5a8a9f; margin-bottom: 20px; }
  .link-input { width: 100%; padding: 12px; background: rgba(0,212,255,0.04); border: 1px solid rgba(0,212,255,0.15); border-radius: 4px; color: #e0f4ff; font-family: 'Exo 2', sans-serif; font-size: 13px; outline: none; margin-bottom: 20px; }
  .link-input:focus { border-color: rgba(0,212,255,0.4); }
  .link-actions { display: flex; gap: 12px; justify-content: flex-end; }
  @media (max-width: 600px) {
    .grid-form { grid-template-columns: 1fr; }
    .gf-field.full { grid-column: auto; }
    .toolbar { flex-direction: column; align-items: stretch; }
    .search-box { width: 100%; }
  }
`;
