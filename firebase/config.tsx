import firebase from "firebase/app";
import "firebase/auth";

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
const app = firebase.initializeApp(firebaseConfig);

// Export auth instance and providers using v8 compat style
export const auth = firebase.auth();
export const googleProvider = new firebase.auth.GoogleAuthProvider();
export const EmailAuthProvider = firebase.auth.EmailAuthProvider;
