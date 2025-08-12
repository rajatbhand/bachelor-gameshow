import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration for bachelore-gameshow project
const firebaseConfig = {
  apiKey: "AIzaSyB_2aYV2IGZdrNj4-aR4PWApKZrhUlOY9g",
  authDomain: "bachelore-gameshow.firebaseapp.com",
  projectId: "bachelore-gameshow",
  storageBucket: "bachelore-gameshow.firebasestorage.app",
  messagingSenderId: "819584265831",
  appId: "1:819584265831:web:3bc16d030b6b2b66752ec2",
  measurementId: "G-G9ZRWDBS3C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Analytics (only in browser environment)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Note: Using production Firestore database
// For development with emulators, uncomment the lines below:
// if (process.env.NODE_ENV === 'development') {
//   try {
//     connectFirestoreEmulator(db, 'localhost', 8080);
//     connectAuthEmulator(auth, 'http://localhost:9099');
//   } catch {
//     console.log('Emulators already connected or not available');
//   }
// }

export default app;
