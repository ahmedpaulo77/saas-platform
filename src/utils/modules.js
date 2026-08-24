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
];

// للتوافق مع الكود القديم (مباشر)
export const INDUSTRY_LABELS = {
  general: '🏢 شركة / مكتب عام',
  super_market: '🏪 سوبر ماركت',
  pharmacy: '💊 صيدلية',
  restaurant: '🍽️ مطعم / كافيه',
  clothing: '👕 ملابس',
};

// خريطة الوحدات: كل مجال → الوحدات المسموح بها
export const MODULE_MAP = {
  // الوحدات الأساسية المتاحة للجميع
  _base: [
    'dashboard',
    'inventory',
    'reports',
  ],

  // مجالات العمل
  general: [
    'clients',
    'invoices',
    'tasks',
    'projects',
    'aging',
    'sellers',    // ✅ إضافة
    'buyers',     // ✅ إضافة
  ],

  super_market: [
    'pos',
    'clients',
    'invoices',
    'suppliers',
    'barcode',
    'expiry',
  ],

  pharmacy: [
    'pos',
    'clients',
    'invoices',
    'suppliers',
    'barcode',
    'expiry',
    'batch',
    'drug_categories',
  ],

  restaurant: [
    'pos',
    'orders',
    'tables',
    'suppliers',
  ],

  clothing: [
    'clients',
    'invoices',
    'suppliers',
    'sizes_colors',
  ],
};

// الوحدات المتاحة لكل مستخدم
export function getAvailableModules(industry, userRole) {
  // السوبر أدمن يشوف كل حاجة
  if (userRole === 'super_admin') {
    return new Set([
      'dashboard', 'companies', 'clients', 'invoices', 'inventory',
      'tasks', 'projects', 'users', 'reports', 'aging', 'notifications',
      'subscription', 'profile', 'about', 'pos', 'suppliers', 'barcode',
      'expiry', 'batch', 'drug_categories', 'orders', 'tables', 'sizes_colors',
      'my-company', 'sellers', 'buyers',  // ✅ إضافة
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
  modules.add('subscription');
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
  '/subscription': 'subscription',
  '/profile': 'profile',
  '/about': 'about',
  '/pos': 'pos',
  '/suppliers': 'suppliers',
  '/expiry': 'expiry',
  '/sellers': 'sellers',   // ✅ إضافة
  '/buyers': 'buyers',     // ✅ إضافة
};

// دالة تحويل كود المجال لاسم عربي مختصر (للتوافق القديم)
export function getIndustryShortLabel(industry) {
  const labels = {
    general: '🏢 عام',
    super_market: '🏪 سوبر ماركت',
    pharmacy: '💊 صيدلية',
    restaurant: '🍽️ مطعم',
    clothing: '👕 ملابس',
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
  subscription: 'modules.subscription',
  profile: 'modules.profile',
  about: 'modules.about',
  'my-company': 'modules.my_company',
  sellers: 'modules.sellers',   // ✅ إضافة
  buyers: 'modules.buyers',     // ✅ إضافة
};

// دالة للحصول على اسم وحدة مترجم
export function getModuleLabel(moduleKey, t) {
  const key = MODULE_LABEL_KEYS[moduleKey];
  return key ? t(key) : moduleKey;
}