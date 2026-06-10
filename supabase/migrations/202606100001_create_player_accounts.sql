create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Treasure Hunter'
    check (char_length(nickname) between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(progress) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.player_progress enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.player_progress from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.player_progress to authenticated;

drop policy if exists "Players can view their profile" on public.profiles;
create policy "Players can view their profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Players can create their profile" on public.profiles;
create policy "Players can create their profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Players can update their profile" on public.profiles;
create policy "Players can update their profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Players can view their progress"
on public.player_progress;
create policy "Players can view their progress"
on public.player_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Players can create their progress"
on public.player_progress;
create policy "Players can create their progress"
on public.player_progress
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their progress"
on public.player_progress;
create policy "Players can update their progress"
on public.player_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_player_progress_updated_at
on public.player_progress;
create trigger set_player_progress_updated_at
before update on public.player_progress
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    left(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'nickname', ''),
        'Treasure Hunter'
      ),
      24
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
