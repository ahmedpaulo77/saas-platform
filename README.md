<div align="center">

# 🚀 AamalyPro
### منصة إدارة الأعمال المتكاملة

[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-12-ffa000?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Stripe](https://img.shields.io/badge/Stripe-Ready-635bff?style=flat-square&logo=stripe)](https://stripe.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![RTL](https://img.shields.io/badge/Arabic-RTL-blue?style=flat-square)]()

> نظام SaaS عربي متكامل لإدارة الشركات والعملاء والفواتير والمخزون والمهام — مبني بـ React 19 و Firebase

</div>

---

## 📸 لقطات الشاشة

| الصفحة | الوصف |
|--------|-------|
| 🔐 Login | تصميم dark mode احترافي |
| 📊 Dashboard | إحصائيات حية من Firebase |
| 📄 الفواتير | إنشاء وتصدير PDF بضغطة واحدة |
| 💳 الاشتراكات | 3 باقات مدفوعة جاهزة لـ Stripe |
| 👑 Super Admin | إدارة كاملة لجميع الشركات |

---

## ✨ المميزات

### الوحدات الرئيسية
- 🏢 **إدارة الشركات** — إضافة وتعديل وإدارة اشتراكات الشركات
- 👥 **إدارة العملاء** — ربط العملاء بالشركات مع بحث متقدم
- 📄 **الفواتير + PDF** — إنشاء فواتير احترافية وتصديرها كـ PDF بضغطة واحدة
- 📦 **إدارة المخزون** — تتبع المنتجات مع تحديث تلقائي عند كل عملية بيع
- ✅ **إدارة المهام** — توزيع المهام بالأولويات والمواعيد
- 📊 **التقارير** — إحصائيات شاملة وتصدير Excel لكل البيانات

### المميزات التقنية
- 🔐 **Firebase Auth** — تسجيل دخول آمن مع صلاحيات متعددة المستويات
- 💳 **Stripe Ready** — نظام اشتراكات كامل جاهز للربط بـ Stripe
- 🔔 **إشعارات ذكية** — تنبيهات تلقائية للمخزون والفواتير والمهام
- 📱 **Responsive** — يعمل على جميع الأجهزة
- 🌙 **Dark Sidebar** — تصميم احترافي بـ Cairo font
- 👑 **Super Admin Panel** — لوحة تحكم كاملة لمدير النظام

---

## 🛠 التقنيات المستخدمة

| التقنية | الإصدار | الاستخدام |
|---------|---------|-----------|
| React | 19 | Frontend framework |
| Firebase | 12 | Auth + Firestore database |
| React Router | 7 | Client-side routing |
| Vite | 6 | Build + dev server |
| Vitest + jsdom | 2 + 24 | Unit tests (`npm test`) |
| jsPDF + autoTable | 4 + 5 | تصدير الفواتير كـ PDF |
| XLSX | 0.18 | تصدير التقارير لـ Excel |
| Recharts | 3 | الرسوم البيانية |
| Font Awesome | 6.5 | الأيقونات |
| Cairo Font | - | الخط العربي |

---

## ⚡ تشغيل المشروع محلياً

### المتطلبات
- Node.js 20+
- npm أو yarn
- حساب Firebase

### الخطوات

```bash
# 1. clone المشروع
git clone https://github.com/yourusername/saas-platform.git
cd saas-platform

# 2. تثبيت الـ dependencies
npm install --legacy-peer-deps

# 3. إعداد Firebase (انسخ .env.example إلى .env واملأ القيم)
cp .env.example .env

# 4. تشغيل المشروع (Vite على http://localhost:3000)
npm run dev

# 5. الاختبارات والفحوصات
npm test
npm run verify:all
```

---

## 🔥 إعداد Firebase

### 1. إنشاء مشروع Firebase
1. اذهب إلى [Firebase Console](https://console.firebase.google.com)
2. أنشئ مشروع جديد
3. فعّل **Authentication** → Email/Password
4. فعّل **Firestore Database**

### 2. إعداد ملف الـ Config
انسخ `.env.example` إلى `.env` واملأ القيم من Firebase Console → Project Settings:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

> الكود يقرأ من `import.meta.env` فقط (`src/firebase/config.js`) — لا توجد مفاتيح مضمنة في الكود. لو متغير ناقص ستظهر رسالة خطأ واضحة في الكونسول.

### 3. Firestore Rules
القواعد المحكمة موجودة في `firestore.rules` (عزل كامل حسب `companyId` + حماية مالية + أكواد دعوة). للنشر:
```bash
npm run deploy:rules
npm run deploy:indexes
```
لا تستخدم القاعدة المفتوحة `allow read, write: if request.auth != null` في الإنتاج.

### 4. إنشاء Super Admin
شغّل السكريبت ده مرة واحدة بس:

```bash
node src/scripts/createSuperAdmin.js
```

أو أنشئ مستخدم في Firebase Auth وافتح Firestore وأضف في collection `users`:
```json
{
  "email": "admin@yourdomain.com",
  "role": "super_admin",
  "isActive": true
}
```

---

## 💳 الاشتراكات
نظام الاشتراكات الحالي simulation داخل التطبيق (`src/pages/Subscriptions.js`) — لا يوجد تكامل Stripe حقيقي بعد، ولا توجد `stripe-js` في `package.json`.

### لتفعيل الدفع الحقيقي (مستقبلاً):

**1. Frontend** — في `src/pages/Subscriptions.js`:
```js
const STRIPE_PUBLIC_KEY = 'pk_live_XXXXXXXX'; // مفتاحك الحقيقي
```

**2. Backend** — محتاج server-side للـ Stripe Checkout Session:
```js
// مثال Node.js / Express
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: 'https://yourdomain.com/dashboard?success=true',
  cancel_url: 'https://yourdomain.com/subscription',
  client_reference_id: companyId,
});
```

**3. Webhook** — لتحديث Firebase عند نجاح الدفع:
```js
stripe.webhooks.constructEvent(payload, sig, webhookSecret);
// عند checkout.session.completed → updateDoc في Firebase
```

---

## 📁 هيكل المشروع (مختصر — المشروع الفعلي ~43 صفحة)

```
saas-platform/
├── public/
├── src/
│   ├── components/common/  # Sidebar, ProtectedRoute, SuperAdminRoute, ErrorBoundary, Pagination
│   ├── components/invoices/# InvoiceForm, InvoiceTable, InvoiceModals
│   ├── context/            # AuthContext, NotificationsContext
│   ├── firebase/config.js  # يقرأ من import.meta.env فقط (لا مفاتيح مضمنة)
│   ├── i18n/               # LanguageContext + translations (ar/en)
│   ├── hooks/              # useInvoices, useFirestorePagination
│   ├── utils/              # fmt, limits, seats, auditLogger, modules, icons...
│   ├── pages/              # ~43 صفحة: Dashboard, POS, StorePOS, Invoices, Sales,
│   │                       # Purchases, Inventory, Expenses, Profits, Reports, Aging,
│   │                       # Clients/Sellers/Buyers, Suppliers, Kitchen, Tables,
│   │                       # Patients/Appointments/Prescriptions, Projects/Certificates...
│   │   └── admin/          # SuperAdminDashboard, ManageUsers
│   ├── styles/             # tokens + layout/sidebar/tables/forms/login/skeleton
│   ├── App.js              # Router + lazy code-splitting
│   └── App.css             # ملف تجميعي يستورد styles/ (لا تعدله مباشرة)
├── tools/                  # سكريبتات verify-* و test-* (npm run verify:all)
├── firestore.rules / firestore.indexes.json / storage.rules
└── vercel.json / firebase.json
```

> ملاحظة: `/companies` القديم أصبح redirect إلى `/admin`، و `/batches` أصبح redirect إلى `/expiry`.

---

## 🚀 الـ Deployment

### Vercel (الأسرع)
```bash
npm install -g vercel
npm run build
vercel --prod
```
أو وصّل الـ repo بـ [vercel.com](https://vercel.com) مباشرة.

### Netlify
```bash
npm run build
# ارفع الـ build folder على netlify.com
# أو وصّل الـ GitHub repo
```
ملف `_redirects` موجود تلقائياً في الـ `public` folder.

### Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy
```

---

## 👤 أنواع المستخدمين

| النوع | الصلاحيات |
|-------|-----------|
| `super_admin` | كل شيء + لوحة الأدمن + إدارة اشتراكات الشركات |
| `user` | الوصول لجميع الوحدات حسب الشركة |

---

## 📋 الـ Firestore Collections

| Collection | الوصف |
|------------|-------|
| `users` | بيانات المستخدمين والصلاحيات |
| `companies` | الشركات + بيانات الاشتراك |
| `clients` | العملاء مع ربطهم بالشركات |
| `invoices` | الفواتير |
| `inventory` | المنتجات والمخزون |
| `tasks` | المهام |

---

## ⚠️ ملاحظات مهمة قبل الإنتاج

- [ ] غيّر Firestore Rules من `allow all` لقواعد محكمة
- [ ] أضف Stripe Secret Key في backend آمن (مش في الـ frontend)
- [ ] فعّل Firebase App Check لحماية الـ API
- [ ] أضف `.env` file للـ API keys وأضفه لـ `.gitignore`
- [ ] اختبر الاشتراكات على Stripe Test Mode قبل الإنتاج

---

## 📄 الرخصة

MIT License — حر في الاستخدام التجاري والتعديل.

---

<div align="center">
  صُنع بـ ❤️ للشركات العربية
</div>
