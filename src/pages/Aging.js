// src/pages/Aging.js - تقرير أعمار الديون مع دعم الترجمة
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/common/Sidebar';
import * as XLSX from 'xlsx';
import { useLanguage } from '../i18n/LanguageContext';

const BUCKETS = [
  { labelKey: 'ag.b0', color: '#6366f1', bg: '#e0e7ff', textColor: '#3730a3' },
  { labelKey: 'ag.b1', color: '#10b981', bg: '#d1fae5', textColor: '#065f46' },
  { labelKey: 'ag.b2', color: '#f59e0b', bg: '#fef3c7', textColor: '#92400e' },
  { labelKey: 'ag.b3', color: '#f97316', bg: '#ffedd5', textColor: '#9a3412' },
  { labelKey: 'ag.b4', color: '#ef4444', bg: '#fee2e2', textColor: '#991b1b' },
];

function parseDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getDaysPastDue(invoice) {
  const baseDate = invoice.dueDate
    ? parseDate(invoice.dueDate)
    : parseDate(invoice.date || invoice.createdAt || new Date());
  const today = startOfDay(new Date());
  const diff = Math.floor((today - startOfDay(baseDate)) / (1000 * 60 * 60 * 24));
  return diff;
}

function getBucket(days) {
  if (days < 0) return 0;
  if (days < 30) return 1;
  if (days < 60) return 2;
  if (days < 90) return 3;
  return 4;
}

