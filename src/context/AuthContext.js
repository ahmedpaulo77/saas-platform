// src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, setDoc, onSnapshot, getDoc } from 'firebase/firestore'; // ✅ استبدلنا getDoc بـ onSnapshot
import { auth, db } from '../firebase/config';

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

  async function signup(email, password, role = 'user', companyId = null) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role: role,
        companyId: companyId,
        createdAt: new Date().toISOString(),
        isActive: true
      });
      
      return userCredential;
    } catch (error) {
      throw error;
    }
  }

  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    let unsubUserDoc = null;

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
                console.error("Error fetching company industry:", e);
                setUserIndustry('general');
              }
            } else {
              setUserIndustry('general');
            }
          } else {
            setUserRole(null);
            setUserCompanyId(null);
            setUserIndustry('general');
          }
          setLoading(false);
        }, (error) => {
          console.error("Error listening to user doc:", error);
          setLoading(false);
        });

      } else {
        setUserRole(null);
        setUserCompanyId(null);
        setUserIndustry('general');
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
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}