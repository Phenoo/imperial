import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { database, firebaseProjectId } from "@/lib/firebase-server";
import { body, handle } from "@/lib/http";
import { shopEvents } from "@/lib/shop-analytics";
import { isDemoStore } from "@/lib/store-settings";

const eventSchema = z.object({ event: z.enum(shopEvents) }).strict();
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
});

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STORE_ANALYTICS !== "1" || !firebaseProjectId()) {
    return new Response(null, { status: 404 });
  }
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const loopback = host && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host);
  if (!host || (origin !== `https://${host}` && (!loopback || origin !== `http://${host}`))) {
    return new Response(null, { status: 403 });
  }
  try {
    const { event } = eventSchema.parse(await body(request));
    const day = date.format(new Date());
    const mode = isDemoStore() ? "demo" : "store";
    await database().collection("shopAnalytics").doc(`${mode}-${day}`).set({
      day, mode, counts: { [event]: FieldValue.increment(1) },
    }, { merge: true });
    return new Response(null, { status: 204 });
  } catch (error) {
    return handle(error);
  }
}
