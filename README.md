# MIND ARENA — corrected build

This build is intentionally split into small files so it is easy to maintain in GitHub.

## Games
- FIFA Game: card collection + quick AI simulation.
- Auction: 5 players / €100M or 11 players / €250M. In a 2-team auction, after the first winning lot, the other team receives one random free player with a recorded value equal to half the winning bid. The player is removed from the remaining auction pool so it cannot appear twice.
- Lebes Sahbak: the person who chooses the box receives the card.

## Online backend
Supabase Auth + Postgres + Realtime + Edge Functions.

## Important
Google and Apple cannot be enabled from browser code. They must be enabled and configured in Supabase Auth Providers with the provider credentials. The website now checks `/auth/v1/settings` first and, when a provider is disabled, shows a normal setup message instead of exposing the raw `Unsupported provider` JSON.