export default function Aging() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const superAdmin = userRole === 'super_admin';

  const [agingData, setAgingData] = useState([]);
  const [totals, setTotals] = useState({ total: 0, buckets: BUCKETS.map(() => 0) });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState({ totalClients: 0, totalDebt: 0, criticalClients: 0 });

  const fetchAgingData = useCallback(async () => {
    if (!superAdmin && !userCompanyId) { setLoading(false); return; }
    try {
      const clientsSnap = await getDocs(
        superAdmin
          ? collection(db, 'clients')
          : query(collection(db, 'clients'), where('companyId', '==', userCompanyId))
      );
      const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const invoicesSnap = await getDocs(
        superAdmin
          ? query(collection(db, 'invoices'), where('status', '!=', 'paid'))
          : query(collection(db, 'invoices'), where('companyId', '==', userCompanyId))
      );
      const invoices = invoicesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(inv => inv.status !== 'paid');

      const clientMap = {};
      clients.forEach(c => {
        clientMap[c.id] = {
          id: c.id,
          name: c.name,
          phone: c.phone || '-',
          total: 0,
          buckets: BUCKETS.map(() => 0),
          invoicesCount: 0,
          oldestDays: 0,
        };
      });

      invoices.forEach(inv => {
        if (!inv.clientId || !clientMap[inv.clientId]) return;

        const amount = parseFloat(inv.amount) || 0;
        const paid = parseFloat(inv.paidAmount) || 0;
        const remaining = amount - paid;
        if (remaining <= 0) return;

        const days = getDaysPastDue(inv);
        const bucketIdx = getBucket(days);

        clientMap[inv.clientId].total += remaining;
        clientMap[inv.clientId].buckets[bucketIdx] += remaining;
        clientMap[inv.clientId].invoicesCount++;
        if (days > clientMap[inv.clientId].oldestDays) {
          clientMap[inv.clientId].oldestDays = days;
        }
      });

      const result = Object.values(clientMap).filter(c => c.total > 0);
      result.sort((a, b) => b.total - a.total);

      const totalBuckets = BUCKETS.map(() => 0);
      let totalDebt = 0;
      let criticalClients = 0;

      result.forEach(c => {
        totalDebt += c.total;
        c.buckets.forEach((v, i) => { totalBuckets[i] += v; });
        if (c.buckets[3] + c.buckets[4] > 0) criticalClients++;
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
      [t('ag.x.client')]: c.name,
      [t('ag.x.phone')]: c.phone,
      [t('ag.x.count')]: c.invoicesCount,
      [t('ag.x.b0')]: c.buckets[0].toFixed(2),
      [t('ag.x.b1')]: c.buckets[1].toFixed(2),
      [t('ag.x.b2')]: c.buckets[2].toFixed(2),
      [t('ag.x.b3')]: c.buckets[3].toFixed(2),
      [t('ag.x.b4')]: c.buckets[4].toFixed(2),
      [t('ag.x.total')]: c.total.toFixed(2),
      [t('ag.x.oldest')]: c.oldestDays,
    }));

    rows.push({
      [t('ag.x.client')]: t('ag.x.sum'),
      [t('ag.x.phone')]: '',
      [t('ag.x.count')]: '',
      [t('ag.x.b0')]: totals.buckets[0].toFixed(2),
      [t('ag.x.b1')]: totals.buckets[1].toFixed(2),
      [t('ag.x.b2')]: totals.buckets[2].toFixed(2),
      [t('ag.x.b3')]: totals.buckets[3].toFixed(2),
      [t('ag.x.b4')]: totals.buckets[4].toFixed(2),
      [t('ag.x.total')]: totals.total.toFixed(2),
      [t('ag.x.oldest')]: '',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('ag.x.sheet'));
    XLSX.writeFile(wb, `${t('ag.x.file')}-${new Date().toLocaleDateString('ar-EG')}.xlsx`);
    setExporting(false);
  }

  const filtered = agingData.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  if (loading) return (
    <div className="loading"><div className="spinner"></div>{t('ag.loading')}</div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">

        <div className="header">
          <div>
            <h1>
              <i className="fas fa-clock" style={{ color: '#ef4444', marginLeft: 10 }}></i>
              {t('ag.title')}
            </h1>
            <p className="subtitle">{t('ag.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setLoading(true); fetchAgingData(); }} className="btn-secondary">
              <i className="fas fa-sync-alt"></i> {t('common.refresh')}
            </button>
            <button onClick={exportToExcel} className="btn-primary" disabled={exporting || filtered.length === 0}>
              {exporting
                ? <><i className="fas fa-spinner fa-spin"></i> {t('common.exporting')}</>
                : <><i className="fas fa-file-excel"></i> {t('common.exportExcel')}</>}
            </button>
          </div>
        </div>

        <div className="stats-row" style={{ marginBottom: 24 }}>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{summary.totalClients}</div>
            <div className="stat-label">{t('ag.clientsDebt')}</div>
          </div>
          <div className="stat-card amber">
            <div className="stat-icon"><i className="fas fa-money-bill-wave"></i></div>
            <div className="stat-value" style={{ fontSize: 20 }}>{summary.totalDebt.toLocaleString()}</div>
            <div className="stat-label">{t('ag.totalDebt')}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon"><i className="fas fa-exclamation-triangle"></i></div>
            <div className="stat-value">{summary.criticalClients}</div>
            <div className="stat-label">{t('ag.risk')}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {summary.totalDebt > 0
                ? Math.round((totals.buckets[1] / summary.totalDebt) * 100)
                : 0}%
            </div>
            <div className="stat-label">{t('ag.under30')}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>
            <i className="fas fa-chart-bar" style={{ color: '#6366f1' }}></i>
            {t('ag.distribution')}
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
                  {t(bucket.labelKey)}
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: bucket.color }}>
                  {totals.buckets[i].toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: bucket.textColor, opacity: 0.7, marginTop: 2 }}>
                  {t('currency')} — {summary.totalDebt > 0
                    ? Math.round((totals.buckets[i] / summary.totalDebt) * 100)
                    : 0}% من الإجمالي
                </div>
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

        <div className="search-wrapper" style={{ marginBottom: 20 }}>
          <i className="fas fa-search search-icon"></i>
          <input
            type="text"
            placeholder={t('ag.search')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-table"></i> {t('ag.table')}</h3>
            <span className="table-count">{filtered.length} {t('ag.nClients', { count: filtered.length })}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="fas fa-check-circle" style={{ color: '#10b981' }}></i>
              </div>
              <h3>{t('ag.okTitle')}</h3>
              <p>{t('ag.okDesc')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('ag.client')}</th>
                    <th>{t('common.phone')}</th>
                    <th>{t('ag.invoices')}</th>
                    {BUCKETS.map((b, i) => (
                      <th key={i} style={{ color: b.color, whiteSpace: 'nowrap' }}>
                        {t(b.labelKey)}
                      </th>
                    ))}
                    <th style={{ color: '#0f172a' }}>{t('ag.total')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => {
                    const isHighRisk = client.buckets[4] > 0;
                    const isMedRisk  = client.buckets[3] > 0 && !isHighRisk;

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
                                {amount.toLocaleString()} {t('currency')}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--gray-300)' }}>—</span>
                            )}
                          </td>
                        ))}
                        <td style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                          {client.total.toLocaleString()} {t('currency')}
                        </td>
                        <td>
                          {isHighRisk ? (
                            <span className="badge badge-expired">
                              <i className="fas fa-skull-crossbones"></i> {t('ag.critical', { n: client.oldestDays })}
                            </span>
                          ) : isMedRisk ? (
                            <span className="badge badge-pending">
                              <i className="fas fa-exclamation-triangle"></i> {t('ag.warn', { n: client.oldestDays })}
                            </span>
                          ) : (
                            <span className="badge badge-active">
                              <i className="fas fa-check"></i> {t('ag.ok', { n: client.oldestDays })}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid var(--gray-200)' }}>
                    <td colSpan={4} style={{ fontWeight: 700, color: 'var(--gray-700)', padding: '14px 16px' }}>
                      {t('ag.x.sum')}
                    </td>
                    {totals.buckets.map((total, i) => (
                      <td key={i} style={{ fontWeight: 800, color: BUCKETS[i].color, padding: '14px 16px' }}>
                        {total.toLocaleString()} {t('currency')}
                      </td>
                    ))}
                    <td style={{ fontWeight: 900, fontSize: 16, color: '#ef4444', padding: '14px 16px' }}>
                      {totals.total.toLocaleString()} {t('currency')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>
            <i className="fas fa-info-circle" style={{ color: '#6366f1' }}></i>
            {t('ag.legend')}
          </h3>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { color: '#6366f1', bg: '#e0e7ff', labelKey: 'ag.l0', descKey: 'ag.d0' },
              { color: '#10b981', bg: '#d1fae5', labelKey: 'ag.l1', descKey: 'ag.d1' },
              { color: '#f59e0b', bg: '#fef3c7', labelKey: 'ag.l2', descKey: 'ag.d2' },
              { color: '#ef4444', bg: '#fee2e2', labelKey: 'ag.l3', descKey: 'ag.d3' },
            ].map(item => (
              <div key={item.labelKey} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: item.bg, color: item.color,
                  padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700
                }}>{t(item.labelKey)}</span>
                <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{t(item.descKey)}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}