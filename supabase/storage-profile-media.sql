-- Matefindr — bucket Storage pour avatars/bannières (remplace le stockage
-- base64 dans la colonne `data` des profils, qui faisait exploser la taille
-- de la base avec très peu d'utilisateurs).
--
-- À exécuter UNE FOIS dans Supabase Dashboard → SQL Editor.

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

-- Chaque fichier est rangé sous {user_id}/avatar-*.jpg ou {user_id}/banner-*.jpg.
-- Seul le propriétaire du dossier peut écrire dans son propre dossier.
create policy "Users can upload their own profile media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own profile media"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own profile media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Le bucket est public (public=true ci-dessus) donc la lecture (URL publique)
-- ne nécessite pas de policy SELECT séparée.
