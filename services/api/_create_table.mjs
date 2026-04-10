const fs = require('fs');
const envContent = fs.readFileSync('C:/Users/gj/Documents/workspace/doable/services/api/projects/cb78158a-9fd6-482c-ba46-bb03c42fae2d/.env', 'utf8');
const serviceKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].replace(/\s+/g, '');
const url = 'https://bhdqgkwahxrbopjiysfz.supabase.co';

const sql = CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text DEFAULT '',
  completed boolean DEFAULT false,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

async function main() {
  // Try multiple endpoints for running SQL
  const endpoints = ['/pg/query', '/rest/v1/rpc/'];
  
  // Method 1: Try creating via the createClient approach
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceKey);
  
  // Use supabase.rpc to call a function, or use the raw SQL approach
  // Actually let's just try inserting and see the error to confirm connection
  const { data, error } = await supabase.from('tasks').select('id').limit(1);
  console.log('Select result:', JSON.stringify({ data, error }));
  
  if (error && error.code === 'PGRST205') {
    console.log('Table does not exist. Attempting to create via REST...');
    
    // Use the Supabase HTTP API to run SQL
    const resp = await fetch(url + '/rest/v1/rpc/', {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    console.log('RPC status:', resp.status, await resp.text());
  }
}

main().catch(e => console.error(e));
