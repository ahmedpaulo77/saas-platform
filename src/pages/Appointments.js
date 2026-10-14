import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  increment,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase/config.js";
import { useAuth } from "../context/AuthContext.js";
import { getScopedQuery, isSuperAdmin } from "../utils/companyQuery.js";
import Sidebar from "../components/common/Sidebar.js";
import { useLanguage } from "../i18n/LanguageContext.js";
import { buildClinicThermalHTML, openThermalPrint } from "../utils/invoiceHelpers.js";

const STATUS_BADGES = {
  scheduled: { bg: "#dbeafe", color: "#1d4ed8", label: "appt.scheduled" },
  confirmed: { bg: "#dcfce7", color: "#15803d", label: "appt.confirmed" },
  done: { bg: "#ede9fe", color: "#6d28d9", label: "appt.done" },
  cancelled: { bg: "#fee2e2", color: "#b91c1c", label: "appt.cancelled" },
  no_show: { bg: "#fef3c7", color: "#b45309", label: "appt.noShow" },
};

export default function Appointments() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { userRole, userCompanyId, currentUser } = useAuth();
  // 💊 روشتة مربوطة بالموعد: تفتح الروشتات والمريض والموعد جاهزين
  function newLinkedRx(a) {
    navigate("/prescriptions", {
      state: {
        patientId: a.patientId,
        appointmentId: a.id,
        doctor: a.doctor || "",
        apptLabel: `${a.date} ${a.time || ""}`,
      },
    });
  }
  const superAdmin = isSuperAdmin(userRole);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [newAppt, setNewAppt] = useState({
    patientId: "",
    doctor: "",
    date: "",
    time: "",
    type: "follow_up",
    notes: "",
    status: "scheduled",
    companyId: "",
  });
  const [companies, setCompanies] = useState([]);
  const [editingAppt, setEditingAppt] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);
  // 🩺 عرض اليوم (Timeline) + فاتورة الكشف من الموعد
  const [viewMode, setViewMode] = useState("list");
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split("T")[0]);
  // 🗓️ التقويم الأسبوعي (يبدأ السبت)
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => {
    const now = new Date();
    const sinceSat = (now.getDay() + 1) % 7;
    const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceSat + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      return { iso, dayNum: d.getDate(), weekName: names[d.getDay()] };
    });
  }, [weekOffset]);
  const [invoicingAppt, setInvoicingAppt] = useState(null);
  const [invoiceFee, setInvoiceFee] = useState("");
  const [invoicePaid, setInvoicePaid] = useState(true);
  const [invoicing, setInvoicing] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

  const stats = {
    total: appointments.length,
    today: appointments.filter((a) => a.date === todayStr && a.status !== "cancelled").length,
    pending: appointments.filter((a) => a.status === "scheduled" || a.status === "confirmed").length,
    done: appointments.filter((a) => a.status === "done").length,
  };

  const fetchAppointments = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("appointments", userRole, userCompanyId, currentUser?.uid)
      );
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => {
        const ad = new Date(a.date + "T" + (a.time || "00:00"));
        const bd = new Date(b.date + "T" + (b.time || "00:00"));
        return ad - bd;
      });
      setAppointments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, currentUser?.uid]);

  const fetchPatients = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("patients", userRole, userCompanyId, currentUser?.uid)
      );
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, name: d.data().name, phone: d.data().phone }));
      setPatients(data);
    } catch (e) {
      console.error(e);
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
    fetchAppointments();
    fetchPatients();
    fetchCompanies();
  }, [fetchAppointments, fetchPatients, fetchCompanies]);

  // ⛔ منع الحجز المزدوج: نفس اليوم + نفس الساعة = محجوز (ما عدا الملغي).
  // لو الدكتورين مكتوبين ومختلفين صراحة بنسمح — عيادة فيها أكتر من دكتور.
  function findConflict(date, time, doctor, excludeId = null) {
    const d = String(doctor || "").trim();
    return appointments.find((a) => {
      if (excludeId && a.id === excludeId) return false;
      if (a.status === "cancelled") return false;
      if (a.date !== date || String(a.time || "") !== String(time || "")) return false;
      const ad = String(a.doctor || "").trim();
      if (d && ad && d !== ad) return false;
      return true;
    });
  }

  // المواعيد المحجوزة في يوم معين (تُعرض في الفورم عشان الدكتور يشوف الفاضي/المحجوز)
  function takenSlots(date, excludeId = null) {
    if (!date) return [];
    return appointments
      .filter((a) => a.date === date && a.status !== "cancelled" && (!excludeId || a.id !== excludeId))
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  }

  async function addAppt(e) {
    e.preventDefault();
    const companyId = superAdmin ? newAppt.companyId : userCompanyId;
    if (!newAppt.patientId || !newAppt.date || !newAppt.time || !companyId) {
      alert(t("appt.fillRequired"));
      return;
    }
    const conflict = findConflict(newAppt.date, newAppt.time, newAppt.doctor);
    if (conflict) {
      alert(`⛔ المعاد محجوز بالفعل — ${conflict.patientName || "مريض آخر"} الساعة ${conflict.time}. اختار ساعة تانية.`);
      return;
    }
    try {
      await addDoc(collection(db, "appointments"), {
        patientId: newAppt.patientId,
        patientName: patients.find((p) => p.id === newAppt.patientId)?.name || "",
        doctor: newAppt.doctor || "",
        date: newAppt.date,
        time: newAppt.time,
        type: newAppt.type,
        notes: newAppt.notes || "",
        status: "scheduled",
        companyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      setNewAppt({
        patientId: "",
        doctor: "",
        date: "",
        time: "",
        type: "follow_up",
        notes: "",
        status: "scheduled",
        companyId: superAdmin ? "" : userCompanyId,
      });
      await fetchAppointments();
      alert(t("appt.addOk"));
    } catch (e) {
      console.error(e);
      alert(t("appt.addFail"));
    }
  }

  function openEdit(a) {
    setEditingAppt(a);
    setShowEditModal(true);
  }
  function closeEdit() {
    setEditingAppt(null);
    setShowEditModal(false);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editingAppt.patientId || !editingAppt.date || !editingAppt.time) {
      alert(t("appt.fillRequired"));
      return;
    }
    const conflict = findConflict(editingAppt.date, editingAppt.time, editingAppt.doctor, editingAppt.id);
    if (conflict) {
      alert(`⛔ المعاد محجوز بالفعل — ${conflict.patientName || "مريض آخر"} الساعة ${conflict.time}. اختار ساعة تانية.`);
      return;
    }
    try {
      await updateDoc(doc(db, "appointments", editingAppt.id), {
        patientId: editingAppt.patientId,
        patientName: patients.find((p) => p.id === editingAppt.patientId)?.name || editingAppt.patientName,
        doctor: editingAppt.doctor || "",
        date: editingAppt.date,
        time: editingAppt.time,
        type: editingAppt.type,
        notes: editingAppt.notes || "",
        status: editingAppt.status,
        updatedAt: new Date().toISOString(),
      });
      closeEdit();
      await fetchAppointments();
      alert(t("appt.updOk"));
    } catch (e) {
      console.error(e);
      alert(t("appt.updFail"));
    }
  }

  async function setStatus(id, status) {
    try {
      // 🔢 عداد الزيارات: أول ما الموعد يتقفل done (و مكنش done قبل كده) نزود زيارة للمريض
      let countVisit = status === "done";
      let visitPatientId = null;
      if (countVisit) {
        try {
          const snap = await getDoc(doc(db, "appointments", id));
          if (snap.exists()) {
            visitPatientId = snap.data().patientId || null;
            if (snap.data().status === "done") countVisit = false;
          }
        } catch (e) { console.warn(e); }
      }
      await updateDoc(doc(db, "appointments", id), {
        status,
        updatedAt: new Date().toISOString(),
      });
      if (countVisit && visitPatientId) {
        try {
          await updateDoc(doc(db, "patients", visitPatientId), { totalVisits: increment(1) });
        } catch (e) { console.warn(e); }
      }
      await fetchAppointments();
    } catch (e) {
      console.error(e);
    }
  }

  async function delAppt(id) {
    if (!window.confirm(t("appt.delConfirm"))) return;
    try {
      await deleteDoc(doc(db, "appointments", id));
      await fetchAppointments();
      alert(t("appt.delOk"));
    } catch (e) {
      console.error(e);
      alert(t("appt.delFail"));
    }
  }

  // 🧾 إنشاء فاتورة كشف من الموعد مباشرة (مبلغ حر — نفس نمط العيادة في الفواتير)
  async function createInvoiceForAppt(e) {
    e.preventDefault();
    if (!invoicingAppt) return;
    const fee = parseFloat(invoiceFee) || 0;
    if (!(fee > 0)) { alert("أدخل قيمة الكشف أولاً"); return; }
    const companyId = invoicingAppt.companyId || userCompanyId;
    if (!invoicingAppt.patientId || !companyId) { alert(t("appt.fillRequired")); return; }
    setInvoicing(true);
    try {
      const label = invoicingAppt.type === "first_visit" ? "كشف أول" : invoicingAppt.type === "follow_up" ? "متابعة" : invoicingAppt.type === "emergency" ? "طوارئ" : "فحص";
      const invRef = await addDoc(collection(db, "invoices"), {
        clientId: invoicingAppt.patientId,
        patientId: invoicingAppt.patientId,
        patientName: invoicingAppt.patientName || "",
        appointmentId: invoicingAppt.id,
        products: [{ productId: "", productName: `كشف (${label}) — ${invoicingAppt.date} ${invoicingAppt.time || ""}`, quantity: 1, amount: fee, paidAmount: 0, isManual: true }],
        manualAmount: true,
        amount: fee,
        total: fee,
        paidAmount: invoicePaid ? fee : 0,
        status: invoicePaid ? "paid" : "pending",
        approval: "new",
        type: "invoice",
        description: `فاتورة كشف من موعد ${invoicingAppt.date} ${invoicingAppt.time || ""}`,
        paymentMethod: "cash",
        companyId,
        createdBy: currentUser?.uid,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        dueDate: invoicePaid ? null : new Date().toISOString(),
      });
      // علّم الموعد أنه تم + اربطه بالفاتورة
      await updateDoc(doc(db, "appointments", invoicingAppt.id), {
        status: "done",
        invoiceId: invRef.id,
        fee,
        updatedAt: new Date().toISOString(),
      });
      // 🔢 زيارة جديدة للمريض (الزرار بيظهر بس للمواعيد غير المنجزة)
      if (invoicingAppt.status !== "done") {
        try {
          await updateDoc(doc(db, "patients", invoicingAppt.patientId), { totalVisits: increment(1) });
        } catch (e) { console.warn(e); }
      }
      setInvoicingAppt(null);
      setInvoiceFee("");
      await fetchAppointments();
      // 🖨️ طباعة فورية — نفس إيصال الاستقبال، من غير ما يروح صفحة تانية
      try {
        const cSnap = await getDoc(doc(db, "companies", companyId));
        const comp = cSnap.exists() ? { id: cSnap.id, ...cSnap.data() } : null;
        openThermalPrint(buildClinicThermalHTML({
          invoice: {
            id: invRef.id,
            products: [{ productId: "", productName: `كشف (${invoicingAppt.type === "first_visit" ? "كشف أول" : invoicingAppt.type === "follow_up" ? "متابعة" : "فحص"})`, quantity: 1, amount: fee }],
            total: fee,
            paidAmount: invoicePaid ? fee : 0,
            doctorName: invoicingAppt.doctor || "",
          },
          patientName: invoicingAppt.patientName || "",
          company: comp,
        }));
      } catch (e) { console.warn(e); }
      alert("✅ تم إنشاء فاتورة الكشف بنجاح");
    } catch (err) {
      console.error(err);
      alert(t("common.errorGeneric"));
    }
    setInvoicing(false);
  }

  // ── تذكير واتساب: wa.me برابط جاهز (الموبايل/الكمبيوتر يفتح المحادثة) ──
  function waNumber(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("002")) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith("01")) return "2" + digits;
    if (digits.length === 10 && digits.startsWith("1")) return "20" + digits;
    return digits;
  }

  function remindWhatsApp(appt) {
    const patient = patients.find((p) => p.id === appt.patientId);
    const phone = patient?.phone || "";
    const num = waNumber(phone);
    if (!num) { alert("رقم هاتف المريض غير مسجل"); return; }
    const msg = `أهلاً ${appt.patientName || patient?.name || ""}، تذكير بموعدك يوم ${appt.date} الساعة ${appt.time}${appt.doctor ? ` مع ${appt.doctor}` : ""}.`;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const tomorrowAppts = appointments.filter(
    (a) => a.date === tomorrowStr && (a.status === "scheduled" || a.status === "confirmed")
  );

  const filtered = appointments.filter((a) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      (a.patientName || "").toLowerCase().includes(s) ||
      (a.doctor || "").toLowerCase().includes(s) ||
      (a.date || "").includes(s);
    let matchesFilter = true;
    if (filter === "today") matchesFilter = a.date === todayStr;
    else if (filter === "tomorrow") matchesFilter = a.date === tomorrowStr && a.status !== "cancelled";
    else if (filter === "upcoming")
      matchesFilter = a.date >= todayStr && (a.status === "scheduled" || a.status === "confirmed");
    else if (filter === "done") matchesFilter = a.status === "done";
    else if (filter === "cancelled") matchesFilter = a.status === "cancelled";
    return matchesSearch && matchesFilter;
  });

  const TYPE_LABELS = {
    first_visit: "appt.typeCheck",
    follow_up: "appt.typeFollow",
    checkup: "appt.typeCheckup",
    emergency: "appt.typeEmergency",
  };

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>
        {t("appt.loading")}
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div
          style={{
            background: "linear-gradient(135deg,#2563eb,#7c3aed)",
            borderRadius: "var(--radius)",
            padding: "20px 24px",
            marginBottom: 20,
            color: "white",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            📅 {t("appt.title")}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            {t("appt.subtitle")}
          </p>
        </div>

        <div className="stats-row">
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-calendar-alt"></i></div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("appt.total")}</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon"><i className="fas fa-calendar-day"></i></div>
            <div className="stat-value">{stats.today}</div>
            <div className="stat-label">{t("appt.today")}</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-icon"><i className="fas fa-clock"></i></div>
            <div className="stat-value">{stats.pending}</div>
            <div className="stat-label">{t("appt.pending")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
            <div className="stat-value">{stats.done}</div>
            <div className="stat-label">{t("appt.done")}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            <i className="fas fa-calendar-plus"></i> {t("appt.add")}
          </h3>
          <form onSubmit={addAppt}>
            <div style={styles.grid}>
              <select
                value={newAppt.patientId}
                onChange={(e) => setNewAppt({ ...newAppt, patientId: e.target.value })}
                style={styles.input}
                required
              >
                <option value="">{t("appt.choosePatient")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.phone ? `(${p.phone})` : ""}
                  </option>
                ))}
              </select>
              <input
                placeholder={t("appt.phDoctor")}
                value={newAppt.doctor}
                onChange={(e) => setNewAppt({ ...newAppt, doctor: e.target.value })}
                style={styles.input}
              />
              <input
                type="date"
                value={newAppt.date}
                onChange={(e) => setNewAppt({ ...newAppt, date: e.target.value })}
                style={styles.input}
                required
              />
              <input
                type="time"
                value={newAppt.time}
                onChange={(e) => setNewAppt({ ...newAppt, time: e.target.value })}
                style={styles.input}
                required
              />
              <select
                value={newAppt.type}
                onChange={(e) => setNewAppt({ ...newAppt, type: e.target.value })}
                style={styles.input}
              >
                <option value="first_visit">{t("appt.typeCheck")}</option>
                <option value="follow_up">{t("appt.typeFollow")}</option>
                <option value="checkup">{t("appt.typeCheckup")}</option>
                <option value="emergency">{t("appt.typeEmergency")}</option>
              </select>
              {superAdmin && (
                <select
                  value={newAppt.companyId}
                  onChange={(e) => setNewAppt({ ...newAppt, companyId: e.target.value })}
                  style={styles.input}
                  required
                >
                  <option value="">{t("cli.chooseCompany")}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <textarea
                placeholder={t("appt.phNotes")}
                value={newAppt.notes}
                onChange={(e) => setNewAppt({ ...newAppt, notes: e.target.value })}
                style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 60 }}
              />
            </div>
            {/* 📌 المحجوز والفاضي في اليوم المختار — الدكتور يشوف قبل ما يحجز */}
            {newAppt.date && (() => {
              const taken = takenSlots(newAppt.date);
              const clash = newAppt.time ? findConflict(newAppt.date, newAppt.time, newAppt.doctor) : null;
              return (
                <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                    📌 المحجوز يوم {newAppt.date} ({taken.length}):
                  </div>
                  {taken.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>✅ اليوم فاضي تماماً — أي ساعة متاحة</div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {taken.map((a) => {
                        const isPicked = newAppt.time && String(a.time) === String(newAppt.time);
                        return (
                          <span key={a.id} title={`${a.patientName || ""}${a.doctor ? ` • ${a.doctor}` : ""}`}
                            style={{ fontSize: 12, fontWeight: 800, borderRadius: 20, padding: "3px 12px", background: isPicked ? "#fee2e2" : "#ede9fe", color: isPicked ? "#b91c1c" : "#6d28d9", border: `1px solid ${isPicked ? "#fca5a5" : "#c4b5fd"}` }}>
                            🔒 {a.time} • {a.patientName}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {clash && (
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 12px" }}>
                      ⛔ الساعة {newAppt.time} محجوزة ({clash.patientName}) — غيّر الساعة
                    </div>
                  )}
                </div>
              );
            })()}
            <button type="submit" className="btn-primary" style={{ marginTop: 16 }}>
              <i className="fas fa-plus"></i> {t("appt.add")}
            </button>
          </form>
        </div>

        <div className="filter-bar">
          <div className="search-wrapper" style={{ flex: 1 }}>
            <i className="fas fa-search search-icon"></i>
            <input type="text" placeholder={t("appt.search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("appt.filterAll")}</option>
            <option value="today">{t("appt.filterToday")}</option>
            <option value="tomorrow">مواعيد بكرة</option>
            <option value="upcoming">{t("appt.filterUpcoming")}</option>
            <option value="done">{t("appt.filterDone")}</option>
            <option value="cancelled">{t("appt.filterCancelled")}</option>
          </select>
          <div style={{ display: "flex", gap: 6, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
            <button type="button" onClick={() => setViewMode("list")} style={{ border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit", background: viewMode === "list" ? "white" : "transparent", color: viewMode === "list" ? "#0f172a" : "#64748b", boxShadow: viewMode === "list" ? "0 1px 4px rgba(0,0,0,0.12)" : "none" }}>
              <i className="fas fa-list"></i> قائمة
            </button>
            <button type="button" onClick={() => setViewMode("day")} style={{ border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit", background: viewMode === "day" ? "white" : "transparent", color: viewMode === "day" ? "#0f172a" : "#64748b", boxShadow: viewMode === "day" ? "0 1px 4px rgba(0,0,0,0.12)" : "none" }}>
              <i className="fas fa-calendar-day"></i> جدول اليوم
            </button>
            <button type="button" onClick={() => setViewMode("week")} style={{ border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit", background: viewMode === "week" ? "white" : "transparent", color: viewMode === "week" ? "#0f172a" : "#64748b", boxShadow: viewMode === "week" ? "0 1px 4px rgba(0,0,0,0.12)" : "none" }}>
              <i className="fas fa-calendar-week"></i> الأسبوع
            </button>
          </div>
        </div>

        {/* 🗓️ التقويم الأسبوعي — نظرة العيادة الكاملة + الدخول على أي يوم */}
        {viewMode === "week" && (
          <div className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "linear-gradient(135deg,#0f766e,#2563eb)", color: "white", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setWeekOffset((o) => o - 1)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}>→ السابق</button>
              <strong style={{ flex: 1, textAlign: "center" }}>أسبوع {weekDays[0].iso} — {weekDays[6].iso}</strong>
              <button type="button" onClick={() => setWeekOffset(0)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}>الأسبوع الحالي</button>
              <button type="button" onClick={() => setWeekOffset((o) => o + 1)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontWeight: 800, fontFamily: "inherit" }}>التالي ←</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, padding: 14 }}>
              {weekDays.map((wd) => {
                const dayList = appointments
                  .filter((a) => a.date === wd.iso && a.status !== "cancelled")
                  .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
                const isToday = wd.iso === todayStr;
                return (
                  <button key={wd.iso} type="button" onClick={() => { setSelectedDay(wd.iso); setViewMode("day"); }}
                    style={{ cursor: "pointer", textAlign: "start", background: isToday ? "#ecfdf5" : "#f8fafc", border: isToday ? "2px solid #059669" : "1px solid #e2e8f0", borderRadius: 12, padding: 10, fontFamily: "inherit" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>{wd.weekName}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: isToday ? "#059669" : "#0f172a" }}>{wd.dayNum}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: dayList.length ? "#6d28d9" : "#94a3b8", marginBottom: 6 }}>
                      {dayList.length === 0 ? "فاضي ✅" : `🔒 ${dayList.length} محجوز`}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {dayList.slice(0, 3).map((a) => (
                        <div key={a.id} style={{ fontSize: 11, background: "white", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <strong>{a.time}</strong> {a.patientName}
                        </div>
                      ))}
                      {dayList.length > 3 && <div style={{ fontSize: 11, color: "#64748b" }}>+ {dayList.length - 3} — دوس للجدول الكامل</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 🩺 جدول اليوم — Timeline بصري يبهر الدكتور */}
        {viewMode === "day" && (
          <div className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "white", flexWrap: "wrap" }}>
              <strong><i className="fas fa-calendar-day" style={{ marginInlineEnd: 8 }}></i>جدول العيادة اليومي</strong>
              <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.4)", padding: "6px 10px", fontFamily: "inherit", fontSize: 13 }} />
              <span style={{ fontSize: 12, background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "2px 12px", fontWeight: 700 }}>
                {appointments.filter((a) => a.date === selectedDay && a.status !== "cancelled").length} موعد
              </span>
            </div>
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
              {(() => {
                const dayAppts = appointments.filter((a) => a.date === selectedDay).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
                if (dayAppts.length === 0) return <div style={{ textAlign: "center", color: "#94a3b8", padding: 30 }}>لا توجد مواعيد في هذا اليوم — <button onClick={() => setViewMode("list")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 700 }}>احجز الآن</button></div>;
                return dayAppts.map((a, idx) => (
                  <div key={a.id} style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
                      <div style={{ background: a.status === "done" ? "#16a34a" : a.status === "cancelled" ? "#dc2626" : "#2563eb", color: "white", borderRadius: 10, padding: "6px 8px", fontWeight: 800, fontSize: 13, textAlign: "center", width: "100%" }}>{a.time || "--:--"}</div>
                      {idx < dayAppts.length - 1 && <div style={{ width: 2, flex: 1, background: "#e2e8f0", marginTop: 4, minHeight: 12 }}></div>}
                    </div>
                    <div style={{ flex: 1, background: a.status === "cancelled" ? "#fef2f2" : "#f8fafc", border: `1px solid ${a.status === "done" ? "#bbf7d0" : "#e2e8f0"}`, borderInlineStart: `4px solid ${a.status === "done" ? "#16a34a" : a.status === "confirmed" ? "#2563eb" : a.status === "cancelled" ? "#dc2626" : "#f59e0b"}`, borderRadius: 10, padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{a.patientName}{a.invoiceId ? <span title="تم إصدار فاتورة" style={{ marginInlineStart: 6, fontSize: 11, background: "#dcfce7", color: "#15803d", borderRadius: 12, padding: "1px 8px" }}>🧾 مفوترة</span> : null}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{a.type === "first_visit" ? "🩺 كشف أول" : a.type === "follow_up" ? "🔁 متابعة" : a.type === "emergency" ? "🚨 طوارئ" : "📋 فحص"}{a.doctor ? ` • ${a.doctor}` : ""}{a.notes ? ` • ${a.notes}` : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => remindWhatsApp(a)} title="تذكير واتساب" style={{ background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}><i className="fab fa-whatsapp"></i></button>
                        {(a.status === "scheduled" || a.status === "confirmed") && (
                          <button onClick={() => { setInvoicingAppt(a); setInvoiceFee(a.fee ? String(a.fee) : ""); setInvoicePaid(true); }} title="إصدار فاتورة كشف" style={{ background: "#059669", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}><i className="fas fa-file-invoice-dollar"></i> فوترة</button>
                        )}
                        {a.status !== "cancelled" && (
                          <button onClick={() => newLinkedRx(a)} title="روشتة مربوطة بالموعد" style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12, fontFamily: "inherit" }}><i className="fas fa-prescription"></i> روشتة</button>
                        )}
                        {a.status !== "done" && a.status !== "cancelled" && (
                          <button onClick={() => setStatus(a.id, "done")} title={t("appt.markDone")} className="btn-sm btn-secondary"><i className="fas fa-check-double"></i></button>
                        )}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* تذكير مواعيد الغد */}
        {tomorrowAppts.length > 0 && (
          <div className="form-card" style={{ border: "2px solid #25D36655", marginBottom: 20 }}>
            <h3><i className="fab fa-whatsapp" style={{ color: "#25D366" }}></i> تذكير مواعيد بكرة ({tomorrowAppts.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tomorrowAppts.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", fontSize: 13 }}>
                  <strong>{a.patientName}</strong>
                  <span style={{ color: "#2563eb", fontWeight: 700 }}>{a.time}</span>
                  {a.doctor && <span style={{ color: "#64748b" }}>{a.doctor}</span>}
                  <button onClick={() => remindWhatsApp(a)} className="btn-sm" style={{ marginInlineEnd: "auto", background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}>
                    <i className="fab fa-whatsapp"></i> تذكير
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("appt.list")}</h3>
            <span className="table-count">{filtered.length}</span>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-calendar-alt"></i>
                <p>{searchTerm || filter !== "all" ? t("appt.emptySearch") : t("appt.empty")}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("appt.patient")}</th>
                    <th>{t("appt.doctor")}</th>
                    <th>{t("appt.date")}</th>
                    <th>{t("appt.time")}</th>
                    <th>{t("appt.type")}</th>
                    <th>{t("appt.status")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => {
                    const badge = STATUS_BADGES[a.status] || STATUS_BADGES.scheduled;
                    return (
                      <tr key={a.id} style={a.date === todayStr ? { background: "#f8fafc" } : {}}>
                        <td>{i + 1}</td>
                        <td style={{ fontWeight: 700 }}>{a.patientName}</td>
                        <td>{a.doctor || "—"}</td>
                        <td>{a.date}</td>
                        <td style={{ fontWeight: 700, color: "#2563eb" }}>{a.time}</td>
                        <td>{t(TYPE_LABELS[a.type]) || a.type}</td>
                        <td>
                          <span className="badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}33` }}>
                            {t(badge.label)}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions" style={{ flexWrap: "wrap" }}>
                            <button onClick={() => remindWhatsApp(a)} className="btn-sm" title="تذكير واتساب"
                              style={{ background: "#25D366", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                              <i className="fab fa-whatsapp"></i>
                            </button>
                            {a.status === "scheduled" && (
                              <button onClick={() => setStatus(a.id, "confirmed")} className="btn-sm btn-primary" title={t("appt.quickMark")}>
                                <i className="fas fa-check"></i>
                              </button>
                            )}
                            {(a.status === "scheduled" || a.status === "confirmed") && (
                              <button onClick={() => setStatus(a.id, "done")} className="btn-sm btn-secondary" title={t("appt.markDone")}>
                                <i className="fas fa-check-double"></i>
                              </button>
                            )}
                            {(a.status === "scheduled" || a.status === "confirmed") && !a.invoiceId && (
                              <button onClick={() => { setInvoicingAppt(a); setInvoiceFee(a.fee ? String(a.fee) : ""); setInvoicePaid(true); }} title="فاتورة كشف" style={{ background: "#059669", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                                <i className="fas fa-file-invoice-dollar"></i>
                              </button>
                            )}
                            {a.status !== "cancelled" && (
                              <button onClick={() => newLinkedRx(a)} title="روشتة مربوطة بالموعد" style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                                <i className="fas fa-prescription"></i>
                              </button>
                            )}
                            <button onClick={() => openEdit(a)} className="btn-sm btn-secondary">
                              <i className="fas fa-edit"></i>
                            </button>
                            <button onClick={() => delAppt(a.id)} className="btn-danger btn-sm">
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {showEditModal && editingAppt && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
              <div className="modal-header">
                <h3>{t("appt.editTitle")}</h3>
                <button className="modal-close" onClick={closeEdit}>&times;</button>
              </div>
              <form onSubmit={saveEdit}>
                <div style={styles.grid}>
                  <select
                    value={editingAppt.patientId}
                    onChange={(e) => setEditingAppt({ ...editingAppt, patientId: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">{t("appt.choosePatient")}</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.phone ? `(${p.phone})` : ""}
                      </option>
                    ))}
                  </select>
                  <input placeholder={t("appt.phDoctor")} value={editingAppt.doctor || ""} onChange={(e) => setEditingAppt({ ...editingAppt, doctor: e.target.value })} style={styles.input} />
                  <input type="date" value={editingAppt.date} onChange={(e) => setEditingAppt({ ...editingAppt, date: e.target.value })} style={styles.input} required />
                  <input type="time" value={editingAppt.time} onChange={(e) => setEditingAppt({ ...editingAppt, time: e.target.value })} style={styles.input} required />
                  <select value={editingAppt.type} onChange={(e) => setEditingAppt({ ...editingAppt, type: e.target.value })} style={styles.input}>
                    <option value="first_visit">{t("appt.typeCheck")}</option>
                    <option value="follow_up">{t("appt.typeFollow")}</option>
                    <option value="checkup">{t("appt.typeCheckup")}</option>
                    <option value="emergency">{t("appt.typeEmergency")}</option>
                  </select>
                  <select value={editingAppt.status} onChange={(e) => setEditingAppt({ ...editingAppt, status: e.target.value })} style={styles.input}>
                    <option value="scheduled">{t("appt.scheduled")}</option>
                    <option value="confirmed">{t("appt.confirmed")}</option>
                    <option value="done">{t("appt.done")}</option>
                    <option value="cancelled">{t("appt.cancelled")}</option>
                    <option value="no_show">{t("appt.noShow")}</option>
                  </select>
                  <textarea
                    placeholder={t("appt.phNotes")}
                    value={editingAppt.notes || ""}
                    onChange={(e) => setEditingAppt({ ...editingAppt, notes: e.target.value })}
                    style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 60 }}
                  />
                </div>
                {editingAppt.date && (() => {
                  const taken = takenSlots(editingAppt.date, editingAppt.id);
                  const clash = editingAppt.time ? findConflict(editingAppt.date, editingAppt.time, editingAppt.doctor, editingAppt.id) : null;
                  return (
                    <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>📌 المحجوز يوم {editingAppt.date} ({taken.length}):</div>
                      {taken.length === 0 ? (
                        <div style={{ fontSize: 13, color: "#15803d", fontWeight: 700 }}>✅ اليوم فاضي تماماً</div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {taken.map((a) => (
                            <span key={a.id} style={{ fontSize: 12, fontWeight: 800, borderRadius: 20, padding: "3px 12px", background: "#ede9fe", color: "#6d28d9", border: "1px solid #c4b5fd" }}>
                              🔒 {a.time} • {a.patientName}
                            </span>
                          ))}
                        </div>
                      )}
                      {clash && (
                        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "6px 12px" }}>
                          ⛔ الساعة {editingAppt.time} محجوزة ({clash.patientName}) — غيّر الساعة
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={closeEdit}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary">{t("common.saveEdits")}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 🧾 مودال فاتورة الكشف */}
        {invoicingAppt && (
          <div className="modal-backdrop" onClick={() => setInvoicingAppt(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h3><i className="fas fa-file-invoice-dollar" style={{ color: "#059669" }}></i> فاتورة كشف — {invoicingAppt.patientName}</h3>
                <button className="modal-close" onClick={() => setInvoicingAppt(null)}>&times;</button>
              </div>
              <form onSubmit={createInvoiceForAppt}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 }}>
                  📅 {invoicingAppt.date} • 🕐 {invoicingAppt.time} {invoicingAppt.doctor ? `• 👨‍⚕️ ${invoicingAppt.doctor}` : ""}
                </div>
                <label style={{ fontSize: 13, fontWeight: 700 }}>قيمة الكشف (ج.م) *</label>
                <input type="number" min="0" step="0.01" value={invoiceFee} onChange={(e) => setInvoiceFee(e.target.value)} style={styles.input} placeholder="مثال: 300" required autoFocus />
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={invoicePaid} onChange={(e) => setInvoicePaid(e.target.checked)} style={{ width: 18, height: 18, accentColor: "#059669" }} />
                  تم التحصيل نقداً (مدفوعة)
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={() => setInvoicingAppt(null)}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary" disabled={invoicing}>{invoicing ? "جاري الإصدار..." : "🧾 إصدار الفاتورة"}</button>
                </div>
              </form>
            </div>
          </div>
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
