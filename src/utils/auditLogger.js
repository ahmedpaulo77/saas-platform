// src/utils/auditLogger.js
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * تسجّيل حركة جديدة في سجل العمليات Audit Log
 * @param {Object} params
 * @param {string} params.actionType - نوع الإجراء: 'DELETE', 'UPDATE', 'CREATE'
 * @param {string} params.collectionName - اسم القسم (مثلاً: 'invoices', 'inventory', 'users')
 * @param {string} params.itemId - ID المستند المحذوف أو المعدل
 * @param {string} params.details - وصف العملية
 * @param {Object} params.user - بيانات المستخدم الحالي
 */
export async function logActivity({ actionType, collectionName, itemId, details, user }) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      actionType,
      collectionName,
      itemId: itemId || "N/A",
      details: details || "",
      performedBy: {
        uid: user?.uid || "system",
        email: user?.email || "Unknown User",
        role: user?.role || "user",
      },
      companyId: user?.companyId || user?.userCompanyId || "global",
      timestamp: new Date().toISOString(),
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}