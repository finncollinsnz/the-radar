// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFd7Atmv0AKjQnJ5edPo2PbSXD8rUv2to",
  authDomain: "the-radar-7ab6a.firebaseapp.com",
  projectId: "the-radar-7ab6a",
  storageBucket: "the-radar-7ab6a.firebasestorage.app",
  messagingSenderId: "413085082855",
  appId: "1:413085082855:web:683492011a45bee78bee42",
  measurementId: "G-1N2W6X9CKW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export services so other files can use them
export const auth = getAuth(app);
export const db = getFirestore(app);
enableIndexedDbPersistence(db).catch((err) => {
  // This fails if you open your site in multiple tabs — that’s normal
  console.warn("Offline persistence not enabled:", err?.code || err);
});