import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAj9IYu7uM7LkaL4B0I3sEyU9lCLXpe1v4",
  authDomain: "inspecta-360.firebaseapp.com",
  projectId: "inspecta-360",
  storageBucket: "inspecta-360.firebasestorage.app",
  messagingSenderId: "724532306322",
  appId: "1:724532306322:web:c7bb16a6b055db23c1a14b"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, googleProvider };
