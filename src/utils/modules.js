// src/utils/modules.js - خريطة الوحدات حسب مجال العمل (Industry-Based Modules)
// مع دعم الترجمة i18n

// المجالات المتاحة - مع مفاتيح ترجمة
export const INDUSTRIES = [
  {
    id: "general",
    labelKey: "industries.general.label",
    descKey: "industries.general.desc",
    icon: "🏢",
  },
  {
    id: "trader",
    labelKey: "industries.trader.label",
    descKey: "industries.trader.desc",
    icon: "📦",
  },
  {
    id: "contractor",
    labelKey: "industries.contractor.label",
    descKey: "industries.contractor.desc",
    icon: "🏗️",
  },
  {
    id: "real_estate",
    labelKey: "industries.real_estate.label",
    descKey: "industries.real_estate.desc",
    icon: "🏠",
  },
  {
    id: "super_market",
    labelKey: "industries.super_market.label",
    descKey: "industries.super_market.desc",
    icon: "🏪",
  },
  {
    id: "pharmacy",
    labelKey: "industries.pharmacy.label",
    descKey: "industries.pharmacy.desc",
    icon: "💊",
  },
  {
    id: "restaurant",
    labelKey: "industries.restaurant.label",
    descKey: "industries.restaurant.desc",
    icon: "🍽️",
  },
  {
    id: "cafe",
    labelKey: "industries.cafe.label",
    descKey: "industries.cafe.desc",
    icon: "☕",
  },
  {
    id: "clothing",
    labelKey: "industries.clothing.label",
    descKey: "industries.clothing.desc",
    icon: "👕",
  },
  {
    id: "clinic",
    labelKey: "industries.clinic.label",
    descKey: "industries.clinic.desc",
    icon: "🩺",
  },
  {
    id: "hr",
    labelKey: "industries.hr.label",
    descKey: "industries.hr.desc",
    icon: "💼",
  },
];

// للتوافق مع الكود القديم (مباشر)
export const INDUSTRY_LABELS = {
  general: "🏢 أعمال عامة",
  trader: "📦 تاجر / استيراد وتصدير",
  contractor: "🏗️ مقاولات",
  real_estate: "🏠 عقارات",
  super_market: "🏪 سوبر ماركت",
  pharmacy: "💊 صيدلية",
  restaurant: "🍽️ مطعم",
  cafe: "☕ كافيه",
    clothing: "👔 أزياء",
  clinic: "🩺 طبيب / عيادة",
  hr: "💼 موارد بشرية",
};

// خريطة الوحدات: كل مجال → الوحدات المسموح بها
export const MODULE_MAP = {
  // الوحدات الأساسية المتاحة للجميع
  // (المصروفات ليست أساسية: محلات الأكل والصيدليات والعيادات والأزياء فقط)
  _base: ["dashboard", "inventory", "reports", "profits"],

  // تاجر / استيراد وتصدير (من غير Sellers و Buyers)
  trader: [
    "clients",
    "daily-prices",
    "invoices",
    "suppliers",
    "purchases",
    "tasks",
    "aging",
  ],

  // مقاولات (من غير Sellers و Buyers)
  contractor: [
    "clients",
    "invoices",
    "projects",
    "certificates",
    "tasks",
    "suppliers",
    "purchases",
    "aging",
    "messages",
  ],

  // عقارات (بائعين ومشترين فقط - بدون عملاء)
  // أعمار الديون استثنائية: البائع/المشتري ناس ليهم معاملات، فالمديونية
  // ليهم مهمة هنا أكتر من أي مجال تاني. الـ route مفتوح والصفحة بتقرا
  // الفواتير مباشرة، فمفيش مانع تقني.
  real_estate: ["sellers", "buyers", "viewings", "tasks", "projects", "messages", "aging"],

  // عام - وحدات عامة بدون sellers وbuyers وبدون رسائل (للشركات الصغيرة)
  general: [
    "clients",
    "invoices",
    "vouchers",
    "tasks",
    "projects",
    "certificates",
    "aging",
    "suppliers",
    "purchases",
  ],

  // سوبر ماركت - نقطة بيع + صلاحية + مهام ورسائل للفريق
  super_market: [
    "pos",
    "clients",
    "invoices",
    "expenses",
    "suppliers",
    "purchases",
    "barcode",
    "expiry",
    "aging",
    "tasks",
    "messages",
    "attendance",
  ],

  // صيدلية - نقطة بيع + تشغيلة + تصنيف أدوية + مهام ورسائل
  pharmacy: [
    "pos",
    "clients",
    "invoices",
    "expenses",
    "suppliers",
    "purchases",
    "barcode",
    "expiry",
    "batch",
    "batches",
    "drug_categories",
    "aging",
    "tasks",
    "messages",
    "attendance",
  ],

  // مطعم - صالة + ديليفري وتيك أواي + مطبخ + طاولات
  restaurant: [
    "pos",
    "menu-categories",
    "raw-materials",
    "clients",
    "invoices",
    "expenses",
    "suppliers",
    "purchases",
    "kitchen",
    "tables",
    "aging",
    "tasks",
    "messages",
    "attendance",
  ],
  // كافيه - تيك أواي + صالة + طاولات (بدون مطبخ وبدون خامات مطبخ)
  cafe: [
    "pos",
    "menu-categories",
    "clients",
    "invoices",
    "expenses",
    "suppliers",
    "purchases",
    "tables",
    "aging",
    "tasks",
    "messages",
    "attendance",
  ],

  // أزياء (ملابس/أحذية/إكسسوارات) - مقاسات وألوان + سيلز وعمولات + مهام للموظفين (بدون رسائل وبدون حضور)
  clothing: [
    "store-pos",
    "promotions",
    "sales",
    "sales-reps",
    "clients",
    "invoices",
    "expenses",
    "suppliers",
    "purchases",
    "variant-codes",
    "types-categories",
    "employees",
    "tasks",
    "aging",
  ],

  // طبيب / عيادة - مرضى ومواعيد وروشتات وفواتير حرة + بحث شامل
  // (بدون مخزون: الفواتير ببنود حرة — وبدون صلاحية. أعمار الديون موجودة: العيادة
  //  بتبيع بفاتورة وبتقبض بعدين، فمفيش سبب يشيل الصفحة عنها)
  clinic: [
    "patients",
    "appointments",
    "prescriptions",
    "invoices",
    "expenses",
    "tasks",
    "messages",
    "search",
    "aging",
  ],

  // موارد بشرية - موظفين وحضور وإجازات ومرتبات وورديات وبصمة (بدون مخزون)
  hr: [
    "employees",
    "attendance",
    "leaves",
    "payroll",
    "shifts",
    "biometric",
    "expenses",
    "tasks",
    "messages",
  ],
};

