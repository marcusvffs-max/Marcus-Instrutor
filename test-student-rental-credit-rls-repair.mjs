import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./supabase/migrations/20261125110000_repair_student_rental_credit_rls_drift.sql", import.meta.url), "utf8");
assert.match(sql, /DROP POLICY IF EXISTS student_rental_credits_owner_select/);
assert.match(sql, /FOR SELECT\s+TO authenticated/);
assert.match(sql, /owner_id = \(SELECT auth\.uid\(\)\)/);
assert.match(sql, /private\.current_app_role\(\) IN \('admin', 'instrutor'\)/);
assert.match(sql, /REVOKE ALL ON TABLE public\.student_rental_credits\s+FROM PUBLIC, anon, authenticated/);
assert.match(sql, /GRANT SELECT \([\s\S]*sale_item_id[\s\S]*quantity_purchased[\s\S]*quantity_refunded[\s\S]*quantity_consumed[\s\S]*\)\s+ON TABLE public\.student_rental_credits\s+TO authenticated/);
console.log("OK: rental-credit RLS repair is owner-scoped and read-only.");
