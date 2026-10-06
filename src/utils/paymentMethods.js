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

// 🆕 فك الدفع المقسم لطرقه الحقيقية — "split" طريقة إدخال في الكاشير فقط،
// والتقارير (أرباح/مبيعات/تقفيل) لازم تشوف الطرق الفعلية بنسبها.
// distributeByMethod(inv, total): يوزع الإجمالي بنسب أجزاء المقسم،
// وغير المقسم يرجع طريقته كما هي. مثال: 400 مقسمة 200+200 → كاش 200 + انستاباي 200.
export function distributeByMethod(inv, total) {
  const t = parseFloat(total) || 0;
  if (t <= 0) return [];
  const parts = inv && inv.splitPayment && Array.isArray(inv.splitPayments)
    ? inv.splitPayments
    : null;
  if (parts && parts.length > 0) {
    const sum = parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    if (sum > 0) {
      return parts.map((p) => ({
        method: p.method || "cash",
        amount: (t * (parseFloat(p.amount) || 0)) / sum,
      }));
    }
  }
  return [{ method: (inv && inv.paymentMethod) || "cash", amount: t }];
}

// لافتة طريقة الدفع لفاتورة واحدة: المقسم يظهر بأجزائه بدل كلمة "split"
export function paymentLabelOf(inv, lang = "ar") {
  if (inv && inv.splitPayment && Array.isArray(inv.splitPayments) && inv.splitPayments.length > 0) {
    return inv.splitPayments
      .map((p) => `${getPaymentLabel(p.method, lang)} ${(parseFloat(p.amount) || 0).toFixed(2)}`)
      .join(" + ");
  }
  return getPaymentLabel(inv && inv.paymentMethod, lang);
}
