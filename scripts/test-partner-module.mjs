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
  assert.match(adminHtml, /await carregarScript\("parceiros-admin\.js\?v=partner-admin-1"\)/);
  assert.match(adminHtml, /id="page-parceiros"/);
  assert.match(adminHtml, /data-page="parceiros"/);
});

test("admin usa Edge Function para convidar, aprovar, comunicar e pagar parceiros", () => {
  assert.match(adminJs, /functions\.invoke\("admin-manage-partners"/);
  for (const action of ["list", "invite", "update_status", "update_commission", "send_message", "record_payout"]) {
    assert.ok(adminJs.includes('"' + action + '"') || adminJs.includes("invoke(\"" + action + "\""), "Ação ausente: " + action);
  }
});

test("cadastro administrativo do aluno permite associar parceiro", () => {
  assert.match(studentJs, /name="partner_id" id="alunoParceiro"/);
  assert.match(studentJs, /from\("partners"\)\.select\("id,nome,status"\)/);
  assert.match(studentJs, /partner_id: String\(dados\.partner_id \|\| ""\)\.trim\(\) \|\| null/);
  assert.match(studentJs, /partner_id: salvo\.partner_id \|\| null/);
  assert.equal((studentJs.match(/partner_id: a\.partner_id \|\| null/g) || []).length, 2);
});

test("portal do parceiro consulta somente as ações autenticadas do endpoint próprio", () => {
  assert.match(partnerHtml, /parceiro\.js\?v=partner-portal-1/);
  assert.match(partnerJs, /functions\.invoke\("partner-portal"/);
  for (const action of ["overview", "update_pix_key", "mark_read"]) {
    assert.ok(partnerJs.includes('"' + action + '"'), "Ação ausente: " + action);
  }
  assert.match(partnerJs, /profile\?\.role !== "parceiro"/);
});

test("service worker mantém portal disponível e não compartilha script administrativo", () => {
  assert.match(serviceWorker, /marcus-instrutor-v31-partner-module/);
  assert.match(serviceWorker, /"\.\/parceiro\.html"/);
  assert.match(serviceWorker, /"\.\/parceiro\.js\?v=partner-portal-1"/);
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
