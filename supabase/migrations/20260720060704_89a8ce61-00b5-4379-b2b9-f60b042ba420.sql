
CREATE TABLE public.presence_heartbeats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.presence_heartbeats TO authenticated;
GRANT ALL ON public.presence_heartbeats TO service_role;

ALTER TABLE public.presence_heartbeats ENABLE ROW LEVEL SECURITY;

-- Users can only upsert/update their own heartbeat row. No SELECT for non-admins.
CREATE POLICY "own heartbeat insert" ON public.presence_heartbeats
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own heartbeat update" ON public.presence_heartbeats
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only admins/devs can read the presence table (see who is online).
CREATE POLICY "admins read heartbeats" ON public.presence_heartbeats
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'dev'::public.app_role));

CREATE INDEX presence_heartbeats_last_seen_idx ON public.presence_heartbeats (last_seen DESC);
