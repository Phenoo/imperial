import "server-only";
import { authAdmin, firebaseProjectId } from "./firebase-server";
import { StoreError } from "./store-server";
import { ZodError } from "zod";

export function json<T>(body: T, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function body(request: Request, maxBytes = 24_576): Promise<unknown> {
  if (!request.headers.get("content-type")?.match(/^application\/json(?:;|$)/i)) {
    throw new StoreError("Expected a JSON request.", 415);
  }
  const stream = request.body?.getReader();
  if (!stream) throw new StoreError("Invalid request data.", 400);
  const decoder = new TextDecoder();
  let length = 0;
  let value = "";
  while (true) {
    const chunk = await stream.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > maxBytes) {
      await stream.cancel();
      throw new StoreError("The request is too large.", 413);
    }
    value += decoder.decode(chunk.value, { stream: true });
  }
  try { return JSON.parse(value + decoder.decode()); } catch { throw new StoreError("Invalid request data.", 400); }
}

export function requireStore(message = "The store isn’t accepting orders right now.") {
  if (!firebaseProjectId()) throw new StoreError(message, 503);
}

export async function requireStaff(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new StoreError("Sign in with your staff account.", 401);
  if (!firebaseProjectId()) throw new StoreError("Staff access isn’t configured.", 503);
  const auth = authAdmin();
  const claims = await auth.verifyIdToken(token, true).catch(() => {
    throw new StoreError("Your session expired. Sign in again.", 401);
  });
  if (claims.admin !== true) throw new StoreError("This account does not have staff access.", 403);
  return claims;
}

export function handle(error: unknown) {
  if (error instanceof StoreError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: "Check the submitted details.", fields: error.issues.map(({ path, message }) => ({ field: path.join("."), message })) }, 400);
  console.error("Store operation failed", error instanceof Error ? error.message : error);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
