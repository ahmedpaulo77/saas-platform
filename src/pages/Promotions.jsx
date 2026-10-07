// src/pages/Promotions.jsx — إدارة العروض والخصومات (ملابس فقط)
// العرض ينطبق على قسم كامل من المنيو، وممنوع يكون على نفس القسم عرضان في نفس الوقت.
import React, { useState, useEffect, useCallback } from "react";
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import Sidebar from "../components/common/Sidebar.js";
import { logActivity } from "../utils/auditLogger.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import { moneyShort } from "../utils/fmt.js";

const NAVY = "#1e3a8a";

// أنواع العروض
const PROMO_TYPES = [
  { value: "percent", labelKey: "promo.typePercent" },
  { value: "bogo",    labelKey: "promo.typeBogo"    },
  { value: "bogo2",   labelKey: "promo.typeBogo2"   },
];

const PERCENT_OPTIONS = [10,15,20,25,30,40,50,60,70,80];

// هل العرض نشط الآن؟ (مفعّل + في نطاق التاريخ)
export function isPromoActive(promo, now = new Date()) {
  if (!promo?.active) return false;
  const start = promo.startDate ? new Date(promo.startDate) : null;
  const end   = promo.endDate   ? new Date(promo.endDate + "T23:59:59") : null;
  if (start && now < start) return false;
  if (end   && now > end)   return false;
  return true;
}

/**
 * لو الصنف ينتمي لفئة (model) عليها عرض نشط، ارجع العرض. غير كده null.
 * الفئة في الملابس = product.model (من clothing_lookups kind="category")
 * مثال: model = "بنطلون" → عرض على "بنطلون" يطبَّق
 */
export function promoForProduct(product, promotions) {
  if (!product || !promotions?.length) return null;
  const now = new Date();
  return promotions.find((p) => {
    if (!isPromoActive(p, now)) return false;
    if (!p.categoryId) return false;
    // الفئة محفوظة في product.model للملابس
    return p.categoryId === product.model;
  }) || null;
}

/**
 * احسب السعر الفعلي بعد العرض لأول x قطعة في السلة.
 * للـ BOGO: كل قطعتين → الثانية مجانية.
 * للـ BOGO2: كل أربعة → الأولتان بسعر والأخيرتان مجانيتان.
 * للـ percent: سعر × (1 − value/100).
 * ترجع: { effectivePrice, savedPerUnit, isFree }
 */
export function applyPromo(promo, product, indexInCart) {
  if (!promo) return { effectivePrice: parseFloat(product.price) || 0, savedPerUnit: 0, isFree: false };
  const base = parseFloat(product.price) || 0;
  if (promo.type === "percent") {
    const pct = Math.min(80, Math.max(0, parseFloat(promo.value) || 0));
    const effective = Math.round(base * (1 - pct / 100) * 100) / 100;
    return { effectivePrice: effective, savedPerUnit: Math.round((base - effective) * 100) / 100, isFree: false };
  }
  if (promo.type === "bogo") {
    // 0-indexed: قطعة 0 عادية، قطعة 1 مجانية، قطعة 2 عادية، قطعة 3 مجانية...
    const isFree = indexInCart % 2 === 1;
    return { effectivePrice: isFree ? 0 : base, savedPerUnit: isFree ? base : 0, isFree };
  }
  if (promo.type === "bogo2") {
    // 0,1 عادي — 2,3 مجاني — 4,5 عادي...
    const posInGroup = indexInCart % 4;
    const isFree = posInGroup >= 2;
    return { effectivePrice: isFree ? 0 : base, savedPerUnit: isFree ? base : 0, isFree };
  }
  return { effectivePrice: base, savedPerUnit: 0, isFree: false };
}

