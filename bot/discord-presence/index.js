/**
 * Matefindr — bot Discord Presence
 *
 * Écoute PRESENCE_UPDATE sur le serveur Matefindr et écrit
 * profiles.data.discordLive (status + activités Spotify/jeux…).
 *
 * Prérequis Discord Developer Portal (bot) :
 *   - Privileged Gateway Intent : PRESENCE INTENT (obligatoire)
 *   - Intent Guild Members recommandé
 *   - Bot invité sur le serveur DISCORD_GUILD_ID (déjà le cas via auto-join)
 *
 * Env :
 *   DISCORD_BOT_TOKEN
 *   DISCORD_GUILD_ID
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Hébergement : Railway / Fly / VPS (processus long — PAS une Edge Function).
 */

import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/* Court : fin de musique / changement de jeu doit arriver vite côté site */
const DEBOUNCE_MS = 1200;
const OFFLINE_TYPES = new Set(['offline', 'invisible']);

if (!BOT_TOKEN || !GUILD_ID || !SB_URL || !SB_KEY) {
  console.error('[presence] Missing env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pending = new Map(); // discordId → timer
const lastFp = new Map(); // discordId → fingerprint
const appIconCache = new Map(); // applicationId → url|null

/** Icône d'application Discord (jeux sans Rich Presence assets, ex. Palworld). */
async function resolveAppIconUrl(applicationId) {
  const id = String(applicationId || '');
  if (!id) return null;
  if (appIconCache.has(id)) return appIconCache.get(id);
  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${id}/rpc`);
    if (!res.ok) {
      appIconCache.set(id, null);
      return null;
    }
    const d = await res.json();
    const url = d?.icon
      ? `https://cdn.discordapp.com/app-icons/${id}/${d.icon}.png?size=128`
      : null;
    appIconCache.set(id, url);
    return url;
  } catch (_) {
    appIconCache.set(id, null);
    return null;
  }
}

function resolveAssetUrlFromKey(key, applicationId) {
  if (!key) return null;
  const s = String(key);
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('spotify:')) return 'https://i.scdn.co/image/' + s.slice(8);
  if (s.startsWith('mp:external/')) {
    try {
      const encoded = s.split('/').slice(2).join('/');
      return decodeURIComponent(encoded);
    } catch (_) { return null; }
  }
  if (s.startsWith('mp:')) return 'https://media.discordapp.net/' + s.slice(3);
  if (applicationId && /^[a-zA-Z0-9_-]+$/.test(s)) {
    return `https://cdn.discordapp.com/app-assets/${applicationId}/${s}.png?size=128`;
  }
  return null;
}

async function normalizeActivity(a) {
  if (!a) return null;
  const type = typeof a.type === 'number' ? a.type : ActivityType.Playing;
  const applicationId = a.applicationId ? String(a.applicationId) : '';
  const assets = {};
  if (a.assets) {
    if (a.assets.largeImage) assets.large_image = a.assets.largeImage;
    if (a.assets.smallImage) assets.small_image = a.assets.smallImage;
    if (a.assets.largeText) assets.large_text = a.assets.largeText;
    if (a.assets.smallText) assets.small_text = a.assets.smallText;
    try {
      if (typeof a.assets.largeImageURL === 'function') {
        const u = a.assets.largeImageURL({ size: 128, extension: 'png' });
        if (u) assets.large_image_url = u;
      }
      if (typeof a.assets.smallImageURL === 'function') {
        const u = a.assets.smallImageURL({ size: 128, extension: 'png' });
        if (u) assets.small_image_url = u;
      }
    } catch (_) {}
    if (!assets.large_image_url && assets.large_image) {
      assets.large_image_url = resolveAssetUrlFromKey(assets.large_image, applicationId);
    }
    if (!assets.small_image_url && assets.small_image) {
      assets.small_image_url = resolveAssetUrlFromKey(assets.small_image, applicationId);
    }
  }
  /* Jeux Detected (Palworld…) : souvent sans assets RP → icône de l'application Discord */
  if (!assets.large_image_url && applicationId) {
    const icon = await resolveAppIconUrl(applicationId);
    if (icon) assets.large_image_url = icon;
  }
  let timestamps = null;
  if (a.timestamps && (a.timestamps.start || a.timestamps.end)) {
    timestamps = {
      start: a.timestamps.start ? Number(a.timestamps.start) : null,
      end: a.timestamps.end ? Number(a.timestamps.end) : null,
    };
  }
  return {
    type,
    name: a.name || '',
    details: a.details || '',
    state: a.state || '',
    application_id: applicationId,
    assets,
    timestamps,
  };
}

