import { createCatalogueInvite, dismissCatalogueSuggestions, dismissSuggestionsSchema, getCatalogueInviteStatus, revokeCatalogueInvite } from "@/lib/catalogue-invite-server";
import { body, handle, json, requireStaff } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    return json(await getCatalogueInviteStatus());
  } catch (error) { return handle(error); }
}

export async function POST(request: Request) {
  try {
    await requireStaff(request);
    return json(await createCatalogueInvite(), 201);
  } catch (error) { return handle(error); }
}

export async function DELETE(request: Request) {
  try {
    await requireStaff(request);
    return json({ invite: await revokeCatalogueInvite() });
  } catch (error) { return handle(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireStaff(request);
    return json(await dismissCatalogueSuggestions(dismissSuggestionsSchema.parse(await body(request))));
  } catch (error) { return handle(error); }
}
