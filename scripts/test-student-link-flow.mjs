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

test("FKs compostas exigem que aluno, veículo e produto pertençam ao mesmo instrutor", () => {
  for (const expected of [
    "unique (id, owner_id)",
    "foreign key (student_id, owner_id)",
    "references public.students (id, owner_id)",
    "foreign key (vehicle_id, owner_id)",
    "references public.vehicles (id, owner_id)",
    "foreign key (sale_id, owner_id)",
    "references public.sales (id, owner_id)",
    "foreign key (product_id, owner_id)",
    "references public.products (id, owner_id)",
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
  assert.match(securityDraft, /drop constraint sale_items_product_id_fkey/i);
  assert.match(securityDraft, /foreign key \(student_id, owner_id\)[\s\S]{0,160}on delete no action/i);
  assert.match(securityDraft, /foreign key \(vehicle_id, owner_id\)[\s\S]{0,160}on delete no action/i);
  assert.match(securityDraft, /drop constraint financial_transactions_student_id_fkey/i);
  assert.match(securityDraft, /drop constraint financial_transactions_sale_id_fkey/i);
});

test("produto de venda exige o mesmo owner e catálogo WhatsApp permanece separado", () => {
  assert.match(fkReview, /sale_items\.product_id.*mesmo owner/i);
  assert.match(fkReview, /catálogo consultado pelo webhook WhatsApp.*leitura separada/i);
  assert.match(fkReview, /app_settings_owner_id_fkey.*auth\.users/i);
  assert.match(integrityDraft, /sale_items\.product_id.*mesmo owner/i);
  assert.match(securityDraft, /foreign key \(product_id, owner_id\)/i);
  assert.match(securityDraft, /drop constraint sale_items_product_id_fkey/i);
});

test("revisão das FKs registra versão PostgreSQL e semânticas originais", () => {
  assert.match(fkReview, /PostgreSQL 17\.11/i);
  for (const expected of [
    /lessons\.student_id -> students\.id.*NO ACTION/,
    /lessons\.vehicle_id -> vehicles\.id.*NO ACTION/,
    /sales\.student_id -> students\.id.*ON DELETE SET NULL/,
    /sale_items\.sale_id -> sales\.id.*ON DELETE CASCADE/,
    /sale_items\.product_id -> products\.id.*ON DELETE SET NULL/,
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


test("wrapper público passa a SECURITY DEFINER para encapsular a função interna após o REVOKE", () => {
  const wrapperStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.get_my_scheduled_lessons()");
  const wrapperEnd = migration.indexOf("$function$;", migration.indexOf("AS $function$", wrapperStart));
  assert.ok(wrapperStart >= 0 && wrapperEnd > wrapperStart);
  const wrapper = migration.slice(wrapperStart, wrapperEnd);
  assert.match(wrapper, /SECURITY DEFINER/);
  assert.match(wrapper, /SET search_path TO ''/);
  assert.match(wrapper, /FROM private\.get_my_scheduled_lessons_internal\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION private\.get_my_scheduled_lessons_internal\(\) FROM PUBLIC, anon, authenticated/);
});


const securityMatrix = read("../docs/TESTE-RLS-ISOLAMENTO-INSTRUTORES.md");

test("matriz inclui testes específicos para corrigir o cruzamento de agenda por email", () => {
  for (const id of ["SEC-064","SEC-065","SEC-066","SEC-067","SEC-068","SEC-069","SEC-070"]) {
    assert.ok(securityMatrix.includes(id), `Caso específico de agenda ausente: ${id}`);
  }
});

test("fluxo de conta legada exige confirmação autenticada e update condicional", () => {
  const completionStart = edge.indexOf("if (isStudentLinkCompletion) {");
  const completionEnd = edge.indexOf('if (body.action === "list")', completionStart);
  const completion = edge.slice(completionStart, completionEnd);
  assert.match(completion, /authData\.user\.email_confirmed_at/);
  assert.match(completion, /getReservationStatus\(pendingStudent\.invited_at\) !== "active"/);
  for (const expected of [
    '.eq("id", pendingStudent.id)',
    '.eq("owner_id", pendingStudent.owner_id)',
    '.eq("invite_attempt_id", attemptId)',
    '.eq("invited_at", pendingStudent.invited_at)',
    '.eq("email", pendingStudent.email)',
    '.is("user_id", null)',
  ]) assert.ok(completion.includes(expected), `Condição do vínculo legado ausente: ${expected}`);
});

test("trigger de convite valida tentativa, cadastro, instrutor, email e janela de reserva", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION private.link_student_account_from_invite()");
  const end = migration.indexOf("$function$;", migration.indexOf("AS $function$", start));
  const trigger = migration.slice(start, end);
  for (const expected of [
    /NEW\.raw_user_meta_data/,
    /student_id_text::uuid/,
    /instructor_id_text::uuid/,
    /invite_attempt_id = attempt_id_text::uuid/,
    /invited_at > statement_timestamp\(\) - interval '15 minutes'/,
    /invited_at <= statement_timestamp\(\)/,
    /user_id IS NULL/,
    /lower\(btrim\(COALESCE\(email, ''\)\)\) = lower\(btrim\(COALESCE\(NEW\.email, ''\)\)\)/,
  ]) assert.match(trigger, expected);
});

test("consulta de agenda limpa apenas metadados temporários e mantém o vínculo user_id", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION private.get_my_scheduled_lessons_internal()");
  const end = migration.indexOf("$function$;", migration.indexOf("AS $function$", start));
  const internal = migration.slice(start, end);
  assert.match(internal, /SET invited_at = NULL,[\s\S]*invite_attempt_id = NULL/);
  assert.doesNotMatch(internal, /SET user_id = NULL/);
  assert.match(internal, /WHERE s\.user_id = current_user_id/);
});


const adminIndex = read("../index.html");

test("cache administrativo é carregado e gravado somente na chave do usuário autenticado", () => {
  assert.match(adminFrontend, /sessionStorage\?\.getItem\("marcus_admin_user_id"\)/);
  assert.match(adminFrontend, /\$\{STORAGE_KEY\}:user:\$\{usuarioId\}/);
  assert.match(adminFrontend, /let db = carregarDados\(STORAGE_KEY_ATUAL\)/);
  assert.match(adminFrontend, /localStorage\.getItem\(chave\)/);
  assert.match(adminFrontend, /localStorage\.setItem\(STORAGE_KEY_ATUAL, JSON\.stringify\(db\)\)/);
  assert.doesNotMatch(adminFrontend, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(db\)\)/);
  assert.match(adminFrontend, /STORAGE_KEY_ATUAL !== chaveEsperada/);
});

test("troca de administrador recarrega o painel antes de exibir dados da nova conta", () => {
  const start = adminIndex.indexOf("async function mostrarAplicativo(usuario)");
  const end = adminIndex.indexOf("if (!window.supabase", start);
  assert.ok(start >= 0 && end > start);
  const flow = adminIndex.slice(start, end);
  assert.match(flow, /sessionStorage\.getItem\(chaveUsuarioAtual\)/);
  assert.match(flow, /usuarioAnterior !== usuario\.id/);
  assert.match(flow, /sessionStorage\.setItem\(chaveUsuarioAtual, usuario\.id\)/);
  assert.match(flow, /window\.location\.reload\(\)/);
  assert.ok(flow.indexOf("sessionStorage.setItem") < flow.indexOf("await carregarPainelAdmin()"));
});

test("logout remove o ID do administrador antes de reinicializar o navegador", () => {
  const start = adminIndex.indexOf('if (evento === "SIGNED_OUT")');
  const end = adminIndex.indexOf("if (!sessao)", start);
  assert.ok(start >= 0 && end > start);
  const handler = adminIndex.slice(start, end);
  assert.match(handler, /sessionStorage\.removeItem\("marcus_admin_user_id"\)/);
  assert.match(handler, /window\.location\.reload\(\)/);
});

test("dados locais antigos sem proprietário são preservados, mas não carregados automaticamente", () => {
  assert.match(adminFrontend, /function avisarDadosLegadosNaoVinculados\(\)/);
  assert.match(adminFrontend, /localStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(adminFrontend, /dados locais antigos sem vínculo com uma conta/);
  assert.doesNotMatch(adminFrontend, /localStorage\.removeItem\(STORAGE_KEY\)/);
});


const whatsappWebhook = read("../supabase/functions/whatsapp-webhook/index.ts");
const whatsappPanel = read("../whatsapp-panel.js");
const whatsappSchema = read("../test-fixtures/supabase-migrations/20261121001451_restore_backend_only_whatsapp_tables.sql");
const supabaseConfig = read("../supabase/config.toml");

test("webhook WhatsApp valida o phone_number_id antes de processar mensagens", () => {
  assert.match(whatsappWebhook, /WHATSAPP_PHONE_NUMBER_ID\.trim\(\)/);
  assert.match(whatsappWebhook, /value\.metadata\?\.phone_number_id/);
  assert.match(whatsappWebhook, /eventPhoneNumberId !== expectedPhoneNumberId/);
  assert.match(whatsappWebhook, /Ignoring WhatsApp webhook event for an unconfigured phone number/);
  assert.ok(
    whatsappWebhook.indexOf("eventPhoneNumberId !== expectedPhoneNumberId") <
    whatsappWebhook.indexOf("for (const message of value.messages")
  );
});

test("webhook externo dispensa JWT Supabase, mas mantém validação HMAC no handler", () => {
  assert.match(supabaseConfig, /\[functions\.whatsapp-webhook\][\s\S]*verify_jwt = false/);
  assert.match(whatsappWebhook, /x-hub-signature-256/i);
  assert.match(whatsappWebhook, /verifyMetaSignature/);
  assert.match(whatsappWebhook, /crypto\.subtle/);
});

test("status de atendimento WhatsApp é alterado por ação exclusiva do admin", () => {
  assert.match(edge, /body\.action === "update_whatsapp_request_status"/);
  assert.match(edge, /profile\.role !== "admin"/);
  assert.match(edge, /\["pendente", "em_atendimento", "concluido", "cancelado"\]/);
  for (const expected of [
    '.eq("id", requestId)',
    '.eq("owner_id", authData.user.id)',
    '.eq("canal", "whatsapp")',
    '.eq("tipo_solicitacao", "atendimento_humano")',
  ]) assert.ok(edge.includes(expected), "Filtro ausente na atualização do atendimento: " + expected);
  assert.match(whatsappPanel, /functions\.invoke\("admin-manage-instructors"/);
  assert.match(whatsappPanel, /action: "update_whatsapp_request_status"/);
  assert.doesNotMatch(whatsappPanel, /\.from\("ai_requests"\)[\s\S]{0,120}\.update\(/);
});

test("webhook rejeita phone_number_id ausente ou divergente antes de acessar o banco", () => {
  const preflight = whatsappWebhook.indexOf("const hasMatchingPhoneNumberEvent");
  const adminClient = whatsappWebhook.indexOf("const supabase = getAdminClient()", preflight);
  const perChangeGuard = whatsappWebhook.indexOf("eventPhoneNumberId !== expectedPhoneNumberId");
  assert.ok(preflight >= 0, "Preflight do phone_number_id ausente");
  assert.ok(adminClient > preflight, "Cliente privilegiado criado antes do preflight");
  assert.ok(perChangeGuard > adminClient, "Defesa por evento individual foi removida");
  assert.match(whatsappWebhook, /Array\.isArray\(payload\.entry\)/);
  assert.match(whatsappWebhook, /configuredPhoneNumberIdPresent: Boolean\(configuredPhoneNumberId\)/);
});


const whatsappPauseMigration = read("../supabase/migrations/20261121180000_add_whatsapp_conversation_ai_pause.sql");
const whatsappCycleMigration = read("../supabase/migrations/20261122191000_close_whatsapp_cycle_when_ai_disabled.sql");

test("cliente pode encerrar e reativar a assistente com pausa de 48 horas", () => {
  assert.match(whatsappWebhook, /normalizedCustomerCommand === "encerrar"/);
  assert.match(whatsappWebhook, /ai_pause_reason: "cliente_encerramento"/);
  assert.match(whatsappWebhook, /48 \* 60 \* 60 \* 1000/);
  assert.match(whatsappWebhook, /conversationStatus === "encerrada"/);
  assert.match(whatsappWebhook, /ai_status: "paused_after_conversation_closure"/);
  assert.match(whatsappWebhook, /customer_reopened_assistant/);
  assert.match(whatsappWebhook, /digite Encerrar para finalizar e pausar a assistente por 48 horas/i);
});

test("mensagens manuais do WhatsApp Business pausam a assistente via coexistência", () => {
  assert.match(whatsappWebhook, /change\.field === "smb_message_echoes"/);
  assert.match(whatsappWebhook, /value\.message_echoes/);
  assert.match(whatsappWebhook, /source: "whatsapp_business_app_echo"/);
  assert.match(whatsappWebhook, /echoType === "edit" \|\| echoType === "revoke"/);
  assert.match(whatsappWebhook, /ai_pause_reason: "instrutor_mensagem_manual"/);
  assert.match(whatsappWebhook, /status: "encerrada"/);
});

test("painel lista conversas ativas e encerra somente como administrador", () => {
  assert.match(edge, /body\.action === "list_whatsapp_conversations"/);
  assert.match(edge, /body\.action === "close_whatsapp_conversation"/);
  assert.match(edge, /profile\.role !== "admin"/);
  assert.match(edge, /ai_pause_reason: "instrutor_encerramento"/);
  assert.match(whatsappPanel, /action: "list_whatsapp_conversations"/);
  assert.match(whatsappPanel, /action: "close_whatsapp_conversation"/);
  assert.match(whatsappPanel, /data-encerrar-conversa/);
  assert.match(whatsappPanel, /A lista de conversas será habilitada quando a atualização do serviço WhatsApp estiver disponível/);
});

test("migration registra prazo e origem da pausa sem expor tabelas WhatsApp", () => {
  assert.match(whatsappPauseMigration, /ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz/);
  assert.match(whatsappPauseMigration, /ADD COLUMN IF NOT EXISTS ai_pause_reason text/);
  assert.match(whatsappPauseMigration, /cliente_encerramento/);
  assert.match(whatsappPauseMigration, /instrutor_encerramento/);
  assert.match(whatsappPauseMigration, /instrutor_mensagem_manual/);
  assert.doesNotMatch(whatsappPauseMigration, /GRANT .*anon|GRANT .*authenticated/i);
});

test("menus WhatsApp usam saudação aprovada, Falar com Instrutor e Menu único com oito opções", () => {
  assert.match(whatsappWebhook, /Olá! 👋 Sou a Assistente Virtual do Instrutor Marcus\\./);
  assert.match(whatsappWebhook, /A qualquer momento, digite Encerrar para finalizar e pausar a assistente por 48 horas\\. Para chamá-la novamente antes desse prazo, digite Olá\\./);
  assert.match(whatsappWebhook, /title: "Falar com Instrutor"/);
  assert.match(whatsappWebhook, /title: "Menu"/);
  assert.match(whatsappWebhook, /title: "Pacotes e valores"/);
  assert.match(whatsappWebhook, /title: "Documentos e etapas"/);
  assert.match(whatsappWebhook, /title: "Taxa de inscrição"/);
  assert.match(whatsappWebhook, /title: "Exame médico"/);
  assert.match(whatsappWebhook, /title: "Curso Gratuito", description: "de Legislação — saiba como acessar\\."/);
  assert.match(whatsappWebhook, /title: "Taxa exame legislação"/);
  assert.match(whatsappWebhook, /title: "Taxa exame direção"/);
  assert.match(whatsappWebhook, /title: "Outros assuntos"/);
  assert.match(whatsappWebhook, /service_free_theory_course/);
  assert.match(whatsappWebhook, /reply_type: "free_theory_course_information"/);
  assert.doesNotMatch(whatsappWebhook, /title: "Menu do Instrutor"|title: "Menu do Detran"/);
});
test("atendimento humano só pode ser reativado pelo cliente com Olá", () => {
  const olaHandler = whatsappWebhook.indexOf('if (typeof content === "string" && /^(olá|ola)$/i.test(content.normalize');
  const humanStatusHandler = whatsappWebhook.indexOf('if (conversationStatus === "atendimento_humano")');
  const humanMenuGuard = whatsappWebhook.indexOf('Durante atendimento humano, somente "Olá" pode reativar a Assistente Virtual.');
  const menuDispatch = whatsappWebhook.indexOf("// Open the selected top-level menu.", humanMenuGuard);
  assert.ok(olaHandler >= 0 && olaHandler < humanStatusHandler, "Comando Olá deve ser processado antes do bloqueio de atendimento humano");
  assert.ok(humanMenuGuard >= 0 && humanMenuGuard < menuDispatch, "Bloqueio de Menu deve ocorrer antes do despacho dos menus");
  assert.match(whatsappWebhook.slice(humanMenuGuard, menuDispatch), /menuChoice === "menu_main" \|\| menuChoice === "menu_second"/);
  assert.match(whatsappWebhook.slice(humanMenuGuard, menuDispatch), /ai_status: "paused_for_human"/);
  assert.match(whatsappWebhook.slice(olaHandler, humanStatusHandler), /ai_paused_until: null, ai_pause_reason: null/);
});
test("concluir ou cancelar atendimento humano encerra a conversa e inicia pausa de 48 horas", () => {
  const statusHandler = edge.slice(edge.indexOf('if (body.action === "update_whatsapp_request_status")'));
  assert.match(statusHandler, /\.select\("id, resultado"\)/);
  assert.match(statusHandler, /\["concluido", "cancelado"\]\.includes\(nextStatus\)/);
  assert.match(statusHandler, /requestToUpdate\.resultado\?\.conversation_id/);
  assert.match(statusHandler, /status: "encerrada"/);
  assert.match(statusHandler, /ai_pause_reason: "instrutor_encerramento"/);
  assert.match(statusHandler, /48 \* 60 \* 60 \* 1000/);
  assert.match(statusHandler, /\.eq\("status", "atendimento_humano"\)/);
  assert.match(statusHandler, /if \(!closedHumanConversation\) conversationPauseUntil = null/);
  assert.match(statusHandler, /\.update\(\{ atendimento_status: nextStatus \}\)/);
});
test("reabrir atendimento restaura somente conversas encerradas pelo instrutor", () => {
  const statusHandler = edge.slice(edge.indexOf('if (body.action === "update_whatsapp_request_status")'));
  assert.match(statusHandler, /\["pendente", "em_atendimento"\]\.includes\(nextStatus\)/);
  assert.match(statusHandler, /status: "atendimento_humano"/);
  assert.match(statusHandler, /ai_paused_until: null/);
  assert.match(statusHandler, /ai_pause_reason: null/);
  assert.match(statusHandler, /\.eq\("status", "encerrada"\)/);
  assert.match(statusHandler, /\.eq\("ai_pause_reason", "instrutor_encerramento"\)/);
  assert.match(statusHandler, /conversation_human_reopened: conversationHumanReopened/);
});
test("encerrar conversa não altera pedidos já concluídos ou cancelados", () => {
  const closeHandler = edge.slice(edge.indexOf('if (body.action === "close_whatsapp_conversation")'), edge.indexOf('if (body.action === "update_whatsapp_request_status")'));
  assert.match(closeHandler, /\.update\(\{ atendimento_status: "concluido" \}\)/);
  assert.match(closeHandler, /\.in\("atendimento_status", \["pendente", "em_atendimento"\]\)/);
  assert.match(closeHandler, /\.filter\("resultado->>conversation_id", "eq", conversationId\)/);
});
test("webhook não processa duas vezes a mesma mensagem recebida ou eco enviado", () => {
  assert.match(whatsappSchema, /provider_message_id text UNIQUE/);
  assert.match(whatsappWebhook, /provider_message_id: providerId/);
  assert.match(whatsappWebhook, /if \(messageError\?\.code === "23505"\)/);
  assert.match(whatsappWebhook, /duplicates\+\+/);
  assert.match(whatsappWebhook, /provider_message_id: echoId/);
  assert.match(whatsappWebhook, /if \(echoInsertError\?\.code === "23505"\) continue/);
});

test("cada telefone possui uma única conversa por proprietário", () => {
  assert.match(whatsappSchema, /CONSTRAINT whatsapp_conversations_owner_id_telefone_key UNIQUE\(owner_id,telefone\)/);
});

test("lista de conversas inclui encerradas para permitir consulta do histórico", () => {
  const conversationsHandler = edge.slice(edge.indexOf('if (body.action === "list_whatsapp_conversations")'), edge.indexOf('if (body.action === "list_whatsapp_messages")'));
  assert.match(conversationsHandler, /\.eq\("owner_id", authData\.user\.id\)/);
  assert.match(conversationsHandler, /\.limit\(50\)/);
  assert.doesNotMatch(conversationsHandler, /\.neq\("status", "encerrada"\)/);
  assert.match(whatsappPanel, /const encerrada = conversa\.status === "encerrada"/);
  assert.match(whatsappPanel, /\$\{encerrada \? "" :/);
});

test("histórico de mensagens exige administrador e valida propriedade da conversa", () => {
  const historyHandler = edge.slice(edge.indexOf('if (body.action === "list_whatsapp_messages")'), edge.indexOf('if (body.action === "close_whatsapp_conversation")'));
  assert.match(historyHandler, /profile\.role !== "admin"/);
  assert.match(historyHandler, /\.eq\("id", conversationId\)/);
  assert.match(historyHandler, /\.eq\("owner_id", authData\.user\.id\)/);
  assert.match(historyHandler, /\.from\("whatsapp_messages"\)/);
  assert.match(historyHandler, /\.range\(offset, offset \+ 99\)/);
  assert.match(historyHandler, /next_offset: offset \+ \(messages \?\? \[\]\)\.length/);
  assert.match(historyHandler, /\.reverse\(\)/);
  assert.doesNotMatch(historyHandler, /provider_message_id|metadados/);
});

test("painel permite abrir e atualizar a transcrição sem inserir conteúdo como HTML", () => {
  assert.match(whatsappPanel, /data-ver-mensagens=/);
  assert.match(whatsappPanel, /action: "list_whatsapp_messages"/);
  assert.match(whatsappPanel, /mensagens\.map\(renderizarMensagemWhatsapp\)/);
  assert.match(whatsappPanel, /escaparHtml\(mensagem\.conteudo\)/);
  assert.match(whatsappPanel, /whatsapp-transcript/);
});

test("ciclos do WhatsApp selecionam o registro mais recente e criam novo ciclo na saudação", () => {
  assert.match(whatsappWebhook, /\.eq\("telefone", phone\)[\s\S]{0,180}\.order\("created_at", \{ ascending: false \}\)[\s\S]{0,80}\.limit\(1\)/);
  assert.match(whatsappWebhook, /if \(conversation && reactivationGreeting[\s\S]{0,180}\["atendimento_humano", "encerrada"\]/);
  assert.match(whatsappWebhook, /New WhatsApp conversation cycle creation failed/);
  assert.match(whatsappWebhook, /\.not\("status", "in", '\("atendimento_humano","encerrada"\)'\)/);
});

test("motivo de pausa por solicitação de atendimento humano é aceito pelo banco", () => {
  assert.match(whatsappWebhook, /ai_pause_reason: "cliente_solicitou_atendimento_humano"/);
  assert.match(whatsappCycleMigration, /'cliente_solicitou_atendimento_humano'/);
});
