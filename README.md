<div align="center">

# 🚀 SaaS PRO
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
| jsPDF + autoTable | 4 + 5 | تصدير الفواتير كـ PDF |
| XLSX | 0.18 | تصدير التقارير لـ Excel |
| Stripe.js | 9 | نظام الدفع والاشتراكات |
| Font Awesome | 6.5 | الأيقونات |
| Cairo Font | - | الخط العربي |

---

## ⚡ تشغيل المشروع محلياً

### المتطلبات
- Node.js 18+
- npm أو yarn
- حساب Firebase

### الخطوات

```bash
# 1. clone المشروع
git clone https://github.com/yourusername/saas-platform.git
cd saas-platform

# 2. تثبيت الـ dependencies
npm install

# 3. إعداد Firebase (اتبع القسم التالي)

# 4. تشغيل المشروع
npm start
```

---

## 🔥 إعداد Firebase

### 1. إنشاء مشروع Firebase
1. اذهب إلى [Firebase Console](https://console.firebase.google.com)
2. أنشئ مشروع جديد
3. فعّل **Authentication** → Email/Password
4. فعّل **Firestore Database**

### 2. إعداد ملف الـ Config
الملف موجود في `src/firebase/config.js` — استبدل القيم بقيم مشروعك:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Firestore Rules
افتح Firestore → Rules والصق:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

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

## 💳 إعداد Stripe (اختياري)

المشروع جاهز للربط بـ Stripe — فيه simulation mode شغال بدونه.

### لتفعيل الدفع الحقيقي:

**1. Frontend** — في `src/pages/Subscription.js`:
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

## 📁 هيكل المشروع

```
saas-platform/
├── public/
│   ├── index.html          # HTML الرئيسي + Favicon
│   ├── favicon.svg         # الأيقونة (cube gradient)
│   └── _redirects          # Netlify SPA routing fix
├── src/
│   ├── components/
│   │   └── common/
│   │       ├── Sidebar.js          # القائمة الجانبية
│   │       ├── ProtectedRoute.js   # حماية الصفحات
│   │       └── SuperAdminRoute.js  # صلاحيات الأدمن
│   ├── context/
│   │   └── AuthContext.js   # إدارة الـ Auth
│   ├── firebase/
│   │   └── config.js        # إعدادات Firebase
│   ├── pages/
│   │   ├── Login.js         # صفحة الدخول
│   │   ├── Dashboard.js     # الرئيسية + إحصائيات
│   │   ├── Companies.js     # إدارة الشركات
│   │   ├── Clients.js       # إدارة العملاء
│   │   ├── Invoices.js      # الفواتير + PDF export
│   │   ├── Inventory.js     # المخزون
│   │   ├── Tasks.js         # المهام
│   │   ├── Reports.js       # التقارير + Excel export
│   │   ├── Notifications.js # الإشعارات الذكية
│   │   ├── Subscription.js  # الاشتراكات + Stripe
│   │   ├── Profile.js       # الملف الشخصي
│   │   ├── About.js         # حول النظام
│   │   └── admin/
│   │       └── SuperAdminDashboard.js
│   ├── utils/
│   │   └── pdfExport.js     # منطق تصدير PDF
│   ├── App.js               # الـ Router الرئيسي
│   └── App.css              # Design System كامل
└── vercel.json              # إعداد Vercel
```

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