function presenceFingerprint(status, activities) {
  return JSON.stringify({
    status: status || 'offline',
    activities: (activities || []).map((a) => ({
      t: a.type, n: a.name, d: a.details, s: a.state,
      st: a.timestamps?.start || null, en: a.timestamps?.end || null,
      img: a.assets?.large_image_url || a.assets?.large_image || null,
    })),
  });
}

async function buildLive(presence, prevLive) {
  const status = presence?.status || 'offline';
  const raw = presence?.activities || [];
  const activities = [];
  for (const a of raw) {
    const n = await normalizeActivity(a);
    if (!n) continue;
    if (n.type === ActivityType.Custom && !(n.state || n.name)) continue;
    activities.push(n);
  }
  const now = new Date().toISOString();
  const online = status && !OFFLINE_TYPES.has(status);
  const wasOnline = prevLive?.status && !OFFLINE_TYPES.has(prevLive.status);
  return {
    status,
    activities,
    updatedAt: now,
    lastOnlineAt: online ? now : (wasOnline ? now : (prevLive?.lastOnlineAt || null)),
    source: 'bot',
  };
}

async function writeDiscordLive(discordId, live) {
  const { data: row, error } = await supabase
    .from('profiles')
    .select('id, data')
    .eq('discord_id', String(discordId))
    .maybeSingle();
  if (error) {
    console.warn('[presence] select failed', discordId, error.message);
    return false;
  }
  if (!row) return false; // pas de compte Matefindr lié

  const prev = (row.data && typeof row.data === 'object') ? row.data : {};
  const prevLive = prev.discordLive || null;
  const nextLive = {
    ...live,
    lastOnlineAt: live.lastOnlineAt || prevLive?.lastOnlineAt || null,
  };

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ data: { ...prev, discordLive: nextLive } })
    .eq('id', row.id);

  if (upErr) {
    console.warn('[presence] update failed', discordId, upErr.message);
    return false;
  }
  return true;
}

function scheduleWrite(discordId, presence) {
  const id = String(discordId);
  if (pending.has(id)) clearTimeout(pending.get(id));
  pending.set(id, setTimeout(async () => {
    pending.delete(id);
    try {
      const { data: row } = await supabase
        .from('profiles')
        .select('data')
        .eq('discord_id', id)
        .maybeSingle();
      const prevLive = row?.data?.discordLive || null;
      const live = await buildLive(presence, prevLive);
      const fp = presenceFingerprint(live.status, live.activities);
      if (lastFp.get(id) === fp) return;
      const ok = await writeDiscordLive(id, live);
      if (ok) {
        lastFp.set(id, fp);
        const act = live.activities[0];
        console.log(
          '[presence]',
          id,
          live.status,
          act ? `${act.name}${act.details ? ' · ' + act.details : ''}${act.assets?.large_image_url ? ' · 🖼' : ''}` : '(no activity)',
        );
      }
    } catch (e) {
      console.warn('[presence] write error', id, e?.message || e);
    }
  }, DEBOUNCE_MS));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.User, Partials.GuildMember],
});

client.once('ready', () => {
  console.log(`[presence] logged in as ${client.user.tag} · guild ${GUILD_ID}`);
  // Point rouge Discord (ne pas déranger) — sinon le bot reste « En ligne » (vert).
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'Matefindr', type: ActivityType.Watching }],
  });
});

client.on('presenceUpdate', (oldP, newP) => {
  try {
    if (!newP) return;
    if (GUILD_ID && newP.guild && newP.guild.id !== GUILD_ID) return;
    const user = newP.user;
    if (!user || user.bot) return;
    scheduleWrite(user.id, newP);
  } catch (e) {
    console.warn('[presence] presenceUpdate error', e?.message || e);
  }
});

client.login(BOT_TOKEN).catch((e) => {
  console.error('[presence] login failed', e?.message || e);
  process.exit(1);
});

process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
