import postgres from 'postgres';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  user: 'doable',
  password: 'doable_secret',
  database: 'doable'
});

try {
  console.log('Clearing schema_migrations table...');
  await sql`DELETE FROM schema_migrations WHERE name >= '008_chat_suggestions.sql'`;
  console.log('Done');
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await sql.end();
}
