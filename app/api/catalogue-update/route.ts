import { getSharedCatalogue, inviteToken, saveSharedCatalogue, suggestionsSchema } from "@/lib/catalogue-invite-server";
import { body, handle, json } from "@/lib/http";

export async function GET(request: Request) {
  try {
    return json(await getSharedCatalogue(inviteToken(request)));
  } catch (error) { return handle(error); }
}

export async function PATCH(request: Request) {
  try {
    const token = inviteToken(request);
    return json(await saveSharedCatalogue(token, suggestionsSchema.parse(await body(request, 96 * 1024))));
  } catch (error) { return handle(error); }
}
