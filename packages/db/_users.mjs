import postgres from 'postgres';
const sql = postgres('postgres://doable:doable_secret@localhost:5432/doable');
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='users'`;
console.log('Columns:', cols.map(c => c.column_name).join(', '));
const r = await sql`SELECT * FROM users ORDER BY created_at DESC LIMIT 3`;
console.log(JSON.stringify(r, null, 2));
await sql.end();
