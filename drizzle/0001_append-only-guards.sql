-- Append-only enforcement (plannings/03 C3, revision-model §1, handoff §27).
-- The repo layer exposes no UPDATE/DELETE for revisions and audit_events;
-- these triggers make the guarantee hold even against future application bugs
-- or stray SQL. Immutable history is a security property, not a convention.
--
-- audit_events: fully immutable (no FKs exist on the table, so no FK action
-- ever needs to touch a row).
-- revisions: UPDATE always forbidden; DELETE forbidden except when originating
-- from a cascade (environment/vault deletion destroys the whole aggregate —
-- pg_trigger_depth() > 1 means this row delete was fired from within another
-- trigger context, i.e. the FK cascade machinery, not a direct statement).

CREATE OR REPLACE FUNCTION forbid_row_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_direct_delete() RETURNS trigger AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD; -- cascade-originated: allowed (aggregate destruction)
  END IF;
  RAISE EXCEPTION 'table % is append-only: direct DELETE not permitted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER revisions_no_update
  BEFORE UPDATE ON "revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();
--> statement-breakpoint
CREATE TRIGGER revisions_no_direct_delete
  BEFORE DELETE ON "revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_direct_delete();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation();
