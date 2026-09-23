import React from "react";
import { getOrderStatusConfig, ORDER_STATUSES } from "../../utils/invoiceHelpers";

export default function OrderStatusBadge({ status, orderId, onStatusChange, isRestaurant }) {
  if (!isRestaurant) return null;
  const cfg = getOrderStatusConfig(status);
  const currentIdx = ORDER_STATUSES.findIndex((s) => s.value === status);
  const nextStatus = currentIdx < ORDER_STATUSES.length - 2 ? ORDER_STATUSES[currentIdx + 1] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span style={{ background: cfg.bg, color: cfg.color, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
        {cfg.label}
      </span>
      {nextStatus && status !== "delivered" && (
        <button
          onClick={() => onStatusChange(orderId, nextStatus.value)}
          style={{ background: nextStatus.bg, color: nextStatus.color, border: `1px solid ${nextStatus.color}40`, borderRadius: 8, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
        >
          ← {nextStatus.label}
        </button>
      )}
    </div>
  );
}
