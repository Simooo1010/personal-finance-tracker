-- =============================================
-- Finance Tracker: Multi-User Migration
-- =============================================
-- Run this in the Supabase SQL Editor
-- AFTER registering your personal account
-- =============================================

-- 1. Create wallets table
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- 2. Add user_id column to transactions
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Enable RLS on both tables
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for transactions
CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING (auth.uid() = user_id);

-- 5. RLS Policies for wallets
CREATE POLICY "Users can view own wallets" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wallets" ON public.wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallets" ON public.wallets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wallets" ON public.wallets
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- 6. AFTER you register your personal account,
--    find your user_id in the Supabase Auth dashboard
--    and run the following (replace YOUR_USER_ID):
-- =============================================

-- UPDATE public.transactions SET user_id = 'YOUR_USER_ID' WHERE user_id IS NULL;

-- INSERT INTO public.wallets (user_id, slug, name, description, position) VALUES
--   ('YOUR_USER_ID', 'busta', '✉️ Busta', 'Denaro liquido protetto e archiviato', 0),
--   ('YOUR_USER_ID', 'fuori', '✈️ Fuori', 'Denaro in tasca o portafoglio fisico', 1),
--   ('YOUR_USER_ID', 'apple', '🍎 Apple Account', 'Credito digitale account Apple', 2),
--   ('YOUR_USER_ID', 'postepay', '💳 Postepay', 'Carta prepagata Poste Italiane', 3);
