import { z } from "zod";
import { businessSchema, reviewSchema, supportCaseSchema } from "@/lib/business";
import { loadBusinessDashboard, saveBusinessDetails, saveReview, saveSupportCase } from "@/lib/business-server";
import { body, handle, json, requireStaff } from "@/lib/http";

const changeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("business"), value: businessSchema, version: z.string().max(40).nullable() }),
  z.object({ kind: z.literal("review"), value: reviewSchema }),
  z.object({ kind: z.literal("support"), value: supportCaseSchema }),
]);

export async function GET(request: Request) {
  try {
    await requireStaff(request);
    return json(await loadBusinessDashboard());
  } catch (error) { return handle(error); }
}

export async function PUT(request: Request) {
  try {
    await requireStaff(request);
    const change = changeSchema.parse(await body(request));
    switch (change.kind) {
      case "business": return json(await saveBusinessDetails(change.value, change.version));
      case "review": return json({ review: await saveReview(change.value) });
      case "support": return json({ supportCase: await saveSupportCase(change.value) });
    }
  } catch (error) { return handle(error); }
}
