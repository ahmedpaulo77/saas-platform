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
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter((inv) => {
      const clientName = clients.find((c) => c.id === inv.clientId)?.name || "";
      const productNames = inv.products?.map((p) => products.find((pr) => pr.id === p.productId)?.name || "") || [];
      return (
        clientName.toLowerCase().includes(term) ||
        productNames.some((name) => name.toLowerCase().includes(term)) ||
        String(inv.amount).includes(term) ||
        (inv.description || "").toLowerCase().includes(term) ||
        (inv.deliveryAddress || "").toLowerCase().includes(term)
      );
    });
  }, [invoices, searchTerm, clients, products]);

  const stats = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce((sum, inv) => {
      if (inv.status === "paid") return sum + (parseFloat(inv.amount) || 0);
      return sum + (parseFloat(inv.paidAmount) || 0);
    }, 0);
    const paidCount = filteredInvoices.filter((i) => i.status === "paid").length;
    const pendingCount = filteredInvoices.filter((i) => i.status === "pending").length;
    const newOrdersCount = isRestaurant ? filteredInvoices.filter((i) => i.orderStatus === "new").length : 0;
    const preparingCount = isRestaurant ? filteredInvoices.filter((i) => i.orderStatus === "preparing").length : 0;
    const totalOverdue = filteredInvoices.reduce((sum, inv) => {
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
