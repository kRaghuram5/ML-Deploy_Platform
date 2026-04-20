import { initializeApp } from "firebase/app";
import { getFirestore, collection, onSnapshot, orderBy, query } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDpEIvklb9Hw22U4OAqNSBgnnFtRQ1VwTM",
  authDomain: "cloud2026-f6912.firebaseapp.com",
  projectId: "cloud2026-f6912",
  storageBucket: "cloud2026-f6912.firebasestorage.app",
  messagingSenderId: "652964220203",
  appId: "1:652964220203:web:ec858197fa6ee990d7896e",
  measurementId: "G-6QWF5B51LS",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Helper: subscribe to all deployed models, real-time
export function subscribeToModels(callback) {
  const q = query(
    collection(db, "deployedModels"),
    orderBy("deployedAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    const models = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(models);
  });
}
