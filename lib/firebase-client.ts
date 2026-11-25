import { getApps, initializeApp } from "firebase/app";
import { browserSessionPersistence, connectAuthEmulator, initializeAuth } from "firebase/auth";

export const staffConfigured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
let instance: ReturnType<typeof initializeAuth> | undefined;

export function staffAuth() {
  if (instance) return instance;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  if (!projectId || !apiKey) throw new Error("Firebase web configuration is missing.");
  if (Boolean(emulator) !== projectId.startsWith("demo-")) throw new Error("Firebase web configuration and emulator settings do not match.");
  const app = getApps().find((entry) => entry.name === "imperial-staff") ?? initializeApp({
    apiKey, projectId, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  }, "imperial-staff");
  instance = initializeAuth(app, { persistence: browserSessionPersistence });
  if (emulator) connectAuthEmulator(instance, emulator, { disableWarnings: true });
  return instance;
}
