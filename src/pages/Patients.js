import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, isSuperAdmin } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { fmtDate, moneyShort } from "../utils/fmt.js";
import QRCode from "qrcode";
import { buildVisitSummaryHTML, buildVisitQRText, openSheetPrint } from "../utils/invoiceHelpers.js";

export default function Patients() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  // 🎂 حساب السن من تاريخ الميلاد (عشان السن الثابت بيقدم ويبقى غلط)
  function calcAge(birthDate) {
    if (!birthDate) return "";
    const b = new Date(birthDate + "T00:00:00");
    if (isNaN(b.getTime())) return "";
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age >= 0 ? String(age) : "";
  }
  const [newPatient, setNewPatient] = useState({
    name: "",
    phone: "",
    email: "",
    age: "",
    birthDate: "",
    gender: "male",
    address: "",
    bloodType: "",
    medicalHistory: "",
    allergies: "",
    notes: "",
    companyId: "",
  });
  const [companies, setCompanies] = useState([]);
  const [editingPatient, setEditingPatient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // الملف الطبي — كورسل: تقليب بين ملفات المرضى بزرار يمين/شمال
  // fileList لقطة ثابتة من القائمة وقت الفتح — عشان البحث لو اتغير والملف مفتوح
  // التقليب مينطش لمريض تاني فجأة
  const [filePatient, setFilePatient] = useState(null);
  const [fileIdx, setFileIdx] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [fileData, setFileData] = useState({ appointments: [], prescriptions: [], invoices: [], attachments: [], dental: null, dentalPlan: null, vouchers: [] });
  const [fileLoading, setFileLoading] = useState(false);
  // تبويب القسم المعروض جوه الملف — المحتوى بيتبدل قدامك من غير سكرول لتحت
  const [fileTab, setFileTab] = useState("appointments");
  // نوافذ منبثقة فوق الملف: تفاصيل فاتورة + عرض صورة تحليل مكبرة
  const [fileInv, setFileInv] = useState(null);
  const [fileImg, setFileImg] = useState(null);

  function closeFile() {
    setFilePatient(null);
    setFileIdx(null);
    setFileList([]);
    setFileInv(null);
    setFileImg(null);
  }

  // 🖨️ ورقة المريض من ملفه: أحدث روشتة + أحدث فاتورة + خطة الأسنان + QR في ورقة واحدة
  const [printingSheet, setPrintingSheet] = useState(false);
  async function printFileSheet() {
    if (!filePatient || printingSheet) return;
    setPrintingSheet(true);
    try {
      let comp = null;
      try {
        if (userCompanyId) {
          const cs = await getDoc(doc(db, "companies", userCompanyId));
          if (cs.exists()) comp = { id: cs.id, ...cs.data() };
        }
      } catch (e) { console.warn(e); }
      const rx = fileData.prescriptions[0] || null;
      const inv = fileData.invoices[0] || null;
      const appt = (rx?.appointmentId && fileData.appointments.find((a) => a.id === rx.appointmentId)) || fileData.appointments[0] || null;
      let qr = "";
      try {
        qr = await QRCode.toDataURL(buildVisitQRText({ company: comp, patient: filePatient, appointment: appt, prescription: rx, invoice: inv }), { width: 200, margin: 1 });
      } catch (e) { console.warn("qr:", e?.message); }
      openSheetPrint(buildVisitSummaryHTML({
        company: comp,
        patient: filePatient,
        appointment: appt,
        prescription: rx,
        invoice: inv,
        dentalPlan: fileData.dentalPlan,
        attachments: fileData.attachments || [],
        qrDataUrl: qr,
      }));
    } finally {
      setPrintingSheet(false);
    }
  }

  function goFile(delta) {
    if (fileIdx == null || fileList.length === 0) return;
    const next = (fileIdx + delta + fileList.length) % fileList.length;
    openFile(fileList[next], next, fileList);
  }

  async function openFile(patient, idx = null, list = null) {
    setFilePatient(patient);
    if (idx != null) setFileIdx(idx);
    if (list != null) setFileList(list);
    setFileTab("appointments");
    setFileInv(null);
    setFileImg(null);
    setFileLoading(true);
    setFileData({ appointments: [], prescriptions: [], invoices: [], attachments: [], dental: null, dentalPlan: null, vouchers: [] });
    try {
      const q = (col) => getScopedQuery(col, userRole, userCompanyId, currentUser?.uid);
      const [aSnap, rSnap, iSnap, mSnap, dSnap, pSnap, vSnap] = await Promise.all([
        getDocs(q("appointments")),
        getDocs(q("prescriptions")),
        getDocs(q("invoices")),
        getDocs(q("medical_attachments")),
        getDocs(q("dental_charts")),
        getDocs(q("dental_plans")),
        getDocs(q("vouchers")),
      ]);
      const byPatient = (docs) => docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.patientId === patient.id || x.clientId === patient.id);
      const appointments = byPatient(aSnap.docs).sort((a, b) => new Date((b.date || "") + "T" + (b.time || "00:00")) - new Date((a.date || "") + "T" + (a.time || "00:00")));
      const prescriptions = byPatient(rSnap.docs).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      const invoices = byPatient(iSnap.docs).sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
      const attachments = byPatient(mSnap.docs).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      const dentalList = byPatient(dSnap.docs);
      const planList = byPatient(pSnap.docs);
      // 💰 سندات القبض/الصرف: مربوطة برقم المريض أو باسمه
      const vouchers = vSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.partyId === patient.id || (x.partyName || "") === (patient.name || ""))
        .sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
      setFileData({ appointments, prescriptions, invoices, attachments, dental: dentalList[0] || null, dentalPlan: planList[0] || null, vouchers });
    } catch (e) {
      console.error(e);
    }
    setFileLoading(false);
  }

  const stats = {
    total: patients.length,
    newThisMonth: patients.filter((p) => {
      if (!p.createdAt) return false;
      const d = new Date(p.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    male: patients.filter((p) => p.gender === "male").length,
    female: patients.filter((p) => p.gender === "female").length,
  };

  const fetchPatients = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("patients", userRole, userCompanyId, currentUser?.uid)
      );
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setPatients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchCompanies = useCallback(async () => {
    try {
      if (superAdmin) {
        const snap = await getDocs(collection(db, "companies"));
        const data = [];
        snap.forEach((d) => data.push({ id: d.id, name: d.data().name }));
        setCompanies(data);
      } else if (userCompanyId) {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        setCompanies(snap.exists() ? [{ id: snap.id, name: snap.data().name }] : []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [superAdmin, userCompanyId]);

  useEffect(() => {
    fetchPatients();
    fetchCompanies();
  }, [fetchPatients, fetchCompanies]);

  async function addPatient(e) {
    e.preventDefault();
    const companyId = superAdmin ? newPatient.companyId : userCompanyId;
    if (!newPatient.name || !newPatient.phone || !companyId) {
      alert(t("pat.fillRequired"));
      return;
    }
    try {
      await addDoc(collection(db, "patients"), {
        name: newPatient.name,
        phone: newPatient.phone,
        email: newPatient.email || "",
        // السن محسوب من تاريخ الميلاد لو موجود (وإلا اليدوي)
        age: newPatient.birthDate ? calcAge(newPatient.birthDate) : newPatient.age || "",
        birthDate: newPatient.birthDate || "",
        gender: newPatient.gender,
        address: newPatient.address || "",
        bloodType: newPatient.bloodType || "",
        medicalHistory: newPatient.medicalHistory || "",
        allergies: newPatient.allergies || "",
        notes: newPatient.notes || "",
        totalVisits: 0,
        companyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      setNewPatient({
        name: "",
        phone: "",
        email: "",
        age: "",
        birthDate: "",
        gender: "male",
        address: "",
        bloodType: "",
        medicalHistory: "",
        allergies: "",
        notes: "",
        companyId: superAdmin ? "" : userCompanyId,
      });
      await fetchPatients();
      alert(t("pat.addOk"));
    } catch (e) {
      console.error(e);
      alert(t("pat.addFail"));
    }
  }

  function openEdit(p) {
    setEditingPatient(p);
    setShowEditModal(true);
  }

  function closeEdit() {
    setEditingPatient(null);
    setShowEditModal(false);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingPatient.name || !editingPatient.phone) {
      alert(t("pat.fillRequired"));
      return;
    }
    try {
      await updateDoc(doc(db, "patients", editingPatient.id), {
        name: editingPatient.name,
        phone: editingPatient.phone,
        email: editingPatient.email || "",
        age: editingPatient.birthDate ? calcAge(editingPatient.birthDate) : editingPatient.age || "",
        birthDate: editingPatient.birthDate || "",
        gender: editingPatient.gender,
        address: editingPatient.address || "",
        bloodType: editingPatient.bloodType || "",
        medicalHistory: editingPatient.medicalHistory || "",
        allergies: editingPatient.allergies || "",
        notes: editingPatient.notes || "",
        updatedAt: new Date().toISOString(),
      });
      closeEdit();
      await fetchPatients();
      alert(t("pat.updOk"));
    } catch (e) {
      console.error(e);
      alert(t("pat.updFail"));
    }
  }

  async function delPatient(id) {
    if (!window.confirm(t("pat.delConfirm"))) return;
    try {
      await deleteDoc(doc(db, "patients", id));
      await fetchPatients();
      alert(t("pat.delOk"));
    } catch (e) {
      console.error(e);
      alert(t("pat.delFail"));
    }
  }

  const filtered = patients.filter((p) => {
    const s = searchTerm.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(s) ||
      (p.phone || "").includes(s) ||
      (p.email || "").toLowerCase().includes(s)
    );
  });

  // أسهم الكيبورد للتقليب بين الملفات (يمين/شمال) زي عارض الصور
  useEffect(() => {
    if (filePatient == null || fileIdx == null) return;
    function onKey(e) {
      if (e.key === "ArrowLeft") goFile(1);
      else if (e.key === "ArrowRight") goFile(-1);
      else if (e.key === "Escape") closeFile();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>
        {t("pat.loading")}
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div
          style={{
            background: "linear-gradient(135deg,#059669,#0d9488)",
            borderRadius: "var(--radius)",
            padding: "20px 24px",
            marginBottom: 20,
            color: "white",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            🩺 {t("pat.title")}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            {t("pat.subtitle")}
          </p>
        </div>

        <div className="stats-row">
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-hospital-user"></i></div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("pat.total")}</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-user-plus"></i></div>
            <div className="stat-value">{stats.newThisMonth}</div>
            <div className="stat-label">{t("pat.newThisMonth")}</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon"><i className="fas fa-mars"></i></div>
            <div className="stat-value">{stats.male}</div>
            <div className="stat-label">{t("pat.male")}</div>
          </div>
          <div className="stat-card pink">
            <div className="stat-icon"><i className="fas fa-venus"></i></div>
            <div className="stat-value">{stats.female}</div>
            <div className="stat-label">{t("pat.female")}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            <i className="fas fa-user-plus"></i> {t("pat.add")}
          </h3>
          <form onSubmit={addPatient}>
            <div style={styles.grid}>
              <input
                placeholder={t("pat.phName")}
                value={newPatient.name}
                onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                style={styles.input}
                required
              />
              <input
                placeholder={t("pat.phPhone")}
                value={newPatient.phone}
                onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                style={styles.input}
                required
              />
              <input
                type="email"
                placeholder={t("pat.phEmail")}
                value={newPatient.email}
                onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                style={styles.input}
              />
              <input
                type="number"
                placeholder={newPatient.birthDate ? `السن محسوب: ${calcAge(newPatient.birthDate) || "—"}` : t("pat.phAge")}
                value={newPatient.age}
                onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                style={styles.input}
                disabled={!!newPatient.birthDate}
                title="لو دخلت تاريخ الميلاد السن بيتحسب لوحده"
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>الميلاد:</label>
                <input
                  type="date"
                  value={newPatient.birthDate}
                  onChange={(e) => {
                    const bd = e.target.value;
                    setNewPatient({ ...newPatient, birthDate: bd, age: bd ? calcAge(bd) : newPatient.age });
                  }}
                  style={styles.input}
                />
              </div>
              <select
                value={newPatient.gender}
                onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                style={styles.input}
              >
                <option value="male">{t("pat.male")}</option>
                <option value="female">{t("pat.female")}</option>
              </select>
              <select
                value={newPatient.bloodType}
                onChange={(e) => setNewPatient({ ...newPatient, bloodType: e.target.value })}
                style={styles.input}
              >
                <option value="">{t("pat.phBloodType")}</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
              {superAdmin && (
                <select
                  value={newPatient.companyId}
                  onChange={(e) => setNewPatient({ ...newPatient, companyId: e.target.value })}
                  style={styles.input}
                  required
                >
                  <option value="">{t("cli.chooseCompany")}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <input
                placeholder={t("pat.phAddress")}
                value={newPatient.address}
                onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                style={{ ...styles.input, gridColumn: "1 / -1" }}
              />
              <textarea
                placeholder={t("pat.phHistory")}
                value={newPatient.medicalHistory}
                onChange={(e) => setNewPatient({ ...newPatient, medicalHistory: e.target.value })}
                style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 70 }}
              />
              <textarea
                placeholder={t("pat.phAllergies")}
                value={newPatient.allergies}
                onChange={(e) => setNewPatient({ ...newPatient, allergies: e.target.value })}
                style={{ ...styles.input, minHeight: 70 }}
              />
              <textarea
                placeholder={t("pat.phNotes")}
                value={newPatient.notes}
                onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                style={{ ...styles.input, minHeight: 70 }}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>
              <i className="fas fa-plus"></i> {t("pat.add")}
            </button>
          </form>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("pat.list")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="search-wrapper" style={{ width: 280 }}>
                <i className="fas fa-search search-icon"></i>
                <input type="text" placeholder={t("pat.search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <span className="table-count">{filtered.length}</span>
            </div>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-hospital-user"></i>
                <p>{searchTerm ? t("pat.emptySearch") : t("pat.empty")}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("pat.name")}</th>
                    <th>{t("pat.age")}</th>
                    <th>{t("pat.gender")}</th>
                    <th>{t("common.phone")}</th>
                    <th>{t("pat.bloodType")}</th>
                    <th>{t("pat.totalVisits")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td>{p.birthDate ? calcAge(p.birthDate) : p.age || "—"}</td>
                      <td>
                        {p.gender === "male" ? (
                          <span className="badge badge-active">♂ {t("pat.male")}</span>
                        ) : p.gender === "female" ? (
                          <span className="badge" style={{ background: "#fce7f3", color: "#db2777", border: "1px solid #f9a8d4" }}>♀ {t("pat.female")}</span>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>—</span>
                        )}
                      </td>
                      <td style={{ direction: "ltr" }}>{p.phone}</td>
                      <td>{p.bloodType || "—"}</td>
                      <td>{p.totalVisits || 0}</td>
                      <td>
                        <div className="table-actions">
                          <button onClick={() => openFile(p, i, filtered)} className="btn-primary btn-sm" title="الملف الطبي">
                            <i className="fas fa-folder-open"></i> الملف
                          </button>
                          <button onClick={() => openEdit(p)} className="btn-secondary btn-sm">
                            <i className="fas fa-edit"></i> {t("common.edit")}
                          </button>
                          <button onClick={() => delPatient(p.id)} className="btn-danger btn-sm">
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {showEditModal && editingPatient && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
              <div className="modal-header">
                <h3>{t("pat.editTitle")}</h3>
                <button className="modal-close" onClick={closeEdit}>&times;</button>
              </div>
              <form onSubmit={saveEdit}>
                <div style={styles.grid}>
                  <input placeholder={t("pat.phName")} value={editingPatient.name} onChange={(e) => setEditingPatient({ ...editingPatient, name: e.target.value })} style={styles.input} required />
                  <input placeholder={t("pat.phPhone")} value={editingPatient.phone} onChange={(e) => setEditingPatient({ ...editingPatient, phone: e.target.value })} style={styles.input} required />
                  <input type="email" placeholder={t("pat.phEmail")} value={editingPatient.email || ""} onChange={(e) => setEditingPatient({ ...editingPatient, email: e.target.value })} style={styles.input} />
                  <input type="number" placeholder={editingPatient.birthDate ? `السن محسوب: ${calcAge(editingPatient.birthDate) || "—"}` : t("pat.phAge")} value={editingPatient.age || ""} onChange={(e) => setEditingPatient({ ...editingPatient, age: e.target.value })} style={styles.input} disabled={!!editingPatient.birthDate} />
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <label style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>الميلاد:</label>
                    <input type="date" value={editingPatient.birthDate || ""} onChange={(e) => {
                      const bd = e.target.value;
                      setEditingPatient({ ...editingPatient, birthDate: bd, age: bd ? calcAge(bd) : editingPatient.age });
                    }} style={styles.input} />
                  </div>
                  <select value={editingPatient.gender} onChange={(e) => setEditingPatient({ ...editingPatient, gender: e.target.value })} style={styles.input}>
                    <option value="male">{t("pat.male")}</option>
                    <option value="female">{t("pat.female")}</option>
                  </select>
                  <select value={editingPatient.bloodType || ""} onChange={(e) => setEditingPatient({ ...editingPatient, bloodType: e.target.value })} style={styles.input}>
                    <option value="">{t("pat.phBloodType")}</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                  <input placeholder={t("pat.phAddress")} value={editingPatient.address || ""} onChange={(e) => setEditingPatient({ ...editingPatient, address: e.target.value })} style={{ ...styles.input, gridColumn: "1 / -1" }} />
                  <textarea placeholder={t("pat.phHistory")} value={editingPatient.medicalHistory || ""} onChange={(e) => setEditingPatient({ ...editingPatient, medicalHistory: e.target.value })} style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 70 }} />
                  <textarea placeholder={t("pat.phAllergies")} value={editingPatient.allergies || ""} onChange={(e) => setEditingPatient({ ...editingPatient, allergies: e.target.value })} style={{ ...styles.input, minHeight: 70 }} />
                  <textarea placeholder={t("pat.phNotes")} value={editingPatient.notes || ""} onChange={(e) => setEditingPatient({ ...editingPatient, notes: e.target.value })} style={{ ...styles.input, minHeight: 70 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={closeEdit}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary">{t("common.saveEdits")}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── الملف الطبي (كورسل: تقليب يمين/شمال بين المرضى) ── */}
        {filePatient && (
          <>
          <div className="modal-backdrop" onClick={closeFile}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1080, width: "100%" }}>
              <div className="modal-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="btn-secondary btn-sm" onClick={() => goFile(-1)} disabled={fileList.length < 2} title="المريض السابق (←)">
                  <i className="fas fa-chevron-right"></i>
                </button>
                <h3 style={{ flex: 1, margin: 0 }}><i className="fas fa-folder-open" style={{ color: "#2563eb" }}></i> الملف الطبي — {filePatient.name}</h3>
                {fileIdx != null && fileList.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b", whiteSpace: "nowrap" }}>{fileIdx + 1} / {fileList.length}</span>
                )}
                <button className="btn-secondary btn-sm" onClick={() => goFile(1)} disabled={fileList.length < 2} title="المريض التالي (→)">
                  <i className="fas fa-chevron-left"></i>
                </button>
                <button onClick={printFileSheet} title="ورقة المريض: روشتة + حساب + خطة أسنان في ورقة واحدة" style={{ background: "#0d9488", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  🖨️ ورقة المريض
                </button>
                <button className="modal-close" onClick={closeFile}>&times;</button>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 13, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
                <div>🩸 الفصيلة: <strong>{filePatient.bloodType || "—"}</strong></div>
                <div>📞 الهاتف: <strong style={{ direction: "ltr" }}>{filePatient.phone || "—"}</strong></div>
                <div>🎂 السن: <strong>{filePatient.birthDate ? calcAge(filePatient.birthDate) : filePatient.age || "—"}</strong>{filePatient.birthDate ? <span style={{ color: "#64748b", fontSize: 11 }}> ({filePatient.birthDate})</span> : null}</div>
                <div>📋 التاريخ المرضي: <strong>{filePatient.medicalHistory || "—"}</strong></div>
                <div>⚠️ الحساسية: <strong>{filePatient.allergies || "—"}</strong></div>
                <div>💰 إجمالي المدفوع: <strong>{moneyShort(fileData.invoices.reduce((s, i) => s + (parseFloat(i.paidAmount) || 0), 0), locale)} {t("currency")}</strong></div>
              </div>
              {/* 📊 خلاصة الملف — كل أرقام المريض في سطر واحد */}
              {(() => {
                const invs = fileData.invoices;
                const billed = invs.reduce((s, i) => s + (parseFloat(i.total ?? i.amount) || 0), 0);
                const paid = invs.reduce((s, i) => s + (parseFloat(i.paidAmount) || 0), 0);
                const doneAppts = fileData.appointments.filter((a) => a.status === "done");
                const lastVisit = doneAppts.length ? doneAppts.map((a) => a.date).sort().reverse()[0] : null;
                const upcoming = fileData.appointments.filter((a) => (a.status === "scheduled" || a.status === "confirmed") && a.date >= new Date().toISOString().split("T")[0]).sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
                const followRx = fileData.prescriptions.find((r) => r.followUpDate) || null;
                const chips = [
                  { label: "الزيارات", value: String(filePatient.totalVisits || doneAppts.length || 0), bg: "#d1fae5", color: "#065f46" },
                  { label: "آخر زيارة", value: lastVisit || "—", bg: "#e0e7ff", color: "#3730a3" },
                  { label: "القادم", value: upcoming ? `${upcoming.date} ${upcoming.time || ""}` : (followRx ? `متابعة ${followRx.followUpDate}` : "—"), bg: "#fef3c7", color: "#92400e" },
                  { label: "إجمالي الفواتير", value: moneyShort(billed, locale), bg: "#f1f5f9", color: "#0f172a" },
                  { label: "المدفوع", value: moneyShort(paid, locale), bg: "#dcfce7", color: "#15803d" },
                  { label: "المتبقي", value: moneyShort(Math.max(0, billed - paid), locale), bg: billed - paid > 0.5 ? "#fee2e2" : "#f1f5f9", color: billed - paid > 0.5 ? "#b91c1c" : "#64748b" },
                ];
                return (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {chips.map((c) => (
                      <div key={c.label} style={{ background: c.bg, color: c.color, borderRadius: 10, padding: "6px 14px", fontSize: 12 }}>
                        <div style={{ opacity: 0.75 }}>{c.label}</div>
                        <div style={{ fontWeight: 900, fontSize: 14 }}>{c.value}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              {fileLoading ? (
                <div className="loading"><div className="spinner"></div>{t("common.loading")}</div>
              ) : (
                <>
                  {/* تبويبات الملف — دوس على أي قسم يتبدل قدامك من غير ما تنزل تحت */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {[
                      { id: "appointments", label: "📅 المواعيد", count: fileData.appointments.length },
                      { id: "prescriptions", label: "💊 الروشتات", count: fileData.prescriptions.length },
                      { id: "invoices", label: "🧾 الفواتير", count: fileData.invoices.length },
                      { id: "vouchers", label: "💰 مدفوعات", count: (fileData.vouchers || []).length },
                      { id: "attachments", label: "📎 تحاليل", count: (fileData.attachments || []).length },
                      { id: "dental", label: "🦷 الأسنان", count: fileData.dental ? Object.keys(fileData.dental.teeth || {}).length : 0 },
                    ].map((tb) => (
                      <button key={tb.id} type="button" onClick={() => setFileTab(tb.id)}
                        style={{ border: fileTab === tb.id ? "2px solid #2563eb" : "1px solid #e2e8f0", background: fileTab === tb.id ? "#eff6ff" : "white", color: fileTab === tb.id ? "#1d4ed8" : "#475569", borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}>
                        {tb.label} ({tb.count})
                      </button>
                    ))}
                  </div>
                  <div style={{ maxHeight: 460, overflowY: "auto", paddingInlineEnd: 4 }}>
                  {fileTab === "appointments" && (
                    fileData.appointments.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد مواعيد</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {fileData.appointments.map((a) => (
                          <div key={a.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                            <strong>{a.date} {a.time}</strong>
                            <span style={{ color: "#64748b" }}>{a.type === "first_visit" ? "كشف" : a.type === "follow_up" ? "متابعة" : a.type || ""}</span>
                            <span style={{ marginInlineEnd: "auto", background: a.status === "done" ? "#f0fdf4" : "#eff6ff", color: a.status === "done" ? "#16a34a" : "#2563eb", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {fileTab === "prescriptions" && (
                    fileData.prescriptions.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد روشتات</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {fileData.prescriptions.map((r) => (
                          <div key={r.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <strong>{r.createdAt ? fmtDate(r.createdAt, locale) : "—"}</strong>
                              {r.rxNumber && <span style={{ color: "#7c3aed", fontFamily: "monospace", fontWeight: 800 }}>{r.rxNumber}</span>}
                              <span style={{ color: "#7c3aed" }}>{r.diagnosis || ""}</span>
                              {r.doctor && <span style={{ color: "#64748b" }}>• {r.doctor}</span>}
                              {r.followUpDate && <span style={{ background: "#f0fdf4", color: "#15803d", borderRadius: 12, padding: "1px 8px", fontWeight: 800 }}>🔁 {r.followUpDate}</span>}
                            </div>
                            {(r.medicines || []).map((m, i) => (
                              <div key={i} style={{ color: "#475569" }}>• {m.name} — {m.dose} — {m.frequency} — {m.duration}</div>
                            ))}
                            {r.notes && <div style={{ color: "#64748b", marginTop: 4 }}>📝 {r.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {fileTab === "invoices" && (
                    fileData.invoices.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد فواتير</p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {fileData.invoices.map((inv) => (
                          <button key={inv.id} type="button" onClick={() => setFileInv(inv)} title="دوس لعرض تفاصيل الفاتورة"
                            style={{ textAlign: "start", cursor: "pointer", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", gap: 8, alignItems: "center", fontFamily: "inherit" }}>
                            <strong>{inv.date ? fmtDate(inv.date, locale) : "—"}</strong>
                            <span>الإجمالي: {moneyShort(Number(inv.total ?? inv.amount ?? 0), locale)}</span>
                            <span style={{ color: "#16a34a" }}>المدفوع: {moneyShort(Number(inv.paidAmount || 0), locale)}</span>
                            <span style={{ marginInlineStart: "auto", color: "#2563eb", fontWeight: 800 }}>التفاصيل ←</span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                  {fileTab === "vouchers" && (
                    (fileData.vouchers || []).length === 0 ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد سندات — <a href="/vouchers" style={{ color: "#059669", fontWeight: 700 }}>أضف من صفحة السندات</a></p> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(fileData.vouchers || []).map((v) => (
                          <div key={v.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, background: v.type === "payment" ? "#fee2e2" : "#dcfce7", color: v.type === "payment" ? "#b91c1c" : "#15803d", borderRadius: 12, padding: "2px 10px" }}>
                              {v.type === "payment" ? "💸 صرف" : "💰 قبض"}
                            </span>
                            <strong>{v.date ? fmtDate(v.date, locale) : "—"}</strong>
                            <strong style={{ color: "#0f172a" }}>{moneyShort(Number(v.amount) || 0, locale)} {t("currency")}</strong>
                            <span style={{ color: "#64748b" }}>{v.method === "visa" ? "💳 فيزا" : v.method === "transfer" ? "🏦 تحويل" : "💵 كاش"}</span>
                            {v.notes && <span style={{ color: "#475569" }}>• {v.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                  {fileTab === "attachments" && (
                    (fileData.attachments || []).length === 0 ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد مرفقات — <a href="/medical-attachments" style={{ color: "#059669", fontWeight: 700 }}>أضف من صفحة التحاليل</a></p> : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
                        {(fileData.attachments || []).map((m) => (
                          <button key={m.id} type="button" onClick={() => m.fileData && setFileImg(m)} title={m.fileData ? "دوس للعرض مكبر" : m.title}
                            style={{ cursor: m.fileData ? "zoom-in" : "default", background: "white", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", padding: 0, fontFamily: "inherit" }}>
                            {m.fileData ? <img src={m.fileData} alt={m.title} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} /> : <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, background: "#f1f5f9" }}>📎</div>}
                            <div style={{ padding: "6px 8px", fontSize: 11, textAlign: "start" }}>
                              <div style={{ fontWeight: 800 }}>{m.title}</div>
                              <div style={{ color: "#64748b" }}>{m.date || ""}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                  {fileTab === "dental" && (
                    !fileData.dental ? <p style={{ color: "#94a3b8", fontSize: 12 }}>لا توجد خريطة أسنان — <a href="/dental" style={{ color: "#0e7490", fontWeight: 700 }}>افتح ملف الأسنان</a></p> : (
                      <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "10px 14px", fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span>🦷 {Object.keys(fileData.dental.teeth || {}).length} ضرس مسجل</span>
                          {fileData.dentalPlan && <span>• 📋 الخطة: {fileData.dentalPlan.items?.length || 0} بند</span>}
                          <a href="/dental" style={{ marginInlineStart: "auto", color: "#0e7490", fontWeight: 800 }}>فتح ملف الأسنان ←</a>
                        </div>
                        {(fileData.dentalPlan?.items || []).length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {fileData.dentalPlan.items.map((it, i) => (
                              <div key={i} style={{ background: "white", borderRadius: 8, padding: "4px 10px", display: "flex", gap: 8 }}>
                                <span>🦷 {it.tooth}</span><span>{it.procedure}</span>
                                <strong style={{ marginInlineStart: "auto" }}>{moneyShort(Number(it.price) || 0, locale)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                        {fileData.dental.notes && <div style={{ color: "#475569" }}>📝 {fileData.dental.notes}</div>}
                      </div>
                    )
                  )}
                  </div>
                </>
              )}
            </div>
          </div>

            {/* 🧾 تفاصيل الفاتورة — نافذة قدامك فوق الملف */}
            {fileInv && (
              <div className="modal-backdrop" onClick={() => setFileInv(null)} style={{ zIndex: 1100 }}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                  <div className="modal-header">
                    <h3>🧾 فاتورة — {filePatient.name}</h3>
                    <button className="modal-close" onClick={() => setFileInv(null)}>&times;</button>
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>📅 <strong>{fileInv.date ? fmtDate(fileInv.date, locale) : "—"}</strong></span>
                    <span>الحالة: <strong>{fileInv.status === "paid" ? "مدفوعة ✅" : "معلقة ⏳"}</strong></span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                    {(fileInv.products || []).map((p, i) => (
                      <div key={i} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 13, display: "flex", gap: 8 }}>
                        <span style={{ flex: 1, fontWeight: 700 }}>{p.productName || "خدمة"}</span>
                        <span style={{ color: "#64748b" }}>×{p.quantity || 1}</span>
                        <strong>{moneyShort(Number(p.amount) || 0, locale)}</strong>
                      </div>
                    ))}
                  </div>
                  {fileInv.description && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>{fileInv.description}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900, borderTop: "2px solid #e2e8f0", paddingTop: 10 }}>
                    <span>الإجمالي: {moneyShort(Number(fileInv.total ?? fileInv.amount ?? 0), locale)}</span>
                    <span style={{ color: "#16a34a" }}>المدفوع: {moneyShort(Number(fileInv.paidAmount || 0), locale)}</span>
                    <span style={{ color: "#d97706" }}>المتبقي: {moneyShort(Math.max(0, Number(fileInv.total ?? fileInv.amount ?? 0) - Number(fileInv.paidAmount || 0)), locale)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 🖼️ صورة التحليل مكبرة — قدامك فوق الملف */}
            {fileImg && (
              <div className="modal-backdrop" onClick={() => setFileImg(null)} style={{ zIndex: 1100 }}>
                <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, textAlign: "center" }}>
                  <div className="modal-header">
                    <h3>📎 {fileImg.title} — {filePatient.name}</h3>
                    <button className="modal-close" onClick={() => setFileImg(null)}>&times;</button>
                  </div>
                  <img src={fileImg.fileData} alt={fileImg.title} style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, fontSize: 12, color: "#64748b" }}>
                    <span>{fileImg.date || ""}</span>
                    {fileImg.notes && <span>• {fileImg.notes}</span>}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  input: {
    padding: "10px 12px",
    border: "1px solid var(--gray-200)",
    borderRadius: "var(--radius-sm)",
    fontSize: 14,
    fontFamily: "Cairo, sans-serif",
    background: "white",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
};
