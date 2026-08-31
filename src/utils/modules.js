// src/utils/modules.js - خريطة الوحدات حسب مجال العمل (Industry-Based Modules)
// مع دعم الترجمة i18n

// المجالات المتاحة - مع مفاتيح ترجمة
export const INDUSTRIES = [
  {
    id: 'general',
    labelKey: 'industries.general.label',
    descKey: 'industries.general.desc',
    icon: '🏢',
  },
  {
    id: 'trader',
    labelKey: 'industries.trader.label',
    descKey: 'industries.trader.desc',
    icon: '📦',
  },
  {
    id: 'contractor',
    labelKey: 'industries.contractor.label',
    descKey: 'industries.contractor.desc',
    icon: '🏗️',
  },
  {
    id: 'real_estate',
    labelKey: 'industries.real_estate.label',
    descKey: 'industries.real_estate.desc',
    icon: '🏠',
  },
  {
    id: 'services',
    labelKey: 'industries.services.label',
    descKey: 'industries.services.desc',
    icon: '💼',
  },
  {
    id: 'super_market',
    labelKey: 'industries.super_market.label',
    descKey: 'industries.super_market.desc',
    icon: '🏪',
  },
  {
    id: 'pharmacy',
    labelKey: 'industries.pharmacy.label',
    descKey: 'industries.pharmacy.desc',
    icon: '💊',
  },
  {
    id: 'restaurant',
    labelKey: 'industries.restaurant.label',
    descKey: 'industries.restaurant.desc',
    icon: '🍽️',
  },
  {
    id: 'clothing',
    labelKey: 'industries.clothing.label',
    descKey: 'industries.clothing.desc',
    icon: '👕',
  },
  {
    id: 'clinic',
    labelKey: 'industries.clinic.label',
    descKey: 'industries.clinic.desc',
    icon: '🩺',
  },
];

// للتوافق مع الكود القديم (مباشر)
export const INDUSTRY_LABELS = {
  general: '🏢 شركة / مكتب عام',
  trader: '📦 تاجر / استيراد وتصدير',
  contractor: '🏗️ مقاولات',
  real_estate: '🏠 عقارات',
  services: '💼 خدمات',
  super_market: '🏪 سوبر ماركت',
  pharmacy: '💊 صيدلية',
  restaurant: '🍽️ مطعم / كافيه',
  clothing: '👕 ملابس',
  clinic: '🩺 طبيب / عيادة',
};

// خريطة الوحدات: كل مجال → الوحدات المسموح بها
export const MODULE_MAP = {
  // الوحدات الأساسية المتاحة للجميع
  _base: [
    'dashboard',
    'inventory',
    'reports',
  ],

  // تاجر / استيراد وتصدير (من غير Sellers و Buyers)
  trader: [
    'clients',
    'invoices',
    'suppliers',
    'tasks',
    'aging',
    'messages',
  ],

  // مقاولات (من غير Sellers و Buyers)
  contractor: [
    'clients',
    'invoices',
    'projects',
    'tasks',
    'suppliers',
    'aging',
    'messages',
  ],

  // ✅ عقارات (بائعين ومشترين فقط - بدون عملاء وفواتير وأعمار ديون)
  real_estate: [
    'sellers',
    'buyers',
    'tasks',
    'projects',
    'messages',
  ],

  // خدمات (عملاء، فواتير، مشاريع، مهام - بدون موردين وبائعين ومشترين)
  services: [
    'clients',
    'invoices',
    'tasks',
    'projects',
    'aging',
    'messages',
  ],

  // عام - كل الوحدات المتاحة
  general: [
    'clients',
    'invoices',
    'tasks',
    'projects',
    'aging',
    'sellers',
    'buyers',
    'suppliers',
    'messages',
  ],

  // سوبر ماركت - نقطة بيع + صلاحية + مهام ورسائل للفريق
  super_market: [
    'pos',
    'clients',
    'invoices',
    'suppliers',
    'barcode',
    'expiry',
    'tasks',
    'messages',
  ],

  // صيدلية - نقطة بيع + تشغيلة + تصنيف أدوية + مهام ورسائل
  pharmacy: [
    'pos',
    'clients',
    'invoices',
    'suppliers',
    'barcode',
    'expiry',
    'batch',
    'drug_categories',
    'tasks',
    'messages',
  ],

  // مطعم / كافيه - طلبات وطاولات وصلاحيات طعام + مهام ورسائل
  restaurant: [
    'pos',
    'orders',
    'tables',
    'suppliers',
    'expiry',
    'tasks',
    'messages',
  ],

  // ملابس - مقاسات وألوان + مهام ورسائل للموظفين
  clothing: [
    'clients',
    'invoices',
    'suppliers',
    'sizes_colors',
    'tasks',
    'messages',
  ],

  // طبيب / عيادة - مرضى ومواعيد وروشتات فقط (بدون أعمار ديون)
  clinic: [
    'patients',
    'appointments',
    'prescriptions',
    'invoices',
    'tasks',
    'expiry',
    'messages',
  ],
};

