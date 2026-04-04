import { sql } from "./src/db/index.js";

// Check which projects have thumbnails and how many thumbnail attempts
const projects = await sql`
  SELECT p.id, p.name, p.thumbnail_url, p.updated_at,
    (SELECT COUNT(*) FROM thumbnail_logs tl WHERE tl.project_id = p.id) as thumbnail_attempts
  FROM projects p
  ORDER BY p.updated_at DESC
  LIMIT 15
`;
console.table(projects);

// List all thumbnail log entries
const logs = await sql`SELECT project_id, status, error_message, triggered_by, created_at FROM thumbnail_logs ORDER BY created_at DESC LIMIT 20`;
console.table(logs);

process.exit(0);
