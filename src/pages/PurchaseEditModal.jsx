// src/pages/PurchaseEditModal.jsx - مودال تعديل فاتورة شراء
import React from "react";
import AutocompleteInput from "../components/common/AutocompleteInput.js";

export default function PurchaseEditModal({
  showEditModal,
  setShowEditModal,
  editingPurchase,
  setEditingPurchase,
  onSubmit,
  suppliers,
  t,
}) {
  if (!showEditModal || !editingPurchase) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <i className="fas fa-edit" style={{ color: "#0891b2" }}></i> {t("common.edit")}
          </h3>
          <button className="modal-close" onClick={() => setShowEditModal(false)}>
            ×
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t("pur.supplier")}</label>
              <AutocompleteInput
                items={suppliers.map((s) => ({
                  id: s.id,
                  label: s.name,
                  sublabel: s.phone ? `📞 ${s.phone}` : "",
                }))}
                value={editingPurchase.supplierId}
                onChange={(id) => setEditingPurchase({ ...editingPurchase, supplierId: id })}
                placeholder={t("pur.chooseSupplier")}
                required
              />
            </div>
            <div className="form-group">
              <label>{t("common.amount")}</label>
              <input
                type="number"
                step="0.01"
                value={editingPurchase.amount}
                onChange={(e) =>
                  setEditingPurchase({ ...editingPurchase, amount: e.target.value })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>{t("common.status")}</label>
              <select
                value={editingPurchase.status}
                onChange={(e) =>
                  setEditingPurchase({ ...editingPurchase, status: e.target.value })
                }
              >
                <option value="pending">{t("in.statusWait")}</option>
                <option value="paid">{t("in.statusPaid")}</option>
                <option value="overdue">{t("in.statusOver")}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t("common.description")}</label>
              <input
                type="text"
                value={editingPurchase.description || ""}
                onChange={(e) =>
                  setEditingPurchase({ ...editingPurchase, description: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>{t("pur.due")}</label>
              <input
                type="date"
                value={editingPurchase.dueDate || ""}
                onChange={(e) =>
                  setEditingPurchase({ ...editingPurchase, dueDate: e.target.value })
                }
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
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