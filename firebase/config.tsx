// FIX: Use namespace import for firebase/app to address a potential module resolution issue where 'initializeApp' was not found as a named export.
import * as firebaseApp from "firebase/app";
import { getAuth, GoogleAuthProvider, EmailAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEYYhhN2sH42vkP7OVJoe8Wt7wy6-M6w0",
  authDomain: "bongo-a6564.firebaseapp.com",
  projectId: "bongo-a6564",
  storageBucket: "bongo-a6564.appspot.com",
  messagingSenderId: "566660257219",
  appId: "1:566660257219:web:7eab5eac9343406ee99976",
  measurementId: "G-6608DWZENB"
};

// Initialize Firebase
const app = firebaseApp.initializeApp(firebaseConfig);

// Export auth instance and providers using v9 modular style
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { EmailAuthProvider };