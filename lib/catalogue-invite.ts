import type { z } from "zod";
import type { CategoryId } from "./commerce";
import type { catalogueDetailsSchema } from "./validation";

export const catalogueSuggestionsCollection = "catalogueSuggestions";

export type CatalogueInvite = {
  createdAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
};

export type CatalogueSuggestionInput = z.output<typeof catalogueDetailsSchema> & {
  suggestionVersion: string | null;
};
export type CatalogueSuggestion = Omit<CatalogueSuggestionInput, "suggestionVersion"> & {
  suggestionVersion: string;
  updatedAt: string;
};

export type SharedCatalogueProduct = CatalogueSuggestionInput & {
  name: string;
  brand: string;
  category: CategoryId;
  image: string;
  sku?: string;
  bundleContents?: string[];
  packLocked: boolean;
};

export type SharedCatalogue = { expiresAt: string; products: SharedCatalogueProduct[] };
export type CatalogueInviteStatus = { invite: CatalogueInvite | null; suggestions: CatalogueSuggestion[] };
