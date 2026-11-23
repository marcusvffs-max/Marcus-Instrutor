# SQL fixtures for isolated Supabase security tests

These SQL files reconstruct a disposable test database. They are **not production migrations**.

- Keep these files outside `supabase/migrations/`.
- Never run `supabase db push` against production using these fixtures.
- Apply them only to a disposable Supabase project created for security testing.
- The fixtures may create or alter tables, policies, triggers, constraints, and RPC functions to reproduce a test schema.
- Do not copy production rows, credentials, auth identities, or personal data into the test project.

The ordered fixture set is preserved here for reproducibility. Production schema evolution must use separate, reviewed, forward-only migrations under `supabase/migrations/`.
