import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAFfr8wFOw8wF2NJz2j20ekQBEx8pzva9k",
  authDomain: "myassignment-fc47d.firebaseapp.com",
  projectId: "myassignment-fc47d",
  messagingSenderId: "107013327244",
  appId: "1:107013327244:web:0897587fea5ff0c2b1eea9",
  measurementId: "G-3F2HZG8MFY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.Firebase = {
  app,
  auth,
  db,
  currentProfile: null,
  sdk: {
    addDoc,
    collection,
    createUserWithEmailAndPassword,
    deleteDoc,
    deleteUser,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    signInWithEmailAndPassword,
    signOut,
    Timestamp,
    updateDoc,
    updateProfile,
    where,
    writeBatch
  }
};

let initialAuthResolved = false;
onAuthStateChanged(auth, async (user) => {
  try {
    if (user) {
      const profile = await getDoc(doc(db, "users", user.uid));
      window.Firebase.currentProfile = profile.exists()
        ? { id: user.uid, ...profile.data() }
        : null;
    } else {
      window.Firebase.currentProfile = null;
    }
  } catch (error) {
    window.Firebase.currentProfile = null;
    console.error("Could not load the Firebase user profile.", error);
  }

  if (!initialAuthResolved) {
    initialAuthResolved = true;
    window.resolveFirebaseReady();
  }
});

isSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch((error) => console.warn("Firebase Analytics is unavailable.", error));