-- Safe, idempotent finance writes for the in-app AI assistant.
-- Run this in the Supabase SQL editor before confirming AI proposals.

CREATE TABLE IF NOT EXISTS public.ai_write_requests (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);

ALTER TABLE public.ai_write_requests
  ADD COLUMN IF NOT EXISTS result JSONB;

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

CREATE OR REPLACE FUNCTION public.execute_ai_write_once(
  p_request_id UUID,
  p_command JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rows INTEGER;
  v_op TEXT := p_command->>'operation';
  v_expected JSONB;
  v_next JSONB;
  v_record JSONB;
  v_result JSONB;
  v_saved JSONB;
  v_row public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_memory TEXT;
  v_index INTEGER;
  v_count INTEGER;
  v_title TEXT;
  v_slug TEXT;
  v_amount NUMERIC;
  v_type TEXT;
  v_created_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_command) <> 'object' THEN
    RAISE EXCEPTION 'Invalid AI write request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_write_requests (user_id, request_id)
  VALUES (v_user_id, p_request_id)
  ON CONFLICT (user_id, request_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT result INTO v_result
    FROM public.ai_write_requests
    WHERE user_id = v_user_id AND request_id = p_request_id;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
    RAISE EXCEPTION 'This confirmation was already used, but its result is unavailable.' USING ERRCODE = '40001';
  END IF;

  IF v_op = 'transactions.insert' THEN
    IF jsonb_typeof(p_command->'records') <> 'array'
       OR jsonb_array_length(p_command->'records') NOT BETWEEN 1 AND 2 THEN
      RAISE EXCEPTION 'Invalid transaction records' USING ERRCODE = '22023';
    END IF;
    v_result := jsonb_build_object('transactions', '[]'::jsonb);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_command->'records') r WHERE (r->>'title') ~ '\[([a-zA-Z0-9_-]+)-transfer\]$')
       AND jsonb_array_length(p_command->'records') <> 2 THEN
      RAISE EXCEPTION 'Transfers must contain both wallet movements.' USING ERRCODE = '22023';
    END IF;
    FOR v_record IN SELECT value FROM jsonb_array_elements(p_command->'records') LOOP
      v_title := v_record->>'title';
      v_slug := substring(v_title from '\[([a-zA-Z0-9_-]+)(-transfer)?\]$');
      v_amount := (v_record->>'amount')::numeric;
      v_type := v_record->>'type';
      v_created_at := (v_record->>'created_at')::timestamptz;
      IF v_title IS NULL OR length(trim(v_title)) NOT BETWEEN 1 AND 220
         OR v_slug IS NULL OR v_amount <= 0 OR v_amount > 1000000 OR v_amount <> round(v_amount, 2)
         OR v_type NOT IN ('income', 'expense') OR v_created_at IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id AND slug = v_slug) THEN
        RAISE EXCEPTION 'Invalid transaction record or wallet' USING ERRCODE = '22023';
      END IF;
      IF v_title ~ '\[([a-zA-Z0-9_-]+)-transfer\]$'
         AND ((v_record->>'type' = 'expense' AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_command->'records') peer
           WHERE peer->>'type' = 'income' AND peer->>'amount' = v_record->>'amount'
             AND peer->>'created_at' = v_record->>'created_at'
             AND regexp_replace(peer->>'title', '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '') = regexp_replace(v_title, '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '')
         )) OR (v_record->>'type' = 'income' AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_command->'records') peer
           WHERE peer->>'type' = 'expense' AND peer->>'amount' = v_record->>'amount'
             AND peer->>'created_at' = v_record->>'created_at'
             AND regexp_replace(peer->>'title', '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '') = regexp_replace(v_title, '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '')
         ))) THEN
        RAISE EXCEPTION 'Transfer records must be a matching income and expense pair.' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.transactions (user_id, title, amount, type, created_at)
      VALUES (v_user_id, v_title, v_amount, v_type, v_created_at)
      RETURNING * INTO v_row;
      v_result := jsonb_set(v_result, '{transactions}', (v_result->'transactions') || jsonb_build_array(to_jsonb(v_row) - 'user_id'));
    END LOOP;
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'transactions.update' THEN
    IF jsonb_typeof(p_command->'before') <> 'array'
       OR jsonb_typeof(p_command->'after') <> 'array'
       OR jsonb_array_length(p_command->'before') NOT BETWEEN 1 AND 2
       OR jsonb_array_length(p_command->'before') <> jsonb_array_length(p_command->'after') THEN
      RAISE EXCEPTION 'Invalid transaction update' USING ERRCODE = '22023';
    END IF;
    v_result := jsonb_build_object('transactions', '[]'::jsonb);
    FOR v_index IN 0 .. jsonb_array_length(p_command->'before') - 1 LOOP
      v_expected := p_command->'before'->v_index;
      v_next := p_command->'after'->v_index;
      SELECT * INTO v_row FROM public.transactions
      WHERE id = (v_expected->>'id')::uuid AND user_id = v_user_id FOR UPDATE;
      IF NOT FOUND OR v_row.title IS DISTINCT FROM v_expected->>'title'
         OR v_row.amount IS DISTINCT FROM (v_expected->>'amount')::numeric
         OR v_row.type IS DISTINCT FROM v_expected->>'type'
         OR v_row.created_at IS DISTINCT FROM (v_expected->>'created_at')::timestamptz
         OR (v_next->>'id')::uuid IS DISTINCT FROM v_row.id THEN
        RAISE EXCEPTION 'The transaction changed after this proposal was prepared. Review the current data and try again.' USING ERRCODE = '40001';
      END IF;
      v_title := v_next->>'title';
      v_slug := substring(v_title from '\[([a-zA-Z0-9_-]+)(-transfer)?\]$');
      v_amount := (v_next->>'amount')::numeric;
      v_type := v_next->>'type';
      v_created_at := (v_next->>'created_at')::timestamptz;
      IF v_title IS NULL OR length(trim(v_title)) NOT BETWEEN 1 AND 220
         OR v_slug IS NULL OR v_amount <= 0 OR v_amount > 1000000 OR v_amount <> round(v_amount, 2)
         OR v_type NOT IN ('income', 'expense') OR v_created_at IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.wallets WHERE user_id = v_user_id AND slug = v_slug) THEN
        RAISE EXCEPTION 'Invalid transaction update or wallet' USING ERRCODE = '22023';
      END IF;
      IF v_title ~ '\[([a-zA-Z0-9_-]+)-transfer\]$'
         AND ((v_type = 'expense' AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_command->'after') peer
           WHERE peer->>'type' = 'income' AND peer->>'amount' = v_next->>'amount'
             AND peer->>'created_at' = v_next->>'created_at'
             AND regexp_replace(peer->>'title', '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '') = regexp_replace(v_title, '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '')
         )) OR (v_type = 'income' AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(p_command->'after') peer
           WHERE peer->>'type' = 'expense' AND peer->>'amount' = v_next->>'amount'
             AND peer->>'created_at' = v_next->>'created_at'
             AND regexp_replace(peer->>'title', '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '') = regexp_replace(v_title, '\s+\[[a-zA-Z0-9_-]+-transfer\]$', '')
         ))) THEN
        RAISE EXCEPTION 'Transfer updates must preserve both matching wallet movements.' USING ERRCODE = '22023';
      END IF;
      UPDATE public.transactions SET title = v_title, amount = v_amount, type = v_type, created_at = v_created_at
      WHERE id = v_row.id AND user_id = v_user_id
      RETURNING * INTO v_row;
      v_result := jsonb_set(v_result, '{transactions}', (v_result->'transactions') || jsonb_build_array(to_jsonb(v_row) - 'user_id'));
    END LOOP;
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'transactions.delete' THEN
    IF jsonb_typeof(p_command->'before') <> 'array'
       OR jsonb_array_length(p_command->'before') NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid transaction deletion' USING ERRCODE = '22023';
    END IF;
    v_result := jsonb_build_object('transactions', '[]'::jsonb);
    FOR v_expected IN SELECT value FROM jsonb_array_elements(p_command->'before') LOOP
      SELECT * INTO v_row FROM public.transactions
      WHERE id = (v_expected->>'id')::uuid AND user_id = v_user_id FOR UPDATE;
      IF NOT FOUND OR v_row.title IS DISTINCT FROM v_expected->>'title'
         OR v_row.amount IS DISTINCT FROM (v_expected->>'amount')::numeric
         OR v_row.type IS DISTINCT FROM v_expected->>'type'
         OR v_row.created_at IS DISTINCT FROM (v_expected->>'created_at')::timestamptz THEN
        RAISE EXCEPTION 'The transaction changed after this proposal was prepared. Review the current data and try again.' USING ERRCODE = '40001';
      END IF;
      v_result := jsonb_set(v_result, '{transactions}', (v_result->'transactions') || jsonb_build_array(to_jsonb(v_row) - 'user_id'));
    END LOOP;
    DELETE FROM public.transactions WHERE id IN (
      SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_command->'before')
    ) AND user_id = v_user_id;
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'wallets.insert' THEN
    v_record := p_command->'record';
    IF v_record IS NULL OR v_record->>'slug' !~ '^[a-z0-9_-]{1,80}$'
       OR length(trim(v_record->>'name')) NOT BETWEEN 1 AND 100
       OR length(coalesce(v_record->>'description', '')) > 500 THEN
      RAISE EXCEPTION 'Invalid wallet' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.wallets (user_id, slug, name, description, position)
    VALUES (v_user_id, v_record->>'slug', trim(v_record->>'name'), nullif(v_record->>'description', ''), (v_record->>'position')::integer)
    RETURNING * INTO v_wallet;
    v_result := jsonb_build_object('wallet', to_jsonb(v_wallet) - 'user_id');
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'wallets.update' THEN
    v_expected := p_command->'before';
    v_next := p_command->'after';
    SELECT * INTO v_wallet FROM public.wallets
    WHERE id = (v_expected->>'id')::uuid AND user_id = v_user_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.slug IS DISTINCT FROM v_expected->>'slug'
       OR v_wallet.name IS DISTINCT FROM v_expected->>'name'
       OR v_wallet.description IS DISTINCT FROM v_expected->>'description'
       OR v_wallet.position IS DISTINCT FROM (v_expected->>'position')::integer
       OR v_next->>'slug' IS DISTINCT FROM v_wallet.slug
       OR length(trim(v_next->>'name')) NOT BETWEEN 1 AND 100
       OR length(coalesce(v_next->>'description', '')) > 500 THEN
      RAISE EXCEPTION 'The wallet changed after this proposal was prepared. Review the current data and try again.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.wallets SET name = trim(v_next->>'name'), description = nullif(v_next->>'description', '')
    WHERE id = v_wallet.id AND user_id = v_user_id
    RETURNING * INTO v_wallet;
    v_result := jsonb_build_object('wallet', to_jsonb(v_wallet) - 'user_id');
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'wallets.delete' THEN
    v_expected := p_command->'before';
    SELECT * INTO v_wallet FROM public.wallets
    WHERE id = (v_expected->>'id')::uuid AND user_id = v_user_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.slug IS DISTINCT FROM v_expected->>'slug'
       OR v_wallet.name IS DISTINCT FROM v_expected->>'name'
       OR v_wallet.description IS DISTINCT FROM v_expected->>'description'
       OR v_wallet.position IS DISTINCT FROM (v_expected->>'position')::integer THEN
      RAISE EXCEPTION 'The wallet changed after this proposal was prepared. Review the current data and try again.' USING ERRCODE = '40001';
    END IF;
    IF (SELECT count(*) FROM public.wallets WHERE user_id = v_user_id) <= 1 THEN
      RAISE EXCEPTION 'At least one wallet must remain.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_command->'transactions') <> 'array'
       OR jsonb_array_length(p_command->'transactions') > 1000 THEN
      RAISE EXCEPTION 'Invalid wallet transaction list' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count FROM public.transactions
    WHERE user_id = v_user_id AND (right(title, length(v_wallet.slug) + 2) = '[' || v_wallet.slug || ']'
      OR right(title, length(v_wallet.slug) + 11) = '[' || v_wallet.slug || '-transfer]');
    IF v_count > jsonb_array_length(p_command->'transactions') THEN
      RAISE EXCEPTION 'New movements were added to this wallet. Review the current data and try again.' USING ERRCODE = '40001';
    END IF;
    FOR v_expected IN SELECT value FROM jsonb_array_elements(p_command->'transactions') LOOP
      SELECT * INTO v_row FROM public.transactions
      WHERE id = (v_expected->>'id')::uuid AND user_id = v_user_id FOR UPDATE;
      IF NOT FOUND OR v_row.title IS DISTINCT FROM v_expected->>'title'
         OR v_row.amount IS DISTINCT FROM (v_expected->>'amount')::numeric
         OR v_row.type IS DISTINCT FROM v_expected->>'type'
         OR v_row.created_at IS DISTINCT FROM (v_expected->>'created_at')::timestamptz THEN
        RAISE EXCEPTION 'A wallet movement changed after this proposal was prepared. Review the current data and try again.' USING ERRCODE = '40001';
      END IF;
    END LOOP;
    DELETE FROM public.transactions WHERE user_id = v_user_id AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_command->'transactions') x WHERE (x->>'id')::uuid = public.transactions.id
    );
    DELETE FROM public.wallets WHERE id = v_wallet.id AND user_id = v_user_id;
    v_result := jsonb_build_object('wallet', v_expected, 'deletedTransactions', p_command->'transactions');
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;

  ELSIF v_op = 'memory.replace' THEN
    SELECT memory_text INTO v_memory FROM public.user_ai_memory WHERE user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
      v_memory := '';
    END IF;
    IF v_memory IS DISTINCT FROM p_command->>'before' THEN
      RAISE EXCEPTION 'Your AI memory changed after this proposal was prepared. Review it and try again.' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.user_ai_memory (user_id, memory_text, updated_at)
    VALUES (v_user_id, p_command->>'after', NOW())
    ON CONFLICT (user_id) DO UPDATE SET memory_text = EXCLUDED.memory_text, updated_at = NOW();
    v_result := jsonb_build_object('memoryText', p_command->>'after');
    UPDATE public.ai_write_requests SET result = v_result WHERE user_id = v_user_id AND request_id = p_request_id;
    RETURN v_result;
  END IF;

  RAISE EXCEPTION 'Unsupported AI write operation' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.execute_ai_write_once(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_ai_write_once(UUID, JSONB) TO authenticated;
