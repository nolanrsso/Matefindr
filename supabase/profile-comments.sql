-- Matefindr — commentaires sur un profil, affichés sur son lien perso
-- (matefindr.com/<slug>). À exécuter UNE FOIS dans Supabase Dashboard → SQL Editor.

create table if not exists public.profile_comments (
  id            bigserial primary key,
  profile_id    uuid not null references auth.users(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  author_name   text not null,
  author_avatar text,
  body          text not null check (char_length(body) between 1 and 500),
  created_at    timestamptz not null default now()
);

alter table public.profile_comments enable row level security;

-- Public (même déconnecté) : lecture des commentaires d'un profil (nécessaire
-- pour matefindr.com/<slug> visité sans compte).
create policy "Anyone can read comments"
  on public.profile_comments for select using (true);

-- Poster : uniquement connecté, et seulement en son propre nom.
create policy "Authenticated users post their own comments"
  on public.profile_comments for insert with check (auth.uid() = author_id);

-- Supprimer : l'auteur du commentaire, OU le propriétaire du profil commenté
-- (modération basique sur son propre lien).
create policy "Author or profile owner can delete a comment"
  on public.profile_comments for delete
  using (auth.uid() = author_id or auth.uid() = profile_id);

create index if not exists profile_comments_profile_id_idx
  on public.profile_comments (profile_id, created_at desc);
