import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const instructorHtml = read("../instrutor.html");
const instructorJs = read("../instrutor.js");
const studentHtml = read("../usuario.html");
const studentJs = read("../usuario.js");
const adminJs = read("../script.js");
const serviceWorker = read("../service-worker.js");
const supabaseConfigSource = read("../supabase-config.js");
const adminManagementFunction = read("../supabase/functions/admin-manage-instructors/index.ts");
const indexHtml = read("../index.html");
const accessMigration = read("../supabase/migrations/20261121190000_remove_student_app_access.sql");
const instructorManagementMigration = read("../supabase/migrations/20261121230000_harden_instructor_sale_delete_role_check.sql");
const instructorNameMigration = read("../supabase/migrations/20261121231000_move_instructor_name_lookup_to_private_helper.sql");
const saleTrackingMigration = read("../supabase/migrations/20261121270000_fix_instructor_sale_item_lesson_tracking.sql");
const studentOwnerIndexMigration = read("../supabase/migrations/20261121280000_add_students_owner_fk_index.sql");
const consolidatedOwnerPoliciesMigration = read("../supabase/migrations/20261122003833_consolidate_owner_policies_financial_tables.sql");
const lessonScheduleMigration = read("../supabase/migrations/20261122011223_prevent_duplicate_active_lesson_slots.sql");
const instructorSource = read("../instrutor.js");
const adminSource = read("../script.js");
const indexHtmlSource = read("../index.html");

test("área de acessos lista somente alunos com conta vinculada", () => {
  assert.match(instructorHtml, /data-view="alunos-vinculados"/);
  assert.match(instructorHtml, /data-instructor-page="alunos-vinculados"[^>]*>[^<]*<span class="menu-icon">♧<\/span><span>Acessos<\/span>/);
  assert.match(instructorJs, /state\.students\.filter\(student => Boolean\(student\.user_id\)\)/);
  assert.match(instructorJs, /removeStudentAppAccess\(button\.dataset\.studentId\)/);
});

