// src/pages/Clients.js - مع عزل البيانات حسب الشركة
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

export default function Clients() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newClient, setNewClient] = useState({
    name: "",
    email: "",
    phone: "",
    companyId: "",
  });
  const [companies, setCompanies] = useState([]);
  const [editingClient, setEditingClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(
        getScopedQuery("clients", userRole, userCompanyId)
      );
      const clientsData = [];
      querySnapshot.forEach((d) => {
        clientsData.push({ id: d.id, ...d.data() });
      });
      setClients(clientsData);
    } catch (error) {
      console.error("Error fetching clients:", error);
      alert(t("cli.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, t]);

  const fetchCompanies = useCallback(async () => {
    try {
      if (superAdmin) {
        const querySnapshot = await getDocs(collection(db, "companies"));
        const companiesData = [];
        querySnapshot.forEach((d) => {
          companiesData.push({ id: d.id, name: d.data().name });
        });
        setCompanies(companiesData);
      } else if (userCompanyId) {
        const snap = await getDoc(doc(db, "companies", userCompanyId));
        setCompanies(
          snap.exists() ? [{ id: snap.id, name: snap.data().name }] : []
        );
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  }, [superAdmin, userCompanyId]);

  useEffect(() => {
    fetchClients();
    fetchCompanies();
  }, [fetchClients, fetchCompanies]);

  async function addClient(e) {
    e.preventDefault();
    const companyId = superAdmin ? newClient.companyId : userCompanyId;
    if (!newClient.name || !newClient.email || !companyId) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      await addDoc(collection(db, "clients"), {
        name: newClient.name,
        email: newClient.email,
        phone: newClient.phone,
        companyId,
        createdAt: new Date().toISOString(),
      });
      setNewClient({
        name: "",
        email: "",
        phone: "",
        companyId: superAdmin ? "" : userCompanyId,
      });
      await fetchClients();
      alert(t("cli.addOk"));
    } catch (error) {
      console.error("Error adding client:", error);
      alert(t("cli.addFail"));
    }
  }

  function openEditModal(client) {
    setEditingClient(client);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingClient(null);
    setShowEditModal(false);
  }

  async function updateClient(e) {
    e.preventDefault();
    if (!editingClient.name || !editingClient.email || !editingClient.companyId) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const clientRef = doc(db, "clients", editingClient.id);
      await updateDoc(clientRef, {
        name: editingClient.name,
        email: editingClient.email,
        phone: editingClient.phone || "",
        companyId: editingClient.companyId,
      });
      await fetchClients();
      closeEditModal();
      alert(t("cli.updOk"));
    } catch (error) {
      console.error("Error updating client:", error);
      alert(t("cli.updFail"));
    }
  }

  async function deleteClient(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "clients", id));
      await fetchClients();
      alert(t("cli.delOk"));
    } catch (error) {
      console.error("Error deleting client:", error);
      alert(t("cli.delFail"));
    }
  }

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.phone && client.phone.includes(searchTerm))
  );

  if (loading) {
    return <div className="loading">{t("cli.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          👥 {t("cli.title")}
        </h2>

        <form onSubmit={addClient} className="form-container">
          <input
            type="text"
            placeholder={t("cli.name")}
            value={newClient.name}
            onChange={(e) =>
              setNewClient({ ...newClient, name: e.target.value })
            }
            required
          />
          <input
            type="email"
            placeholder={t("common.email")}
            value={newClient.email}
            onChange={(e) =>
              setNewClient({ ...newClient, email: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder={t("common.phone")}
            value={newClient.phone}
            onChange={(e) =>
              setNewClient({ ...newClient, phone: e.target.value })
            }
          />
          <select
            value={superAdmin ? newClient.companyId : userCompanyId}
            onChange={(e) =>
              setNewClient({ ...newClient, companyId: e.target.value })
            }
            required
            disabled={!superAdmin}
          >
            <option value="">{t("cli.chooseCompany")}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> {t("cli.add")}
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("cli.search")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "2px solid #e2e8f0",
              borderRadius: "10px",
              fontSize: "15px",
              outline: "none",
            }}
          />
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>{t("cli.list")}</h3>
            <span>{filteredClients.length} {t("cli.clients")}</span>
          </div>
          {filteredClients.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? t("common.noResults") : t("cli.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("cli.name")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("common.phone")}</th>
                  <th>{t("cli.company")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, index) => {
                  const companyName =
                    companies.find((c) => c.id === client.companyId)?.name ||
                    t("common.unspecified");
                  return (
                    <tr key={client.id}>
                      <td>{index + 1}</td>
                      <td>{client.name}</td>
                      <td>{client.email}</td>
                      <td>{client.phone || "-"}</td>
                      <td>{companyName}</td>
                      <td>
                        <button
                          onClick={() => openEditModal(client)}
                          className="btn-primary"
                          style={{
                            marginLeft: "8px",
                            padding: "6px 14px",
                            fontSize: "13px",
                          }}
                        >
                          <i className="fas fa-edit"></i> {t("common.edit")}
                        </button>
                        <button
                          onClick={() => deleteClient(client.id)}
                          className="btn-danger"
                        >
                          <i className="fas fa-trash"></i> {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showEditModal && editingClient && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {t("cli.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateClient}>
              <div style={styles.formGroup}>
                <label>{t("cli.name")}</label>
                <input
                  type="text"
                  value={editingClient.name}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, name: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.email")}</label>
                <input
                  type="email"
                  value={editingClient.email}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, email: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.phone")}</label>
                <input
                  type="text"
                  value={editingClient.phone || ""}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, phone: e.target.value })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("cli.company")}</label>
                <select
                  value={editingClient.companyId}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      companyId: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                  disabled={!superAdmin}
                >
                  <option value="">{t("cli.chooseCompany")}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
                >
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
  );
}

const styles = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "30px",
    width: "90%",
    maxWidth: "500px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
    direction: "rtl",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    borderBottom: "1px solid #e2e8f0",
    paddingBottom: "15px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "28px",
    cursor: "pointer",
    color: "#94a3b8",
  },
  formGroup: {
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "2px solid #e2e8f0",
    borderRadius: "10px",
    fontSize: "15px",
    marginTop: "6px",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "20px",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "20px",
  },
};