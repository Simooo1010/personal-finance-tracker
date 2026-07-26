-- =============================================
-- Finance Tracker: AI Chat Multi-Session & Memory Migration
-- =============================================
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. Create chat_sessions table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nuova chat',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for chat_sessions
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own chat sessions" ON public.chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- 2. Add session_id to chat_messages & add UPDATE/DELETE policies
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can update own chat messages') THEN
    CREATE POLICY "Users can update own chat messages" ON public.chat_messages FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can delete own chat messages') THEN
    CREATE POLICY "Users can delete own chat messages" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Create user_ai_memory table for long-term AI memory
CREATE TABLE IF NOT EXISTS public.user_ai_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  memory_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for user_ai_memory
ALTER TABLE public.user_ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI memory" ON public.user_ai_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI memory" ON public.user_ai_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI memory" ON public.user_ai_memory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI memory" ON public.user_ai_memory
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Auto-migrate existing chat messages without session_id into a session per user
DO $$
DECLARE
  r RECORD;
  new_session_id UUID;
  first_msg_text TEXT;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.chat_messages WHERE session_id IS NULL LOOP
    -- Try to find an existing session for this user
    SELECT id INTO new_session_id 
    FROM public.chat_sessions 
    WHERE user_id = r.user_id 
    ORDER BY created_at ASC 
    LIMIT 1;

    -- If no session exists, create one
    IF new_session_id IS NULL THEN
      SELECT content INTO first_msg_text 
      FROM public.chat_messages 
      WHERE user_id = r.user_id AND session_id IS NULL AND role = 'user'
      ORDER BY created_at ASC 
      LIMIT 1;

      IF first_msg_text IS NULL THEN
        first_msg_text := 'Conversazione precedente';
      ELSIF length(first_msg_text) > 35 THEN
        first_msg_text := substring(first_msg_text from 1 for 35) || '...';
      END IF;

      INSERT INTO public.chat_sessions (user_id, title)
      VALUES (r.user_id, first_msg_text)
      RETURNING id INTO new_session_id;
    END IF;

    -- Update legacy messages
    UPDATE public.chat_messages
    SET session_id = new_session_id
    WHERE user_id = r.user_id AND session_id IS NULL;
  END LOOP;
END $$;
