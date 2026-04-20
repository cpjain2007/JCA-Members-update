import { initializeApp, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

function requireEnv(name: keyof ImportMetaEnv): string {
  const v = import.meta.env[name];
  if (!v) {
    throw new Error(
      `Missing ${String(name)}. Copy web/env.example to web/.env.local and fill Firebase web config.`,
    );
  }
  return v;
}

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = initializeApp({
    apiKey: requireEnv("VITE_FIREBASE_API_KEY"),
    authDomain: requireEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: requireEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: requireEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: requireEnv("VITE_FIREBASE_APP_ID"),
  });
  return app;
}

export const db = () => getFirestore(getFirebaseApp());
