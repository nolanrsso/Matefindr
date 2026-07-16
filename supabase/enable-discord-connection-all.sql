-- À EXÉCUTER MANUELLEMENT dans le SQL Editor Supabase (projet pdhffpxssagclexttfox).
-- Active la connexion Discord (chip + activité/statut) sur TOUS les comptes
-- qui ont un discord_id, sans écraser les prefs showActivity/showStatus déjà choisies.
--
-- Idempotent : safe à relancer.

UPDATE public.profiles p
SET
  data = jsonb_set(
    coalesce(p.data, '{}'::jsonb),
    '{connections}',
    (
      -- connexions existantes + discord forcé
      (
        coalesce(p.data->'connections', '{}'::jsonb)
        - '_order'
      )
      || jsonb_build_object(
           'discord',
           jsonb_build_object(
             'v', p.discord_id::text,
             'mode', coalesce(nullif(p.data->'connections'->'discord'->>'mode', ''), 'link'),
             'label', coalesce(
               nullif(trim(both from coalesce(p.data->'connections'->'discord'->>'label', '')), ''),
               nullif(trim(both from coalesce(p.data->>'tag', '')), ''),
               ''
             ),
             'showLabel', CASE
               WHEN p.data->'connections'->'discord' ? 'showLabel'
                 THEN coalesce((p.data->'connections'->'discord'->>'showLabel')::boolean, true)
               ELSE true
             END,
             'showActivity', CASE
               WHEN p.data->'connections'->'discord' ? 'showActivity'
                 THEN coalesce((p.data->'connections'->'discord'->>'showActivity')::boolean, true)
               ELSE true
             END,
             'showStatus', CASE
               WHEN p.data->'connections'->'discord' ? 'showStatus'
                 THEN coalesce((p.data->'connections'->'discord'->>'showStatus')::boolean, true)
               ELSE true
             END
           ),
           '_order',
           CASE
             WHEN jsonb_typeof(p.data->'connections'->'_order') = 'array' THEN (
               SELECT coalesce(to_jsonb(array_agg(x ORDER BY ord)), '["discord"]'::jsonb)
               FROM (
                 SELECT 'discord'::text AS x, 0 AS ord
                 UNION ALL
                 SELECT elem::text, (ord + 1)::int
                 FROM jsonb_array_elements_text(p.data->'connections'->'_order')
                      WITH ORDINALITY AS t(elem, ord)
                 WHERE elem::text <> 'discord'
               ) s
             )
             ELSE '["discord"]'::jsonb
           END
         )
    ),
    true
  ),
  updated_at = now()
WHERE p.discord_id IS NOT NULL
  AND length(trim(p.discord_id)) > 0;
