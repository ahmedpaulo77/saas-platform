// src/pages/MedicalAttachments.js — التحاليل والأشعة والسونار (الملف الطبي)
// collection: medical_attachments (موجودة في firestore.rules) — صور مضغوطة base64 داخل المستند
import React, { useState, useEffect, useCallback } from "react";
import { collection, addDoc, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { fmtDate } from "../utils/fmt.js";

const TYPES = [
  { id: "lab", label: "🧪 تحليل", color: "#0891b2", bg: "#cffafe" },
  { id: "xray", label: "🩻 أشعة", color: "#7c3aed", bg: "#ede9fe" },
  { id: "ultrasound", label: "📡 سونار", color: "#059669", bg: "#d1fae5" },
  { id: "report", label: "📋 تقرير طبي", color: "#d97706", bg: "#fef3c7" },
  { id: "other", label: "📎 أخرى", color: "#64748b", bg: "#f1f5f9" },
];

function typeMeta(id) {
  return TYPES.find((x) => x.id === id) || TYPES[4];
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 1000;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MedicalAttachments() {
  const { t, locale } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ patientId: "", type: "lab", title: "", date: new Date().toISOString().split("T")[0], notes: "", link: "" });
  const [fileData, setFileData] = useState("");
  const [fileName, setFileName] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [iSnap, pSnap] = await Promise.all([
        getDocs(getScopedQuery("medical_attachments", userRole, userCompanyId, currentUser?.uid)),
        getDocs(getScopedQuery("patients", userRole, userCompanyId, currentUser?.uid)),
      ]);
      const data = [];
      iSnap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
      setItems(data);
      const plist = [];
      pSnap.forEach((d) => plist.push({ id: d.id, name: d.data().name, phone: d.data().phone || "" }));
      setPatients(plist);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const url = await fileToCompressedDataUrl(f);
      setFileData(url);
      setFileName(f.name);
    } catch (err) {
      console.error(err);
      alert("تعذر قراءة الصورة");
    }
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.patientId || !form.title.trim()) { alert("اختر المريض واكتب عنوان المرفق"); return; }
    if (!userCompanyId) { alert(t("common.errorGeneric")); return; }
    setSaving(true);
    try {
      const patient = patients.find((p) => p.id === form.patientId);
      await addDoc(collection(db, "medical_attachments"), {
        patientId: form.patientId,
        patientName: patient?.name || "",
        type: form.type,
        title: form.title.trim(),
        date: form.date || new Date().toISOString().split("T")[0],
        notes: form.notes.trim() || "",
        link: form.link.trim() || "",
        fileData: fileData || "",
        fileName: fileName || "",
        companyId: userCompanyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      setForm({ patientId: "", type: "lab", title: "", date: new Date().toISOString().split("T")[0], notes: "", link: "" });
      setFileData("");
      setFileName("");
      await fetchAll();
      alert("✅ تم حفظ المرفق الطبي");
    } catch (err) {
      console.error(err);
      alert("❌ فشل الحفظ");
    }
    setSaving(false);
  }

  async function delItem(id) {
    if (!window.confirm("حذف هذا المرفق؟")) return;
    try {
      await deleteDoc(doc(db, "medical_attachments", id));
      await fetchAll();
    } catch (e) {
      console.error(e);
      alert(t("common.errorGeneric"));
    }
  }

  const filtered = items.filter((x) => {
    const s = searchTerm.toLowerCase();
    const okSearch = (x.patientName || "").toLowerCase().includes(s) || (x.title || "").toLowerCase().includes(s);
    const okType = filterType === "all" || x.type === filterType;
    return okSearch && okType;
  });

  const stats = {
    total: items.length,
    lab: items.filter((x) => x.type === "lab").length,
    xray: items.filter((x) => x.type === "xray" || x.type === "ultrasound").length,
    patientsCount: new Set(items.map((x) => x.patientId)).size,
  };

  if (loading) return <div className="loading"><div className="spinner"></div>جاري تحميل المرفقات...</div>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div style={{ background: "linear-gradient(135deg,#0e7490,#059669)", borderRadius: "var(--radius)", padding: "20px 24px", marginBottom: 20, color: "white" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📎 التحاليل والأشعة</h1>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.75)", fontSize: 14 }}>أرشيف الملف الطبي — تحليل، أشعة، سونار، تقارير لكل مريض</p>
        </div>

        <div className="stats-row">
          <div className="stat-card cyan"><div className="stat-icon"><i className="fas fa-folder-open"></i></div><div className="stat-value">{stats.total}</div><div className="stat-label">إجمالي المرفقات</div></div>
          <div className="stat-card blue"><div className="stat-icon"><i className="fas fa-flask"></i></div><div className="stat-value">{stats.lab}</div><div className="stat-label">تحاليل</div></div>
          <div className="stat-card purple"><div className="stat-icon"><i className="fas fa-x-ray"></i></div><div className="stat-value">{stats.xray}</div><div className="stat-label">أشعة وسونار</div></div>
          <div className="stat-card green"><div className="stat-icon"><i className="fas fa-users"></i></div><div className="stat-value">{stats.patientsCount}</div><div className="stat-label">مرضى لهم ملفات</div></div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}><i className="fas fa-plus-circle" style={{ color: "#059669" }}></i> إضافة مرفق جديد</h3>
          <form onSubmit={addItem}>
            <div style={styles.grid}>
              <select value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} style={styles.input} required>
                <option value="">اختر المريض *</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` (${p.phone})` : ""}</option>)}
              </select>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={styles.input}>
                {TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={styles.input} placeholder="عنوان المرفق * (مثال: صورة دم كاملة)" required />
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={styles.input} />
              <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} style={{ ...styles.input, gridColumn: "1 / -1" }} placeholder="رابط خارجي (اختياري — معمل أونلاين)" dir="ltr" />
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 56 }} placeholder="ملاحظات الدكتور على النتيجة..." />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <label className="btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                <i className="fas fa-camera"></i> {fileData ? "تغيير الصورة" : "ارفع صورة النتيجة"}
                <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
              </label>
              {fileData && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>✅ {fileName || "صورة جاهزة"}</span>}
              {fileData && <img src={fileData} alt="preview" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />}
              <button type="submit" className="btn-primary" disabled={saving} style={{ marginInlineStart: "auto" }}>{saving ? "جاري الحفظ..." : <><i className="fas fa-save"></i> حفظ المرفق</>}</button>
            </div>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ابحث باسم المريض أو عنوان المرفق..." />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">كل الأنواع</option>
            {TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {filtered.length === 0 ? (
            <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", color: "#94a3b8", padding: 40 }}>
              <i className="fas fa-folder-open" style={{ fontSize: 32, marginBottom: 8 }}></i>
              <div>لا توجد مرفقات بعد — ارفع أول تحليل</div>
            </div>
          ) : filtered.map((x) => {
            const m = typeMeta(x.type);
            return (
              <div key={x.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {x.fileData ? (
                  <img src={x.fileData} alt={x.title} onClick={() => setPreview(x)} style={{ width: "100%", height: 170, objectFit: "cover", cursor: "zoom-in" }} />
                ) : (
                  <div onClick={() => x.link && window.open(x.link, "_blank")} style={{ height: 90, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, cursor: x.link ? "pointer" : "default" }}>{m.label.split(" ")[0]}</div>
                )}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, background: m.bg, color: m.color, borderRadius: 20, padding: "2px 10px" }}>{m.label}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{x.date ? fmtDate(x.date, locale) : ""}</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{x.title}</div>
                  <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 700 }}>👤 {x.patientName}</div>
                  {x.notes && <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>{x.notes}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {x.fileData && <button className="btn-primary btn-sm" onClick={() => setPreview(x)}><i className="fas fa-eye"></i> عرض</button>}
                    {x.link && <button className="btn-secondary btn-sm" onClick={() => window.open(x.link, "_blank")}><i className="fas fa-external-link-alt"></i> الرابط</button>}
                    <button className="btn-danger btn-sm" onClick={() => delItem(x.id)} style={{ marginInlineStart: "auto" }}><i className="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {preview && (
          <div className="modal-backdrop" onClick={() => setPreview(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, textAlign: "center" }}>
              <div className="modal-header">
                <h3>{preview.title} — {preview.patientName}</h3>
                <button className="modal-close" onClick={() => setPreview(null)}>&times;</button>
              </div>
              <img src={preview.fileData} alt={preview.title} style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid #e2e8f0" }} />
              {preview.notes && <p style={{ color: "#475569", fontSize: 13, marginTop: 10 }}>{preview.notes}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  input: { padding: "10px 12px", border: "1px solid var(--gray-200)", borderRadius: "var(--radius-sm)", fontSize: 14, fontFamily: "Cairo, sans-serif", background: "white", outline: "none", width: "100%", boxSizing: "border-box" },
};
