/* Configuración pública: nunca incluir sb_secret_ ni service_role en el frontend. */
(() => {
  "use strict";
  const SUPABASE_URL = "https://zivdxtjcbkufcybtmjym.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_58bVm6n3JP1fs7Ao1py3dw_OpWNiKLS";
  if (!window.supabase?.createClient) {
    console.error("No se cargó supabase-js. Revisa la conexión al CDN.");
    return;
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: "pkce" }
  });
})();
