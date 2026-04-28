import postgres from 'postgres';
import 'dotenv/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run check-migrations.mjs');
}

const sql = postgres(DATABASE_URL);

try {
  console.log('Checking schema_migrations table...');
  const result = await sql`SELECT * FROM schema_migrations ORDER BY name`;
  console.log('Applied migrations:');
  result.forEach(r => console.log(`  ${r.name}`));
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await sql.end();
}
