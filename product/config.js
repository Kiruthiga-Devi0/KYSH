/*
 * KYSH settings. Leave both values empty to run in "local mode" (everything stays in the browser).
 *
 * To switch on real accounts + database, paste your Supabase values here
 * (Supabase dashboard → Project Settings → API):
 *   supabaseUrl      e.g. "https://abcdxyz.supabase.co"
 *   supabaseAnonKey  the "anon / public" key — it is designed to be public, the database rules protect your data.
 *
 * NEVER put the "service_role" key in this file. That one goes only in Vercel environment variables.
 */
window.KYSH_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
