import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function firebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID;
}

function serverApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = firebaseProjectId();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is missing.");
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    if (!projectId.startsWith("demo-") || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("Use both emulators with a demo-* Firebase project.");
    }
    return initializeApp({ projectId });
  }
  if (projectId.startsWith("demo-")) throw new Error("A demo project requires the Firebase emulators.");
  const account = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({ projectId, credential: account ? cert(JSON.parse(account)) : applicationDefault() });
}

export const database = () => getFirestore(serverApp());
export const authAdmin = () => getAuth(serverApp());
