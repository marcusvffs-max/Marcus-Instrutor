"use strict";

const CACHE_NAME = "marcus-instrutor-v2";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json"
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
