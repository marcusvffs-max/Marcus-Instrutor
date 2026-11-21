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
const accessMigration = read("../supabase/migrations/20261121190000_remove_student_app_access.sql");
const instructorManagementMigration = read("../supabase/migrations/20261121230000_harden_instructor_sale_delete_role_check.sql");
const instructorNameMigration = read("../supabase/migrations/20261121231000_move_instructor_name_lookup_to_private_helper.sql");

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
  assert.match(serviceWorker, /marcus-instrutor-v24-linked-student-access/);
});
