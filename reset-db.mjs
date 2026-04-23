import postgres from 'postgres';

const sql = postgres({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres' // connect to default postgres db first
});

try {
  console.log('Dropping doable database...');
  await sql`DROP DATABASE IF EXISTS doable;`;
  console.log('Creating doable database...');
  await sql`CREATE DATABASE doable;`;
  console.log('Database reset complete');
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await sql.end();
}
