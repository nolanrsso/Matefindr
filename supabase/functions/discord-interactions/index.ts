// Matefindr — Edge Function "discord-interactions".
// Point d'entrée des interactions Discord (menu déroulant "Rendre muet" posé
// sous chaque MP par l'Edge Function "notify"). Appelée DIRECTEMENT PAR
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

  // 2) Sélection dans le menu "Rendre muet" (custom_id posé par notify/index.ts).
  if (interaction.type === 3 && interaction.data?.custom_id === "notif_mute") {
    const discordId: string | undefined = interaction.user?.id ?? interaction.member?.user?.id;
    const choice: string | undefined = interaction.data.values?.[0];
    let confirmText = "Une erreur est survenue, réessaie plus tard.";

    if (discordId && choice) {
      const sb = createClient(SB_URL, SB_KEY);
      const { data: prof } = await sb.from("profiles").select("id").eq("discord_id", discordId).maybeSingle();
      const userId = (prof as { id?: string } | null)?.id;
      if (userId) {
        const patch: Record<string, boolean> = choice === "all"
          ? { notif_like: false, notif_match: false, notif_message: false }
          : { [`notif_${choice}`]: false };
        await sb.from("user_notif_prefs").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
        confirmText = `🔕 ${MUTE_LABELS[choice] ?? choice} désormais muet(tes). Choisis à nouveau dans le menu pour ajuster.`;
      }
    }

    const original = interaction.message?.embeds?.[0] ?? {};
    const embed = { ...original, footer: { text: confirmText } };

    return json({
      type: 7, // UPDATE_MESSAGE : édite le message d'origine (pas de nouveau MP)
      data: { embeds: [embed], components: interaction.message?.components ?? [] },
    });
  }

  // Type d'interaction non géré — accuse simplement réception.
  return json({ type: 6 }); // DEFERRED_UPDATE_MESSAGE
});
