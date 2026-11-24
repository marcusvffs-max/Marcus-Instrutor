import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const adminHtml = read("../index.html");
const adminJs = read("../parceiros-admin.js");
const partnerHtml = read("../parceiro.html");
const partnerJs = read("../parceiro.js");
const studentJs = read("../script.js");
const serviceWorker = read("../service-worker.js");
const adminEdge = read("../supabase/functions/admin-manage-partners/index.ts");
const partnerEdge = read("../supabase/functions/partner-portal/index.ts");
const supabaseConfig = read("../supabase/config.toml");

test("login encaminha perfil parceiro para a área exclusiva", () => {
  assert.match(adminHtml, /perfil\.role === "parceiro"[\s\S]{0,100}parceiro\.html/);
});

test("painel admin carrega gestão de parceiros somente após autenticação", () => {
  assert.match(adminHtml, /await carregarScript\("parceiros-admin\.js\?v=partner-admin-3"\)/);
  assert.match(adminHtml, /id="page-parceiros"/);
  assert.match(adminHtml, /data-page="parceiros"/);
});

test("admin usa Edge Function para convidar, aprovar, comunicar e pagar parceiros", () => {
  assert.match(adminJs, /functions\.invoke\("admin-manage-partners"/);
  assert.match(adminJs, /if \(initialized \|\| initializing\) return/);
  for (const action of ["list", "invite", "update_status", "update_commission", "update_pix_key", "send_message", "record_payout"]) {
    assert.ok(adminJs.includes('"' + action + '"') || adminJs.includes("invoke(\"" + action + "\""), "Ação ausente: " + action);
  }
});

test("cadastro administrativo do aluno permite associar parceiro", () => {
  assert.match(studentJs, /name="partner_id" id="alunoParceiro"/);
  assert.match(studentJs, /from\("partners"\)\.select\("id,nome,status"\)/);
  assert.match(studentJs, /payload\.partner_id = String\(dados\.partner_id \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(studentJs, /partner_id: salvo\.partner_id \|\| null/);
  assert.match(studentJs, /dataset\.partnerColumnAvailable === "true"/);
  assert.equal((studentJs.match(/partner_id: a\.partner_id \|\| null/g) || []).length, 2);
});

test("portal do parceiro consulta somente as ações autenticadas do endpoint próprio", () => {
  assert.match(partnerHtml, /parceiro\.js\?v=partner-portal-5/);
  assert.match(partnerJs, /functions\.invoke\("partner-portal"/);
  for (const action of ["overview", "confirm_receipt", "mark_read"]) {
    assert.ok(partnerJs.includes('"' + action + '"'), "Ação ausente: " + action);
  }
  assert.match(partnerJs, /profile\?\.role !== "parceiro"/);
});

test("service worker mantém portal disponível e não compartilha script administrativo", () => {
  assert.match(serviceWorker, /marcus-instrutor-v37-partner-module/);
  assert.match(serviceWorker, /"\.\/parceiro\.html"/);
  assert.match(serviceWorker, /"\.\/parceiro\.js\?v=partner-portal-3"/);
  assert.match(serviceWorker, /"\/parceiros-admin\.js"/);
});

test("Edge Function administrativa valida sessão e papel de administrador", () => {
  assert.match(adminEdge, /authClient\.auth\.getUser\(token\)/);
  assert.match(adminEdge, /profile\?\.role !== "admin"/);
  assert.match(adminEdge, /owner_id: ownerId/);
  assert.match(adminEdge, /requestOrigin === "https:\/\/marcusinstrutor-git-feature-relatorios-i-bc78ff-marcusvffs-2839\.vercel\.app"/);
});

test("portal Edge Function valida o parceiro vinculado e aprovado", () => {
  assert.match(partnerEdge, /authClient\.auth\.getUser\(token\)/);
  assert.match(partnerEdge, /profile\?\.role !== "parceiro"/);
  assert.match(partnerEdge, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(partnerEdge, /partner\.status !== "aprovado"/);
  assert.match(partnerEdge, /\.eq\("partner_id", partner\.id\)/);
});

test("as duas Edge Functions exigem JWT no config do Supabase", () => {
  assert.match(supabaseConfig, /\[functions\.admin-manage-partners\]\s+verify_jwt = true/);
  assert.match(supabaseConfig, /\[functions\.partner-portal\]\s+verify_jwt = true/);
});

const partnerSchemaMigration = read("../supabase/migrations/20261124045002_partner_module_schema_and_commissions.sql");
const partnerIndexesMigration = read("../supabase/migrations/20261124045125_partner_referral_fk_indexes.sql");

test("PIX é controlado pelo administrador e somente leitura no portal", () => {
  assert.match(adminJs, /update_pix_key/);
  assert.match(adminEdge, /body\.action === "update_pix_key"/);
  assert.match(partnerHtml, /id="partnerPixKey"[^>]*readonly/);
  assert.doesNotMatch(partnerJs, /update_pix_key/);
  assert.doesNotMatch(partnerEdge, /body\.action === "update_pix_key"/);
});

test("parceiro confirma recebimento sem alterar o registro do pagamento", () => {
  assert.match(partnerJs, /confirm_receipt/);
  assert.match(partnerEdge, /body\.action === "confirm_receipt"/);
  assert.match(partnerEdge, /\.eq\("partner_id", partner\.id\)[\s\S]*\.is\("received_at", null\)/);
  assert.match(partnerEdge, /received_at: new Date\(\)\.toISOString\(\)/);
});

test("comissão é gerada apenas para serviços e só fica disponível após aulas concluídas", () => {
  assert.match(partnerSchemaMigration, /coalesce\(NEW\.tipo_item,'servico'\) <> 'servico'/);
  assert.match(partnerSchemaMigration, /NEW\.fixed_item_key IS NOT NULL/);
  assert.match(partnerSchemaMigration, /v_completed >= v_required/);
  assert.match(partnerSchemaMigration, /partner_commission_lessons/);
  assert.match(partnerSchemaMigration, /status = 'pago'/);
  assert.match(partnerSchemaMigration, /Não é possível devolver aulas: a comissão deste pacote já foi paga/);
});

test("pagamento registra PIX em snapshot e associa a comissão ao pagamento", () => {
  assert.match(partnerSchemaMigration, /pix_key_snapshot/);
  assert.match(partnerSchemaMigration, /SET status = 'pago', payout_id = v_payout_id, paid_at = now\(\)/);
  assert.match(partnerSchemaMigration, /GRANT EXECUTE ON FUNCTION public\.record_partner_payout\(uuid,uuid,uuid\[\],text,text\) TO service_role/);
});

test("índices cobrem as relações de alunos, orçamentos e itens de orçamento", () => {
  assert.match(partnerIndexesMigration, /partner_students_partner_owner_fk_idx/);
  assert.match(partnerIndexesMigration, /partner_quotes_student_owner_fk_idx/);
  assert.match(partnerIndexesMigration, /partner_quote_items_quote_owner_fk_idx/);
  assert.match(partnerIndexesMigration, /partner_quote_items_product_id_idx/);
});

const partnerProgressPolicyMigration = read("../supabase/migrations/20261124045622_restrict_partner_commission_progress_read.sql");

test("parceiro cadastra indicação e envia orçamento usando catálogo do administrador", () => {
  assert.match(partnerHtml, /id="partnerStudentForm"/);
  assert.match(partnerHtml, /id="partnerQuoteForm"/);
  assert.match(partnerJs, /create_student/);
  assert.match(partnerJs, /create_quote/);
  assert.match(partnerEdge, /body\.action === "create_student"/);
  assert.match(partnerEdge, /body\.action === "create_quote"/);
  assert.match(partnerEdge, /\.eq\("owner_id", partner\.owner_id\)\.eq\("ativo", true\)/);
});

test("administrador aprova apenas dados cadastrais e não cria venda financeira", () => {
  assert.match(adminJs, /review_student/);
  assert.match(adminJs, /review_quote/);
  assert.match(adminEdge, /body\.action === "review_student"/);
  assert.match(adminEdge, /aulas_compradas: 0, aulas_restantes: 0/);
  assert.match(adminEdge, /alugueis_comprados: 0, alugueis_disponiveis: 0/);
  assert.match(adminEdge, /Nenhuma venda ou movimentação financeira foi criada/);
  assert.match(adminEdge, /Registre a venda e o financeiro manualmente/);
});

test("progresso de aulas de comissão paga não pode ser consultado diretamente pelo parceiro", () => {
  assert.match(partnerProgressPolicyMigration, /DROP POLICY IF EXISTS partner_commissions_owner_or_self_select/);
  assert.match(partnerProgressPolicyMigration, /DROP POLICY IF EXISTS partner_commission_lessons_owner_or_self_select/);
  assert.match(partnerEdge, /lessons_completed: c\.status === "pago" \? null/);
});

const partnerPolicyConsolidationMigration = read("../supabase/migrations/20261124050054_consolidate_partner_read_policies_indexes.sql");

test("leitura de parceiros usa uma única política e elimina índices redundantes", () => {
  assert.match(partnerPolicyConsolidationMigration, /DROP POLICY IF EXISTS partners_owner_or_self_select/);
  assert.match(partnerPolicyConsolidationMigration, /CREATE POLICY partners_owner_or_self_select/);
  assert.match(partnerPolicyConsolidationMigration, /OR user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(partnerPolicyConsolidationMigration, /DROP INDEX IF EXISTS public\.partners_owner_status_idx/);
  assert.match(partnerPolicyConsolidationMigration, /DROP INDEX IF EXISTS public\.partner_commission_lessons_commission_idx/);
  assert.match(partnerPolicyConsolidationMigration, /DROP INDEX IF EXISTS public\.partner_message_recipients_partner_idx/);
});
