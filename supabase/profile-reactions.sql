-- À EXÉCUTER MANUELLEMENT dans le SQL Editor Supabase (projet pdhffpxssagclexttfox).
-- Réactions emoji sur les profils (🫩🙄😐😳🤩, index 0-4, du plus "moche" au plus "beau").
-- Une seule réaction par (profil, votant) -- upsert pour changer d'avis.

create table if not exists public.profile_reactions (
  profile_id uuid not null references auth.users(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  emoji smallint not null check (emoji between 0 and 4),
  created_at timestamptz not null default now(),
  primary key (profile_id, reactor_id)
);

alter table public.profile_reactions enable row level security;

create policy "Anyone can read reaction counts"
  on public.profile_reactions for select
  using (true);

create policy "Authenticated users react as themselves"
  on public.profile_reactions for insert
  with check (auth.uid() = reactor_id);

create policy "Users can change their own reaction"
  on public.profile_reactions for update
  using (auth.uid() = reactor_id);
