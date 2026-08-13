// src/pages/Companies.js
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [newCompany, setNewCompany] = useState({ name: '', email: '', plan: 'monthly' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const querySnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = [];
      querySnapshot.forEach((doc) => {
        companiesData.push({ id: doc.id, ...doc.data() });
      });
      setCompanies(companiesData);
    } catch (error) {
      console.error('Error fetching companies:', error);
      alert('حدث خطأ في جلب الشركات');
    } finally {
      setLoading(false);
    }
  }

  async function addCompany(e) {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    try {
      await addDoc(collection(db, 'companies'), {
        ...newCompany,
        subscription: {
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        createdAt: new Date().toISOString(),
        isActive: true
      });
      setNewCompany({ name: '', email: '', plan: 'monthly' });
      await fetchCompanies();
      alert('✅ تم إضافة الشركة بنجاح');
    } catch (error) {
      console.error('Error adding company:', error);
      alert('❌ حدث خطأ في إضافة الشركة');
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الشركة؟')) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
      await fetchCompanies();
      alert('✅ تم حذف الشركة بنجاح');
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('❌ حدث خطأ في حذف الشركة');
    }
  }

  if (loading) {
    return <div className="loading">جاري تحميل الشركات...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>🏢 إدارة الشركات</h2>

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
          <button type="submit" className="btn-primary">إضافة شركة</button>
        </form>

        <div className="table-container">
          {companies.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>لا توجد شركات مسجلة حتى الآن</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم الشركة</th>
                  <th>البريد الإلكتروني</th>
                  <th>الباقة</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company, index) => (
                  <tr key={company.id}>
                    <td>{index + 1}</td>
                    <td>{company.name}</td>
                    <td>{company.email}</td>
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
                      <button onClick={() => deleteCompany(company.id)} className="btn-danger">
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}