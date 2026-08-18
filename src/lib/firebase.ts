import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDOjq73_eiO5Cxkj_glJ-lkjFw3dCHyqn0",
  authDomain: "arca-f3fc6.firebaseapp.com",
  projectId: "arca-f3fc6",
  storageBucket: "arca-f3fc6.firebasestorage.app",
  messagingSenderId: "5926341116",
  appId: "1:5926341116:web:c7f4b7a5fbab9502600a79",
  measurementId: "G-LVMQC8BDV4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestoreのデータベースを使えるようにエクスポート
export const db = getFirestore(app);