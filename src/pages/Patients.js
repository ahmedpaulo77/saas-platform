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

export default function Patients() {
  const { t } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newPatient, setNewPatient] = useState({
    name: "",
    phone: "",
    email: "",
    age: "",
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
        age: newPatient.age || "",
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
        age: editingPatient.age || "",
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
                placeholder={t("pat.phAge")}
                value={newPatient.age}
                onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                style={styles.input}
              />
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
                      <td>{p.age || "—"}</td>
                      <td>
                        <span className={`badge ${p.gender === "male" ? "badge-active" : ""}`} style={p.gender === "female" ? { background: "#fce7f3", color: "#db2777", border: "1px solid #f9a8d4" } : {}}>
                          {p.gender === "male" ? "♂ " + t("pat.male") : "♀ " + t("pat.female")}
                        </span>
                      </td>
                      <td style={{ direction: "ltr" }}>{p.phone}</td>
                      <td>{p.bloodType || "—"}</td>
                      <td>{p.totalVisits || 0}</td>
                      <td>
                        <div className="table-actions">
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
                  <input type="number" placeholder={t("pat.phAge")} value={editingPatient.age || ""} onChange={(e) => setEditingPatient({ ...editingPatient, age: e.target.value })} style={styles.input} />
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
