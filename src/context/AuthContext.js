// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db, initializePushNotifications } from '../firebase/config.js';
import { createUserSeated } from '../utils/seats.js';

const AUTH_BLOCK_KEY = 'aamalypro-auth-block';

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
  // الوحدات المقفولة من السوبر أدمن لهذه الشركة (companies/{id}.disabledModules)
  const [userDisabledModules, setUserDisabledModules] = useState([]);
  const normDisabled = (v) => (Array.isArray(v) ? v.filter((m) => typeof m === "string") : []);
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
   * ✅ إضافة: joinCode — لو المستخدم بينضم بكود دعوة، لازم نبعت الكود
   *    جوا مستند الإنشاء عشان الـ Rule تتحقق منه في invite_codes ({_joinCode}).
   *    من غير الحقل ده، الـ create هيترفض (rule فرع "ب" محتاجه).
   *    لحالة "إنشاء شركة جديدة" سيبه فاضي (undefined).
   * ✅ إضافة: status='pending' — اللي بيعمل شركة جديدة من الصفر حسابه
   *    بيتعمل مجمّد (isActive:false) لحد ما السوبر أدمن يقبله. اللي بينضم
   *    بكود دعوة بيدخل نشط على طول (مدير شركته هو اللي دعاه).
   */
  async function createUserDoc(uid, email, role = 'user', companyId = null, joinCode = null, status = null) {
    const payload = {
      email,
      role,
      companyId,
      createdAt: new Date().toISOString(),
      isActive: true,
    };
    if (joinCode) {
      payload._joinCode = joinCode;
    }
    if (status === 'pending') {
      payload.isActive = false;
      payload.status = 'pending';
    }
    // ⚠️ مش setDoc عادي: لو الشركة عندها سقف users/admins، الكتابة لازم
    // تكون جوه transaction مع العدّاد بتاعها. غير كده حد ممكن يعمل 101
    // يوزر لو ضغط "إضافة" في نفس اللحظة مع حد تاني.
    return createUserSeated({ uid, payload });
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
    const userData = userSnap.exists() ? userSnap.data() : {};
    // ⏳ حساب جديد لسه متوافقش عليه من السوبر أدمن — رسالة مخصصة بدل "موقوف"
    if (userSnap.exists() && userData.isActive === false && userData.status === 'pending') {
      const err = new Error("account-pending");
      err.code = "auth/account-pending";
      throw err;
    }
    if (userSnap.exists() && !isMarkedActive(userData)) {
      const err = new Error("account-disabled");
      err.code = "auth/account-disabled";
      throw err;
    }
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
    // الـ uid اللي الـ listener الحالي متاعه — بنستخدمه عشان نستبعد
    // callbacks قديمة بتيجي بعد ما الـ user يتغيّر.
    let listeningUid = null;
    // شبكة أمان: لو مستند الشركة اتأخر (نت معلق) منعلقش على سبينر للأبد
    let loadTimer = null;
    const armLoadTimer = (uid) => {
      if (loadTimer) clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        if (listeningUid === uid) setLoading(false);
      }, 10000);
    };

    const unsubscribeAllDocs = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubCompanyDoc) {
        unsubCompanyDoc();
        unsubCompanyDoc = null;
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // ⚠️ مهم: كان بيتنضف unsubCompanyDoc بس. مستند المستخدم القديم
      // (unsubUserDoc) كان **يفضل شغال** بعد الـ logout — فلما المستخدم
      // التاني يدخل، أي تغيير في مستند الأول كان بيكتب role/companyId
      // بتاع الأول فوق بيانات الثاني (تسريب صلاحيات + حالة غلط).
      unsubscribeAllDocs();
      listeningUid = user?.uid || null;
      armLoadTimer(listeningUid);
      setCurrentUser(user);
      //صفّر القيم قبل ما نقرأ البروفايل الجديد — عشان مفيش لحظة
      // تكون فيها صلاحيات قديمة نافذة على الحساب الجديد
      setUserRole(null);
      setUserCompanyId(null);
      setUserDisabledModules([]);

      if (user) {
        // ✅ استماع لحظي لتغييرات مستند المستخدم (Role و CompanyId)
        unsubUserDoc = onSnapshot(doc(db, "users", user.uid), async (docSnap) => {
          // لو الـ user اتغيّر/antنينا لسه شغالين → دي نتيجة قديمة
          if (listeningUid !== user.uid) return;
          if (unsubCompanyDoc) {
            unsubCompanyDoc();
            unsubCompanyDoc = null;
          }

          // ⚠️ معرّفة هنا (نطاق الـ callback كله) — كانت جوّه فرع الـ if
          // ففرع الـ else كان بيرمي ReferenceError: finish is not defined
          // عند أول دخول لحساب فشل إنشاء مستنده.
          const finish = () => {
            if (listeningUid === user.uid) setLoading(false);
          };

          if (docSnap.exists()) {
            const userData = docSnap.data();

            if (!isMarkedActive(userData)) {
              rememberAuthBlock(userData.status === 'pending' ? "account-pending" : "account-disabled");
              setLoading(false);
              await signOut(auth);
              return;
            }

            setUserRole(userData.role || 'user');
            setUserCompanyId(userData.companyId || null);

            // مفتاح الإصلاح: لا ننهي التحميل حتى يصل مجال العمل الحقيقي.
            // قبل كده loading كانت بتبقى false فور مستند المستخدم بينما
            // userIndustry لسه 'general' الافتراضية — فـ IndustryRoute كان
            // بيحسب صلاحيات غلط (عيادة على /patients مثلًا) ويطرد للداش
            // بورد مع أول ريفريش، حتى لو الحساب سليم.
            // (دالة finish معرّفة فوق على نطاق الـ callback كله)
            // ✅ جلب مجال العمل (Industry) من الشركة + إيقاف الشركة
            if (userData.companyId) {
              let firstCompanySnap = true;
              const companyFirstDone = () => {
                if (firstCompanySnap) { firstCompanySnap = false; finish(); }
              };
              unsubCompanyDoc = onSnapshot(doc(db, "companies", userData.companyId), (companySnap) => {
                if (listeningUid !== user.uid) return;
                if (companySnap.exists()) {
                  const companyData = companySnap.data();
                  setUserIndustry(companyData.industry || 'general');
                  setUserDisabledModules(normDisabled(companyData.disabledModules));
                  if (userData.role !== "super_admin" && !isMarkedActive(companyData)) {
                    rememberAuthBlock("company-disabled");
                    signOut(auth);
                  }
                } else {
                  setUserIndustry('general');
                  setUserDisabledModules([]);
                }
                companyFirstDone();
              }, (e) => {
                console.warn("Error fetching company industry:", e.message);
                setUserIndustry('general');
                setUserDisabledModules([]);
                companyFirstDone();
              });
            } else {
              setUserIndustry('general');
              setUserDisabledModules([]);
              finish();
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
            setUserDisabledModules([]);
            finish();
          }
        }, (error) => {
          console.warn("Error listening to user doc:", error.message);
          // ⚠️ قبل كده كان بيحط loading=false بس ويسيب userRole زي ما هو.
          // ProtectedRoute كان بيرسم شاشة تحميل للأبد. دلوقتي بنحدّد
          // الحالة بوضوح بدل ما نسيب المستخدم في حلقة.
          if (listeningUid === user.uid) {
            setUserRole("user");
            setUserCompanyId(null);
            setUserDisabledModules([]);
            setLoading(false);
          }
        });

      } else {
        if (loadTimer) clearTimeout(loadTimer);
        setUserRole(null);
        setUserCompanyId(null);
        setUserIndustry('general');
        setUserDisabledModules([]);
        pushInitialized = false;
        setLoading(false);
      }
    });

    return () => {
      if (loadTimer) clearTimeout(loadTimer);
      unsubscribeAuth();
      unsubscribeAllDocs();
    };
  }, []);

  const value = {
    currentUser,
    userRole,
    userCompanyId,
    userIndustry,
    userDisabledModules,
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