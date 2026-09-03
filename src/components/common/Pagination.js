// src/components/common/Pagination.js - Pagination عام قابل لإعادة الاستخدام
import React, { useState, useEffect } from 'react';

const PAGE_SIZES = [20, 50, 100];

export default function Pagination({
  data,
  pageSize = 20,
  render,
  empty,
  resetKey,
  showPageSize = true,
}) {
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);

  const total = Array.isArray(data) ? data.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / itemsPerPage));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * itemsPerPage;
  const pageItems = Array.isArray(data) ? data.slice(start, start + itemsPerPage) : [];

  // إعادة الضبط عند تغيير resetKey (بحث/فلتر/بيانات جديدة)
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  // ضمان أن الصفحة الحالية لا تتجاوز العدد بعد الحذف
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  // توليد أرقام الصفحات المعروضة (مع صفحة أولى وأخيرة)
  const getPageNumbers = () => {
    const numbers = [];
    const visible = new Set([1, pageCount, safePage - 1, safePage, safePage + 1]);
    let prev = 0;
    for (let i = 1; i <= pageCount; i++) {
      if (visible.has(i)) {
        if (prev && i - prev > 1) numbers.push('...');
        numbers.push(i);
        prev = i;
      }
    }
    return numbers;
  };

  return (
    <div>
      {pageItems.length === 0 ? (
        empty
      ) : (
        <>
          {render(pageItems, total, start)}
          {pageCount > 1 && (
            <div className="pagination-bar">
              <div className="pagination-info">
                <span>
                  عرض {start + 1}-{Math.min(start + itemsPerPage, total)} من {total}
                </span>
                {showPageSize && (
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(parseInt(e.target.value, 10));
                      setPage(1);
                    }}
                    className="pagination-size"
                    title="عدد العناصر بالصفحة"
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s} / صفحة
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  السابق
                </button>
                {getPageNumbers().map((n, i) =>
                  n === '...' ? (
                    <span key={`dots-${i}`} className="pagination-dots">
                      …
                    </span>
                  ) : (
                    <button
                      type="button"
                      key={n}
                      className={`pagination-btn ${n === safePage ? 'active' : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage(safePage + 1)}
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
