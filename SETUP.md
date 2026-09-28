# SETUP — MIND ARENA corrected build

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql` completely.
3. Edit `js/config.js` and paste the Supabase Project URL and Publishable key. Do not paste service_role / secret keys.
4. In Supabase Auth > URL Configuration, set Site URL to your production site and add the same site URL as a Redirect URL.
5. For Google: Auth > Sign In / Providers > Google > enable it and paste the Google Client ID/Secret. Register the Supabase callback URL in Google Cloud.
6. For Apple: Auth > Sign In / Providers > Apple > enable it and configure the Apple Services ID / key information.
7. Install Supabase CLI, run `supabase login`, then `supabase link --project-ref YOUR_PROJECT_REF`.
8. Deploy: `supabase functions deploy login-with-username`, `supabase functions deploy simulate-match`, `supabase functions deploy finish-match`.
9. Push the repository to GitHub. Connect GitHub to Vercel or another static host.

### Social-login error fixed in the UI
The old message `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}` is returned by Supabase when the provider is not enabled. The build now detects disabled providers and disables the button with a useful message. It cannot magically enable Google/Apple because that requires OAuth credentials on the provider side.

### Edge Functions
`login-with-username` has `verify_jwt = false` because it creates the first session. Match functions keep JWT verification enabled.
