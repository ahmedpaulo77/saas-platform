// src/components/buyers/AddBuyerModal.js
import React, { useState } from "react";

export default function AddBuyerModal({ buyer, onClose, onSave, t }) {
  const [form, setForm] = useState({
    name: buyer?.name || "",
    phone: buyer?.phone || "",
    interest: buyer?.interest || "",
    followUp1: buyer?.followUp1 || "",
    followUp2: buyer?.followUp2 || "",
    followUp3: buyer?.followUp3 || "",
    lastCall: buyer?.lastCall || "",
    agent: buyer?.agent || "",
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
            <i className="fas fa-user-plus"></i>{" "}
            {buyer ? t("buyers.edit") : t("buyers.add")}
          </h3>
          <button onClick={onClose} style={styles.closeBtn}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={styles.row}>
            <div style={styles.group}>
              <label>{t("buyers.name")} *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.namePlaceholder")}
                required
              />
            </div>
            <div style={styles.group}>
              <label>{t("buyers.phone")}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.phonePlaceholder")}
              />
            </div>
          </div>

          <div style={styles.group}>
            <label>{t("buyers.interest")}</label>
            <input
              type="text"
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
              style={styles.input}
              placeholder={t("buyers.interestPlaceholder")}
            />
          </div>

          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>{t("buyers.followUps")}</h4>
            <div style={styles.group}>
              <label>{t("buyers.followUp1")}</label>
              <input
                type="text"
                value={form.followUp1}
                onChange={(e) => setForm({ ...form, followUp1: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.followUpPlaceholder")}
              />
            </div>
            <div style={styles.group}>
              <label>{t("buyers.followUp2")}</label>
              <input
                type="text"
                value={form.followUp2}
                onChange={(e) => setForm({ ...form, followUp2: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.followUpPlaceholder")}
              />
            </div>
            <div style={styles.group}>
              <label>{t("buyers.followUp3")}</label>
              <input
                type="text"
                value={form.followUp3}
                onChange={(e) => setForm({ ...form, followUp3: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.followUpPlaceholder")}
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.group}>
              <label>{t("buyers.lastCall")}</label>
              <input
                type="datetime-local"
                value={form.lastCall}
                onChange={(e) => setForm({ ...form, lastCall: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.group}>
              <label>{t("buyers.agent")}</label>
              <input
                type="text"
                value={form.agent}
                onChange={(e) => setForm({ ...form, agent: e.target.value })}
                style={styles.input}
                placeholder={t("buyers.agentPlaceholder")}
              />
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
    maxWidth: "550px",
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
    marginBottom: "16px",
    padding: "16px",
    background: "#f8fafc",
    borderRadius: "10px",
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: "14px",
    color: "#10b981",
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