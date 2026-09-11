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

const AUTH_BLOCK_KEY = 'saas-auth-block';

const AuthContext = createContext();

function rememberAuthBlock(reason) {
  try {
    sessionStorage.setItem(AUTH_BLOCK_KEY, reason);
  } catch {
    /* ignore */
  }
}

// eslint-disable-next-line no-unused-vars
function isMarkedActive(data) {
  return !data || data.isActive !== false;
}

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

  async function assertAccountAllowed(uid) {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists() && !isMarkedActive(userSnap.data())) {
      const err = new Error("account-disabled");
      err.code = "auth/account-disabled";
      throw err;
    }

    const userData = userSnap.exists() ? userSnap.data() : {};
    if (userData.role !== "super_admin" && userData.companyId) {
      const companySnap = await getDoc(doc(db, "companies", userData.companyId));
      if (companySnap.exists() && !isMarkedActive(companySnap.data())) {
        const err = new Error("company-disabled");
        err.code = "auth/company-disabled";
        throw err;
      }
    }
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    try {
      await assertAccountAllowed(cred.user.uid);
    } catch (err) {
      await signOut(auth);
      throw err;
    }
    return cred;
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    let unsubUserDoc = null;
    let unsubCompanyDoc = null;
    let pushInitialized = false;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubCompanyDoc) {
        unsubCompanyDoc();
        unsubCompanyDoc = null;
      }
      setCurrentUser(user);
      
      if (user) {
        // ✅ استماع لحظي لتغييرات مستند المستخدم (Role و CompanyId)
        unsubUserDoc = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
          if (unsubCompanyDoc) {
            unsubCompanyDoc();
            unsubCompanyDoc = null;
          }

          if (docSnap.exists()) {
            const userData = docSnap.data();

            if (!isMarkedActive(userData)) {
              rememberAuthBlock("account-disabled");
              setLoading(false);
              await signOut(auth);
              return;
            }

            setUserRole(userData.role || 'user');
            setUserCompanyId(userData.companyId || null);

            // ✅ جلب مجال العمل (Industry) من الشركة + إيقاف الشركة
            if (userData.companyId) {
              unsubCompanyDoc = onSnapshot(doc(db, "companies", userData.companyId), (companySnap) => {
                if (companySnap.exists()) {
                  const companyData = companySnap.data();
                  setUserIndustry(companyData.industry || 'general');
                  if (userData.role !== "super_admin" && !isMarkedActive(companyData)) {
                    rememberAuthBlock("company-disabled");
                    signOut(auth);
                  }
                } else {
                  setUserIndustry('general');
                }
              }, (e) => {
                console.warn("Error fetching company industry:", e.message);
                setUserIndustry('general');
              });
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