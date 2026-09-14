import type { ColumnType, Generated } from "kysely";

export type AppRole = "admin" | "user" | "dev";

// A `ColumnType<S, I, U>` already encodes "optional on insert" via `| undefined`
// in its insert position — do NOT additionally wrap these in `Generated<>`
// (that double-wraps the type and breaks Select-type inference).
type GeneratedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type RequiredTimestamp = ColumnType<Date, Date | string, Date | string>;
type NullableTimestamp = ColumnType<
  Date | null,
  Date | string | null | undefined,
  Date | string | null
>;
type NullableDate = ColumnType<string | null, string | null | undefined, string | null>;

// node-postgres does NOT auto-serialize JS values for jsonb columns — a
// plain array/object bound as a query parameter fails with "invalid input
// syntax for type json" (verified against a live instance). Every write to
// a jsonb column must pass an already-`JSON.stringify`'d string (see
// `toJsonb` in db.server.ts); reads come back already parsed by pg.
type JsonColumn<Select> = ColumnType<Select, string | null, string | null>;
type GeneratedJsonColumn<Select> = ColumnType<Select, string | null | undefined, string | null>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  email_confirmed: Generated<boolean>;
  token_version: Generated<number>;
  created_at: GeneratedTimestamp;
}

export interface PasswordResetTokensTable {
  id: Generated<string>;
  user_id: string;
  token: string;
  expires_at: RequiredTimestamp;
  used_at: NullableTimestamp;
  created_at: GeneratedTimestamp;
}

export interface ProfilesTable {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  username: string | null;
  role: Generated<"user" | "admin" | "dev">;
  is_premium: Generated<boolean>;
  premium_until: NullableTimestamp;
  subscription_status: Generated<"inactive" | "active" | "canceled" | "past_due">;
  billing_cycle: "monthly" | "yearly" | null;
  gateway_customer_id: string | null;
  paid_months_total: Generated<number>;
  kiko_blocked_until: NullableTimestamp;
  trial_expiring_notified_for: NullableTimestamp;
  voice_seconds_used_today: Generated<number>;
  voice_usage_date: NullableDate;
  created_at: GeneratedTimestamp;
}

export interface RecipesTable {
  id: Generated<string>;
  user_id: string;
  title: string;
  category: string | null;
  emoji: string | null;
  time_minutes: number | null;
  ingredients: string | null;
  instructions: string | null;
  ingredients_json: JsonColumn<unknown[] | null>;
  instructions_json: JsonColumn<unknown[] | null>;
  notes: string | null;
  image_url: string | null;
  is_baker_mode: Generated<boolean>;
  is_draft: Generated<boolean>;
  is_public: Generated<boolean>;
  is_official_melik: Generated<boolean>;
  is_premium_only: Generated<boolean>;
  share_token: string | null;
  original_author: string | null;
  created_at: GeneratedTimestamp;
}

export interface UserRolesTable {
  id: Generated<string>;
  user_id: string;
  role: AppRole;
  created_at: GeneratedTimestamp;
}

export interface NotificationsTable {
  id: Generated<string>;
  user_id: string;
  title: string;
  message: string;
  type: Generated<"system" | "kiko" | "melik_plus" | "admin">;
  is_read: Generated<boolean>;
  created_at: GeneratedTimestamp;
}

export interface DiscoverChatsTable {
  id: Generated<string>;
  user_id: string;
  title: Generated<string>;
  messages: GeneratedJsonColumn<unknown[]>;
  created_at: GeneratedTimestamp;
  updated_at: GeneratedTimestamp;
}

export interface ErrorReportsTable {
  id: Generated<string>;
  user_id: string;
  error_code: string | null;
  error_message: string;
  route: string | null;
  status: Generated<"open" | "triaged" | "resolved" | "ignored">;
  created_at: GeneratedTimestamp;
}

export interface AdminAuditLogTable {
  id: Generated<string>;
  admin_id: string | null;
  action: string;
  target_user_id: string | null;
  metadata: GeneratedJsonColumn<Record<string, unknown>>;
  created_at: GeneratedTimestamp;
}

export interface AiUsageTable {
  id: Generated<string>;
  user_id: string;
  kind: "chef" | "discover" | "title";
  created_at: GeneratedTimestamp;
}

export interface BakeryUnlocksTable {
  user_id: string;
  recipe_id: string;
  claimed_at: GeneratedTimestamp;
}

export interface PresenceHeartbeatsTable {
  user_id: string;
  last_seen: GeneratedTimestamp;
}

export interface Database {
  users: UsersTable;
  password_reset_tokens: PasswordResetTokensTable;
  profiles: ProfilesTable;
  recipes: RecipesTable;
  user_roles: UserRolesTable;
  notifications: NotificationsTable;
  discover_chats: DiscoverChatsTable;
  error_reports: ErrorReportsTable;
  admin_audit_log: AdminAuditLogTable;
  ai_usage: AiUsageTable;
  bakery_unlocks: BakeryUnlocksTable;
  presence_heartbeats: PresenceHeartbeatsTable;
}
