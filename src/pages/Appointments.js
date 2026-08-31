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
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, isSuperAdmin } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

const STATUS_BADGES = {
  scheduled: { bg: "#dbeafe", color: "#1d4ed8", label: "appt.scheduled" },
  confirmed: { bg: "#dcfce7", color: "#15803d", label: "appt.confirmed" },
  done: { bg: "#ede9fe", color: "#6d28d9", label: "appt.done" },
  cancelled: { bg: "#fee2e2", color: "#b91c1c", label: "appt.cancelled" },
  no_show: { bg: "#fef3c7", color: "#b45309", label: "appt.noShow" },
};

export default function Appointments() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
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

  async function addAppt(e) {
    e.preventDefault();
    const companyId = superAdmin ? newAppt.companyId : userCompanyId;
    if (!newAppt.patientId || !newAppt.date || !newAppt.time || !companyId) {
      alert(t("appt.fillRequired"));
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
      await updateDoc(doc(db, "appointments", id), {
        status,
        updatedAt: new Date().toISOString(),
      });
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

  const filtered = appointments.filter((a) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      (a.patientName || "").toLowerCase().includes(s) ||
      (a.doctor || "").toLowerCase().includes(s) ||
      (a.date || "").includes(s);
    let matchesFilter = true;
    if (filter === "today") matchesFilter = a.date === todayStr;
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
            <option value="upcoming">{t("appt.filterUpcoming")}</option>
            <option value="done">{t("appt.filterDone")}</option>
            <option value="cancelled">{t("appt.filterCancelled")}</option>
          </select>
        </div>

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
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button type="button" className="btn-secondary" onClick={closeEdit}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary">{t("common.saveEdits")}</button>
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
