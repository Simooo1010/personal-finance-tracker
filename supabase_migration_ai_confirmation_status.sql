-- Allow each signed-in user to read only the IDs of their own confirmed actions.
GRANT SELECT (user_id, request_id) ON public.ai_write_requests TO authenticated;
CREATE POLICY "Users can read own AI confirmation status"
  ON public.ai_write_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
