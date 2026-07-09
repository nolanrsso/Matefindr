// Matefindr — Edge Function "discord-join-dm".
// Ajoute l'utilisateur fraîchement connecté au serveur Discord (grâce au scope
// OAuth `guilds.join`), puis lui envoie un DM de bienvenue — le tout via le BOT.
// Le DM de bienvenue n'est envoyé QU'UNE SEULE FOIS PAR UTILISATEUR, pour
// toujours (vérifié côté serveur dans public.discord_welcome_dm — pas juste
// un flag localStorage, donc ça tient même si l'utilisateur change de
// navigateur/appareil ou vide son cache). Le join, lui, est retenté à chaque
// login (utile s'il a quitté le serveur entre-temps).
//
// Appelée depuis le client après login (window.__discordJoinDM), avec le body :
//   { access_token: <provider_token Discord de l'utilisateur>, user_id: <son id Discord> }
//
// Synchronise aussi le rôle Discord "Boost" : ajouté/retiré automatiquement
// selon le statut Boost actuel de l'utilisateur (profiles.data.boost), à
// chaque login. Nécessite que le bot ait la permission "Gérer les rôles" ET
// que son propre rôle soit positionné AU-DESSUS du rôle Boost dans la liste
// des rôles du serveur (sinon Discord refuse l'assignation).
//
// Setup (une fois) :
//   1. Exécuter supabase/discord-welcome-dm.sql dans le SQL Editor (crée la table de suivi).
//   2. Créer le rôle "Boost" sur le serveur Discord, copier son ID (clic droit → Copier l'identifiant).
//   3. Donner au bot la permission "Gérer les rôles" et remonter son rôle au-dessus du rôle Boost.
//   4. supabase secrets set DISCORD_BOT_TOKEN="ton_bot_token" DISCORD_GUILD_ID="id_du_serveur" DISCORD_BOOST_ROLE_ID="id_du_role"
//      (optionnel) DISCORD_WELCOME_MESSAGE="..."
//   5. Déploiement : supabase functions deploy discord-join-dm --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";
const BOOST_ROLE_ID = Deno.env.get("DISCORD_BOOST_ROLE_ID") ?? "";
// Message de bienvenue — commence par une mention de l'utilisateur (<@id>).
// Si DISCORD_WELCOME_MESSAGE est défini, on l'utilise tel quel (sans mention).
const WELCOME_OVERRIDE = Deno.env.get("DISCORD_WELCOME_MESSAGE") ?? "";
function welcomeText(uid: string): string {
  if (WELCOME_OVERRIDE) return WELCOME_OVERRIDE;
  return `Bienvenue sur Matefindr <@${uid}> ! 🎉 Tu fais maintenant partie du serveur.\n\n` +
    "🔔 Je suis le bot qui t'enverra ici, en message privé, tes notifications Matefindr " +
    "(likes, matchs, nouveaux messages).\n\n" +
    "Tu peux ajuster ce que tu reçois à tout moment avec le bouton ci-dessous.";
}
// Bouton posé sous le DM de bienvenue → ouvre le panneau complet des
// notifications (géré par l'Edge Function d'interactions, custom_id
// "notif_panel_open" : un message avec un bouton par type, activable/coupable).
const WELCOME_COMPONENTS = [{
  type: 1,
  components: [{ type: 2, style: 1, label: "Changer les notifications", custom_id: "notif_panel_open", emoji: { name: "🔔" } }],
}];

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const API = "https://discord.com/api/v10";

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
  if (!BOT_TOKEN || !GUILD_ID) {
    return json({ error: "bot_non_configure", hint: "définis DISCORD_BOT_TOKEN et DISCORD_GUILD_ID" }, 500);
  }

  let access_token = "";
  let user_id = "";
  try {
    const b = await req.json();
    access_token = String(b.access_token || "");
    user_id = String(b.user_id || "");
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (!access_token) return json({ error: "access_token_manquant" }, 400);
  const sb = createClient(SB_URL, SB_KEY);

  // 1) Anti-abus : le token doit appartenir à l'utilisateur annoncé.
  const meRes = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return json({ error: "token_discord_invalide", status: meRes.status }, 401);
  const me = await meRes.json();
  const uid = String(me.id);
  if (user_id && user_id !== uid) return json({ error: "user_id_mismatch" }, 403);

  // 2) Ajoute au serveur (idempotent : 201 = ajouté, 204 = déjà membre).
  //    Refait à chaque login (pas juste la 1re fois) pour re-ajouter automatiquement
  //    quelqu'un qui aurait quitté le serveur entre-temps.
  const joinRes = await fetch(`${API}/guilds/${GUILD_ID}/members/${uid}`, {
    method: "PUT",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ access_token }),
  });
  const joined = joinRes.status === 201;
  const already = joinRes.status === 204;
  if (!joined && !already) {
    const detail = await joinRes.text().catch(() => "");
    // 403 le plus souvent = le bot n'a pas la permission "Créer une invitation"
    // ou le scope guilds.join manque sur le token.
    return json({ error: "join_echoue", status: joinRes.status, detail: detail.slice(0, 300) }, 502);
  }

  // 3) Rôle Boost — best-effort, n'échoue jamais le join/DM (permissions
  //    manquantes, rôle mal positionné, etc. → on ignore silencieusement).
  if (BOOST_ROLE_ID) {
    try {
      const { data: prof } = await sb.from("profiles").select("data").eq("discord_id", uid).maybeSingle();
      const d = (prof && prof.data && typeof prof.data === "object") ? prof.data as Record<string, unknown> : {};
      const hasBoost = !!d.boost;
      await fetch(`${API}/guilds/${GUILD_ID}/members/${uid}/roles/${BOOST_ROLE_ID}`, {
        method: hasBoost ? "PUT" : "DELETE",
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
    } catch (_) {
      // Best-effort : ne bloque jamais le login pour un souci de rôle Discord.
    }
  }

  // 4) DM de bienvenue — une seule fois dans la vie de l'utilisateur, vérifié
  //    côté serveur (table discord_welcome_dm), pas juste côté navigateur.
  let dm = false;
  const { data: already_welcomed } = await sb
    .from("discord_welcome_dm")
    .select("discord_id")
    .eq("discord_id", uid)
    .maybeSingle();

  if (!already_welcomed) {
    try {
      const chRes = await fetch(`${API}/users/@me/channels`, {
        method: "POST",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: uid }),
      });
      if (chRes.ok) {
        const ch = await chRes.json();
        const msgRes = await fetch(`${API}/channels/${ch.id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ content: welcomeText(uid), allowed_mentions: { users: [uid] }, components: WELCOME_COMPONENTS }),
        });
        dm = msgRes.ok;
      }
    } catch (_) {
      // DM facultatif (l'utilisateur a peut-être bloqué les MP) → on ignore.
    }
    // Marqué comme envoyé même si le DM a échoué (MP bloqués) : on ne veut pas
    // spammer une relance à chaque login pour quelqu'un qui a fermé ses MP.
    await sb.from("discord_welcome_dm").insert({ discord_id: uid }).select().maybeSingle();
  }

  return json({ ok: true, joined, already, dm, welcomed_before: !!already_welcomed, user: uid });
});
