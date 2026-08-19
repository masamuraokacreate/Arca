/**
 * src/lib/firebase.ts
 * Firebase 初期化、Firestore オフライン永続化、および Firebase Auth
 *
 * Sprint 6:
 *  - persistentLocalCache + persistentMultipleTabManager による複数タブ対応 IndexedDB キャッシュ
 *  - Firebase Authentication による Google ログインゲート
 */

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDOjq73_eiO5Cxkj_glJ-lkjFw3dCHyqn0",
  authDomain: "arca-f3fc6.firebaseapp.com",
  projectId: "arca-f3fc6",
  storageBucket: "arca-f3fc6.firebasestorage.app",
  messagingSenderId: "5926341116",
  appId: "1:5926341116:web:c7f4b7a5fbab9502600a79",
  measurementId: "G-LVMQC8BDV4",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with IndexedDB multi-tab persistence
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// Initialize Firebase Auth
export const auth = getAuth(app);