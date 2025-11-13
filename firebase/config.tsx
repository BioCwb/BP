// FIX: Switched to firebase/compat imports to support v8 syntax, resolving "no exported member" errors.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/database';

const firebaseConfig = {
  apiKey: "AIzaSyAEYYhhN2sH42vkP7OVJoe8Wt7wy6-M6w0",
  authDomain: "bongo-a6564.firebaseapp.com",
  projectId: "bongo-a6564",
  storageBucket: "bongo-a6564.appspot.com",
  messagingSenderId: "566660257219",
  appId: "1:566660257219:web:7eab5eac9343406ee99976",
  measurementId: "G-6608DWZENB"
};

// Initialize Firebase App
// FIX: Use v8 compat initialization.
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}


// Initialize and export Firebase services
// FIX: Export v8-style services.
export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
export const rtdb = firebase.database();

// Export providers and utilities
// FIX: Export v8-style providers and FieldValue methods.
export const googleProvider = new firebase.auth.GoogleAuthProvider();
export const EmailAuthProvider = firebase.auth.EmailAuthProvider;
export const arrayUnion = firebase.firestore.FieldValue.arrayUnion;
export const increment = firebase.firestore.FieldValue.increment;
export const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
export const FieldPath = firebase.firestore.FieldPath;