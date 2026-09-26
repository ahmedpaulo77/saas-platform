// src/hooks/useInvoices.js - extracted from src/pages/Invoices.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { getDocs, doc, updateDoc, collection, query, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import { getAvailableModules } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import { useFirestorePagination } from "./useFirestorePagination";
import { useLanguage } from "../i18n/LanguageContext";
import { round2 } from "../utils/revenue";

const PAGE_SIZE = 25;

// Backward compat: invoices without `approval` field behave as validated (POS + legacy).
export function isInvoiceValidated(inv) {
  if (!inv) return false;
  if (!inv.approval) return true;
  return inv.approval === "validated";
}

export function getInvoiceApproval(inv) {
  if (!inv?.approval) return "validated";
  return inv.approval;
}

export function useInvoices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser, userIndustry } = useAuth();
  const hasInventory = getAvailableModules(userIndustry, userRole).has("inventory");
  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const isClinic = userIndustry === "clinic";
  const isCafe = userIndustry === "cafe";
  const isRestaurantOnly = userIndustry === "restaurant";
  const isRestaurant = (isRestaurantOnly || isCafe);
  const isFood = isRestaurant;
  const isTrader = userIndustry === "trader";
  const entityCollection = isClinic ? "patients" : "clients";

  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [returnsByInvoice, setReturnsByInvoice] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterApproval, setFilterApproval] = useState("all");

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") {
      // ⚠️ في المطاعم/الكافيهات، الفلتر ده بيبعت قيم ORDER_STATUSES
      // (new/preparing/ready/delivered/cancelled) — دي حالة *المطبخ*،
      // وحقلها في المستند `orderStatus` مش `status`.
      // `status` هو حالة *الدفع* (paid/pending) — فاختيار "قيد التحضير"
      // كان بيبعت where('status','==','preparing') وبيطلع **صفر نتيجة دايمًا**.
      f.push([isRestaurant ? "orderStatus" : "status", "==", filterStatus]);
    }
    return f;
  }, [filterStatus, isRestaurant]);

  const {
    data: invoices,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset: resetPagination,
  } = useFirestorePagination("invoices", userRole, userCompanyId, currentUser?.uid, {
    pageSize: PAGE_SIZE,
    orderByField: "createdAt",
    orderDirection: "desc",
    filters,
    enabled: !!userCompanyId,
  });

  const fetchClients = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery(entityCollection, userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, name: d.data().name, phone: d.data().phone || "" })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, entityCollection]);

  const fetchProducts = useCallback(async () => {
    if (!userCompanyId || !hasInventory) return;
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid, hasInventory]);

  const fetchReturnsMap = useCallback(async () => {
    if (!userCompanyId) { setReturnsByInvoice({}); return; }
    try {
      const snap = await getDocs(getScopedQuery("returns", userRole, userCompanyId, currentUser?.uid));
      const map = {};
      snap.docs.forEach((d) => {
        const r = d.data();
        if (r.kind && r.kind !== "sale") return;
        if (!r.refId) return;
        map[r.refId] = (map[r.refId] || 0) + (parseFloat(r.amount) || 0);
      });
      setReturnsByInvoice(map);
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchClients();
    fetchProducts();
    fetchReturnsMap();
  }, [fetchClients, fetchProducts, fetchReturnsMap]);

  useEffect(() => {
    resetPagination();
  }, [filterStatus, resetPagination]);

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    // Approval filter (client-side so legacy docs without `approval` still match "validated")
    if (filterApproval !== "all") {
      list = list.filter((inv) => {
        const ap = inv.approval || "validated";
        return ap === filterApproval;
      });
    }
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, "");
    return list.filter((inv) => {
      const clientName = clients.find((c) => c.id === inv.clientId)?.name || "";
      const productNames = inv.products?.map((p) => products.find((pr) => pr.id === p.productId)?.name || "") || [];
      // مطابقة رقم الفاتورة (باركود السكانر) — الـ ID كامل
      const idMatch = String(inv.id || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(term) && term.length > 0;
      return (
        idMatch ||
        clientName.toLowerCase().includes(term) ||
        productNames.some((name) => name.toLowerCase().includes(term)) ||
        String(inv.amount).includes(term) ||
        (inv.description || "").toLowerCase().includes(term) ||
        (inv.deliveryAddress || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm, clients, products, filterApproval]);

  const stats = useMemo(() => {
    // Revenue counts only validated invoices (legacy docs without `approval` count as validated)
    const validated = filteredInvoices.filter((inv) => isInvoiceValidated(inv));
    const totalRevenue = validated.reduce((sum, inv) => {
      if (inv.status === "paid") return sum + (parseFloat(inv.amount) || 0);
      return sum + (parseFloat(inv.paidAmount) || 0);
    }, 0);
    const paidCount = validated.filter((i) => i.status === "paid").length;
    const pendingCount = validated.filter((i) => i.status === "pending").length;
    const newOrdersCount = isRestaurant ? validated.filter((i) => i.orderStatus === "new").length : 0;
    const preparingCount = isRestaurant ? validated.filter((i) => i.orderStatus === "preparing").length : 0;
    const totalOverdue = validated.reduce((sum, inv) => {
      if (inv.status === "overdue") return sum + ((parseFloat(inv.amount) || 0) - (parseFloat(inv.paidAmount) || 0));
      return sum;
    }, 0);
    return { totalRevenue, paidCount, pendingCount, newOrdersCount, preparingCount, totalOverdue, total: filteredInvoices.length };
  }, [filteredInvoices, isRestaurant]);

  async function handleOrderStatusChange(invoiceId, newOrderStatus) {
    try {
      const inv = invoices.find((x) => x.id === invoiceId);
      const updateData = { orderStatus: newOrderStatus };
      // (حتى من غير اعتماد) كان بيحوّل الحالة لـ delivered فيتبعت
      // status = "paid" — والكاش بيُحسب محصّل لطلب ما حدّش اعتمده.
      //
      // ⚠️ مهم: الـ Rules بتسمح لغير الأدمن بتغيير `orderStatus` بس
      // (hasOnly(['orderStatus'])) — فلو بعتنا status/paidAmount معاه
      // الـ write هيرجع permission-denied وStay من غير تغيير. عشان كده
      // الحقول الإضافية للأدمن بس، وغير الأدمن بيغير الحالة بس.
      if (newOrderStatus === "delivered" && isAdmin && inv && isInvoiceValidated(inv)) {
        updateData.status = "paid";
        const curPaid = parseFloat(inv.paidAmount) || 0;
        const curTotal = parseFloat(inv.total) > 0
          ? parseFloat(inv.total)
          : (parseFloat(inv.amount) || 0) + (parseFloat(inv.deliveryFee) || 0);
        if (curPaid <= 0 && curTotal > 0) updateData.paidAmount = round2(curTotal);
      }
      await updateDoc(doc(db, "invoices", invoiceId), updateData);
      await logActivity({
        actionType: "UPDATE",
        collectionName: "invoices",
        itemId: invoiceId,
        details: `Order status changed to ${newOrderStatus}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await resetPagination();
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
  }

  return {
    invoices,
    filteredInvoices,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    resetPagination,
    clients,
    products,
    returnsByInvoice,
    setClients,
    setProducts,
    fetchClients,
    fetchProducts,
    fetchReturnsMap,
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    filterApproval,
    setFilterApproval,
    stats,
    handleOrderStatusChange,
    isRestaurant,
    isTrader,
    isClinic,
    hasInventory,
    isAdmin,
    userRole,
    userCompanyId,
    currentUser,
    userIndustry,
    entityCollection,
    PAGE_SIZE,
  };
}

export default useInvoices;
