// src/pages/admin/SuperAdminDashboard.js
import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    expired: 0,
    trial: 0
  });
  const { currentUser } = useAuth();

  // جلب بيانات الشركات
  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      const querySnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = [];
      let active = 0, expired = 0, trial = 0;

      querySnapshot.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        companiesData.push(data);

        // حساب الإحصائيات
        if (data.subscription?.status === 'active') active++;
        else if (data.subscription?.status === 'expired') expired++;
        else if (data.subscription?.status === 'trial') trial++;
      });

      setCompanies(companiesData);
      setStats({
        total: companiesData.length,
        active,
        expired,
        trial
      });
    } catch (error) {
      console.error('Error fetching companies:', error);
      alert('حدث خطأ في جلب بيانات الشركات');
    } finally {
      setLoading(false);
    }
  }

  // تحديث حالة الاشتراك
  async function updateSubscription(companyId, newStatus) {
    if (!window.confirm(`هل أنت متأكد من تغيير حالة الاشتراك إلى ${newStatus}؟`)) return;

    try {
      const companyRef = doc(db, 'companies', companyId);
      await updateDoc(companyRef, {
        'subscription.status': newStatus,
        'subscription.updatedAt': new Date().toISOString()
      });
      await fetchCompanies(); // تحديث القائمة
      alert('تم تحديث حالة الاشتراك بنجاح');
    } catch (error) {
      console.error('Error updating subscription:', error);
      alert('حدث خطأ في تحديث الاشتراك');
    }
  }

  // حذف شركة
  async function deleteCompany(companyId) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الشركة؟ هذا الإجراء لا يمكن التراجع عنه!')) return;

    try {
      await deleteDoc(doc(db, 'companies', companyId));
      await fetchCompanies();
      alert('تم حذف الشركة بنجاح');
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('حدث خطأ في حذف الشركة');
    }
  }

  if (loading) {
    return <div style={styles.loading}>جاري تحميل بيانات الشركات...</div>;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>لوحة تحكم السوبر أدمن</h1>
      <p style={styles.subtitle}>مرحباً {currentUser?.email}</p>

      {/* بطاقات الإحصائيات */}
      <div style={styles.statsGrid}>
        <div style={{...styles.statCard, borderBottom: '4px solid #2196F3'}}>
          <h3>إجمالي الشركات</h3>
          <p style={styles.statNumber}>{stats.total}</p>
        </div>
        <div style={{...styles.statCard, borderBottom: '4px solid #4CAF50'}}>
          <h3>نشطة</h3>
          <p style={styles.statNumber}>{stats.active}</p>
        </div>
        <div style={{...styles.statCard, borderBottom: '4px solid #FF9800'}}>
          <h3>فترة تجريبية</h3>
          <p style={styles.statNumber}>{stats.trial}</p>
        </div>
        <div style={{...styles.statCard, borderBottom: '4px solid #f44336'}}>
          <h3>منتهية</h3>
          <p style={styles.statNumber}>{stats.expired}</p>
        </div>
      </div>

      {/* جدول الشركات */}
      <div style={styles.tableContainer}>
        <h2>قائمة الشركات</h2>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الشركة</th>
                <th>البريد الإلكتروني</th>
                <th>الباقة</th>
                <th>الحالة</th>
                <th>تاريخ الانتهاء</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan="7" style={styles.emptyMessage}>لا توجد شركات مسجلة حتى الآن</td>
                </tr>
              ) : (
                companies.map((company, index) => (
                  <tr key={company.id}>
                    <td>{index + 1}</td>
                    <td>{company.name || 'غير محدد'}</td>
                    <td>{company.email}</td>
                    <td>{company.subscription?.plan || 'غير محدد'}</td>
                    <td>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: company.subscription?.status === 'active' ? '#4CAF50' :
                                       company.subscription?.status === 'trial' ? '#FF9800' : '#f44336'
                      }}>
                        {company.subscription?.status === 'active' ? 'نشط' :
                         company.subscription?.status === 'trial' ? 'تجريبي' : 'منتهي'}
                      </span>
                    </td>
                    <td>
                      {company.subscription?.endDate 
                        ? new Date(company.subscription.endDate).toLocaleDateString('ar-EG')
                        : 'غير محدد'}
                    </td>
                    <td>
                      <select 
                        onChange={(e) => updateSubscription(company.id, e.target.value)}
                        defaultValue={company.subscription?.status || ''}
                        style={styles.actionSelect}
                      >
                        <option value="active">تفعيل</option>
                        <option value="trial">تجريبي</option>
                        <option value="expired">إلغاء</option>
                      </select>
                      <button 
                        onClick={() => deleteCompany(company.id)}
                        style={styles.deleteBtn}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    direction: 'rtl',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5'
  },
  title: {
    color: '#333',
    marginBottom: '5px'
  },
  subtitle: {
    color: '#666',
    marginBottom: '30px'
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    fontSize: '1.2rem',
    color: '#666'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '30px'
  },
  statCard: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    textAlign: 'center'
  },
  statNumber: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: '10px 0 0 0',
    color: '#333'
  },
  tableContainer: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '10px'
  },
  statusBadge: {
    padding: '5px 10px',
    borderRadius: '15px',
    color: 'white',
    fontSize: '0.85rem',
    display: 'inline-block'
  },
  actionSelect: {
    padding: '5px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    marginRight: '5px'
  },
  deleteBtn: {
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  emptyMessage: {
    textAlign: 'center',
    padding: '20px',
    color: '#999'
  }
};