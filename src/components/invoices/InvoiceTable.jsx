// src/components/invoices/InvoiceTable.jsx - extracted from Invoices.js
import React from "react";
import Pagination from "../common/PaginationV2";
import OrderStatusBadge from "./OrderStatusBadge";
import { ORDER_TYPES, ORDER_STATUSES, getSourceLabel } from "../../utils/invoiceHelpers";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../i18n/LanguageContext";
import { getAvailableModules } from "../../utils/modules";
import { canDelete } from "../../utils/companyQuery";

export default function InvoiceTable({
  filteredInvoices,
  clients,
  products,
  loading,
  loadingMore,
  hasMore,
  loadMore,
  resetPagination,
  searchTerm,
  setSearchTerm,
  filterStatus,
  setFilterStatus,
  onOrderStatusChange,
  onEdit,
  onPay,
  onReturn,
  onDelete,
  onThermalPrint,
  onExportPDF,
  PAGE_SIZE = 25,
}) {
  const { t } = useLanguage();
  const { userRole, userIndustry } = useAuth();
  const isRestaurant = userIndustry === "restaurant";
  const isClinic = userIndustry === "clinic";
  const hasInventory = getAvailableModules(userIndustry, userRole).has("inventory");
  const userCanDelete = canDelete(userRole);
  const entityColumnLabel = isClinic ? t("in.patientColumn") || "المريض" : t("in.client") || "العميل";

  return (
    <>
      <div className="filter-bar">
        <div className="search-wrapper" style={{ flex: 1 }}>
          <i className="fas fa-search search-icon"></i>
          <input type="text" placeholder={isRestaurant ? "ابحث عن طلب..." : t("in.search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        {isRestaurant ? (
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">كل الحالات</option>
            {ORDER_STATUSES.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            <option value="paid">✅ مدفوع</option>
          </select>
        ) : (
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t("in.allStatus")}</option>
            <option value="paid">{t("in.statusPaid")}</option>
            <option value="pending">{t("in.statusWait")}</option>
            <option value="overdue">{t("in.statusOver")}</option>
          </select>
        )}
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3><i className="fas fa-list"></i> {isRestaurant ? "قائمة الطلبات" : t("in.list")}</h3>
          <span className="table-count">{filteredInvoices.length} {isRestaurant ? "طلب" : t("in.invoices")}</span>
        </div>
        <div className="table-wrapper">
          <Pagination
            data={filteredInvoices}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onRefresh={resetPagination}
            pageSize={PAGE_SIZE}
            empty={<div className="table-empty"><i className="fas fa-file-invoice"></i><p>{searchTerm || filterStatus !== "all" ? t("common.noResults") : isRestaurant ? "لا توجد طلبات بعد" : t("in.empty")}</p></div>}
            render={(pageItems) => (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{isRestaurant ? "الزبون" : entityColumnLabel}</th>
                    {isRestaurant && <th>المصدر</th>}
                    {isRestaurant && <th>نوع الطلب</th>}
                    {isRestaurant && <th>حالة الطلب</th>}
                    {hasInventory && <th>{isClinic ? t("in.medicineColumn") || "الدواء" : isRestaurant ? "الأصناف" : t("in.product") || "المنتج"}</th>}
                    {hasInventory && <th>{t("common.quantity")}</th>}
                    <th>{t("common.amount")}</th>
                    {isRestaurant && <th>الإجمالي مع التوصيل</th>}
                    {!isRestaurant && <th>{t("in.paid")}</th>}
                    {!isRestaurant && <th>{t("in.remaining")}</th>}
                    {!isRestaurant && <th>{t("common.status")}</th>}
                    <th>{t("common.date")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((inv, i) => {
                    const clientName = clients.find((c) => c.id === inv.clientId)?.name || t("common.unspecified");
                    const productDetails = inv.products?.map((p) => { const pr = products.find((item) => item.id === p.productId); return `${pr ? pr.name : t("common.unspecified")} (${p.quantity || 1})`; }) || [];
                    const productStr = productDetails.length > 0 ? productDetails.join(" ، ") : "-";
                    const paid = parseFloat(inv.paidAmount) || 0;
                    const remaining = (parseFloat(inv.amount) || 0) - paid;
                    const totalQty = inv.products ? inv.products.reduce((sum, p) => sum + parseFloat(p.quantity || 0), 0) : 0;
                    const totalWithFee = (parseFloat(inv.amount) || 0) + (parseFloat(inv.deliveryFee) || 0);
                    const orderTypeCfg = ORDER_TYPES.find((o) => o.value === inv.orderType);
                    return (
                      <tr key={inv.id}>
                        <td style={{ color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{clientName}{isRestaurant && inv.customerNote && <div style={{ fontSize: 11, color: "#94a3b8" }} title={inv.customerNote}>📝 {inv.customerNote.slice(0, 25)}{inv.customerNote.length > 25 ? "..." : ""}</div>}</td>
                        {isRestaurant && (
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", background: "#eef2ff", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>{getSourceLabel(inv.source || inv.orderSource)}</span>
                            {inv.deliveryPhone && inv.orderType !== "delivery" && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>📞 {inv.deliveryPhone}</div>}
                          </td>
                        )}
                        {isRestaurant && (
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              <span style={{ fontWeight: 600 }}>{orderTypeCfg?.label || inv.orderType || "—"}</span>
                              {inv.orderType === "delivery" && inv.deliveryAddress && <span style={{ fontSize: 11, color: "#64748b" }} title={inv.deliveryAddress}>📍 {inv.deliveryAddress.slice(0, 20)}{inv.deliveryAddress.length > 20 ? "..." : ""}</span>}
                              {inv.orderType === "delivery" && inv.deliveryPhone && <span style={{ fontSize: 11, color: "#64748b" }}>📞 {inv.deliveryPhone}</span>}
                              {inv.orderType === "dine_in" && inv.tableNumber && <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700 }}>🪑 طاولة {inv.tableNumber}</span>}
                              {inv.orderType === "dine_in" && inv.deliveryPhone && <span style={{ fontSize: 11, color: "#64748b" }}>📞 {inv.deliveryPhone}</span>}
                            </div>
                          </td>
                        )}
                        {isRestaurant && <td><OrderStatusBadge status={inv.orderStatus || "new"} orderId={inv.id} onStatusChange={onOrderStatusChange} isRestaurant={isRestaurant} /></td>}
                        {hasInventory && <td style={{ fontSize: 13 }}>{productStr}</td>}
                        {hasInventory && <td>{totalQty}</td>}
                        <td style={{ fontWeight: 700 }}>{(inv.amount || 0).toLocaleString()} {t("currency")}</td>
                        {isRestaurant && <td style={{ fontWeight: 700, color: "#059669" }}>{totalWithFee.toFixed(2)} {t("currency")}{inv.deliveryFee > 0 && <div style={{ fontSize: 10, color: "#94a3b8" }}>+{inv.deliveryFee} توصيل</div>}</td>}
                        {!isRestaurant && <>
                          <td style={{ color: "#10b981", fontWeight: 600 }}>{paid > 0 ? `${paid.toLocaleString()} ${t("currency")}` : "—"}</td>
                          <td style={{ fontWeight: 700, color: remaining > 0 ? "#ef4444" : "#10b981" }}>{remaining > 0 ? `${remaining.toLocaleString()} ${t("currency")}` : "✓"}</td>
                          <td><span className={`badge ${inv.status === "paid" ? "badge-paid" : inv.status === "pending" ? "badge-pending" : "badge-overdue"}`}>{inv.status === "paid" ? t("in.statusPaid") : inv.status === "pending" ? t("in.statusWait") : t("in.statusOver")}</span></td>
                        </>}
                        <td style={{ color: "#64748b", fontSize: 13 }}>{inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "-"}</td>
                        <td>
                          <div className="table-actions">
                            {isRestaurant && <button onClick={() => onThermalPrint(inv)} className="btn-primary btn-sm" title="طباعة فاتورة"><i className="fas fa-print"></i></button>}
                            {!isRestaurant && <button onClick={() => onExportPDF(inv)} className="btn-primary btn-sm" title={t("in.pdf")}><i className="fas fa-file-pdf"></i> PDF</button>}
                            {inv.status !== "paid" && !isRestaurant && <button onClick={() => onPay(inv)} className="btn-success btn-sm" title={t("in.pay")}><i className="fas fa-money-bill-wave"></i></button>}
                            <button onClick={() => onEdit(inv)} className="btn-secondary btn-sm" title={t("common.edit")}><i className="fas fa-edit"></i></button>
                            {!isRestaurant && <button onClick={() => onReturn(inv)} className="btn-secondary btn-sm" title="مرتجع" style={{ borderColor: "#f59e0b", color: "#d97706" }}><i className="fas fa-undo"></i></button>}
                            {userCanDelete && <button onClick={() => onDelete(inv.id)} className="btn-danger btn-sm" title={t("common.delete")}><i className="fas fa-trash"></i></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          />
        </div>
      </div>
    </>
  );
}
