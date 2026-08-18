// src/pages/Aging.js - تقرير أعمار الديون
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';
import * as XLSX from 'xlsx';

const BUCKETS = [
  { label: 'أقل من 30 يوم',   min: 0,  max: 30,       color: '#10b981', bg: '#d1fae5', textColor: '#065f46' },
  { label: '30 - 60 يوم',     min: 30, max: 60,       color: '#f59e0b', bg: '#fef3c7', textColor: '#92400e' },
  { label: '60 - 90 يوم',     min: 60, max: 90,       color: '#f97316', bg: '#ffedd5', textColor: '#9a3412' },
  { label: 'أكتر من 90 يوم',  min: 90, max: Infinity, color: '#ef4444', bg: '#fee2e2', textColor: '#991b1b' },
];

function getDaysPastDue(invoice) {
  // لو فيه dueDate — احسب من تاريخ الاستحقاق
  const baseDate = invoice.dueDate
    ? new Date(invoice.dueDate)
    : new Date(invoice.date || invoice.createdAt || new Date());
  const today = new Date();
  const diff = Math.floor((today - baseDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function getBucket(days) {
  return BUCKETS.findIndex(b => days >= b.min && days < b.max);
}

export default function Aging() {
  const { userRole, userCompanyId } = useAuth();
  const superAdmin = userRole === 'super_admin';

  const [agingData, setAgingData] = useState([]);
  const [totals, setTotals] = useState({ total: 0, buckets: [0, 0, 0, 0] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState({ totalClients: 0, totalDebt: 0, criticalClients: 0 });

  const fetchAgingData = useCallback(async () => {
    if (!superAdmin && !userCompanyId) { setLoading(false); return; }
    try {
      // جلب العملاء
      const clientsSnap = await getDocs(
        superAdmin
          ? collection(db, 'clients')
          : query(collection(db, 'clients'), where('companyId', '==', userCompanyId))
      );
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // جلب الفواتير غير المدفوعة فقط
      const invoicesSnap = await getDocs(
        superAdmin
          ? collection(db, 'invoices')
          : query(collection(db, 'invoices'), where('companyId', '==', userCompanyId))
      );
      const invoices = invoicesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inv => inv.status !== 'paid'); // نشيل المدفوعة

      // بناء تقرير الأعمار لكل عميل
      const clientMap = {};
      clients.forEach(c => {
        clientMap[c.id] = {
          id: c.id,
          name: c.name,
          phone: c.phone || '-',
          total: 0,
          buckets: [0, 0, 0, 0], // [<30, 30-60, 60-90, >90]
          invoicesCount: 0,
          oldestDays: 0,
        };
      });

      // توزيع الفواتير على الأعمار
      invoices.forEach(inv => {
        if (!inv.clientId || !clientMap[inv.clientId]) return;

        let days = getDaysPastDue(inv);

        // لو حالتها overdue صريح — نحطها في 90+ تلقائياً
        if (inv.status === 'overdue' && days < 90) {
          days = 90;
        }

        const bucketIdx = getBucket(days);
        const amount = parseFloat(inv.amount) || 0;

        clientMap[inv.clientId].total += amount;
        clientMap[inv.clientId].buckets[bucketIdx] += amount;
        clientMap[inv.clientId].invoicesCount++;
        if (days > clientMap[inv.clientId].oldestDays) {
          clientMap[inv.clientId].oldestDays = days;
        }
      });

      // فلترة العملاء اللي عندهم ديون بس
      const result = Object.values(clientMap).filter(c => c.total > 0);
      result.sort((a, b) => b.total - a.total);

      // حساب الإجماليات
      const totalBuckets = [0, 0, 0, 0];
      let totalDebt = 0;
      let criticalClients = 0;

      result.forEach(c => {
        totalDebt += c.total;
        c.buckets.forEach((v, i) => { totalBuckets[i] += v; });
        if (c.buckets[2] + c.buckets[3] > 0) criticalClients++;
      });

      setAgingData(result);
      setTotals({ total: totalDebt, buckets: totalBuckets });
      setSummary({ totalClients: result.length, totalDebt, criticalClients });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [superAdmin, userCompanyId]);

  useEffect(() => { fetchAgingData(); }, [fetchAgingData]);

  function exportToExcel() {
    setExporting(true);
    const rows = filtered.map(c => ({
      'العميل': c.name,
      'الهاتف': c.phone,
      'عدد الفواتير': c.invoicesCount,
      'أقل من 30 يوم (ج.م)': c.buckets[0].toFixed(2),
      '30-60 يوم (ج.م)': c.buckets[1].toFixed(2),
      '60-90 يوم (ج.م)': c.buckets[2].toFixed(2),
      'أكتر من 90 يوم (ج.م)': c.buckets[3].toFixed(2),
      'إجمالي المديونية (ج.م)': c.total.toFixed(2),
      'أقدم فاتورة (يوم)': c.oldestDays,
    }));

    // إضافة صف الإجماليات
    rows.push({
      'العميل': 'الإجمالي',
      'الهاتف': '',
      'عدد الفواتير': '',
      'أقل من 30 يوم (ج.م)': totals.buckets[0].toFixed(2),
      '30-60 يوم (ج.م)': totals.buckets[1].toFixed(2),
      '60-90 يوم (ج.م)': totals.buckets[2].toFixed(2),
      'أكتر من 90 يوم (ج.م)': totals.buckets[3].toFixed(2),
      'إجمالي المديونية (ج.م)': totals.total.toFixed(2),
      'أقدم فاتورة (يوم)': '',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'أعمار الديون');
    XLSX.writeFile(wb, `تقرير-أعمار-الديون-${new Date().toLocaleDateString('ar-EG')}.xlsx`);
    setExporting(false);
  }

  const filtered = agingData.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  if (loading) return (
    <div className="loading"><div className="spinner"></div>جاري تحليل الديون...</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        {/* Header */}
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-clock" style={{ color: '#ef4444', marginLeft: 10 }}></i>
              تقرير أعمار الديون
            </h1>
            <p className="subtitle">تحليل مديونيات العملاء حسب مدة الاستحقاق</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setLoading(true); fetchAgingData(); }} className="btn-secondary">
              <i className="fas fa-sync-alt"></i> تحديث
            </button>
            <button onClick={exportToExcel} className="btn-primary" disabled={exporting || filtered.length === 0}>
              {exporting
                ? <><i className="fas fa-spinner fa-spin"></i> جاري التصدير...</>
                : <><i className="fas fa-file-excel"></i> تصدير Excel</>}
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{summary.totalClients}</div>
            <div className="stat-label">عملاء لديهم ديون</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
            <div className="stat-value" style={{ fontSize: 20 }}>{summary.totalDebt.toLocaleString()}</div>
            <div className="stat-label">إجمالي المديونية (ج.م)</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{summary.criticalClients}</div>
            <div className="stat-label">عملاء في خطر (+60 يوم)</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {summary.totalDebt > 0
                ? Math.round((totals.buckets[0] / summary.totalDebt) * 100)
                : 0}%
            </div>
            <div className="stat-label">ديون أقل من 30 يوم</div>
          </div>
        </div>

        {/* Buckets Summary Bar */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-chart-bar" style={{ color: '#6366f1' }}></i>
            توزيع الديون حسب العمر
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
            {BUCKETS.map((bucket, i) => (
              <div key={i} style={{
                padding: '16px 20px',
                background: bucket.bg,
                borderRadius: 12,
                border: `1px solid ${bucket.color}30`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: bucket.textColor, marginBottom: 6 }}>
                  <i className="fas fa-circle" style={{ fontSize: 8, marginLeft: 6 }}></i>
                  {bucket.label}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: bucket.color }}>
                  {totals.buckets[i].toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: bucket.textColor, opacity: 0.7, marginTop: 2 }}>
                  ج.م — {summary.totalDebt > 0
                    ? Math.round((totals.buckets[i] / summary.totalDebt) * 100)
                    : 0}% من الإجمالي
                </div>
                {/* Progress bar */}
                <div style={{ height: 4, background: `${bucket.color}25`, borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: bucket.color,
                    width: summary.totalDebt > 0
                      ? `${(totals.buckets[i] / summary.totalDebt) * 100}%`
                      : '0%',
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="search-wrapper" style={{ marginBottom: 20 }}>
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            placeholder="ابحث باسم العميل أو الهاتف..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-table"></i> كشف أعمار الديون التفصيلي</h3>
            <span className="table-count">{filtered.length} عميل</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
              </div>
              <h3>ممتاز! لا توجد ديون مستحقة</h3>
              <p>جميع الفواتير مدفوعة أو لا توجد فواتير معلقة</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>العميل</th>
                    <th>الهاتف</th>
                    <th>الفواتير</th>
                    {BUCKETS.map((b, i) => (
                      <th key={i} style={{ color: b.color, whiteSpace: 'nowrap' }}>
                        {b.label}
                      </th>
                    ))}
                    <th style={{ color: '#0f172a' }}>الإجمالي</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => {
                    // تحديد الحالة
                    const isHighRisk = client.buckets[3] > 0;
                    const isMedRisk  = client.buckets[2] > 0 && !isHighRisk;

                    return (
                      <tr key={client.id} style={{
                        background: isHighRisk ? '#fff5f5' : isMedRisk ? '#fffbeb' : 'white',
                      }}>
                        <td style={{ color: 'var(--gray-400)', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{client.name}</td>
                        <td style={{ color: 'var(--gray-500)' }}>{client.phone}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-info">{client.invoicesCount}</span>
                        </td>
                        {client.buckets.map((amount, bi) => (
                          <td key={bi} style={{ fontWeight: amount > 0 ? 700 : 400 }}>
                            {amount > 0 ? (
                              <span style={{
                                color: BUCKETS[bi].color,
                                background: BUCKETS[bi].bg,
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: 13,
                                display: 'inline-block',
                              }}>
                                {amount.toLocaleString()} ج
                              </span>
                            ) : (
                              <span style={{ color: 'var(--gray-300)' }}>—</span>
                            )}
                          </td>
                        ))}
                        <td style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                          {client.total.toLocaleString()} ج.م
                        </td>
                        <td>
                          {isHighRisk ? (
                            <span className="badge badge-expired">
                              <i className="fas fa-skull-crossbones"></i> متأخر جداً ({client.oldestDays} يوم)
                            </span>
                          ) : isMedRisk ? (
                            <span className="badge badge-pending">
                              <i className="fas fa-exclamation-triangle"></i> تحذير ({client.oldestDays} يوم)
                            </span>
                          ) : (
                            <span className="badge badge-active">
                              <i className="fas fa-check"></i> مقبول ({client.oldestDays} يوم)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Totals Row */}
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid var(--gray-200)' }}>
                    <td colSpan={4} style={{ fontWeight: 700, color: 'var(--gray-700)', padding: '14px 16px' }}>
                      الإجمالي الكلي
                    </td>
                    {totals.buckets.map((total, i) => (
                      <td key={i} style={{ fontWeight: 800, color: BUCKETS[i].color, padding: '14px 16px' }}>
                        {total.toLocaleString()} ج
                      </td>
                    ))}
                    <td style={{ fontWeight: 900, fontSize: 16, color: '#ef4444', padding: '14px 16px' }}>
                      {totals.total.toLocaleString()} ج.م
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>
            <i className="fas fa-info-circle" style={{ color: '#6366f1' }}></i>
            دليل التفسير
          </h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { color: '#10b981', bg: '#d1fae5', label: 'مقبول', desc: 'أقل من 30 يوم من تاريخ الاستحقاق' },
              { color: '#f59e0b', bg: '#fef3c7', label: 'تحذير', desc: 'تجاوز 60 يوم — يحتاج متابعة' },
              { color: '#ef4444', bg: '#fee2e2', label: 'متأخر جداً', desc: 'تجاوز 90 يوم — يستلزم إجراء فوري' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: item.bg, color: item.color,
                  padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700
                }}>{item.label}</span>
                <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
