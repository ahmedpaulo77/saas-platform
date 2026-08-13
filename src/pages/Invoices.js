// src/pages/Invoices.js - نسخة معدلة (مع ربط المخزون)
import React, { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import Sidebar from '../components/common/Sidebar';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [newInvoice, setNewInvoice] = useState({ 
    clientId: '', 
    productId: '',
    quantity: 1,
    amount: '', 
    status: 'pending', 
    description: '' 
  });
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchInvoices();
    fetchClients();
    fetchProducts();
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

  async function fetchProducts() {
    try {
      const querySnapshot = await getDocs(collection(db, 'inventory'));
      const productsData = [];
      querySnapshot.forEach((doc) => {
        productsData.push({ id: doc.id, ...doc.data() });
      });
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  async function addInvoice(e) {
    e.preventDefault();
    if (!newInvoice.clientId || !newInvoice.amount || !newInvoice.productId) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      // 1. إضافة الفاتورة
      await addDoc(collection(db, 'invoices'), {
        ...newInvoice,
        amount: parseFloat(newInvoice.amount),
        quantity: parseInt(newInvoice.quantity) || 1,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      // 2. تقليل الكمية في المخزون
      const productRef = doc(db, 'inventory', newInvoice.productId);
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const currentQuantity = productDoc.data().quantity || 0;
        const quantityToReduce = parseInt(newInvoice.quantity) || 1;
        const newQuantity = currentQuantity - quantityToReduce;
        
        if (newQuantity < 0) {
          alert('❌ الكمية المطلوبة أكبر من المتوفرة في المخزون!');
          return;
        }
        
        await updateDoc(productRef, { quantity: newQuantity });
      }

      setNewInvoice({ clientId: '', productId: '', quantity: 1, amount: '', status: 'pending', description: '' });
      await fetchInvoices();
      await fetchProducts();
      alert('✅ تم إضافة الفاتورة وتحديث المخزون بنجاح');
    } catch (error) {
      console.error('Error adding invoice:', error);
      alert('❌ حدث خطأ في إضافة الفاتورة');
    }
  }

  function openEditModal(invoice) {
    setEditingInvoice(invoice);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingInvoice(null);
    setShowEditModal(false);
  }

  async function updateInvoice(e) {
    e.preventDefault();
    if (!editingInvoice.clientId || !editingInvoice.amount) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    try {
      const invoiceRef = doc(db, 'invoices', editingInvoice.id);
      await updateDoc(invoiceRef, {
        clientId: editingInvoice.clientId,
        amount: parseFloat(editingInvoice.amount),
        status: editingInvoice.status,
        description: editingInvoice.description || ''
      });
      await fetchInvoices();
      closeEditModal();
      alert('✅ تم تحديث الفاتورة بنجاح');
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert('❌ حدث خطأ في تحديث الفاتورة');
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

  const filteredInvoices = invoices.filter(invoice => {
    const clientName = clients.find(c => c.id === invoice.clientId)?.name || '';
    return clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.amount.toString().includes(searchTerm) ||
      invoice.status.includes(searchTerm) ||
      (invoice.description && invoice.description.toLowerCase().includes(searchTerm.toLowerCase()));
  });

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
          
          <select
            value={newInvoice.productId}
            onChange={(e) => {
              const product = products.find(p => p.id === e.target.value);
              setNewInvoice({ 
                ...newInvoice, 
                productId: e.target.value,
                amount: product ? product.price : ''
              });
            }}
            required
          >
            <option value="">اختر المنتج</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - {product.quantity} متبقي
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="الكمية"
            value={newInvoice.quantity}
            onChange={(e) => setNewInvoice({ ...newInvoice, quantity: e.target.value })}
            required
            min="1"
          />

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

          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> إضافة فاتورة
          </button>
        </form>

        <div style={{ marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="🔍 ابحث عن فاتورة باسم العميل أو المبلغ أو الحالة..."
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

        <div className="table-container">
          <div className="table-header">
            <h3>قائمة الفواتير</h3>
            <span>{filteredInvoices.length} فاتورة</span>
          </div>
          {filteredInvoices.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
              {searchTerm ? '❌ لا توجد نتائج مطابقة للبحث' : 'لا توجد فواتير مسجلة حتى الآن'}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>العميل</th>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice, index) => {
                  const clientName = clients.find(c => c.id === invoice.clientId)?.name || 'غير محدد';
                  const productName = products.find(p => p.id === invoice.productId)?.name || 'غير محدد';
                  return (
                    <tr key={invoice.id}>
                      <td>{index + 1}</td>
                      <td>{clientName}</td>
                      <td>{productName}</td>
                      <td>{invoice.quantity || 1}</td>
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
                      <td>
                        <button 
                          onClick={() => openEditModal(invoice)} 
                          className="btn-primary" 
                          style={{ marginLeft: '8px', padding: '6px 14px', fontSize: '13px' }}
                        >
                          <i className="fas fa-edit"></i> تعديل
                        </button>
                        <button 
                          onClick={() => deleteInvoice(invoice.id)} 
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

      {showEditModal && editingInvoice && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3><i className="fas fa-edit"></i> تعديل الفاتورة</h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>&times;</button>
            </div>
            <form onSubmit={updateInvoice}>
              <div style={styles.formGroup}>
                <label>العميل</label>
                <select
                  value={editingInvoice.clientId}
                  onChange={(e) => setEditingInvoice({ ...editingInvoice, clientId: e.target.value })}
                  required
                  style={styles.input}
                >
                  <option value="">اختر العميل</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>المبلغ</label>
                <input
                  type="number"
                  value={editingInvoice.amount}
                  onChange={(e) => setEditingInvoice({ ...editingInvoice, amount: e.target.value })}
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>الحالة</label>
                <select
                  value={editingInvoice.status}
                  onChange={(e) => setEditingInvoice({ ...editingInvoice, status: e.target.value })}
                  style={styles.input}
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="paid">مدفوعة</option>
                  <option value="overdue">متأخرة</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label>الوصف</label>
                <input
                  type="text"
                  value={editingInvoice.description || ''}
                  onChange={(e) => setEditingInvoice({ ...editingInvoice, description: e.target.value })}
                  style={styles.input}
                />
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