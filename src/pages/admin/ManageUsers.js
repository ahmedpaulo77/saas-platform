// src/pages/admin/ManageUsers.js - إدارة المستخدمين وربطهم بالشركات
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../firebase/config';
import Sidebar from '../../components/common/Sidebar';
import PasswordStrengthMeter, { getPasswordStrength } from '../../components/common/PasswordStrengthMeter';

export default function ManageUsers() {
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
    if (!newUser.email || !newUser.password || !newUser.companyId) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    const { checks } = getPasswordStrength(newUser.password);
    if (!checks.uppercase) {
      alert('كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل');
      return;
    }
    if (!checks.symbol) {
      alert('كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل (!@#$...)');
      return;
    }
    setSubmitting(true);
    try {
      // إنشاء المستخدم في Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, newUser.email, newUser.password);
      // حفظ بياناته في Firestore مع companyId
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: newUser.email,
        role: newUser.role,
        companyId: newUser.companyId,
        createdAt: new Date().toISOString(),
        isActive: true,
      });
      setNewUser({ email: '', password: '', role: 'user', companyId: '' });
      setShowAddModal(false);
      await fetchData();
      alert('✅ تم إنشاء المستخدم وربطه بالشركة');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        alert('❌ البريد الإلكتروني مستخدم بالفعل');
      } else {
        alert('❌ حدث خطأ: ' + e.message);
      }
    }
    setSubmitting(false);
  }

  async function handleUpdateCompany(userId, companyId) {
    try {
      await updateDoc(doc(db, 'users', userId), { companyId });
      await fetchData();
    } catch (e) {
      console.error(e);
      alert('❌ حدث خطأ في التحديث');
    }
  }

  async function handleUpdateRole(userId, role) {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeleteUser(userId) {
    if (!window.confirm('حذف هذا المستخدم من قاعدة البيانات؟')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  }

  const filtered = users.filter(u =>
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const getCompanyName = (companyId) =>
    companies.find(c => c.id === companyId)?.name || '—';

  if (loading) return (
    <div className="loading"><div className="spinner"></div>جاري التحميل...</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        <div className="header">
          <div>
            <h1><i className="fas fa-users-cog" style={{ color: '#6366f1', marginLeft: 10 }}></i>إدارة المستخدمين</h1>
            <p className="subtitle">ربط المستخدمين بالشركات وتحديد الصلاحيات</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="fas fa-user-plus"></i> مستخدم جديد
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', marginBottom: 24 }}>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{users.length}</div>
            <div className="stat-label">إجمالي المستخدمين</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-crown"></i></div>
            <div className="stat-value">{users.filter(u => u.role === 'super_admin').length}</div>
            <div className="stat-label">مدراء النظام</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-user-check"></i></div>
            <div className="stat-value">{users.filter(u => u.companyId).length}</div>
            <div className="stat-label">مربوطون بشركة</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-user-times"></i></div>
            <div className="stat-value">{users.filter(u => !u.companyId).length}</div>
            <div className="stat-label">غير مربوطين</div>
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper" style={{ marginBottom: 20 }}>
          <i className="fas fa-search search-icon"></i>
          <input type="text" placeholder="ابحث بالبريد الإلكتروني..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Users Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> قائمة المستخدمين</h3>
            <span className="table-count">{filtered.length} مستخدم</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-users"></i>
                <p>لا يوجد مستخدمون</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>البريد الإلكتروني</th>
                    <th>الدور</th>
                    <th>الشركة المرتبطة</th>
                    <th>تغيير الشركة</th>
                    <th>الإجراءات</th>
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
                          <option value="user">مستخدم</option>
                          <option value="admin">أدمن</option>
                          <option value="super_admin">سوبر أدمن</option>
                        </select>
                      </td>
                      <td>
                        {user.companyId ? (
                          <span className="badge badge-active">
                            <i className="fas fa-building" style={{ marginLeft: 4 }}></i>
                            {getCompanyName(user.companyId)}
                          </span>
                        ) : (
                          <span className="badge badge-expired">غير مربوط</span>
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
                          <option value="">بدون شركة</option>
                          {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="btn-danger btn-sm"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Info card */}
         
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-user-plus" style={{ color: '#6366f1' }}></i> إنشاء مستخدم جديد</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>البريد الإلكتروني *</label>
                  <input type="email" value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="user@company.com" required />
                </div>
                <div className="form-group">
                  <label>كلمة المرور *</label>
                  <input type="password" value={newUser.password}
                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="6 أحرف على الأقل" required minLength={6} />
                  <PasswordStrengthMeter password={newUser.password} />
                </div>
                <div className="form-group">
                  <label>الشركة *</label>
                  <select value={newUser.companyId}
                    onChange={e => setNewUser({ ...newUser, companyId: e.target.value })} required>
                    <option value="">اختر الشركة</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>الدور</label>
                  <select value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="user">مستخدم عادي</option>
                    <option value="admin">أدمن الشركة</option>
                    <option value="super_admin">سوبر أدمن</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting
                    ? <><i className="fas fa-spinner fa-spin"></i> جاري الإنشاء...</>
                    : <><i className="fas fa-user-plus"></i> إنشاء المستخدم</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
