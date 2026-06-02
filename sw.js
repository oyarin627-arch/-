/* タスク管理アプリ サービスワーカー
   方針: ネットワーク優先(network-first)。
   - オンライン時は常に最新のページを取得して表示する(古いキャッシュで初期化される問題を防ぐ)
   - 取得できたら控えをキャッシュに保存し、オフライン時はそれを表示する */
const CACHE = "taskapp-cache-v1";

self.addEventListener("install", (event) => {
  // 新しいSWをすぐ有効化
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 古いキャッシュを掃除
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GET のみ・同一オリジンのみ対象(FirebaseなどのCDNはそのままネットワークへ)
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ネットワーク優先。成功したらキャッシュを更新、失敗したらキャッシュで代替
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // ナビゲーション要求はトップページのキャッシュで代替
        if (req.mode === "navigate") {
          const fallback = await caches.match("./") || await caches.match("index.html");
          if (fallback) return fallback;
        }
        throw e;
      }
    })()
  );
});
