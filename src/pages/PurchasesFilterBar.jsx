// src/pages/PurchasesFilterBar.jsx - شريط فلاتر المشتريات (بحث + حالة)
import React from "react";

export default function PurchasesFilterBar({ searchTerm, setSearchTerm, filterStatus, setFilterStatus, t }) {
  return (
    <div className="filter-bar">
      <div className="search-wrapper" style={{ flex: 1 }}>
        <i className="fas fa-search search-icon"></i>
        <input
          type="text"
          placeholder={t("pur.search")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
        <option value="all">{t("in.allStatus")}</option>
        <option value="paid">{t("in.statusPaid")}</option>
        <option value="pending">{t("in.statusWait")}</option>
        <option value="overdue">{t("in.statusOver")}</option>
      </select>
    </div>
  );
}