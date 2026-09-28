// src/scripts/createSuperAdmin.js
// ⚠️ الأمان: لا توجد قيم افتراضية هنا عن قصد — الإيميل والباسورد كانوا
// مكتوبين ثابتين في الملف (ومنشورين في الـ git)، فأي شخص يقرأ الريبو
// كان يعرف بيانات دخول السوبر أدمن. مرّرها عبر متغيرات البيئة فقط.
import { auth, db } from '../firebase/config.js';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// استخدم هذا السكريبت لإنشاء أول مستخدم سوبر أدمن
async function createSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL || '';
  const password = process.env.SUPERADMIN_PASSWORD || '';
  if (!email || !password || password.length < 12) {
    console.error('❌ حدّد SUPERADMIN_EMAIL وباسورد قوي (12 حرف على الأقل) قبل التشغيل.');
    console.error('   مثال (PowerShell): $env:SUPERADMIN_EMAIL="you@domain.com"; $env:SUPERADMIN_PASSWORD="..."; node src/scripts/createSuperAdmin.js');
    process.exit(1);
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      role: 'super_admin',
      createdAt: new Date().toISOString(),
      isActive: true
    });

    console.log('✅ تم إنشاء السوبر أدمن بنجاح!');
    console.log('📧 البريد:', email);
    console.log('🔑 كلمة المرور:', password);
  } catch (error) {
    console.error('❌ خطأ في إنشاء السوبر أدمن:', error.message);
  }
}

// لتشغيل السكريبت: node src/scripts/createSuperAdmin.js
createSuperAdmin();