// src/pages/Clients.js
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', companyId: '' });
  const [companies, setCompanies] = useState([]);
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

  if (loading) {
    return <div className="loading">جاري تحميل العملاء...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>👥 إدارة العملاء</h2>

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
          <button type="submit" className="btn-primary">إضافة عميل</button>
        </form>

        <div className="table-container">
          {clients.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>لا يوجد عملاء مسجلين حتى الآن</p>
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
                {clients.map((client, index) => {
                  const companyName = companies.find(c => c.id === client.companyId)?.name || 'غير محدد';
                  return (
                    <tr key={client.id}>
                      <td>{index + 1}</td>
                      <td>{client.name}</td>
                      <td>{client.email}</td>
                      <td>{client.phone || '-'}</td>
                      <td>{companyName}</td>
                      <td>
                        <button onClick={() => deleteClient(client.id)} className="btn-danger">
                          حذف
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
    </div>
  );
}