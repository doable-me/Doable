export * from "./environments-types.js";
import type postgres from "postgres";
import { environmentCoreQueries } from "./environments-core.js";
import { environmentHelperQueries } from "./environments-helpers.js";

export function environmentQueries(sql: postgres.Sql) {
  const core = environmentCoreQueries(sql);
  return {
    ...core,
    ...environmentHelperQueries(sql, core),
  };
}