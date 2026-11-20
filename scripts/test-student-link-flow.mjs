import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const edge = read("../supabase/functions/admin-manage-instructors/index.ts");
const migration = read("../supabase/migrations/20261121120000_student_account_link.sql");
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

test("confirmação rejeita reserva futura e reserva com mais de 15 minutos", () => {
  assert.match(edge, /reservationAge < 0/);
  assert.match(edge, /reservationAge >= 15 \* 60 \* 1000/);
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

test("migration não associa conta antiga somente por e-mail", () => {
  assert.doesNotMatch(migration, /matched_student_id|current_email/);
  assert.match(migration, /CONTA_SEM_VINCULO/);
});

test("plano documenta concorrência, expiração e resposta perdida", () => {
  for (const id of ["INV-23", "INV-24", "INV-25", "INV-27", "INV-30", "INV-31"]) {
    assert.ok(docs.includes(id), `Cenário ausente: ${id}`);
  }
});
