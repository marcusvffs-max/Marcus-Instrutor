import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const helper = read("../contratante-perfil.js");
const adminHtml = read("../index.html");
const instructorHtml = read("../instrutor.html");
const instructorJs = read("../instrutor.js");
const contractsJs = read("../contratos.js");
const migration = read("../supabase/migrations/20261121170000_add_contractor_identity_to_app_settings.sql");
const serviceWorker = read("../service-worker.js");

const fields = [
  "contratante_nome",
  "contratante_documento",
  "contratante_nacionalidade",
  "contratante_estado_civil",
  "contratante_profissao",
  "contratante_endereco"
];

test("migration cria os seis campos de identificação do contratante", () => {
  for (const field of fields) assert.match(migration, new RegExp("ADD COLUMN IF NOT EXISTS " + field));
});

test("persistência sempre filtra e grava pelo owner_id autenticado", () => {
  assert.match(helper, /\.eq\("owner_id", usuarioId\)/);
  assert.match(helper, /insert\(\{ owner_id: usuarioId, \.\.\.dados \}\)/);
  assert.doesNotMatch(helper, /localStorage|sessionStorage/);
  for (const field of fields) assert.ok(helper.includes(field));
});

test("painel administrador carrega o helper antes do gerador de contratos", () => {
  assert.ok(adminHtml.indexOf("contratante-perfil.js") < adminHtml.indexOf("contratos.js?v=contratos31"));
  assert.match(contractsJs, /window\.MarcusContractorProfile/);
  assert.match(contractsJs, /perfil\.vincular/);
  assert.match(adminHtml, /id="btnSalvarDadosContratante"/);
});

test("área do instrutor carrega e vincula seus próprios dados", () => {
  const helperPosition = instructorHtml.indexOf("contratante-perfil.js");
  const instructorScriptPosition = instructorHtml.indexOf('src="instrutor.js?v=');
  assert.ok(helperPosition >= 0 && instructorScriptPosition > helperPosition);
  assert.match(instructorJs, /MarcusContractorProfile\.carregar\(state\.supabase, state\.user\.id\)/);
  assert.match(instructorJs, /MarcusContractorProfile\.vincular/);
  assert.match(instructorJs, /const contratanteNome = el\("contratanteNome"\)/);
  assert.match(instructorJs, /const contratanteDocumento = el\("contratanteDocumento"\)/);
  assert.match(instructorHtml, /id="btnSalvarDadosContratante"/);
});

test("contrato do instrutor usa a identificação persistida na emissão", () => {
  assert.match(instructorJs, /safe\(instructor\)/);
  assert.match(instructorJs, /safe\(contratanteDocumento\)/);
  assert.match(instructorJs, /CPF\/CNPJ/);
});

test("service worker atualiza versão e não armazena o helper no cache compartilhado", () => {
  assert.match(serviceWorker, /const CACHE_NAME = "marcus-instrutor-v\\d+-partner-module/);
  const htmlVersion = instructorHtml.match(/src="instrutor\.js\?v=([^"]+)"/)?.[1];
  const cachedVersion = serviceWorker.match(/"\.\/instrutor\.js\?v=([^"]+)"/)?.[1];
  assert.ok(htmlVersion, "A versão do script do instrutor deve estar declarada no HTML.");
  assert.equal(cachedVersion, htmlVersion, "O cache do service worker deve usar a mesma versão carregada pelo HTML.");
  assert.match(serviceWorker, /"\/contratante-perfil\.js"/);
});
