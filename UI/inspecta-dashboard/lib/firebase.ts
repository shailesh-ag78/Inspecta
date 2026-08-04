import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence, browserLocalPersistence } from 'firebase/auth';

// const firebaseConfig = {
//   apiKey: "AIzaSyAj9IYu7uM7LkaL4B0I3sEyU9lCLXpe1v4",
//   authDomain: "inspecta-360.firebaseapp.com",
//   projectId: "inspecta-360",
//   storageBucket: "inspecta-360.firebasestorage.app",
//   messagingSenderId: "724532306322",
//   appId: "1:724532306322:web:c7bb16a6b055db23c1a14b"
// };

// Initialize Firebase safely for SSR/prerendering
const isBrowser = typeof window !== 'undefined';
const hasApiKey = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy-api-key-for-build",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = (isBrowser || hasApiKey) ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()) : null;
const auth = app ? getAuth(app) : ({} as any);

if (isBrowser && app) {
  // Use local persistence in development for convenience, and session persistence in production for security.
  const persistenceMode = process.env.NODE_ENV === 'development' ? browserLocalPersistence : browserSessionPersistence;
  
  setPersistence(auth, persistenceMode).catch((err) => {
    console.error("Failed to set Firebase session persistence:", err);
  });
}

const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider };
