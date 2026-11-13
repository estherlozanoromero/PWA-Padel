-- Padel Score: cuentas, grupos compartidos, invitaciones y sincronización.
-- Ejecutar en un proyecto Supabase nuevo desde SQL Editor o Supabase CLI.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 60),
  sport_gender text not null default 'unspecified' check (sport_gender in ('male', 'female', 'unspecified')),
  managed_by uuid references auth.users(id) on delete set null,
  claimed_by uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.groups (
  id uuid primary key,
  name text not null check (char_length(name) between 2 and 60),
  scoring jsonb not null default '{"winPoints":3,"lossPoints":1,"initialElo":1000,"eloKFactor":32}'::jsonb,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.group_members (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('account', 'guest')),
  role text not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  left_at timestamptz,
  unique(group_id, player_id)
);

create table if not exists public.rating_adjustments (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.group_members(id) on delete cascade,
  points_delta integer not null check (points_delta between -999 and 999),
  elo_delta integer not null check (elo_delta between -999 and 999),
  reason text not null check (char_length(reason) between 3 and 160),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.group_matches (
  id uuid not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  match_record jsonb not null,
  match_events jsonb not null default '[]'::jsonb,
  finished_at timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  primary key(group_id, id)
);

create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists group_members_group_idx on public.group_members(group_id);
create index if not exists group_members_user_idx on public.group_members(user_id);
create index if not exists group_members_player_idx on public.group_members(player_id);
create index if not exists rating_adjustments_group_idx on public.rating_adjustments(group_id);
create index if not exists group_matches_group_idx on public.group_matches(group_id);
create index if not exists group_invitations_email_idx on public.group_invitations(lower(email));

create or replace function private.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = target_group_id and g.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = (select auth.uid())
      and gm.left_at is null
  );
$$;

create or replace function private.is_group_admin(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = target_group_id and g.owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = (select auth.uid())
      and gm.role in ('owner', 'admin')
      and gm.left_at is null
  );
$$;

create or replace function private.can_access_player(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players p
    where p.id = target_player_id
      and (p.claimed_by = (select auth.uid()) or p.managed_by = (select auth.uid()))
  ) or exists (
    select 1 from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid())
      and mine.left_at is null
      and theirs.player_id = target_player_id
  ) or exists (
    select 1 from public.groups g
    join public.group_members theirs on theirs.group_id = g.id
    where g.owner_user_id = (select auth.uid()) and theirs.player_id = target_player_id
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, 'Jugador'), '@', 1)
  );
  insert into public.profiles(id, display_name)
  values (new.id, left(chosen_name, 60))
  on conflict (id) do nothing;
  insert into public.players(id, display_name, claimed_by)
  values (new.id, left(chosen_name, 60), new.id)
  on conflict (id) do update set claimed_by = excluded.claimed_by;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.accept_group_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.accepted_at is null and new.accepted_at is not null then
    if new.accepted_by is distinct from (select auth.uid()) then
      raise exception 'La invitación solo puede aceptarla el usuario autenticado.';
    end if;
    if lower(new.email) <> lower(coalesce((select auth.jwt() ->> 'email'), '')) then
      raise exception 'La invitación pertenece a otro correo.';
    end if;
    if new.expires_at <= now() then
      raise exception 'La invitación ha caducado.';
    end if;
    insert into public.group_members(
      id, group_id, player_id, user_id, kind, role, joined_at, updated_at
    ) values (
      gen_random_uuid(), new.group_id, new.accepted_by, new.accepted_by,
      'account', new.role, now(), now()
    ) on conflict (group_id, player_id) do update set
      user_id = excluded.user_id,
      kind = 'account',
      role = excluded.role,
      left_at = null,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_group_invitation_accepted on public.group_invitations;
create trigger on_group_invitation_accepted
after update of accepted_at on public.group_invitations
for each row execute function private.accept_group_invitation();

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.rating_adjustments enable row level security;
alter table public.group_matches enable row level security;
alter table public.group_invitations enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy players_select on public.players for select to authenticated
using ((select private.can_access_player(id)));
create policy players_insert on public.players for insert to authenticated
with check (managed_by = (select auth.uid()) or claimed_by = (select auth.uid()));
create policy players_update on public.players for update to authenticated
using (managed_by = (select auth.uid()) or claimed_by = (select auth.uid()))
with check (managed_by = (select auth.uid()) or claimed_by = (select auth.uid()));

create policy groups_select on public.groups for select to authenticated
using ((select private.is_group_member(id)));
create policy groups_insert on public.groups for insert to authenticated
with check (owner_user_id = (select auth.uid()));
create policy groups_update on public.groups for update to authenticated
using ((select private.is_group_admin(id))) with check ((select private.is_group_admin(id)));

create policy group_members_select on public.group_members for select to authenticated
using ((select private.is_group_member(group_id)));
create policy group_members_insert on public.group_members for insert to authenticated
with check ((select private.is_group_admin(group_id)));
create policy group_members_update on public.group_members for update to authenticated
using ((select private.is_group_admin(group_id))) with check ((select private.is_group_admin(group_id)));
create policy group_members_delete on public.group_members for delete to authenticated
using ((select private.is_group_admin(group_id)));

create policy adjustments_select on public.rating_adjustments for select to authenticated
using ((select private.is_group_member(group_id)));
create policy adjustments_insert on public.rating_adjustments for insert to authenticated
with check ((select private.is_group_admin(group_id)) and created_by = (select auth.uid()));

create policy matches_select on public.group_matches for select to authenticated
using ((select private.is_group_member(group_id)));
create policy matches_insert on public.group_matches for insert to authenticated
with check ((select private.is_group_member(group_id)) and updated_by = (select auth.uid()));
create policy matches_update on public.group_matches for update to authenticated
using ((select private.is_group_member(group_id)))
with check ((select private.is_group_member(group_id)) and updated_by = (select auth.uid()));

create policy invitations_admin_select on public.group_invitations for select to authenticated
using ((select private.is_group_admin(group_id)));
create policy invitations_invitee_select on public.group_invitations for select to authenticated
using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')));
create policy invitations_insert on public.group_invitations for insert to authenticated
with check ((select private.is_group_admin(group_id)) and invited_by = (select auth.uid()));
create policy invitations_accept on public.group_invitations for update to authenticated
using (lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), '')) and accepted_at is null)
with check (accepted_by = (select auth.uid()));
create policy invitations_delete on public.group_invitations for delete to authenticated
using ((select private.is_group_admin(group_id)));

revoke all on all tables in schema public from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.players to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert on public.rating_adjustments to authenticated;
grant select, insert, update on public.group_matches to authenticated;
grant select, insert, delete on public.group_invitations to authenticated;
grant update (accepted_at, accepted_by) on public.group_invitations to authenticated;

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.rating_adjustments;
alter publication supabase_realtime add table public.group_matches;
alter publication supabase_realtime add table public.group_invitations;
