// src/pages/admin/ManageUsers.js - إدارة المستخدمين وربطهم بالشركات
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, createAuthUserWithoutSession } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { logActivity } from '../../utils/auditLogger';
import Sidebar from '../../components/common/Sidebar';
import PasswordStrengthMeter, { getPasswordStrength } from '../../components/common/PasswordStrengthMeter';
import { useLanguage } from '../../i18n/LanguageContext';

export default function ManageUsers() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const [newUser, setNewUser] = useState({
    email: '', password: '', role: 'user', companyId: ''
  });

  const fetchData = useCallback(async () => {
    try {
      const [usersSnap, companiesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'companies')),
      ]);
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCompanies(companiesSnap.docs.map(d => ({ id: d.id, name: d.data().name, email: d.data().email })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddUser(e) {
    e.preventDefault();
    const companyRequired = newUser.role !== 'super_admin';
    if (!newUser.email || !newUser.password || (companyRequired && !newUser.companyId)) {
      alert(t('mu.fill'));
      return;
    }

    const { checks } = getPasswordStrength(newUser.password);
    if (!checks.uppercase) {
      alert(t('signup.needUppercase'));
      return;
    }
    if (!checks.symbol) {
      alert(t('signup.needSymbol'));
      return;
    }
    setSubmitting(true);
    try {
      const newCred = await createAuthUserWithoutSession(newUser.email, newUser.password);
      await setDoc(doc(db, 'users', newCred.uid), {
        email: newCred.email,
        role: newUser.role,
        companyId: newUser.companyId || null,
        createdAt: new Date().toISOString(),
        isActive: true,
      });

      await logActivity({
        actionType: 'CREATE',
        collectionName: 'users',
        itemId: newCred.uid,
        details: `Created user: ${newCred.email} (${newUser.role}) linked to company ${newUser.companyId || '-'}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewUser({ email: '', password: '', role: 'user', companyId: '' });
      setShowAddModal(false);
      await fetchData();
      alert(t('mu.ok'));
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        alert(t('mu.exists'));
      } else {
        alert(t('mu.err', { msg: e.message || e }));
      }
    }
    setSubmitting(false);
  }

  async function handleUpdateCompany(userId, companyId) {
    try {
      await updateDoc(doc(db, 'users', userId), { companyId });
      await logActivity({
        actionType: 'UPDATE',
        collectionName: 'users',
        itemId: userId,
        details: `Updated user companyId to ${companyId || '-'}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert(t('mu.updErr'));
    }
  }

  async function handleUpdateRole(userId, role) {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      await logActivity({
        actionType: 'UPDATE',
        collectionName: 'users',
        itemId: userId,
        details: `Updated user role to ${role}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert(t('mu.updErr'));
    }
  }

  async function handleDeleteUser(userId) {
    if (userId === currentUser?.uid) {
      alert('لا يمكنك حذف حسابك الحالي');
      return;
    }
    if (!window.confirm(t('mu.delQ'))) return;
    try {
      const userDoc = users.find(u => u.id === userId);
      await deleteDoc(doc(db, 'users', userId));
      await logActivity({
        actionType: 'DELETE',
        collectionName: 'users',
        itemId: userId,
        details: `Deleted user: ${userDoc?.email || 'Unknown'}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert(t('mu.updErr'));
    }
  }

  const filtered = users.filter(u =>
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const getCompanyName = (companyId) =>
    companies.find(c => c.id === companyId)?.name || '—';

  if (loading) return (
    <div className="loading"><div className="spinner"></div>{t('common.loading')}</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        <div className="header">
          <div>
            <h1><i className="fas fa-users-cog" style={{ color: '#6366f1', marginLeft: 10 }}></i>{t('mu.title')}</h1>
            <p className="subtitle">{t('mu.subtitle')}</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="fas fa-user-plus"></i> {t('mu.new')}
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', marginBottom: 24 }}>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{users.length}</div>
            <div className="stat-label">{t('mu.total')}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-crown"></i></div>
            <div className="stat-value">{users.filter(u => u.role === 'super_admin').length}</div>
            <div className="stat-label">{t('mu.admins')}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-user-check"></i></div>
            <div className="stat-value">{users.filter(u => u.companyId).length}</div>
            <div className="stat-label">{t('mu.linked')}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-user-times"></i></div>
            <div className="stat-value">{users.filter(u => !u.companyId).length}</div>
            <div className="stat-label">{t('mu.unlinked')}</div>
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper" style={{ marginBottom: 20 }}>
          <i className="fas fa-search search-icon"></i>
          <input type="text" placeholder={t('mu.search')}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Users Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t('mu.list')}</h3>
            <span className="table-count">{t('mu.nUsers', { n: filtered.length })}</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-users"></i>
                <p>{t('mu.none')}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('common.email')}</th>
                    <th>{t('mu.role')}</th>
                    <th>{t('mu.company')}</th>
                    <th>{t('mu.changeCo')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user, i) => (
                    <tr key={user.id}>
                      <td style={{ color: 'var(--gray-400)', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{user.email}</td>
                      <td>
                        <select
                          value={user.role || 'user'}
                          onChange={e => handleUpdateRole(user.id, e.target.value)}
                          style={{
                            padding: '4px 8px', borderRadius: 6,
                            border: '1px solid var(--gray-200)',
                            fontSize: 12, fontFamily: 'Cairo, sans-serif',
                            background: 'white', cursor: 'pointer',
                          }}
                        >
                          <option value="user">{t('mu.user')}</option>
                          <option value="admin">{t('mu.admin')}</option>
                          <option value="super_admin">{t('mu.sa')}</option>
                        </select>
                      </td>
                      <td>
                        {user.companyId ? (
                          <span className="badge badge-active">
                            <i className="fas fa-building" style={{ marginLeft: 4 }}></i>
                            {getCompanyName(user.companyId)}
                          </span>
                        ) : (
                          <span className="badge badge-expired">{t('mu.noCo')}</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={user.companyId || ''}
                          onChange={e => handleUpdateCompany(user.id, e.target.value)}
                          style={{
                            padding: '4px 8px', borderRadius: 6,
                            border: '1px solid var(--gray-200)',
                            fontSize: 12, fontFamily: 'Cairo, sans-serif',
                            background: 'white', cursor: 'pointer',
                            maxWidth: 160,
                          }}
                        >
                          <option value="">{t('mu.noCoOpt')}</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {user.id !== currentUser?.uid && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="btn-danger btn-sm"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-user-plus" style={{ color: '#6366f1' }}></i> {t('mu.create')}</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t('mu.email')}</label>
                  <input type="email" value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="user@company.com" required />
                </div>
                <div className="form-group">
                  <label>{t('mu.pass')}</label>
                  <input type="password" value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder={t('mu.passPh')} required minLength={6} />
                  <PasswordStrengthMeter password={newUser.password} />
                </div>
                <div className="form-group">
                  <label>{t('mu.coReq')}</label>
                  <select value={newUser.companyId}
                    onChange={e => setNewUser({ ...newUser, companyId: e.target.value })}
                    required={newUser.role !== 'super_admin'}>
                    <option value="">{t('mu.chooseCo')}</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('mu.role')}</label>
                  <select value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="user">{t('mu.userN')}</option>
                    <option value="admin">{t('mu.adminC')}</option>
                    <option value="super_admin">{t('mu.sa')}</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting
                    ? <><i className="fas fa-spinner fa-spin"></i> {t('mu.creating')}</>
                    : <><i className="fas fa-user-plus"></i> {t('mu.createBtn')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
