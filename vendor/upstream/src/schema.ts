import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  json,
  jsonb,
  integer,
  bigint,
  serial,
  boolean,
  customType,
  check,
  index,
  unique,
  uniqueIndex,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { agentFeedbackKindValues } from "./agent-feedback";
import type { DsTopResult } from "./design-systems/record-search";
import type { McpIssueAuditEvidence, McpIssueEvidence } from "./mcp-trace";
import type { ShopifyPrimitiveSet } from "./mcp/shopify-primitives";
import type { MobilePrimitiveSet } from "./mcp/mobile-primitives";
import type { FigmaKit } from "./mcp/figma-kit";
import type { PrototypeNode } from "./mcp/figma-prototype";
import type { OklchChannels } from "./mcp/color-to-oklch";
import type { AcquisitionSource, McpClientAttribution, McpClientFamily, ProvisioningOrigin } from "./mcp-attribution";
import type { BillingAlertMessage } from "./alerts";
import type { BillingEmail } from "./billing-email-templates";
import { DENSITY_MODES } from "./inspection/density";

// ─── Custom Types ─────────────────────────────────────────────────────────────

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .map((n) => parseFloat(n));
  },
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const messageRoleEnum = pgEnum("message_role", ["USER", "ASSISTANT"]);
export const messageTypeEnum = pgEnum("message_type", ["RESULT", "ERROR"]);
export const designSystemStatusEnum = pgEnum("design_system_status", [
  "PENDING",
  "SELECTED",
  "GENERATING",
  "COMPLETED",
  "ERROR",
]);

/**
 * The goals a new user can pick during first-run onboarding. `skip` records
 * a deliberate dismissal; `legacy` marks accounts created before onboarding
 * existed and is never chosen in the UI.
 */
export const onboardingPathValues = [
  "build",
  "mcp",
  "design-systems",
  "skip",
  "legacy",
] as const;
/** Zod validator for an onboarding path coming from a request body. */
export const onboardingPathSchema = z.enum(onboardingPathValues);
/** One of the onboarding goals in `onboardingPathValues`. */
export type OnboardingPath = z.infer<typeof onboardingPathSchema>;
const onboardingPathSqlValues = sql.raw(
  onboardingPathValues.map((path) => `'${path}'`).join(", "),
);

/** Stable detector categories stored on MCP issue and improvement rows. */
export const mcpIssueCategoryValues = [
  "doc-gap",
  "retrieval-miss",
  "tool-error",
  "bad-output",
  "other",
] as const;
/** Human-visible lifecycle states for a detected MCP issue. */
export const mcpIssueStatusValues = ["open", "resolved", "ignored"] as const;
/** Durable lifecycle states for one measured improvement attempt. */
export const mcpIssueImprovementStatusValues = [
  "approved",
  "measuring",
  "measurable",
  "finalized",
] as const;
/** Human verdicts accepted after an improvement becomes measurable. */
export const mcpIssueImprovementVerdictValues = [
  "improved",
  "not_improved",
  "inconclusive",
] as const;

/** Validates improvement lifecycle states at runtime boundaries. */
export const mcpIssueImprovementStatusSchema = z.enum(
  mcpIssueImprovementStatusValues,
);
/** Validates final improvement verdicts at runtime boundaries. */
export const mcpIssueImprovementVerdictSchema = z.enum(
  mcpIssueImprovementVerdictValues,
);

const mcpIssueImprovementStatusSqlValues = sql.raw(
  mcpIssueImprovementStatusValues.map((status) => `'${status}'`).join(", "),
);
const mcpIssueImprovementVerdictSqlValues = sql.raw(
  mcpIssueImprovementVerdictValues.map((verdict) => `'${verdict}'`).join(", "),
);

// ─── JSON Column Types ────────────────────────────────────────────────────────

export const designConfigSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    muted: z.string(),
    destructive: z.string(),
    background: z.string(),
    foreground: z.string(),
    card: z.string(),
    cardForeground: z.string(),
    popover: z.string(),
    popoverForeground: z.string(),
    border: z.string(),
    input: z.string(),
    ring: z.string(),
  }).partial(),
  radius: z.string(),
  font: z.object({
    sans: z.string(),
    mono: z.string(),
  }).partial(),
  icons: z.object({
    libraryId: z.string(),
    variant: z.string().nullable(),
  }).partial(),
  /** Overrides the design system's layout density, such as a compact admin view on a spacious brand. [BD-1230] */
  density: z.enum(DENSITY_MODES),
}).partial();

export type DesignConfig = z.infer<typeof designConfigSchema>;

export interface DesignSystemRecommendation {
  id: string;
  title: string;
  description: string;
  personality: string[];
  matchScore: number;
  iconLibraryId?: string | null;
  iconVariant?: string | null;
}

export interface SuggestedIconLibrary {
  id: string;
  name: string;
  prefix: string;
  variants: string[] | null;
  defaultVariant: string | null;
  matchScore: number;
}

export interface MessageMetadata {
  type: "recommendation";
  recommendations: DesignSystemRecommendation[];
  suggestedIconLibrary?: SuggestedIconLibrary | null;
}

export const projectMemoryDataSchema = z.object({
  lockedIn: z.array(z.string()),
  rejected: z.array(z.string()),
  tone: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ProjectMemoryData = z.infer<typeof projectMemoryDataSchema>;

export const EMPTY_PROJECT_MEMORY: ProjectMemoryData = {
  lockedIn: [],
  rejected: [],
  tone: null,
  notes: null,
};

// ─── Tables ───────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  userId: text("user_id").notNull(),
  designSystemId: text("design_system_id"),
  designSystemStatus: designSystemStatusEnum("design_system_status"),
  currentStep: text("current_step"),
  iconLibraryId: text("icon_library_id"),
  iconVariant: text("icon_variant"),
  isAnonymous: boolean("is_anonymous").default(false).notNull(),
  sandboxUrl: text("sandbox_url"),
  // First-class Shopify implementation produced and persisted when the custom
  // design system completes. MCP callers read this exact payload; they never
  // rebuild Liquid/CSS from the fragment at request time. [BD-385]
  shopifyPrimitives: jsonb("shopify_primitives").$type<ShopifyPrimitiveSet>(),
  // The two mobile counterparts of shopifyPrimitives, one per target, written
  // by the same completion step. Read verbatim by the MCP; never rebuilt from
  // the fragment at request time. See ADR 0003. [BD-729]
  reactNativePrimitives: jsonb("react_native_primitives").$type<MobilePrimitiveSet>(),
  swiftUiPrimitives: jsonb("swiftui_primitives").$type<MobilePrimitiveSet>(),
  // User-provided brand token sheet (the ```css block from extract-design-system
  // or extract-from-url). When set, generation is pinned to this brand: catalog
  // retrieval is skipped, the sheet overrides the structural donor's tokens on
  // every run, and design-system switching is refused. [BD-490]
  brandCss: text("brand_css"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  role: messageRoleEnum("role").notNull(),
  type: messageTypeEnum("type").notNull(),
  metadata: json("metadata").$type<MessageMetadata | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
});

export const projectMemory = pgTable("project_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  data: json("data").$type<ProjectMemoryData>().notNull(),
  // Optimistic-concurrency token. Bumped on every successful upsert; callers
  // pass the version they read and the upsert only applies if it still matches.
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fragments = pgTable("fragments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .unique()
    .references(() => messages.id, { onDelete: "cascade" }),
  sandboxUrl: text("sandbox_url").notNull(),
  title: text("title").notNull(),
  files: json("files").notNull(),
  config: json("config").$type<DesignConfig | null>(),
  // PostHog LLM trace id ($ai_trace_id) of the generation run that produced
  // this fragment. Used so thumbs up/down feedback ($ai_feedback) attaches to
  // the exact per-turn trace instead of the project-wide bucket.
  traceId: text("trace_id"),
  // Set once the codegen eval cron has judged this fragment [BD-110]. NULL = not
  // yet judged; the cron samples `WHERE evaluated_at IS NULL` so each fragment is
  // judged at most once. `withTimezone` to match ds_search_queries.evaluated_at
  // so both eval columns compare consistently.
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // Partial index for the codegen eval cron's unjudged-rows sample. [BD-110]
  index("fragments_unjudged_idx").on(t.createdAt).where(sql`${t.evaluatedAt} is null`),
]);

export const usage = pgTable("usage", {
  key: text("key").primaryKey(),
  points: integer("points").notNull(),
  expire: timestamp("expire"),
});

// Anti-scraping temp-block ledger [BD-137]. One row per blocked identity. A
// "block" is reversible: `expiresAt` in the future = temp-blocked, NULL +
// `permanent` = a manual permanent ban (an operator escalating from the alert).
// `isIdentityBlocked` treats an expired row as inactive, so the hourly cron sweep
// is pure housekeeping, not correctness. Identity is the same key the volume
// counter uses: `mcp:<userId>` for OAuth, the api key id for key auth, or an IP.
export const scrapeBlock = pgTable(
  "scrape_block",
  {
    identity: text("identity").primaryKey(),
    identityType: text("identity_type", { enum: ["user", "api_key", "ip"] }).notNull(),
    reason: text("reason"),
    ip: text("ip"),
    permanent: boolean("permanent").notNull().default(false),
    blockedAt: timestamp("blocked_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    // The cron sweep deletes expired temp blocks: WHERE permanent = false AND expires_at < now().
    index("scrape_block_expires_idx").on(t.expiresAt).where(sql`${t.permanent} = false`),
  ],
);

// Coverage ledger for scrape detection [BD-137]. One row per (identity, distinct
// resource) it has fetched. Request COUNT is a proxy; coverage — how much of the
// finite catalog one identity has pulled — is the real "are they enumerating
// everything?" signal. The guard counts distinct `resource_key` per `category`
// in a trailing window; crossing the per-category threshold = a scrape. The
// composite PK makes each (identity, resource) distinct; `accessed_at` is bumped
// on re-fetch and powers both the window filter and the cron's stale-row sweep.
export const resourceAccess = pgTable(
  "resource_access",
  {
    identity: text("identity").notNull(),
    resourceKey: text("resource_key").notNull(), // e.g. "ds:halo", "principle:depth"
    category: text("category", { enum: ["ds", "principle"] }).notNull(),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.identity, t.resourceKey] }),
    // The coverage count: distinct resource_key WHERE identity = ? AND category = ? AND accessed_at > cutoff.
    index("resource_access_coverage_idx").on(t.identity, t.category, t.accessedAt),
  ],
);

