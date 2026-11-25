# Production readiness remediation — 2026-11-25

This branch is an isolated preparation branch based on the production application commit
`b471c72f0906b79977380c408af702ebee181b08`. It is not deployed to Supabase or Vercel.

## Prepared in this branch

### WhatsApp first-contact routing
- Restored the complete currently deployed `whatsapp-webhook` source (production version 108) into the repository before editing, instead of promoting the older repository copy.
- New conversations are created in `aguardando_escolha`.
- A newly created conversation receives the initial menu after the inbound message is persisted.
- Existing legacy conversations in `aguardando` are moved to `aguardando_escolha` and receive the initial menu on their next inbound message.
- A flag is set only when this webhook execution actually created the conversation, avoiding a duplicate initial menu when a concurrent webhook loses the unique-key race and reuses the existing conversation.
- Existing 48-hour pause and explicit greeting reactivation logic is retained.
- Added static regression assertions in `test-whatsapp-first-message.mjs`.

### Rental-credit RLS drift repair
- Production currently has the `student_rental_credits` table and `private.current_app_role()`, but the authenticated owner-read policy and authenticated column SELECT grants are absent.
- QA has the intended owner-scoped SELECT policy and column grants.
- Added a separate drift-repair migration, `20261125110000_repair_student_rental_credit_rls_drift.sql`, rather than rewriting a migration already recorded in production history.
- The policy restricts reads to `owner_id = auth.uid()` and active `admin` / `instrutor` roles. Direct writes remain revoked.
- Added static assertions in `test-student-rental-credit-rls-repair.mjs`.

## Verification completed
- Confirmed all expected source markers and routing branches exist in the branch copy.
- Confirmed the regression scripts contain assertions for first-contact routing, legacy `aguardando`, preserved greeting reactivation, owner-scoped RLS, role restriction, and read-only grants.
- Added a GitHub Actions workflow and verified its first run completed successfully (run 45627095674). Both source-regression scripts passed. This is static source validation, not an end-to-end WhatsApp or live-database test.
- Confirmed the production helper `private.current_app_role()` exists.
- Confirmed QA's live rental-credit policy matches the intended owner and role restrictions.

## Not yet verified
- The Node regression scripts have not been executed in a configured test runner; checks so far are source-level assertions.
- WhatsApp end-to-end delivery has not been tested. QA currently lacks the production owner/configuration and its webhook is not a valid WhatsApp test target.
- The rental-credit repair migration has not been applied to either environment.
- No Edge Function deployment, database migration, Vercel deployment, alias change, or production data change has been performed.

### Migration-history recovery
- Read the full migration records from both Supabase projects, including the SQL statement arrays stored in each remote migration history.
- Archived 17 QA-only migration statement sets in `docs/recovered-qa-migrations/` and 32 production migration statement sets in `docs/recovered-production-migrations-archive.md`.
- The archives are intentionally outside `supabase/migrations`; they are evidence for reconciliation, not executable migration files.
- The remote histories contain 80 QA records and 71 production records, with substantial differences in migration names and applied versions. Matching by filename alone is insufficient because some migrations were renamed or applied under different version identifiers.
- Historical SQL includes one-time data updates and cleanup statements, so none of the archived SQL is being replayed automatically.

### Central-instructor function source recovery
- Recovered the deployed QA source for `provision-central-instructor` (version 1), `complete-central-link` (version 3), and `sync-central-access` (version 4) into `supabase/functions/`.
- Added their deployed `verify_jwt` settings to `supabase/config.toml` (false, true, false respectively).
- The Central Supabase project was rechecked and remains `INACTIVE`; the account-provisioning fallback cannot be end-to-end tested while that project is paused.

- Additional live-schema check: QA contains both `central_access_sync_events` and `central_access_state_sync_events` plus their RPCs. Production contains neither ledger nor either RPC. The recovered `sync-central-access` function therefore cannot be promoted to production until the versioned sync schema/RPC is reconciled and installed.
- No secret values were copied into the repository; these functions continue to read service credentials and the HMAC secret from Edge Function environment variables.

## Remaining production blockers
1. Establish a QA WhatsApp owner/configuration that is isolated from production and can receive a real test webhook.
2. Execute behavioral tests for first contact, existing `aguardando`, duplicate webhook delivery, expired pause, active 48-hour pause, and explicit greeting reactivation.
3. Reconcile the 80 QA / 71 production migration histories with the checked-in migration files before any `db push`.
4. Recover the missing partner and generated-contract schema migrations. The generated-contracts table in QA has a composite FK to `partners`, so partner schema must be reconciled before the contract table can be promoted safely.
5. Reconcile production partner tables, role constraint, personal-detail columns, Edge Functions, RLS policies, grants, and central-instructor provisioning functions.
6. Verify invitation delivery using the actual production SMTP configuration without exposing secrets.
7. Add executable CI coverage for the application and Edge Functions, then complete the full admin/instructor/partner/student acceptance matrix.

## Promotion rule
Do not deploy this branch or run migrations against production until the missing migration sources and remote histories are reconciled and QA behavioral tests pass. The existing production Edge Function remains untouched.
