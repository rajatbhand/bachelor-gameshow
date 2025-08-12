import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration for bachelore-gameshow project
const firebaseConfig = {
  apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // You'll need to replace this
  authDomain: "bachelore-gameshow.firebaseapp.com",
  projectId: "bachelore-gameshow",
  storageBucket: "bachelore-gameshow.appspot.com",
  messagingSenderId: "123456789", // You'll need to replace this
  appId: "1:123456789:web:abcdef123456" // You'll need to replace this
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

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
