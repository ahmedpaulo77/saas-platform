// src/pages/Companies.js
import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { isSuperAdmin, generateInviteCode } from "../utils/companyQuery";
import { INDUSTRIES, INDUSTRY_LABELS } from "../utils/modules";
import { logActivity } from "../utils/auditLogger";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Companies() {
  const { t } = useLanguage();
  const { currentUser, userRole, userCompanyId } = useAuth();
  const superAdmin = isSuperAdmin(userRole);
  const [companies, setCompanies] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newCompany, setNewCompany] = useState({
    name: "",
    email: "",
    industry: "general",
  });
  const [editingCompany, setEditingCompany] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;

    if (superAdmin) {
      unsubscribe = onSnapshot(
        collection(db, "companies"),
        (snapshot) => {
          const companiesData = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setCompanies(companiesData);
          setLoading(false);
        },
        (err) => {
          console.error("Error listening to companies:", err);
          setLoading(false);
        }
      );
    } else if (userCompanyId) {
      unsubscribe = onSnapshot(doc(db, "companies", userCompanyId), (docSnap) => {
        if (docSnap.exists()) {
          setCompanies([{ id: docSnap.id, ...docSnap.data() }]);
        } else {
          setCompanies([]);
        }
        setLoading(false);
      });
    } else {
      setCompanies([]);
      setLoading(false);
    }

    return () => unsubscribe && unsubscribe();
  }, [superAdmin, userCompanyId]);

  async function addCompany(e) {
    e.preventDefault();
    if (!newCompany.name || !newCompany.email) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "companies"), {
        name: newCompany.name,
        email: newCompany.email,
        industry: newCompany.industry || "general",
        createdAt: new Date().toISOString(),
        isActive: true,
        creatorUid: currentUser.uid, // ✅ مطلوب حسب الـ Rules الجديدة
      });

      // ✅ الأكواد بقت في invite_codes بدل ما تكون حقول جوا الشركة
      const adminCode = generateInviteCode('ADMIN_' + newCompany.name);
      const userCode = generateInviteCode('USER_' + newCompany.name);

      await setDoc(doc(db, 'invite_codes', adminCode), {
        companyId: docRef.id,
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      await setDoc(doc(db, 'invite_codes', userCode), {
        companyId: docRef.id,
        role: 'user',
        createdAt: new Date().toISOString(),
      });

      // ⚠️ السوبر أدمن مش isAdmin() لشركة العميل (userCompanyId بتاعه مختلف)،
      // فمينفعش يكتب في companies/{id}/codes/current (مقفولة على أدمن الشركة نفسها).
      // ده مقصود ومتوقع — الأدمن الحقيقي أول ما يدخل MyCompany.js هيلاقي
      // نسخة العرض فاضية، والكود هيتحقق من وجوده تلقائيًا ويولّد نسخة عرض بنفسه
      // (الكود اللي طبعناه في alert فوق لسه شغال 100% للانضمام في الوقت ده).

      // ⚠️ مسار ميت فعليًا (الفورم ده معروض للسوبر أدمن بس حاليًا)، وحتى لو
      // اتنفذ يومًا ما، الـ Rules الجديدة بترفضه عمدًا (مينفعش يوزر يغيّر
      // companyId بتاعه بنفسه بعد ما يتسجل أول مرة). سيبته لأمانة النقل بس.
      if (!superAdmin && currentUser) {
        await updateDoc(doc(db, "users", currentUser.uid), {
          companyId: docRef.id,
        });
      }

      // ✅ Audit Log
      await logActivity({
        actionType: 'CREATE',
        collectionName: 'companies',
        itemId: docRef.id,
        details: `Created company: ${newCompany.name} (${newCompany.industry || 'general'})`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      setNewCompany({
        name: "",
        email: "",
        industry: "general",
      });

      // ⚠️ آخر مرة هتشوف فيها الأكواد دي — مفيش list على invite_codes،
      // فلو ضاعوا الحل الوحيد إنك تولّد أكواد جديدة، مش تشوف القدام تاني
      alert(
        `${t("co.addOk")}\n\nAdmin code: ${adminCode}\nUser code: ${userCode}\n\n⚠️ احفظ الأكواد دي — مش هتقدر تشوفها تاني من هنا.`
      );
    } catch (error) {
      console.error("Error adding company:", error);
      alert(t("co.addFail"));
    }
  }

  function openEditModal(company) {
    setEditingCompany(company);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingCompany(null);
    setShowEditModal(false);
  }

  async function updateCompany(e) {
    e.preventDefault();
    if (!editingCompany.name || !editingCompany.email) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const companyRef = doc(db, "companies", editingCompany.id);
      await updateDoc(companyRef, {
        name: editingCompany.name,
        email: editingCompany.email,
        industry: editingCompany.industry || "general",
      });
      
      // ✅ Audit Log
      await logActivity({
        actionType: 'UPDATE',
        collectionName: 'companies',
        itemId: editingCompany.id,
        details: `Updated company: ${editingCompany.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      
      closeEditModal();
      alert(t("co.updOk"));
    } catch (error) {
      console.error("Error updating company:", error);
      alert(t("co.updFail"));
    }
  }

  async function deleteCompany(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      // Get company name before deletion for audit log
      const companyDoc = await getDoc(doc(db, "companies", id));
      const companyName = companyDoc.exists() ? companyDoc.data().name : 'Unknown';
      
      await deleteDoc(doc(db, "companies", id));
      
      // ✅ Audit Log
      await logActivity({
        actionType: 'DELETE',
        collectionName: 'companies',
        itemId: id,
        details: `Deleted company: ${companyName}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });
      
      alert(t("co.delOk"));
    } catch (error) {
      console.error("Error deleting company:", error);
      alert(t("co.delFail"));
    }
  }

  async function regenerateInviteCode(company, role) {
    if (!window.confirm(t("co.confirmRegenerate") || "هتولّد كود جديد — الكود القديم (لو موجود) هيفضل شغال لحد ما تحذفه يدويًا. متابع؟")) return;
    try {
      const newCode = generateInviteCode(`${role.toUpperCase()}_${company.name}_${Date.now()}`);
      await setDoc(doc(db, "invite_codes", newCode), {
        companyId: company.id,
        role,
        createdAt: new Date().toISOString(),
      });
      // ⚠️ ملاحظة: ده مش بيحدّث companies/{id}/codes/current (نسخة العرض بتاعة
      // MyCompany.js) لأن السوبر أدمن مش isAdmin() لشركة العميل. لو الأدمن الحقيقي
      // فاتح MyCompany.js قبل كده وشايف كود قديم، هيفضل شايفه لحد ما يدوس "توليد"
      // بنفسه من صفحته هو. الكود الجديد هنا شغال للانضمام فورًا رغم كده.

      await logActivity({
        actionType: 'CREATE',
        collectionName: 'invite_codes',
        itemId: newCode,
        details: `Generated new ${role} invite code for company: ${company.name}`,
        user: { uid: currentUser?.uid, email: currentUser?.email, role: userRole, companyId: userCompanyId },
      });

      alert(`${t("co.newCode") || "الكود الجديد"} (${role}): ${newCode}\n\n⚠️ احفظه دلوقتي — مش هتقدر تشوفه تاني من هنا.`);
    } catch (error) {
      console.error("Error regenerating invite code:", error);
      alert(t("co.addFail"));
    }
  }

  const filteredCompanies = companies.filter(
    (company) =>
      company.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="loading">{t("co.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          🏢 {superAdmin ? t("co.titleAdmin") : t("co.titleMine")}
        </h2>

        {superAdmin && (
          <form onSubmit={addCompany} className="form-container">
            <input
              type="text"
              placeholder={t("co.phName")}
              value={newCompany.name}
              onChange={(e) =>
                setNewCompany({ ...newCompany, name: e.target.value })
              }
              required
            />
            <input
              type="email"
              placeholder={t("common.email")}
              value={newCompany.email}
              onChange={(e) =>
                setNewCompany({ ...newCompany, email: e.target.value })
              }
              required
            />
            <select
              value={newCompany.industry}
              onChange={(e) =>
                setNewCompany({ ...newCompany, industry: e.target.value })
              }
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.id} value={ind.id}>
                  {ind.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-primary">
              <i className="fas fa-plus"></i> {t("co.add")}
            </button>
          </form>
        )}

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("co.search")}
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
            <h3>{t("co.list")}</h3>
            <span>
              {filteredCompanies.length}{" "}
              {t("co.nCompanies", { count: filteredCompanies.length })}
            </span>
          </div>
          {filteredCompanies.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? t("common.noResults") : t("co.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("co.name")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("co.industry")}</th>
                  <th>{t("co.invite")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company, index) => (
                  <tr key={company.id}>
                    <td>{index + 1}</td>
                    <td>{company.name}</td>
                    <td>{company.email}</td>
                    <td>
                      <span className="badge badge-info">
                        {INDUSTRY_LABELS[company.industry] ||
                          "🏢 شركة / مكتب عام"}
                      </span>
                    </td>
                    <td>
                      {/* ⚠️ الأكواد بقت في invite_codes ومش متخزنة/معروضة هنا —
                          مفيش list على الكولكشن ده عمدًا، فبتتعرض مرة واحدة بس
                          وقت التوليد. هنا بس زرارين لتوليد كود جديد لو احتجت. */}
                      <button
                        onClick={() => regenerateInviteCode(company, 'admin')}
                        title={t("co.genAdminCode") || "توليد كود أدمن جديد"}
                        style={{
                          background: "none", border: "1px solid #6366f1", borderRadius: 6,
                          color: "#6366f1", fontSize: 11, padding: "3px 8px", cursor: "pointer", marginLeft: 4,
                        }}
                      >
                        <i className="fas fa-key"></i> Admin
                      </button>
                      <button
                        onClick={() => regenerateInviteCode(company, 'user')}
                        title={t("co.genUserCode") || "توليد كود موظف جديد"}
                        style={{
                          background: "none", border: "1px solid #94a3b8", borderRadius: 6,
                          color: "#64748b", fontSize: 11, padding: "3px 8px", cursor: "pointer",
                        }}
                      >
                        <i className="fas fa-key"></i> User
                      </button>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          company.isActive
                            ? "badge-active"
                            : "badge-expired"
                        }`}
                      >
                        {company.isActive
                          ? t("status.active")
                          : t("status.expired")}
                      </span>
                    </td>
                    <td>
                      {(superAdmin || userRole === "admin") && (
                        <button
                          onClick={() => openEditModal(company)}
                          className="btn-primary"
                          style={{
                            marginLeft: "8px",
                            padding: "6px 14px",
                            fontSize: "13px",
                          }}
                        >
                          <i className="fas fa-edit"></i> {t("common.edit")}
                        </button>
                      )}
                      {superAdmin && (
                        <button
                          onClick={() => deleteCompany(company.id)}
                          className="btn-danger"
                        >
                          <i className="fas fa-trash"></i> {t("common.delete")}
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

      {showEditModal && editingCompany && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {t("co.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateCompany}>
              <div style={styles.formGroup}>
                <label>{t("co.name")}</label>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) =>
                    setEditingCompany({
                      ...editingCompany,
                      name: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.email")}</label>
                <input
                  type="email"
                  value={editingCompany.email}
                  onChange={(e) =>
                    setEditingCompany({
                      ...editingCompany,
                      email: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("co.industry")}</label>
                <select
                  value={editingCompany.industry || "general"}
                  onChange={(e) =>
                    setEditingCompany({
                      ...editingCompany,
                      industry: e.target.value,
                    })
                  }
                  style={styles.input}
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.id} value={ind.id}>
                      {ind.label}
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