// Better-Auth Tables
/**
 * The better-auth user table, extended with the first-run onboarding columns
 * (`onboarding_path`, `onboarding_completed_at`, `first_project_created_at`).
 */
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    plan: text("plan").notNull().default("free"),
    isAdmin: boolean("is_admin").notNull().default(false),
    bonusClaimed: boolean("bonus_claimed").notNull().default(false),
    /**
     * BD-170: rows minted by `POST /api/keys/provision` so an agent can use
     * `npx better-design` with zero signup. Agents get a small lifetime credit
     * budget (not the normal free/pro budget) and are excluded from signup
     * analytics and campaign mail. Flipped to false when the human claims the
     * key by signing up, which re-points this key's data onto the real row.
     *
     * Distinct from `projects.is_anonymous`, which marks a project made by a
     * signed-out web visitor. Same word, unrelated concept. [BD-759]
     */
    isAgent: boolean("is_agent").notNull().default(false),
    /**
     * Single-use token embedded in the claim URL (`/claim?token=...`). Lets the
     * claim flow find which agent row to migrate onto the newly created real
     * account. Null once claimed (or for non-agent rows). Unique so a token
     * maps to exactly one row.
     */
    claimToken: text("claim_token").unique(),
    /** Set when the user opts out of marketing/campaign mail. Null = subscribed. */
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    /** IANA timezone (e.g. "America/Los_Angeles") captured from the browser, for
     * timezone-aware campaign sends. Null = unknown, falls back to UTC. */
    timezone: text("timezone"),
    /** Stripe Customer reused for later subscription checkouts. */
    stripeCustomerId: text("stripe_customer_id").unique(),
    /**
     * The Pro trial a free person starts with one click, with no card
     * [BD-1211] [BD-1261]. `proTrialStartedAt` is set once and never
     * cleared, so the account gets this trial once and no Stripe trial after
     * it. While `proTrialEndsAt` is in the future the plan reads "pro" even
     * with no subscription; the sweep drops it to "free" when the date passes.
     */
    proTrialStartedAt: timestamp("pro_trial_started_at", { withTimezone: true }),
    proTrialEndsAt: timestamp("pro_trial_ends_at", { withTimezone: true }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
    }),
    onboardingPath: text("onboarding_path", { enum: onboardingPathValues }),
    firstProjectCreatedAt: timestamp("first_project_created_at", {
      withTimezone: true,
    }),
    /**
     * The Terms of Service version this person accepted at signup, and when.
     * Set by the better-auth create hook from `CURRENT_TERMS_VERSION`. Null
     * for agent rows and for accounts created before terms were recorded.
     * [BD-822]
     */
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "user_onboarding_completion_consistent",
      sql`(${t.onboardingCompletedAt} is null and ${t.onboardingPath} is null) or (${t.onboardingCompletedAt} is not null and ${t.onboardingPath} is not null)`,
    ),
    check(
      "user_onboarding_path_valid",
      sql`${t.onboardingPath} is null or ${t.onboardingPath} in (${onboardingPathSqlValues})`,
    ),
  ],
);

/**
 * Durable outbox for one Slack signup notice per real Better Design user.
 *
 * The user id is the primary key so auth hooks, reconciliation sweeps, and
 * operator-triggered backfills can all enqueue the same signup safely. A lease
 * prevents overlapping Worker invocations from posting the same row, while the
 * stable client message id lets Slack deduplicate an ambiguous network retry.
 */
export const signupAlertDeliveries = pgTable(
  "signup_alert_deliveries",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    clientMessageId: uuid("client_message_id").defaultRandom().notNull().unique(),
    status: text("status")
      .$type<"pending" | "processing" | "delivered" | "failed">()
      .default("pending")
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    slackMessageTs: text("slack_message_ts"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("signup_alert_deliveries_due_idx").on(t.status, t.nextAttemptAt, t.leaseUntil),
    check(
      "signup_alert_deliveries_status_valid",
      sql`${t.status} in ('pending', 'processing', 'delivered', 'failed')`,
    ),
    check(
      "signup_alert_deliveries_processing_lease_valid",
      sql`${t.status} <> 'processing' or (${t.leaseUntil} is not null and ${t.leaseToken} is not null)`,
    ),
  ],
);

/**
 * Durable outbox for the paid-users Slack channel: one row per billing change.
 *
 * The id is a key derived from the Stripe object, such as `paid:<invoice id>`,
 * so a retried delivery or a second Event object for the same change finds the
 * row already there. The message is stored as it will be posted, which lets the
 * drain send it without calling Stripe again. The row belongs to the account,
 * so deleting the account deletes the name and email the message holds. [BD-939]
 */
export const billingAlertDeliveries = pgTable(
  "billing_alert_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    clientMessageId: uuid("client_message_id").defaultRandom().notNull().unique(),
    message: jsonb("message").$type<BillingAlertMessage>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "delivered" | "failed">()
      .default("pending")
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    slackMessageTs: text("slack_message_ts"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("billing_alert_deliveries_due_idx").on(t.status, t.nextAttemptAt, t.leaseUntil),
    check(
      "billing_alert_deliveries_status_valid",
      sql`${t.status} in ('pending', 'processing', 'delivered', 'failed')`,
    ),
    check(
      "billing_alert_deliveries_processing_lease_valid",
      sql`${t.status} <> 'processing' or (${t.leaseUntil} is not null and ${t.leaseToken} is not null)`,
    ),
  ],
);

/**
 * Send log for the billing emails customers receive: one row per billing change.
 *
 * The id is the paid-users outbox key for the same change, such as
 * `payment_failed:<invoice id>`, so a Stripe retry or a redelivered event never
 * sends the email twice. The row keeps the facts, not the rendered email, so a
 * copy fix reaches rows still waiting to send. The row belongs to the account,
 * so deleting the account deletes the address it holds. [BD-965]
 */
export const billingEmailDeliveries = pgTable(
  "billing_email_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    /** The Stripe subscription the email is about, so the daily cap can count per subscription. */
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    email: jsonb("email").$type<BillingEmail>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "delivered" | "failed">()
      .default("pending")
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    resendEmailId: text("resend_email_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("billing_email_deliveries_due_idx").on(t.status, t.nextAttemptAt, t.leaseUntil),
    index("billing_email_deliveries_subscription_idx").on(t.stripeSubscriptionId, t.createdAt),
    check(
      "billing_email_deliveries_status_valid",
      sql`${t.status} in ('pending', 'processing', 'delivered', 'failed')`,
    ),
    check(
      "billing_email_deliveries_processing_lease_valid",
      sql`${t.status} <> 'processing' or (${t.leaseUntil} is not null and ${t.leaseToken} is not null)`,
    ),
  ],
);

/** Largest team rules document, in UTF-8 bytes. The API and the table both hold it. [BD-922] */
export const TEAM_RULES_MAX_BYTES = 32 * 1024;

/**
 * One Markdown document of team rules per account. The MCP serves it to the
 * account's agents, and get-review-rules checks work against it. [BD-922]
 */
export const teamRules = pgTable(
  "team_rules",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    markdown: text("markdown").default("").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "team_rules_markdown_size",
      sql`octet_length(${t.markdown}) <= ${sql.raw(String(TEAM_RULES_MAX_BYTES))}`,
    ),
  ],
);

/** Largest proposed rule, in UTF-8 bytes: one list item with its why and where. [BD-1050] */
export const TEAM_RULE_PROPOSAL_MAX_BYTES = 4 * 1024;

/** Most proposed rules one account keeps waiting, so an agent cannot flood the page. [BD-1050] */
export const TEAM_RULE_PROPOSALS_MAX = 20;

/**
 * One rule an agent proposed from a person's correction [BD-1050]. No agent is
 * served it while it waits here. Approving it on the Team rules page adds it to
 * `team_rules` and deletes the row; rejecting it deletes the row.
 */
export const teamRuleProposals = pgTable(
  "team_rule_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // One Markdown list item in the outline's shape: the rule, Why, Where.
    markdown: text("markdown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("team_rule_proposal_user_created_idx").on(t.userId, t.createdAt),
    // The same rule waits once per account. The index holds a hash, because a
    // 4 KB rule can be longer than a btree entry allows.
    uniqueIndex("team_rule_proposal_user_markdown_uniq").on(t.userId, sql`md5(${t.markdown})`),
    check(
      "team_rule_proposal_markdown_size",
      sql`octet_length(${t.markdown}) <= ${sql.raw(String(TEAM_RULE_PROPOSAL_MAX_BYTES))}`,
    ),
  ],
);

/**
 * What one project rule is [BD-1052]. `guidelines` is the project's one general
 * document. `use`, `never` and `pairing` say how one part or value is used, what
 * it must never do and what it goes with; a `never` with no part is a brand-wide
 * ban. A `spec` is a note on one screen, or on one part of that screen.
 */
export const projectRuleKindValues = ["guidelines", "use", "never", "pairing", "spec"] as const;

/** Largest rule or spec, in UTF-8 bytes. Guidelines take the team rules cap. [BD-1052] */
export const PROJECT_RULE_MAX_BYTES = 4 * 1024;

/** Longest screen or part name a project rule takes. [BD-1052] */
export const PROJECT_RULE_NAME_MAX_CHARS = 120;

