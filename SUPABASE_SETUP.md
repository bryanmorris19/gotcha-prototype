# Supabase Account Setup

The web app is configured for project:

`uukzuerrxcculysbuwhw`

## Apply the database migration

1. Open the Supabase project dashboard.
2. Open **SQL Editor** and select **New query**.
3. Paste the contents of:
   `supabase/migrations/202606100001_create_player_accounts.sql`
4. Select **Run**.

The migration is safe to run again. It creates the account tables, enables
Row Level Security, and limits each signed-in player to their own records.

## Confirm authentication URLs

In **Authentication > URL Configuration**, use:

- Site URL: `https://bryanmorris19.github.io/gotcha-prototype/`
- Redirect URL: `https://bryanmorris19.github.io/gotcha-prototype/`

Email authentication must remain enabled. The app uses passwordless magic
links, so players do not create or store a password.

## Browser-safe credentials

`supabase-config.js` contains only the project URL and publishable key. Never
add the database password, secret key, or service-role key to this repository.
