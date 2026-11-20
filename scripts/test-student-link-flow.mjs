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


const securityDraft = read("../docs/rascunho-seguranca-relatorios-instrutor-revisado.sql");

test("proteção de profiles.role bloqueia elevação pelo cliente", () => {
  const start = securityDraft.indexOf("create or replace function private.protect_profile_role()");
  const end = securityDraft.indexOf("$function$;", securityDraft.indexOf("as $function$", start));
  assert.ok(start >= 0 && end > start);
  const fn = securityDraft.slice(start, end);
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path = ''/i);
  assert.match(fn, /auth\.jwt\(\) ->> 'role'\) = 'service_role'/);
  assert.match(fn, /if tg_op = 'INSERT' then/i);
  assert.match(fn, /new\.role := 'instrutor'/);
  assert.match(fn, /new\.role is distinct from old\.role/i);
  assert.match(fn, /using errcode = '42501'/i);
  assert.match(securityDraft, /alter function private\.protect_profile_role\(\) owner to postgres/i);
  assert.match(securityDraft, /revoke all on function private\.protect_profile_role\(\)[\s\S]{0,100}from public, anon, authenticated/i);
  assert.match(securityDraft, /before insert or update of role[\s\S]{0,100}execute function private\.protect_profile_role\(\)/i);
});

test("perfis não permitem escrita direta pelo cliente no desenho revisado", () => {
  assert.match(securityDraft, /grant select on table public\.profiles to authenticated/i);
  assert.match(securityDraft, /drop policy if exists profiles_insert_own on public\.profiles/i);
  assert.match(securityDraft, /drop policy if exists profiles_update_own on public\.profiles/i);
  assert.match(securityDraft, /create policy profiles_select_own/i);
  assert.match(securityDraft, /create policy profiles_admin_select_all/i);
  assert.doesNotMatch(securityDraft, /create policy profiles_(insert|update|delete)/i);
});

test("grants excessivos são removidos sem revogar service_role", () => {
  const revokeStart = securityDraft.indexOf("revoke all privileges on table");
  const revokeEnd = securityDraft.indexOf(";", revokeStart);
  assert.ok(revokeStart >= 0 && revokeEnd > revokeStart);
  const tableRevoke = securityDraft.slice(revokeStart, revokeEnd);
  assert.match(tableRevoke, /public\.profiles/);
  assert.match(tableRevoke, /public\.students/);
  assert.match(tableRevoke, /public\.lessons/);
  assert.match(tableRevoke, /public\.vehicles/);
  assert.match(tableRevoke, /public\.app_settings/);
  assert.match(tableRevoke, /from public, anon, authenticated/i);
  assert.doesNotMatch(tableRevoke, /service_role/i);
  assert.match(securityDraft, /information_schema\.column_privileges/);
  assert.match(securityDraft, /revoke all privileges \(%I\) on table/i);
  assert.match(securityDraft, /grant select, insert, update, delete on table/i);
  assert.doesNotMatch(securityDraft, /alter default privileges/i);
});


test("Edge Function reserva gerenciamento de papéis ao admin", () => {
  assert.match(edge, /!\["admin", "instrutor", "usuario"\]\.includes\(profile\.role\)/);
  assert.match(edge, /profile\.role === "usuario" && !isStudentLinkCompletion/);
  assert.match(edge, /profile\.role === "instrutor"[\s\S]{0,300}body\.action !== "invite_student"/);
  assert.match(edge, /if \(body\.action === "change_role"\)/);
  const changeStart = edge.indexOf('if (body.action === "change_role")');
  const changeEnd = edge.indexOf('if (body.action === "delete")', changeStart);
  const changeRole = edge.slice(changeStart, changeEnd);
  assert.match(changeRole, /userId === authData\.user\.id/);
  assert.match(changeRole, /update\(\{ role: newRole, instructor_access_until: null \}\)/);
});


test("matriz de autorização cobre aluno, dois instrutores, admin e ataques cruzados", () => {
  const matrix = read("../docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md");
  for (const id of ["SEC-001","SEC-002","SEC-006","SEC-010","SEC-013","SEC-015","SEC-019","SEC-030","SEC-033","SEC-040","SEC-050","SEC-056"]) {
    assert.ok(matrix.includes(id), `Caso de segurança ausente: ${id}`);
  }
  for (const actor of ["Instrutor A","Instrutor B","Aluno A","Admin","anon"]) {
    assert.ok(matrix.includes(actor), `Identidade de teste ausente: ${actor}`);
  }
  assert.match(matrix, /não aplicar o rascunho SQL no Supabase atual/i);
  assert.match(matrix, /Se houver custo, parar/i);
});

const integrityDraft = read("../docs/rascunho-integridade-referencial-multi-instrutor.md");
const fkReview = read("../docs/revisao-integridade-fks-compostas-instrutores.md");

