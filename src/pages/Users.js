// src/pages/Users.js - إدارة المستخدمين مع دعم الترجمة
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { isSuperAdmin } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import PasswordStrengthMeter, { getPasswordStrength } from "../components/common/PasswordStrengthMeter";

export default function Users() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const hasAccess = isSuperAdmin(userRole);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    role: "user",
  });

  const fetchUsers = useCallback(async () => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      setUsers(querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching users:", error);
      alert(t("errors.fetchUsers"));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function addUser(e) {
    e.preventDefault();
    if (!newUser.email || !newUser.password) {
      alert(t("errors.fillFields"));
      return;
    }

    const { checks } = getPasswordStrength(newUser.password);
    if (!checks.uppercase) {
      alert(t("signup.needUppercase"));
      return;
    }
    if (!checks.symbol) {
      alert(t("signup.needSymbol"));
      return;
    }

    const role = superAdmin ? newUser.role : "user";
    const companyId =
      superAdmin && role === "super_admin" ? null : userCompanyId;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newUser.email,
        newUser.password,
      );
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role,
        companyId,
        isActive: true,
        createdAt: new Date().toISOString(),
      });

      setNewUser({ email: "", password: "", role: "user" });
      setShowAddModal(false);
      await fetchUsers();
      alert(t("success.userAdded"));
    } catch (error) {
      console.error("Error adding user:", error);
      alert(t("errors.addUser") + ": " + error.message);
    }
  }

  async function updateUserRole(userId, newRole) {
    if (!superAdmin && newRole !== "user") {
      alert(t("errors.roleRestricted"));
      return;
    }
    const roleLabels = {
      user: t("users.roleUser"),
      admin: t("users.roleAdmin"),
      super_admin: t("users.roleSuperAdmin"),
    };
    if (!window.confirm(t("users.confirmRoleChange", { role: roleLabels[newRole] || newRole })))
      return;

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { role: newRole });
      await fetchUsers();
      alert(t("success.roleUpdated"));
    } catch (error) {
      console.error("Error updating user role:", error);
      alert(t("errors.updateUser"));
    }
  }

  async function toggleUserStatus(userId, currentStatus) {
    const newStatus = !currentStatus;
    const action = newStatus ? t("users.activate") : t("users.deactivate");
    if (!window.confirm(t("users.confirmStatusChange", { action })))
      return;

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { isActive: newStatus });
      await fetchUsers();
      alert(t("success.statusChanged", { action }));
    } catch (error) {
      console.error("Error toggling user status:", error);
      alert(t("errors.updateUser"));
    }
  }

  async function deleteUser(userId) {
    if (!window.confirm(t("users.confirmDelete"))) return;

    try {
      await deleteDoc(doc(db, "users", userId));
      await fetchUsers();
      alert(t("success.userDeleted"));
    } catch (error) {
      console.error("Error deleting user:", error);
      alert(t("errors.deleteUser"));
    }
  }

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.role && user.role.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const getRoleBadgeClass = (role) => {
    if (role === "super_admin") return "badge-paid";
    if (role === "admin") return "badge-pending";
    return "badge-active";
  };

  const getRoleLabel = (role) => {
    if (role === "super_admin") return t("users.roleSuperAdmin");
    if (role === "admin") return t("users.roleAdmin");
    return t("users.roleUser");
  };

  const getStatusBadgeClass = (isActive) => {
    return isActive !== false ? "badge-active" : "badge-expired";
  };

  const getStatusLabel = (isActive) => {
    return isActive !== false ? t("users.statusActive") : t("users.statusInactive");
  };

  if (!hasAccess) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <div className="main-content">
          <div
            className="card"
            style={{ textAlign: "center", padding: "40px" }}
          >
            <i
              className="fas fa-lock"
              style={{ fontSize: "48px", color: "#ef4444" }}
            ></i>
            <h3 style={{ marginTop: "16px" }}>{t("errors.noAccessTitle")}</h3>
            <p style={{ color: "#64748b" }}>
              {t("errors.noAccessDesc")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        {t("users.loading")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ color: "#333", margin: 0 }}>
            <i className="fas fa-users" style={{ color: "#4f46e5" }}></i>{" "}
            {t("users.title")}
          </h2>
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            <i className="fas fa-plus"></i> {t("users.addUser")}
          </button>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("users.searchPlaceholder")}
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
            onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
            onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          />
        </div>

        <div className="table-container">
          <div className="table-header">
            <h3>{t("users.userList")}</h3>
            <span>{filteredUsers.length} {t("users.userCount")}</span>
          </div>
          {filteredUsers.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm
                ? "❌ " + t("users.noSearchResults")
                : t("users.noUsers")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("users.email")}</th>
                  <th>{t("users.role")}</th>
                  <th>{t("users.status")}</th>
                  <th>{t("users.createdAt")}</th>
                  <th>{t("users.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    style={{ opacity: user.isActive === false ? 0.5 : 1 }}
                  >
                    <td>{index + 1}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(user.isActive)}`}>
                        {getStatusLabel(user.isActive)}
                      </span>
                    </td>
                    <td>
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : "-"}
                    </td>
                    <td>
                      <select
                        onChange={(e) =>
                          updateUserRole(user.id, e.target.value)
                        }
                        defaultValue={user.role || "user"}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          fontSize: "13px",
                          marginLeft: "6px",
                        }}
                      >
                        <option value="user">{t("users.roleUser")}</option>
                        {superAdmin && <option value="admin">{t("users.roleAdmin")}</option>}
                        {superAdmin && (
                          <option value="super_admin">{t("users.roleSuperAdmin")}</option>
                        )}
                      </select>

                      <button
                        onClick={() =>
                          toggleUserStatus(user.id, user.isActive !== false)
                        }
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "12px",
                          cursor: "pointer",
                          marginLeft: "6px",
                          background:
                            user.isActive !== false ? "#f59e0b" : "#10b981",
                          color: "white",
                        }}
                      >
                        {user.isActive !== false ? t("users.deactivate") : t("users.activate")}
                      </button>

                      {user.id !== currentUser?.uid && (
                        <button
                          onClick={() => deleteUser(user.id)}
                          className="btn-danger"
                          style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            fontSize: "12px",
                          }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-user-plus"></i> {t("users.addUserTitle")}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={styles.closeBtn}
              >
                &times;
              </button>
            </div>
            <form onSubmit={addUser}>
              <div style={styles.formGroup}>
                <label>{t("users.email")}</label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("users.password")}</label>
                <input
                  type="password"
                  placeholder="********"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                  minLength="6"
                  style={styles.input}
                />
                <PasswordStrengthMeter password={newUser.password} />
              </div>
              {superAdmin && (
                <div style={styles.formGroup}>
                  <label>{t("users.role")}</label>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value })
                    }
                    style={styles.input}
                  >
                    <option value="user">{t("users.roleUser")}</option>
                    <option value="admin">{t("users.roleAdmin")}</option>
                    <option value="super_admin">{t("users.roleSuperAdmin")}</option>
                  </select>
                </div>
              )}
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className="btn-primary">
                  <i className="fas fa-save"></i> {t("users.addUserBtn")}
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
    maxWidth: "450px",
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
    transition: "color 0.3s",
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
    transition: "border-color 0.3s",
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