// الوحدات المتاحة لكل مستخدم
export function getAvailableModules(industry, userRole) {
  // السوبر أدمن يشوف كل حاجة
  if (userRole === 'super_admin') {
    return new Set([
      'dashboard', 'companies', 'clients', 'invoices', 'inventory',
      'tasks', 'projects', 'users', 'reports', 'aging', 'notifications',
      'profile', 'about', 'pos', 'suppliers', 'barcode',
      'expiry', 'batch', 'drug_categories', 'orders', 'tables', 'sizes_colors',
      'my-company', 'sellers', 'buyers', 'messages',
      'patients', 'appointments', 'prescriptions',
    ]);
  }

  const modules = new Set([...MODULE_MAP._base]);
  if (industry && MODULE_MAP[industry]) {
    MODULE_MAP[industry].forEach((m) => modules.add(m));
  } else {
    // لو مفيش مجال محدد → نعطي الوحدات العامة
    MODULE_MAP.general.forEach((m) => modules.add(m));
  }

  // صفحات ثابتة للجميع
  modules.add('notifications');
  modules.add('profile');
  modules.add('about');
  modules.add('my-company');

  return modules;
}

// التحقق من صلاحية الوصول لصفحة
export function canAccess(moduleKey, industry, userRole) {
  const available = getAvailableModules(industry, userRole);
  return available.has(moduleKey);
}

// خريطة المسارات → الوحدات
export const ROUTE_MODULE_MAP = {
  '/dashboard': 'dashboard',
  '/companies': 'companies',
  '/clients': 'clients',
  '/invoices': 'invoices',
  '/inventory': 'inventory',
  '/tasks': 'tasks',
  '/projects': 'projects',
  '/users': 'users',
  '/reports': 'reports',
  '/aging': 'aging',
  '/notifications': 'notifications',

  '/profile': 'profile',
  '/about': 'about',
  '/pos': 'pos',
  '/suppliers': 'suppliers',
  '/expiry': 'expiry',
  '/sellers': 'sellers',
  '/buyers': 'buyers',
  '/messages': 'messages',
  '/patients': 'patients',
  '/appointments': 'appointments',
  '/prescriptions': 'prescriptions',
};

// دالة تحويل كود المجال لاسم عربي مختصر (للتوافق القديم)
export function getIndustryShortLabel(industry) {
  const labels = {
    general: '🏢 عام',
    trader: '📦 تاجر',
    contractor: '🏗️ مقاولات',
    real_estate: '🏠 عقارات',
    services: '💼 خدمات',
    super_market: '🏪 سوبر ماركت',
    pharmacy: '💊 صيدلية',
    restaurant: '🍽️ مطعم',
  clothing: '👕 ملابس',
  clinic: '🩺 عيادة',
};
  return labels[industry] || '🏢 عام';
}

// دالة جديدة للحصول على الاسم المترجم
export function getIndustryLabel(industryId, t) {
  const industry = INDUSTRIES.find(ind => ind.id === industryId);
  if (industry && t) {
    return `${industry.icon} ${t(industry.labelKey)}`;
  }
  return INDUSTRY_LABELS[industryId] || '🏢 عام';
}

// دالة للحصول على قائمة المجالات مع ترجمة
export function getTranslatedIndustries(t) {
  return INDUSTRIES.map(ind => ({
    ...ind,
    label: `${ind.icon} ${t(ind.labelKey)}`,
    desc: t(ind.descKey),
  }));
}

// أسماء الوحدات المترجمة (مفاتيح)
export const MODULE_LABEL_KEYS = {
  dashboard: 'modules.dashboard',
  inventory: 'modules.inventory',
  reports: 'modules.reports',
  clients: 'modules.clients',
  invoices: 'modules.invoices',
  tasks: 'modules.tasks',
  projects: 'modules.projects',
  aging: 'modules.aging',
  pos: 'modules.pos',
  suppliers: 'modules.suppliers',
  barcode: 'modules.barcode',
  expiry: 'modules.expiry',
  batch: 'modules.batch',
  drug_categories: 'modules.drug_categories',
  orders: 'modules.orders',
  tables: 'modules.tables',
  sizes_colors: 'modules.sizes_colors',
  companies: 'modules.companies',
  users: 'modules.users',
  notifications: 'modules.notifications',

  profile: 'modules.profile',
  about: 'modules.about',
  'my-company': 'modules.my_company',
  sellers: 'modules.sellers',
  buyers: 'modules.buyers',
  messages: 'modules.messages',
  patients: 'modules.patients',
  appointments: 'modules.appointments',
  prescriptions: 'modules.prescriptions',
};

// دالة للحصول على اسم وحدة مترجم
export function getModuleLabel(moduleKey, t) {
  const key = MODULE_LABEL_KEYS[moduleKey];
  return key ? t(key) : moduleKey;
}