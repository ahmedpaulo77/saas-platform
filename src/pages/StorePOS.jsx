// src/pages/StorePOS.jsx - نقطة بيع محلات الملابس (منفصلة عن كاشير المطعم)
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, getDocs, doc, updateDoc, getDoc, runTransaction, writeBatch, query, where } from "firebase/firestore";
import { isOffline, handleOfflineError } from "../utils/offline.js";
import { readStockCache } from "../utils/stock.js";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { EGYPT_PAYMENTS, getPaymentLabel } from "../utils/paymentMethods.js";
import { moneyShort } from "../utils/fmt.js";
import { promoForProduct, applyPromo, isPromoActive } from "./Promotions.jsx";

const NAVY = "#1e3a8a";

export default function StorePOS() {
  const { t, lang, locale } = useLanguage();
  const navigate = useNavigate();

  const TYPE_LABELS = { men: t("inv.typeMen"), women: t("inv.typeWomen"), boys: t("inv.typeBoys"), girls: t("inv.typeGirls"), unisex: t("inv.typeUnisex") };
  const timeLocale = locale;
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [variantCodes, setVariantCodes] = useState([]);
  const [promotions, setPromotions] = useState([]); // العروض النشطة
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterSize, setFilterSize] = useState("all");
  const [filterColor, setFilterColor] = useState("all");
  const [selectedClient, setSelectedClient] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState("amount"); // "percent" | "amount"
  // ── الدفع المقسم ──
  const [splitPayment, setSplitPayment] = useState(false);
  // طريقة الدفع بدون قيمة افتراضية — الكاشير لازم يختارها بإيده (إلزامية دايماً)
  const [paymentMethod, setPaymentMethod] = useState("");
  const [splitMethod1, setSplitMethod1] = useState("cash");
  const [splitAmount1, setSplitAmount1] = useState("");
  const [splitMethod2, setSplitMethod2] = useState("instapay");
  const [splitAmount2, setSplitAmount2] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState("");
  // نص سياسة الاستبدال الخاص بالمحل (undefined = الافتراضي القديم، "" = إخفاء)
  const [receiptPolicy, setReceiptPolicy] = useState(undefined);
  // الحقول الإلزامية في نقطة البيع — من إعدادات الشركة (صفحة شركتي)
  // الكاشير افتراضي إلزامي (توافق مع السلوك القديم)، والسيلز افتراضي اختياري
  // اسم العميل ورقمه والمبلغ وطريقة الدفع إلزامية دايماً
  const [posReq, setPosReq] = useState({ cashier: true, salesRep: false });
  const cashierRequired = posReq.cashier !== false;
  const salesRepRequired = posReq.salesRep === true;
  // اسم الكاشير الواقف — متسجل زي الشيفت وبيطلع في الفاتورة
  const [cashierName, setCashierName] = useState(() => {
    try {
      return localStorage.getItem("pos_cashier_name") || "";
    } catch {
      return "";
    }
  });

  function handleCashierNameChange(v) {
    setCashierName(v);
    try {
      localStorage.setItem("pos_cashier_name", v);
    } catch {}
  }

  // مندوب المبيعات (السيلز) — اختياري، يُحفظ على الفاتورة لحساب العمولة
  const [salesReps, setSalesReps] = useState([]);
  const [salesRepId, setSalesRepId] = useState("");

  const fetchSalesReps = useCallback(async () => {
    if (!userCompanyId) { setSalesReps([]); return; }
    try {
      const snap = await getDocs(getScopedQuery("sales_reps", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
      setSalesReps(data);
    } catch (e) {
      console.error("sales reps fetch:", e?.message);
      setSalesReps([]);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  // ── الوردية والتقفيل اليدوي (نفس نمط POS.js — بثيم NAVY) ──
  const [shift, setShift] = useState(null);
  const [closings, setClosings] = useState([]);
  const [openingCash, setOpeningCash] = useState("");
  const [opening, setOpening] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ countedCash: "", receiver: "", notes: "" });
  const [closePreview, setClosePreview] = useState(null);
  const [closing, setClosing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── بحث فاتورة بالباركود (تسليم لصفحة الفواتير للمرتجع) ──
  const [searchingInvoice, setSearchingInvoice] = useState(false);

  useEffect(() => {
    if (!userCompanyId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        if (snap.exists()) {
          setStoreName((snap.data().name || "").toString());
          if (snap.data().logoUrl) setStoreLogo(String(snap.data().logoUrl));
          setReceiptPolicy(snap.data().receiptPolicy !== undefined ? String(snap.data().receiptPolicy || "") : undefined);
          const pr = snap.data().posRequirements || {};
          setPosReq({
            cashier: pr.cashier !== false,
            salesRep: pr.salesRep === true,
          });
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [userCompanyId]);

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid));
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchClients = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchVariantCodes = useCallback(async () => {
    try {
      const snap = await getDocs(getScopedQuery("variant_codes", userRole, userCompanyId, currentUser?.uid));
      setVariantCodes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  // جلب العروض النشطة — بتتجدد مع كل تحميل
  const fetchPromotions = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        query(collection(db, "promotions"), where("companyId", "==", userCompanyId))
      );
      const now = new Date();
      const active = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => isPromoActive(p, now));
      setPromotions(active);
    } catch (e) { console.error(e); }
  }, [userCompanyId]);

  const fetchShift = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(getScopedQuery("closings", userRole, userCompanyId, currentUser?.uid));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setClosings(data.slice(0, 10));
      setShift(data.find((c) => c.status === "open") || null);
    } catch (e) { console.error(e); }
  }, [userRole, userCompanyId, currentUser?.uid]);

  async function openShift(e) {
    e?.preventDefault();
    if (!userCompanyId) return;
    setOpening(true);
    try {
      const maxNo = closings.reduce((m, c) => Math.max(m, parseInt(c.number) || 0), 0);
      await addDoc(collection(db, "closings"), {
        number: maxNo + 1,
        status: "open",
        openedAt: new Date().toISOString(),
        openedBy: currentUser?.uid || null,
        openedByEmail: currentUser?.email || "",
        openedByName: cashierName || "",
        openingCash: parseFloat(openingCash) || 0,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      setOpeningCash("");
      await fetchShift();
    } catch (err) {
      console.error(err);
      alert(t("shift.openFail"));
    }
    setOpening(false);
  }

  // حساب مبيعات الوردية المفتوحة (من فتحها لحد دلوقتي) — المرتجعات تنقص الكاش
  // داخل/خارج يُسحب تلقائياً من صفحة المصروفات والإدخالات (اتجاه in/out — القديم بدون اتجاه = خارج)
  async function previewClosing() {
    if (!shift) return;
    try {
      const [snap, retSnap, expSnap] = await Promise.all([
        getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("returns", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("expenses", userRole, userCompanyId, currentUser?.uid)).catch((e) => {
          console.warn("expenses fetch for closing:", e?.message);
          return { docs: [] };
        }),
      ]);
      const from = new Date(shift.openedAt || shift.createdAt).getTime();
      const now = Date.now();
      const byMethod = {};
      let count = 0, total = 0, paid = 0, cashSales = 0;
      const windowInvoices = new Map();
      snap.docs.forEach((d) => {
        const inv = d.data();
        const ap = inv.approval || "validated";
        if (ap !== "validated") return;
        const ts = new Date(inv.date || inv.createdAt || 0).getTime();
        if (ts >= from && ts <= now) {
          count++;
          total += parseFloat(inv.amount) || 0;
          const p = parseFloat(inv.paidAmount) || 0;
          paid += p;
          if (inv.splitPayment && Array.isArray(inv.splitPayments)) {
            // فك الدفع المقسم لطرقه الحقيقية — كان بيتسجل كله تحت "split"
            // وجزء الكاش بيضيع من المتوقع
            let hasCashPart = false;
            inv.splitPayments.forEach((sp) => {
              const m = sp.method || "cash";
              const a = parseFloat(sp.amount) || 0;
              byMethod[m] = (byMethod[m] || 0) + a;
              if (m === "cash") { cashSales += a; hasCashPart = true; }
            });
            windowInvoices.set(d.id, { ts, paymentMethod: hasCashPart ? "cash" : (inv.splitPayments[0]?.method || "cash") });
          } else {
            // ⚠️ ما ن fallbackش على `source` — ده مصدر الطلب مش طريقة دفع
            const m = inv.paymentMethod || "cash";
            byMethod[m] = (byMethod[m] || 0) + p;
            if (m === "cash") cashSales += p;
            windowInvoices.set(d.id, { ts, paymentMethod: m });
          }
        }
      });
      let returnsCount = 0, returnsTotal = 0, cashReturnsTotal = 0;
      const missingParents = [];
      retSnap.docs.forEach((d) => {
        const r = d.data();
        if (r.kind && r.kind !== "sale") return;
        const ts = new Date(r.date || r.createdAt || 0).getTime();
        if (!(ts >= from && ts <= now)) return;
        const amt = parseFloat(r.amount) || 0;
        returnsCount++;
        returnsTotal += amt;
        // الكاش بس، ومن نفس النافذة (نفس منطق POS.js)
        const parent = r.refId ? windowInvoices.get(r.refId) : null;
        if (parent && parent.paymentMethod === "cash" && parent.ts >= from) {
          cashReturnsTotal += amt;
        } else if (r.refId && !parent) {
          // الأصل خارج النافذة (وردية قديمة) — يُفحص تحت
          missingParents.push({ refId: r.refId, amt });
        }
      });
      // استبدال/مرتجع النهاردة لفاتورة من وردية قديمة: الخروج النقدي حصل
      // في الوردية دي فعلاً، فلازم يتخصم — نجيب طريقة دفع الأصل مباشرة
      for (const mp of missingParents) {
        try {
          const psnap = await getDoc(doc(db, "invoices", mp.refId));
          if (!psnap.exists()) continue;
          const pdata = psnap.data() || {};
          if (pdata.companyId !== userCompanyId) continue;
          let isCash = (pdata.paymentMethod || "cash") === "cash";
          if (!isCash && pdata.splitPayment && Array.isArray(pdata.splitPayments)) {
            isCash = pdata.splitPayments.some((sp) => (sp.method || "cash") === "cash");
          }
          if (isCash) cashReturnsTotal += mp.amt;
        } catch (e) { console.warn("parent invoice fetch:", e?.message); }
      }
      let cashIn = 0, cashOut = 0, expInCount = 0, expOutCount = 0;
      try {
        expSnap.docs.forEach((d) => {
          const e = d.data();
          const ts = new Date(e.createdAt || e.date || 0).getTime();
          if (!(ts >= from && ts <= now)) return;
          const amt = parseFloat(e.amount) || 0;
          if ((e.direction || "out") === "in") { cashIn += amt; expInCount++; }
          else { cashOut += amt; expOutCount++; }
        });
      } catch (e) { console.warn("expenses sum:", e?.message); }
      setClosePreview({ count, total, paid, cashSales, byMethod, returnsCount, returnsTotal, cashReturnsTotal, cashIn, cashOut, expInCount, expOutCount });
      setShowCloseModal(true);
    } catch (err) {
      console.error(err);
      alert(t("shift.calcFail"));
    }
  }

  function closingExpected(preview, openingCashVal) {
    const cashSales = preview?.cashSales ?? preview?.paid ?? 0;
    // ⚠️ cashReturnsTotal (كاش + نفس النافذة) مش returnsTotal
    return round2(
      (parseFloat(openingCashVal) || 0) +
      cashSales +
      (parseFloat(preview?.cashIn) || 0) -
      (parseFloat(preview?.cashOut) || 0) -
      (parseFloat(preview?.cashReturnsTotal) || 0)
    );
  }

  async function submitClosing(e) {
    e.preventDefault();
    if (!shift || !closePreview) return;
    setClosing(true);
    try {
      const counted = parseFloat(closeForm.countedCash) || 0;
      const cashIn = parseFloat(closePreview.cashIn) || 0;
      const cashOut = parseFloat(closePreview.cashOut) || 0;
      const expected = closingExpected(closePreview, shift.openingCash);
      await updateDoc(doc(db, "closings", shift.id), {
        status: "closed",
        closedAt: new Date().toISOString(),
        closedBy: currentUser?.uid || null,
        closedByEmail: currentUser?.email || "",
        closedByName: cashierName || "",
        salesCount: closePreview.count,
        salesTotal: closePreview.total,
        paidTotal: closePreview.paid,
        cashSales: closePreview.cashSales ?? closePreview.paid,
        byMethod: closePreview.byMethod,
        returnsCount: closePreview.returnsCount || 0,
        returnsTotal: closePreview.returnsTotal || 0,
        // المرتجع النقدي بس — اللي اتخصم فعليًا من المتوقع
        cashReturnsTotal: closePreview.cashReturnsTotal || 0,
        countedCash: counted,
        expectedCash: expected,
        difference: round2(counted - expected),
        cashIn,
        cashOut,
        expInCount: closePreview.expInCount || 0,
        expOutCount: closePreview.expOutCount || 0,
        receiver: closeForm.receiver || "",
        notes: closeForm.notes || "",
      });
      setShowCloseModal(false);
      setCloseForm({ countedCash: "", receiver: "", notes: "" });
      setClosePreview(null);
      await fetchShift();
      alert(t("shift.closedOk"));
    } catch (err) {
      console.error(err);
      alert(t("shift.closeFail"));
    }
    setClosing(false);
  }

  useEffect(() => {
    Promise.all([fetchProducts(), fetchClients(), fetchVariantCodes(), fetchShift(), fetchSalesReps(), fetchPromotions()]);
  }, [fetchProducts, fetchClients, fetchVariantCodes, fetchShift, fetchSalesReps, fetchPromotions]);

  // ── خيارات الفلاتر: من variant_codes لو موجودة وإلا من المنتجات ──
  const codeSizes = variantCodes.filter((c) => c.kind === "size").map((c) => c.name || c.code);
  const codeColors = variantCodes.filter((c) => c.kind === "color").map((c) => c.name || c.code);
  const sizeOptions = (codeSizes.length > 0
    ? [...new Set(codeSizes)]
    : [...new Set(products.map((p) => (p.size || "").trim()).filter(Boolean))]
  ).sort();
  const colorOptions = (codeColors.length > 0
    ? [...new Set(codeColors)]
    : [...new Set(products.map((p) => (p.color || "").trim()).filter(Boolean))]
  ).sort();
  const typeOptions = [...new Set(products.map((p) => (p.type || "").trim()).filter(Boolean))];

  // السكانر بيكتب كأنه كيبورد — ولو لغة الجهاز عربي الأرقام بتطلع عربية (٠١٢٣)
  // فبنوحّد الأرقام قبل المقارنة عشان المسح يلقط دايماً
  function normalizeScan(v) {
    return String(v ?? "")
      .toLowerCase()
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .trim();
  }

  const filteredProducts = products.filter((p) => {
    const term = normalizeScan(searchTerm);
    const matchSearch =
      !term ||
      normalizeScan(p.name).includes(term) ||
      normalizeScan(p.barcode).includes(term) ||
      normalizeScan(p.code).includes(term) ||
      normalizeScan(p.model).includes(term);
    const matchType = filterType === "all" || (p.type || "") === filterType;
    const matchSize = filterSize === "all" || (p.size || "") === filterSize;
    const matchColor = filterColor === "all" || (p.color || "") === filterColor;
    return matchSearch && matchType && matchSize && matchColor;
  });

  // ── البحث عن فاتورة بـ ID (باركود الفاتورة الحرارية) ──
  // بترجع id الفاتورة لو لقاها، وnull لو مفيش (من غير رسائل — اللي بيناديها بيكمل)
  async function lookupInvoice(invoiceId) {
    if (!invoiceId || !userCompanyId) return null;
    setSearchingInvoice(true);
    try {
      const snap = await getDoc(doc(db, "invoices", invoiceId));
      if (snap.exists() && snap.data().companyId === userCompanyId) {
        return snap.id;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSearchingInvoice(false);
    }
    return null;
  }

  // باركود غير مسجل في أي حتة → بنعرض لوحة تسجيله على صنف بدل ما المسح يموت في صمت
  const [unknownBarcode, setUnknownBarcode] = useState(null);
  const [assignSearch, setAssignSearch] = useState("");

  // فاتورة الاستبدال الأخيرة (تسليم من صفحة الفواتير) — جاهزة للعرض والطباعة
  const [lastExchange, setLastExchange] = useState(null);
  useEffect(() => {
    let raw = null;
    try { raw = sessionStorage.getItem("aamalypro-last-exchange"); } catch { /* ignore */ }
    if (!raw) return;
    (async () => {
      try {
        const handoff = JSON.parse(raw);
        if (!handoff?.id) return;
        const snap = await getDoc(doc(db, "invoices", handoff.id));
        if (!snap.exists() || snap.data().companyId !== userCompanyId) return;
        setLastExchange({ ...handoff, invoice: { id: snap.id, ...snap.data() } });
      } catch (e) { console.warn("exchange handoff:", e?.message); }
    })();
  }, [userCompanyId]);

  function dismissLastExchange() {
    try { sessionStorage.removeItem("aamalypro-last-exchange"); } catch { /* ignore */ }
    setLastExchange(null);
  }

  // طباعة ريسيت فاتورة الاستبدال — نفس روح إيصال البيع (80mm + باركود الفاتورة)
  function printExchangeReceipt() {
    if (!lastExchange?.invoice) return;
    const inv = lastExchange.invoice;
    const escHtml = (s) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const clientObj = (clients || []).find((c) => c.id === inv.clientId);
    const rows = (inv.products || [])
      .map((item) => {
        const variant = [item.size, item.color].filter(Boolean).join(" / ");
        const line = (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
        return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${escHtml(item.productName || item.name || "صنف")}${variant ? `<div style="font-size:10px;color:#555;">${escHtml(variant)}</div>` : ""}</td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${item.quantity}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${escHtml(String(item.price ?? ""))}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${line.toFixed(2)}</td>
      </tr>`;
      })
      .join("");
    const invCode = String(inv.id || "").replace(/[^A-Za-z0-9]/g, "") || "0";
    const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Tahoma, sans-serif; font-size: 14px; font-weight: 700; width: 80mm; padding: 8px; }
  .store-name { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
  .inv-title  { text-align: center; font-size: 16px; font-weight: 900; margin-bottom: 2px; }
  .center { text-align: center; }
  .divider { border-top: 2px dashed #000; margin: 6px 0; }
  .divider-thin { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-weight: 700; }
  th { padding: 5px 6px; font-size: 12px; font-weight: 900; border-bottom: 2px solid #000; }
  td { padding: 4px 6px; border-bottom: 1px dashed #aaa; font-weight: 700; }
  .total-row  { font-weight: 900; font-size: 17px; border-top: 3px solid #000; padding-top: 5px; margin-top: 4px; }
  .lbl        { font-weight: 900; }
  svg.bc { width: 62mm; height: 13mm; display: block; margin: 4px auto 0; }
  @media print { body { width: 80mm; } @page { size: 80mm auto; margin: 0; } }
</style>
</head>
<body>

<div class="store-name">${escHtml(storeName || "المحل")}</div>
<div class="divider"></div>

<div class="inv-title">🔄 فاتورة استبدال</div>
<div class="center" style="font-size:12px;font-weight:700;">${escHtml(new Date(inv.date || inv.createdAt || Date.now()).toLocaleString("ar-EG"))}</div>
<div class="divider-thin"></div>

<div style="font-size:13px;font-weight:700;line-height:2;">
  <span class="lbl">العميل:</span> ${escHtml(clientObj?.name || "زبون نقدي")}<br/>
  <span class="lbl">الدفع:</span> ${escHtml(getPaymentLabel(inv.paymentMethod))}<br/>
  <span class="lbl">بدل الفاتورة:</span> ${escHtml(inv.exchangeOf || "—")}
</div>
<div class="divider"></div>

<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th style="text-align:center;">الكمية</th>
    <th style="text-align:center;">السعر</th>
    <th style="text-align:center;">الإجمالي</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>

<div style="font-size:14px;font-weight:700;line-height:1.9;text-align:right;padding-left:4px;">
  <div><span class="lbl">البديل:</span> <span dir="ltr">${(parseFloat(lastExchange.newTotal) || 0).toFixed(2)} ج.م</span></div>
  <div><span class="lbl">المرتجع:</span> <span dir="ltr">${(parseFloat(lastExchange.refundTotal) || 0).toFixed(2)} ج.م</span></div>
  <div class="total-row">
    <span class="lbl">الفرق:</span> <span dir="ltr">${(() => { const d = (parseFloat(lastExchange.newTotal) || 0) - (parseFloat(lastExchange.refundTotal) || 0); return (d > 0 ? "+" : "") + d.toFixed(2); })()} ج.م</span>
  </div>
</div>
<div class="divider"></div>

<svg class="bc" id="exbc"></svg>
<div class="divider"></div>

<div class="center" style="font-size:13px;font-weight:900;margin-bottom:2px;">شكراً لتسوقكم معنا ❤</div>
<div class="store-name" style="font-size:18px;">${escHtml(storeName || "")}</div>

<script>
  try {
    if (window.JsBarcode) JsBarcode("#exbc", "${invCode}", { format: "CODE128", displayValue: true, fontSize: 11, height: 40, width: 1.5, margin: 0 });
    else document.getElementById("exbc").outerHTML = "<div class='center'>${invCode}</div>";
  } catch (e) { document.getElementById("exbc").outerHTML = "<div class='center'>${invCode}</div>"; }
  setTimeout(function () { window.print(); }, 400);
<\/script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
    win.document.write(printContent);
    win.document.close();
    win.focus();
    // بعد الطباعة (أو إلغائها) نافذة الطباعة تتقفل وكارت الاستبدال يتقفل معاها تلقائيًا
    try {
      win.onafterprint = function () { try { win.close(); } catch (e) { /* ignore */ } };
    } catch (e) { /* ignore */ }
    const watcher = setInterval(() => {
      try {
        if (win.closed) {
          clearInterval(watcher);
          dismissLastExchange();
        }
      } catch (e) { clearInterval(watcher); }
    }, 600);
  }

  // حفظ باركود ممسوح على صنف موجود + إضافته للسلة فوراً
  async function assignBarcodeToProduct(product) {
    if (!product || !unknownBarcode) return;
    try {
      await updateDoc(doc(db, "inventory", product.id), { barcode: unknownBarcode });
      const updated = { ...product, barcode: unknownBarcode };
      setProducts((prev) => prev.map((p) => (p.id === product.id ? updated : p)));
      setUnknownBarcode(null);
      setAssignSearch("");
      setSearchTerm("");
      addToCart(updated);
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
  }

  const assignCandidates = (products || [])
    .filter((p) => {
      const q = assignSearch.trim().toLowerCase();
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q) ||
        (p.model || "").toLowerCase().includes(q) ||
        (p.size || "").toLowerCase().includes(q) ||
        (p.color || "").toLowerCase().includes(q);
    })
    .slice(0, 6);

  // السكانر: أي باركود لازم يعمل حاجة —
  // منتج → سلة | فاتورة → تفاصيلها | كود صنف → تضييق القايمة للاختيار | مجهول → لوحة تسجيل
  async function handleSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    const term = normalizeScan(searchTerm);
    if (!term) return;
    e.preventDefault();
    const raw = searchTerm.trim();
    // 1) باركود منتج مطابق تماماً → السلة فوراً
    const exact = products.find((p) => normalizeScan(p.barcode) === term);
    if (exact) {
      addToCart(exact);
      setSearchTerm("");
      setUnknownBarcode(null);
      return;
    }
    // 2) ID فاتورة (باركود الريسيت المطبوع) → تسليم لصفحة الفواتير تفتح المرتجع مباشرة
    const foundInvoiceId = await lookupInvoice(raw);
    if (foundInvoiceId) {
      setSearchTerm("");
      setUnknownBarcode(null);
      try { sessionStorage.setItem("aamalypro-return-invoice", foundInvoiceId); } catch { /* ignore */ }
      navigate("/invoices");
      return;
    }
    // 3) كود صنف → لو صنف واحد ضيفه، لو كذا صنف ضيّق القايمة عشان يختار المقاس/اللون
    const codeHits = products.filter((p) => normalizeScan(p.code) && normalizeScan(p.code) === term);
    if (codeHits.length === 1) {
      addToCart(codeHits[0]);
      setSearchTerm("");
      setUnknownBarcode(null);
      return;
    }
    if (codeHits.length > 1) {
      setUnknownBarcode(null);
      setSearchTerm(raw);
      alert(`الكود ده على ${codeHits.length} أصناف — اختار المقاس واللون من القايمة`);
      return;
    }
    // 4) مجهول تماماً → لوحة تسجيل الباركود على صنف (بدل الصمت)
    setSearchTerm("");
    setAssignSearch("");
    setUnknownBarcode(raw);
  }

  // ── السلة ──
  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.quantity) {
          alert(t("pos.qtyOver"));
          return prev;
        }
        return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      if ((product.quantity || 0) < 1) {
        alert(t("pos.notAvail"));
        return prev;
      }
      return [...prev, { ...product, quantity: 1, stockQty: product.quantity }];
    });
  }

  function removeFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  }

  function updateCartQuantity(productId, newQty) {
    if (newQty < 0) return;
    if (newQty === 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== productId) return item;
        if (newQty > (item.stockQty ?? item.quantity)) {
          alert(t("pos.qtyOver"));
          return item;
        }
        return { ...item, quantity: newQty };
      })
    );
  }

  // حفظ العميل الجديد (أو إعادة استخدام موجود بنفس الرقم) — يرجع id العميل أو null
  // تُستخدم في زرار الحفظ السريع، وكمان تلقائياً عند إتمام البيع لو الاسم مكتوب ومش محفوظ
  async function ensureClient() {
    const name = newClientName.trim();
    if (!name || !userCompanyId) return null;
    const phoneToSave = (newClientPhone || "").trim();
    if (phoneToSave) {
      const existing = clients.find((c) => (c.phone || "").trim() === phoneToSave);
      if (existing) {
        setSelectedClient(existing.id);
        setNewClientName("");
        setNewClientPhone("");
        return existing.id;
      }
    }
    const docRef = await addDoc(collection(db, "clients"), {
      name,
      phone: phoneToSave,
      companyId: userCompanyId,
      createdBy: currentUser?.uid || null,
      createdAt: new Date().toISOString(),
    });
    const newClient = { id: docRef.id, name, phone: phoneToSave };
    setClients((prev) => [...prev, newClient]);
    setSelectedClient(docRef.id);
    setNewClientName("");
    setNewClientPhone("");
    return docRef.id;
  }

  async function handleQuickAddClient() {
    if (!newClientName.trim()) {
      alert("اكتب اسم العميل الأول");
      return;
    }
    if (!userCompanyId) return;
    setAddingClient(true);
    try {
      await ensureClient();
    } catch (e) {
      console.error(e);
      alert("تعذر حفظ العميل");
    }
    setAddingClient(false);
  }

  const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

  // ── تطبيق العروض على السلة ──
  // كل صنف له عرض محتمل بناءً على category الصنف.
  // لـ BOGO: نحسب index كل قطعة داخل مجموعة نفس الصنف+العرض.
  const cartWithPromo = React.useMemo(() => {
    // نبني map: categoryId → index مستمر (لتتبع BOGO عبر أصناف نفس القسم)
    const catCount = {};
    return cart.map((item) => {
      const promo = promoForProduct(item, promotions);
      if (!promo) return { ...item, promo: null, effectivePrice: parseFloat(item.price) || 0, savedPerUnit: 0, isFree: false };
      const key = promo.id + "_" + (item.category || item.id);
      const idx = catCount[key] ?? 0;
      // للـ BOGO: كل قطعة تُحسب كـ index منفرد (item.quantity قطعة)
      // نوزع القطع: idx, idx+1, ..., idx+qty-1
      const results = [];
      for (let q = 0; q < item.quantity; q++) {
        results.push(applyPromo(promo, item, idx + q));
      }
      catCount[key] = idx + item.quantity;
      const totalEffective = round2(results.reduce((s, r) => s + r.effectivePrice, 0));
      const totalSaved     = round2(results.reduce((s, r) => s + r.savedPerUnit, 0));
      const hasFree = results.some((r) => r.isFree);
      const avgEffective = item.quantity > 0 ? round2(totalEffective / item.quantity) : 0;
      return { ...item, promo, effectivePrice: avgEffective, savedPerUnit: round2(totalSaved / item.quantity), isFree: hasFree, freeCount: results.filter((r) => r.isFree).length };
    });
  }, [cart, promotions]);

  const subtotal = round2(cartWithPromo.reduce((sum, item) => sum + item.effectivePrice * item.quantity, 0));
  const subtotalBeforePromo = round2(cart.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * item.quantity, 0));
  const promoSavings = round2(subtotalBeforePromo - subtotal);
  // الخصم: نسبة أو مبلغ ثابت
  const discountRaw = Math.max(0, parseFloat(discount) || 0);
  const discountNum = discountType === "percent"
    ? round2(subtotal * discountRaw / 100)
    : round2(discountRaw);
  const total = round2(Math.max(0, subtotal - discountNum));
  const discountExceedsSubtotal = discountNum > subtotal;
  // سقف الخصم لغير الأدمن: 20% كحد أقصى، والفاتورة المجانية (صفر) للأدمن فقط
  const MAX_CASHIER_DISCOUNT_PCT = 20;
  const isStoreAdmin = userRole === "admin" || userRole === "super_admin";
  const discountPctOfSubtotal = subtotal > 0 ? (discountNum / subtotal) * 100 : 0;
  const cashierDiscountBlocked = !isStoreAdmin && subtotal > 0 &&
    (total <= 0 || discountPctOfSubtotal > MAX_CASHIER_DISCOUNT_PCT);
  // الدفع المقسم
  const split1 = round2(parseFloat(splitAmount1) || 0);
  const split2 = round2(parseFloat(splitAmount2) || 0);
  const splitTotal = round2(split1 + split2);
  const splitRemaining = round2(total - split1);

  // ── طباعة فاتورة حرارية 80mm ──
  function handleThermalPrint(inv, cartSnapshot, clientName, clientPhone, cashierName, splitInfo, salesRep = "") {
    const escHtml = (s) =>
      String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = cartSnapshot
      .map((item) => {
        const variant = [item.size, item.color].filter(Boolean).join(" / ");
        const effectiveP = item.effectivePrice ?? (parseFloat(item.price) || 0);
        const line = round2(effectiveP * item.quantity);
        const hasPromo = item.promo && item.savedPerUnit > 0;
        const promoTag = hasPromo
          ? (item.promo.type === "percent"
              ? `<div style="font-size:10px;color:#059669;font-weight:800;">🏷️ خصم ${item.promo.value}% (وفّرت ${(item.savedPerUnit * item.quantity).toFixed(2)} ج.م)</div>`
              : item.freeCount > 0
                ? `<div style="font-size:10px;color:#7c3aed;font-weight:800;">🎁 ${item.freeCount} قطعة مجانية</div>`
                : "")
          : "";
        return `<tr>
        <td style="padding:3px 6px;border-bottom:1px dashed #ccc;">${escHtml(item.name)}${variant ? `<div style="font-size:10px;color:#555;">${escHtml(variant)}</div>` : ""}${promoTag}</td>
        <td style="padding:3px 6px;text-align:center;border-bottom:1px dashed #ccc;">${item.quantity}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;">${hasPromo ? `<span style="text-decoration:line-through;color:#999;font-size:11px;">${escHtml(String(item.price))}</span><br/>${effectiveP.toFixed(2)}` : escHtml(String(item.price))}</td>
        <td style="padding:3px 6px;text-align:left;border-bottom:1px dashed #ccc;font-weight:bold;">${line.toFixed(2)}</td>
      </tr>`;
      })
      .join("");
    const invCode = String(inv.id || "").replace(/[^A-Za-z0-9]/g, "") || "0";

    // سطر الدفع: عادي أو مقسم
    let paymentLines = "";
    if (splitInfo && splitInfo.isSplit) {
      paymentLines = `<span class="lbl">الدفع:</span> مقسم<br/>
  &nbsp;&nbsp;• ${escHtml(splitInfo.label1)}: ${parseFloat(splitInfo.amount1 || 0).toFixed(2)} ج.م<br/>
  &nbsp;&nbsp;• ${escHtml(splitInfo.label2)}: ${parseFloat(splitInfo.amount2 || 0).toFixed(2)} ج.م`;
    } else {
      paymentLines = `<span class="lbl">الدفع:</span> ${escHtml(getPaymentLabel(inv.paymentMethod))}`;
    }

    const printContent = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Tahoma, sans-serif; font-size: 14px; font-weight: 700; width: 80mm; padding: 8px; }
  .store-name { text-align: center; font-size: 22px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
  .inv-title  { text-align: center; font-size: 16px; font-weight: 900; margin-bottom: 2px; }
  .center { text-align: center; }
  .divider { border-top: 2px dashed #000; margin: 6px 0; }
  .divider-thin { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-weight: 700; }
  th { padding: 5px 6px; font-size: 12px; font-weight: 900; border-bottom: 2px solid #000; }
  td { padding: 4px 6px; border-bottom: 1px dashed #aaa; font-weight: 700; }
  .variant-line { font-size: 11px; font-weight: 700; color: #333; }
  .total-row  { font-weight: 900; font-size: 17px; border-top: 3px solid #000; padding-top: 5px; margin-top: 4px; }
  .lbl        { font-weight: 900; }
  .mono { font-family: 'Courier New', monospace; }
  svg.bc { width: 62mm; height: 13mm; display: block; margin: 4px auto 0; }
  .policy { font-size: 11px; font-weight: 700; text-align: center; line-height: 1.7; margin-top: 2px; }
  .policy-title { font-size: 12px; font-weight: 900; text-align: center; margin-bottom: 2px; }
  @media print { body { width: 80mm; } @page { size: 80mm auto; margin: 0; } }
</style>
</head>
<body>

${storeLogo ? `<div class="center"><img src="${storeLogo}" alt="logo" style="max-width:60mm;max-height:22mm;object-fit:contain;" /></div>` : ""}
<div class="store-name">${escHtml(storeName || "المحل")}</div>
<div class="divider"></div>

<div class="inv-title">🧾 فاتورة بيع</div>
<div class="center" style="font-size:12px;font-weight:700;">${new Date().toLocaleString("ar-EG")}</div>
<div class="divider-thin"></div>

<div style="font-size:13px;font-weight:700;line-height:2;">
  <span class="lbl">الكاشير:</span> ${escHtml(cashierName || "—")}<br/>
  ${salesRep ? `<span class="lbl">السيلز:</span> ${escHtml(salesRep)}<br/>` : ""}
  <span class="lbl">العميل:</span> ${escHtml(clientName || "زبون نقدي")}${clientPhone ? `<br/><span class="lbl">الرقم:</span> ${escHtml(clientPhone)}` : ""}<br/>
  ${paymentLines}
</div>
<div class="divider"></div>

<table>
  <thead><tr>
    <th style="text-align:right;">الصنف</th>
    <th style="text-align:center;">الكمية</th>
    <th style="text-align:center;">السعر</th>
    <th style="text-align:center;">الإجمالي</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="divider"></div>

<div style="font-size:14px;font-weight:700;line-height:1.9;text-align:right;padding-left:4px;">
  <div><span class="lbl">المجموع:</span> ${subtotal.toFixed(2)} ج.م</div>
  ${discountNum > 0 ? `<div><span class="lbl">الخصم${inv.discountType === "percent" && inv.discountRaw ? ` (${inv.discountRaw}%)` : ""}:</span> ${discountNum.toFixed(2)} ج.م</div>` : ""}
  ${inv.promoSavings > 0 ? `<div style="color:#15803d;"><span class="lbl">🏷️ توفير العروض:</span> ${parseFloat(inv.promoSavings).toFixed(2)} ج.م</div>` : ""}
  <div class="total-row">
    <span class="lbl">✅ الإجمالي:</span> ${total.toFixed(2)} ج.م
  </div>
</div>
<div class="divider"></div>

<svg class="bc" id="invbc"></svg>
<div class="divider"></div>

${receiptPolicy === undefined ? `<div class="policy-title">📋 سياسة الاستبدال والاسترجاع</div>
<div class="policy">
  يُقبل الاستبدال والاسترجاع خلال <strong>14 يوم</strong> من تاريخ الشراء<br/>
  بشرط سلامة المنتج وإحضار الفاتورة<br/>
  <strong>⚠️ غير شامل ألعاب الأطفال</strong>
</div>
<div class="divider"></div>` : receiptPolicy ? `<div class="policy-title">📋 سياسة الاستبدال والاسترجاع</div>
<div class="policy">${escHtml(receiptPolicy).replace(/\n/g, "<br/>")}</div>
<div class="divider"></div>` : ""}

<div class="center" style="font-size:13px;font-weight:900;margin-bottom:2px;">شكراً لتسوقكم معنا ❤</div>
<div class="store-name" style="font-size:18px;">${escHtml(storeName || "")}</div>

<script>
  try {
    if (window.JsBarcode) JsBarcode("#invbc", "${invCode}", { format: "CODE128", displayValue: true, fontSize: 11, height: 40, width: 1.5, margin: 0 });
    else document.getElementById("invbc").outerHTML = "<div class='center'>${invCode}</div>";
  } catch (e) { document.getElementById("invbc").outerHTML = "<div class='center'>${invCode}</div>"; }
  setTimeout(function () { window.print(); }, 400);
<\/script>
</body>
</html>`;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) {
      alert("السماح بالـ popups مطلوب للطباعة");
      return;
    }
    win.document.write(printContent);
    win.document.close();
    win.focus();
  }

  // ── طباعة PDF ملخص مبيعات اليوم ──
  async function printDailySalesPDF() {
    if (!userCompanyId) return;
    try {
      const [snap, retSnap] = await Promise.all([
        getDocs(getScopedQuery("invoices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("returns", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const todayStr = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const todayInvs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((inv) => {
          if ((inv.approval || "validated") !== "validated") return false;
          // فواتير الاستبدال (type=exchange) مبيعات محسوبة مثل store-pos
          if (inv.type && inv.type !== "store-pos" && inv.type !== "exchange") return false;
          const ts = new Date(inv.date || inv.createdAt || 0).getTime();
          return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
        })
        .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

      if (todayInvs.length === 0) {
        alert("لا توجد مبيعات اليوم بعد");
        return;
      }

      const grandTotal = todayInvs.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      const grandDiscount = todayInvs.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
      // مرتجعات البيع بتاعة النهاردة (نفس منطق تقفيل الوردية) — عشان الصافي يطلع صح
      // خصوصًا مع الاستبدال: فاتورة البديل داخلة فوق، وقيمة المرتجع لازم تتخصم هنا
      const todayReturns = retSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => {
          if (r.kind && r.kind !== "sale") return false;
          const ts = new Date(r.date || r.createdAt || 0).getTime();
          return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
        });
      const returnsTotal = todayReturns.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const netTotal = round2(grandTotal - returnsTotal);

      // جمع حسب طريقة الدفع (مع دعم الدفع المقسم)
      const byMethod = {};
      todayInvs.forEach((inv) => {
        if (inv.splitPayment && inv.splitPayments) {
          inv.splitPayments.forEach((sp) => {
            const m = sp.method || "cash";
            byMethod[m] = round2((byMethod[m] || 0) + (parseFloat(sp.amount) || 0));
          });
        } else {
          const m = inv.paymentMethod || "cash";
          byMethod[m] = round2((byMethod[m] || 0) + (parseFloat(inv.amount) || 0));
        }
      });

      const clientsSnap = await getDocs(getScopedQuery("clients", userRole, userCompanyId, currentUser?.uid));
      const clientsMap = {};
      clientsSnap.docs.forEach((d) => { clientsMap[d.id] = d.data().name || "—"; });

      const rows = todayInvs.map((inv, idx) => {
        const items = (inv.products || []).map((p) => `${p.productName || p.name || "صنف"} ×${p.quantity}`).join("، ");
        const clientName = inv.clientId ? (clientsMap[inv.clientId] || "—") : "زبون نقدي";
        const payStr = inv.splitPayment && inv.splitPayments
          ? inv.splitPayments.map((sp) => `${getPaymentLabel(sp.method)}: ${(parseFloat(sp.amount)||0).toFixed(2)}`).join(" + ")
          : getPaymentLabel(inv.paymentMethod);
        const discStr = parseFloat(inv.discount) > 0 ? `<br/><small style="color:#b45309;">خصم: ${(parseFloat(inv.discount)||0).toFixed(2)} ج.م</small>` : "";
        const exTag = inv.type === "exchange" ? `<br/><small style="color:#1e3a8a;font-weight:800;">🔄 استبدال</small>` : "";
        return `<tr>
          <td style="padding:6px 8px;text-align:center;">${idx + 1}</td>
          <td style="padding:6px 8px;">${new Date(inv.date || inv.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</td>
          <td style="padding:6px 8px;">${clientName}</td>
          <td style="padding:6px 8px;font-size:11px;">${items}</td>
          <td style="padding:6px 8px;text-align:center;">${payStr}</td>
          <td style="padding:6px 8px;text-align:left;font-weight:800;">${(parseFloat(inv.amount)||0).toFixed(2)}${discStr}${exTag}</td>
        </tr>`;
      }).join("");

      const methodRows = Object.entries(byMethod).map(([m, amt]) =>
        `<tr><td style="padding:5px 12px;">${getPaymentLabel(m)}</td><td style="padding:5px 12px;font-weight:800;text-align:left;">${amt.toFixed(2)} ج.م</td></tr>`
      ).join("");

      const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>مبيعات اليوم — ${todayStr}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', 'Arial', sans-serif; font-size: 13px; color: #1e293b; padding: 24px; }
  h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: 700; margin: 16px 0 8px; color: #1e3a8a; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f1f5f9; padding: 7px 8px; font-weight: 800; font-size: 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
  tr:nth-child(even) td { background: #f8fafc; }
  .summary-box { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 20px; margin-left: 12px; text-align: center; }
  .summary-box .val { font-size: 22px; font-weight: 900; color: #1e3a8a; }
  .summary-box .lbl { font-size: 11px; color: #64748b; margin-top: 2px; }
  .method-table { max-width: 320px; }
  @media print { body { padding: 10px; } @page { margin: 10mm; } }
</style>
</head>
<body>
<h1>📊 ${storeName || "المحل"} — مبيعات اليوم</h1>
<div class="subtitle">${todayStr} · ${todayInvs.length} فاتورة</div>

<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
  <div class="summary-box">
    <div class="val">${todayInvs.length}</div>
    <div class="lbl">إجمالي الفواتير</div>
  </div>
  <div class="summary-box">
    <div class="val">${grandTotal.toFixed(2)} ج.م</div>
    <div class="lbl">إجمالي المبيعات</div>
  </div>
  ${grandDiscount > 0 ? `<div class="summary-box" style="background:#fffbeb;border-color:#fcd34d;">
    <div class="val" style="color:#b45309;">${grandDiscount.toFixed(2)} ج.م</div>
    <div class="lbl">إجمالي الخصومات</div>
  </div>` : ""}
  ${returnsTotal > 0 ? `<div class="summary-box" style="background:#fef2f2;border-color:#fecaca;">
    <div class="val" style="color:#dc2626;">${returnsTotal.toFixed(2)} ج.م</div>
    <div class="lbl">مرتجعات اليوم (${todayReturns.length})</div>
  </div>
  <div class="summary-box" style="background:#f0fdf4;border-color:#86efac;">
    <div class="val" style="color:#059669;">${netTotal.toFixed(2)} ج.م</div>
    <div class="lbl">صافي المبيعات</div>
  </div>` : ""}
</div>

<h2>📋 تفاصيل الفواتير</h2>
<table>
  <thead><tr>
    <th>#</th><th>الوقت</th><th>العميل</th><th>الأصناف</th><th>الدفع</th><th>الإجمالي</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>

<h2>💳 ملخص طرق الدفع</h2>
<table class="method-table">
  <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
  <tbody>${methodRows}</tbody>
  <tfoot><tr style="border-top:2px solid #1e3a8a;">
    <td style="padding:6px 12px;font-weight:900;">الإجمالي</td>
    <td style="padding:6px 12px;font-weight:900;text-align:left;">${grandTotal.toFixed(2)} ج.م</td>
  </tr></tfoot>
</table>

<script>setTimeout(function(){window.print();},400);<\/script>
</body>
</html>`;

      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) { alert("السماح بالـ popups مطلوب للطباعة"); return; }
      win.document.write(html);
      win.document.close();
      win.focus();
    } catch (err) {
      console.error(err);
      alert("تعذر تحميل مبيعات اليوم");
    }
  }

  async function checkout(e) {
    e?.preventDefault();
    if (cart.length === 0) {
      alert(t("pos.addFirst"));
      return;
    }
    // ── الحقول الإلزامية — المنع يوقف البيع كله (مفيش فاتورة ولا خصم مخزون) ──
    // اسم العميل: مختار من القائمة أو اسم جديد مكتوب (إلزامي دايماً)
    const clientObj0 = clients.find((c) => c.id === selectedClient);
    if (!(clientObj0?.name || newClientName.trim())) {
      alert(t("storepos.clientRequired"));
      return;
    }
    // رقم العميل: رقم العميل المختار أو الرقم الجديد المكتوب (إلزامي دايماً)
    if (!((clientObj0?.phone || "").trim() || newClientPhone.trim())) {
      alert(t("storepos.phoneRequired"));
      return;
    }
    // المبلغ: لازم أكبر من صفر (إلزامي دايماً)
    if (!(total > 0)) {
      alert(t("storepos.amountRequired"));
      return;
    }
    // طريقة الدفع: اختيار يدوي (أو دفع مقسم مكتمل) — إلزامية دايماً
    if (!splitPayment && !paymentMethod) {
      alert(t("storepos.paymentRequired"));
      return;
    }
    // اسم الكاشير: حسب إعدادات الشركة (صفحة شركتي)
    if (cashierRequired && !cashierName.trim()) {
      alert(t("storepos.cashierRequired"));
      return;
    }
    // اسم السيلز: حسب إعدادات الشركة (صفحة شركتي)
    if (salesRepRequired && !salesRepId) {
      alert(t("storepos.salesRepRequired"));
      return;
    }
    if (discountExceedsSubtotal) {
      alert(t("storepos.discountTooHigh"));
      return;
    }
    if (cashierDiscountBlocked) {
      alert(t("storepos.discountAdminOnly", { pct: MAX_CASHIER_DISCOUNT_PCT }));
      return;
    }
    // التحقق من الدفع المقسم
    if (splitPayment) {
      if (!split1 || !split2) {
        alert(t("storepos.splitRequired"));
        return;
      }
      if (splitMethod1 === splitMethod2) {
        alert(t("storepos.splitSameMethod"));
        return;
      }
      if (Math.abs(splitTotal - total) > 0.01) {
        alert(t("storepos.splitMismatch", { total: total.toFixed(2), entered: splitTotal.toFixed(2) }));
        return;
      }
    }
    setSubmitting(true);

    // بناء بيانات الدفع
    const finalPaymentMethod = splitPayment ? "split" : paymentMethod;
    const splitPaymentsArr = splitPayment
      ? [{ method: splitMethod1, amount: split1 }, { method: splitMethod2, amount: split2 }]
      : null;

    try {
      const now = new Date().toISOString();
      const invoiceRef = doc(collection(db, "invoices"));

      // لو اسم عميل جديد مكتوب ومش محفوظ — احفظه الأول عشان الفاتورة ترتبط بيه
      let finalClientId = selectedClient || null;
      if (!finalClientId && newClientName.trim()) {
        try {
          finalClientId = await ensureClient();
        } catch (err) {
          console.error(err);
          alert("تعذر حفظ العميل");
          setSubmitting(false);
          return;
        }
        if (!finalClientId) {
          alert(t("storepos.clientRequired"));
          setSubmitting(false);
          return;
        }
      }

      const repObj = salesReps.find((r) => r.id === salesRepId) || null;
      const invoiceData = {
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdByEmail: currentUser?.email || "",
        clientId: finalClientId,
        salesRepId: repObj ? repObj.id : null,
        salesRepName: repObj ? (repObj.name || "") : "",
        products: cartWithPromo.map((item) => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          // الأصل قبل العرض
          originalPrice: parseFloat(item.price) || 0,
          // السعر الفعلي بعد العرض
          price: item.effectivePrice,
          amount: round2(item.effectivePrice * item.quantity),
          size: item.size || "",
          color: item.color || "",
          // بيانات العرض للفاتورة
          promoType: item.promo?.type || null,
          promoValue: item.promo?.value || null,
          promoSaved: item.savedPerUnit || 0,
          freeCount: item.freeCount || 0,
        })),
        subtotal,
        promoSavings,
        discount: discountNum,
        discountRaw: discountType === "percent" ? discountRaw : discountNum,
        discountType,
        amount: total,
        paidAmount: total,
        status: "paid",
        approval: "validated",
        validatedBy: currentUser?.uid || null,
        validatedAt: now,
        paymentMethod: finalPaymentMethod,
        ...(splitPaymentsArr ? { splitPayment: true, splitPayments: splitPaymentsArr } : {}),
        date: now,
        createdAt: now,
        type: "store-pos",
      };

      if (isOffline()) {
        const { refs, snaps } = await readStockCache("inventory", cart.map((item) => item.id));
        const byId = new Map(refs.map((r, i) => [r.id, snaps[i]]));
        cart.forEach((item) => {
          const snap = byId.get(item.id);
          if (!snap || !snap.exists()) throw new Error(t("offline.noData"));
          const currentQty = parseFloat(snap.data().quantity) || 0;
          if (currentQty < item.quantity) {
            throw new Error(`الكمية المتاحة من "${item.name}" غير كافية (متاح: ${currentQty})`);
          }
        });
        const batch = writeBatch(db);
        cart.forEach((item) => {
          const snap = byId.get(item.id);
          const currentQty = parseFloat(snap.data().quantity) || 0;
          batch.update(doc(db, "inventory", item.id), { quantity: round2(currentQty - item.quantity) });
        });
        batch.set(invoiceRef, invoiceData);
        await batch.commit();
      } else {
        await runTransaction(db, async (tx) => {
          const reads = [];
          for (const item of cart) {
            const productRef = doc(db, "inventory", item.id);
            const productDoc = await tx.get(productRef);
            reads.push({ item, productRef, productDoc });
          }
          for (const { item, productDoc } of reads) {
            if (!productDoc.exists()) throw new Error(`الصنف "${item.name}" غير موجود`);
            const currentQty = parseFloat(productDoc.data().quantity) || 0;
            if (currentQty < item.quantity) {
              throw new Error(`الكمية المتاحة من "${item.name}" غير كافية (متاح: ${currentQty})`);
            }
          }
          for (const { item, productRef, productDoc } of reads) {
            const currentQty = parseFloat(productDoc.data().quantity) || 0;
            tx.update(productRef, { quantity: round2(currentQty - item.quantity) });
          }
          tx.set(invoiceRef, invoiceData);
        });
      }

      await logActivity({
        actionType: "CREATE",
        collectionName: "invoices",
        itemId: invoiceRef.id,
        details: `Store POS sale: ${cart.length} items, total ${total}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      // لقطة الطباعة من الأصناف بعد تطبيق العروض — عشان السطور (سعر فعّال/مجاني)
      // تطابق المجموع والإجمالي. النسخة الخام `cart` مفيهاش effectivePrice
      // فكانت السطور تطلع بالسعر الكامل والإجمالي بالسعر بعد العرض.
      const cartSnapshot = cartWithPromo.map((item) => ({ ...item }));
      const clientObj   = finalClientId ? clients.find((c) => c.id === finalClientId) : null;
      const clientName  = clientObj?.name || newClientName.trim() || "";
      const clientPhone = clientObj?.phone || newClientPhone.trim() || "";

      // بناء معلومات الدفع المقسم للفاتورة
      const splitInfoForPrint = splitPayment ? {
        isSplit: true,
        label1: getPaymentLabel(splitMethod1),
        amount1: split1,
        label2: getPaymentLabel(splitMethod2),
        amount2: split2,
      } : null;

      setCart([]);
      setSelectedClient("");
      setSalesRepId("");
      setNewClientName("");
      setNewClientPhone("");
      setDiscount("");
      setDiscountType("amount");
      setPaymentMethod("");
      setSplitPayment(false);
      setSplitAmount1("");
      setSplitAmount2("");
      setSplitMethod1("cash");
      setSplitMethod2("instapay");

      const soldMap = new Map(cartSnapshot.map((it) => [it.id, parseFloat(it.quantity) || 0]));
      setProducts((prev) => prev.map((p) => soldMap.has(p.id)
        ? { ...p, quantity: round2(Math.max(0, (parseFloat(p.quantity) || 0) - soldMap.get(p.id))) }
        : p));
      await Promise.all([fetchClients(), fetchShift()]);
      handleThermalPrint(
        { id: invoiceRef.id, paymentMethod: finalPaymentMethod, discountType, discountRaw, promoSavings },
        cartSnapshot, clientName, clientPhone,
        cashierName.trim() || "—",
        splitInfoForPrint,
        invoiceData.salesRepName || ""
      );
    } catch (err) {
      console.error(err);
      if (!handleOfflineError(err, t, (m) => alert(m))) alert(err.message || t("pos.fail"));
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("pos.loading")}
          </div>
        </div>
      </div>
    );
  }

  const selectStyle = {
    padding: "8px 10px",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    fontSize: 13,
    background: "white",
    fontFamily: "Cairo, sans-serif",
  };

  return (
    <>
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content" style={{ fontFamily: "Cairo, sans-serif" }}>
        <div className="header">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fas fa-shirt" style={{ fontSize: 26, color: NAVY }}></i>
              {t("storepos.title")}
            </h1>
            <p className="subtitle">{t("storepos.subtitle")}</p>
          </div>
        </div>

        {/* فاتورة الاستبدال الأخيرة — جاهزة للعرض والطباعة بعد الرجوع من الفواتير */}
        {lastExchange?.invoice && (
          <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <i className="fas fa-right-left" style={{ fontSize: 22, color: "#16a34a" }}></i>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>🔄 فاتورة استبدال جاهزة <span dir="ltr" style={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>#{lastExchange.id}</span></div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                البديل: <strong style={{ color: "#059669" }}>{(parseFloat(lastExchange.newTotal) || 0).toFixed(2)}</strong>
                {" • "}المرتجع: <strong style={{ color: "#dc2626" }}>{(parseFloat(lastExchange.refundTotal) || 0).toFixed(2)}</strong>
                {" • "}الفرق: <strong>{(parseFloat(lastExchange.diff) || 0) > 0 ? "+" : ""}{(parseFloat(lastExchange.diff) || 0).toFixed(2)}</strong>
              </div>
            </div>
            <button type="button" className="btn-primary btn-sm" onClick={printExchangeReceipt}>
              <i className="fas fa-print"></i> طباعة الفاتورة
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={dismissLastExchange}>
              إغلاق
            </button>
          </div>
        )}

        {/* ── شريط الوردية (NAVY theme) ── */}
        {!shift ? (
          <form onSubmit={openShift} style={{ display: "flex", gap: 8, alignItems: "center", background: "#eff6ff", border: `2px dashed ${NAVY}`, borderRadius: 10, padding: "8px 12px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>🕐 {t("shift.noShift")}</span>
            <input type="number" min="0" step="0.01" placeholder={t("shift.startCashPh")}
              value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, width: 200 }} />
            <button type="submit" disabled={opening} className="btn-primary btn-sm" style={{ background: NAVY }}>{opening ? (t("common.loading")) : t("shift.open")}</button>
            {closings.length > 0 && (
              <button type="button" onClick={() => setShowHistory(!showHistory)} className="btn-secondary btn-sm">{t("shift.history")} ({closings.length})</button>
            )}
          </form>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#eff6ff", border: `2px solid ${NAVY}`, borderRadius: 10, padding: "8px 12px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
              🟢 {t("shift.openSince", { n: shift.number, time: shift.openedAt ? new Date(shift.openedAt).toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit" }) : "—" })}
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>{t("shift.startCash")}: {moneyShort(shift.openingCash || 0, locale)}</span>
            <button type="button" onClick={previewClosing} className="btn-primary btn-sm" style={{ marginInlineEnd: "auto", background: NAVY }}>{t("shift.close")}</button>
            <button type="button" onClick={() => setShowHistory(!showHistory)} className="btn-secondary btn-sm">{t("shift.historyShort")}</button>
          </div>
        )}

        {showHistory && closings.length > 0 && (
          <div className="table-container" style={{ marginBottom: 16 }}>
            <div className="table-header"><h3>{t("shift.pastTitle")}</h3></div>
            <table>
              <thead><tr><th>#</th><th>{t("shift.thOpen")}</th><th>{t("shift.thClose")}</th><th>{t("shift.thInvoices")}</th><th>{t("shift.thCollected")}</th><th>{t("shift.thRetCount")}</th><th>{t("shift.thRetAmt")}</th><th>{t("shift.thIn")}</th><th>{t("shift.thOut")}</th><th>{t("shift.thCounted")}</th><th>{t("shift.thDiff")}</th><th>{t("shift.thReceiver")}</th></tr></thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>#{c.number}</td>
                    <td style={{ fontSize: 12 }}>{c.openedAt ? new Date(c.openedAt).toLocaleString(timeLocale) : "—"}</td>
                    <td style={{ fontSize: 12 }}>{c.closedAt ? new Date(c.closedAt).toLocaleString(timeLocale) : <span style={{ color: "#16a34a", fontWeight: 700 }}>{t("shift.openLabel")}</span>}</td>
                    <td>{c.salesCount ?? "—"}</td>
                    <td style={{ fontWeight: 700 }}>{c.paidTotal != null ? moneyShort(c.paidTotal, locale) : "—"}</td>
                    <td>{c.returnsCount ?? "—"}</td>
                    <td style={{ color: "#b45309", fontWeight: 700 }}>{c.returnsTotal != null ? moneyShort(c.returnsTotal, locale) : "—"}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{c.cashIn != null ? moneyShort(c.cashIn, locale) : "—"}</td>
                    <td style={{ color: "#dc2626", fontWeight: 700 }}>{c.cashOut != null ? moneyShort(c.cashOut, locale) : "—"}</td>
                    <td>{c.countedCash != null ? moneyShort(c.countedCash, locale) : "—"}</td>
                    <td style={{ fontWeight: 800, color: (c.difference || 0) === 0 ? "#16a34a" : (c.difference || 0) > 0 ? "#2563eb" : "#dc2626" }}>
                      {c.difference != null ? `${c.difference > 0 ? "+" : ""}${moneyShort(c.difference, locale)}` : "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>{c.receiver || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
          {/* ── شبكة المنتجات ── */}
          <div>
            {/* بحث + فلاتر */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div className="search-wrapper" style={{ flex: 1, minWidth: 200 }}>
                <i className="fas fa-search search-icon"></i>
                <input
                  type="text"
                  placeholder={t("storepos.search")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoFocus
                />
              </div>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allTypes")}</option>
                {typeOptions.map((tp) => (
                  <option key={tp} value={tp}>
                    {TYPE_LABELS[tp] || tp}
                  </option>
                ))}
              </select>
              <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allSizes")}</option>
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)} style={selectStyle}>
                <option value="all">{t("storepos.allColors")}</option>
                {colorOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {/* دخول الاستبدال من نقطة البيع (للأدمن فقط) — نفس شاشة الفواتير، نفس القواعد */}
              {(userRole === "admin" || userRole === "super_admin") && (
                <button
                  type="button"
                  onClick={() => navigate("/invoices")}
                  className="btn-secondary btn-sm"
                  title={t("ex.exchangeBtn")}
                  style={{ borderColor: "#1e3a8a", color: "#1e3a8a", whiteSpace: "nowrap" }}
                >
                  <i className="fas fa-right-left"></i> {t("ex.exchangeBtn")}
                </button>
              )}
            </div>

            {/* باركود مجهول: تسجيله على صنف عشان المسح الجاي يشتغل */}
            {unknownBarcode && (
              <div style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>
                  ⚠️ باركود غير مسجل: <span dir="ltr" style={{ fontFamily: "monospace" }}>{unknownBarcode}</span>
                </div>
                <div style={{ fontSize: 12, color: "#b45309", marginBottom: 8 }}>
                  دوّر على الصنف وسجّل الباركود عليه — وهيتضاف للسلة فوراً، والمسح الجاي هيشتغل على طول
                </div>
                <input
                  type="text"
                  placeholder="دوّر باسم الصنف / الموديل / المقاس / اللون..."
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 13, marginBottom: 8, fontFamily: "Cairo" }}
                />
                {assignCandidates.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "white", borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                    <span style={{ fontWeight: 700, flex: 1 }}>{p.name}{p.size || p.color ? ` (${[p.size, p.color].filter(Boolean).join(" / ")})` : ""}</span>
                    <span style={{ color: "#16a34a", fontWeight: 800, fontSize: 12 }}>مخزون: {p.quantity ?? 0}</span>
                    <button type="button" className="btn-primary btn-sm" onClick={() => assignBarcodeToProduct(p)}>
                      تسجيل + بيع
                    </button>
                  </div>
                ))}
                <button type="button" className="btn-secondary btn-sm" onClick={() => { setUnknownBarcode(null); setAssignSearch(""); }}>
                  إلغاء
                </button>
              </div>
            )}

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
              {filteredProducts.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                  <div className="empty-icon">
                    <i className="fas fa-shirt"></i>
                  </div>
                  <p>{searchTerm || filterType !== "all" || filterSize !== "all" || filterColor !== "all" ? t("common.noResults") : t("storepos.empty")}</p>
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const inCart = cart.find((c) => c.id === product.id);
                  const out = (product.quantity || 0) < 1;
                  const productPromo = promoForProduct(product, promotions);
                  const promoLabel = productPromo
                    ? productPromo.type === "percent"
                      ? `${productPromo.value}% خصم`
                      : productPromo.type === "bogo"
                        ? "اشتري 1 هدية 1"
                        : "اشتري 2 هدية 2"
                    : null;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      disabled={out}
                      style={{
                        background: "white",
                        border: `2px solid ${inCart ? "#1e3a8a" : "#e2e8f0"}`,
                        borderRadius: 14,
                        padding: 0,
                        cursor: out ? "not-allowed" : "pointer",
                        opacity: out ? 0.55 : 1,
                        transition: "border-color 0.2s, transform 0.15s, box-shadow 0.15s",
                        textAlign: "start",
                        fontFamily: "Cairo, sans-serif",
                        overflow: "hidden",
                        position: "relative",
                      }}
                      onMouseEnter={(e) => {
                        if (!out) {
                          e.currentTarget.style.borderColor = "#1e3a8a";
                          e.currentTarget.style.transform = "translateY(-3px)";
                          e.currentTarget.style.boxShadow = "0 8px 20px rgba(30,58,138,0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = inCart ? "#1e3a8a" : "#e2e8f0";
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "none";
                      }}
                    >
                      {/* صورة المنتج — مفيش placeholder. الصنف من غير صورة
                          بيعرض اسمه بس؛ أيقونة قميص كانت بتوهم إن كل
                          المنتجين قمصان. */}
                      {product.imageUrl && (
                        <div style={{ height: 120, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                      )}
                      {inCart && (
                        <span
                          style={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            background: "#1e3a8a",
                            color: "white",
                            borderRadius: "50%",
                            width: 22,
                            height: 22,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {inCart.quantity}
                        </span>
                      )}
                        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                        {/* بادج العرض */}
                        {promoLabel && (
                          <div style={{
                            background: productPromo.type === "percent" ? "#dcfce7" : "#fdf4ff",
                            color: productPromo.type === "percent" ? "#15803d" : "#7c3aed",
                            fontSize: 10, fontWeight: 800,
                            padding: "2px 8px", borderRadius: 20,
                            textAlign: "center", letterSpacing: 0.3,
                          }}>
                            🏷️ {promoLabel}
                          </div>
                        )}
                        <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {product.name}
                        </div>
                        {(product.size || product.color) && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {product.size && (
                              <span style={{ fontSize: 10, background: "#eef2ff", color: "#4338ca", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>
                                {product.size}
                              </span>
                            )}
                            {product.color && (
                              <span style={{ fontSize: 10, background: "#eff6ff", color: "#1e3a8a", padding: "1px 8px", borderRadius: 10, fontWeight: 700 }}>
                                {product.color}
                              </span>
                            )}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                          <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 14 }}>
                            {productPromo && productPromo.type === "percent" ? (
                              <>
                                <span style={{ textDecoration: "line-through", color: "#94a3b8", fontSize: 11, fontWeight: 600, marginLeft: 4 }}>{product.price}</span>
                                {(parseFloat(product.price) * (1 - productPromo.value / 100)).toFixed(2)}
                              </>
                            ) : (
                              product.price
                            )} {t("currency")}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: (product.quantity || 0) < 5 ? "#fef2f2" : "#f0fdf4",
                              color: (product.quantity || 0) < 5 ? "#dc2626" : "#16a34a",
                              fontSize: 10,
                            }}
                          >
                            {product.quantity} {t("pos.remaining")}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── سلة البيع ── */}
          <div className="card" style={{ position: "sticky", top: 16 }}>
            <h3 style={{ marginBottom: 14 }}>
              <i className="fas fa-shopping-bag" style={{ color: "#1e3a8a" }}></i> {t("storepos.cart")}
              {cart.length > 0 && (
                <span className="badge" style={{ marginRight: 8, background: "#1e3a8a", color: "white" }}>
                  {cart.length}
                </span>
              )}
            </h3>

            {/* الكاشير الواقف — بيتسجل مرة واحدة ويفضل محفوظ */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>🧑‍💼 {t("storepos.cashierName")}{cashierRequired ? " *" : ""}</label>
              <input
                type="text"
                placeholder={t("storepos.cashierNamePh")}
                value={cashierName}
                onChange={(e) => handleCashierNameChange(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white", boxSizing: "border-box" }}
              />
            </div>

            {/* السيلز — تحت اسم الكاشير، يُحفظ على الفاتورة للعمولة */}
            {/* يظهر دائماً (حتى لو مفيش سيلز) عشان لو إلزامي والكاشير ميلاقيش نفسه مقفول من غير تفسير */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>🤝 {t("storepos.salesRep")}{salesRepRequired ? " *" : ""}</label>
              <select
                value={salesRepId}
                onChange={(e) => setSalesRepId(e.target.value)}
                disabled={salesReps.length === 0}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white", boxSizing: "border-box" }}
              >
                <option value="">{t("storepos.noRep")}</option>
                {salesReps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.code ? ` (${r.code})` : ""}{r.phone ? ` — ${r.phone}` : ""}</option>
                ))}
              </select>
              {salesReps.length === 0 && (
                <div style={{ fontSize: 11, color: salesRepRequired ? "#dc2626" : "#94a3b8", fontWeight: 700, marginTop: 4 }}>
                  {t("storepos.noRepsHint")}
                </div>
              )}
            </div>

            {/* العميل */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#64748b" }}>{t("pos.client")} *</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box" }}
              >
                <option value="">{t("pos.walkIn")}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {client.phone ? ` — ${client.phone}` : ""}
                  </option>
                ))}
              </select>
              {!selectedClient && (
                <div style={{ marginTop: 8, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{t("storepos.quickClient")}</div>
                  <input
                    type="text"
                    placeholder={t("storepos.clientNamePh")}
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <input
                    type="tel"
                    placeholder={t("storepos.clientPhonePh")}
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    style={{ padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "white" }}
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddClient}
                    disabled={addingClient || !newClientName.trim()}
                    style={{
                      padding: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      border: "none",
                      borderRadius: 8,
                      background: !newClientName.trim() ? "#e2e8f0" : "#1e3a8a",
                      color: "white",
                      cursor: "pointer",
                    }}
                  >
                    {addingClient ? "..." : t("storepos.saveClient")}
                  </button>
                </div>
              )}
            </div>

            {/* أصناف السلة */}
            <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
              {cart.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0" }}>
                  <div className="empty-icon">
                    <i className="fas fa-cart-plus"></i>
                  </div>
                  <p>{t("pos.emptyCart")}</p>
                </div>
              ) : (
                cartWithPromo.map((item) => (
                  <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, alignItems: "center" }}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt={item.name} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name}
                      </div>
                      {(item.size || item.color) && (
                        <div style={{ fontSize: 11, color: "#6366f1" }}>
                          {[item.size, item.color].filter(Boolean).join(" / ")}
                        </div>
                      )}
                      {/* عرض نشط على هذا الصنف */}
                      {item.promo && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: item.promo.type === "percent" ? "#15803d" : "#7c3aed" }}>
                          🏷️ {item.promo.type === "percent"
                            ? `خصم ${item.promo.value}%`
                            : item.freeCount > 0
                              ? `${item.freeCount} قطعة مجانية`
                              : item.promo.type === "bogo" ? "اشتري 1 هدية 1" : "اشتري 2 هدية 2"}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        {item.promo && item.savedPerUnit > 0 ? (
                          <>
                            <span style={{ textDecoration: "line-through", marginLeft: 4 }}>{item.price}</span>
                            {item.effectivePrice.toFixed(2)} {t("currency")} × {item.quantity} = <strong style={{ color: "#15803d" }}>{(item.effectivePrice * item.quantity).toFixed(2)}</strong>
                          </>
                        ) : (
                          <>{item.price} {t("currency")} × {item.quantity} = <strong style={{ color: "#1e293b" }}>{((parseFloat(item.price) || 0) * item.quantity).toFixed(2)}</strong></>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => updateCartQuantity(item.id, item.quantity - 1)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                        −
                      </button>
                      <span style={{ fontWeight: 700, minWidth: 22, textAlign: "center" }}>{item.quantity}</span>
                      <button
                        onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                        className="btn-success btn-sm"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        disabled={item.quantity >= (item.stockQty ?? item.quantity)}
                      >
                        +
                      </button>
                      <button onClick={() => removeFromCart(item.id)} className="btn-danger btn-sm" style={{ padding: "2px 8px", fontSize: 12 }}>
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── قسم الخصم ── */}
            <div style={{ marginBottom: 12 }}>
              {/* تبديل نوع الخصم */}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => setDiscountType("amount")}
                  style={{
                    flex: 1, padding: "5px 0", fontSize: 12, fontWeight: 700,
                    border: `2px solid ${discountType === "amount" ? NAVY : "#e2e8f0"}`,
                    borderRadius: 8, background: discountType === "amount" ? "#eff6ff" : "white",
                    color: discountType === "amount" ? NAVY : "#64748b", cursor: "pointer",
                  }}
                >
                  {t("storepos.discountFixed")}
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  style={{
                    flex: 1, padding: "5px 0", fontSize: 12, fontWeight: 700,
                    border: `2px solid ${discountType === "percent" ? NAVY : "#e2e8f0"}`,
                    borderRadius: 8, background: discountType === "percent" ? "#eff6ff" : "white",
                    color: discountType === "percent" ? NAVY : "#64748b", cursor: "pointer",
                  }}
                >
                  {t("storepos.discountPercent")}
                </button>
              </div>

              {/* أزرار نسب الخصم السريع (تظهر فقط في وضع النسبة) */}
              {discountType === "percent" && (
                <div style={{ display: "flex", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
                  {[5, 10, 15, 20, 25].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDiscount(String(pct))}
                      style={{
                        padding: "4px 10px", fontSize: 12, fontWeight: 800,
                        border: `2px solid ${parseFloat(discount) === pct ? NAVY : "#e2e8f0"}`,
                        borderRadius: 20,
                        background: parseFloat(discount) === pct ? NAVY : "white",
                        color: parseFloat(discount) === pct ? "white" : "#475569",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiscount("")}
                    style={{
                      padding: "4px 10px", fontSize: 12, fontWeight: 700,
                      border: "2px solid #e2e8f0", borderRadius: 20,
                      background: "white", color: "#94a3b8", cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* حقل الخصم */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min="0"
                  step={discountType === "percent" ? "1" : "0.5"}
                  max={discountType === "percent" ? "100" : undefined}
                  placeholder={discountType === "percent" ? "0%" : "0"}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  style={{
                    flex: 1, padding: "7px 10px",
                    border: `1px solid ${discountExceedsSubtotal ? "#fca5a5" : "#e2e8f0"}`,
                    borderRadius: 8, fontSize: 13, textAlign: "center",
                  }}
                />
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 700, minWidth: 24 }}>
                  {discountType === "percent" ? "%" : t("currency")}
                </span>
              </div>

              {/* معاينة مبلغ الخصم لو نسبة */}
              {discountType === "percent" && discountNum > 0 && (
                <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 3, textAlign: "center" }}>
                  = {discountNum.toFixed(2)} {t("currency")} {t("storepos.discountSaved")}
                </div>
              )}
              {discountExceedsSubtotal && (
                <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginTop: 3 }}>
                  ⚠️ {t("storepos.discountTooHigh")}
                </div>
              )}
            </div>

            {/* ── طريقة الدفع ── */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{t("pay.title")} *</label>
                <button
                  type="button"
                  onClick={() => setSplitPayment((v) => !v)}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px",
                    border: `2px solid ${splitPayment ? NAVY : "#e2e8f0"}`,
                    borderRadius: 16,
                    background: splitPayment ? "#eff6ff" : "white",
                    color: splitPayment ? NAVY : "#64748b", cursor: "pointer",
                  }}
                >
                  {t("storepos.splitPayment")}
                </button>
              </div>

              {!splitPayment ? (
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
                >
                  <option value="">{t("storepos.selectPayment")}</option>
                  {EGYPT_PAYMENTS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              ) : (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* طريقة 1 */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      value={splitMethod1}
                      onChange={(e) => setSplitMethod1(e.target.value)}
                      style={{ flex: 1, padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                    >
                      {EGYPT_PAYMENTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={splitAmount1}
                      onChange={(e) => {
                        setSplitAmount1(e.target.value);
                        // الباقي تلقائي
                        const v = parseFloat(e.target.value) || 0;
                        const rem = round2(total - v);
                        setSplitAmount2(rem > 0 ? String(rem) : "");
                      }}
                      style={{ width: 90, padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                    />
                  </div>
                  {/* طريقة 2 */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      value={splitMethod2}
                      onChange={(e) => setSplitMethod2(e.target.value)}
                      style={{ flex: 1, padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                    >
                      {EGYPT_PAYMENTS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={splitAmount2}
                      onChange={(e) => setSplitAmount2(e.target.value)}
                      style={{ width: 90, padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, textAlign: "center" }}
                    />
                  </div>
                  {/* تحقق من مجموع الدفع */}
                  {(split1 + split2) > 0 && (
                    <div style={{
                      fontSize: 12, fontWeight: 700, textAlign: "center",
                      color: Math.abs(splitTotal - total) < 0.01 ? "#16a34a" : "#dc2626",
                    }}>
                      {Math.abs(splitTotal - total) < 0.01
                        ? `✅ ${t("storepos.splitOk")}`
                        : `⚠️ ${t("storepos.splitRemaining")}: ${Math.abs(splitTotal - total).toFixed(2)} ${t("currency")}`}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* الإجمالي */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{t("pos.subtotal")}</span>
                <span style={{ fontWeight: 700 }}>{subtotal.toFixed(2)} {t("currency")}</span>
              </div>
              {/* توفير العروض */}
              {promoSavings > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#15803d", fontWeight: 700 }}>🏷️ {t("promo.savings")}</span>
                  <span style={{ fontWeight: 800, color: "#15803d" }}>− {promoSavings.toFixed(2)} {t("currency")}</span>
                </div>
              )}
              {discountNum > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#b45309" }}>
                    {t("pos.discount")}{discountType === "percent" && discount ? ` (${discount}%)` : ""}
                  </span>
                  <span style={{ fontWeight: 700, color: "#b45309" }}>− {discountNum.toFixed(2)} {t("currency")}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px dashed #e2e8f0", paddingTop: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#1e293b" }}>{t("pos.total")}</span>
                <span style={{ fontWeight: 900, fontSize: 20, color: "#1e3a8a" }}>
                  {total.toFixed(2)} {t("currency")}
                </span>
              </div>
            </div>

            <button
              onClick={checkout}
              className="btn-primary btn-block"
              disabled={cart.length === 0 || submitting}
              style={{
                background: cart.length === 0 ? "#cbd5e1" : "linear-gradient(135deg,#1e3a8a,#1e3a8a)",
                fontSize: 16,
                padding: "14px",
              }}
            >
              {submitting ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> {t("pos.completing")}
                </>
              ) : (
                <>
                  <i className="fas fa-check-circle"></i> {t("storepos.checkout")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── زر PDF مبيعات اليوم (أسفل الصفحة) ── */}
        <div style={{
          marginTop: 24, padding: "14px 20px",
          background: "#f0fdf4", border: "2px dashed #86efac",
          borderRadius: 12, display: "flex", alignItems: "center",
          justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#166534" }}>
              📊 {t("storepos.dailyPDFTitle")}
            </div>
            <div style={{ fontSize: 12, color: "#16a34a", marginTop: 2 }}>
              {t("storepos.dailyPDFDesc")}
            </div>
          </div>
          <button
            type="button"
            onClick={printDailySalesPDF}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 800,
              background: "#16a34a", color: "white", border: "none",
              borderRadius: 10, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <i className="fas fa-file-pdf"></i>
            {t("storepos.dailyPDFBtn")}
          </button>
        </div>

        {/* ── مودال تقفيل الوردية وتسليم الشيفت (NAVY theme) ── */}
        {showCloseModal && shift && closePreview && (
          <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3><i className="fas fa-cash-register" style={{ color: NAVY }}></i> {t("shift.modalTitle", { n: shift.number })}</h3>
                <button className="modal-close" onClick={() => setShowCloseModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("shift.statInvoices")}</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{closePreview.count}</div>
                  </div>
                  <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("shift.statTotal")}</div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{moneyShort(closePreview.total, locale)}</div>
                  </div>
                  <div style={{ background: "#eff6ff", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("shift.statCollected")}</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: NAVY }}>{moneyShort(closePreview.paid, locale)}</div>
                  </div>
                  <div style={{ background: "#fffbeb", borderRadius: 8, padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{t("shift.statReturns")} ({closePreview.returnsCount || 0})</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#b45309" }}>{moneyShort(closePreview.returnsTotal || 0, locale)}</div>
                  </div>
                </div>
                {Object.keys(closePreview.byMethod).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>{t("close.byMethod")}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {Object.entries(closePreview.byMethod).map(([m, amt]) => (
                        <span key={m} style={{ background: "#eef2ff", color: NAVY, padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                          {getPaymentLabel(m)}: {moneyShort(amt, locale)}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                      {t("shift.cashSales")}: {moneyShort(closePreview.cashSales ?? 0, locale)} {t("currency")}
                      {(closePreview.returnsTotal || 0) > 0 && (
                        <span style={{ color: "#b45309" }}> — {t("shift.returnsDeduct")}: {moneyShort(closePreview.returnsTotal || 0, locale)}</span>
                      )}
                    </div>
                  </div>
                )}
                <form onSubmit={submitClosing}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ background: "#f0fdf4", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>داخل تلقائي ({closePreview.expInCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#16a34a" }}>{moneyShort(closePreview.cashIn || 0, locale)}</div>
                    </div>
                    <div style={{ background: "#fef2f2", borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#64748b" }}>خارج تلقائي ({closePreview.expOutCount || 0})</div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#dc2626" }}>{moneyShort(closePreview.cashOut || 0, locale)}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("shift.counted")} ({t("currency")})</label>
                    <input type="number" min="0" step="0.01" placeholder="0.00"
                      value={closeForm.countedCash} onChange={(e) => setCloseForm({ ...closeForm, countedCash: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>{t("shift.receiver")}</label>
                    <input type="text" placeholder={t("shift.receiverPh")}
                      value={closeForm.receiver} onChange={(e) => setCloseForm({ ...closeForm, receiver: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>{t("shift.notes")}</label>
                    <input type="text" placeholder="ملاحظه"
                      value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
                  </div>
                  {closeForm.countedCash !== "" && (
                    <div style={{ fontSize: 14, fontWeight: 800, padding: 10, borderRadius: 8, textAlign: "center",
                      background: Math.abs((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) < 0.005 ? "#f0fdf4" : "#fef2f2",
                      color: Math.abs((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) < 0.005 ? "#16a34a" : "#dc2626" }}>
                      {t("close.expected")}: {moneyShort(closingExpected(closePreview, shift.openingCash), locale)} — {t("close.diff")}: {(((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)) > 0 ? "+" : "") + moneyShort(round2((parseFloat(closeForm.countedCash) || 0) - closingExpected(closePreview, shift.openingCash)), locale)}
                    </div>
                  )}
                  <div className="modal-footer" style={{ marginTop: 12 }}>
                    <button type="button" className="btn-secondary" onClick={() => setShowCloseModal(false)}>{t("common.cancel")}</button>
                    <button type="submit" className="btn-primary" style={{ background: NAVY }} disabled={closing}>{closing ? (t("common.loading")) : t("shift.confirm")}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

    {/* مؤشر البحث */}
    {searchingInvoice && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "white", borderRadius: 12, padding: "24px 32px", fontWeight: 700, fontSize: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <i className="fas fa-spinner fa-spin" style={{ color: NAVY }}></i>
          جاري البحث عن الفاتورة...
        </div>
      </div>
    )}
      </div>
    </div>
    </>
  );
}