test("remover acesso exige instrutor autenticado e aluno da própria conta", () => {
  assert.match(accessMigration, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(accessMigration, /p\.role = 'instrutor'/);
  assert.match(accessMigration, /s\.id = p_student_id[\s\S]*s\.owner_id = current_user_id/);
  assert.match(accessMigration, /DELETE FROM auth\.users/);
  assert.doesNotMatch(accessMigration, /DELETE FROM public\.students/i);
});

test("confirmações são texto simples e não transformam conteúdo em links", () => {
  const start = instructorJs.indexOf("function confirmAction(message)");
  const end = instructorJs.indexOf("function localToday()", start);
  assert.ok(start >= 0 && end > start);
  const dialog = instructorJs.slice(start, end);
  assert.match(dialog, /text\.textContent = String\(message/);
  assert.doesNotMatch(dialog, /innerHTML/);
});

test("perfil do instrutor salva nome e cores somente na conta autenticada", () => {
  assert.match(instructorJs, /\.from\("profiles"\)[\s\S]{0,100}\.update\(\{ nome: name \}\)[\s\S]{0,80}\.eq\("id", state\.user\.id\)/);
  assert.match(instructorJs, /owner_id: state\.user\.id/);
  assert.match(instructorJs, /\.eq\("owner_id", state\.user\.id\)/);
  assert.match(instructorHtml, /id="corPrincipalInstrutor"/);
  assert.match(instructorHtml, /id="corSecundariaInstrutor"/);
});

test("agendamento em lote valida conflitos e grava aulas na conta do instrutor", () => {
  assert.match(instructorHtml, /id="formAulasLote"/);
  assert.match(instructorJs, /function generateBatchLessonRows\(\)/);
  const start = instructorJs.indexOf("async function saveBatchLessons(event)");
  const end = instructorJs.indexOf("async function", start + 20);
  assert.ok(start >= 0 && end > start);
  const batch = instructorJs.slice(start, end);
  assert.match(batch, /const keys = new Set\(\)/);
  assert.match(batch, /já existe uma aula agendada nesse dia e horário/);
  assert.match(batch, /owner_id: state\.user\.id/);
  assert.match(batch, /\.from\("lessons"\)\.insert\(lessons\)/);
});

test("exclusão de venda valida propriedade, papel e aulas já utilizadas", () => {
  assert.match(instructorJs, /rpc\("delete_my_sale", \{ p_sale_id: id \}\)/);
  assert.match(instructorManagementMigration, /v_role is distinct from 'admin' and v_role is distinct from 'instrutor'/);
  assert.match(instructorManagementMigration, /where id = p_sale_id and owner_id = v_uid for update/);
  assert.match(instructorManagementMigration, /if coalesce\(v_student\.aulas_restantes, 0\) < v_net_lessons then/);
  assert.match(instructorManagementMigration, /delete from public\.financial_transactions where sale_id = p_sale_id and owner_id = v_uid/);
  assert.match(instructorManagementMigration, /delete from public\.sales where id = p_sale_id and owner_id = v_uid/);
});

test("exclusão de despesa só alcança saída avulsa da própria conta", () => {
  const start = instructorJs.indexOf("async function deleteInstructorExpense(id)");
  const end = instructorJs.indexOf("function updateInstructorContractStudentSelect()", start);
  assert.ok(start >= 0 && end > start);
  const deletion = instructorJs.slice(start, end);
  assert.match(deletion, /\.from\("financial_transactions"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("id", id\)[\s\S]*\.eq\("owner_id", state\.user\.id\)[\s\S]*\.eq\("tipo", "saida"\)[\s\S]*\.is\("sale_id", null\)/);
});

test("aluno consulta o nome do instrutor pela RPC protegida", () => {
  assert.match(studentHtml, /id="nomeInstrutorResponsavel"/);
  assert.match(studentJs, /rpc\("get_my_instructor_name"\)/);
  assert.match(instructorNameMigration, /v_role is distinct from 'usuario'/);
  assert.match(instructorNameMigration, /join public\.profiles p on p\.id = s\.owner_id/);
  assert.match(instructorNameMigration, /where s\.user_id = v_uid/);
});

test("painel administrativo limita alunos ao owner_id da sessão administrativa", () => {
  assert.match(adminJs, /\.from\("students"\)[\s\S]{0,180}\.eq\("owner_id", adminSupabaseUserId\)/);
});

test("service worker usa a mesma versão de instrutor.js declarada no HTML", () => {
  const htmlVersion = instructorHtml.match(/src="instrutor\.js\?v=([^"]+)"/)?.[1];
  const cachedVersion = serviceWorker.match(/"\.\/instrutor\.js\?v=([^"]+)"/)?.[1];
  assert.ok(htmlVersion);
  assert.equal(cachedVersion, htmlVersion);
  assert.match(serviceWorker, /marcus-instrutor-v25-supabase-env-isolation/);
});


test("venda do instrutor grava aulas contratadas e valor líquido por aula", () => {
  assert.match(saleTrackingMigration, /private\.current_app_role\(\) is distinct from 'instrutor'/i);
  assert.match(saleTrackingMigration, /p\.owner_id = v_owner_id/i);
  assert.match(saleTrackingMigration, /aulas_contratadas/i);
  assert.match(saleTrackingMigration, /valor_por_aula/i);
  assert.match(saleTrackingMigration, /valor_liquido/i);
  assert.match(saleTrackingMigration, /round\(v_subtotal \/ v_item_lessons, 2\)/i);
  assert.match(saleTrackingMigration, /insert into public\.financial_transactions/i);
  assert.match(saleTrackingMigration, /aulas_compradas = coalesce\(aulas_compradas, 0\) \+ v_lessons/i);
  assert.match(saleTrackingMigration, /aulas_restantes = coalesce\(aulas_restantes, 0\) \+ v_lessons/i);
  assert.match(saleTrackingMigration, /where id = p_student_id and owner_id = v_owner_id/i);
});

test("índice da FK students.owner_id é versionado em migration própria", () => {
  assert.match(studentOwnerIndexMigration, /create index if not exists students_owner_id_idx/i);
  assert.match(studentOwnerIndexMigration, /on public\.students\s*\(owner_id\)/i);
});


test("configuração Supabase separa produção, Preview e hosts desconhecidos", () => {
  const resolveConfig = new Function("window", "console", supabaseConfigSource + "; return window.MARCUS_SUPABASE_CONFIG;");
  const production = resolveConfig({ location: { hostname: "marcusinstrutor.vercel.app" } }, { info() {}, error() {} });
  const preview = resolveConfig({ location: { hostname: "marcusinstrutor-git-fix-preview-supabase-isolation-abc123-marcusvffs-2839.vercel.app" } }, { info() {}, error() {} });
  const deploymentPreview = resolveConfig({ location: { hostname: "marcusinstrutor-ufbrcpul1-marcusvffs-2839.vercel.app" } }, { info() {}, error() {} });
  const unknown = resolveConfig({ location: { hostname: "localhost" } }, { info() {}, error() {} });
  assert.equal(production.environment, "production");
  assert.match(production.url, /ydyqagqsuqntuibzgwzd/);
  assert.equal(preview.environment, "preview");
  assert.match(preview.url, /voyjssflroiwdyaacthh/);
  assert.equal(deploymentPreview.environment, "preview");
  assert.equal(unknown, null);
});

test("callbacks de recuperação usam a origem atual, sem Preview antigo fixo", () => {
  assert.ok(indexHtml.includes('redirectTo: window.location.origin + "/"'));
  assert.doesNotMatch(indexHtml, /feature-relatorios-i-bc78ff/);
});

test("Edge Function aceita somente produção e hosts Preview do projeto", () => {
  const patternStart = adminManagementFunction.indexOf("const PREVIEW_ORIGIN_PATTERN = ");
  const patternEnd = adminManagementFunction.indexOf(";", patternStart);
  assert.ok(patternStart >= 0 && patternEnd > patternStart);
  const patternSource = adminManagementFunction.slice(patternStart, patternEnd).split(" = ")[1];
  const previewOriginPattern = new Function("return " + patternSource)();
  assert.ok(previewOriginPattern.test("https://marcusinstrutor-ufbrcpul1-marcusvffs-2839.vercel.app"));
  assert.ok(previewOriginPattern.test("https://marcusinstrutor-git-fix-preview-supabase-isolation-abc123-marcusvffs-2839.vercel.app"));
  assert.equal(previewOriginPattern.test("https://evil.example.com"), false);
  assert.ok(adminManagementFunction.includes("function isAllowedOrigin(origin: string | null)"));
  assert.ok(adminManagementFunction.includes("if (origin && !isAllowedOrigin(origin))"));
  assert.doesNotMatch(adminManagementFunction, /feature-relatorios-i-bc78ff/);
});

test("configuração Supabase carrega antes dos scripts de área", () => {
  assert.ok(instructorHtml.indexOf("supabase-config.js") < instructorHtml.indexOf("instrutor.js"));
  assert.ok(studentHtml.indexOf("supabase-config.js") < studentHtml.indexOf("usuario.js"));
  assert.ok(indexHtml.indexOf("supabase-config.js") < indexHtml.indexOf("createClient"));
});


test("políticas financeiras consolidadas mantêm isolamento por proprietário", () => {
  const migration = consolidatedOwnerPoliciesMigration;
  for (const table of ["products", "sales", "sale_items", "financial_transactions"]) {
    assert.ok(migration.includes("CREATE POLICY " + table + "_owner_access"));
    assert.ok(migration.includes("ON public." + table));
  }
  assert.ok(migration.includes("owner_id = (SELECT auth.uid())"));
  assert.ok(migration.includes("private.current_app_role() IN ('admin', 'instrutor')"));
  assert.ok(migration.includes("s.owner_id = (SELECT auth.uid())"));
  assert.ok(migration.includes("p.owner_id = (SELECT auth.uid())"));
  assert.ok(migration.includes("DROP POLICY IF EXISTS products_admin_"));
  assert.ok(migration.includes("DROP POLICY IF EXISTS sales_instructor_manage_own"));
});


test("agenda impede reservas duplicadas no mesmo horário também no banco", () => {
  assert.ok(lessonScheduleMigration.includes("CREATE UNIQUE INDEX IF NOT EXISTS lessons_owner_active_schedule_uidx"));
  assert.ok(lessonScheduleMigration.includes("ON public.lessons (owner_id, data_aula, horario)"));
  assert.ok(lessonScheduleMigration.includes("WHERE lower(coalesce(status, '')) <> 'cancelada'"));
  assert.ok(instructorSource.includes('error?.code === "23505"'));
  assert.ok(instructorSource.includes("Já existe uma aula reservada nesse dia e horário"));
  assert.ok(instructorSource.includes("Um dos horários já foi reservado"));
});

test("painel administrativo trata conflito de horário sem erro genérico", () => {
  assert.ok(adminSource.includes('erro?.code==="23505"'));
  assert.ok(adminSource.includes("Já existe uma aula reservada para este instrutor"));
  assert.ok(adminSource.includes("Um dos horários já foi reservado para este instrutor"));
  assert.ok(indexHtmlSource.includes("script.js?v=relatorios-instrutor9-schedule-guard"));
});
