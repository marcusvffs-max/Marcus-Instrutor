"use strict";

const CACHE_NAME = "marcus-instrutor-v21-perfil-contratante";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./instrutor.html",
  "./style.css?v=atendimentos-whatsapp-v2",
  "./instrutor.css?v=18",
  "./instrutor.js?v=26",
  "./manifest.json"
];

const ARQUIVOS_ADMINISTRATIVOS = [
  "/script.js",
  "/contratos.js",
  "/contratante-perfil.js",
  "/whatsapp-panel.js",
  "/admin-users.js"
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
