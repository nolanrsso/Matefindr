-- À EXÉCUTER MANUELLEMENT dans le SQL Editor Supabase (projet pdhffpxssagclexttfox).
-- Cadeau de lancement : tous les comptes déjà existants passent Boost instantanément.
-- (Les 100 PROCHAINS comptes qui arriveront sont gérés côté app, dans onLogin()
-- (js/app.js) : à la toute première connexion d'un compte, si le nombre total de
-- lignes dans `profiles` est encore < 100, le nouveau compte reçoit boost:true,
-- boostPlan:'launch' avant même son premier upsert -- pas besoin de trigger SQL.)

update public.profiles
set data = coalesce(data, '{}'::jsonb)
  || jsonb_build_object(
       'boost', true,
       'boostPlan', coalesce(data->>'boostPlan', 'launch'),
       'boostSince', coalesce(data->>'boostSince', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
     )
where coalesce((data->>'boost')::boolean, false) is not true;
