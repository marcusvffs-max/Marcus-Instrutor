(function () {
  "use strict";
  const PRODUCTION_HOSTS = new Set(["marcusinstrutor.vercel.app"]);
  const PREVIEW_HOST_PATTERN = /^marcusinstrutor-(?:git-[a-z0-9-]+|[a-z0-9]+)-marcusvffs-2839\.vercel\.app$/i;
  const hostname = window.location.hostname.toLowerCase();
  const environments = {
    production: {
      url: "https://ydyqagqsuqntuibzgwzd.supabase.co",
      publishableKey: "sb_publishable_hgqXLoA9BQvZy0L3dEEJ-A_WfoUq7tU"
    },
    preview: {
      url: "https://voyjssflroiwdyaacthh.supabase.co",
      publishableKey: "sb_publishable_YpDyl5xJknD9NJ-i2fDn9Q_F4jjkLm9"
    }
  };
  let selected = null;
  let environment = null;
  if (PRODUCTION_HOSTS.has(hostname)) {
    selected = environments.production;
    environment = "production";
  } else if (PREVIEW_HOST_PATTERN.test(hostname)) {
    selected = environments.preview;
    environment = "preview";
  }
  window.MARCUS_SUPABASE_CONFIG = selected
    ? Object.freeze({ url: selected.url, publishableKey: selected.publishableKey, environment })
    : null;
  if (!selected) {
    console.error("[Marcus Instrutor] Host não reconhecido; acesso ao Supabase bloqueado:", hostname);
  } else {
    console.info("[Marcus Instrutor] Ambiente Supabase selecionado:", environment);
  }
})();
