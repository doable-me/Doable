const { Client } = require('C:/Users/gj/temp_pg/node_modules/pg');
const fs = require('fs');

const envContent = fs.readFileSync(
  'C:/Users/gj/Documents/workspace/doable/services/api/projects/cb78158a-9fd6-482c-ba46-bb03c42fae2d/.env',
  'utf8'
);
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/\s+/g, '');
const ref = 'bhdqgkwahxrbopjiysfz';

const regions = [
  'us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-west-2',
  'eu-central-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-south-1'
];

const sql = `
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  completed boolean DEFAULT false,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY allow_all ON public.tasks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`;

async function tryConnect(region) {
  const client = new Client({
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${ref}`,
    password: serviceKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(`Connected via region: ${region}`);
    const result = await client.query(sql);
    console.log('Table created successfully!');
    
    // Verify
    const verify = await client.query('SELECT count(*) FROM public.tasks');
    console.log('Verification OK, row count:', verify.rows[0].count);
    
    await client.end();
    return true;
  } catch (err) {
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  // Also try direct connection
  const directClient = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: serviceKey,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  });

  try {
    await directClient.connect();
    console.log('Connected via direct connection!');
    await directClient.query(sql);
    console.log('Table created successfully!');
    const verify = await directClient.query('SELECT count(*) FROM public.tasks');
    console.log('Verification OK, row count:', verify.rows[0].count);
    await directClient.end();
    return;
  } catch (err) {
    console.log('Direct connection failed:', err.message);
    try { await directClient.end(); } catch {}
  }

  // Try pooler with each region
  for (const region of regions) {
    process.stdout.write(`Trying ${region}... `);
    const ok = await tryConnect(region);
    if (ok) return;
    console.log('failed');
  }

  console.log('All connection attempts failed.');
}

main().catch(e => console.error('Fatal:', e));