test("FKs compostas exigem que aluno e veículo pertençam ao mesmo instrutor", () => {
  for (const expected of [
    "unique (id, owner_id)",
    "foreign key (student_id, owner_id)",
    "references public.students (id, owner_id)",
    "foreign key (vehicle_id, owner_id)",
    "references public.vehicles (id, owner_id)",
    "foreign key (sale_id, owner_id)",
    "references public.sales (id, owner_id)",
  ]) assert.ok(securityDraft.toLowerCase().includes(expected), `FK composta ausente: ${expected}`);
});

test("ações de exclusão preservam owner_id e mantêm o cascade dos itens", () => {
  assert.match(securityDraft, /on delete set null \(student_id\)/i);
  assert.match(securityDraft, /on delete set null \(sale_id\)/i);
  assert.match(securityDraft, /foreign key \(sale_id, owner_id\)[\s\S]{0,180}on delete cascade/i);
  assert.match(securityDraft, /drop constraint lessons_student_id_fkey/i);
  assert.match(securityDraft, /drop constraint lessons_vehicle_id_fkey/i);
  assert.match(securityDraft, /drop constraint sales_student_id_fkey/i);
  assert.match(securityDraft, /drop constraint sale_items_sale_id_fkey/i);
  assert.match(securityDraft, /drop constraint financial_transactions_student_id_fkey/i);
  assert.match(securityDraft, /drop constraint financial_transactions_sale_id_fkey/i);
});

test("exceção do catálogo central e FK de app_settings permanecem documentadas", () => {
  assert.match(fkReview, /sale_items\.product_id.*catálogo central/i);
  assert.match(fkReview, /app_settings_owner_id_fkey.*auth\.users/i);
  assert.match(integrityDraft, /sale_items\.product_id.*catálogo central/i);
  assert.doesNotMatch(securityDraft, /foreign key \(product_id, owner_id\)/i);
});

test("revisão das FKs registra versão PostgreSQL e semânticas originais", () => {
  assert.match(fkReview, /PostgreSQL 17\.11/i);
  for (const expected of [
    /lessons\.student_id -> students\.id.*NO ACTION/,
    /lessons\.vehicle_id -> vehicles\.id.*NO ACTION/,
    /sales\.student_id -> students\.id.*ON DELETE SET NULL/,
    /sale_items\.sale_id -> sales\.id.*ON DELETE CASCADE/,
    /financial_transactions\.student_id -> students\.id.*ON DELETE SET NULL/,
    /financial_transactions\.sale_id -> sales\.id.*ON DELETE SET NULL/,
  ]) assert.match(fkReview, expected);
});

const readOnlyPrecheck = read("../docs/PRECHECK-READONLY-FKS-COMPOSTAS.md");

