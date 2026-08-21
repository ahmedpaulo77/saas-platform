// src/utils/modules.js - خريطة الوحدات حسب مجال العمل (Industry-Based Modules)

// المجالات المتاحة
export const INDUSTRIES = [
  {
    id: 'general',
    label: '🏢 شركة / مكتب عام',
    desc: 'إدارة عملاء وفواتير ومخزون ومهام ومشاريع',
  },
  {
    id: 'super_market',
    label: '🏪 سوبر ماركت',
    desc: 'نقطة بيع، باركود، صلاحية، موردين، خصومات',
  },
  {
    id: 'pharmacy',
    label: '💊 صيدلية',
    desc: 'نقطة بيع، باركود، صلاحية، تشغيلة، تصنيف أدوية',
  },
  {
    id: 'restaurant',
    label: '🍽️ مطعم / كافيه',
    desc: 'نقطة بيع، طلبات، طاولات، موردين',
  },
  {
    id: 'clothing',
    label: '👕 ملابس',
    desc: 'مخزون مقاسات وألوان، موردين، خصومات',
  },
];

export const INDUSTRY_LABELS = INDUSTRIES.reduce((acc, ind) => {
  acc[ind.id] = ind.label;
  return acc;
}, {});

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
};

// دالة تحويل كود المجال لاسم عربي مختصر
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
