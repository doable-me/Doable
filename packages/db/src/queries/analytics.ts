export * from "./analytics-types.js";
import type postgres from "postgres";
import { analyticsTrackingQueries } from "./analytics-tracking.js";
import { analyticsOverviewQueries } from "./analytics-overview.js";
import { analyticsReportQueries } from "./analytics-reports.js";
import { analyticsMaintenanceQueries } from "./analytics-maintenance.js";

export function analyticsQueries(sql: postgres.Sql) {
  return {
    ...analyticsTrackingQueries(sql),
    ...analyticsOverviewQueries(sql),
    ...analyticsReportQueries(sql),
    ...analyticsMaintenanceQueries(sql),
  };
}