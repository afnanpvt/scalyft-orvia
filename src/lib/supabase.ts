import { createClient } from "@supabase/supabase-js";

// Session config (made explicit rather than relying on SDK defaults):
//   persistSession      → session survives page refresh via localStorage
//   autoRefreshToken    → access token auto-refreshes before expiry
//   detectSessionInUrl  → required for password recovery + OAuth callbacks
//   flowType: "pkce"    → use PKCE for OAuth + reset-password (more secure than implicit)
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
