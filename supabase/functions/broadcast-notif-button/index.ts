// Matefindr — Edge Function "broadcast-notif-button" (usage PONCTUEL).
// Envoie un MP à TOUS les comptes existants (discord_id renseigné) avec le
// bouton "Ajuster les notifications" — à lancer UNE FOIS pour donner la
// fonctionnalité aux comptes déjà créés (les nouveaux inscrits la reçoivent
// déjà automatiquement via le DM de bienvenue habituel, discord-join-dm).
//
// Protégée par un secret partagé (BROADCAST_SECRET) pour qu'un tiers ne
// puisse pas déclencher un envoi en masse en devinant l'URL.
//
// Setup :
//   supabase secrets set BROADCAST_SECRET="un_secret_choisi_au_hasard"
//   supabase functions deploy broadcast-notif-button --no-verify-jwt
//
// Déclenchement (une fois) :
//   curl -X POST https://pdhffpxssagclexttfox.supabase.co/functions/v1/broadcast-notif-button \
//     -H "x-broadcast-key: un_secret_choisi_au_hasard"
//
// Une fois exécutée avec succès, cette fonction peut être supprimée du
// dashboard (elle ne sert qu'à ce déploiement ponctuel, pas à un usage courant).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const BROADCAST_SECRET = Deno.env.get("BROADCAST_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://discord.com/api/v10";

const MESSAGE =
  "🔔 Nouveau sur Matefindr : tu peux maintenant ajuster tes notifications Discord " +
  "(tout recevoir, choisir précisément, ou tout couper) avec le bouton ci-dessous.";
const COMPONENTS = [{
  type: 1,
  components: [{ type: 2, style: 1, label: "Ajuster les notifications", custom_id: "notif_adjust_open", emoji: { name: "🔔" } }],
}];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!BROADCAST_SECRET || req.headers.get("x-broadcast-key") !== BROADCAST_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!BOT_TOKEN) return new Response("bot non configuré (DISCORD_BOT_TOKEN manquant)", { status: 500 });

  const sb = createClient(SB_URL, SB_KEY);
  const { data: profiles, error } = await sb.from("profiles").select("discord_id").not("discord_id", "is", null);
  if (error) return new Response("erreur lecture profiles: " + error.message, { status: 500 });

  let sent = 0, failed = 0, skipped = 0;
  for (const p of profiles ?? []) {
    const discordId = (p as { discord_id?: string | null }).discord_id;
    if (!discordId) { skipped++; continue; }
    try {
      const chRes = await fetch(`${API}/users/@me/channels`, {
        method: "POST",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_id: discordId }),
      });
      if (!chRes.ok) { failed++; continue; }
      const ch = await chRes.json();
      const msgRes = await fetch(`${API}/channels/${ch.id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: MESSAGE, components: COMPONENTS }),
      });
      if (msgRes.ok) sent++; else failed++;
    } catch {
      failed++;
    }
    await sleep(300); // anti rate-limit Discord (ouverture de DM + envoi répétés)
  }

  return new Response(JSON.stringify({ ok: true, sent, failed, skipped, total: (profiles ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
