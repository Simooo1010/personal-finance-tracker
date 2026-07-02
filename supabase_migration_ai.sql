-- =============================================
-- Finance Tracker: AI Analysis Migration
-- =============================================
-- Run this in the Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS public.ai_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  first_generation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_generation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_auto_generation_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_analysis
CREATE POLICY "Users can view own AI analysis" ON public.ai_analysis
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI analysis" ON public.ai_analysis
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI analysis" ON public.ai_analysis
  FOR UPDATE USING (auth.uid() = user_id);
