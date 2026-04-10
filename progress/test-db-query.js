// Reusable db query helper for ui-db-mon.
// Usage: node progress/test-db-query.js "SELECT count(*) FROM users"
// Must be run from the repo root so the pnpm-store path resolves.
const path = require('path');
const pgPath = path.resolve(__dirname, '..', 'node_modules', '.pnpm', 'pg@8.11.3', 'node_modules', 'pg');
const { Client } = require(pgPath);

const sql = process.argv[2];
if (!sql) {
  console.error('usage: node progress/test-db-query.js "<SQL>"');
  process.exit(2);
}

const c = new Client({ connectionString: 'postgres://doable:doable_secret@localhost:5432/doable' });
c.connect()
  .then(() => c.query(sql))
  .then((r) => {
    console.log(JSON.stringify({ rows: r.rows, count: r.rowCount }));
    return c.end();
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
