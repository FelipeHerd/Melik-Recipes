-- Melik Recipes — consolidated schema for the self-hosted Postgres database.
--
-- This replaces Supabase (auth.users + 45 incremental migrations with RLS
-- policies and privilege-escalation triggers). It is authored as the FINAL
-- state, not a replay of migration history — there is no production data to
-- preserve (see migration plan). Mounted into the postgres container at
-- /docker-entrypoint-initdb.d/ so it runs once on first container start.
--
-- Authorization that Supabase enforced via RLS + triggers is now enforced by
-- the Node backend instead (src/lib/auth/authorize.server.ts), because the
-- backend is the only process that ever talks to this database — see that
-- file for the rationale. The two exceptions kept here as DB objects are
-- pure data-integrity rules that are cheap insurance regardless of caller:
-- username format/uniqueness (CHECK + unique index) and the "original_author
-- is frozen once set" trigger.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE app_role AS ENUM ('admin', 'user', 'dev');

-- ---------------------------------------------------------------------------
-- users — replaces Supabase's auth.users
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_confirmed boolean NOT NULL DEFAULT true,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Password-reset tokens are a separate table (not a column on users) so an
-- admin tool can list/invalidate pending resets without touching the user
-- row. No email sending is wired up yet (see auth.functions.ts) — tokens are
-- logged server-side and surfaced in the admin panel until SMTP is added.
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  avatar_url text,
  username text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'dev')),
  is_premium boolean NOT NULL DEFAULT false,
  premium_until timestamptz,
  subscription_status text NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active', 'canceled', 'past_due')),
  billing_cycle text CHECK (billing_cycle IN ('monthly', 'yearly')),
  gateway_customer_id text,
  paid_months_total integer NOT NULL DEFAULT 0,
  kiko_blocked_until timestamptz,
  trial_expiring_notified_for timestamptz,
  voice_seconds_used_today integer NOT NULL DEFAULT 0,
  voice_usage_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Final username format rule (superseding an earlier no-dots version):
  -- 3-20 chars of [a-z0-9_.], no leading/trailing/consecutive dots.
  CONSTRAINT profiles_username_format_chk CHECK (
    username IS NULL
    OR (username ~ '^[a-z0-9_.]{3,20}$' AND username !~ '(^\.|\.$|\.\.)')
  )
);

CREATE UNIQUE INDEX profiles_username_unique_idx ON profiles (username) WHERE username IS NOT NULL;

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------

CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  emoji text,
  time_minutes integer,
  ingredients text,
  instructions text,
  ingredients_json jsonb,
  instructions_json jsonb,
  notes text,
  image_url text,
  is_baker_mode boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,
  is_official_melik boolean NOT NULL DEFAULT false,
  is_premium_only boolean NOT NULL DEFAULT false,
  share_token uuid UNIQUE,
  original_author text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipes_user_created ON recipes (user_id, created_at DESC);
CREATE INDEX recipes_user_draft_idx ON recipes (user_id, is_draft, created_at DESC);
CREATE INDEX idx_recipes_official_created ON recipes (created_at DESC) WHERE is_official_melik = true;
CREATE INDEX recipes_public_feed_idx ON recipes (created_at DESC)
  WHERE is_public = true AND is_draft = false AND is_official_melik = false;
CREATE INDEX recipes_share_token_idx ON recipes (share_token) WHERE share_token IS NOT NULL;

-- Pure data-integrity rule (not authorization): once set, original_author can
-- never be overwritten. Kept as a DB trigger as cheap insurance against any
-- future write path that forgets the check — ported near-verbatim from
-- supabase/migrations/20260709144449_*.sql's protect_original_author().
-- NOTE: the companion stamp_original_author trigger (auto-filling
-- original_author from the owner's username the first time a recipe goes
-- public) is NOT ported as a DB trigger — that's business logic, not
-- integrity, and is replicated in the app's recipe create/update handler
-- instead (src/lib/recipes.functions.ts).
CREATE OR REPLACE FUNCTION protect_original_author()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.original_author IS NOT NULL
     AND NEW.original_author IS DISTINCT FROM OLD.original_author THEN
    NEW.original_author := OLD.original_author;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_original_author_trigger
  BEFORE UPDATE ON recipes
  FOR EACH ROW
  EXECUTE FUNCTION protect_original_author();

-- ---------------------------------------------------------------------------
-- user_roles — source of truth for isAdmin/isDev checks (profiles.role is a
-- denormalized display copy kept in sync by the app layer on role changes,
-- matching the current dual-write pattern in admin-crm.functions.ts).
-- Not present in any tracked Supabase migration; authored from
-- src/integrations/supabase/types.ts.
-- ---------------------------------------------------------------------------

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_role ON user_roles (user_id, role);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'system' CHECK (type IN ('system', 'kiko', 'melik_plus', 'admin')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_read_created_idx ON notifications (user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- discover_chats — not present in any tracked Supabase migration; authored
-- from types.ts. updated_at stays app-managed (matches current pattern:
-- the app sets it explicitly on every message append), no trigger needed.
-- ---------------------------------------------------------------------------

CREATE TABLE discover_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nuevo chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discover_chats_user_updated ON discover_chats (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- error_reports
-- ---------------------------------------------------------------------------

CREATE TABLE error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  error_code text,
  error_message text NOT NULL,
  route text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'resolved', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX error_reports_status_created_idx ON error_reports (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_target_idx ON admin_audit_log (target_user_id);

-- ---------------------------------------------------------------------------
-- ai_usage
-- ---------------------------------------------------------------------------

CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chef', 'discover', 'title')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_created_at_idx ON ai_usage (created_at DESC);
CREATE INDEX ai_usage_user_created_idx ON ai_usage (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- bakery_unlocks
--
-- NOTE: the historical my_bakery_unlocks_summary() SQL function is NOT
-- ported — its 3-month unlock cadence is stale and unused. The app's
-- authoritative cadence logic (6-month cadence) lives in
-- src/lib/melik-plus.functions.ts's computeUnlockStats() and reads this
-- table directly; replicate that JS logic in the new backend, not this SQL.
-- ---------------------------------------------------------------------------

CREATE TABLE bakery_unlocks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, recipe_id)
);

-- ---------------------------------------------------------------------------
-- presence_heartbeats
-- ---------------------------------------------------------------------------

CREATE TABLE presence_heartbeats (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX presence_heartbeats_last_seen_idx ON presence_heartbeats (last_seen DESC);
