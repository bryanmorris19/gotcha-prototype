"use strict";

(() => {
  const projectUrl = "https://uukzuerrxcculysbuwhw.supabase.co";
  const publishableKey =
    "sb_publishable_iiR_HV3yDGBeove7c9Jmqw_Lq5FQB78";

  if (!window.supabase?.createClient) {
    window.gotchaSupabase = null;
    return;
  }

  window.gotchaSupabase = window.supabase.createClient(
    projectUrl,
    publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
