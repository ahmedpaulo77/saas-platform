// src/pages/Biometric.jsx - البصمة (موارد بشرية)
// إدارة أجهزة البصمة (هوست/بورت/commKey) + زرار سحب اللوجات.
// السحب نفسه يتم عبر Cloud Function باسم pullBiometricLogs (تُركب لاحقاً مع الجهاز) —
// الصفحة جاهزة وتتعامل مع غياب الخدمة برسالة واضحة بدل ما تضرب.
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";

async function callPullFunction(device) {
  // تحميل كسول عشان الصفحة متتكسرش لو حزمة functions مش متاحة
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const functions = getFunctions(db.app);
  const pull = httpsCallable(functions, "pullBiometricLogs");
  const res = await pull({
    deviceId: device.id,
    host: device.host,
    port: parseInt(device.port) || 4370,
    commKey: device.commKey || "",
  });
  return res?.data || {};
}

export default function Biometric() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);

  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", host: "", port: "4370", commKey: "" });
  const [editing, setEditing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pullingId, setPullingId] = useState(null);
  const [pullMsg, setPullMsg] = useState(null); // { ok, text }

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [devSnap, empSnap] = await Promise.all([
        getDocs(getScopedQuery("biometric_devices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const data = devSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setDevices(data);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // عدد الموظفين المربوطين بكود بصمة (جاهزية الربط)
  const linkedCount = employees.filter((e) => String(e.bioCode || "").trim()).length;

  async function addDevice(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "biometric_devices"), {
        name: form.name.trim(),
        host: form.host.trim(),
        port: String(parseInt(form.port) || 4370),
        commKey: (form.commKey || "").trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await logActivity({
        actionType: "CREATE",
        collectionName: "biometric_devices",
        itemId: docRef.id,
        details: `Added biometric device: ${form.name.trim()} @ ${form.host.trim()}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setForm({ name: "", host: "", port: "4370", commKey: "" });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function updateDevice(e) {
    e.preventDefault();
    if (!editing.name.trim() || !editing.host.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    try {
      await updateDoc(doc(db, "biometric_devices", editing.id), {
        name: editing.name.trim(),
        host: editing.host.trim(),
        port: String(parseInt(editing.port) || 4370),
        commKey: (editing.commKey || "").trim(),
      });
      await logActivity({
        actionType: "UPDATE",
        collectionName: "biometric_devices",
        itemId: editing.id,
        details: `Updated biometric device: ${editing.name.trim()}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setShowEditModal(false);
      setEditing(null);
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function deleteDevice(id, label) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "biometric_devices", id));
      await logActivity({
        actionType: "DELETE",
        collectionName: "biometric_devices",
        itemId: id,
        details: `Deleted biometric device: ${label}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  async function pullLogs(device) {
    setPullingId(device.id);
    setPullMsg(null);
    try {
      const data = await callPullFunction(device);
      const count = parseInt(data?.imported ?? data?.count) || 0;
      await updateDoc(doc(db, "biometric_devices", device.id), {
        lastSyncAt: new Date().toISOString(),
        lastSyncCount: count,
        lastSyncError: "",
      });
      setPullMsg({ ok: true, text: t("bio.pullOk", { n: count }) });
      await fetchAll();
    } catch (err) {
      console.error(err);
      const msg = String(err?.code || err?.message || "");
      const notReady = msg.includes("not-found") || msg.includes("unimplemented") || msg.includes("internal");
      try {
        await updateDoc(doc(db, "biometric_devices", device.id), {
          lastSyncAt: new Date().toISOString(),
          lastSyncCount: 0,
          lastSyncError: notReady ? "service-missing" : msg.slice(0, 200),
        });
      } catch { /* ignore */ }
      setPullMsg({ ok: false, text: notReady ? t("bio.serviceMissing") : t("bio.pullFail") });
      await fetchAll();
    }
    setPullingId(null);
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
              <i className="fas fa-fingerprint" style={{ color: "#7c3aed", marginLeft: 10 }}></i>
              {t("bio.title")}
            </h1>
            <p className="subtitle">{t("bio.subtitle")}</p>
          </div>
        </div>

        <div className="form-card" style={{ border: "1px solid #c4b5fd", background: "#faf5ff", marginBottom: 20 }}>
          <div style={{ fontSize: 13, lineHeight: 2, color: "#5b21b6" }}>
            <div>1️⃣ {t("bio.req1")}</div>
            <div>2️⃣ {t("bio.req2")}</div>
            <div>3️⃣ {t("bio.req3")}</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>
              🔗 {t("bio.linked")}: {linkedCount} / {employees.length}
            </div>
          </div>
        </div>

        {pullMsg && (
          <div
            style={{
              background: pullMsg.ok ? "#f0fdf4" : "#fef2f2",
              border: pullMsg.ok ? "1px solid #86efac" : "1px solid #fecaca",
              color: pullMsg.ok ? "#15803d" : "#dc2626",
              borderRadius: 12,
              padding: "10px 16px",
              marginBottom: 16,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {pullMsg.ok ? "✅ " : "⚠️ "}{pullMsg.text}
          </div>
        )}

        <div className="form-card" style={{ borderTop: "4px solid #7c3aed" }}>
          <h3>
            <i className="fas fa-plus-circle" style={{ color: "#7c3aed" }}></i>
            {" "}{t("bio.add")}
          </h3>
          <form onSubmit={addDevice}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("bio.devName")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("bio.devNamePh")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("bio.host")} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder={t("bio.hostPh")}
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  required
                  style={{ width: "100%", boxSizing: "border-box", direction: "ltr" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("bio.port")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="65535"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", direction: "ltr" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6, fontWeight: 600 }}>
                  {t("bio.commKey")}
                </label>
                <input
                  type="text"
                  value={form.commKey}
                  onChange={(e) => setForm({ ...form, commKey: e.target.value })}
                  style={{ width: "100%", boxSizing: "border-box", direction: "ltr" }}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn-primary">
                <i className="fas fa-plus"></i> {t("bio.add")}
              </button>
            </div>
          </form>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-list"></i> {t("bio.list")}
            </h3>
            <span className="table-count">{devices.length}</span>
          </div>
          <div className="table-wrapper" style={{ overflowX: "auto" }}>
            <Pagination
              data={devices}
              pageSize={10}
              resetKey=""
              empty={
                <div className="table-empty">
                  <i className="fas fa-fingerprint"></i>
                  <p>{t("bio.empty")}</p>
                </div>
              }
              render={(pageItems, total, start) => (
                <table style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("bio.devName")}</th>
                      <th>{t("bio.host")}</th>
                      <th>{t("bio.lastSync")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((d, i) => (
                      <tr key={d.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{d.name}</td>
                        <td style={{ direction: "ltr", fontFamily: "monospace", fontSize: 12 }}>
                          {d.host}:{d.port || 4370}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {d.lastSyncAt ? (
                            <>
                              <div>{String(d.lastSyncAt).slice(0, 16).replace("T", " ")}</div>
                              <div style={{ color: (d.lastSyncCount || 0) > 0 ? "#059669" : "#64748b", fontWeight: 700 }}>
                                {d.lastSyncError === "service-missing" ? t("bio.serviceMissing") : `${d.lastSyncCount || 0} ✓`}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => pullLogs(d)}
                              className="btn-primary btn-sm"
                              title={t("bio.pull")}
                              disabled={pullingId === d.id}
                            >
                              <i className={`fas ${pullingId === d.id ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                              {" "}{t("bio.pull")}
                            </button>
                            <button
                              onClick={() => {
                                setEditing({ ...d });
                                setShowEditModal(true);
                              }}
                              className="btn-sm btn-secondary"
                              title={t("common.edit")}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            {userCanDelete && (
                              <button
                                onClick={() => deleteDevice(d.id, d.name)}
                                className="btn-danger btn-sm"
                                title={t("common.delete")}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            />
          </div>
        </div>

        {showEditModal && editing && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  <i className="fas fa-edit" style={{ color: "#7c3aed" }}></i> {t("bio.editTitle")}
                </h3>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  ×
                </button>
              </div>
              <form onSubmit={updateDevice}>
                <div className="modal-body">
                  <div className="form-group">
                    <label>{t("bio.devName")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      value={editing.name || ""}
                      required
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t("bio.host")} <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                      type="text"
                      value={editing.host || ""}
                      required
                      onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                      style={{ direction: "ltr" }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label>{t("bio.port")}</label>
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={editing.port || "4370"}
                        onChange={(e) => setEditing({ ...editing, port: e.target.value })}
                        style={{ direction: "ltr" }}
                      />
                    </div>
                    <div className="form-group">
                      <label>{t("bio.commKey")}</label>
                      <input
                        type="text"
                        value={editing.commKey || ""}
                        onChange={(e) => setEditing({ ...editing, commKey: e.target.value })}
                        style={{ direction: "ltr" }}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="btn-primary">
                    <i className="fas fa-save"></i> {t("common.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
