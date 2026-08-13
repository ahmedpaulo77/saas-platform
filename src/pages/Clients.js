// src/pages/Clients.js - نسخة كاملة مع البحث والتعديل
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', companyId: '' });
  const [companies, setCompanies] = useState([]);
  const [editingClient, setEditingClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClients();
    fetchCompanies();
  }, []);

  async function fetchClients() {
    try {
      const querySnapshot = await getDocs(collection(db, 'clients'));
      const clientsData = [];
      querySnapshot.forEach((doc) => {
        clientsData.push({ id: doc.id, ...doc.data() });
      });
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
      alert('حدث خطأ في جلب العملاء');
    } finally {
      setLoading(false);
    }
  }

  async function fetchCompanies() {
    try {
      const querySnapshot = await getDocs(collection(db, 'companies'));
      const companiesData = [];
      querySnapshot.forEach((doc) => {
        companiesData.push({ id: doc.id, name: doc.data().name });
      });
      setCompanies(companiesData);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  }

  async function addClient(e) {
    e.preventDefault();
    if (!newClient.name || !newClient.email || !newClient.companyId) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    try {
      await addDoc(collection(db, 'clients'), {
        ...newClient,
        createdAt: new Date().toISOString()
      });
      setNewClient({ name: '', email: '', phone: '', companyId: '' });
      await fetchClients();
      alert('✅ تم إضافة العميل بنجاح');
    } catch (error) {
      console.error('Error adding client:', error);
      alert('❌ حدث خطأ في إضافة العميل');
    }
  }

  function openEditModal(client) {
    setEditingClient(client);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingClient(null);
    setShowEditModal(false);
  }

  async function updateClient(e) {
    e.preventDefault();
    if (!editingClient.name || !editingClient.email || !editingClient.companyId) {
      alert('يرجى ملء جميع الحقول');
      return;
    }

    try {
      const clientRef = doc(db, 'clients', editingClient.id);
      await updateDoc(clientRef, {
        name: editingClient.name,
        email: editingClient.email,
        phone: editingClient.phone || '',
        companyId: editingClient.companyId
      });
      await fetchClients();
      closeEditModal();
      alert('✅ تم تحديث العميل بنجاح');
    } catch (error) {
      console.error('Error updating client:', error);
      alert('❌ حدث خطأ في تحديث العميل');
    }
  }

  async function deleteClient(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    try {
      await deleteDoc(doc(db, 'clients', id));
      await fetchClients();
      alert('✅ تم حذف العميل بنجاح');
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('❌ حدث خطأ في حذف العميل');
    }
  }

  // فلترة العملاء حسب البحث
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (client.phone && client.phone.includes(searchTerm))
  );

  if (loading) {
    return <div className="loading">جاري تحميل العملاء...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>👥 إدارة العملاء</h2>

        {/* نموذج الإضافة */}
        <form onSubmit={addClient} className="form-container">
          <input
            type="text"
            placeholder="اسم العميل"
            value={newClient.name}
            onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="الهاتف"
            value={newClient.phone}
            onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
          />
          <select
            value={newClient.companyId}
            onChange={(e) => setNewClient({ ...newClient, companyId: e.target.value })}
            required
          >
            <option value="">اختر الشركة</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> إضافة عميل
          </button>
        </form>

        {/* حقل البحث */}
        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن عميل بالاسم أو البريد الإلكتروني أو الهاتف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '15px',
              transition: 'border-color 0.3s',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#4f46e5'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>

        {/* جدول العملاء */}
        <div className="table-container">
          <div className="table-header">
            <h3>قائمة العملاء</h3>
            <span>{filteredClients.length} عميل</span>
          </div>
          {filteredClients.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
              {searchTerm ? '❌ لا توجد نتائج مطابقة للبحث' : 'لا يوجد عملاء مسجلين حتى الآن'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم العميل</th>
                  <th>البريد الإلكتروني</th>
                  <th>الهاتف</th>
                  <th>الشركة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, index) => {
                  const companyName = companies.find(c => c.id === client.companyId)?.name || 'غير محدد';
                  return (
                    <tr key={client.id}>
                      <td>{index + 1}</td>
                      <td>{client.name}</td>
                      <td>{client.email}</td>
                      <td>{client.phone || '-'}</td>
                      <td>{companyName}</td>
                      <td>
                        <button 
                          onClick={() => openEditModal(client)} 
                          className="btn-primary" 
                          style={{ marginLeft: '8px', padding: '6px 14px', fontSize: '13px' }}
                        >
                          <i className="fas fa-edit"></i> تعديل
                        </button>
                        <button 
                          onClick={() => deleteClient(client.id)} 
                          className="btn-danger"
                        >
                          <i className="fas fa-trash"></i> حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* مودال التعديل */}
      {showEditModal && editingClient && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> تعديل العميل</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateClient}>
              <div style={styles.formGroup}>
                <label>اسم العميل</label>
                <input
                  type="text"
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  value={editingClient.email}
                  onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>الهاتف</label>
                <input
                  type="text"
                  value={editingClient.phone || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>الشركة</label>
                <select
                  value={editingClient.companyId}
                  onChange={(e) => setEditingClient({ ...editingClient, companyId: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="">اختر الشركة</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
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
    transition: 'color 0.3s',
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
    transition: 'border-color 0.3s',
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