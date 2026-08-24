// src/pages/Inventory.js - مع عزل البيانات حسب الشركة
import React, { useState, useEffect, useCallback } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { getScopedQuery } from "../utils/companyQuery";
import Sidebar from "../components/common/Sidebar";
import { useLanguage } from "../i18n/LanguageContext";

export default function Inventory() {
  const { t } = useLanguage();
  const { userRole, userCompanyId } = useAuth();
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    description: "",
    barcode: "",
    expiryDate: "",
  });
  const [loading, setLoading] = useState(true);

  const [editingProduct, setEditingProduct] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(
        getScopedQuery("inventory", userRole, userCompanyId)
      );
      const productsData = [];
      querySnapshot.forEach((d) => {
        productsData.push({ id: d.id, ...d.data() });
      });
      setProducts(productsData);
    } catch (error) {
      console.error("Error fetching products:", error);
      alert(t("inv.fetchErr"));
    } finally {
      setLoading(false);
    }
  }, [userRole, userCompanyId, t]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  async function addProduct(e) {
    e.preventDefault();
    if (!newProduct.name || !newProduct.quantity || !newProduct.price) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      await addDoc(collection(db, "inventory"), {
        ...newProduct,
        companyId: userCompanyId,
        quantity: parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
        barcode: newProduct.barcode || "",
        expiryDate: newProduct.expiryDate || "",
        createdAt: new Date().toISOString(),
      });
      setNewProduct({
        name: "",
        category: "",
        quantity: "",
        price: "",
        description: "",
        barcode: "",
        expiryDate: "",
      });
      await fetchProducts();
      alert(t("inv.addOk"));
    } catch (error) {
      console.error("Error adding product:", error);
      alert(t("inv.addFail"));
    }
  }

  function openEditModal(product) {
    setEditingProduct(product);
    setShowEditModal(true);
  }

  function closeEditModal() {
    setEditingProduct(null);
    setShowEditModal(false);
  }

  async function updateProduct(e) {
    e.preventDefault();
    if (!editingProduct.name || !editingProduct.quantity || !editingProduct.price) {
      alert(t("common.fillRequired"));
      return;
    }

    try {
      const productRef = doc(db, "inventory", editingProduct.id);
      await updateDoc(productRef, {
        name: editingProduct.name,
        category: editingProduct.category || "",
        quantity: parseInt(editingProduct.quantity),
        price: parseFloat(editingProduct.price),
        description: editingProduct.description || "",
        barcode: editingProduct.barcode || "",
        expiryDate: editingProduct.expiryDate || "",
      });
      await fetchProducts();
      closeEditModal();
      alert(t("inv.updOk"));
    } catch (error) {
      console.error("Error updating product:", error);
      alert(t("inv.updFail"));
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteDoc(doc(db, "inventory", id));
      await fetchProducts();
      alert(t("inv.delOk"));
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(t("inv.delFail"));
    }
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.category &&
        product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return <div className="loading">{t("inv.loading")}</div>;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div className="main-content">
        <h2 style={{ color: "#333", marginBottom: "20px" }}>
          📦 {t("inv.title")}
        </h2>

        <form onSubmit={addProduct} className="form-container">
          <input
            type="text"
            placeholder={t("inv.phName")}
            value={newProduct.name}
            onChange={(e) =>
              setNewProduct({ ...newProduct, name: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder={t("inv.phCat")}
            value={newProduct.category}
            onChange={(e) =>
              setNewProduct({ ...newProduct, category: e.target.value })
            }
          />
          <input
            type="number"
            placeholder={t("inv.phQty")}
            value={newProduct.quantity}
            onChange={(e) =>
              setNewProduct({ ...newProduct, quantity: e.target.value })
            }
            required
          />
          <input
            type="number"
            placeholder={t("inv.phPrice")}
            value={newProduct.price}
            onChange={(e) =>
              setNewProduct({ ...newProduct, price: e.target.value })
            }
            required
          />
          <input
            type="text"
            placeholder={t("inv.phDesc")}
            value={newProduct.description}
            onChange={(e) =>
              setNewProduct({ ...newProduct, description: e.target.value })
            }
          />
          <input
            type="text"
            placeholder={t("inv.phBarcode")}
            value={newProduct.barcode}
            onChange={(e) =>
              setNewProduct({ ...newProduct, barcode: e.target.value })
            }
          />
          <input
            type="date"
            placeholder={t("inv.phExpiry")}
            value={newProduct.expiryDate}
            onChange={(e) =>
              setNewProduct({ ...newProduct, expiryDate: e.target.value })
            }
          />
          <button type="submit" className="btn-primary">
            <i className="fas fa-plus"></i> {t("inv.add")}
          </button>
        </form>

        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            placeholder={t("inv.search")}
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
            <h3>{t("inv.list")}</h3>
            <span>{filteredProducts.length} {t("inv.products")}</span>
          </div>
          {filteredProducts.length === 0 ? (
            <p style={{ textAlign: "center", padding: "20px", color: "#999" }}>
              {searchTerm ? t("common.noResults") : t("inv.empty")}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("inv.name")}</th>
                  <th>{t("inv.category")}</th>
                  <th>{t("common.quantity")}</th>
                  <th>{t("inv.price")}</th>
                  <th>{t("common.description")}</th>
                  <th>{t("inv.barcode")}</th>
                  <th>{t("inv.expiry")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product, index) => (
                  <tr key={product.id}>
                    <td>{index + 1}</td>
                    <td>{product.name}</td>
                    <td>{product.category || "-"}</td>
                    <td>
                      <span
                        className={`badge ${
                          product.quantity < 5 ? "badge-expired" : "badge-active"
                        }`}
                      >
                        {product.quantity}
                      </span>
                    </td>
                    <td>{product.price} {t("currency")}</td>
                    <td>{product.description || "-"}</td>
                    <td>
                      {product.barcode ? (
                        <code
                          style={{
                            background: "#f1f5f9",
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#6366f1",
                            direction: "ltr",
                            display: "inline-block",
                          }}
                        >
                          {product.barcode}
                        </code>
                      ) : (
                        <span style={{ color: "#999", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      {product.expiryDate ? (
                        new Date(product.expiryDate).toLocaleDateString()
                      ) : (
                        <span style={{ color: "#999", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <button
                        onClick={() => openEditModal(product)}
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
                        onClick={() => deleteProduct(product.id)}
                        className="btn-danger"
                      >
                        <i className="fas fa-trash"></i> {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showEditModal && editingProduct && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3>
                <i className="fas fa-edit"></i> {t("inv.editTitle")}
              </h3>
              <button onClick={closeEditModal} style={styles.closeBtn}>
                &times;
              </button>
            </div>
            <form onSubmit={updateProduct}>
              <div style={styles.formGroup}>
                <label>{t("inv.name")}</label>
                <input
                  type="text"
                  value={editingProduct.name}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("inv.category")}</label>
                <input
                  type="text"
                  value={editingProduct.category || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      category: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.quantity")}</label>
                <input
                  type="number"
                  value={editingProduct.quantity}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      quantity: e.target.value,
                    })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("inv.price")}</label>
                <input
                  type="number"
                  value={editingProduct.price}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: e.target.value })
                  }
                  required
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("common.description")}</label>
                <input
                  type="text"
                  value={editingProduct.description || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      description: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("inv.barcode")}</label>
                <input
                  type="text"
                  value={editingProduct.barcode || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      barcode: e.target.value,
                    })
                  }
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label>{t("inv.expiry")}</label>
                <input
                  type="date"
                  value={editingProduct.expiryDate || ""}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      expiryDate: e.target.value,
                    })
                  }
                  style={styles.input}
                />
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