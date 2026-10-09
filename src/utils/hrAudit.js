// src/utils/hrAudit.js - سجل عمليات الموارد البشرية (على مستوى الشركة)
// عكس auditLogs (سوبر أدمن فقط)، السجل ده تقراه إدارة الشركة نفسها.
// يُسجل: الفعل + الكيان + الموظف (اسم فقط — بدون مبالغ).
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";

/**
 * @param {Object} params
 * @param {string} params.action - create|update|approve|reject|checkin|checkout|save
 * @param {string} params.entity - attendance|payroll|leaves|advances|penalties|requests|shifts|holidays|docs|employees
 * @param {string} [params.employeeId]
 * @param {string} [params.employeeName]
 * @param {string} [params.refId]
 * @param {Object} params.user - { uid, email, role, companyId }
 */
export async function logHr({ action, entity, employeeId, employeeName, refId, user }) {
  try {
    if (!user?.companyId) return;
    await addDoc(collection(db, "hr_audit"), {
      action: action || "update",
      entity: entity || "",
      employeeId: employeeId || null,
      employeeName: employeeName || "",
      refId: refId || null,
      byUid: user?.uid || null,
      byEmail: user?.email || "",
      byRole: user?.role || "",
      companyId: user.companyId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log HR activity:", error);
  }
}

export const HR_ENTITIES = [
  "attendance",
  "payroll",
  "leaves",
  "advances",
  "penalties",
  "requests",
  "shifts",
  "holidays",
  "docs",
  "employees",
];
