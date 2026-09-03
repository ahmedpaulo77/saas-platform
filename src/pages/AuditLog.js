import React, { useState, useEffect, useCallback, useRef } from "react";
import { collection, getDocs, query, where, orderBy, limit, startAfter } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import Pagination from "../components/common/PaginationV2";

const PAGE_SIZE = 30;

export default function AuditLog() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const isSuperAdmin = userRole === 'super_admin';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filterAction, setFilterAction] = useState('all');
  const [filterCollection, setFilterCollection] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const lastDocRef = useRef(null);

  const fetchLogs = useCallback(async (reset = false) => {
    if (!userCompanyId && !isSuperAdmin) return;
    
    if (reset) {
      setLoading(true);
      lastDocRef.current = null;
    } else {
      setLoadingMore(true);
    }

    try {
      let baseQuery = query(
        collection(db, 'audit_logs'),
        orderBy('timestamp', 'desc'),
        limit(PAGE_SIZE)
      );

      if (!isSuperAdmin) {
        baseQuery = query(baseQuery, where('companyId', '==', userCompanyId));
      }

      if (filterAction !== 'all') {
        baseQuery = query(baseQuery, where('actionType', '==', filterAction));
      }

      if (filterCollection !== 'all') {
        baseQuery = query(baseQuery, where('collectionName', '==', filterCollection));
      }

      if (lastDocRef.current && !reset) {
        baseQuery = query(baseQuery, startAfter(lastDocRef.current));
      }

      const snap = await getDocs(baseQuery);
      const newLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (reset) {
        setLogs(newLogs);
      } else {
        setLogs(prev => [...prev, ...newLogs]);
      }

      setHasMore(snap.docs.length === PAGE_SIZE);
      if (snap.docs.length > 0) {
        lastDocRef.current = snap.docs[snap.docs.length - 1];
      }
    } catch (e) {
      console.error('Error fetching audit logs:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userCompanyId, isSuperAdmin, filterAction, filterCollection]);

  useEffect(() => {
    fetchLogs(true);
  }, [fetchLogs]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (log.details || '').toLowerCase().includes(term) ||
      (log.collectionName || '').toLowerCase().includes(term) ||
      (log.performedBy?.email || '').toLowerCase().includes(term)
    );
  });

  const actionTypes = ['CREATE', 'UPDATE', 'DELETE'];
  const collections = [...new Set(logs.map(l => l.collectionName).filter(Boolean))];

  if (loading)
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading"><div className="spinner"></div>{t('common.loading')}</div>
        </div>
      </div>
    );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1><i className="fas fa-history" style={{ color: '#6366f1', marginLeft: 10 }}></i> {t('audit.title')}</h1>
            <p className="subtitle">{t('audit.subtitle')}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--gray-500)' }}>{t('audit.search')}</label>
              <input
                type="text"
                placeholder={t('audit.searchPh')}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '2px solid var(--gray-200)', borderRadius: 10, fontSize: 14 }}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--gray-500)' }}>{t('audit.action')}</label>
              <select value={filterAction} onChange={e => { setFilterAction(e.target.value); }} style={{ width: '100%', padding: '10px 14px', border: '2px solid var(--gray-200)', borderRadius: 10, fontSize: 14 }}>
                <option value="all">{t('audit.allActions')}</option>
                {actionTypes.map(a => <option key={a} value={a}>{t(`audit.action.${a.toLowerCase()}`)}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--gray-500)' }}>{t('audit.collection')}</label>
              <select value={filterCollection} onChange={e => { setFilterCollection(e.target.value); }} style={{ width: '100%', padding: '10px 14px', border: '2px solid var(--gray-200)', borderRadius: 10, fontSize: 14 }}>
                <option value="all">{t('audit.allCollections')}</option>
                {collections.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t('audit.logs')}</h3>
            <span className="table-count">{filteredLogs.length} {t('audit.records')}</span>
          </div>
          <div className="table-wrapper">
            <Pagination
              data={filteredLogs}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={() => fetchLogs(false)}
              onRefresh={() => fetchLogs(true)}
              pageSize={PAGE_SIZE}
              empty={
                <div className="table-empty">
                  <i className="fas fa-history"></i>
                  <p>{searchTerm ? t('common.noResults') : t('audit.empty')}</p>
                </div>
              }
              render={(pageItems) => (
                <table>
                  <thead>
                    <tr>
                      <th>{t('audit.time')}</th>
                      <th>{t('audit.action')}</th>
                      <th>{t('audit.collection')}</th>
                      <th>{t('audit.itemId')}</th>
                      <th>{t('audit.details')}</th>
                      <th>{t('audit.user')}</th>
                      <th>{t('audit.role')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: 'var(--gray-500)', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : '-'}
                        </td>
                        <td>
                          <span className={`badge ${log.actionType === 'DELETE' ? 'badge-expired' : log.actionType === 'UPDATE' ? 'badge-pending' : 'badge-paid'}`}>
                            {t(`audit.action.${log.actionType ? log.actionType.toLowerCase() : 'create'}`)}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: '#6366f1' }}>{log.collectionName || '-'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gray-600)' }}>{log.itemId || '-'}</td>
                        <td style={{ maxWidth: 300, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{log.details || '-'}</td>
                        <td style={{ color: 'var(--gray-600)' }}>{log.performedBy?.email || '-'}</td>
                        <td>
                          <span className={`badge ${log.performedBy?.role === 'super_admin' ? 'badge-expired' : log.performedBy?.role === 'admin' ? 'badge-pending' : 'badge-paid'}`}>
                            {t(`role.${log.performedBy?.role || 'user'}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}