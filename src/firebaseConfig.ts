import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDuzkcT9kXOWP-bg7_BvyrErpLbU2wZhis",
  authDomain: "app-ganadera1889.firebaseapp.com",
  projectId: "app-ganadera1889",
  storageBucket: "app-ganadera1889.firebasestorage.app",
  messagingSenderId: "811227877914",
  appId: "1:811227877914:web:9feeeecf3272f04fed37a3",
  measurementId: "G-KZT7Z696K1"
};

const app = initializeApp(firebaseConfig);

// Inicializar Firestore con soporte offline multi-pestaña
const dbFirestore = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

const auth = getAuth(app);

export { app, dbFirestore, auth };
