// Public client settings only. Never paste a Supabase secret/service_role key here.
export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';
export const APP_URL = window.location.origin;
export const IS_SUPABASE_CONFIGURED = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_')
);
export const OAUTH = { google: true, apple: true };