// الوحدات المتاحة لكل مستخدم
// disabledModules: وحدات قفلها السوبر أدمن لهذه الشركة (companies/{id}.disabledModules)
// — تُخصم من الكل (أدمن ويوزر وكاشير)، والسوبر أدمن نفسه مستثنى.
export function getAvailableModules(industry, userRole, disabledModules = []) {
  const stripDisabled = (set) => {
    if (Array.isArray(disabledModules)) {
      disabledModules.forEach((m) => {
        if (typeof m === "string") set.delete(m);
      });
    }
    return set;
  };
  // السوبر أدمن يشوف بس أدوات إدارة النظام (الشركات والمستخدمين والتقارير)
  // من غير الوحدات التشغيلية الخاصة بالشركات المشتركين
  if (userRole === "super_admin") {
    return new Set([
      "dashboard",
      "companies",
      "users",
      "reports",
      "notifications",
      "profile",
      "about",
      "my-company",
    ]);
  }

  // 🔥 المطبخ: شاشة المطبخ فقط (لا بيع ولا أسعار ولا بيانات)
  if (userRole === "kitchen") {
    return stripDisabled(new Set(["kitchen", "notifications", "profile", "about"]));
  }

  // 💰 الكاشير: بيع + عملاء + طلبات فقط (لا مخزون ولا تقارير ولا إعدادات)
  if (userRole === "cashier") {
    return stripDisabled(
      new Set([
        "dashboard",
        "pos",
        "store-pos",
        "clients",
        "invoices",
        "sales",
        "notifications",
        "profile",
        "about",
      ])
    );
  }

  const modules = new Set([...MODULE_MAP._base]);
  if (industry && MODULE_MAP[industry]) {
    MODULE_MAP[industry].forEach((m) => modules.add(m));
  } else {
    // لو مفيش مجال محدد → نعطي الوحدات العامة
    MODULE_MAP.general.forEach((m) => modules.add(m));
  }

  // العيادة بدون مخزون: الفواتير ببنود حرة تُكتب يدوياً (لا بيع أدوية من العيادة)
  if (industry === "clinic") {
    modules.delete("inventory");
  }

  // الموارد البشرية بدون مخزون
  if (industry === "hr") {
    modules.delete("inventory");
  }

  // الموظفين (رواتب وبطاقات — بيانات حساسة): مدير الشركة فقط
  if (userRole !== "admin") {
    modules.delete("employees");
  }

  // صفحات ثابتة للجميع
  modules.add("notifications");
  modules.add("profile");
  modules.add("about");
  modules.add("my-company");

  // مدير الشركة يدير موظفين شركته + كشف الحساب
  if (userRole === "admin") {
    modules.add("users");
    modules.add("statements");
  }

  return stripDisabled(modules);
}

// التحقق من صلاحية الوصول لصفحة
export function canAccess(moduleKey, industry, userRole, disabledModules = []) {
  const available = getAvailableModules(industry, userRole, disabledModules);
  return available.has(moduleKey);
}

