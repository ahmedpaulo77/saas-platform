// src/pages/Users.js - إدارة المستخدمين مع دعم الترجمة وصلاحيات الأدمن/السوبر أدمن
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { db, createAuthUserWithoutSession } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { isSuperAdmin, canManageUsers } from "../utils/companyQuery";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";
import PasswordStrengthMeter, { getPasswordStrength } from "../components/common/PasswordStrengthMeter";

export default function Users() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const hasAccess = canManageUsers(userRole);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      let q;
      if (superAdmin) {
        q = collection(db, "users");
      } else {
        q = query(
          collection(db, "users"),
          where("companyId", "==", userCompanyId)
        );
      }
      const querySnapshot = await getDocs(q);
      setUsers(querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching users:", error);
      alert(t("errors.fetchUsers"));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, superAdmin, userCompanyId, t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function canUserBeManaged(user) {
    if (superAdmin) return true;
    if (!userCompanyId) return false;
    if (user.companyId !== userCompanyId) return false;
    if (user.role === "super_admin") return false;
    return true;
  }

  function canToggleUserStatus(user) {
    if (user.id === currentUser?.uid) return false;
    return canUserBeManaged(user);
  }

  function canChangeUserRole(user) {
    if (superAdmin) return true;
    return canUserBeManaged(user);
  }

  function canDeleteUser(user) {
    if (user.id === currentUser?.uid) return false;
    if (superAdmin) return true;
    return canUserBeManaged(user);
  }

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

    let targetRole = newUser.role;
    if (!superAdmin) {
      if (targetRole !== "user" && targetRole !== "admin") {
        targetRole = "user";
      }
    }

    const companyId =
      superAdmin && targetRole === "super_admin" ? null : userCompanyId;

    setSubmitting(true);
    try {
      const newCred = await createAuthUserWithoutSession(
        newUser.email,
        newUser.password,
      );

      await setDoc(doc(db, "users", newCred.uid), {
        email: newCred.email,
        role: targetRole,
        companyId,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      
      await logActivity({
        actionType: 'CREATE',
        collectionName: 'users',
        itemId: newCred.uid,
        details: `Created user: ${newCred.email} (${targetRole})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewUser({ email: "", password: "", role: "user" });
      setShowAddModal(false);
      await fetchUsers();
      alert(t("success.userAdded"));
    } catch (error) {
      console.error("Error adding user:", error);
      if (error.code === 'auth/email-already-in-use') {
        alert(t("mu.exists"));
      } else {
        alert(t("errors.addUser") + ": " + (error.message || error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function updateUserRole(userId, targetUser, newRole) {
    if (!superAdmin) {
      if (targetUser.role === "super_admin") {
        alert(t("errors.roleRestricted"));
        return;
      }
      if (newRole !== "user" && newRole !== "admin") {
        alert(t("errors.roleRestricted"));
        return;
      }
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
      
      await logActivity({
        actionType: 'UPDATE',
        collectionName: 'users',
        itemId: userId,
        details: `Updated user role to ${newRole}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      
      await fetchUsers();
      alert(t("success.roleUpdated"));
    } catch (error) {
      console.error("Error updating user role:", error);
      alert(t("errors.updateUser"));
    }
  }

  async function toggleUserStatus(userId, targetUser, currentStatus) {
    if (!canToggleUserStatus(targetUser)) {
      alert(t("errors.noAccess"));
      return;
    }
    const newStatus = !currentStatus;
    const action = newStatus ? t("users.activate") : t("users.deactivate");
    if (!window.confirm(t("users.confirmStatusChange", { action })))
      return;

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, { isActive: newStatus });
      
      await logActivity({
        actionType: 'UPDATE',
        collectionName: 'users',
        itemId: userId,
        details: `${newStatus ? 'Activated' : 'Deactivated'} user`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      
      await fetchUsers();
      alert(t("success.statusChanged", { action }));
    } catch (error) {
      console.error("Error toggling user status:", error);
      alert(t("errors.updateUser"));
    }
  }

  async function deleteUser(userId, targetUser) {
    if (!canDeleteUser(targetUser)) {
      alert(t("errors.noAccess"));
      return;
    }
    if (!window.confirm(t("users.confirmDelete"))) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      const userEmail = userDoc.exists() ? userDoc.data().email : 'Unknown';
      
      await deleteDoc(doc(db, "users", userId));
      
      await logActivity({
        actionType: 'DELETE',
        collectionName: 'users',
        itemId: userId,
        details: `Deleted user: ${userEmail}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      
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
            {!superAdmin && (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#64748b",
                  marginRight: "10px",
                }}
              >
                ({t("role.adminShort")})
              </span>
            )}
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
                          updateUserRole(user.id, user, e.target.value)
                        }
                        defaultValue={user.role || "user"}
                        disabled={!canChangeUserRole(user)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          fontSize: "13px",
                          marginLeft: "6px",
                          opacity: canChangeUserRole(user) ? 1 : 0.45,
                          cursor: canChangeUserRole(user) ? "pointer" : "not-allowed",
                        }}
                      >
                        <option value="user">{t("users.roleUser")}</option>
                        <option value="admin">{t("users.roleAdmin")}</option>
                        {superAdmin && (
                          <option value="super_admin">{t("users.roleSuperAdmin")}</option>
                        )}
                      </select>

                      <button
                        onClick={() =>
                          toggleUserStatus(user.id, user, user.isActive !== false)
                        }
                        disabled={!canToggleUserStatus(user)}
                        title={
                          !canToggleUserStatus(user) && user.id === currentUser?.uid
                            ? "لا يمكنك إيقاف نفسك"
                            : !canToggleUserStatus(user)
                            ? "غير مصرح لك"
                            : ""
                        }
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "none",
                          fontSize: "12px",
                          cursor: canToggleUserStatus(user) ? "pointer" : "not-allowed",
                          marginLeft: "6px",
                          background:
                            user.isActive !== false ? "#f59e0b" : "#10b981",
                          color: "white",
                          opacity: canToggleUserStatus(user) ? 1 : 0.5,
                        }}
                      >
                        {user.isActive !== false ? t("users.deactivate") : t("users.activate")}
                      </button>

                      {canDeleteUser(user) && (
                        <button
                          onClick={() => deleteUser(user.id, user)}
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
                  {superAdmin && (
                    <option value="super_admin">{t("users.roleSuperAdmin")}</option>
                  )}
                </select>
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-danger"
                  style={{ marginLeft: "10px" }}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? (
                    <><i className="fas fa-spinner fa-spin"></i> {t("common.saving")}</>
                  ) : (
                    <><i className="fas fa-save"></i> {t("users.addUserBtn")}</>
                  )}
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
