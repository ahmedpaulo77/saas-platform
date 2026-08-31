import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery, isSuperAdmin } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Prescriptions() {
  const { t, lang } = useLanguage();
  const { userRole, userCompanyId, currentUser } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newRx, setNewRx] = useState({
    patientId: "",
    doctor: "",
    diagnosis: "",
    notes: "",
    medicines: [{ name: "", dose: "", frequency: "", duration: "", notes: "" }],
    companyId: "",
  });
  const [editingRx, setEditingRx] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [viewingRx, setViewingRx] = useState(null);
  const [loading, setLoading] = useState(true);

  const stats = {
    total: prescriptions.length,
    thisMonth: prescriptions.filter((r) => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
  };

  const fetchPrescriptions = useCallback(async () => {
    try {
      const snap = await getDocs(
        getScopedQuery("prescriptions", userRole, userCompanyId, currentUser?.uid)
      );
      const data = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPrescriptions(data);
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
      snap.forEach((d) => data.push({ id: d.id, name: d.data().name, age: d.data().age, gender: d.data().gender }));
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
    fetchPrescriptions();
    fetchPatients();
    fetchCompanies();
  }, [fetchPrescriptions, fetchPatients, fetchCompanies]);

  async function getNextRxNumber() {
    try {
      const q = query(
        collection(db, "prescriptions"),
        orderBy("rxNumber", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return "RX-000001";
      const last = snap.docs[0].data()?.rxNumber || "RX-000000";
      const num = parseInt(last.replace("RX-", ""), 10) || 0;
      return `RX-${String(num + 1).padStart(6, "0")}`;
    } catch {
      return "RX-" + Date.now();
    }
  }

  function addMed(tgt, setTgt) {
    setTgt({
      ...tgt,
      medicines: [...tgt.medicines, { name: "", dose: "", frequency: "", duration: "", notes: "" }],
    });
  }

  function removeMed(tgt, setTgt, idx) {
    setTgt({
      ...tgt,
      medicines: tgt.medicines.filter((_, i) => i !== idx),
    });
  }

  function updateMed(tgt, setTgt, idx, field, value) {
    const meds = [...tgt.medicines];
    meds[idx] = { ...meds[idx], [field]: value };
    setTgt({ ...tgt, medicines: meds });
  }

  async function addRx(e) {
    e.preventDefault();
    const companyId = superAdmin ? newRx.companyId : userCompanyId;
    const hasMeds = newRx.medicines.some((m) => m.name.trim());
    if (!newRx.patientId || !hasMeds || !companyId) {
      alert(t("rx.fillRequired"));
      return;
    }
    try {
      const rxNumber = await getNextRxNumber();
      const patient = patients.find((p) => p.id === newRx.patientId);
      const cleanMeds = newRx.medicines.filter((m) => m.name.trim());
      await addDoc(collection(db, "prescriptions"), {
        rxNumber,
        patientId: newRx.patientId,
        patientName: patient?.name || "",
        patientAge: patient?.age || "",
        patientGender: patient?.gender || "",
        doctor: newRx.doctor || "",
        diagnosis: newRx.diagnosis || "",
        notes: newRx.notes || "",
        medicines: cleanMeds,
        companyId,
        createdBy: currentUser?.uid,
        createdAt: new Date().toISOString(),
      });
      setNewRx({
        patientId: "",
        doctor: "",
        diagnosis: "",
        notes: "",
        medicines: [{ name: "", dose: "", frequency: "", duration: "", notes: "" }],
        companyId: superAdmin ? "" : userCompanyId,
      });
      await fetchPrescriptions();
      alert(t("rx.addOk"));
    } catch (e) {
      console.error(e);
      alert(t("rx.addFail"));
    }
  }

  function openEdit(r) {
    setEditingRx({
      ...r,
      medicines: r.medicines?.length ? r.medicines.map((m) => ({ ...m })) : [{ name: "", dose: "", frequency: "", duration: "", notes: "" }],
    });
    setShowEditModal(true);
  }
  function closeEdit() {
    setEditingRx(null);
    setShowEditModal(false);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const hasMeds = editingRx.medicines.some((m) => m.name.trim());
    if (!editingRx.patientId || !hasMeds) {
      alert(t("rx.fillRequired"));
      return;
    }
    try {
      const patient = patients.find((p) => p.id === editingRx.patientId);
      const cleanMeds = editingRx.medicines.filter((m) => m.name.trim());
      await updateDoc(doc(db, "prescriptions", editingRx.id), {
        patientId: editingRx.patientId,
        patientName: patient?.name || editingRx.patientName,
        patientAge: patient?.age || editingRx.patientAge,
        patientGender: patient?.gender || editingRx.patientGender,
        doctor: editingRx.doctor || "",
        diagnosis: editingRx.diagnosis || "",
        notes: editingRx.notes || "",
        medicines: cleanMeds,
        updatedAt: new Date().toISOString(),
      });
      closeEdit();
      await fetchPrescriptions();
      alert(t("rx.updOk"));
    } catch (e) {
      console.error(e);
      alert(t("rx.updFail"));
    }
  }

  async function delRx(id) {
    if (!window.confirm(t("rx.delConfirm"))) return;
    try {
      await deleteDoc(doc(db, "prescriptions", id));
      await fetchPrescriptions();
      alert(t("rx.delOk"));
    } catch (e) {
      console.error(e);
      alert(t("rx.delFail"));
    }
  }

  function printRx(rx) {
    setViewingRx(rx);
    setTimeout(() => window.print(), 250);
  }

  const filtered = prescriptions.filter((r) => {
    const s = searchTerm.toLowerCase();
    return (
      (r.patientName || "").toLowerCase().includes(s) ||
      (r.rxNumber || "").toLowerCase().includes(s) ||
      (r.doctor || "").toLowerCase().includes(s) ||
      (r.createdAt || "").includes(s)
    );
  });

  if (loading)
    return (
      <div className="loading">
        <div className="spinner"></div>
        {t("rx.loading")}
      </div>
    );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div
          style={{
            background: "linear-gradient(135deg,#7c3aed,#c026d3)",
            borderRadius: "var(--radius)",
            padding: "20px 24px",
            marginBottom: 20,
            color: "white",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            📝 {t("rx.title")}
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            {t("rx.subtitle")}
          </p>
        </div>

        <div className="stats-row">
          <div className="stat-card purple">
            <div className="stat-icon"><i className="fas fa-prescription"></i></div>
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t("rx.total")}</div>
          </div>
          <div className="stat-card indigo">
            <div className="stat-icon"><i className="fas fa-calendar"></i></div>
            <div className="stat-value">{stats.thisMonth}</div>
            <div className="stat-label">{t("rx.thisMonth")}</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon"><i className="fas fa-pills"></i></div>
            <div className="stat-value">
              {prescriptions.reduce((acc, r) => acc + (r.medicines?.length || 0), 0)}
            </div>
            <div className="stat-label">{t("rx.medicines")}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon"><i className="fas fa-users"></i></div>
            <div className="stat-value">{new Set(prescriptions.map((r) => r.patientId)).size}</div>
            <div className="stat-label">{t("pat.total")}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            <i className="fas fa-file-prescription"></i> {t("rx.add")}
          </h3>
          <form onSubmit={addRx}>
            <div style={styles.grid}>
              <select
                value={newRx.patientId}
                onChange={(e) => setNewRx({ ...newRx, patientId: e.target.value })}
                style={styles.input}
                required
              >
                <option value="">{t("rx.choosePatient")}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                placeholder={t("rx.phDoctor")}
                value={newRx.doctor}
                onChange={(e) => setNewRx({ ...newRx, doctor: e.target.value })}
                style={styles.input}
              />
              {superAdmin && (
                <select
                  value={newRx.companyId}
                  onChange={(e) => setNewRx({ ...newRx, companyId: e.target.value })}
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
                placeholder={t("rx.phDiagnosis")}
                value={newRx.diagnosis}
                onChange={(e) => setNewRx({ ...newRx, diagnosis: e.target.value })}
                style={{ ...styles.input, gridColumn: "1 / -1", minHeight: 60 }}
              />
            </div>

            <div style={{ marginTop: 20, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 style={{ margin: 0, color: "#0f172a" }}>💊 {t("rx.medicines")}</h4>
                <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => addMed(newRx, setNewRx)}>
                  <i className="fas fa-plus"></i> {t("rx.addMed")}
                </button>
              </div>
              {newRx.medicines.map((m, i) => (
                <div key={i} style={{ border: "1px solid var(--gray-200)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10, background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ color: "#475569" }}>{t("rx.medName")} #{i + 1}</strong>
                    {newRx.medicines.length > 1 && (
                      <button type="button" className="btn-danger btn-sm" onClick={() => removeMed(newRx, setNewRx, i)}>
                        <i className="fas fa-trash"></i> {t("rx.removeMed")}
                      </button>
                    )}
                  </div>
                  <div style={styles.grid}>
                    <input placeholder={t("rx.phMedName")} value={m.name} onChange={(e) => updateMed(newRx, setNewRx, i, "name", e.target.value)} style={styles.input} />
                    <input placeholder={t("rx.phDose")} value={m.dose} onChange={(e) => updateMed(newRx, setNewRx, i, "dose", e.target.value)} style={styles.input} />
                    <input placeholder={t("rx.phFrequency")} value={m.frequency} onChange={(e) => updateMed(newRx, setNewRx, i, "frequency", e.target.value)} style={styles.input} />
                    <input placeholder={t("rx.phDuration")} value={m.duration} onChange={(e) => updateMed(newRx, setNewRx, i, "duration", e.target.value)} style={styles.input} />
                    <input placeholder={t("rx.phMedNotes")} value={m.notes} onChange={(e) => updateMed(newRx, setNewRx, i, "notes", e.target.value)} style={{ ...styles.input, gridColumn: "1 / -1" }} />
                  </div>
                </div>
              ))}
            </div>

            <textarea
              placeholder={t("rx.phNotes")}
              value={newRx.notes}
              onChange={(e) => setNewRx({ ...newRx, notes: e.target.value })}
              style={{ ...styles.input, minHeight: 70, marginBottom: 12 }}
            />

            <button type="submit" className="btn-primary" style={{ marginTop: 8 }}>
              <i className="fas fa-plus"></i> {t("rx.add")}
            </button>
          </form>
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3><i className="fas fa-list"></i> {t("rx.list")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="search-wrapper" style={{ width: 280 }}>
                <i className="fas fa-search search-icon"></i>
                <input type="text" placeholder={t("rx.search")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <span className="table-count">{filtered.length}</span>
            </div>
          </div>
          <div className="table-wrapper">
            {filtered.length === 0 ? (
              <div className="table-empty">
                <i className="fas fa-file-prescription"></i>
                <p>{searchTerm ? t("rx.emptySearch") : t("rx.empty")}</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("rx.number")}</th>
                    <th>{t("rx.patient")}</th>
                    <th>{t("rx.doctor")}</th>
                    <th>{t("rx.medicines")}</th>
                    <th>{t("rx.date")}</th>
                    <th>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: "#7c3aed", fontFamily: "monospace" }}>{r.rxNumber}</td>
                      <td style={{ fontWeight: 700 }}>{r.patientName}</td>
                      <td>{r.doctor || "—"}</td>
                      <td>
                        <span className="badge badge-active">
                          {r.medicines?.length || 0} {t("rx.medicines")}
                        </span>
                      </td>
                      <td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                      <td>
                        <div className="table-actions">
                          <button onClick={() => printRx(r)} className="btn-primary btn-sm" title={t("rx.print")}>
                            <i className="fas fa-print"></i>
                          </button>
                          <button onClick={() => openEdit(r)} className="btn-secondary btn-sm">
                            <i className="fas fa-edit"></i>
                          </button>
                          <button onClick={() => delRx(r.id)} className="btn-danger btn-sm">
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

        {showEditModal && editingRx && (
          <div className="modal-backdrop" onClick={closeEdit}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
              <div className="modal-header">
                <h3>{t("rx.editTitle")}</h3>
                <button className="modal-close" onClick={closeEdit}>&times;</button>
              </div>
              <form onSubmit={saveEdit}>
                <div style={styles.grid}>
                  <select
                    value={editingRx.patientId}
                    onChange={(e) => setEditingRx({ ...editingRx, patientId: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">{t("rx.choosePatient")}</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input placeholder={t("rx.phDoctor")} value={editingRx.doctor || ""} onChange={(e) => setEditingRx({ ...editingRx, doctor: e.target.value })} style={styles.input} />
                </div>
                <textarea
                  placeholder={t("rx.phDiagnosis")}
                  value={editingRx.diagnosis || ""}
                  onChange={(e) => setEditingRx({ ...editingRx, diagnosis: e.target.value })}
                  style={{ ...styles.input, minHeight: 60, marginTop: 12 }}
                />

                <div style={{ marginTop: 20, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h4 style={{ margin: 0, color: "#0f172a" }}>💊 {t("rx.medicines")}</h4>
                    <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => addMed(editingRx, setEditingRx)}>
                      <i className="fas fa-plus"></i> {t("rx.addMed")}
                    </button>
                  </div>
                  {editingRx.medicines.map((m, i) => (
                    <div key={i} style={{ border: "1px solid var(--gray-200)", borderRadius: "var(--radius)", padding: 14, marginBottom: 10, background: "#f8fafc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <strong style={{ color: "#475569" }}>{t("rx.medName")} #{i + 1}</strong>
                        {editingRx.medicines.length > 1 && (
                          <button type="button" className="btn-danger btn-sm" onClick={() => removeMed(editingRx, setEditingRx, i)}>
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                      <div style={styles.grid}>
                        <input placeholder={t("rx.phMedName")} value={m.name || ""} onChange={(e) => updateMed(editingRx, setEditingRx, i, "name", e.target.value)} style={styles.input} />
                        <input placeholder={t("rx.phDose")} value={m.dose || ""} onChange={(e) => updateMed(editingRx, setEditingRx, i, "dose", e.target.value)} style={styles.input} />
                        <input placeholder={t("rx.phFrequency")} value={m.frequency || ""} onChange={(e) => updateMed(editingRx, setEditingRx, i, "frequency", e.target.value)} style={styles.input} />
                        <input placeholder={t("rx.phDuration")} value={m.duration || ""} onChange={(e) => updateMed(editingRx, setEditingRx, i, "duration", e.target.value)} style={styles.input} />
                        <input placeholder={t("rx.phMedNotes")} value={m.notes || ""} onChange={(e) => updateMed(editingRx, setEditingRx, i, "notes", e.target.value)} style={{ ...styles.input, gridColumn: "1 / -1" }} />
                      </div>
                    </div>
                  ))}
                </div>

                <textarea
                  placeholder={t("rx.phNotes")}
                  value={editingRx.notes || ""}
                  onChange={(e) => setEditingRx({ ...editingRx, notes: e.target.value })}
                  style={{ ...styles.input, minHeight: 70, marginBottom: 12 }}
                />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn-secondary" onClick={closeEdit}>{t("common.cancel")}</button>
                  <button type="submit" className="btn-primary">{t("common.saveEdits")}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewingRx && (
          <div className="modal-backdrop" onClick={() => setViewingRx(null)}>
            <div className="modal rx-print" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
              <div className="modal-header no-print">
                <h3>{t("rx.viewTitle")}</h3>
                <button className="modal-close" onClick={() => setViewingRx(null)}>&times;</button>
              </div>
              <div style={styles.rxPaper}>
                <div style={styles.rxHeader}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#7c3aed" }}>℞</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{t("rx.number")}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace" }}>{viewingRx.rxNumber}</div>
                  </div>
                  <div style={{ textAlign: lang === "ar" ? "right" : "left" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{viewingRx.doctor || "—"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {viewingRx.createdAt ? new Date(viewingRx.createdAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                </div>
                <div style={styles.rxSection}>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>{t("rx.patient")}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                    {viewingRx.patientName || "—"}
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>
                    {viewingRx.patientAge ? `${t("pat.age")}: ${viewingRx.patientAge}` : ""}
                    {viewingRx.patientAge && viewingRx.patientGender ? " • " : ""}
                    {viewingRx.patientGender ? t(viewingRx.patientGender === "male" ? "pat.male" : "pat.female") : ""}
                  </div>
                </div>
                {viewingRx.diagnosis && (
                  <div style={styles.rxSection}>
                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{t("rx.diagnosis")}</div>
                    <div style={{ fontSize: 15, color: "#0f172a" }}>{viewingRx.diagnosis}</div>
                  </div>
                )}
                <div style={styles.rxSection}>
                  <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>💊 {t("rx.medicines")}</div>
                  <div>
                    {(viewingRx.medicines || []).map((m, i) => (
                      <div key={i} style={styles.rxMedRow}>
                        <div style={{ fontSize: 12, color: "#94a3b8", width: 30 }}>{i + 1}.</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{m.name}</div>
                          <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
                            {m.dose && <span>{m.dose}</span>}
                            {m.dose && m.frequency ? " • " : ""}
                            {m.frequency && <span>{m.frequency}</span>}
                            {m.duration && (m.dose || m.frequency) ? " • " : ""}
                            {m.duration && <span>{m.duration}</span>}
                          </div>
                          {m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{m.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {viewingRx.notes && (
                  <div style={styles.rxSection}>
                    <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{t("rx.notes")}</div>
                    <div style={{ fontSize: 14, color: "#334155", whiteSpace: "pre-wrap" }}>{viewingRx.notes}</div>
                  </div>
                )}
                <div style={styles.rxFooter}>
                  <div style={{ textAlign: "center", color: "#64748b", fontSize: 12, fontStyle: "italic" }}>
                    — {t("rx.print")} —
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }} className="no-print">
                <button className="btn-secondary" onClick={() => setViewingRx(null)}>{t("common.close")}</button>
                <button className="btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> {t("rx.print")}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .rx-print, .rx-print * { visibility: visible !important; }
            .rx-print { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; border: none !important; padding: 0 !important; }
            .no-print { display: none !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
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
  rxPaper: {
    background: "white",
    borderRadius: "var(--radius)",
    padding: 28,
    border: "2px solid #e2e8f0",
  },
  rxHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 18,
    borderBottom: "2px solid #f1f5f9",
    marginBottom: 18,
  },
  rxSection: {
    padding: "14px 0",
    borderBottom: "1px dashed #e2e8f0",
  },
  rxMedRow: {
    display: "flex",
    gap: 12,
    padding: "12px 10px",
    marginBottom: 6,
    background: "#faf5ff",
    borderRadius: "var(--radius-sm)",
  },
  rxFooter: {
    marginTop: 22,
    paddingTop: 16,
    borderTop: "2px solid #f1f5f9",
  },
};
