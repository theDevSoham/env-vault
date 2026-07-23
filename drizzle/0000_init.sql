CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vault_id" uuid,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"name_env" jsonb NOT NULL,
	"head_revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_chunks" (
	"file_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"data" "bytea" NOT NULL,
	CONSTRAINT "file_chunks_file_id_idx_pk" PRIMARY KEY("file_id","idx")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"invitee_email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid,
	"envelope" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_role_ck" CHECK ("invitations"."role" in ('owner', 'member')),
	CONSTRAINT "invitations_state_ck" CHECK ("invitations"."state" in ('pending', 'accepted', 'active', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"actor_user_id" uuid,
	"key_generation" integer NOT NULL,
	"message" text,
	"snapshot_env" jsonb NOT NULL,
	"diff_env" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_number_positive_ck" CHECK ("revisions"."number" > 0),
	CONSTRAINT "revisions_message_len_ck" CHECK ("revisions"."message" is null or length("revisions"."message") <= 500)
);
--> statement-breakpoint
CREATE TABLE "secret_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"name_env" jsonb NOT NULL,
	"stream_env" jsonb NOT NULL,
	"size_bytes" bigint NOT NULL,
	"key_generation" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"enc_priv_key_env" jsonb NOT NULL,
	"kdf_params" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"auth_verifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_key_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"envelope" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_memberships_role_ck" CHECK ("vault_memberships"."role" in ('owner', 'member')),
	CONSTRAINT "vault_memberships_status_ck" CHECK ("vault_memberships"."status" in ('active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_env" jsonb NOT NULL,
	"key_generation" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_secret_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."secret_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_files" ADD CONSTRAINT "secret_files_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_key_envelopes" ADD CONSTRAINT "vault_key_envelopes_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_key_envelopes" ADD CONSTRAINT "vault_key_envelopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_memberships" ADD CONSTRAINT "vault_memberships_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_memberships" ADD CONSTRAINT "vault_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_vault_idx" ON "audit_events" USING btree ("vault_id","created_at");--> statement-breakpoint
CREATE INDEX "environments_vault_idx" ON "environments" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "invitations_vault_idx" ON "invitations" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree (lower("invitee_email"));--> statement-breakpoint
CREATE UNIQUE INDEX "revisions_env_number_uq" ON "revisions" USING btree ("environment_id","number");--> statement-breakpoint
CREATE INDEX "revisions_vault_idx" ON "revisions" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "secret_files_vault_idx" ON "secret_files" USING btree ("vault_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "vault_key_envelopes_uq" ON "vault_key_envelopes" USING btree ("vault_id","user_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_memberships_vault_user_uq" ON "vault_memberships" USING btree ("vault_id","user_id");