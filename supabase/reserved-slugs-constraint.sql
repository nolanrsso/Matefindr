-- Empêche, au niveau de la base (pas seulement côté client), qu'un profil se voie
-- attribuer un slug réservé pour matefindr.com/<slug> -- notamment "rules", qui
-- entrerait en conflit avec la page CGU (matefindr.com/rules.html).
--
-- Le blocage existait déjà côté client (js/core.js: window.__mfReservedSlugs,
-- réutilisé par js/account-modals.js et js/app.js), mais l'update se fait via la
-- clé anon publique : n'importe qui peut appeler l'API Supabase directement et
-- contourner cette validation JS. Cette contrainte ferme ce trou.
--
-- Garder cette liste synchronisée avec js/core.js (window.__mfReservedSlugs).
-- À exécuter UNE FOIS dans Supabase Dashboard → SQL Editor.

-- 1) Vérification préalable (facultatif) -- si cette requête renvoie des lignes,
--    corrige/vide leur slug AVANT d'ajouter la contrainte ci-dessous, sinon
--    l'ALTER TABLE échouera.
-- select id, slug from public.profiles
--   where slug is not null
--     and lower(slug) in (
--       'editor','index','settings','checkout','rules',
--       'admin','v2','assets','js','css','supabase','api','favicon'
--     );

alter table public.profiles
  drop constraint if exists profiles_slug_not_reserved;

alter table public.profiles
  add constraint profiles_slug_not_reserved
  check (
    slug is null
    or lower(slug) not in (
      'editor','index','settings','checkout','rules',
      'admin','v2','assets','js','css','supabase','api','favicon'
    )
  );
