-- À EXÉCUTER MANUELLEMENT dans le SQL Editor Supabase (projet pdhffpxssagclexttfox).
-- Système de note (0.0 à 5.0, pas de 0.1) via un slider à étoiles -- remplace l'ancien
-- système à 5 emojis (colonne `emoji` smallint 0-4). Si tu avais déjà exécuté l'ancienne
-- version de ce fichier, ce script RECRÉE la table : les anciennes réactions emoji sont
-- perdues (elles ne correspondent à rien dans le nouveau barème de notes).
--
-- Pas besoin de compte pour noter : reactor_id n'est PAS une FK vers auth.users, un
-- visiteur non connecté note avec un id anonyme généré côté client (cf. getReactorId()
-- dans js/app.js). Policies permissives : même modèle de confiance que le reste de
-- l'app (boost, vues... tout est déjà côté client).

drop table if exists public.profile_reactions;

create table public.profile_reactions (
  profile_id uuid not null references auth.users(id) on delete cascade,
  reactor_id uuid not null,
  rating numeric(3,1) not null check (rating >= 0 and rating <= 5),
  created_at timestamptz not null default now(),
  primary key (profile_id, reactor_id)
);

alter table public.profile_reactions enable row level security;

create policy "Anyone can read ratings"
  on public.profile_reactions for select
  using (true);

create policy "Anyone can rate"
  on public.profile_reactions for insert
  with check (true);

create policy "Anyone can change a rating"
  on public.profile_reactions for update
  using (true);
