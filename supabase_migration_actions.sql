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
