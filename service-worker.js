
const CACHE_NAME = "marcus-instrutor-v1";

const ARQUIVOS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ARQUIVOS))
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

    event.respondWith(
        caches.match(event.request).then(resposta => {
            if (resposta) return resposta;

            return fetch(event.request).catch(() => {
                if (event.request.mode === "navigate") {
                    return caches.match("./index.html");
                }

                return new Response("", {
                    status: 503,
                    statusText: "Offline"
                });
            });
        })
    );
});
