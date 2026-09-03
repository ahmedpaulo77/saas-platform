import { useState, useCallback, useEffect, useRef } from 'react';
import { query, orderBy, limit, startAfter, getDocs, where } from 'firebase/firestore';
import { getScopedQuery } from '../utils/companyQuery';

export function useFirestorePagination(collectionName, userRole, userCompanyId, userId, options = {}) {
  const {
    pageSize = 20,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    filters = [],
    enabled = true,
  } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const totalCount = null; // تم تبسيطها للتخلص من التحذير

  const cursorsRef = useRef(new Map());
  const currentPageRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const filtersSerialized = JSON.stringify(filters);

  const buildBaseQuery = useCallback(() => {
    let baseQuery = getScopedQuery(collectionName, userRole, userCompanyId, userId);
    
    const parsedFilters = JSON.parse(filtersSerialized);
    parsedFilters.forEach(([field, op, value]) => {
      baseQuery = query(baseQuery, where(field, op, value));
    });
    
    baseQuery = query(baseQuery, orderBy(orderByField, orderDirection));
    return baseQuery;
  }, [collectionName, userRole, userCompanyId, userId, filtersSerialized, orderByField, orderDirection]);

  const fetchFirstPage = useCallback(async () => {
    if (!enabled) return;
    
    setLoading(true);
    setError(null);
    currentPageRef.current = 0;
    cursorsRef.current.clear();

    try {
      const baseQuery = buildBaseQuery();
      const limitedQuery = query(baseQuery, limit(pageSize));
      const snap = await getDocs(limitedQuery);
      
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (isMountedRef.current) {
        setData(docs);
        setHasMore(snap.docs.length === pageSize);
        
        if (snap.docs.length > 0) {
          cursorsRef.current.set(0, snap.docs[snap.docs.length - 1]);
        }
        currentPageRef.current = 1;
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
        console.error('Pagination fetch error:', err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, buildBaseQuery, pageSize]);

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    const page = currentPageRef.current;
    const cursor = cursorsRef.current.get(page - 1);

    if (!cursor && page > 1) {
      setLoadingMore(false);
      return;
    }

    try {
      const baseQuery = buildBaseQuery();
      let paginatedQuery;
      
      if (cursor) {
        paginatedQuery = query(baseQuery, startAfter(cursor), limit(pageSize));
      } else {
        paginatedQuery = query(baseQuery, limit(pageSize));
      }
      
      const snap = await getDocs(paginatedQuery);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (isMountedRef.current) {
        setData(prev => [...prev, ...docs]);
        setHasMore(snap.docs.length === pageSize);
        
        if (snap.docs.length > 0) {
          cursorsRef.current.set(page, snap.docs[snap.docs.length - 1]);
        }
        currentPageRef.current = page + 1;
      }
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [enabled, loadingMore, hasMore, buildBaseQuery, pageSize]);

  const reset = useCallback(() => {
    setData([]);
    setHasMore(true);
    cursorsRef.current.clear();
    currentPageRef.current = 0;
    fetchFirstPage();
  }, [fetchFirstPage]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  return {
    data,
    loading,
    loadingMore,
    hasMore,
    error,
    totalCount,
    loadMore,
    reset,
    fetchFirstPage,
  };
}

export function useTotalCount(collectionName, userRole, userCompanyId, userId, filters = []) {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);

  const filtersSerialized = JSON.stringify(filters);

  useEffect(() => {
    let active = true;
    async function getCount() {
      setLoading(true);
      try {
        let baseQuery = getScopedQuery(collectionName, userRole, userCompanyId, userId);
        const parsedFilters = JSON.parse(filtersSerialized);
        parsedFilters.forEach(([field, op, value]) => {
          baseQuery = query(baseQuery, where(field, op, value));
        });
        const snap = await getDocs(baseQuery);
        if (active) setCount(snap.size);
      } catch (e) {
        console.error('Count error:', e);
      } finally {
        if (active) setLoading(false);
      }
    }
    getCount();
    return () => { active = false; };
  }, [collectionName, userRole, userCompanyId, userId, filtersSerialized]);

  return { count, loading };
}