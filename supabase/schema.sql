-- Matefindr — schéma minimal pour notifications Discord côté serveur.
-- À exécuter dans Supabase SQL Editor.

-- 1. Préférences notifications par user (lié à auth.users)
create table if not exists public.user_notif_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  discord_webhook text,
  notif_like     boolean default false,
  notif_match    boolean default false,
  notif_message  boolean default false,
  -- Snapshot d'affichage pour les notifs (avatar, pseudo, couleur fallback)
  display_name   text,
  avatar_url     text,
  c1             text default '#9146FF',
  updated_at     timestamptz default now()
);

alter table public.user_notif_prefs enable row level security;

create policy "Users read their own prefs"
  on public.user_notif_prefs for select
  using (auth.uid() = user_id);
create policy "Users upsert their own prefs"
  on public.user_notif_prefs for insert with check (auth.uid() = user_id);
create policy "Users update their own prefs"
  on public.user_notif_prefs for update using (auth.uid() = user_id);

-- ⚠️ Sections 2-4 ci-dessous sont OBSOLÈTES / jamais exécutées : les vraies
-- tables likes/matches/messages en prod ont été créées avec un autre schéma
-- (likes: liker_id/liked_id ; messages: sender_id/body ; matches: user_a/user_b
-- comme ici). Le matching se fait côté client (ensureMatchRow dans index.html),
-- pas via le trigger handle_like_insert plus bas. Ne PAS ré-exécuter ces
-- create table/policy tel quel (from_user/to_user/sender/content n'existent
-- pas sur les vraies tables) — cf. notify/index.ts qui lit les vrais noms.

-- 2. Likes (uni-directionnels)
create table if not exists public.likes (
  id          bigserial primary key,
  from_user   uuid not null references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz default now(),
  unique (from_user, to_user)
);

alter table public.likes enable row level security;
create policy "Users insert their own likes"
  on public.likes for insert with check (auth.uid() = from_user);
create policy "Users read likes related to them"
  on public.likes for select using (auth.uid() = from_user or auth.uid() = to_user);

-- 3. Matchs (création auto par trigger quand like réciproque)
create table if not exists public.matches (
  id         bigserial primary key,
  user_a     uuid not null references auth.users(id) on delete cascade,
  user_b     uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  constraint match_pair_unique unique (user_a, user_b),
  constraint match_pair_order  check (user_a < user_b)
);

alter table public.matches enable row level security;
create policy "Users read their matches"
  on public.matches for select using (auth.uid() = user_a or auth.uid() = user_b);

-- 4. Messages
create table if not exists public.messages (
  id         bigserial primary key,
  match_id   bigint not null references public.matches(id) on delete cascade,
  sender     uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;
create policy "Users insert their messages"
  on public.messages for insert with check (auth.uid() = sender);
create policy "Users read messages from their matches"
  on public.messages for select using (
    exists (select 1 from public.matches m where m.id = match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()))
  );

-- 5. Trigger : on insert dans likes, si réciproque → créer match
create or replace function public.handle_like_insert()
returns trigger language plpgsql security definer as $$
declare
  reciprocal_exists boolean;
  a uuid;
  b uuid;
begin
  select exists(select 1 from public.likes where from_user = new.to_user and to_user = new.from_user)
    into reciprocal_exists;
  if reciprocal_exists then
    a := least(new.from_user, new.to_user);
    b := greatest(new.from_user, new.to_user);
    insert into public.matches (user_a, user_b) values (a, b)
      on conflict (user_a, user_b) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_likes_insert on public.likes;
create trigger trg_likes_insert
  after insert on public.likes
  for each row execute function public.handle_like_insert();

-- 6. Webhooks de notif déclenchés côté DB :
-- Au lieu de pg_net (peut ne pas être activé), on appelle l'Edge Function via http_post.
-- L'approche la plus simple est de mettre la logique dans l'Edge Function elle-même,
-- déclenchée par un Webhook Supabase (UI Database → Webhooks) sur :
--   - INSERT public.likes      → POST /functions/v1/notify avec event=like
--   - INSERT public.matches    → POST /functions/v1/notify avec event=match
--   - INSERT public.messages   → POST /functions/v1/notify avec event=message
--
-- L'Edge Function lit la pref du destinataire et POST son webhook Discord.
