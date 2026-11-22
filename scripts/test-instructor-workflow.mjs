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
const examsModule = read("../exames-alugueis.js");
const accessMigration = read("../supabase/migrations/20261121190000_remove_student_app_access.sql");
const instructorManagementMigration = read("../supabase/migrations/20261121230000_harden_instructor_sale_delete_role_check.sql");
const instructorNameMigration = read("../supabase/migrations/20261121231000_move_instructor_name_lookup_to_private_helper.sql");
const saleTrackingMigration = read("../supabase/migrations/20261121270000_fix_instructor_sale_item_lesson_tracking.sql");
const studentOwnerIndexMigration = read("../supabase/migrations/20261121280000_add_students_owner_fk_index.sql");
const adminRefundStatusMigration = read("../supabase/migrations/20261122181000_admin_refunds_require_confirmed_sales.sql");
const rentalCreditAvailabilityMigration = read("../supabase/migrations/20261122215000_student_rental_credit_availability_rpc.sql");

test("área de acessos lista somente alunos com conta vinculada", () => {
  assert.match(instructorHtml, /data-view="alunos-vinculados"/);
  assert.match(instructorHtml, /data-instructor-page="alunos-vinculados"[^>]*>[^<]*<span class="menu-icon">♧<\/span><span>Acessos<\/span>/);
  assert.match(instructorJs, /state\.students\.filter\(student => Boolean\(student\.user_id\)\)/);
  assert.match(instructorJs, /removeStudentAppAccess\(button\.dataset\.studentId\)/);
});

test("remover acesso exige instrutor autenticado e aluno da própria conta", () => {
  assert.match(accessMigration, /current_user_id := auth\.uid\(\)/);
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
  assert.match(serviceWorker, /const CACHE_NAME = "marcus-instrutor-v\\d+-exams-sales-flow"/);
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


test("módulo de exames reutiliza o cliente autenticado do ambiente atual", () => {
  assert.match(instructorJs, /window\.getMarcusSupabase\s*=\s*\(\)\s*=>\s*state\.supabase/);
  assert.match(examsModule, /client\s*=\s*getClient\(\)/);
  assert.doesNotMatch(examsModule, /createClient\(URL,KEY/);
  assert.doesNotMatch(examsModule, /ydyqagqsuqntuibzgwzd\.supabase\.co/);
});

test("histórico de exames oferece filtro por status combinado ao aluno selecionado", () => {
  assert.match(examsModule, /id="mx-status-filter"/);
  assert.match(examsModule, /value="todos"/);
  assert.match(examsModule, /value="agendado"/);
  assert.match(examsModule, /value="realizado"/);
  assert.match(examsModule, /value="cancelado"/);
  assert.match(examsModule, /selectedStatus==="todos"\|\|x\.status===selectedStatus/);
  assert.match(examsModule, /selectedStatus=e\.target\.value/);
});


test("devoluções administrativas exigem venda confirmada no banco", () => {
  const lessonsStart = adminRefundStatusMigration.indexOf("CREATE OR REPLACE FUNCTION public.admin_refund_sale_lessons");
  const productsStart = adminRefundStatusMigration.indexOf("CREATE OR REPLACE FUNCTION public.admin_refund_sale_product");
  assert.ok(lessonsStart >= 0 && productsStart > lessonsStart);
  const lessons = adminRefundStatusMigration.slice(lessonsStart, productsStart);
  const products = adminRefundStatusMigration.slice(productsStart);
  assert.match(lessons, /v_sale\.status is distinct from 'confirmada'/i);
  assert.match(products, /v_sale\.status is distinct from 'confirmada'/i);
  assert.match(products, /fixed_item_key\s*=\s*'aluguel_veiculo'/i);
  assert.match(products, /alugueis_disponiveis/i);
  assert.match(products, /app\.allow_vehicle_rental_refund/i);
  assert.match(lessons, /aulas_restantes/i);
  assert.match(lessons, /financial_transactions/i);
});

const rentalCreditMigration = read("../supabase/migrations/20261122213000_student_rental_credit_ledger.sql");
const rentalCreditIndexesMigration = read("../supabase/migrations/20261122214000_student_rental_credit_fk_indexes.sql");

test("créditos de aluguel ficam vinculados à compra e protegidos por RLS", () => {
  assert.match(rentalCreditMigration, /CREATE TABLE public\.student_rental_credits/i);
  assert.match(rentalCreditMigration, /sale_item_id uuid NOT NULL UNIQUE/i);
  assert.match(rentalCreditMigration, /FOREIGN KEY \(sale_id, owner_id\)/i);
  assert.match(rentalCreditMigration, /FOREIGN KEY \(student_id, owner_id\)/i);
  assert.match(rentalCreditMigration, /quantity_refunded \+ quantity_consumed <= quantity_purchased/i);
  assert.match(rentalCreditMigration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(rentalCreditMigration, /REVOKE ALL ON TABLE public\.student_rental_credits FROM PUBLIC, anon, authenticated/i);
  assert.match(rentalCreditMigration, /AFTER INSERT OR UPDATE OF fixed_item_key, quantidade_devolvida/i);
});

test("resultado do exame consome crédito FIFO e vincula o exame à compra", () => {
  assert.match(rentalCreditMigration, /ORDER BY created_at, id\s+LIMIT 1\s+FOR UPDATE/i);
  assert.match(rentalCreditMigration, /SET quantity_consumed = quantity_consumed \+ 1/i);
  assert.match(rentalCreditMigration, /rental_credit_id = v_credit\.id/i);
  assert.match(rentalCreditMigration, /scheduled_at > now\(\)/i);
  assert.match(rentalCreditMigration, /v_exam\.status <> 'agendado'/i);
});

test("devolução não ultrapassa os créditos não consumidos da própria compra", () => {
  assert.match(rentalCreditMigration, /quantity_purchased - quantity_refunded - quantity_consumed >= v_delta/i);
  assert.match(rentalCreditMigration, /A devolução excede os aluguéis não utilizados desta compra/i);
  assert.match(rentalCreditMigration, /Existem aluguéis ou saldos históricos/i);
});

test("ledger possui índices para suas chaves estrangeiras", () => {
  assert.match(rentalCreditIndexesMigration, /student_rental_credits_sale_owner_idx/i);
  assert.match(rentalCreditIndexesMigration, /student_rental_credits_student_owner_idx/i);
  assert.match(rentalCreditIndexesMigration, /student_practical_exams_rental_credit_owner_idx/i);
});

test("saldo de aluguel exibido é consultado por compra nas telas de administrador e instrutor", () => {
  assert.match(rentalCreditAvailabilityMigration, /get_student_rental_credit_availability/i);
  assert.match(rentalCreditAvailabilityMigration, /credit\.owner_id = v_uid/i);
  assert.match(rentalCreditAvailabilityMigration, /credit\.sale_id = p_sale_id/i);
  assert.match(rentalCreditAvailabilityMigration, /GRANT EXECUTE ON FUNCTION public\.get_student_rental_credit_availability/i);
  assert.match(instructorJs, /rpc\("get_student_rental_credit_availability"/i);
  assert.match(instructorJs, /rentalCreditAvailability\.get\(item\.id\)/i);
  assert.match(adminJs, /get_student_rental_credit_availability/i);
  assert.match(adminJs, /alugueisDisponiveisNaCompra/);
  assert.match(adminJs, /saldoCompra/);
});
