CREATE TABLE "device_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"device_pub_key" text NOT NULL,
	"user_code" text NOT NULL,
	"poll_secret_hash" text NOT NULL,
	"token_hash" text,
	"wrapped_priv_key_env" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token_expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "device_grants_state_ck" CHECK ("device_grants"."state" in ('pending', 'approved', 'denied', 'revoked', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "device_grants" ADD CONSTRAINT "device_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_grants_code_uq" ON "device_grants" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "device_grants_user_idx" ON "device_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_grants_token_idx" ON "device_grants" USING btree ("token_hash");