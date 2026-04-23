import postgres from 'postgres';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  user: 'doable',
  password: 'doable_secret',
  database: 'doable'
});

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
