import { starterCatalog } from "../lib/catalog.ts";
import { authAdmin, database, firebaseProjectId } from "../lib/firebase-server.ts";

const project = firebaseProjectId();
const emulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
if (!project || (!emulator && !process.argv.includes("--live"))) {
  throw new Error("Configure both emulators or explicitly run with --live for your configured Firebase project.");
}

if (!process.argv.includes("--admin-only")) {
  const collection = database().collection("products");
  let created = 0;
  for (const product of starterCatalog) {
    const ref = collection.doc(product.id);
    await database().runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.exists) return false;
      transaction.create(ref, product);
      return true;
    }).then((inserted) => { if (inserted) created++; });
  }
  console.log(`Created ${created} catalog items in ${project}.`);
}

const email = process.env.STAFF_EMAIL;
const password = process.env.STAFF_PASSWORD;
if (email) {
  const auth = authAdmin();
  const user = await auth.getUserByEmail(email).catch(async (error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found") {
      if (!password || password.length < 12) throw new Error("Set STAFF_PASSWORD to at least 12 characters to create a staff account.");
      return auth.createUser({ email, password });
    }
    throw error;
  });
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  console.log(`Staff access set in ${project}.`);
} else if (process.argv.includes("--admin-only")) {
  throw new Error("Set STAFF_EMAIL before granting staff access.");
}