// خريطة المسارات → الوحدات
export const ROUTE_MODULE_MAP = {
  "/batches": "batches",
  "/dashboard": "dashboard",
  "/expenses": "expenses",
  "/profits": "profits",
  "/companies": "companies",
  "/clients": "clients",
  "/invoices": "invoices",
  "/sales": "sales",
  "/inventory": "inventory",
  "/daily-prices": "daily-prices",
  "/tasks": "tasks",
  "/projects": "projects",
  "/certificates": "certificates",
  "/users": "users",
  "/reports": "reports",
  "/aging": "aging",
  "/menu-categories": "menu-categories",
  "/raw-materials": "raw-materials",
  "/notifications": "notifications",

  "/profile": "profile",
  "/about": "about",
  "/pos": "pos",
  "/store-pos": "store-pos",
  "/promotions": "promotions",
  "/vouchers": "vouchers",
  "/suppliers": "suppliers",
  "/purchases": "purchases",
  "/expiry": "expiry",
  "/sellers": "sellers",
  "/buyers": "buyers",
  "/viewings": "viewings",
  "/variant-codes": "variant-codes",
  "/types-categories": "types-categories",
  "/employees": "employees",
  "/leaves": "leaves",
  "/payroll": "payroll",
  "/shifts": "shifts",
  "/biometric": "biometric",
  "/messages": "messages",
  "/patients": "patients",
  "/appointments": "appointments",
  "/prescriptions": "prescriptions",
  "/kitchen": "kitchen",
  "/tables": "tables",
};

// دالة تحويل كود المجال لاسم عربي مختصر (للتوافق القديم)
export function getIndustryShortLabel(industry) {
  const labels = {
    general: "🏢 أعمال عامة",
    trader: "📦 تاجر",
    contractor: "🏗️ مقاولات",
    real_estate: "🏠 عقارات",
    super_market: "🏪 سوبر ماركت",
    pharmacy: "💊 صيدلية",
    restaurant: "🍽️ مطعم",
    cafe: "☕ كافيه",
  clothing: "👔 أزياء",
    clinic: "🩺 عيادة",
    hr: "💼 موارد بشرية",
  };
  return labels[industry] || "🏢 أعمال عامة";
}

 // دالة جديدة للحصول على الاسم المترجم
export function getIndustryLabel(industryId, t) {
  const industry = INDUSTRIES.find((ind) => ind.id === industryId);
  if (industry && t) {
    return `${industry.icon} ${t(industry.labelKey)}`;
  }
  return INDUSTRY_LABELS[industryId] || "🏢 تجارة عامة";
}

// دالة للحصول على قائمة المجالات مع ترجمة
export function getTranslatedIndustries(t) {
  return INDUSTRIES.map((ind) => ({
    ...ind,
    label: `${ind.icon} ${t(ind.labelKey)}`,
    desc: t(ind.descKey),
  }));
}

// أسماء الوحدات المترجمة (مفاتيح)
export const MODULE_LABEL_KEYS = {
  dashboard: "modules.dashboard",
  inventory: "modules.inventory",
  "daily-prices": "modules.daily_prices",
  expenses: "modules.expenses",
  profits: "modules.profits",
  vouchers: "modules.vouchers",
  reports: "modules.reports",
  clients: "modules.clients",
  invoices: "modules.invoices",
  sales: "modules.sales",
  tasks: "modules.tasks",
  projects: "modules.projects",
  certificates: "modules.certificates",
  aging: "modules.aging",
  pos: "modules.pos",
  "store-pos": "modules.store_pos",
  suppliers: "modules.suppliers",
  purchases: "modules.purchases",
  barcode: "modules.barcode",
  expiry: "modules.expiry",
  batch: "modules.batch",
  batches: "modules.batch",
  drug_categories: "modules.drug_categories",
  orders: "modules.orders",
  tables: "modules.tables",
  "menu-categories": "modules.menu_categories",
  "raw-materials": "modules.raw_materials",
  sizes_colors: "modules.sizes_colors",
  companies: "modules.companies",
  users: "modules.users",
  notifications: "modules.notifications",

  profile: "modules.profile",
  about: "modules.about",
  "my-company": "modules.my_company",
  sellers: "modules.sellers",
  buyers: "modules.buyers",
  viewings: "modules.viewings",
  "variant-codes": "modules.variant_codes",
  "types-categories": "modules.types_categories",
  employees: "modules.employees",
  leaves: "modules.leaves",
  payroll: "modules.payroll",
  shifts: "modules.shifts",
  biometric: "modules.biometric",
  messages: "modules.messages",
  patients: "modules.patients",
  appointments: "modules.appointments",
  prescriptions: "modules.prescriptions",
  subscriptions: "modules.subscriptions",
  tickets: "modules.tickets",
  attendance: "modules.attendance",
  kitchen: "modules.kitchen",
};

// دالة للحصول على اسم وحدة مترجم
export function getModuleLabel(moduleKey, t) {
  const key = MODULE_LABEL_KEYS[moduleKey];
  return key ? t(key) : moduleKey;
}
