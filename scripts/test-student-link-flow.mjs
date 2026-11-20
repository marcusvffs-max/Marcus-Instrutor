import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/admin-manage-instructors/index.ts");
const migration = read("../supabase/migrations/20261121120000_student_account_link.sql");
const rules = read("../supabase/functions/_shared/student-link-rules.mjs");
const claim = read("../claim-student.html");
const docs = read("../docs/TESTE-CONVITE-VINCULO-ALUNO.md");

test("reserva usa timestamp capturado sem referência fora do escopo", () => {
  assert.match(edge, /let studentInvitePreviousInvitedAt: string \| null = null;/);
  assert.match(edge, /studentInvitePreviousInvitedAt = student\.invited_at \?\? null;/);
  const reservation = edge.slice(
    edge.indexOf("if (isStudentInvite && studentInviteId && !studentRecoveryUserId)"),
    edge.indexOf("const { data: linkData")
  );
  assert.match(reservation, /\.eq\("invited_at", studentInvitePreviousInvitedAt\)/);
  assert.doesNotMatch(reservation, /student\.invited_at/);
});

test("reserva expirada só é limpa se o timestamp ainda for o mesmo", () => {
  const reservation = edge.slice(
    edge.indexOf("if (isStudentInvite && studentInviteId && !studentRecoveryUserId)"),
    edge.indexOf("const { data: linkData")
  );
  assert.match(reservation, /\.is\("user_id", null\)/);
  assert.match(reservation, /\.eq\("invited_at", studentInvitePreviousInvitedAt\)/);
  assert.match(reservation, /\.is\("invited_at", null\)/);
});

test("confirmação exige sessão com e-mail confirmado e perfil de aluno", () => {
  assert.match(edge, /!authData\.user\.email_confirmed_at/);
  assert.match(edge, /authData\.user\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(edge, /currentStudentProfile\.role !== "usuario"/);
});

test("confirmação e reenvio usam a regra compartilhada de validade de 15 minutos", () => {
  assert.match(edge, /getReservationStatus\(pendingStudent\.invited_at\) !== "active"/);
  assert.match(edge, /getReservationStatus\(student\.invited_at\) === "active"/);
  assert.match(rules, /age < 0/);
  assert.match(rules, /age >= STUDENT_LINK_RESERVATION_TTL_MS/);
  assert.match(rules, /return "invalid"/);
});

test("gravação do vínculo é condicional ao cadastro, instrutor, tentativa e e-mail", () => {
  const updateStart = edge.indexOf(".update({ user_id: authData.user.id, invited_at: null })");
  const updateEnd = edge.indexOf(".maybeSingle();", updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const update = edge.slice(updateStart, updateEnd);
  for (const expected of [
    '.eq("id", pendingStudent.id)',
    '.eq("owner_id", pendingStudent.owner_id)',
    '.eq("invite_attempt_id", attemptId)',
    '.eq("invited_at", pendingStudent.invited_at)',
    '.eq("email", pendingStudent.email)',
    '.is("user_id", null)',
  ]) assert.ok(update.includes(expected), `Faltou condição atômica: ${expected}`);
});

test("repetição idempotente só reconhece a mesma conta autenticada", () => {
  assert.match(edge, /\.eq\("invite_attempt_id", attemptId\)[\s\S]{0,100}\.eq\("user_id", authData\.user\.id\)/);
  assert.match(edge, /O vínculo já foi concluído por outra conta ou a solicitação expirou/);
});

test("consulta inicial do aluno limpa o token temporário", () => {
  assert.match(migration, /SET invited_at = NULL,[\s\S]*invite_attempt_id = NULL/);
  assert.match(migration, /AND \(invited_at IS NOT NULL OR invite_attempt_id IS NOT NULL\)/);
});

test("fluxo de conta antiga não altera perfil antes do clique do titular", () => {
  const start = edge.indexOf("if (studentLegacyLinkUserId) {", edge.indexOf("let profileReady = false;"));
  const end = edge.indexOf("} else {", start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(edge.slice(start, end), /\.update\(/);
  assert.match(edge.slice(start, end), /\.eq\("role", "usuario"\)/);
});

test("página de confirmação exige sessão e chama a ação autenticada", () => {
  assert.match(claim, /client\.auth\.getSession\(\)/);
  assert.match(claim, /action: "complete_student_link"/);
  assert.match(claim, /window\.location\.replace\("usuario\.html"\)/);
});

test("trigger SQL rejeita reservas vencidas e timestamps futuros", () => {
  const triggerStart = migration.indexOf("CREATE OR REPLACE FUNCTION private.link_student_account_from_invite()");
  const triggerEnd = migration.indexOf("$function$;", migration.indexOf("AS $function$", triggerStart));
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  const trigger = migration.slice(triggerStart, triggerEnd);
  assert.match(trigger, /invited_at > statement_timestamp\(\) - interval '15 minutes'/);
  assert.match(trigger, /invited_at <= statement_timestamp\(\)/);
  assert.match(trigger, /invite_attempt_id = attempt_id_text::uuid/);
  assert.match(trigger, /user_id IS NULL/);
});

test("janela de validade do trigger corresponde ao limite exclusivo da aplicação", () => {
  assert.match(rules, /age >= STUDENT_LINK_RESERVATION_TTL_MS/);
  assert.match(migration, /invited_at > statement_timestamp\(\) - interval '15 minutes'/);
  assert.match(migration, /invited_at <= statement_timestamp\(\)/);
});

test("migration não associa conta antiga somente por e-mail", () => {
  assert.doesNotMatch(migration, /matched_student_id|current_email/);
  assert.match(migration, /CONTA_SEM_VINCULO/);
});

test("plano documenta concorrência, expiração e resposta perdida", () => {
  for (const id of ["INV-23", "INV-24", "INV-25", "INV-27", "INV-30", "INV-31"]) {
    assert.ok(docs.includes(id), `Cenário ausente: ${id}`);
  }
});


test("schema private é criado antes das funções e não permite criação por clientes", () => {
  const accessMigration = read("../supabase/migrations/20261121090000_instructor_access_expiration.sql");
  assert.match(accessMigration, /CREATE SCHEMA IF NOT EXISTS private/);
  assert.match(accessMigration, /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated/);
  assert.match(accessMigration, /GRANT USAGE ON SCHEMA private TO authenticated/);
  assert.match(accessMigration, /ALTER FUNCTION private\.current_app_role\(\) OWNER TO postgres/);
  assert.match(accessMigration, /REVOKE ALL ON FUNCTION private\.current_app_role\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(accessMigration, /GRANT EXECUTE ON FUNCTION private\.current_app_role\(\) TO authenticated/);
});

test("funções SECURITY DEFINER do vínculo têm owner explícito e execução restrita", () => {
  for (const signature of [
    "private.get_my_scheduled_lessons_internal()",
    "private.clear_student_account_link_on_user_delete()",
    "public.get_my_scheduled_lessons()",
    "private.link_student_account_from_invite()",
  ]) assert.ok(migration.includes(`ALTER FUNCTION ${signature} OWNER TO postgres;`), `Owner não fixado: ${signature}`);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_my_scheduled_lessons\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_my_scheduled_lessons\(\) TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.get_my_scheduled_lessons_internal\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.link_student_account_from_invite\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.clear_student_account_link_on_user_delete\(\) FROM PUBLIC, anon, authenticated/);
});
