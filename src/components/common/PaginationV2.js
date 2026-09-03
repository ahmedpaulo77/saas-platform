import React, { useState, useCallback } from 'react';

export default function Pagination({
  data,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onRefresh,
  empty,
  pageSize = 20,
  render,
  showLoadMore = true,
}) {
  const [showAll, setShowAll] = useState(false);

  const handleLoadMore = useCallback(() => {
    onLoadMore?.();
    setShowAll(true);
  }, [onLoadMore]);

  const handleRefresh = useCallback(() => {
    setShowAll(false);
    onRefresh?.();
  }, [onRefresh]);

  const displayedData = showAll ? data : data.slice(0, pageSize);
  const shouldShowLoadMore = showLoadMore && hasMore && !loadingMore && !loading;
  const displayedCount = displayedData.length;

  if (displayedCount === 0 && !loading && !loadingMore) {
    return empty;
  }

  return (
    <div>
      {render(displayedData)}
      {data.length > pageSize && (
        <div
          className="pagination-bar"
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div className="pagination-info">
            <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>
              عرض {displayedCount} من {data.length} {hasMore ? '+' : ''}
            </span>
          </div>
          <div className="pagination-controls" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="pagination-btn btn-secondary"
              onClick={handleRefresh}
              disabled={loading}
              title="إعادة تحميل من البداية"
            >
              <i className="fas fa-rotate-left"></i> من البداية
            </button>
            {shouldShowLoadMore && (
              <button
                type="button"
                className="pagination-btn btn-primary"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <i className="fas fa-spinner fa-spin" style={{ marginLeft: 6 }}></i>
                    جاري التحميل...
                  </>
                ) : (
                  <>
                    <i className="fas fa-chevron-down" style={{ marginLeft: 6 }}></i>
                    تحميل المزيد ({pageSize})
                  </>
                )}
              </button>
            )}
            {hasMore === false && data.length > pageSize && (
              <span
                className="pagination-btn"
                style={{
                  background: 'var(--gray-100)',
                  color: 'var(--gray-500)',
                  cursor: 'default',
                }}
              >
                <i className="fas fa-check" style={{ marginLeft: 6, color: '#10b981' }}></i>
                تم عرض جميع النتائج
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}