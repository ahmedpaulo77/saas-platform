// src/pages/Biometric.jsx - البصمة (موارد بشرية)
// 1) أجهزة: الاسم في مستند عام، وبيانات الاتصال (هوست/بورت/مفتاح) في مستند منفصل
//    مقفول للأدمن فقط — الصفحة تبعت رقم الجهاز بس لأي خدمة خلفية.
// 2) استيراد ملف المكنة (Excel/CSV) — يشتغل من غير IP.
// 3) سجل خام لكل بصمة + منع تكرار + قايمة أكواد غير مربوطة + احتساب حضور.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  deleteField,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, canDelete } from "../utils/companyQuery.js";
import { logActivity } from "../utils/auditLogger.js";
import { logHr } from "../utils/hrAudit.js";
import Sidebar from "../components/common/Sidebar.js";
import Pagination from "../components/common/Pagination.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import {
  parseImportFile,
  detectColumns,
  normalizeRow,
  makeDedupeKey,
  computeWorkDate,
  deviceSkewMinutes,
} from "../utils/biometric.js";

async function callPullFunction(deviceId) {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const pull = httpsCallable(getFunctions(db.app), "pullBiometricLogs");
  const res = await pull({ deviceId });
  return res?.data || {};
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function Biometric() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const userCanDelete = canDelete(userRole);
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const [devices, setDevices] = useState([]);
  const [secrets, setSecrets] = useState({});
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ name: "", host: "", port: "4370", commKey: "" });
  const [editing, setEditing] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [pullingId, setPullingId] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text }

  // الاستيراد من ملف
  const [impHeaders, setImpHeaders] = useState([]);
  const [impRows, setImpRows] = useState([]);
  const [impMapping, setImpMapping] = useState({ code: -1, date: -1, time: -1, datetime: -1, name: -1 });
  const [impDeviceId, setImpDeviceId] = useState("");
  const [importing, setImporting] = useState(false);

  const [recomputing, setRecomputing] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userCompanyId) {
      setLoading(false);
      return;
    }
    try {
      const [devSnap, empSnap, shiftSnap] = await Promise.all([
        getDocs(getScopedQuery("biometric_devices", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("employees", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("shifts", userRole, userCompanyId, currentUser?.uid)).catch(() => ({ docs: [] })),
      ]);
      const data = devSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      setDevices(data);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      // الأسرار للأدمن فقط (القواعد ترفض غيره)
      if (isAdmin) {
        try {
          const secSnap = await getDocs(
            getScopedQuery("biometric_secrets", userRole, userCompanyId, currentUser?.uid)
          );
          const map = {};
          secSnap.docs.forEach((d) => { map[d.id] = d.data(); });
          setSecrets(map);
        } catch { setSecrets({}); }
      } else {
        setSecrets({});
      }
      // أحدث 500 بصمة (للأكواد غير المربوطة + فرق الساعة)
      try {
        const logSnap = await getDocs(
          query(
            collection(db, "biometric_logs"),
            where("companyId", "==", userCompanyId),
            orderBy("deviceTime", "desc"),
            limit(500)
          )
        );
        setRecentLogs(logSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setRecentLogs([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid, isAdmin]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const linkedCount = employees.filter((e) => String(e.bioCode || "").trim()).length;

  const codeToEmp = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      const c = String(e.bioCode || "").trim();
      if (c && !map[c]) map[c] = e;
    });
    return map;
  }, [employees]);

  const shiftMap = useMemo(() => {
    const map = {};
    shifts.forEach((s) => { map[s.id] = s; });
    return map;
  }, [shifts]);

  // أكواد غير مربوطة من أحدث اللوجات
  const unlinked = useMemo(() => {
    const map = {};
    recentLogs.forEach((l) => {
      const code = String(l.code || "").trim();
      if (!code || codeToEmp[code]) return;
      if (!map[code]) map[code] = { code, count: 0, last: "", name: l.name || "" };
      map[code].count += 1;
      if ((l.deviceTime || "") > (map[code].last || "")) {
        map[code].last = l.deviceTime;
        map[code].name = l.name || map[code].name;
      }
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [recentLogs, codeToEmp]);

  // فرق ساعة الجهاز (من أحدث بصمة)
  const skew = useMemo(() => {
    if (recentLogs.length === 0) return 0;
    return deviceSkewMinutes(recentLogs[0].deviceTime, new Date().toISOString());
  }, [recentLogs]);

  function secretOf(d) {
    return secrets[d.id] || { host: d.host || "", port: d.port || "4370", commKey: d.commKey || "" };
  }

  async function saveSecrets(deviceId, { host, port, commKey }) {
    await setDoc(doc(db, "biometric_secrets", deviceId), {
      host: (host || "").trim(),
      port: String(parseInt(port) || 4370),
      commKey: (commKey || "").trim(),
      companyId: userCompanyId,
      updatedAt: new Date().toISOString(),
    });
  }

  async function addDevice(e) {
    e.preventDefault();
    if (!isAdmin || !form.name.trim() || !form.host.trim()) {
      if (!isAdmin) return;
      alert(t("common.fillRequired"));
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "biometric_devices"), {
        name: form.name.trim(),
        companyId: userCompanyId,
        createdBy: currentUser?.uid || null,
        createdAt: new Date().toISOString(),
      });
      await saveSecrets(docRef.id, form);
      await logActivity({
        actionType: "CREATE",
        collectionName: "biometric_devices",
        itemId: docRef.id,
        details: `Added biometric device: ${form.name.trim()}`,
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
    if (!isAdmin || !editing.name.trim() || !editing.host.trim()) {
      if (!isAdmin) return;
      alert(t("common.fillRequired"));
      return;
    }
    try {
      await updateDoc(doc(db, "biometric_devices", editing.id), { name: editing.name.trim() });
      await saveSecrets(editing.id, editing);
      // تنظيف الحقول القديمة لو كانت لسه في مستند الجهاز (ترحيل)
      try {
        await updateDoc(doc(db, "biometric_devices", editing.id), {
          host: deleteField(),
          port: deleteField(),
          commKey: deleteField(),
        });
      } catch { /* ignore */ }
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

  async function deleteDevice(device) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "biometric_devices", device.id));
      try {
        await deleteDoc(doc(db, "biometric_secrets", device.id));
      } catch { /* ignore */ }
      await logActivity({
        actionType: "DELETE",
        collectionName: "biometric_devices",
        itemId: device.id,
        details: `Deleted biometric device: ${device.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
  }

  // السحب المباشر — يبعت رقم الجهاز بس (البيانات تُقرأ من السيرفر وتتحقق الأدمنية هناك)
  async function pullLogs(device) {
    if (!isAdmin) {
      setNotice({ ok: false, text: t("bio.adminOnlyPull") });
      return;
    }
    setPullingId(device.id);
    setNotice(null);
    try {
      const data = await callPullFunction(device.id);
      const count = parseInt(data?.imported ?? data?.count) || 0;
      await updateDoc(doc(db, "biometric_devices", device.id), {
        lastSyncAt: new Date().toISOString(),
        lastSyncCount: count,
        lastSyncError: "",
      });
      setNotice({ ok: true, text: t("bio.pullOk", { n: count }) });
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
      setNotice({ ok: false, text: notReady ? t("bio.serviceMissing") : t("bio.pullFail") });
      await fetchAll();
    }
    setPullingId(null);
  }

  // ── الاستيراد من ملف ──
  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    try {
      const { headers, rows } = await parseImportFile(file);
      setImpHeaders(headers);
      setImpRows(rows);
      setImpMapping(detectColumns(headers));
    } catch {
      setNotice({ ok: false, text: t("bio.importFail") });
      setImpHeaders([]);
      setImpRows([]);
    }
  }

  const impPreview = useMemo(() => {
    if (impRows.length === 0 || impMapping.code < 0) return [];
    const out = [];
    for (const row of impRows) {
      if (out.length >= 10) break;
      const n = normalizeRow(row, impMapping);
      if (n) out.push(n);
    }
    return out;
  }, [impRows, impMapping]);

  async function doImport() {
    if (impRows.length === 0 || impMapping.code < 0 || importing) return;
    setImporting(true);
    try {
      const sourceId = impDeviceId || "file";
      const normalized = [];
      for (const row of impRows) {
        const n = normalizeRow(row, impMapping);
        if (n) normalized.push(n);
      }
      // إسقاط المكرر داخل الملف نفسه أولاً
      const seen = new Set();
      const unique = normalized.filter((n) => {
        const k = makeDedupeKey(userCompanyId, sourceId, n.code, n.deviceTime);
        if (seen.has(k)) return false;
        seen.add(k);
        n._key = k;
        return true;
      });
      // إسقاط الموجود في السيرفر (دفعات 30)
      const existing = new Set();
      for (const part of chunk([...seen], 30)) {
        const snap = await getDocs(
          query(collection(db, "biometric_logs"), where("dedupeKey", "in", part))
        );
        snap.docs.forEach((d) => existing.add(d.data()?.dedupeKey));
      }
      const fresh = unique.filter((n) => !existing.has(n._key));
      const now = new Date().toISOString();
      for (const part of chunk(fresh, 400)) {
        const batch = writeBatch(db);
        part.forEach((n) => {
          batch.set(doc(collection(db, "biometric_logs")), {
            deviceId: impDeviceId || null,
            source: impDeviceId ? "device" : "file",
            code: n.code,
            name: n.name || "",
            deviceTime: n.deviceTime,
            deviceDate: n.deviceDate,
            deviceClock: n.deviceClock,
            serverTime: now,
            dedupeKey: n._key,
            companyId: userCompanyId,
            createdBy: currentUser?.uid || null,
            createdAt: now,
          });
        });
        await batch.commit();
      }
      await logHr({
        action: "create", entity: "attendance", refId: null,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNotice({ ok: true, text: t("bio.imported", { n: fresh.length, s: unique.length - fresh.length }) });
      setImpHeaders([]);
      setImpRows([]);
      setImpDeviceId("");
      await fetchAll();
    } catch (err) {
      console.error(err);
      setNotice({ ok: false, text: t("bio.importFail") });
    }
    setImporting(false);
  }

  // ── احتساب الحضور من السجل الخام ──
  async function recompute() {
    if (!isAdmin || recomputing) return;
    setRecomputing(true);
    setNotice(null);
    try {
      const snap = await getDocs(
        query(
          collection(db, "biometric_logs"),
          where("companyId", "==", userCompanyId),
          orderBy("deviceTime", "desc"),
          limit(2000)
        )
      );
      const logs = snap.docs.map((d) => d.data());
      // تجميع: موظف ← يوم عمل (مع ورديات الليل)
      const groups = {};
      let unlinkedCount = 0;
      logs.forEach((l) => {
        const code = String(l.code || "").trim();
        const emp = codeToEmp[code];
        if (!emp) {
          unlinkedCount += 1;
          return;
        }
        const workDate = computeWorkDate(l.deviceTime, shiftMap[emp.shiftId]);
        if (!workDate) return;
        const gk = `${emp.id}|${workDate}`;
        if (!groups[gk]) groups[gk] = { emp, workDate, clocks: [] };
        if (l.deviceClock) groups[gk].clocks.push(l.deviceClock);
      });
      let created = 0;
      let updated = 0;
      for (const gk of Object.keys(groups)) {
        const g = groups[gk];
        if (g.clocks.length === 0) continue;
        g.clocks.sort();
        const checkIn = g.clocks[0];
        const checkOut = g.clocks[g.clocks.length - 1] !== checkIn ? g.clocks[g.clocks.length - 1] : "";
        const q = query(
          collection(db, "attendance"),
          where("companyId", "==", userCompanyId),
          where("employeeId", "==", g.emp.id),
          where("date", "==", g.workDate)
        );
        const existing = await getDocs(q);
        if (existing.empty) {
          await addDoc(collection(db, "attendance"), {
            employeeId: g.emp.id,
            employeeName: g.emp.name || "",
            date: g.workDate,
            checkIn,
            checkOut,
            fromBiometric: true,
            companyId: userCompanyId,
            createdBy: currentUser?.uid || null,
            createdAt: new Date().toISOString(),
          });
          created += 1;
        } else {
          const cur = existing.docs[0].data() || {};
          const patch = {};
          if (checkIn && (!cur.checkIn || checkIn < cur.checkIn)) patch.checkIn = checkIn;
          if (checkOut && (!cur.checkOut || checkOut > cur.checkOut)) patch.checkOut = checkOut;
          if (Object.keys(patch).length > 0) {
            await updateDoc(doc(db, "attendance", existing.docs[0].id), patch);
            updated += 1;
          }
        }
      }
      await logHr({
        action: "save", entity: "attendance", refId: null,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      setNotice({ ok: true, text: t("bio.recomputed", { c: created, e: updated }) });
      await fetchAll();
    } catch (err) {
      console.error(err);
      setNotice({ ok: false, text: t("common.errorGeneric") });
    }
    setRecomputing(false);
  }

  function setMap(field, idx) {
    setImpMapping((prev) => ({ ...prev, [field]: parseInt(idx, 10) }));
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge" style={{ background: "#ede9fe", color: "#6d28d9" }}>
              {t("bio.rawCount")}: {recentLogs.length}
            </span>
            {isAdmin && (
              <button onClick={recompute} className="btn-primary btn-sm" disabled={recomputing}>
                <i className={`fas ${recomputing ? "fa-spinner fa-spin" : "fa-calculator"}`}></i>
                {" "}{t("bio.recompute")}
              </button>
            )}
          </div>
        </div>

        <div className="form-card" style={{ border: "1px solid #c4b5fd", background: "#faf5ff", marginBottom: 20 }}>
          <div style={{ fontSize: 13, lineHeight: 2, color: "#5b21b6" }}>
            <div>1️⃣ {t("bio.req1")}</div>
            <div>2️⃣ {t("bio.req2")}</div>
            <div>3️⃣ {t("bio.req3")}</div>
            <div>4️⃣ {t("bio.req4")}</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>
              🔗 {t("bio.linked")}: {linkedCount} / {employees.length}
            </div>
            {isAdmin && (
              <div style={{ marginTop: 4, fontSize: 12, color: "#7c3aed" }}>
                🔒 {t("bio.secretsNote")}
              </div>
            )}
          </div>
        </div>

        {Math.abs(skew) > 15 && (
          <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", borderRadius: 12, padding: "10px 16px", marginBottom: 16, fontWeight: 700, fontSize: 14 }}>
            {t("bio.skewWarn", { n: Math.abs(skew) })}
          </div>
        )}

        {notice && (
          <div
            style={{
              background: notice.ok ? "#f0fdf4" : "#fef2f2",
              border: notice.ok ? "1px solid #86efac" : "1px solid #fecaca",
              color: notice.ok ? "#15803d" : "#dc2626",
              borderRadius: 12,
              padding: "10px 16px",
              marginBottom: 16,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {notice.ok ? "✅ " : "⚠️ "}{notice.text}
          </div>
        )}

        {/* ── استيراد ملف المكنة ── */}
        <div className="form-card" style={{ borderTop: "4px solid #059669" }}>
          <h3>
            <i className="fas fa-file-import" style={{ color: "#059669" }}></i>
            {" "}{t("bio.import")}
          </h3>
          <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 13 }}>{t("bio.importHint")}</p>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label className="btn-secondary btn-sm" style={{ cursor: "pointer" }}>
              <i className="fas fa-folder-open"></i> {t("bio.pickFile")}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
            {devices.length > 0 && (
              <select
                value={impDeviceId}
                onChange={(e) => setImpDeviceId(e.target.value)}
                title={t("bio.devName")}
              >
                <option value="">{t("bio.sourceFile")}</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{t("bio.sourceDevice")}: {d.name}</option>
                ))}
              </select>
            )}
          </div>

          {impHeaders.length > 0 && (
            <div style={{ marginTop: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>{t("bio.mapTitle")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["code", t("bio.colCode")],
                  ["date", t("bio.colDate")],
                  ["time", t("bio.colTime")],
                  ["datetime", t("bio.colDateTime")],
                  ["name", t("bio.colName")],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4, fontWeight: 700 }}>
                      {label}
                    </label>
                    <select
                      value={impMapping[field]}
                      onChange={(e) => setMap(field, e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }}
                    >
                      <option value={-1}>{t("bio.colNone")}</option>
                      {impHeaders.map((h, i) => (
                        <option key={i} value={i}>{h || `#${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {impPreview.length > 0 && (
                <>
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6, color: "#64748b" }}>
                    {t("bio.preview")} ({impRows.length})
                  </div>
                  <div className="table-wrapper">
                    <table style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th>{t("bio.colCode")}</th>
                          <th>{t("bio.colName")}</th>
                          <th>{t("req.date")}</th>
                          <th>{t("req.checkin")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impPreview.map((n, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: "monospace" }}>{n.code}</td>
                            <td>{n.name || "—"}</td>
                            <td>{n.deviceDate}</td>
                            <td style={{ direction: "ltr", fontFamily: "monospace" }}>{n.deviceClock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <div style={{ marginTop: 12 }}>
                <button onClick={doImport} className="btn-primary btn-sm" disabled={importing || impMapping.code < 0}>
                  <i className={`fas ${importing ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                  {" "}{t("bio.doImport")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── أكواد غير مربوطة ── */}
        <div className="table-container">
          <div className="table-header">
            <h3>
              <i className="fas fa-link-slash" style={{ color: "#b45309" }}></i>
              {" "}{t("bio.unlinked")}
            </h3>
            <span className="table-count">{unlinked.length}</span>
          </div>
          {unlinked.length === 0 ? (
            <div className="table-empty">
              <i className="fas fa-check-circle"></i>
              <p>{t("bio.unlinkedEmpty")}</p>
            </div>
          ) : (
            <>
              <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 12, padding: "0 4px" }}>
                {t("bio.unlinkedHint")}
              </p>
              <div className="table-wrapper" style={{ maxHeight: 240, overflowY: "auto" }}>
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>{t("bio.colCode")}</th>
                      <th>{t("bio.colName")}</th>
                      <th>#</th>
                      <th>{t("bio.lastSync")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlinked.slice(0, 50).map((u) => (
                      <tr key={u.code}>
                        <td style={{ fontFamily: "monospace", fontWeight: 800 }}>{u.code}</td>
                        <td>{u.name || "—"}</td>
                        <td>{u.count}</td>
                        <td style={{ fontSize: 12 }}>{String(u.last || "").slice(0, 16).replace("T", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── الأجهزة ── */}
        {isAdmin && (
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
        )}

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
                      {isAdmin && <th>{t("bio.host")}</th>}
                      <th>{t("bio.lastSync")}</th>
                      <th>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((d, i) => (
                      <tr key={d.id}>
                        <td>{start + i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{d.name}</td>
                        {isAdmin && (
                          <td style={{ direction: "ltr", fontFamily: "monospace", fontSize: 12 }}>
                            {secretOf(d).host || "—"}:{secretOf(d).port || 4370}
                          </td>
                        )}
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
                            {isAdmin && (
                              <button
                                onClick={() => pullLogs(d)}
                                className="btn-primary btn-sm"
                                title={t("bio.pull")}
                                disabled={pullingId === d.id}
                              >
                                <i className={`fas ${pullingId === d.id ? "fa-spinner fa-spin" : "fa-download"}`}></i>
                                {" "}{t("bio.pull")}
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  const s = secretOf(d);
                                  setEditing({ ...d, host: s.host, port: s.port, commKey: s.commKey });
                                  setShowEditModal(true);
                                }}
                                className="btn-sm btn-secondary"
                                title={t("common.edit")}
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                            )}
                            {userCanDelete && (
                              <button
                                onClick={() => deleteDevice(d)}
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
