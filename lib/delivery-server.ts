import "server-only";
import { cache } from "react";
import { database, firebaseProjectId } from "./firebase-server";
import { cachedPublicStoreRead } from "./public-store-cache";
import {
  defaultDeliveryConfiguration, deliveryConfigurationSchema, deliverySettings, type DeliveryConfiguration,
} from "./store-settings";

function reference() {
  return database().collection("storeSettings").doc("delivery");
}

function record(snapshot: FirebaseFirestore.DocumentSnapshot) {
  return {
    configuration: snapshot.exists ? deliveryConfigurationSchema.parse(snapshot.data()) : defaultDeliveryConfiguration(),
    version: snapshot.updateTime ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : null,
  };
}

export async function getDeliveryConfiguration() {
  return record(await reference().get());
}

const readPublicRules = cachedPublicStoreRead("delivery", async () =>
  deliverySettings((await getDeliveryConfiguration()).configuration), () => deliverySettings());
const publicRules = cache(async () => firebaseProjectId() ? readPublicRules() : deliverySettings());

export async function getDeliverySettings(transaction?: FirebaseFirestore.Transaction) {
  if (!transaction) return publicRules();
  return deliverySettings(record(await transaction.get(reference())).configuration);
}

export async function saveDeliveryConfiguration(configuration: DeliveryConfiguration, version: string | null, staffId: string) {
  const item = reference();
  const saved = await database().runTransaction(async (transaction) => {
    const existing = record(await transaction.get(item));
    if (existing.version !== version) return false;
    transaction.set(item, { ...configuration, updatedAt: new Date().toISOString(), staffId });
    return true;
  });
  return saved ? getDeliveryConfiguration() : null;
}
