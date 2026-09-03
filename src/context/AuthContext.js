// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db, initializePushNotifications } from '../firebase/config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userCompanyId, setUserCompanyId] = useState(null);
  const [userIndustry, setUserIndustry] = useState('general');
  const [loading, setLoading] = useState(true);

  /**
   * ✅ خطوة 1: إنشاء حساب Auth بس (من غير كتابة أي حاجة في Firestore)
   * لازم تتنفذ الأولى قبل أي عملية على Firestore (companies...)
   * عشان request.auth يبقى موجود وقت التحقق من الـ Security Rules
   */
  async function signupAuth(email, password) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  }

  /**
   * ✅ خطوة 2: كتابة مستند المستخدم في Firestore بعد ما يكون مسجل دخول فعلياً
   */
  async function createUserDoc(uid, email, role = 'user', companyId = null) {
    await setDoc(doc(db, "users", uid), {
      email,
      role,
      companyId,
      createdAt: new Date().toISOString(),
      isActive: true,
    });
  }

  /**
   * ✅ (للتوافق القديم) نسخة مجمّعة: تسجيل + كتابة مستند مباشرة
   * تستخدم فقط لو مفيش عمليات Firestore تانية (زي البحث عن شركة) قبل التسجيل
   */
  async function signup(email, password, role = 'user', companyId = null) {
    const user = await signupAuth(email, password);
    await createUserDoc(user.uid, user.email, role, companyId);
    return user;
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    let unsubUserDoc = null;
    let pushInitialized = false;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      
      if (user) {
        // ✅ استماع لحظي لتغييرات مستند المستخدم (Role و CompanyId)
        unsubUserDoc = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUserRole(userData.role || 'user');
            setUserCompanyId(userData.companyId || null);

            // ✅ جلب مجال العمل (Industry) من الشركة
            if (userData.companyId) {
              try {
                const companySnap = await getDoc(doc(db, "companies", userData.companyId));
                const industry = companySnap.exists() ? companySnap.data().industry || 'general' : 'general';
                setUserIndustry(industry);
              } catch (e) {
                console.warn("Error fetching company industry:", e.message);
                setUserIndustry('general');
              }
            } else {
              setUserIndustry('general');
            }
            
            // ✅ تهيئة Push Notifications مرة واحدة فقط
            if (!pushInitialized && userData.companyId) {
              pushInitialized = true;
              initializePushNotifications(user.uid, userData.companyId).catch(console.warn);
            }
          } else {
            // ✅ لو مفيش مستند، استخدم القيم الافتراضية
            setUserRole('user');
            setUserCompanyId(null);
            setUserIndustry('general');
          }
          setLoading(false);
        }, (error) => {
          // ✅ منع ظهور الخطأ في الكونسول بشكل مزعج
          console.warn("Error listening to user doc:", error.message);
          setLoading(false);
        });

      } else {
        setUserRole(null);
        setUserCompanyId(null);
        setUserIndustry('general');
        pushInitialized = false;
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  const value = {
    currentUser,
    userRole,
    userCompanyId,
    userIndustry,
    loading,
    signup,
    signupAuth,
    createUserDoc,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}