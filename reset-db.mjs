import postgres from 'postgres';
import 'dotenv/config';
import { URL } from 'node:url';

const adminDatabaseUrl = process.env.RESET_DATABASE_URL ?? process.env.DATABASE_URL;

if (!adminDatabaseUrl) {
  throw new Error('RESET_DATABASE_URL or DATABASE_URL is required to run reset-db.mjs');
}

const parsedUrl = new URL(adminDatabaseUrl);
parsedUrl.pathname = '/postgres';

const sql = postgres(parsedUrl.toString());

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
