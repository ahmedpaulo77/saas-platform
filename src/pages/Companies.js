// src/pages/Companies.js
import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin, generateInviteCode } from '../utils/companyQuery';
import { INDUSTRIES, INDUSTRY_LABELS } from '../utils/modules';
import Sidebar from '../components/common/Sidebar';

export default function Companies() {
  const { currentUser, userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [companies, setCompanies] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newCompany, setNewCompany] = useState({ name: '', email: '', plan: 'monthly', industry: 'general' });
  const [editingCompany, setEditingCompany] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;

    if (superAdmin) {
      // الأدمن الرئيسي يرى جميع الشركات مباشرة
      unsubscribe = onSnapshot(collection(db, 'companies'), (snapshot) => {
        const companiesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCompanies(companiesData);
        setLoading(false);
      }, (err) => {
        console.error("Error listening to companies:", err);
        setLoading(false);
      });
    } else if (userCompanyId) {
      // المستخدم العادي يرى شركته فقط
      unsubscribe = onSnapshot(doc(db, 'companies', userCompanyId), (docSnap) => {
        if (docSnap.exists()) {
          setCompanies([{ id: docSnap.id, ...docSnap.data() }]);
        } else {
          setCompanies([]);
        }
        setLoading(false);
      });
    } else {
      setCompanies([]);
      setLoading(false);
    }

    return () => unsubscribe && unsubscribe();
  }, [superAdmin, userCompanyId]);

  async function addCompany(e) {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    try {
      // 1. إضافة الشركة
      const docRef = await addDoc(collection(db, 'companies'), {
        ...newCompany,
        industry: newCompany.industry || 'general',
        subscription: {
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        inviteCode: generateInviteCode(newCompany.name), // توليد كود تلقائي
        createdAt: new Date().toISOString(),
        isActive: true
      });

      // 2. تذكير هام: إذا كان المنشئ مستخدماً عادياً وليس super_admin، يجب ربط الـ userCompanyId بالشركة المضافة
      if (!superAdmin && currentUser) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          companyId: docRef.id
        });
      }

      setNewCompany({ name: '', email: '', plan: 'monthly', industry: 'general' });
      alert('✅ تم إضافة الشركة بنجاح');
    } catch (error) {
      console.error('Error adding company:', error);
      alert('❌ حدث خطأ في إضافة الشركة');
    }
  }

  function openEditModal(company) {
    setEditingCompany(company);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingCompany(null);
    setShowEditModal(false);
  }

  async function updateCompany(e) {
    e.preventDefault();
    if (!editingCompany.name || !editingCompany.email) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    try {
      const companyRef = doc(db, 'companies', editingCompany.id);
      await updateDoc(companyRef, {
        name: editingCompany.name,
        email: editingCompany.email,
        plan: editingCompany.plan,
        industry: editingCompany.industry || 'general'
      });
      closeEditModal();
      alert('✅ تم تحديث الشركة بنجاح');
    } catch (error) {
      console.error('Error updating company:', error);
      alert('❌ حدث خطأ في تحديث الشركة');
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الشركة؟')) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
      alert('✅ تم حذف الشركة بنجاح');
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('❌ حدث خطأ في حذف الشركة');
    }
  }

  const filteredCompanies = companies.filter(company =>
    company.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // نسخ كود الانضمام
  function copyInviteCode(code) {
    if (!code) return;
    navigator.clipboard.writeText(code);
    alert(`✅ تم نسخ كود الانضمام: ${code}`);
  }

  if (loading) {
    return <div className="loading">جاري تحميل الشركات...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>
          🏢 {superAdmin ? 'إدارة الشركات' : 'بيانات شركتي'}
        </h2>

        {superAdmin && (
          <form onSubmit={addCompany} className="form-container">
            <input
              type="text"
              placeholder="اسم الشركة"
              value={newCompany.name}
              onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
              required
            />
            <input
              type="email"
              placeholder="البريد الإلكتروني"
              value={newCompany.email}
              onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })}
              required
            />
            <select
              value={newCompany.plan}
              onChange={(e) => setNewCompany({ ...newCompany, plan: e.target.value })}
            >
              <option value="monthly">شهري</option>
              <option value="yearly">سنوي</option>
            </select>
            <select
              value={newCompany.industry}
              onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })}
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.id} value={ind.id}>{ind.label}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary">
              <i className="fas fa-plus"></i> إضافة شركة
            </button>
          </form>
        )}

        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن شركة بالاسم أو البريد الإلكتروني..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '15px',
              outline: 'none',
            }}
          />
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>قائمة الشركات</h3>
            <span>{filteredCompanies.length} شركة</span>
          </div>
          {filteredCompanies.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
              {searchTerm ? '❌ لا توجد نتائج مطابقة للبحث' : 'لا توجد شركات مسجلة حتى الآن'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم الشركة</th>
                  <th>البريد الإلكتروني</th>
                  <th>مجال العمل</th>
                  <th>كود الانضمام</th>
                  <th>الباقة</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company, index) => (
                  <tr key={company.id}>
                    <td>{index + 1}</td>
                    <td>{company.name}</td>
                    <td>{company.email}</td>
                    <td>
                      <span className="badge badge-info">
                        {INDUSTRY_LABELS[company.industry] || '🏢 شركة / مكتب عام'}
                      </span>
                    </td>
                    <td>
                      {company.inviteCode ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{
                            background: '#f1f5f9',
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#6366f1',
                            letterSpacing: 1,
                            direction: 'ltr',
                            display: 'inline-block',
                          }}>
                            {company.inviteCode}
                          </code>
                          <button
                            onClick={() => copyInviteCode(company.inviteCode)}
                            title="نسخ الكود"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#6366f1',
                              fontSize: 14,
                              padding: 4,
                            }}
                          >
                            <i className="fas fa-copy"></i>
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#999', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>{company.plan === 'monthly' ? 'شهري' : 'سنوي'}</td>
                    <td>
                      <span className={`badge ${
                        company.subscription?.status === 'active' ? 'badge-active' :
                        company.subscription?.status === 'trial' ? 'badge-trial' : 'badge-expired'
                      }`}>
                        {company.subscription?.status === 'active' ? 'نشط' :
                         company.subscription?.status === 'trial' ? 'تجريبي' : 'منتهي'}
                      </span>
                    </td>
                    <td>
                      <button 
                        onClick={() => openEditModal(company)} 
                        className="btn-primary" 
                        style={{ marginLeft: '8px', padding: '6px 14px', fontSize: '13px' }}
                      >
                        <i className="fas fa-edit"></i> تعديل
                      </button>
                      {superAdmin && (
                        <button 
                          onClick={() => deleteCompany(company.id)} 
                          className="btn-danger"
                        >
                          <i className="fas fa-trash"></i> حذف
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

      {showEditModal && editingCompany && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> تعديل الشركة</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateCompany}>
              <div style={styles.formGroup}>
                <label>اسم الشركة</label>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  value={editingCompany.email}
                  onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>الباقة</label>
                <select
                  value={editingCompany.plan}
                  onChange={(e) => setEditingCompany({ ...editingCompany, plan: e.target.value })}
                  style={styles.input}
                >
                  <option value="monthly">شهري</option>
                  <option value="yearly">سنوي</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>مجال العمل</label>
                <select
                  value={editingCompany.industry || 'general'}
                  onChange={(e) => setEditingCompany({ ...editingCompany, industry: e.target.value })}
                  style={styles.input}
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.id} value={ind.id}>{ind.label}</option>
                  ))}
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button type="button" onClick={closeEditModal} className="btn-danger" style={{ marginLeft: '10px' }}>
                  إلغاء
                </button>
                <button type="submit" className="btn-primary">
                  <i className="fas fa-save"></i> حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '30px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    direction: 'rtl',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '15px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#94a3b8',
  },
  formGroup: {
    marginBottom: '16px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '15px',
    marginTop: '6px',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '20px',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '20px',
  },
};