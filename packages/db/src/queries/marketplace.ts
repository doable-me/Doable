export * from "./marketplace-types.js";
import type postgres from "postgres";
import { marketplaceListingQueries } from "./marketplace-listings.js";
import { marketplaceExtraQueries } from "./marketplace-extras.js";

export function marketplaceQueries(sql: postgres.Sql) {
  return {
    ...marketplaceListingQueries(sql),
    ...marketplaceExtraQueries(sql),
  };
}