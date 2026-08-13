// src/scripts/createSuperAdmin.js
import { auth, db } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

// استخدم هذا السكريبت لإنشاء أول مستخدم سوبر أدمن
async function createSuperAdmin() {
  const email = 'admin@yourdomain.com';
  const password = 'Admin@123456';

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