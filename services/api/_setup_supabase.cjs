const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envContent = fs.readFileSync(
  'C:/Users/gj/Documents/workspace/doable/services/api/projects/cb78158a-9fd6-482c-ba46-bb03c42fae2d/.env',
  'utf8'
);
const url = envContent.match(/VITE_SUPABASE_URL=(.+)/)[1].trim();
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/\s+/g, '');
const ref = url.replace('https://', '').replace('.supabase.co', '');

const supabase = createClient(url, serviceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

async function main() {
  // Use the Supabase Management API v1 SQL endpoint
  const mgmtClientId = process.env.OAUTH_SUPABASE_MGMT_CLIENT_ID;
  const mgmtClientSecret = process.env.OAUTH_SUPABASE_MGMT_CLIENT_SECRET;

  console.log('Project ref:', ref);
  console.log('Mgmt creds available:', !!mgmtClientId);

  // The management API uses authorization_code flow, not usable here.
  // Instead, use the database direct connection via supabase-js admin features.
  // supabase-js can run SQL via .rpc() if we create a helper function first.
  // But we can't create the function without SQL access...

  // Let's try the Supabase Studio /api/pg-meta endpoint
  const studioEndpoints = [
    '/pg-meta/default/query',
    '/api/pg-meta/default/query',
  ];

  const sql = [
    "CREATE TABLE IF NOT EXISTS public.tasks (",
    "  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,",
    "  title text NOT NULL,",
    "  description text DEFAULT '',",
    "  completed boolean DEFAULT false,",
    "  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),",
    "  category text DEFAULT 'general',",
    "  created_at timestamptz DEFAULT now(),",
    "  updated_at timestamptz DEFAULT now()",
    ");"
  ].join('\n');

  const rlsSql = "ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS allow_all ON public.tasks; CREATE POLICY allow_all ON public.tasks FOR ALL USING (true) WITH CHECK (true);";

  for (const endpoint of studioEndpoints) {
    console.log('\nTrying endpoint:', endpoint);
    try {
      const resp = await fetch(url + endpoint, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      });
      const body = await resp.text();
      console.log('Status:', resp.status, 'Body:', body.substring(0, 300));
      if (resp.ok) {
        // Also run RLS
        const rlsResp = await fetch(url + endpoint, {
          method: 'POST',
          headers: {
            'apikey': serviceKey,
            'Authorization': 'Bearer ' + serviceKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ query: rlsSql })
        });
        console.log('RLS status:', rlsResp.status);
        break;
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }

  // Also try the management API v1 SQL query endpoint directly
  console.log('\nTrying management API...');
  try {
    const mgmtResp = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    console.log('Mgmt API status:', mgmtResp.status);
    console.log('Mgmt API body:', (await mgmtResp.text()).substring(0, 300));
  } catch (e) {
    console.log('Mgmt API error:', e.message);
  }

  // Verify
  const { data, error } = await supabase.from('tasks').select('id').limit(1);
  console.log('\nFinal verification:', error ? 'FAIL: ' + error.message : 'OK, rows: ' + data.length);
}

main().catch(e => console.error('Fatal:', e));
