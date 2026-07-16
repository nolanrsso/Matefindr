// Matefindr — Edge Function "delete-account".
// Supprime RÉELLEMENT un compte : la ligne auth.users (via l'API admin) et
// toutes les données liées (profil, likes, matchs, messages, notes reçues,
// commentaires, préférences de notif, marqueur DM de bienvenue).
//
// Sécurité : contrairement à discord-join-dm/notify, cette fonction est
// déployée AVEC vérification JWT (comportement par défaut de `supabase
// functions deploy` — ne PAS ajouter --no-verify-jwt ici). Le token envoyé
// par le client est donc déjà garanti valide par la passerelle Supabase avant
// que ce code ne s'exécute ; on l'utilise juste pour identifier QUEL compte
// supprimer (jamais un paramètre libre dans le body — on ne peut supprimer
// que SON PROPRE compte).
//
// Appelée depuis le client (window.__mfDeleteAccount, js/app.js) avec le
// header Authorization: Bearer <access_token de session de l'utilisateur>.
//
// Déploiement : supabase functions deploy delete-account
// (nécessite SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, déjà dispo par défaut
// dans l'environnement Edge Functions — rien à configurer en plus).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing_token" }, 401);

  // Client service_role (bypass RLS pour les suppressions en cascade manuelles),
  // mais on résout l'identité à partir du token de SESSION de l'appelant, pas
  // d'un id passé en paramètre — impossible de supprimer un autre compte.
  const sb = createClient(SB_URL, SB_SERVICE_KEY);
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_session" }, 401);
  const uid = userRes.user.id;

  try {
    // Discord ID (pour purger discord_welcome_dm) — lu avant de supprimer le profil.
    let discordId: string | null = null;
    try {
      const { data: prof } = await sb.from("profiles").select("discord_id").eq("id", uid).maybeSingle();
      discordId = (prof as { discord_id?: string | null } | null)?.discord_id ?? null;
    } catch (_) { /* best-effort */ }

    // Matchs impliquant ce compte (nécessaire pour cibler les messages, dont la
    // table ne référence l'utilisateur qu'indirectement via match_id).
    let matchIds: number[] = [];
    try {
      const { data: matches } = await sb
        .from("matches").select("id").or(`user_a.eq.${uid},user_b.eq.${uid}`);
      matchIds = (matches || []).map((m: { id: number }) => m.id);
    } catch (_) { /* table peut ne pas exister selon l'état du projet */ }

    // Ordre : enfants d'abord (évite toute violation de FK si le cascade n'est
    // pas configuré côté base) -- supprimer une ligne déjà partie ne fait rien.
    if (matchIds.length) {
      await sb.from("messages").delete().in("match_id", matchIds);
    }
    await sb.from("messages").delete().eq("sender_id", uid);
    await sb.from("matches").delete().or(`user_a.eq.${uid},user_b.eq.${uid}`);
    await sb.from("likes").delete().or(`liker_id.eq.${uid},liked_id.eq.${uid}`);
    await sb.from("profile_reactions").delete().or(`profile_id.eq.${uid},reactor_id.eq.${uid}`);
    await sb.from("profile_comments").delete().or(`profile_id.eq.${uid},author_id.eq.${uid}`);
    await sb.from("user_notif_prefs").delete().eq("user_id", uid);
    if (discordId) {
      await sb.from("discord_welcome_dm").delete().eq("discord_id", discordId);
    }
    await sb.from("profiles").delete().eq("id", uid);

    // Enfin, le compte auth lui-même — irréversible.
    const { error: delErr } = await sb.auth.admin.deleteUser(uid);
    if (delErr) return json({ error: "auth_delete_failed", detail: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: "unexpected", detail: (e as Error)?.message || String(e) }, 500);
  }
});
