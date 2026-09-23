// src/pages/DailyPrices.js - تعديل سعر اليوم لكل الأصناف في شاشة واحدة (تاجر فقط)
import React, { useState, useEffect, useCallback } from "react";
import { getDocs, writeBatch, doc, updateDoc } from "firebase/firestore";import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import { getProductUnit, TRADER_UNITS } from "../utils/traderUnits";
import { logActivity } from "../utils/auditLogger";
import * as XLSX from "xlsx";

export default function DailyPrices() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [importing, setImporting] = useState(false);

  // alias for task spec compatibility (products / fetchProducts)
  const products = rows;

  const fetchProducts = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId, currentUser?.uid)
      );
      const data = snap.docs.map((d) => {
        const p = d.data();
        return {
          id: d.id,
          name: p.name || "",
          category: p.category || "",
          unit: getProductUnit(p),
          originalPrice: parseFloat(p.price) || 0,
          price: p.price != null ? String(p.price) : "",
        };
      });
      data.sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
      setRows(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.category || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const changed = rows.filter((r) => parseFloat(r.price) !== r.originalPrice);

  function downloadTemplate() {
    const data = products.map((p) => ({
      name: p.name || "",
      price: parseFloat(p.price) || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ name: "مثال", price: 0 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Prices");
    XLSX.writeFile(wb, "daily-prices-template.xlsx");
  }

  async function handleImport(e) {
    const file = e.target.files?.[0];
    // reset input to allow re-selecting same file
    if (e.target) e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);
      if (json.length === 0) {
        alert("الملف فارغ");
        return;
      }
      // build lookup maps by id and by lower-cased name
      const byId = {};
      const byName = {};
      products.forEach((p) => {
        byId[String(p.id).trim()] = p;
        byName[String(p.name).trim().toLowerCase()] = p;
      });
      let updated = 0;
      const notFound = [];
      const now = new Date().toISOString();
      const batchPromises = [];

      for (const row of json) {
        // support columns: name / price (case-insensitive) + Arabic header + id
        const rawName = String(row["name"] ?? row["Name"] ?? row["NAME"] ?? row["الاسم"] ?? row["اسم المنتج"] ?? "").trim();
        const rawId = String(row["id"] ?? row["ID"] ?? row["Id"] ?? row["productId"] ?? row["product_id"] ?? "").trim();
        const rawPriceVal = row["price"] ?? row["Price"] ?? row["PRICE"] ?? row["السعر"] ?? row["سعر البيع"] ?? row["price "] ?? row[" Price"];
        const price = parseFloat(rawPriceVal);
        if (isNaN(price) || price < 0) continue;

        let prod = null;
        if (rawId && byId[rawId]) prod = byId[rawId];
        else if (rawName && byName[rawName.toLowerCase()]) prod = byName[rawName.toLowerCase()];

        if (!prod) {
          notFound.push(rawName || rawId || "—");
          continue;
        }
        // update via updateDoc in batch (collect promises and await together)
        batchPromises.push(
          updateDoc(doc(db, "inventory", prod.id), {
            price: price,
            priceUpdatedAt: now,
          })
        );
        updated++;
      }

      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
        await logActivity({
          actionType: "UPDATE",
          collectionName: "inventory",
          itemId: "bulk-prices-import",
          details: `Excel import: updated ${updated} prices, ${notFound.length} not found`,
          user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
        });
        await fetchProducts();
      }
      // toast feedback (using alert as fallback for toast)
      alert(`تم تحديث ${updated} سعر${notFound.length ? `\nغير موجود (${notFound.length}): ${notFound.slice(0, 10).join("، ")}${notFound.length > 10 ? "..." : ""}` : ""}`);
      if (updated === 0 && notFound.length > 0) {
        console.warn("Import: no matches", notFound);
      }
    } catch (err) {
      console.error(err);
      alert("تعذر قراءة الملف — تأكد أن الملف Excel بعناوين: name, price");
    } finally {
      setImporting(false);
    }
  }

  async function saveAll(e) {
    e.preventDefault();
    if (changed.length === 0) {
      alert(t("trader.prices.noChanges"));
      return;
    }
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      changed.forEach((r) => {
        batch.update(doc(db, "inventory", r.id), {
          price: parseFloat(r.price) || 0,
          priceUpdatedAt: now,
        });
      });
      await batch.commit();
      await logActivity({
        actionType: "UPDATE",
        collectionName: "inventory",
        itemId: "bulk-prices",
        details: `Updated daily prices for ${changed.length} products`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchProducts();
      alert(t("trader.prices.saved"));
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div className="loading">
            <div className="spinner"></div>
            {t("common.loading")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div className="header">
          <div>
            <h1>
              <i className="fas fa-tags" style={{ color: "#f59e0b", marginLeft: 10 }}></i>
              {t("trader.prices.title")}
            </h1>
            <p className="subtitle">{t("trader.prices.subtitle")}</p>
          </div>
        </div>

        <form onSubmit={saveAll}>
          <div className="filter-bar">
            <div className="search-wrapper" style={{ flex: 1 }}>
              <i className="fas fa-search search-icon"></i>
              <input
                type="text"
                placeholder={t("trader.prices.search")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button type="button" onClick={downloadTemplate} className="btn-secondary">
              <i className="fas fa-download"></i> تحميل النموذج
            </button>
            <label
              className="btn-secondary"
              style={{ cursor: importing ? "wait" : "pointer", opacity: importing ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6, margin: 0 }}
            >
              <i className="fas fa-file-excel"></i> {importing ? "جاري..." : "استيراد Excel"}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} disabled={importing} style={{ display: "none" }} />
            </label>
            <button type="submit" className="btn-primary" disabled={saving || changed.length === 0}>
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> {t("common.saving")}
                </>
              ) : (
                <>
                  <i className="fas fa-save"></i> {t("trader.prices.saveAll")} ({changed.length})
                </>
              )}
            </button>
          </div>

          <div className="table-container">
            <div className="table-header">
              <h3>
                <i className="fas fa-list"></i> {t("trader.prices.list")}
              </h3>
              <span className="table-count">
                {filtered.length} {t("inv.products")}
              </span>
            </div>
            {filtered.length === 0 ? (
              <p style={{ textAlign: "center", padding: 20, color: "#999" }}>{t("inv.empty")}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("inv.name")}</th>
                    <th>{t("inv.category")}</th>
                    <th>{t("trader.unit")}</th>
                    <th>{t("trader.prices.old")}</th>
                    <th>{t("trader.prices.today")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const dirty = parseFloat(row.price) !== row.originalPrice;
                    const unitCfg = TRADER_UNITS.find((u) => u.value === row.unit);
                    return (
                      <tr key={row.id} style={dirty ? { background: "#fffbeb" } : undefined}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{row.name}</td>
                        <td>{row.category || "—"}</td>
                        <td>{unitCfg ? t(unitCfg.labelKey) : row.unit}</td>
                        <td>
                          {row.originalPrice.toLocaleString()} {t("currency")}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.price}
                            onChange={(e) => {
                              const price = e.target.value;
                              setRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, price } : r))
                              );
                            }}
                            style={{
                              width: 130,
                              padding: "8px 10px",
                              border: dirty ? "2px solid #f59e0b" : "2px solid #e2e8f0",
                              borderRadius: 8,
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
