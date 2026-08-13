// src/firebase/config.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAcakZzub29Lp4T41TGDIMLPoFkupzd2is",
  authDomain: "saas-platform-5d7a3.firebaseapp.com",
  projectId: "saas-platform-5d7a3",
  storageBucket: "saas-platform-5d7a3.firebasestorage.app",
  messagingSenderId: "91595383960",
  appId: "1:91595383960:web:51611912db0635d2e9dced"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