test("roteiro de pré-checagem contém apenas consultas SQL de leitura", () => {
  const blocks = [...readOnlyPrecheck.matchAll(/```sql\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  assert.ok(blocks.length >= 8, "Consultas read-only insuficientes");
  for (const sql of blocks) {
    assert.match(sql, /^select\b/i);
    assert.doesNotMatch(sql, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/im);
  }
  assert.match(readOnlyPrecheck, /Se qualquer total for maior que zero, parar/i);
  assert.match(readOnlyPrecheck, /não autoriza DDL/i);
});

const accessCatalogPrecheck = read("../docs/PRECHECK-READONLY-SEQUENCES-VIEWS-FUNCTIONS.md");

test("auditoria de sequences, views e funções usa apenas consultas read-only", () => {
  const blocks = [...accessCatalogPrecheck.matchAll(/```sql\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  assert.ok(blocks.length >= 8, "Consultas de catálogo insuficientes");
  for (const sql of blocks) {
    assert.match(sql, /^select\b/i);
    assert.doesNotMatch(sql, /^\s*(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/im);
  }
  assert.match(accessCatalogPrecheck, /has_sequence_privilege/i);
  assert.match(accessCatalogPrecheck, /has_function_privilege/i);
  assert.match(accessCatalogPrecheck, /acldefault\('f'/i);
});

test("auditoria cobre views com security_invoker, SECURITY DEFINER e triggers", () => {
  assert.match(accessCatalogPrecheck, /reloptions/i);
  assert.match(accessCatalogPrecheck, /security_invoker=true/i);
  assert.match(accessCatalogPrecheck, /prosecdef/i);
  assert.match(accessCatalogPrecheck, /pg_get_triggerdef/i);
  assert.match(accessCatalogPrecheck, /pg_default_acl/i);
  assert.match(accessCatalogPrecheck, /Não revogar permissões/i);
});



const rpcAudit = read("../docs/auditoria-postgrest-rpcs-relacoes.md");
const instructorFrontend = read("../instrutor.js");
const adminFrontend = read("../script.js");

test("inventário PostgREST documenta RPCs chamadas e bloqueia aprovação sem SQL/ACL", () => {
  for (const rpc of [
    "create_instructor_sale",
    "admin_create_sale",
    "admin_refund_sale_product",
    "admin_refund_sale_lessons",
    "admin_delete_sale"
  ]) {
    assert.ok(instructorFrontend.includes(rpc) || adminFrontend.includes(rpc), `RPC não localizada no frontend: ${rpc}`);
    assert.ok(rpcAudit.includes(rpc), `RPC não documentada na auditoria: ${rpc}`);
  }
  assert.match(rpcAudit, /definições SQL ausentes/i);
  assert.match(rpcAudit, /pendência crítica de evidência/i);
  assert.match(rpcAudit, /não comprova autorização no servidor/i);
  assert.match(rpcAudit, /SEC-063/);
  assert.match(rpcAudit, /não executar migrations/i);
});


const rpcCatalogPrecheck = read("../docs/PRECHECK-READONLY-RPCS-POSTGREST.md");

test("pré-checagem RPC/PostgREST contém somente SELECT e verifica ACL/roles", () => {
  const blocks = rpcCatalogPrecheck.split("```sql").slice(1).map(block => block.split("```")[0].trim());
  assert.ok(blocks.length >= 7, "Consultas SQL read-only insuficientes");
  for (const sql of blocks) {
    assert.match(sql, /^select/i);
    assert.doesNotMatch(sql, /^(insert|update|delete|alter|create|drop|truncate|grant|revoke)/im);
  }
  for (const item of ["pg_get_functiondef", "aclexplode", "has_function_privilege", "prosecdef", "pgrst.db_schemas", "pg_auth_members"]) {
    assert.ok(rpcCatalogPrecheck.includes(item), `Item ausente: ${item}`);
  }
  assert.match(rpcCatalogPrecheck, /Não executar RPCs financeiras como teste/i);
});


const liveRpcAudit = read("../docs/auditoria-postgrest-rpcs-relacoes.md");

test("auditoria registra evidência real das RPCs financeiras como SECURITY INVOKER", () => {
  assert.match(liveRpcAudit, /SECURITY INVOKER/);
  assert.match(liveRpcAudit, /anon/);
  assert.match(liveRpcAudit, /owner_id=v_uid/);
  assert.match(liveRpcAudit, /não foi identificada.*falha óbvia/i);
});

test("auditoria sinaliza fluxo de agenda por email e migration user_id ainda não aplicada", () => {
  assert.match(liveRpcAudit, /get_my_scheduled_lessons_internal/);
  assert.match(liveRpcAudit, /SECURITY DEFINER/);
  assert.match(liveRpcAudit, /students\.user_id/);
  assert.match(liveRpcAudit, /não aparece.*histórico/i);
  assert.match(liveRpcAudit, /nenhuma migration foi aplicada/i);
});


const agendaMigrationReview = read("../docs/revisao-migration-vinculo-agenda-user-id.md");

test("migration de vínculo impede fallback por email e restringe execução da função interna", () => {
  const internalStart = migration.indexOf("CREATE OR REPLACE FUNCTION private.get_my_scheduled_lessons_internal()");
  const internalEnd = migration.indexOf("$function$;", migration.indexOf("AS $function$", internalStart));
  assert.ok(internalStart >= 0 && internalEnd > internalStart);
  const internal = migration.slice(internalStart, internalEnd);
  assert.match(internal, /WHERE s\.user_id = current_user_id/);
  assert.doesNotMatch(internal, /current_email|lower\(btrim\(COALESCE\(s\.email/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.get_my_scheduled_lessons_internal\(\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_my_scheduled_lessons\(\) TO authenticated/);
  assert.match(agendaMigrationReview, /2 instrutores/);
  assert.match(agendaMigrationReview, /2 aulas agendadas/);
});

test("revisão documenta que a correção de user_id ainda não foi aplicada no banco", () => {
  assert.match(agendaMigrationReview, /ainda não existe/);
  assert.match(agendaMigrationReview, /Nenhuma migration foi aplicada/);
  assert.match(agendaMigrationReview, /não foi realizado teste de exploração autenticado/i);
  assert.match(rpcAudit, /condição de dados para cruzamento existe/i);
});

test("função interna de agenda mantém joins compostos com owner_id", () => {
  const internalStart = migration.indexOf("CREATE OR REPLACE FUNCTION private.get_my_scheduled_lessons_internal()");
  const internalEnd = migration.indexOf("$function$;", migration.indexOf("AS $function$", internalStart));
  const internal = migration.slice(internalStart, internalEnd);
  assert.match(internal, /l\.student_id = s\.id[\s\S]*l\.owner_id = s\.owner_id/);
  assert.match(internal, /v\.id = l\.vehicle_id[\s\S]*v\.owner_id = l\.owner_id/);
});
