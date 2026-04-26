export * from "./marketplace-types.js";
export * from "./marketplace-bundles.js";
export * from "./marketplace-moderation.js";
export * from "./marketplace-featured.js";
import type postgres from "postgres";
import { marketplaceListingQueries } from "./marketplace-listings.js";
import { marketplaceExtraQueries } from "./marketplace-extras.js";
import { marketplaceBundleQueries } from "./marketplace-bundles.js";
import { marketplaceModerationQueries } from "./marketplace-moderation.js";
import { marketplaceFeaturedQueries } from "./marketplace-featured.js";

export function marketplaceQueries(sql: postgres.Sql) {
  return {
    ...marketplaceListingQueries(sql),
    ...marketplaceExtraQueries(sql),
    ...marketplaceBundleQueries(sql),
    ...marketplaceModerationQueries(sql),
    ...marketplaceFeaturedQueries(sql),
  };
}