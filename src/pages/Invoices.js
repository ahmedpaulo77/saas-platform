// src/pages/Invoices.js
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [newInvoice, setNewInvoice] = useState({ 
    clientId: '', 
    amount: '', 
    status: 'pending', 
    description: '' 
  });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
    fetchClients();
  }, []);

  async function fetchInvoices() {
    try {
      const querySnapshot = await getDocs(collection(db, 'invoices'));
      const invoicesData = [];
      querySnapshot.forEach((doc) => {
        invoicesData.push({ id: doc.id, ...doc.data() });
      });
      setInvoices(invoicesData);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      alert('حدث خطأ في جلب الفواتير');
    } finally {
      setLoading(false);
    }
  }

  async function fetchClients() {
    try {
      const querySnapshot = await getDocs(collection(db, 'clients'));
      const clientsData = [];
      querySnapshot.forEach((doc) => {
        clientsData.push({ id: doc.id, name: doc.data().name });
      });
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  }

  async function addInvoice(e) {
    e.preventDefault();
    if (!newInvoice.clientId || !newInvoice.amount) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        amount: parseFloat(newInvoice.amount),
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      setNewInvoice({ clientId: '', amount: '', status: 'pending', description: '' });
      await fetchInvoices();
      alert('✅ تم إضافة الفاتورة بنجاح');
    } catch (error) {
      console.error('Error adding invoice:', error);
      alert('❌ حدث خطأ في إضافة الفاتورة');
    }
  }

  async function deleteInvoice(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;
    try {
      await deleteDoc(doc(db, 'invoices', id));
      await fetchInvoices();
      alert('✅ تم حذف الفاتورة بنجاح');
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('❌ حدث خطأ في حذف الفاتورة');
    }
  }

  if (loading) {
    return <div className="loading">جاري تحميل الفواتير...</div>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: '#333', marginBottom: '20px' }}>📄 إدارة الفواتير</h2>

        <form onSubmit={addInvoice} className="form-container">
          <select
            value={newInvoice.clientId}
            onChange={(e) => setNewInvoice({ ...newInvoice, clientId: e.target.value })}
            required
          >
            <option value="">اختر العميل</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="المبلغ"
            value={newInvoice.amount}
            onChange={(e) => setNewInvoice({ ...newInvoice, amount: e.target.value })}
            required
          />
          <select
            value={newInvoice.status}
            onChange={(e) => setNewInvoice({ ...newInvoice, status: e.target.value })}
          >
            <option value="pending">قيد الانتظار</option>
            <option value="paid">مدفوعة</option>
            <option value="overdue">متأخرة</option>
          </select>
          <input
            type="text"
            placeholder="الوصف"
            value={newInvoice.description}
            onChange={(e) => setNewInvoice({ ...newInvoice, description: e.target.value })}
          />
          <button type="submit" className="btn-primary">إضافة فاتورة</button>
        </form>

        <div className="table-container">
          {invoices.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>لا توجد فواتير مسجلة حتى الآن</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>العميل</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>الوصف</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice, index) => {
                  const clientName = clients.find(c => c.id === invoice.clientId)?.name || 'غير محدد';
                  return (
                    <tr key={invoice.id}>
                      <td>{index + 1}</td>
                      <td>{clientName}</td>
                      <td>{invoice.amount} ج.م</td>
                      <td>
                        <span className={`badge ${
                          invoice.status === 'paid' ? 'badge-paid' :
                          invoice.status === 'pending' ? 'badge-pending' : 'badge-overdue'
                        }`}>
                          {invoice.status === 'paid' ? 'مدفوعة' :
                           invoice.status === 'pending' ? 'قيد الانتظار' : 'متأخرة'}
                        </span>
                      </td>
                      <td>{new Date(invoice.date).toLocaleDateString('ar-EG')}</td>
                      <td>{invoice.description || '-'}</td>
                      <td>
                        <button onClick={() => deleteInvoice(invoice.id)} className="btn-danger">
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