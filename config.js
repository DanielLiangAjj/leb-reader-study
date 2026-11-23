// Supabase project settings for the reader study page.
// Both values are public by design: the anon (publishable) key only lets visitors call the four
// rdr_ functions in supabase/schema.sql; the tables themselves stay closed to it.
// The project is shared with the rating sites; this page uses only the rdr_ tables and functions.
// Leave both empty to run in local-only mode: answers stay in the browser, and the reader downloads them at the end.
// For local testing with other values, create config.local.js (git-ignored) with the same two exports.
export const SUPABASE_URL = 'https://xfpuahqpfndjgzgcgzic.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_3s-0zRRlDynusRjgNUrXCQ_JOeibpAZ';
