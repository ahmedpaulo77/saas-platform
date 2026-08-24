// src/components/sellers/AddSellerModal.js
import React, { useState } from "react";

export default function AddSellerModal({ seller, onClose, onSave, t }) {
  const [form, setForm] = useState({
    name: seller?.name || "",
    phone: seller?.phone || "",
    email: seller?.email || "",
    developer: seller?.developer || "",
    project: seller?.project || "",
    major: seller?.major || "Resale",
    propertyType: seller?.propertyType || "",
    builtUpArea: seller?.builtUpArea || "",
    plotArea: seller?.plotArea || "",
    description: seller?.description || "",
    bedrooms: seller?.bedrooms || "",
    bathrooms: seller?.bathrooms || "",
    kitchen: seller?.kitchen || "",
    reception: seller?.reception || "",
    terrace: seller?.terrace || "",
    price: seller?.price || "",
    commission: seller?.commission || "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert(t("common.fillRequired"));
      return;
    }
    onSave(form);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3>
            <i className="fas fa-store"></i>{" "}
            {seller ? t("sellers.edit") : t("sellers.add")}
          </h3>
          <button onClick={onClose} style={styles.closeBtn}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {/* Basic Info */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>{t("sellers.basicInfo")}</h4>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.name")} *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.namePlaceholder")}
                  required
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.phone")}</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.phonePlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.email")}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.emailPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Property Info */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>{t("sellers.propertyInfo")}</h4>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.developer")}</label>
                <input
                  type="text"
                  value={form.developer}
                  onChange={(e) => setForm({ ...form, developer: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.developerPlaceholder")}
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.project")}</label>
                <input
                  type="text"
                  value={form.project}
                  onChange={(e) => setForm({ ...form, project: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.projectPlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.major")}</label>
                <select
                  value={form.major}
                  onChange={(e) => setForm({ ...form, major: e.target.value })}
                  style={styles.input}
                >
                  <option value="Resale">{t("sellers.resale")}</option>
                  <option value="Rental">{t("sellers.rental")}</option>
                </select>
              </div>
              <div style={styles.group}>
                <label>{t("sellers.propertyType")}</label>
                <input
                  type="text"
                  value={form.propertyType}
                  onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.propertyTypePlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.builtUpArea")}</label>
                <input
                  type="number"
                  value={form.builtUpArea}
                  onChange={(e) => setForm({ ...form, builtUpArea: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.builtUpAreaPlaceholder")}
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.plotArea")}</label>
                <input
                  type="number"
                  value={form.plotArea}
                  onChange={(e) => setForm({ ...form, plotArea: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.plotAreaPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Property Details */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>{t("sellers.propertyDetails")}</h4>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.bedrooms")}</label>
                <input
                  type="number"
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.bedroomsPlaceholder")}
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.bathrooms")}</label>
                <input
                  type="number"
                  value={form.bathrooms}
                  onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.bathroomsPlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.kitchen")}</label>
                <input
                  type="text"
                  value={form.kitchen}
                  onChange={(e) => setForm({ ...form, kitchen: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.kitchenPlaceholder")}
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.reception")}</label>
                <input
                  type="text"
                  value={form.reception}
                  onChange={(e) => setForm({ ...form, reception: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.receptionPlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.terrace")}</label>
                <input
                  type="text"
                  value={form.terrace}
                  onChange={(e) => setForm({ ...form, terrace: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.terracePlaceholder")}
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.description")}</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  style={{ ...styles.input, minHeight: "80px", resize: "vertical" }}
                  placeholder={t("sellers.descriptionPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Financial */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>{t("sellers.financial")}</h4>
            <div style={styles.row}>
              <div style={styles.group}>
                <label>{t("sellers.price")}</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.pricePlaceholder")}
                />
              </div>
              <div style={styles.group}>
                <label>{t("sellers.commission")}</label>
                <input
                  type="number"
                  value={form.commission}
                  onChange={(e) => setForm({ ...form, commission: e.target.value })}
                  style={styles.input}
                  placeholder={t("sellers.commissionPlaceholder")}
                />
              </div>
            </div>
          </div>

          <div style={styles.footer}>
            <button type="button" onClick={onClose} className="btn-danger">
              {t("common.cancel")}
            </button>
            <button type="submit" className="btn-primary">
              <i className="fas fa-save"></i> {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    backdropFilter: "blur(4px)",
  },
  modal: {
    backgroundColor: "white",
    borderRadius: "16px",
    padding: "30px",
    width: "90%",
    maxWidth: "650px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  header: {
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
  section: {
    marginBottom: "20px",
    padding: "16px",
    background: "#f8fafc",
    borderRadius: "10px",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    color: "#6366f1",
    fontWeight: "700",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  group: {
    marginBottom: "12px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    border: "2px solid #e2e8f0",
    borderRadius: "10px",
    fontSize: "14px",
    marginTop: "4px",
    transition: "border-color 0.3s",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "20px",
  },
};