export default function Promotions() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [promotions, setPromotions]   = useState([]);
  const [categories, setCategories]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);

  const emptyForm = {
    type: "percent", value: "20", categoryId: "", active: true,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  // ── جلب البيانات ──
  const fetchPromotions = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        query(collection(db, "promotions"), where("companyId", "==", userCompanyId))
      );
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPromotions(data);
    } catch (e) { console.error(e); }
  }, [userCompanyId]);

  const fetchCategories = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const snap = await getDocs(
        getScopedQuery("variant_codes_categories", userRole, userCompanyId, currentUser?.uid)
          .catch?.(() => null) || 
        query(collection(db, "variant_codes"), where("companyId", "==", userCompanyId))
      );
      // نستخدم inventory كمصدر للأقسام (type field) — الأكثر وجوداً في الملابس
      const invSnap = await getDocs(
        query(collection(db, "inventory"), where("companyId", "==", userCompanyId))
      );
      const types = [...new Set(
        invSnap.docs.map((d) => d.data().type).filter(Boolean)
      )].sort();
      // بناء قائمة أقسام من type + model
      const models = [...new Set(
        invSnap.docs.map((d) => d.data().model).filter(Boolean)
      )].sort();
      setCategories({ types, models, all: invSnap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (e) { console.error(e); }
  }, [userCompanyId, userRole, currentUser?.uid]);

  // الفئات من clothing_lookups (kind="category") — زي "بنطلون"، "جاكيت"، إلخ
  // + اتحاد مع قيم الموديل الموجودة في المنتجات (عشان القائمة متفضاش لو صفحة الفئات متفتحتش)
  const [invTypes, setInvTypes] = useState([]);
  const fetchInvTypes = useCallback(async () => {
    if (!userCompanyId) return;
    try {
      const [lookSnap, invSnap] = await Promise.all([
        getDocs(
          query(collection(db, "clothing_lookups"), where("companyId", "==", userCompanyId))
        ),
        getDocs(
          query(collection(db, "inventory"), where("companyId", "==", userCompanyId))
        ),
      ]);
      const fromLookups = lookSnap.docs
        .map((d) => d.data())
        .filter((v) => v.kind === "category" && String(v.name || "").trim())
        .map((v) => String(v.name).trim());
      const fromProducts = invSnap.docs
        .map((d) => String(d.data()?.model ?? "").trim())
        .filter(Boolean);
      setInvTypes([...new Set([...fromLookups, ...fromProducts])].sort());
    } catch (e) { console.error(e); }
  }, [userCompanyId]);

  useEffect(() => {
    Promise.all([fetchPromotions(), fetchInvTypes()])
      .finally(() => setLoading(false));
  }, [fetchPromotions, fetchInvTypes]);

  // الأنواع الافتراضية مع الترجمة العربية
  const DEFAULT_TYPE_LABELS = {
    men: "رجالي",
    women: "حريمي",
    boys: "أولاد",
    girls: "بنات",
    unisex: "يونيسكس",
  };

  // القسم المستهدف = الفئات من clothing_lookups (kind="category") زي "بنطلون"
  const catOptions = invTypes.map((t) => ({ value: t, label: DEFAULT_TYPE_LABELS[t] || t }));

  // ── التحقق من تعارض العروض ──
  function hasConflict(newForm, excludeId = null) {
    const now = new Date();
    const newStart = newForm.startDate ? new Date(newForm.startDate) : null;
    const newEnd   = newForm.endDate   ? new Date(newForm.endDate + "T23:59:59") : null;

    return promotions.some((p) => {
      if (p.id === excludeId) return false;
      if (p.categoryId !== newForm.categoryId) return false;
      if (!p.active) return false;
      const pStart = p.startDate ? new Date(p.startDate) : null;
      const pEnd   = p.endDate   ? new Date(p.endDate + "T23:59:59") : null;
      // تعارض = الفترتان تتداخلان
      const aStart = newStart || new Date("2000-01-01");
      const aEnd   = newEnd   || new Date("2099-12-31");
      const bStart = pStart   || new Date("2000-01-01");
      const bEnd   = pEnd     || new Date("2099-12-31");
      return aStart <= bEnd && bStart <= aEnd;
    });
  }

  // ── إضافة عرض ──
  async function handleAdd(e) {
    e.preventDefault();
    setFormError("");
    if (!form.categoryId) { setFormError(t("promo.errNoCategory")); return; }
    if (form.type === "percent" && (!form.value || parseFloat(form.value) <= 0)) {
      setFormError(t("promo.errNoPercent")); return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      setFormError(t("promo.errDateOrder")); return;
    }
    if (hasConflict(form)) {
      setFormError(t("promo.errConflict")); return;
    }
    setSaving(true);
    try {
      const catLabel = catOptions.find((c) => c.value === form.categoryId)?.label || form.categoryId;
      const ref = await addDoc(collection(db, "promotions"), {
        type: form.type,
        value: form.type === "percent" ? parseFloat(form.value) : 0,
        categoryId: form.categoryId,
        categoryName: catLabel,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        active: !!form.active,
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE", collectionName: "promotions", itemId: ref.id,
        details: `Created promotion: ${form.type} on ${catLabel}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm(emptyForm);
      await fetchPromotions();
    } catch (err) {
      console.error(err);
      setFormError(t("common.errorGeneric"));
    }
    setSaving(false);
  }

  // ── تفعيل/إيقاف عرض ──
  async function toggleActive(promo) {
    try {
      // لو هيتفعّل → تحقق من التعارض
      if (!promo.active && hasConflict({ ...promo, active: true }, promo.id)) {
        alert(t("promo.errConflict")); return;
      }
      await updateDoc(doc(db, "promotions", promo.id), { active: !promo.active });
      await logActivity({
        actionType: "UPDATE", collectionName: "promotions", itemId: promo.id,
        details: `Toggled promotion active: ${!promo.active}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchPromotions();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  // ── حذف عرض ──
  async function handleDelete(promo) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "promotions", promo.id));
      await logActivity({
        actionType: "DELETE", collectionName: "promotions", itemId: promo.id,
        details: `Deleted promotion on ${promo.categoryName}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchPromotions();
    } catch (err) { console.error(err); alert(t("common.errorGeneric")); }
  }

  // ── تسمية نوع العرض ──
  function promoTypeLabel(type) {
    if (type === "percent") return t("promo.typePercent");
    if (type === "bogo")    return t("promo.typeBogo");
    if (type === "bogo2")   return t("promo.typeBogo2");
    return type;
  }

  function promoStatusBadge(promo) {
    const now = new Date();
    if (!promo.active) return <span className="badge" style={{ background: "#f1f5f9", color: "#64748b" }}>{t("promo.inactive")}</span>;
    const start = promo.startDate ? new Date(promo.startDate) : null;
    const end   = promo.endDate   ? new Date(promo.endDate + "T23:59:59") : null;
    if (start && now < start) return <span className="badge" style={{ background: "#eff6ff", color: "#1e3a8a" }}>{t("promo.upcoming")}</span>;
    if (end   && now > end)   return <span className="badge" style={{ background: "#fef2f2", color: "#dc2626" }}>{t("promo.expired")}</span>;
    return <span className="badge" style={{ background: "#dcfce7", color: "#16a34a" }}>{t("promo.live")}</span>;
  }

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content"><div className="loading"><div className="spinner"></div>{t("common.loading")}</div></div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content" style={{ fontFamily: "Cairo, sans-serif" }}>

        {/* Header */}
        <div className="header">
          <div>
            <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="fas fa-percent" style={{ fontSize: 24, color: NAVY }}></i>
              {t("promo.title")}
            </h1>
            <p className="subtitle">{t("promo.subtitle")}</p>
          </div>
        </div>

        {/* ── فورم إضافة عرض (أدمن فقط) ── */}
        {isAdmin && (
          <div className="form-card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>
              <i className="fas fa-plus-circle" style={{ color: NAVY, marginLeft: 6 }}></i>
              {t("promo.addTitle")}
            </h3>
            <form onSubmit={handleAdd}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>

                {/* نوع العرض */}
                <div className="form-group">
                  <label>{t("promo.typeLabel")}</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    style={{ width: "100%" }}
                  >
                    {PROMO_TYPES.map((pt) => (
                      <option key={pt.value} value={pt.value}>{t(pt.labelKey)}</option>
                    ))}
                  </select>
                </div>

                {/* نسبة الخصم (فقط لـ percent) */}
                {form.type === "percent" && (
                  <div className="form-group">
                    <label>{t("promo.percentLabel")}</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      {PERCENT_OPTIONS.map((p) => (
                        <button
                          key={p} type="button"
                          onClick={() => setForm({ ...form, value: String(p) })}
                          style={{
                            padding: "4px 10px", fontSize: 12, fontWeight: 800,
                            border: `2px solid ${parseFloat(form.value) === p ? NAVY : "#e2e8f0"}`,
                            borderRadius: 20,
                            background: parseFloat(form.value) === p ? NAVY : "white",
                            color: parseFloat(form.value) === p ? "white" : "#475569",
                            cursor: "pointer",
                          }}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                    <input
                      type="number" min="1" max="80" step="1"
                      placeholder="أو أكتب نسبة..."
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                    />
                  </div>
                )}

                {/* القسم */}
                <div className="form-group">
                  <label>{t("promo.categoryLabel")}</label>
                  {catOptions.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{t("promo.noCats")}</p>
                  ) : (
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      style={{ width: "100%" }}
                      required
                    >
                      <option value="">— {t("promo.selectCat")} —</option>
                      {catOptions.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* تاريخ البداية */}
                <div className="form-group">
                  <label>{t("promo.startDate")}</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                  />
                </div>

                {/* تاريخ النهاية */}
                <div className="form-group">
                  <label>{t("promo.endDate")}</label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || ""}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{t("promo.endDateHint")}</div>
                </div>

                {/* تفعيل */}
                <div className="form-group" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={!!form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: NAVY }}
                    />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{t("promo.activateNow")}</span>
                  </label>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{t("promo.activateHint")}</div>
                </div>
              </div>

              {formError && (
                <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 700, marginTop: 8, padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>
                  ⚠️ {formError}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving || !form.categoryId}
                  style={{ background: NAVY, minWidth: 140 }}
                >
                  {saving ? t("common.saving") : t("promo.save")}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── قائمة العروض ── */}
        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-tags" style={{ color: NAVY }}></i> {t("promo.listTitle")}</h3>
            <span className="table-count">{promotions.length}</span>
          </div>

          {promotions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><i className="fas fa-percent"></i></div>
              <p>{t("promo.empty")}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>{t("promo.thType")}</th>
                    <th>{t("promo.thCategory")}</th>
                    <th>{t("promo.thValue")}</th>
                    <th>{t("promo.thPeriod")}</th>
                    <th>{t("promo.thStatus")}</th>
                    {isAdmin && <th>{t("common.actions")}</th>}
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promo) => (
                    <tr key={promo.id}>
                      {/* نوع العرض */}
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>
                          {promo.type === "bogo"  && "🎁 "}
                          {promo.type === "bogo2" && "🎁🎁 "}
                          {promo.type === "percent" && "% "}
                          {promoTypeLabel(promo.type)}
                        </span>
                      </td>
                      {/* القسم */}
                      <td style={{ fontWeight: 700, color: NAVY }}>{promo.categoryName || promo.categoryId}</td>
                      {/* القيمة */}
                      <td>
                        {promo.type === "percent"
                          ? <span style={{ fontWeight: 800, color: "#059669", fontSize: 15 }}>{promo.value}%</span>
                          : <span style={{ fontWeight: 700, color: "#7c3aed" }}>
                              {promo.type === "bogo" ? t("promo.typeBogo") : t("promo.typeBogo2")}
                            </span>
                        }
                      </td>
                      {/* الفترة */}
                      <td style={{ fontSize: 12, color: "#64748b" }}>
                        {promo.startDate || "—"}
                        {promo.endDate ? ` → ${promo.endDate}` : ` → ${t("promo.noEnd")}`}
                      </td>
                      {/* الحالة */}
                      <td>{promoStatusBadge(promo)}</td>
                      {/* أزرار */}
                      {isAdmin && (
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            {/* تفعيل / إيقاف */}
                            <button
                              onClick={() => toggleActive(promo)}
                              className={promo.active ? "btn-secondary btn-sm" : "btn-success btn-sm"}
                              title={promo.active ? t("promo.deactivate") : t("promo.activate")}
                            >
                              <i className={`fas ${promo.active ? "fa-pause" : "fa-play"}`}></i>
                            </button>
                            {/* حذف */}
                            <button
                              onClick={() => handleDelete(promo)}
                              className="btn-danger btn-sm"
                              title={t("common.delete")}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── مفتاح الأقسام ── */}
        {catOptions.length === 0 && (
          <div style={{
            marginTop: 16, padding: "14px 16px",
            background: "#fffbeb", border: "2px dashed #f59e0b",
            borderRadius: 12, fontSize: 13, color: "#92400e",
          }}>
            <strong>⚠️ {t("promo.noCatsWarning")}</strong>
            <div style={{ marginTop: 4 }}>{t("promo.noCatsHint")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
