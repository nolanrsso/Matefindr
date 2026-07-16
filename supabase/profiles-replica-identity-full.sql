-- Optionnel : Realtime reçoit le row UPDATE complet (sinon payload.new n'a souvent que l'id).
-- À exécuter manuellement dans le SQL Editor Supabase si les activités Discord
-- ne se mettent pas à jour en live sur les cartes (le client refetch déjà en secours).
--
-- Doc : https://supabase.com/docs/guides/realtime/postgres-changes

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
