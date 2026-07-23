import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Env Vault schema (Phase C, plannings/03).
 *
 * ZERO-KNOWLEDGE REVIEW RULE (handoff §3): no column may ever hold plaintext
 * secret material. Columns holding ciphertext are jsonb *envelopes* produced
 * by src/lib/crypto (enc.rec / enc.box / enc.stream) and are named *_env.
 * Everything else is non-sensitive metadata by design (ADR-004, threat-model §6).
 */

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** Auth + identity. NO passwords — authVerifier is a server-side Argon2id hash
 *  of the client-derived authKey (account-key-lifecycle §1). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    authVerifier: text("auth_verifier").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)]
);

/** Login sessions (ADR-002, Phase D). Stores only a keyed hash of the random
 *  session token — a DB dump cannot forge cookies. Tokens grant API access
 *  only; they can never decrypt anything (handoff §23). */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ]
);

/** User cryptographic identity (crypto-spec §3). Public key plaintext;
 *  private key only as a KEK-encrypted enc.rec envelope; KDF params plaintext. */
export const userKeys = pgTable("user_keys", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64url X25519 public key
  encPrivKeyEnv: jsonb("enc_priv_key_env").notNull(), // enc.rec under KEK
  kdfParams: jsonb("kdf_params").notNull(), // versioned KDF record (crypto-spec §2.4)
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vaults = pgTable("vaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameEnv: jsonb("name_env").notNull(), // enc.rec — vault name is encrypted (ADR-004)
  keyGeneration: integer("key_generation").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vaultMemberships = pgTable(
  "vault_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'owner' | 'member' (handoff §6)
    status: text("status").notNull().default("active"), // 'active' | 'removed'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vault_memberships_vault_user_uq").on(t.vaultId, t.userId),
    check("vault_memberships_role_ck", sql`${t.role} in ('owner', 'member')`),
    check("vault_memberships_status_ck", sql`${t.status} in ('active', 'removed')`),
  ]
);

/** Wrapped vault keys: one enc.box per (member, generation) (crypto-spec §3).
 *  Old-generation envelopes are kept so history stays readable (handoff §21). */
export const vaultKeyEnvelopes = pgTable(
  "vault_key_envelopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
    envelope: jsonb("envelope").notNull(), // enc.box
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vault_key_envelopes_uq").on(t.vaultId, t.userId, t.generation)]
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    nameEnv: jsonb("name_env").notNull(), // enc.rec — environment name encrypted (ADR-004)
    headRevision: integer("head_revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("environments_vault_idx").on(t.vaultId)]
);

/**
 * Immutable revisions (revision-model §1). Append-only — enforced by trigger
 * (migration 0001) AND by the repo layer exposing no update/delete.
 * unique(environment, number) is the optimistic-concurrency backstop.
 * The handoff's EncryptedPayload entity is realized as the two envelope
 * columns here — snapshot and diff ciphertext live with the revision row.
 */
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** No FK: revisions are immutable (trigger-enforced); an FK SET NULL action
     *  on user deletion would be an UPDATE and violate immutability. */
    actorUserId: uuid("actor_user_id"),
    keyGeneration: integer("key_generation").notNull(),
    /** Optional user message. Free text — UI warns against secrets (revision-model §1); length-capped. */
    message: text("message"),
    snapshotEnv: jsonb("snapshot_env").notNull(), // enc.rec — full encrypted snapshot (D2)
    diffEnv: jsonb("diff_env").notNull(), // enc.rec — encrypted structural diff
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("revisions_env_number_uq").on(t.environmentId, t.number),
    index("revisions_vault_idx").on(t.vaultId),
    check("revisions_number_positive_ck", sql`${t.number} > 0`),
    check("revisions_message_len_ck", sql`${t.message} is null or length(${t.message}) <= 500`),
  ]
);

/** Encrypted secret files (handoff §22, ADR-007). Filename encrypted (ADR-004);
 *  streamEnv is the enc.stream header/metadata; bytes live in file_chunks. */
export const secretFiles = pgTable(
  "secret_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    nameEnv: jsonb("name_env").notNull(), // enc.rec — encrypted filename
    streamEnv: jsonb("stream_env").notNull(), // enc.stream
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(), // ciphertext total size
    keyGeneration: integer("key_generation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("secret_files_vault_idx").on(t.vaultId)]
);

/** V1 blob store (ADR-007): opaque secretstream ciphertext chunks. */
export const fileChunks = pgTable(
  "file_chunks",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => secretFiles.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.idx] })]
);

/** Invitations (sharing-protocol §2). envelope is null until wrapped:
 *  Flow A wraps at creation; Flow B (deferred wrap) fills it when the owner
 *  client wraps after acceptance. Never any key escrow — envelope is enc.box
 *  to the invitee's own public key. */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vaultId: uuid("vault_id")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    inviteeEmail: text("invitee_email").notNull(),
    role: text("role").notNull().default("member"),
    state: text("state").notNull().default("pending"), // pending|accepted|active|revoked|expired
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    envelope: jsonb("envelope"), // enc.box for invitee, nullable until wrapped
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invitations_vault_idx").on(t.vaultId),
    index("invitations_email_idx").on(sql`lower(${t.inviteeEmail})`),
    check("invitations_role_ck", sql`${t.role} in ('owner', 'member')`),
    check(
      "invitations_state_ck",
      sql`${t.state} in ('pending', 'accepted', 'active', 'revoked', 'expired')`
    ),
  ]
);

/**
 * Audit events (handoff §27). Append-only (trigger + repo). MUST NEVER contain
 * secret values, keys, passwords, or tokens — context carries ids/counts only.
 * Deliberately NO foreign keys: the log is fully immutable and outlives its
 * referents (vault/user deletion must not touch history rows — FK SET NULL
 * would be an UPDATE and violate the append-only trigger).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vaultId: uuid("vault_id"),
    actorUserId: uuid("actor_user_id"),
    type: text("type").notNull(), // e.g. 'vault_created', 'revision_created' (handoff §27 list)
    context: jsonb("context").notNull().default({}), // non-secret metadata only
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_vault_idx").on(t.vaultId, t.createdAt)]
);
