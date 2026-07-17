-- Matefindr — deck découverte allégé (coupe l'egress PostgREST).
-- À exécuter manuellement dans le SQL Editor Supabase.
--
-- Problème : fetchOtherProfiles faisait SELECT * sur profiles, donc téléchargeait
-- data.presets (jusqu'à 5 snapshots complets avec médias) pour ~200 comptes.
-- Sur le pic du 10 juil., PostgREST ≈ 53 % de l'egress.
--
-- Cette RPC renvoie les mêmes lignes profiles, mais avec data SANS presets
-- (inutiles sur le swipe — utiles seulement pour le lien perso / openSharedProfile).
-- Le strip est fait côté serveur → le JSON envoyé au client est beaucoup plus léger.

CREATE OR REPLACE FUNCTION public.fetch_profiles_discover(
  p_exclude uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r public.profiles;
  lim integer;
BEGIN
  lim := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 200);
  FOR r IN
    SELECT *
    FROM public.profiles p
    WHERE p_exclude IS NULL OR p.id <> p_exclude
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT lim
  LOOP
    IF r.data IS NOT NULL THEN
      -- presets = snapshots éditeur (très lourds). sharePresetIdx inutile sans presets.
      r.data := r.data - 'presets' - 'sharePresetIdx';
    END IF;
    RETURN NEXT r;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_profiles_discover(uuid, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.fetch_profiles_discover(uuid, integer) IS
  'Liste découverte Matefindr : profiles sans data.presets (anti-egress PostgREST).';
