import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics } from 'firebase/analytics';

// Import environment-specific configs
import { firebaseConfig as prodConfig } from './firebase.config.prod';
import { firebaseConfig as testConfig } from './firebase.config.test';

// Determine which config to use based on environment variable
// Default to testing for safety (production requires explicit flag)
const isProduction = process.env.NEXT_PUBLIC_FIREBASE_ENV === 'production';
const firebaseConfig = isProduction ? prodConfig : testConfig;

console.log(`🔥 Firebase Environment: ${isProduction ? 'PRODUCTION' : 'TESTING'}`);
console.log(`🔥 Project ID: ${firebaseConfig.projectId}`);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Analytics (only in browser environment)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
