// Matefindr — Edge Function "discord-interactions".
// Point d'entrée des interactions Discord (bouton "Ajuster les notifications"
// posé sous le DM de bienvenue par discord-join-dm, + menu déroulant "Rendre
// muet" posé sous chaque MP de notif par "notify"). Appelée DIRECTEMENT PAR
// DISCORD (jamais par le client) — doit répondre en moins de 3 secondes et
// vérifier la signature ed25519 de chaque requête.
//
// Déployée sous le nom "smooth-endpoint" (choix fait au moment du déploiement
// dans le dashboard — le nom n'a aucune incidence fonctionnelle, seule l'URL
// compte, mais à retenir pour une future modification de ce fichier).
//
// Setup (une fois) :
//   1. Developer Portal → Informations générales → copier "Public Key".
//   2. supabase secrets set DISCORD_PUBLIC_KEY="..."
//   3. Déployer cette fonction sous le nom "smooth-endpoint" (Verify JWT désactivé).
//   4. Developer Portal → Informations générales → "Interactions Endpoint URL"
//      = https://pdhffpxssagclexttfox.supabase.co/functions/v1/smooth-endpoint
//      Discord valide l'URL en envoyant un PING dès l'enregistrement — la
//      fonction doit donc être déployée AVANT de coller cette URL, sinon
//      Discord refuse de sauvegarder le champ.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MUTE_LABELS: Record<string, string> = {
  all: "Toutes les notifications",
  like: "Les likes",
  message: "Les messages",
  match: "Les matchs",
};

// Menu déroulant granulaire — identique à celui posé par notify/index.ts.
const PICK_COMPONENTS = [{
  type: 1,
  components: [{
    type: 3,
    custom_id: "notif_mute",
    placeholder: "🔕 Rendre muet…",
    options: [
      { label: "Tout", value: "all", emoji: { name: "🔕" } },
      { label: "Like", value: "like", emoji: { name: "❤️" } },
      { label: "Message", value: "message", emoji: { name: "💬" } },
      { label: "Match", value: "match", emoji: { name: "💞" } },
    ],
  }],
}];

// Les 3 boutons de choix rapide, affichés après clic sur "Ajuster les notifications".
const ADJUST_COMPONENTS = [{
  type: 1,
  components: [
    { type: 2, style: 3, label: "Tout recevoir", custom_id: "notif_all_on", emoji: { name: "✅" } },
    { type: 2, style: 2, label: "Choisir précisément", custom_id: "notif_pick_open", emoji: { name: "🎯" } },
    { type: 2, style: 4, label: "Ne rien recevoir", custom_id: "notif_all_off", emoji: { name: "🔕" } },
  ],
}];

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

function verifySignature(signature: string, timestamp: string, body: string): boolean {
  if (!PUBLIC_KEY || !signature || !timestamp) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      hexToBytes(signature),
      hexToBytes(PUBLIC_KEY),
    );
  } catch {
    return false;
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

// Retrouve l'id Supabase (profiles.id) d'un utilisateur à partir de son id Discord.
async function resolveUserId(sb: ReturnType<typeof createClient>, discordId: string | undefined): Promise<string | null> {
  if (!discordId) return null;
  const { data } = await sb.from("profiles").select("id").eq("discord_id", discordId).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function setPrefs(sb: ReturnType<typeof createClient>, userId: string, patch: Record<string, boolean>) {
  await sb.from("user_notif_prefs").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
}

Deno.serve(async (req) => {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const bodyText = await req.text();

  if (!verifySignature(signature, timestamp, bodyText)) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(bodyText);

  // 1) Handshake Discord — obligatoire pour pouvoir enregistrer l'URL dans le portail.
  if (interaction.type === 1) return json({ type: 1 });

  if (interaction.type !== 3) return json({ type: 6 }); // type non géré → accuse réception

  const customId: string | undefined = interaction.data?.custom_id;
  const discordId: string | undefined = interaction.user?.id ?? interaction.member?.user?.id;
  const sb = createClient(SB_URL, SB_KEY);

  // 2) Bouton "Ajuster les notifications" (posé sous le DM de bienvenue) →
  //    ouvre les 3 choix rapides dans un NOUVEAU message (celui de bienvenue
  //    reste intact, réutilisable à tout moment).
  if (customId === "notif_adjust_open") {
    return json({
      type: 4,
      data: {
        content: "🔔 Comment veux-tu recevoir tes notifications Matefindr ?",
        components: ADJUST_COMPONENTS,
      },
    });
  }

  // 3) "Tout recevoir" / "Ne rien recevoir" — état absolu, pas un toggle.
  if (customId === "notif_all_on" || customId === "notif_all_off") {
    const enable = customId === "notif_all_on";
    const userId = await resolveUserId(sb, discordId);
    if (userId) await setPrefs(sb, userId, { notif_like: enable, notif_match: enable, notif_message: enable });
    return json({
      type: 7,
      data: {
        content: enable
          ? "✅ Tu recevras à nouveau toutes tes notifications (like, match, message)."
          : "🔕 Notifications désactivées. Rouvre ce menu depuis le message de bienvenue pour les réactiver.",
        embeds: [],
        components: [],
      },
    });
  }

  // 4) "Choisir précisément" → affiche le menu déroulant granulaire dans ce même message.
  if (customId === "notif_pick_open") {
    return json({
      type: 7,
      data: {
        content: "🎯 Choisis ce que tu veux rendre muet :",
        embeds: [],
        components: PICK_COMPONENTS,
      },
    });
  }

  // 5) Sélection dans le menu granulaire "Rendre muet" (posé ici ou par notify/index.ts).
  if (customId === "notif_mute") {
    const choice: string | undefined = interaction.data.values?.[0];
    let confirmText = "Une erreur est survenue, réessaie plus tard.";

    if (discordId && choice) {
      const userId = await resolveUserId(sb, discordId);
      if (userId) {
        const patch: Record<string, boolean> = choice === "all"
          ? { notif_like: false, notif_match: false, notif_message: false }
          : { [`notif_${choice}`]: false };
        await setPrefs(sb, userId, patch);
        confirmText = `🔕 ${MUTE_LABELS[choice] ?? choice} désormais muet(tes). Choisis à nouveau dans le menu pour ajuster.`;
      }
    }

    // Deux origines possibles pour ce menu : sous un embed de notif (notify),
    // ou sous le message "Choisir précisément" (juste du texte, pas d'embed).
    const embeds = interaction.message?.embeds;
    if (Array.isArray(embeds) && embeds.length) {
      const embed = { ...embeds[0], footer: { text: confirmText } };
      return json({ type: 7, data: { embeds: [embed], components: interaction.message?.components ?? [] } });
    }
    return json({ type: 7, data: { content: confirmText, embeds: [], components: interaction.message?.components ?? [] } });
  }

  return json({ type: 6 }); // custom_id inconnu → accuse simplement réception
});