/**
 * Most rules and specs one project keeps. The store checks it before a write
 * that adds a slot, so two saves at once can pass it by one: a soft cap that
 * bounds what a read can return. [BD-1052]
 */
export const PROJECT_RULES_MAX_PER_PROJECT = 500;

/**
 * The rules and specs one client project keeps beside its design system
 * [BD-1052]. One row per slot: a project holds one text for each kind, screen
 * and part, and an empty screen or part means the slot is not tied to one.
 * `get-team-rules` reads the rows a screen needs; `set-team-rules` writes one.
 */
export const projectRules = pgTable(
  "project_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: projectRuleKindValues }).notNull(),
    /** Screen name, such as "sign-up". Empty when the slot covers every screen. */
    screen: text("screen").default("").notNull(),
    /** Part or value name, such as "Button" or "--primary". Empty when the slot covers no single part. */
    part: text("part").default("").notNull(),
    markdown: text("markdown").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("project_rules_slot").on(t.projectId, t.kind, t.screen, t.part),
    check(
      "project_rules_kind_valid",
      sql`${t.kind} in (${sql.raw(projectRuleKindValues.map((kind) => `'${kind}'`).join(", "))})`,
    ),
    // Names are stored the way the shared normalizer writes them, so a row
    // another writer adds is still found by the lower-case lookup.
    check(
      "project_rules_names_normalized",
      sql`${t.screen} = lower(btrim(${t.screen})) and ${t.part} = lower(btrim(${t.part}))
        and char_length(${t.screen}) <= ${sql.raw(String(PROJECT_RULE_NAME_MAX_CHARS))}
        and char_length(${t.part}) <= ${sql.raw(String(PROJECT_RULE_NAME_MAX_CHARS))}`,
    ),
    // Each kind fills only the slot it means, so a reader never meets a part
    // rule tied to a screen or a spec tied to no screen.
    check(
      "project_rules_slot_valid",
      sql`case ${t.kind}
        when 'guidelines' then ${t.screen} = '' and ${t.part} = ''
        when 'spec' then ${t.screen} <> ''
        when 'never' then ${t.screen} = ''
        else ${t.screen} = '' and ${t.part} <> ''
      end`,
    ),
    check(
      "project_rules_markdown_size",
      sql`octet_length(${t.markdown}) <= case ${t.kind}
        when 'guidelines' then ${sql.raw(String(TEAM_RULES_MAX_BYTES))}
        else ${sql.raw(String(PROJECT_RULE_MAX_BYTES))}
      end`,
    ),
  ],
);

/**
 * The Figma kit a client project was built from [BD-1056]: the variables,
 * styles and components the plugin read from the client's file. One row per
 * project, replaced on each send. It sits in its own table because a kit runs
 * to hundreds of kilobytes, and a project row is read on every request.
 */
export const projectFigmaKits = pgTable("project_figma_kits", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** The Figma file name the kit came from. */
  file: text("file").notNull(),
  kit: jsonb("kit").$type<FigmaKit>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * The Figma screens a client project keeps [BD-1056]: each frame the plugin
 * sent in model mode, as the serialized layer tree, under its frame name. A
 * second send of the same name replaces the first. Specs already key on the
 * screen name, so a screen and its specs meet on that name.
 */
export const projectFigmaScreens = pgTable(
  "project_figma_screens",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The Figma file name the frame came from. */
    file: text("file").notNull(),
    tree: jsonb("tree").$type<PrototypeNode>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.name] })],
);

/** Triage states a person moves an agent report through. [BD-956] */
export const agentFeedbackStatusValues = [
  "open",
  "accepted",
  "rejected",
  "shipped",
] as const;

/**
 * One report an agent sent through `POST /api/v1/feedback` [BD-956]. The agent
 * says what it tried, what it expected and what happened. A person triages the
 * row, hands its fix prompt to a coding agent, and records the pull request.
 * Free text is redacted for secrets before it is written.
 */
export const agentFeedback = pgTable(
  "agent_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiKeyId: text("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    kind: text("kind", { enum: agentFeedbackKindValues }).notNull(),
    // The endpoint path or MCP tool name the agent was calling.
    surface: text("surface").notNull(),
    summary: text("summary").notNull(),
    attempted: text("attempted"),
    expected: text("expected"),
    actual: text("actual"),
    // The agent's own name for itself, such as "claude-code/2.1".
    client: text("client"),
    // SHA-256 of kind, surface and the normalized summary, so identical
    // reports group in the admin queue without a model call.
    fingerprint: text("fingerprint").notNull(),
    status: text("status", { enum: agentFeedbackStatusValues }).notNull().default("open"),
    pullRequestUrl: text("pull_request_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agent_feedback_status_created_idx").on(t.status, t.createdAt),
    index("agent_feedback_fingerprint_idx").on(t.fingerprint),
    // Deleting a user or an API key looks up its reports through these.
    index("agent_feedback_user_id_idx").on(t.userId),
    index("agent_feedback_api_key_id_idx").on(t.apiKeyId),
  ],
);

/**
 * Stripe subscriptions linked to Better Design users. Keep every subscription
 * so an older cancellation cannot remove access granted by another active one.
 */
export const billingSubscription = pgTable(
  "billing_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    customerId: text("customer_id").notNull(),
    priceId: text("price_id").notNull(),
    status: text("status").notNull(),
    stripeEventCreatedAt: integer("stripe_event_created_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("billing_subscription_user_idx").on(t.userId),
    index("billing_subscription_customer_idx").on(t.customerId),
  ],
);

/**
 * A short-lived handoff from a signed-in Better Design account to GitHub's
 * installation flow. The random claim travels through GitHub as OAuth state;
 * the callback spends it only after GitHub proves the installer can access the
 * returned installation.
 */
export const githubInstallationClaim = pgTable(
  "github_installation_claim",
  {
    claim: text("claim").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("github_installation_claim_user_idx").on(t.userId)],
);

/** A GitHub App installation whose reviews are billed to one account. */
export const githubInstallation = pgTable(
  "github_installation",
  {
    installationId: bigint("installation_id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: bigint("account_id", { mode: "number" }).notNull(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("github_installation_user_idx").on(t.userId)],
);

/**
 * Private or staged product capabilities granted to a verified account.
 *
 * Email is stored normalized so an operator can invite someone before their
 * first sign-in. The first authenticated use links the entitlement to the
 * Better Auth user id, keeping later lookups stable if the account email moves.
 */
export const featureAccess = pgTable(
  "feature_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    note: text("note"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "feature_access_email_normalized",
      sql`${t.email} = lower(btrim(${t.email}))`,
    ),
    uniqueIndex("feature_access_feature_email_unique").on(t.feature, t.email),
    index("feature_access_feature_user_idx").on(t.feature, t.userId),
  ],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** True when the person signed in through their company's login. [BD-1218] */
  companyLogin: boolean("company_login").notNull().default(false),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Better-Auth OAuth 2.1 Provider + JWT plugin tables (BD-21).
// Property names must match better-auth's model fields verbatim — the drizzle
// adapter maps each field to the table property of the same name; column names
// (snake_case) are local convention. Shapes match `@better-auth/cli generate`
// for the oauthProvider + jwt plugins (array fields are native pg text[]).

// JWT plugin: stores the RS256/EdDSA signing keypair served at /api/auth/jwks.
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").notNull(),
  expiresAt: timestamp("expires_at"),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    public: boolean("public"),
    type: text("type"),
    requirePKCE: boolean("require_pkce"),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("oauth_client_user_id_idx").on(t.userId)],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    revoked: timestamp("revoked"),
    authTime: timestamp("auth_time"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_refresh_token_client_id_idx").on(t.clientId),
    index("oauth_refresh_token_session_id_idx").on(t.sessionId),
    index("oauth_refresh_token_user_id_idx").on(t.userId),
  ],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_access_token_client_id_idx").on(t.clientId),
    index("oauth_access_token_session_id_idx").on(t.sessionId),
    index("oauth_access_token_user_id_idx").on(t.userId),
    index("oauth_access_token_refresh_id_idx").on(t.refreshId),
  ],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("oauth_consent_client_id_idx").on(t.clientId),
    index("oauth_consent_user_id_idx").on(t.userId),
  ],
);

/**
 * A company's own login, which `@better-auth/sso` reads [BD-1218]. A
 * workspace owner registers one, so `userId` is that owner. `domain` is the
 * company's email domain; nobody signs in through the row until a DNS record
 * proves the owner controls it and `domainVerified` turns true. Property names
 * match the plugin's model fields.
 */
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull().unique(),
    organizationId: text("organization_id"),
    domain: text("domain").notNull(),
    domainVerified: boolean("domain_verified").default(false),
  },
  (t) => [index("sso_provider_user_id_idx").on(t.userId), index("sso_provider_domain_idx").on(t.domain)],
);

