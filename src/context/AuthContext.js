// src/context/AuthContext.js - نهائي (مع استيراد setDoc)
import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore'; // ✅ أضفنا setDoc هنا
import { auth, db } from '../firebase/config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [userCompanyId, setUserCompanyId] = useState(null);
  const [loading, setLoading] = useState(true);

  async function signup(email, password, role = 'user', companyId = null) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // ✅ بنشئ وثيقة جديدة مرة واحدة بس وقت التسجيل
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

  async function getUserData(uid) {
    try {
      const docRef = doc(db, "users", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (error) {
      console.error("Error getting user data:", error);
      return null;
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const userData = await getUserData(user.uid);
        if (userData) {
          setUserRole(userData.role || 'user');
          setUserCompanyId(userData.companyId || null);
        } else {
          // مفيش document — مش هنعمل حاجة، بس هنسيب الـ role كـ null
          // الـ ProtectedRoute هيتعامل معاه
          setUserRole(null);
          setUserCompanyId(null);
        }
      } else {
        setUserRole(null);
        setUserCompanyId(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    userCompanyId,
    loading,
    signup,
    login,
    logout,
    getUserData
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}