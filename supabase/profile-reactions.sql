-- À EXÉCUTER MANUELLEMENT dans le SQL Editor Supabase (projet pdhffpxssagclexttfox).
-- Réactions emoji sur les profils (🫩🙄😐😳🤩, index 0-4, du plus "moche" au plus "beau").
-- Une seule réaction par (profil, votant) -- upsert pour changer d'avis.
--
-- Pas besoin de compte pour réagir : reactor_id n'est PAS une FK vers auth.users, car un
-- visiteur non connecté vote avec un id anonyme généré côté client (localStorage, cf.
-- getReactorId() dans js/app.js) qui n'existe évidemment pas dans auth.users. Comme
-- l'identité du votant n'est donc pas vérifiable côté serveur pour les anonymes, les
-- policies insert/update restent permissives (déjà le modèle de confiance de cette app :
-- boost, compteur de vues... tout est côté client).

create table if not exists public.profile_reactions (
  profile_id uuid not null references auth.users(id) on delete cascade,
  reactor_id uuid not null,
  emoji smallint not null check (emoji between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (profile_id, reactor_id)
);

alter table public.profile_reactions enable row level security;

create policy "Anyone can read reaction counts"
  on public.profile_reactions for select
  using (true);

create policy "Anyone can react"
  on public.profile_reactions for insert
  with check (true);

create policy "Anyone can change a reaction"
  on public.profile_reactions for update
  using (true);