// Design System Tables
export const designSystems = pgTable("design_systems", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  personality: text("personality").array().notNull(),
  industry: text("industry").array().notNull(),
  theme: text("theme", { enum: ["light", "dark"] }),
  componentCount: integer("component_count").default(0),
  primaryColor: text("primary_color"),
  borderRadius: text("border_radius"),
  font: text("font"),
  // Background, text, primary and accent colours as oklch channels, read from
  // globals.css at seed time. A search that names a colour lifts the systems
  // that carry it. Null until seeded. [BD-1026]
  lookColours: jsonb("look_colours").$type<OklchChannels[]>(),
  rawContent: text("raw_content").notNull(),
  embedding: vector("embedding"),
  iconLibraryId: text("icon_library_id"),
  iconVariant: text("icon_variant"),
  // Exact Tailwind v4 CSS for this DS's whole component set, compiled in Node at
  // seed time (createDsCompiler) and stored so inline hosts (ChatGPT canvas /
  // Claude artifact) get the REAL stylesheet — not the hand-translated
  // approximation. The Worker serves this; it never compiles. [BD-163]
  css: text("css"),
  // Whole-DS framework-free HTML doc (all components + the compiled CSS inline,
  // no JS) rendered by render-ds-lib at seed time (seed-ds-html). Stored so inline
  // hosts (ChatGPT canvas / Claude.ai artifacts) get the fixed components served,
  // not re-rendered. Null until seeded. [BD-171]
  html: text("html"),
  // Maintained Shopify representation for this catalog system: tokens and the
  // exact Liquid/JSON/CSS theme files returned by the MCP. Seeded with the DS
  // and required for target=shopify; no visual fallback is allowed. [BD-385]
  shopifyPrimitives: jsonb("shopify_primitives").$type<ShopifyPrimitiveSet>(),
  // Maintained mobile representations, one per target, seeded with the DS and
  // read verbatim by the MCP. A system's identity is lifted from its component
  // source, so tokens alone never stand in for a kit. See ADR 0003. [BD-729]
  reactNativePrimitives: jsonb("react_native_primitives").$type<MobilePrimitiveSet>(),
  swiftUiPrimitives: jsonb("swiftui_primitives").$type<MobilePrimitiveSet>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const designSystemComponents = pgTable("components", {
  id: serial("id").primaryKey(),
  designSystemId: text("design_system_id")
    .notNull()
    .references(() => designSystems.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  useCases: text("use_cases").array(),
  language: text("language"),
  destination: text("destination"),
  code: text("code").notNull(),
  // Framework-free HTML + CSS version of this component, hand-translated from its
  // Tailwind classes (verified against the real Tailwind compiler) so inline
  // hosts (ChatGPT canvas / Claude artifact) can use the component without a
  // build step. Populated by the DS translation seed; null until generated. [BD-163]
  html: text("html"),
  css: text("css"),
});

export const foundationalDocs = pgTable("foundational_docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding"),
  area: text("area").$type<"ui" | "ux" | "react-native" | "three-js" | "motion" | "swiftui" | "shopify" | "sales" | "components" | "illustration" | null>(),
  topic: text("topic"),
  aliases: text("aliases").array(),
  sourceFile: text("source_file"),
  chunkType: text("chunk_type").$type<"parent" | "section" | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    /**
     * The Terms of Service version a provisioned agent key accepted by being
     * used. Set by `POST /api-keys/provision`; the claim flow re-points the
     * key row, so the version travels with it. Null for dashboard keys, whose
     * owner accepted the terms at signup. [BD-822]
     */
    termsVersion: text("terms_version"),
    provisioningOrigin: text("provisioning_origin").$type<ProvisioningOrigin>().default("unknown").notNull(),
    acquisitionSource: text("acquisition_source").$type<AcquisitionSource>().default("unknown").notNull(),
    installChannel: text("install_channel").$type<"npm" | "unknown">().default("unknown").notNull(),
    firstClient: text("first_client").$type<McpClientFamily>(),
    firstClientAt: timestamp("first_client_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /**
     * Set on a workspace key, which a build server uses. Its `userId` is the
     * workspace owner, so it reads the workspace's rules and spends the
     * owner's credits; only the owner makes or revokes one, and members see
     * it. Deleting the workspace revokes it, and the row stays. [BD-1055]
     */
    workspaceId: uuid("workspace_id").references((): AnyPgColumn => workspaces.id, { onDelete: "set null" }),
  },
  (t) => [
    index("api_keys_user_revoked_created_idx").on(t.userId, t.revokedAt, t.createdAt),
    index("api_keys_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * A company's shared account [BD-1055]. Its team rules are the owner's
 * `team_rules` row, which every member reads and edits, and its keys are
 * `api_keys` rows that carry its id.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /**
   * The owner's team call log switch. While on, we keep no tool input, answer,
   * intent or query for any member's calls: not in the ledgers, the archive,
   * analytics or the operator alert. [BD-1229]
   */
  callLogOff: boolean("call_log_off").notNull().default(false),
  /**
   * When true, people at the company login's proven domain can sign in only
   * through that login. The owner turns it on from a company login session.
   * [BD-1218]
   */
  requireCompanyLogin: boolean("require_company_login").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One person in a workspace. A person belongs to one workspace at most. [BD-1055] */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/**
 * An invitation to join a workspace [BD-1055]. The link carries a token that
 * only its hash records, and only the person signed in with `email` can
 * accept it before `expiresAt`.
 */
export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [index("workspace_invitations_workspace_idx").on(t.workspaceId)],
);

/** Every action a workspace's audit log records. [BD-1218] */
export const AUDIT_ACTIONS = [
  "signed_in",
  "workspace_created",
  "member_joined",
  "member_removed",
  "member_left",
  "invitation_sent",
  "invitation_cancelled",
  "invitation_accepted",
  "api_key_created",
  "api_key_revoked",
  "rules_changed",
  "company_login_added",
  "company_login_verified",
  "company_login_removed",
  "company_login_required",
  "company_login_optional",
] as const;

/** One action a workspace's audit log records. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * One action someone took in a workspace, which the owner reads and exports
 * [BD-1218]. The actor's email is copied in, and `actorId` has no foreign
 * key, so a row still names who acted after that account is deleted. The
 * hourly cron deletes rows older than one year.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: text("actor_id"),
    actorEmail: text("actor_email"),
    action: text("action").$type<AuditAction>().notNull(),
    /** What the action touched, such as the invited email or the key name. */
    target: text("target"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_events_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_events_created_idx").on(t.createdAt),
  ],
);

/**
 * One code the claim page made for the signed-in person who opened an agent
 * key's claim link. The key links to that person only when its own tool sends
 * the code back through `POST /api/v1/claim/confirm` before `expiresAt`, so a
 * stranger who mints a key and sends its link cannot hand it to someone else.
 * The agent id has no foreign key: a confirmed claim deletes the agent row,
 * and the page still reads the code's result. [BD-983]
 */
export const claimCodes = pgTable(
  "claim_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The agent account whose key the claim moves. */
    agentUserId: text("agent_user_id").notNull(),
    /** The signed-in person the key moves to. */
    claimantUserId: text("claimant_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** SHA-256 of the code in its normal form; the code itself is never stored. */
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** When the key's own tool sent the code back. Null while it waits. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // A code is unique per key, not across keys: the confirm always names the
  // key, so two keys that draw the same code never meet.
  (t) => [uniqueIndex("claim_codes_agent_code_uniq").on(t.agentUserId, t.codeHash)],
);

/**
 * One row per email a marketing campaign attempts to deliver. Written by the
 * campaign sender (packages/shared/scripts/send-activation-campaign.ts) on a
 * real --send run, and read by the admin campaigns dashboard. The runners write
 * the row as "pending" before the send and settle it to "sent" when Resend
 * accepts the message or "failed" when it rejects or errors. A row left
 * "pending" never settled, and the email may have gone out, so suppression
 * counts it as sent. [BD-984]
 */
export const emailCampaignSends = pgTable(
  "email_campaign_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Campaign identifier, e.g. "activation". */
    campaign: text("campaign").notNull(),
    /** Audience variant within the campaign, e.g. "activation" | "builder". */
    variant: text("variant").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    /** "pending" until the send returns, then "sent" if Resend accepted it, "failed" otherwise. [BD-984] */
    status: text("status").notNull(),
    /** Failure detail when status is "failed". */
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("email_campaign_sends_campaign_sent_at_idx").on(t.campaign, t.sentAt),
    index("email_campaign_sends_user_id_idx").on(t.userId),
    // Durable once-ever dedup: at most one "sent" row per (campaign, variant,
    // user). Pending and failed rows are not indexed, so a failed send can be
    // retried. The runner's in-memory dedup is the fast path; this is the
    // backstop for overlapping sweeps: settling a second row to "sent" hits
    // the index, and the runner leaves that row pending. [BD-984]
    uniqueIndex("email_campaign_sends_sent_uniq")
      .on(t.campaign, t.variant, t.userId)
      .where(sql`${t.status} = 'sent'`),
  ],
);

/**
 * Per-step on/off switch for the campaigns flow. One row per (campaign, variant)
 * step shown in the admin flow editor. The campaign sender skips a recipient
 * whose step is disabled, so an admin toggling a node here controls what
 * actually triggers. Absence of a row means enabled (default-on).
 *
 * `delayDays` makes the step a drip: the cron only sends to a user once their
 * account is at least this many days old. Absence of a row falls back to the
 * default in CAMPAIGN_STEPS.
 */
export const emailCampaignSteps = pgTable(
  "email_campaign_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign: text("campaign").notNull(),
    variant: text("variant").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Days after signup before this step is eligible to send (drip delay). */
    delayDays: integer("delay_days").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("email_campaign_steps_campaign_variant_uniq").on(t.campaign, t.variant)],
);

export const projectEvents = pgTable(
  "project_events",
  {
    id: serial("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    data: json("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("project_events_project_id_id_idx").on(t.projectId, t.id)],
);

/** The route an admin used to read another user's project [BD-526]. */
export const adminProjectReadRouteValues = ["project", "messages", "events"] as const;

/**
 * Admin reads of projects that another signed-in user owns [BD-526]. Admins
 * can read any project, its messages and its event stream; this table records
 * which admin looked at whose work, and when. A page polls while a project
 * generates, so the table keeps one row per admin, project and route per clock
 * hour: `createdAt` is the first read in that hour. The ids carry no foreign
 * keys, so the record outlives a deleted project or account.
 */
export const adminProjectReads = pgTable(
  "admin_project_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: text("admin_user_id").notNull(),
    /** The project's owner at the time of the read. */
    targetUserId: text("target_user_id").notNull(),
    projectId: uuid("project_id").notNull(),
    route: text("route", { enum: adminProjectReadRouteValues }).notNull(),
    /** The UTC hour the read fell in. */
    readHour: timestamp("read_hour", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("admin_project_reads_created_at_idx").on(t.createdAt),
    uniqueIndex("admin_project_reads_hour_uniq").on(t.adminUserId, t.projectId, t.route, t.readHour),
  ],
);

export const iconLibraries = pgTable("icon_libraries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  iconCount: integer("icon_count"),
  license: text("license"),
  category: text("category"),
  tags: text("tags").array().notNull(),
  description: text("description"),
  variants: text("variants").array(),
  defaultVariant: text("default_variant"),
  variantFormat: text("variant_format"),
  embedding: vector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Demand-analytics log for retrieval-tool MCP calls [BD-107, generalized BD-119].
// Originally resolve-design-system only; now records EVERY query-bearing tool
// (principles, review rules, icon search, create-design-system prompt) via the
// `tool` column. Records what users search for and which docs/systems matched, so
// low-score queries surface coverage gaps (the build-next backlog) and the rows
// double as a retrieval-eval corpus. Written fire-and-forget from the two
// authenticated server entrypoints (remote `/api/mcp` `onToolUsage` and the
// stdio `/v1` search route); never from internal Inngest codegen searches. The
// query embedding is intentionally NOT stored: re-derive it offline from
// `query` (same model) when clustering or scoring, keeping this row cheap.
// PII note: `query` is free text stored raw (un-hashed) and joined to a verified
// `user_id`. Acceptable because clustering demand needs the literal text and both
// write paths are authenticated, but it reverses the analytics "omit params"
// default, so add a retention/TTL sweep before this table grows large [BD-107].
export const dsSearchQueries = pgTable(
  "ds_search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Which MCP tool produced this search. Generalizes the table beyond DS
    // search so every retrieval tool's query lands in one corpus [BD-119].
    // Existing rows predate the column, so they default to the original producer.
    tool: text("tool").notNull().default("resolve-design-system"),
    query: text("query").notNull(),
    // Set when the lookup was keyed by a topic/category alias instead of free-text
    // semantic search (e.g. get-ui-principle({ topic: "depth" })), so demand
    // analytics can split keyed vs semantic retrieval. NULL for semantic queries.
    topic: text("topic"),
    topResults: jsonb("top_results").$type<DsTopResult[]>().notNull(),
    topScore: integer("top_score"),
    resultCount: integer("result_count").notNull(),
    userId: text("user_id"),
    authKind: text("auth_kind").notNull(),
    source: text("source").notNull(),
    clientName: text("client_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Set once the retrieval eval cron has judged this row [BD-110]. NULL = not
    // yet judged; the cron samples `WHERE evaluated_at IS NULL` so each row is
    // judged at most once (idempotent, bounded cost).
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  },
  (t) => [
    index("ds_search_queries_created_at_idx").on(t.createdAt),
    index("ds_search_queries_top_score_idx").on(t.topScore),
    // Demand analytics groups by tool ("which tools do users query most"). [BD-119]
    index("ds_search_queries_tool_idx").on(t.tool),
    // Partial index serving the eval cron's sample of catalog-search rows
    // (judgeRetrievalRow grades a query→DS match). The cron now judges BOTH the
    // current tool name (find-design) and its deprecated alias
    // (resolve-design-system) [BD-152]; this index still covers only the legacy
    // alias to avoid a predicate-change migration. find-design rows are still
    // graded — the cron query just falls back to the created_at index for them.
    // TODO[BD-152]: widen this predicate to `tool in ('find-design',
    // 'resolve-design-system')` in the next migration so new rows stay indexed.
    index("ds_search_queries_unjudged_idx")
      .on(t.createdAt)
      .where(sql`${t.evaluatedAt} is null and ${t.tool} = 'resolve-design-system'`),
  ],
);

/**
 * Full trace ledger for MCP tool calls [BD-485]. ds_search_queries records only
 * the 10 query-bearing retrieval tools on the remote transport; this table
 * records EVERY tool call on BOTH transports (remote /api/mcp and the stdio npm
 * client via /api/internal/alert), including duration, status, and the error
 * message when the call failed. It is the corpus the issue-detection cron reads
 * to surface failures nobody predefined: doc coverage gaps, retrieval misses,
 * recurring tool errors. Written fire-and-forget from the two authenticated
 * server entrypoints, never from internal Inngest searches.
 * PII note: same posture as ds_search_queries — free text (query, input, output
 * preview) joined to a verified user_id, so the 180-day purge cron covers this
 * table too.
 */
export const mcpToolCalls = pgTable(
  "mcp_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Trace id shared with the PostHog $ai_span for the same call, so a DB row
    // can be cross-referenced with its LLM-Analytics trace [BD-109].
    traceId: text("trace_id"),
    tool: text("tool").notNull(),
    status: text("status").$type<"ok" | "error">().notNull(),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    // Sanitized serialized tool input (same string shape as the $ai_span
    // input_state), capped — enough for an analyst to reproduce the call.
    toolInput: text("tool_input"),
    outputPreview: text("output_preview"),
    // Agent-stated intent from the optional `context` tool arg [BD-188].
    intent: text("intent"),
    // Retrieval signal, present only for query-bearing tools: the query text and
    // how well the corpus answered it. topScore NULL + resultCount 0 on a
    // semantic tool = nothing matched (a coverage gap candidate).
    query: text("query"),
    topScore: integer("top_score"),
    resultCount: integer("result_count"),
    userId: text("user_id"),
    authKind: text("auth_kind").notNull(),
    // "mcp-remote" = hosted clients on /api/mcp; "stdio" = the npm client's
    // /api/internal/alert ping.
    source: text("source").notNull(),
    clientName: text("client_name"),
    // Snapshots survive account claims and key deletion; this id is not a secret.
    apiKeyId: text("api_key_id"),
    provisioningOrigin: text("provisioning_origin").$type<ProvisioningOrigin>().default("unknown").notNull(),
    acquisitionSource: text("acquisition_source").$type<AcquisitionSource>().default("unknown").notNull(),
    clientFamily: text("client_family").$type<McpClientFamily>().default("unknown").notNull(),
    clientAttributionSource: text("client_attribution_source").$type<McpClientAttribution["clientAttributionSource"]>().default("unknown").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Set once the issue-detection cron has considered this row. NULL rows form
    // the current FIFO batch. Suspicious rows analyzed in the prior seven days
    // may supply recurrence context, but never trigger work without a current row.
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    // Whether the call's $ai_span went to PostHog. False means sampling
    // dropped it, and a later label sends it from this row once; NULL on rows
    // written before sampling existed. [BD-1304]
    spanKept: boolean("span_kept"),
  },
  (t) => [
    index("mcp_tool_calls_created_at_idx").on(t.createdAt),
    index("mcp_tool_calls_tool_idx").on(t.tool),
    // The dashboard activity card reads one user's calls over 30 days, and it
    // runs for every signed-in visitor. Without this index that query reads
    // every row the whole platform wrote in the window.
    index("mcp_tool_calls_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("mcp_tool_calls_tool_created_at_idx").on(t.tool, t.createdAt),
    // Partial index serving the issue-detection cron's FIFO sample.
    index("mcp_tool_calls_unanalyzed_idx")
      .on(t.createdAt)
      .where(sql`${t.analyzedAt} is null`),
  ],
);

/**
 * One row per account and MCP client that has ever connected [BD-764].
 *
 * The "MCP connected" Slack ping used to rely on a marker file the stdio client
 * writes under the caller's home directory. A client that runs in a throwaway
 * sandbox loses that file between sessions, so one account produced 14 identical
 * Slack lines in two days while every other client produced one. This table
 * moves the once-only decision to the server: the insert wins for a genuinely
 * new pairing and conflicts for every repeat, so the alert fires once whatever
 * the caller's filesystem does.
 *
 * `clientName` is normalized before the insert and never null, because a null
 * never conflicts in Postgres and would defeat the constraint.
 *
 * The row records the pairing; `alertedAt` records the alert. Keeping them
 * apart means a lost insert response or a Slack rejection leaves the alert
 * owed rather than spent.
 */
export const mcpClientConnections = pgTable(
  "mcp_client_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientName: text("client_name").notNull(),
    /** Version reported at the first connect. Later upgrades do not update it. */
    clientVersion: text("client_version"),
    firstConnectedAt: timestamp("first_connected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * When the Slack line for this pairing was sent. Null means the alert is
     * still owed, so a later connect sends it. One update takes that duty, so
     * two simultaneous handshakes cannot both send.
     */
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
  },
  (t) => [unique("mcp_client_connections_user_client_key").on(t.userId, t.clientName)],
);

/**
 * One judge run over one graded thing [BD-693].
 *
 * The eval crons emitted their verdict to PostHog as an `$ai_metric` and wrote
 * one thing back: an `evaluated_at` timestamp. So the score lived in one system
 * and the decision it graded lived in another, and "show me every fragment the
 * judge failed, with the files it produced" needed an export and a manual join.
 * The timestamp also hid a real state: a row scored 0.1 and a row the judge
 * skipped both read as evaluated.
 *
 * One row per judge RUN, not per graded row, so re-judging after a prompt
 * change keeps the earlier verdict instead of overwriting it.
 */
export const evalVerdicts = pgTable(
  "eval_verdicts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Metric name, matching the `$ai_metric_name` the same run emits. */
    metric: text("metric").notNull(),
    /** Which table `subject_id` points into. */
    subjectType: text("subject_type").$type<"fragment" | "ds_search_query">().notNull(),
    subjectId: uuid("subject_id").notNull(),
    /** Trace of the run that produced the graded thing, where it had one. */
    traceId: text("trace_id"),
    /** Graded quality, 0 to 100. The judge returns 0..1; it is stored as an integer. */
    score: integer("score").notNull(),
    pass: boolean("pass").notNull(),
    /** The judge's one-sentence reason, the part a reader acts on. */
    reasoning: text("reasoning").notNull(),
    /** Model that judged, so a verdict is readable after the policy changes. */
    judgeModel: text("judge_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The join: every verdict against one fragment or one query, newest first.
    index("eval_verdicts_subject_idx").on(t.subjectType, t.subjectId),
    index("eval_verdicts_metric_created_at_idx").on(t.metric, t.createdAt),
    // Serves "which runs failed", the question the table exists to answer.
    index("eval_verdicts_pass_idx").on(t.pass),
  ],
);

/**
 * What one generation run was told, keyed by its trace id [BD-692].
 *
 * `fragments` keeps the files the agent wrote and `mcp_tool_calls` keeps the
 * tool calls, but the inputs that decided the build were assembled into the
 * system prompt and then dropped. Refetching does not recover them: the seed
 * cron rewrites design-system rows daily and project memory is rolling, so the
 * same fetch a week later returns a different document. An input is knowable
 * only if it is kept.
 *
 * One row per run, written once the prompt is assembled and before the agent
 * starts, so a run that later fails still leaves its inputs behind.
 * PII note: same posture as ds_search_queries and mcp_tool_calls, so the
 * 180-day purge cron covers this table too.
 */
export const generationInputs = pgTable(
  "generation_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The run's PostHog $ai_trace_id, the same value fragments.trace_id holds,
    // so one id joins the inputs, the spans and the output.
    traceId: text("trace_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The user's request for this turn, as the agent received it. */
    userRequest: text("user_request").notNull(),
    /** The catalog system the run was pinned to, absent for a brand-pinned build. */
    designSystemId: text("design_system_id"),
    /** The formatted design-system context that went into the system prompt. */
    designSystemContext: text("design_system_context"),
    /**
     * Content hash of that context. A run can be compared against a later one
     * without reading both documents, which is how a drift in the catalog shows
     * up as a cause.
     */
    designSystemHash: text("design_system_hash"),
    /** The distilled project memory block, absent on a first turn. */
    memoryBlock: text("memory_block"),
    /** Whether the run used the user's extracted brand instead of a catalog system. */
    brandPinned: boolean("brand_pinned").notNull().default(false),
    /** The model the code agent ran, from MODEL_POLICY. */
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The join key: read the inputs for a trace the spans or a fragment named.
    index("generation_inputs_trace_id_idx").on(t.traceId),
    // Serves the purge cron and "what did this project get told, over time".
    index("generation_inputs_created_at_idx").on(t.createdAt),
    index("generation_inputs_project_id_idx").on(t.projectId),
  ],
);

/**
 * Detected failure clusters over mcp_tool_calls [BD-485]. One row per distinct
 * recurring problem under one detector definition, not per occurrence:
 * re-detection of a known `(signalDefinitionVersion, fingerprint)` identity
 * bumps occurrences/lastSeenAt and refreshes the evidence instead of inserting
 * a duplicate. The admin issues page reads this table; resolving or ignoring an
 * issue is a status change here, never a delete, so history and versioned dedupe
 * survive.
 */
export const mcpIssues = pgTable(
  "mcp_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Deterministic dedupe key computed in code (category + tool + normalized
    // signal), never by the LLM, so the same failure maps to the same row across
    // cron runs.
    // Keep the legacy one-column constraint through the v1 rolling deploy so
    // old analyzer workers can still execute ON CONFLICT (fingerprint). A
    // later migration removes it before a second definition is activated.
    fingerprint: text("fingerprint").notNull().unique(),
    /** Detector rules that produced the fingerprint; version 1 covers legacy rows. */
    signalDefinitionVersion: integer("signal_definition_version")
      .notNull()
      .default(1),
    category: text("category", { enum: mcpIssueCategoryValues }).notNull(),
    severity: text("severity").$type<"low" | "medium" | "high">().notNull(),
    tool: text("tool").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    // Ready-to-paste prompt for a coding agent: what failed, the evidence, and
    // where to start. The "fix is one prompt away" handoff.
    fixPrompt: text("fix_prompt").notNull(),
    // Sample of the trace rows behind the issue (capped), newest first.
    evidence: jsonb("evidence").$type<McpIssueEvidence[]>().notNull(),
    // Maximum event time ever observed for this signal. Unlike the capped
    // evidence sample, this watermark never moves backwards when backlog lands.
    lastSignalAt: timestamp("last_signal_at", { withTimezone: true }),
    // The exact accepted cycle that last moved this issue into resolved. The
    // annotated callback breaks the circular issue ↔ improvement FK type.
    resolvedByImprovementId: uuid("resolved_by_improvement_id").references(
      (): AnyPgColumn => mcpIssueImprovements.id,
    ),
    occurrences: integer("occurrences").notNull().default(1),
    status: text("status", { enum: mcpIssueStatusValues }).notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("mcp_issues_signal_identity_idx").on(
      t.signalDefinitionVersion,
      t.fingerprint,
    ),
    index("mcp_issues_status_idx").on(t.status),
    index("mcp_issues_last_seen_at_idx").on(t.lastSeenAt),
    check(
      "mcp_issues_signal_definition_positive",
      sql`${t.signalDefinitionVersion} > 0`,
    ),
  ],
);

/**
 * One human-approved attempt to reduce a detected MCP issue [BD-710]. The
 * detector owns `mcp_issues.evidence`; this separate ledger keeps the approved
 * target, shipped change, exact measurement windows and counts, retry identity,
 * source expiry, and final human verdict. Display rates and decisions are derived.
 * PostHog receives aggregate transition events only and is never the source of
 * truth for whether an attempt worked.
 */
export const mcpIssueImprovements = pgTable(
  "mcp_issue_improvements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => mcpIssues.id),
    status: text("status", { enum: mcpIssueImprovementStatusValues })
      .notNull()
      .default("approved"),
    revision: integer("revision").notNull().default(1),
    approvalCommandId: uuid("approval_command_id").notNull(),

    linearIssueUrl: text("linear_issue_url").notNull(),
    targetReductionBps: integer("target_reduction_bps").notNull(),
    approvedByUserId: text("approved_by_user_id").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    measurementDefinitionVersion: integer("measurement_definition_version")
      .notNull()
      .default(1),
    signalFingerprintDigest: text("signal_fingerprint_digest").notNull(),
    signalCategory: text("signal_category", {
      enum: mcpIssueCategoryValues,
    }).notNull(),
    signalTool: text("signal_tool").notNull(),
    evidenceAtApproval: jsonb("evidence_at_approval")
      .$type<McpIssueAuditEvidence[]>()
      .notNull(),
    occurrencesAtApproval: integer("occurrences_at_approval").notNull(),

    pullRequestUrl: text("pull_request_url"),
    shippedByUserId: text("shipped_by_user_id"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    baselineStartAt: timestamp("baseline_start_at", { withTimezone: true }),
    baselineEndAt: timestamp("baseline_end_at", { withTimezone: true }),
    outcomeStartAt: timestamp("outcome_start_at", { withTimezone: true }),
    outcomeEndAt: timestamp("outcome_end_at", { withTimezone: true }),
    outcomeReadyAt: timestamp("outcome_ready_at", { withTimezone: true }),
    measurementSourceExpiresAt: timestamp("measurement_source_expires_at", {
      withTimezone: true,
    }),

    baselineExactSignalNumerator: integer("baseline_exact_signal_numerator"),
    baselineSuspiciousSignalNumerator: integer(
      "baseline_suspicious_signal_numerator",
    ),
    baselineEligibleCalls: integer("baseline_eligible_calls"),
    baselineWindowComplete: boolean("baseline_window_complete")
      .notNull()
      .default(false),

    outcomeExactSignalNumerator: integer("outcome_exact_signal_numerator"),
    outcomeSuspiciousSignalNumerator: integer(
      "outcome_suspicious_signal_numerator",
    ),
    outcomeEligibleCalls: integer("outcome_eligible_calls"),

    outcomeWindowComplete: boolean("outcome_window_complete")
      .notNull()
      .default(false),
    latestMeasurementCommandId: uuid("latest_measurement_command_id"),
    measuredAt: timestamp("measured_at", { withTimezone: true }),

    verdict: text("verdict", { enum: mcpIssueImprovementVerdictValues }),
    rationale: text("rationale"),
    finalizedByUserId: text("finalized_by_user_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("mcp_issue_improvements_one_active_idx")
      .on(t.issueId)
      .where(sql`${t.status} <> 'finalized'`),
    uniqueIndex("mcp_issue_improvements_approval_command_idx").on(
      t.approvalCommandId,
    ),
    uniqueIndex("mcp_issue_improvements_latest_measurement_command_idx")
      .on(t.latestMeasurementCommandId)
      .where(sql`${t.latestMeasurementCommandId} is not null`),
    index("mcp_issue_improvements_issue_created_idx").on(
      t.issueId,
      t.createdAt,
    ),
    index("mcp_issue_improvements_status_outcome_idx").on(
      t.status,
      t.outcomeEndAt,
    ),
    check(
      "mcp_issue_improvements_status_valid",
      sql`${t.status} in (${mcpIssueImprovementStatusSqlValues})`,
    ),
    check(
      "mcp_issue_improvements_verdict_valid",
      sql`${t.verdict} is null or ${t.verdict} in (${mcpIssueImprovementVerdictSqlValues})`,
    ),
    check("mcp_issue_improvements_revision_positive", sql`${t.revision} > 0`),
    check(
      "mcp_issue_improvements_target_range",
      sql`${t.targetReductionBps} between 1 and 10000`,
    ),
    check(
      "mcp_issue_improvements_definition_supported",
      sql`${t.measurementDefinitionVersion} = 1`,
    ),
    check(
      "mcp_issue_improvements_signal_fingerprint_digest_valid",
      sql`${t.signalFingerprintDigest} ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "mcp_issue_improvements_baseline_counts_valid",
      sql`(${t.baselineEligibleCalls} is null and ${t.baselineExactSignalNumerator} is null and ${t.baselineSuspiciousSignalNumerator} is null) or (${t.baselineEligibleCalls} is not null and ${t.baselineExactSignalNumerator} is not null and ${t.baselineSuspiciousSignalNumerator} is not null and ${t.baselineEligibleCalls} >= 0 and ${t.baselineExactSignalNumerator} between 0 and ${t.baselineSuspiciousSignalNumerator} and ${t.baselineSuspiciousSignalNumerator} between 0 and ${t.baselineEligibleCalls})`,
    ),
    check(
      "mcp_issue_improvements_outcome_counts_valid",
      sql`(${t.outcomeEligibleCalls} is null and ${t.outcomeExactSignalNumerator} is null and ${t.outcomeSuspiciousSignalNumerator} is null) or (${t.outcomeEligibleCalls} is not null and ${t.outcomeExactSignalNumerator} is not null and ${t.outcomeSuspiciousSignalNumerator} is not null and ${t.outcomeEligibleCalls} >= 0 and ${t.outcomeExactSignalNumerator} between 0 and ${t.outcomeSuspiciousSignalNumerator} and ${t.outcomeSuspiciousSignalNumerator} between 0 and ${t.outcomeEligibleCalls})`,
    ),
    check(
      "mcp_issue_improvements_shipment_consistent",
      sql`(${t.status} = 'approved' and ${t.pullRequestUrl} is null and ${t.shippedByUserId} is null and ${t.shippedAt} is null and ${t.baselineStartAt} is null and ${t.baselineEndAt} is null and ${t.outcomeStartAt} is null and ${t.outcomeEndAt} is null and ${t.outcomeReadyAt} is null and ${t.measurementSourceExpiresAt} is null) or (${t.status} <> 'approved' and ${t.pullRequestUrl} is not null and ${t.shippedByUserId} is not null and ${t.shippedAt} is not null and ${t.baselineStartAt} is not null and ${t.baselineStartAt} = ${t.shippedAt} - interval '168 hours' and ${t.baselineEndAt} is not null and ${t.baselineEndAt} = ${t.shippedAt} and ${t.outcomeStartAt} is not null and ${t.outcomeStartAt} = ${t.shippedAt} and ${t.outcomeEndAt} is not null and ${t.outcomeEndAt} = ${t.shippedAt} + interval '168 hours' and ${t.outcomeReadyAt} is not null and ${t.outcomeReadyAt} = ${t.outcomeEndAt} + interval '1 hour' and ${t.measurementSourceExpiresAt} is not null and ${t.measurementSourceExpiresAt} = ${t.baselineStartAt} + interval '4320 hours')`,
    ),
    check(
      "mcp_issue_improvements_finalization_consistent",
      sql`(${t.status} = 'finalized' and ${t.verdict} is not null and ${t.rationale} is not null and length(${t.rationale}) between 1 and 1000 and ${t.finalizedByUserId} is not null and ${t.finalizedAt} is not null and ${t.outcomeWindowComplete} = true) or (${t.status} <> 'finalized' and ${t.verdict} is null and ${t.rationale} is null and ${t.finalizedByUserId} is null and ${t.finalizedAt} is null)`,
    ),
    check(
      "mcp_issue_improvements_measurable_consistent",
      sql`${t.status} not in ('measurable', 'finalized') or (${t.baselineExactSignalNumerator} is not null and ${t.baselineSuspiciousSignalNumerator} is not null and ${t.baselineEligibleCalls} is not null and ${t.outcomeExactSignalNumerator} is not null and ${t.outcomeSuspiciousSignalNumerator} is not null and ${t.outcomeEligibleCalls} is not null and ${t.baselineWindowComplete} is true and ${t.outcomeWindowComplete} is true and ${t.measuredAt} is not null and ${t.latestMeasurementCommandId} is not null)`,
    ),
    check(
      "mcp_issue_improvements_measurement_command_consistent",
      sql`(${t.measuredAt} is null and ${t.latestMeasurementCommandId} is null) or (${t.measuredAt} is not null and ${t.latestMeasurementCommandId} is not null)`,
    ),
    check(
      "mcp_issue_improvements_measurement_snapshot_consistent",
      sql`(${t.baselineExactSignalNumerator} is null and ${t.baselineSuspiciousSignalNumerator} is null and ${t.baselineEligibleCalls} is null and ${t.outcomeExactSignalNumerator} is null and ${t.outcomeSuspiciousSignalNumerator} is null and ${t.outcomeEligibleCalls} is null and ${t.baselineWindowComplete} is false and ${t.outcomeWindowComplete} is false and ${t.measuredAt} is null and ${t.latestMeasurementCommandId} is null) or (${t.baselineExactSignalNumerator} is not null and ${t.baselineSuspiciousSignalNumerator} is not null and ${t.baselineEligibleCalls} is not null and ${t.outcomeExactSignalNumerator} is not null and ${t.outcomeSuspiciousSignalNumerator} is not null and ${t.outcomeEligibleCalls} is not null and ${t.baselineWindowComplete} is true and ${t.measuredAt} is not null and ${t.latestMeasurementCommandId} is not null)`,
    ),
    check(
      "mcp_issue_improvements_measurement_source_valid",
      sql`${t.measuredAt} is null or (${t.measurementSourceExpiresAt} is not null and ${t.measuredAt} < ${t.measurementSourceExpiresAt})`,
    ),
    check(
      "mcp_issue_improvements_improved_supported",
      sql`${t.verdict} is null or ${t.verdict} <> 'improved' or (${t.measurementDefinitionVersion} = 1 and ${t.baselineExactSignalNumerator} is not null and ${t.baselineSuspiciousSignalNumerator} is not null and ${t.baselineEligibleCalls} is not null and ${t.outcomeExactSignalNumerator} is not null and ${t.outcomeSuspiciousSignalNumerator} is not null and ${t.outcomeEligibleCalls} is not null and ${t.baselineEligibleCalls} > 0 and ${t.outcomeEligibleCalls} > 0 and ${t.baselineExactSignalNumerator} > 0 and (${t.outcomeExactSignalNumerator})::numeric * ${t.baselineEligibleCalls} * 10000 <= (${t.baselineExactSignalNumerator})::numeric * ${t.outcomeEligibleCalls} * (10000 - ${t.targetReductionBps}) and (${t.outcomeSuspiciousSignalNumerator})::numeric * ${t.baselineEligibleCalls} <= (${t.baselineSuspiciousSignalNumerator})::numeric * ${t.outcomeEligibleCalls})`,
    ),
  ],
);

/** Product metrics an improvement can be measured against; the queries live in code [BD-711]. */
export const productOutcomeMetricValues = ["mcp_tool_success_rate"] as const;
/** Where a product-outcome measurement stands. */
export const productOutcomeStatusValues = ["pending", "measured", "blocked"] as const;
/**
 * Why a product-outcome measurement could not be taken. The first two can
 * clear, so the hourly sweep tries again; the rest mean this cycle gets no
 * product number.
 */
export const productOutcomeBlockedReasonValues = [
  "missing_credentials",
  "source_unavailable",
  "source_invalid",
  "no_events",
  "metric_unsupported",
] as const;

/**
 * The product outcome measured beside an improvement's detector signal
 * [BD-711]. One row per cycle, written at approval so the metric and its
 * version are fixed before shipment. The windows are the cycle's own frozen
 * windows. Counts come from PostHog once the outcome window is ready; a read
 * that fails leaves the row blocked with its reason, never with zeros. Rates
 * are derived at read time, as for the detector counts.
 */
export const mcpIssueImprovementOutcomes = pgTable(
  "mcp_issue_improvement_outcomes",
  {
    improvementId: uuid("improvement_id")
      .primaryKey()
      .references(() => mcpIssueImprovements.id),
    metric: text("metric", { enum: productOutcomeMetricValues }).notNull(),
    metricVersion: integer("metric_version").notNull(),
    status: text("status", { enum: productOutcomeStatusValues }).notNull().default("pending"),
    blockedReason: text("blocked_reason", { enum: productOutcomeBlockedReasonValues }),
    baselineNumerator: integer("baseline_numerator"),
    baselineDenominator: integer("baseline_denominator"),
    outcomeNumerator: integer("outcome_numerator"),
    outcomeDenominator: integer("outcome_denominator"),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("mcp_issue_improvement_outcomes_status_updated_at_idx").on(t.status, t.updatedAt),
    check("mcp_issue_improvement_outcomes_metric_version_positive", sql`${t.metricVersion} > 0`),
    // A measured row holds both windows' counts, and each window saw at least one call.
    check(
      "mcp_issue_improvement_outcomes_measured_counts",
      sql`(${t.status} = 'measured') = (${t.baselineNumerator} is not null and ${t.baselineDenominator} is not null and ${t.outcomeNumerator} is not null and ${t.outcomeDenominator} is not null and ${t.measuredAt} is not null and ${t.baselineNumerator} between 0 and ${t.baselineDenominator} and ${t.outcomeNumerator} between 0 and ${t.outcomeDenominator} and ${t.baselineDenominator} > 0 and ${t.outcomeDenominator} > 0)`,
    ),
    check(
      "mcp_issue_improvement_outcomes_blocked_reason",
      sql`(${t.status} = 'blocked') = (${t.blockedReason} is not null)`,
    ),
  ],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ many, one }) => ({
  messages: many(messages),
  memory: one(projectMemory, {
    fields: [projects.id],
    references: [projectMemory.projectId],
  }),
}));

export const projectMemoryRelations = relations(projectMemory, ({ one }) => ({
  project: one(projects, {
    fields: [projectMemory.projectId],
    references: [projects.id],
  }),
}));

/** Connects each detected issue to its retained improvement history. */
export const mcpIssuesRelations = relations(mcpIssues, ({ many }) => ({
  improvements: many(mcpIssueImprovements),
}));

/** Connects each improvement ledger row back to its source issue. */
export const mcpIssueImprovementsRelations = relations(
  mcpIssueImprovements,
  ({ one }) => ({
    issue: one(mcpIssues, {
      fields: [mcpIssueImprovements.issueId],
      references: [mcpIssues.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
  fragment: one(fragments, {
    fields: [messages.id],
    references: [fragments.messageId],
  }),
}));

export const fragmentsRelations = relations(fragments, ({ one }) => ({
  message: one(messages, {
    fields: [fragments.messageId],
    references: [messages.id],
  }),
}));

export const designSystemsRelations = relations(designSystems, ({ many }) => ({
  components: many(designSystemComponents),
}));

export const designSystemComponentsRelations = relations(
  designSystemComponents,
  ({ one }) => ({
    designSystem: one(designSystems, {
      fields: [designSystemComponents.designSystemId],
      references: [designSystems.id],
    }),
  }),
);

// ─── Drizzle-Zod Schemas ──────────────────────────────────────────────────────

export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

export const insertFragmentSchema = createInsertSchema(fragments);
export const selectFragmentSchema = createSelectSchema(fragments);

export const insertProjectMemorySchema = createInsertSchema(projectMemory);
export const selectProjectMemorySchema = createSelectSchema(projectMemory);

export const insertDesignSystemSchema = createInsertSchema(designSystems);
export const selectDesignSystemSchema = createSelectSchema(designSystems);

export const insertDesignSystemComponentSchema = createInsertSchema(designSystemComponents);
export const selectDesignSystemComponentSchema = createSelectSchema(designSystemComponents);

export const insertFoundationalDocSchema = createInsertSchema(foundationalDocs);
export const selectFoundationalDocSchema = createSelectSchema(foundationalDocs);

export const insertIconLibrarySchema = createInsertSchema(iconLibraries);
export const selectIconLibrarySchema = createSelectSchema(iconLibraries);

export const insertApiKeySchema = createInsertSchema(apiKeys);
export const selectApiKeySchema = createSelectSchema(apiKeys);

export const insertUserSchema = createInsertSchema(user);
export const selectUserSchema = createSelectSchema(user);

/** Validates new durable signup-alert records at process boundaries. */
export const insertSignupAlertDeliverySchema = createInsertSchema(signupAlertDeliveries);
/** Validates durable signup-alert records returned across process boundaries. */
export const selectSignupAlertDeliverySchema = createSelectSchema(signupAlertDeliveries);

export const insertEmailCampaignSendSchema = createInsertSchema(emailCampaignSends);
export const selectEmailCampaignSendSchema = createSelectSchema(emailCampaignSends);

export const insertEmailCampaignStepSchema = createInsertSchema(emailCampaignSteps);
export const selectEmailCampaignStepSchema = createSelectSchema(emailCampaignSteps);

/** Validates values supplied when creating an improvement ledger row. */
export const insertMcpIssueImprovementSchema =
  createInsertSchema(mcpIssueImprovements);
/** Validates improvement ledger rows read from external boundaries. */
export const selectMcpIssueImprovementSchema =
  createSelectSchema(mcpIssueImprovements);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type EmailCampaignSend = typeof emailCampaignSends.$inferSelect;
export type NewEmailCampaignSend = typeof emailCampaignSends.$inferInsert;

/** Represents the persisted state and Slack receipt for one signup notice. */
export type SignupAlertDelivery = typeof signupAlertDeliveries.$inferSelect;
/** Represents a new durable signup notice before delivery attempts begin. */
export type NewSignupAlertDelivery = typeof signupAlertDeliveries.$inferInsert;

export type EmailCampaignStep = typeof emailCampaignSteps.$inferSelect;
export type NewEmailCampaignStep = typeof emailCampaignSteps.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Fragment = typeof fragments.$inferSelect;
export type NewFragment = typeof fragments.$inferInsert;

export type ProjectMemory = typeof projectMemory.$inferSelect;
export type NewProjectMemory = typeof projectMemory.$inferInsert;

export type Usage = typeof usage.$inferSelect;
export type NewUsage = typeof usage.$inferInsert;

export type DesignSystem = typeof designSystems.$inferSelect;
export type NewDesignSystem = typeof designSystems.$inferInsert;

export type DesignSystemComponent = typeof designSystemComponents.$inferSelect;
export type NewDesignSystemComponent = typeof designSystemComponents.$inferInsert;

export type FoundationalDoc = typeof foundationalDocs.$inferSelect;
export type NewFoundationalDoc = typeof foundationalDocs.$inferInsert;

export type IconLibrary = typeof iconLibraries.$inferSelect;
export type NewIconLibrary = typeof iconLibraries.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type ProjectEvent = typeof projectEvents.$inferSelect;
export type NewProjectEvent = typeof projectEvents.$inferInsert;

export type DsSearchQuery = typeof dsSearchQueries.$inferSelect;
export type NewDsSearchQuery = typeof dsSearchQueries.$inferInsert;

/** A stored tool call, as read back. */
export type McpToolCall = typeof mcpToolCalls.$inferSelect;
/** A tool call being written. */
export type NewMcpToolCall = typeof mcpToolCalls.$inferInsert;

/** A detected issue, as read back. */
export type McpIssue = typeof mcpIssues.$inferSelect;
/** An issue being written. */
export type NewMcpIssue = typeof mcpIssues.$inferInsert;

/** One approved and measured attempt to improve a detected MCP issue. */
export type McpIssueImprovement = typeof mcpIssueImprovements.$inferSelect;
/** A new improvement cycle before database defaults are applied. */
export type NewMcpIssueImprovement = typeof mcpIssueImprovements.$inferInsert;

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

/**
 * A drawing in flight, and its result once finished.
 *
 * Drawing outlives an MCP tool call, so the caller gets an id and polls. Rows
 * are short-lived on purpose: the svg is handed over and pasted into the
 * caller's code, so nothing needs keeping afterwards, and holding other
 * people's generated artwork would raise ownership and review questions this
 * feature does not answer. A purge job clears finished rows, in the same
 * pattern as the other purge crons.
 */

/**
 * A one-time handoff of an api key from a browser sign-in to a Figma plugin.
 *
 * A plugin cannot receive a redirect, so it opens the sign-in page with a
 * nonce it made, then polls. The signed-in page binds the nonce to the user;
 * the poll mints that user a key, once, and deletes the row. The nonce is the
 * only secret in flight and it lives for minutes, so no key is ever stored
 * here. [BD-539]
 */
export const pluginAuthNonces = pgTable("plugin_auth_nonces", {
  nonce: text("nonce").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

/** A sign-in handoff in flight, read once by the plugin that is polling for it. */
export type PluginAuthNonce = typeof pluginAuthNonces.$inferSelect;
/** A handoff to write when a signed-in page claims the plugin's nonce. */
export type NewPluginAuthNonce = typeof pluginAuthNonces.$inferInsert;

/**
 * One landing page made for one account, from one row of a Clay table. The
 * row's columns arrive as the page's copy, so the page is rendered from these
 * fields on every view and never stored as HTML. The id is the only secret in
 * the page's link. [BD-1091]
 */
export const accountPages = pgTable(
  "account_pages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    designSystemId: text("design_system_id").notNull(),
    website: text("website").notNull(),
    company: text("company").notNull(),
    headline: text("headline").notNull(),
    problem: text("problem"),
    offer: text("offer").notNull(),
    /** Up to three short proof points: results, customers or numbers. [BD-1093] */
    proofs: text("proofs").array(),
    ctaLabel: text("cta_label").notNull(),
    ctaUrl: text("cta_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("account_pages_user_id_idx").on(t.userId)],
);

/** A stored account page, read when its link is opened. */
export type AccountPage = typeof accountPages.$inferSelect;

/** What a generated asset is: a slide deck, a sales page or a social image. [BD-1223] */
export type GeneratedAssetKind = "slides" | "sales-page" | "social-image";

/** One slide of a generated deck. */
export type GeneratedSlide = {
  role: "title" | "problem" | "offer" | "proof" | "next-step";
  heading: string;
  body?: string;
  points?: string[];
};

/** The words of a generated asset, written by our model or typed by the caller. */
export type GeneratedAssetContent = {
  headline: string;
  problem?: string;
  offer?: string;
  proofs?: string[];
  slides?: GeneratedSlide[];
  /** What the drawn visual shows, in a few words. */
  visualSubject: string;
};

/**
 * The drawn visual: an SVG illustration, or one of our 3D scenes drawn once as
 * a still and kept as a data URL, so showing the asset never starts a browser.
 */
export type GeneratedAssetVisual = { kind: "illustration"; svg: string } | { kind: "scene"; scene: string; image: string };

/**
 * One asset our server writes and draws for one lead: the words come from our
 * model, the visual is an illustration or a 3D scene in the seller's design
 * system. The row exists from the request on, so its link works at once and
 * shows the asset when the job finishes. The id is the only secret in the
 * link. [BD-1223]
 */
export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GeneratedAssetKind>().notNull(),
    designSystemId: text("design_system_id").notNull(),
    /** The lead and the offer, as the caller sent them. */
    input: jsonb("input").$type<Record<string, string>>().notNull(),
    content: jsonb("content").$type<GeneratedAssetContent>(),
    visual: jsonb("visual").$type<GeneratedAssetVisual>(),
    status: text("status").$type<"pending" | "ready" | "failed">().notNull().default("pending"),
    error: text("error"),
    /** Where to send the finished asset, such as a waiting Zapier step. */
    callbackUrl: text("callback_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (t) => [index("generated_assets_user_id_idx").on(t.userId)],
);

/** A stored generated asset, read when its link is opened. */
export type GeneratedAsset = typeof generatedAssets.$inferSelect;
