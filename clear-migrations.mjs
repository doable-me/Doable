import postgres from 'postgres';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run clear-migrations.mjs');
}

const sql = postgres(DATABASE_URL);

try {
  console.log('Clearing schema_migrations table...');
  await sql`DELETE FROM schema_migrations WHERE name >= '008_chat_suggestions.sql'`;
  console.log('Done');
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await sql.end();
}
