-- Matefindr — suivi "DM de bienvenue déjà envoyé" (une fois par utilisateur,
-- pour toujours). Utilisée par l'Edge Function discord-join-dm.
--
-- À exécuter UNE FOIS dans Supabase Dashboard → SQL Editor.

create table if not exists public.discord_welcome_dm (
  discord_id text primary key,
  sent_at    timestamptz not null default now()
);

alter table public.discord_welcome_dm enable row level security;
-- Aucune policy publique : seule la clé service_role (utilisée par l'Edge
-- Function) lit/écrit cette table, donc RLS bloque tout le reste par défaut.
