// src/hooks/useInvoices.js - extracted from src/pages/Invoices.js
import { useState, useEffect, useCallback, useMemo } from "react";
import { getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import { getAvailableModules } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import { useFirestorePagination } from "./useFirestorePagination";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterApproval, setFilterApproval] = useState("all");

  const filters = useMemo(() => {
    const f = [];
    if (filterStatus !== "all") f.push(["status", "==", filterStatus]);
    return f;
  }, [filterStatus]);

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

  useEffect(() => {
    fetchClients();
    fetchProducts();
  }, [fetchClients, fetchProducts]);

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
      const updateData = { orderStatus: newOrderStatus };
      if (newOrderStatus === "delivered") updateData.status = "paid";
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
    setClients,
    setProducts,
    fetchClients,
    fetchProducts,
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
