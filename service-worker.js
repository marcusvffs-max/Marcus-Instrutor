"use strict";

const CACHE_NAME = "central-instrutor-v44-install-flow-2";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./central-instrutor-logo.svg",
  "./central-app-icon.svg",
  "./instrutor.html",
  "./parceiro.html",
  "./parceiro.js?v=partner-portal-11",
  "./style.css?v=central-logo-1",
  "./admin-visual.css?v=admin-visual-1",
  "./exames-alugueis.js?v=confirm-modal-green-3",
  "./instrutor.css?v=central-logo-1",
  "./instrutor.js?v=unified-fixed-items-5",
  "./script.js?v=confirm-modal-green-3",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

const ARQUIVOS_ADMINISTRATIVOS = [
  "/script.js",
  "/contratos.js",
  "/contratante-perfil.js",
  "/whatsapp-panel.js",
  "/admin-users.js",
  "/parceiros-admin.js",
  "/exames-alugueis.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        ARQUIVOS.map(arquivo =>
          cache.add(arquivo).catch(erro => {
            console.warn("Erro no cache:", arquivo, erro);
          })
        )
      )
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(chaves =>
      Promise.all(
        chaves
          .filter(chave => chave !== CACHE_NAME)
          .map(chave => caches.delete(chave))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Os scripts administrativos só são requisitados depois da validação
  // de role=admin e não devem ser armazenados no cache compartilhado.
  if (ARQUIVOS_ADMINISTRATIVOS.some(caminho => url.pathname.endsWith(caminho))) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(resposta => {
        if (resposta && resposta.status === 200) {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, copia)
          );
        }
        return resposta;
      })
      .catch(() =>
        caches.match(event.request).then(resposta =>
          resposta || Response.error()
        )
      )
  );
});
