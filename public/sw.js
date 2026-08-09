// ============================================================================
// sw.js — KILL-SWITCH de service worker.
//
// Este projeto NÃO usa service worker. Este arquivo existe porque máquinas de
// dev que rodaram outro app em localhost:8080 (ex.: "Diamond Lembretes") ficam
// com o SW antigo preso no navegador, servindo o app errado do cache — a
// pessoa abre o Sorrimax e vê o outro sistema.
//
// Ao ser baixado como atualização do SW antigo, este script assume, apaga
// todos os caches, se desregistra e recarrega as abas — devolvendo o
// localhost:8080 ao app real. Se um dia o Sorrimax ganhar PWA de verdade,
// substitua este arquivo pelo SW real.
// ============================================================================
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      const abas = await self.clients.matchAll({ type: "window" });
      for (const aba of abas) aba.navigate(aba.url);
    })(),
  );
});
// Sem handler de fetch: nada é interceptado.
