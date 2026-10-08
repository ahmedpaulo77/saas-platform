// src/utils/dashCards.js - كروت إحصائيات الداشبورد (مصدر واحد للعرض + صفحة شركتي)
// key ثابت يُخزن في companies/{id}.hiddenDashCards — لا تغيّر القيم الحالية.
export const DASH_CARDS = [
  { key: "companies", module: "companies", labelKey: "dash.companies" },
  { key: "clients", module: "clients", labelKey: "dash.clients" },
  { key: "sellers", module: "sellers", labelKey: "dash.sellers" },
  { key: "buyers", module: "buyers", labelKey: "dash.buyers" },
  { key: "invoices", module: "invoices", labelKey: "dash.invoices" },
  { key: "tasks", module: "tasks", labelKey: "dash.tasks" },
  { key: "projects", module: "projects", labelKey: "dash.projects" },
  { key: "users", module: "users", labelKey: "dash.users" },
  { key: "suppliers", module: "suppliers", labelKey: "nav.suppliers" },
  { key: "purchases", module: "purchases", labelKey: "dash.purchases" },
  { key: "appointments", module: "appointments", labelKey: "modules.appointments" },
  { key: "patients", module: "patients", labelKey: "modules.patients" },
  { key: "prescriptions", module: "prescriptions", labelKey: "modules.prescriptions" },
  { key: "messages", module: "messages", labelKey: "modules.messages" },
  { key: "revenue", module: "invoices", labelKey: "dash.revenue" },
  { key: "revenueChart", module: "invoices", labelKey: "dash.revenueChart" },
];

export function isCardHidden(hiddenCards, key) {
  return Array.isArray(hiddenCards) && hiddenCards.includes(key);
}

export function normHiddenCards(v) {
  return Array.isArray(v) ? v.filter((k) => typeof k === "string") : [];
}
