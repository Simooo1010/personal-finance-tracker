const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  // We can't easily execute raw SQL using the JS client without a stored procedure, 
  // but if it's the anon key it definitely won't work for schema creation.
  console.log("Checking credentials...")
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Schema creation via JS client might fail.")
  }

  // Instead of creating via JS, we'll output the SQL for the user or try to execute it if there is a way.
  const sql = `
    CREATE TABLE IF NOT EXISTS action_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      undo_data JSONB,
      redo_data JSONB,
      is_cancelled BOOLEAN DEFAULT FALSE
    );

    ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can manage their own action logs"
      ON action_logs FOR ALL
      USING (auth.uid() = user_id);
  `
  console.log("Please run the following SQL in your Supabase SQL Editor:")
  console.log(sql)
}

runMigration()
