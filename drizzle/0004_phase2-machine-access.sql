ALTER TABLE "invitations" ADD COLUMN "membership_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_service" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_memberships" ADD COLUMN "expires_at" timestamp with time zone;