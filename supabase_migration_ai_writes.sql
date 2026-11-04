-- Safe, idempotent transaction creation for the in-app AI assistant.
-- Run this once in the Supabase SQL editor before enabling AI transaction writes.

CREATE TABLE IF NOT EXISTS public.ai_write_requests (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.ai_write_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_write_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_ai_transaction_once(
  p_request_id UUID,
  p_title TEXT,
  p_amount NUMERIC,
  p_type TEXT,
  p_created_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rows INTEGER;
  v_transaction_id UUID;
  v_transaction JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_request_id IS NULL OR p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 220
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 OR p_amount <> round(p_amount, 2)
     OR p_type IS NULL OR p_type NOT IN ('income', 'expense') OR p_created_at IS NULL THEN
    RAISE EXCEPTION 'Invalid transaction';
  END IF;

  INSERT INTO public.ai_write_requests (user_id, request_id)
  VALUES (v_user_id, p_request_id)
  ON CONFLICT (user_id, request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT transaction_id INTO v_transaction_id
    FROM public.ai_write_requests
    WHERE user_id = v_user_id AND request_id = p_request_id;
    IF v_transaction_id IS NULL THEN
      RAISE EXCEPTION 'Previously confirmed transaction is unavailable';
    END IF;
    SELECT to_jsonb(t) INTO v_transaction
    FROM public.transactions t
    WHERE t.id = v_transaction_id AND t.user_id = v_user_id;
    IF v_transaction IS NULL THEN
      RAISE EXCEPTION 'Previously confirmed transaction is unavailable';
    END IF;
    RETURN v_transaction;
  END IF;

  INSERT INTO public.transactions (user_id, title, amount, type, created_at)
  VALUES (v_user_id, trim(p_title), p_amount, p_type, p_created_at)
  RETURNING id INTO v_transaction_id;

  UPDATE public.ai_write_requests
  SET transaction_id = v_transaction_id
  WHERE user_id = v_user_id AND request_id = p_request_id;

  SELECT to_jsonb(t) INTO v_transaction
  FROM public.transactions t
  WHERE t.id = v_transaction_id AND t.user_id = v_user_id;
  RETURN v_transaction;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ai_transaction_once(UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ai_transaction_once(UUID, TEXT, NUMERIC, TEXT, TIMESTAMPTZ) TO authenticated;
