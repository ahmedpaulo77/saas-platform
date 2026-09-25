// src/utils/paymentMethods.js - Shared Egyptian payment methods list
export const EGYPT_PAYMENTS = [
  { value: "cash", label: "💵 كاش", en: "Cash" },
  { value: "visa", label: "💳 فيزا", en: "Visa" },
  { value: "mastercard", label: "💳 ماستركارد", en: "Mastercard" },
  { value: "instapay", label: "⚡ انستاباي", en: "InstaPay" },
  { value: "vodafone_cash", label: "📱 فودافون كاش", en: "Vodafone Cash" },
  { value: "orange_money", label: "📱 أورانج موني", en: "Orange Money" },
  { value: "etisalat_cash", label: "📱 اتصالات كاش", en: "Etisalat Cash" },
  { value: "we_pay", label: "📱 وي باي", en: "WE Pay" },
  { value: "bank_transfer", label: "🏦 تحويل بنكي", en: "Bank Transfer" },
  { value: "cheque", label: "🧾 شيك", en: "Cheque" },
];

const KNOWN = {
  cash: { ar: "💵 كاش", en: "Cash" },
  visa: { ar: "💳 فيزا", en: "Visa" },
  mastercard: { ar: "💳 ماستركارد", en: "Mastercard" },
  instapay: { ar: "⚡ انستاباي", en: "InstaPay" },
  vodafone_cash: { ar: "📱 فودافون كاش", en: "Vodafone Cash" },
  vodafone: { ar: "📱 فودافون كاش", en: "Vodafone Cash" },
  orange_money: { ar: "📱 أورانج موني", en: "Orange Money" },
  orange: { ar: "📱 أورانج موني", en: "Orange Money" },
  etisalat_cash: { ar: "📱 اتصالات كاش", en: "Etisalat Cash" },
  etisalat: { ar: "📱 اتصالات كاش", en: "Etisalat Cash" },
  we_pay: { ar: "📱 وي باي", en: "WE Pay" },
  wepay: { ar: "📱 وي باي", en: "WE Pay" },
  bank_transfer: { ar: "🏦 تحويل بنكي", en: "Bank Transfer" },
  bank: { ar: "🏦 تحويل بنكي", en: "Bank Transfer" },
  cheque: { ar: "🧾 شيك", en: "Cheque" },
  check: { ar: "🧾 شيك", en: "Cheque" },
  direct: { ar: "🏪 مباشر (كاش)", en: "Direct (Cash)" },
  // order sources (fallback mapping to readable labels)
  whatsapp: { ar: "💬 واتساب", en: "WhatsApp" },
  phone: { ar: "📞 تليفون", en: "Phone" },
  talabat: { ar: "🛵 طلبات", en: "Talabat" },
  city_app: { ar: "🏙️ سيتي آب", en: "City App" },
};

// Backward compat: missing/empty paymentMethod = cash.
// Unknown legacy values (e.g. order sources) fall back to a readable label.
export function getPaymentLabel(value, lang = "ar") {
  if (!value) return lang === "en" ? "Cash" : "💵 كاش";
  const v = String(value).toLowerCase();
  if (KNOWN[v]) return lang === "en" ? KNOWN[v].en : KNOWN[v].ar;
  return String(value);
}

export function normalizePaymentMethod(value) {
  if (!value) return "cash";
  return String(value);
}
