// src/utils/icons.js — أيقونات مناسبة لكل مهنة
//
// 🔴 المشكلة: الكود كان بيستخدم أيقونة واحدة (`fa-boxes`) لكل Industries،
// يعني محل سباكة كان بيشوف "علب" في المخزون، وعيادة بتشوف "علب" بدل
// pills. والعناوين (labels) كانت **مظبوطة حسب المهنة** في الـ Sidebar
// بس الأيقونات ثابتة.
//
// الحل: خريطة واحدة. كل صفحة تسأل: "أنا أي Industries؟" وتاخد الأيقونة
// المناسبة.
//
// ✅ كل الأيقونات المستخدمة موجودة في Font Awesome 6.5 Free (2465 أيقونة) —
//    مفيش أيقونة بتطلع فاضية. تم التحقق آلياً (انظر tools/verify-icons.mjs).

/** أيقونة المخزون/الأصناف حسب المهنة */
export const INVENTORY_ICON = {
  general: "fa-boxes-packing",
  trader: "fa-boxes-packing", // تاجر = علب ✅
  contractor: "fa-helmet-safety", // مقاول = خوذة سلامة
  real_estate: "fa-house", // عقارات = بيت (مش علب!)
  super_market: "fa-store", // سوبر ماركت = محل
  pharmacy: "fa-pills", // صيدلية = دوا
  restaurant: "fa-utensils", // مطعم = أكل
  cafe: "fa-mug-hot", // كافيه = فنجان
  clothing: "fa-shirt", // ملابس = قميص
  clinic: "fa-kit-medical", // عيادة = شنطة طبية
  _default: "fa-boxes-packing",
};

/** أيقونة "الخدمات/العناصر" حسب المهنة ((فرق عن المخزون) */
export const ITEMS_ICON = {
  general: "fa-cubes",
  trader: "fa-cubes",
  contractor: "fa-compass-drafting",
  real_estate: "fa-city",
  super_market: "fa-tags",
  pharmacy: "fa-prescription",
  restaurant: "fa-bowl-food",
  cafe: "fa-mug-saucer",
  clothing: "fa-scissors",
  clinic: "fa-stethoscope",
  _default: "fa-cubes",
};

/** أيقونة البناء/المشاريع حسب المهنة */
export const PROJECTS_ICON = {
  general: "fa-folder-open",
  trader: "fa-folder-open",
  contractor: "fa-trowel", // مقاول = مسحاة
  real_estate: "fa-building",
  super_market: "fa-store",
  pharmacy: "fa-flask",
  restaurant: "fa-kitchen-set",
  cafe: "fa-mug-hot",
  clothing: "fa-palette",
  clinic: "fa-clipboard-list",
  _default: "fa-folder-open",
};

/** أيقونة 예약/مواعيد حسب المهنة */
export const APPOINTMENTS_ICON = {
  general: "fa-calendar-days",
  trader: "fa-calendar-days",
  contractor: "fa-calendar-check", // زيارة موقع
  real_estate: "fa-key", // معاينة عقار
  super_market: "fa-calendar-days",
  pharmacy: "fa-pills", // صرف دوا
  restaurant: "fa-utensils",
  cafe: "fa-mug-hot",
  clothing: "fa-calendar-days", // مواعيد تفصيل
  clinic: "fa-user-md", // عيادة = دكتور
  _default: "fa-calendar-days",
};

/** أيقونة البيع/الفاتورة حسب المهنة */
export const SALES_ICON = {
  general: "fa-file-invoice",
  trader: "fa-file-invoice",
  contractor: "fa-file-invoice",
  real_estate: "fa-file-contract", // عقد
  super_market: "fa-cart-shopping",
  pharmacy: "fa-receipt",
  restaurant: "fa-receipt",
  cafe: "fa-receipt",
  clothing: "fa-bag-shopping",
  clinic: "fa-receipt",
  _default: "fa-file-invoice",
};

/** أيقونة الطباعة */
export const PRINT_ICON = {
  general: "fa-print",
  restaurant: "fa-print",
  cafe: "fa-print",
  _default: "fa-print",
};

/** أيقونة الخامات/خامات */
export const RAW_MATERIALS_ICON = {
  restaurant: "fa-carrot", // خضار
  cafe: "fa-mortar-pestle", // طحن
  super_market: "fa-wheat-awn", // بقالة
  pharmacy: "fa-flask",
  clothing: "fa-palette",
  contractor: "fa-trowel",
  _default: "fa-jar",
};

/** أيقونة الفروع/الوحدات (real estate) */
export const PROPERTY_ICON = "fa-city";
/** أيقونة العميل (مشتتري/مشاهي) */
export const CLIENT_ICON = "fa-user-tie";
/** أيقونة البائع/الوحدة */
export const SELLER_ICON = "fa-house-circle-check";

/**
 * getter آمن — لو المهنة مش معروفة بيرجع الـ default
 * @param {Record<string,string>} map
 * @param {string} industry
 */
export function iconFor(map, industry) {
  if (!map) return "";
  return map[industry] || map._default || "";
}

/** هل الأيقونة دي موجودة فعلاً؟ (debug) */
export const ICON_NOTES = {
  verifiedAgainst: "font-awesome 6.5.0 free (2465 icons)",
  tool: "node tools/verify-icons.mjs",
};

/** أيقونة نقطة البيع (الكاشير) حسب المهنة */
export const POS_ICON = {
  restaurant: "fa-utensils",
  cafe: "fa-mug-hot",
  pharmacy: "fa-pills",
  clinic: "fa-stethoscope",
  clothing: "fa-shirt",
  real_estate: "fa-file-contract",
  super_market: "fa-cart-shopping",
  contractor: "fa-screwdriver-wrench",
  trader: "fa-cash-register",
  general: "fa-cash-register",
  _default: "fa-cash-register",
};

/** أيقونة البيع السريع (StorePOS) */
export const STORE_POS_ICON = {
  clothing: "fa-shirt",
  pharmacy: "fa-pills",
  restaurant: "fa-utensils",
  cafe: "fa-mug-hot",
  super_market: "fa-store",
  real_estate: "fa-house",
  _default: "fa-store",
};

/** أيقونة العملاء/المرضى حسب المهنة */
export const CLIENTS_ICON = {
  restaurant: "fa-utensils",
  cafe: "fa-mug-hot",
  clinic: "fa-user-md",
  pharmacy: "fa-user-nurse",
  clothing: "fa-user-tie",
  real_estate: "fa-user-tie",
  _default: "fa-user-friends",
};

/** أيقونة البائعين/الوحدات حسب المهنة */
export const SELLERS_ICON = {
  real_estate: "fa-city",
  clothing: "fa-shirt",
  pharmacy: "fa-pills",
  restaurant: "fa-boxes-packing",
  super_market: "fa-store",
  clinic: "fa-user-md",
  _default: "fa-store",
};

/** أيقونة الروشتات */
export const PRESCRIPTIONS_ICON = {
  clinic: "fa-prescription",
  pharmacy: "fa-prescription",
  _default: "fa-prescription",
};

/** أيقونة المرضى */
export const PATIENTS_ICON = {
  clinic: "fa-user-md",
  pharmacy: "fa-user-nurse",
  _default: "fa-hospital-user",
};

/** أيقونة التوريدات/الموردين */
export const SUPPLIERS_ICON = {
  restaurant: "fa-truck-ramp-box",
  cafe: "fa-mug-hot",
  pharmacy: "fa-truck-medical",
  clothing: "fa-shirt",
  super_market: "fa-truck",
  _default: "fa-truck",
};