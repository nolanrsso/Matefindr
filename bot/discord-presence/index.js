/**
 * Matefindr — bot Discord Presence
 *
 * Écoute PRESENCE_UPDATE sur le serveur Matefindr et écrit
 * profiles.data.discordLive (status + activités Spotify/jeux…).
 * Au boot (+ à chaque update), resync aussi les PDP Discord (discordAvatarUrl
 * + avatarUrl si photo non custom Matefindr) pour tous les profils liés.
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
const DEBOUNCE_MS = 100;
const OFFLINE_TYPES = new Set(['offline', 'invisible']);
const DISCORD_CDN_AVATAR_RE = /cdn\.discordapp\.com\/(avatars|embed\/avatars)\//i;

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

/** Photo Matefindr uploadée (storage / data-URL) — ne pas écraser par Discord. */
function isCustomMatefindrAvatar(url) {
  if (!url || typeof url !== 'string') return false;
  return !DISCORD_CDN_AVATAR_RE.test(url);
}

/** URL CDN actuelle de la PDP Discord (gif animé si dispo). */
function avatarUrlFromUser(user) {
  if (!user || typeof user.displayAvatarURL !== 'function') return null;
  try {
    const hash = user.avatar || null;
    const ext = (typeof hash === 'string' && hash.startsWith('a_')) ? 'gif' : 'png';
    return user.displayAvatarURL({ size: 256, extension: ext });
  } catch (_) {
    try { return user.displayAvatarURL({ size: 256 }); } catch (_) { return null; }
  }
}

/**
 * Met à jour discordAvatarUrl (+ avatarUrl / avatar_url si non custom).
 * @returns {{ changed: boolean, avatar_url: string|null }}
 */
function applyDiscordAvatarToData(data, user) {
  const avi = avatarUrlFromUser(user);
  if (!avi) return { changed: false, avatar_url: null };
  let changed = false;
  let colAvatar = null;
  if (data.discordAvatarUrl !== avi) {
    data.discordAvatarUrl = avi;
    changed = true;
  }
  if (!isCustomMatefindrAvatar(data.avatarUrl) && data.avatarUrl !== avi) {
    data.avatarUrl = avi;
    colAvatar = avi;
    changed = true;
  }
  return { changed, avatar_url: colAvatar };
}

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

/**
 * Écrit discordLive et/ou PDP Discord sur le profil lié.
 * @param {string} discordId
 * @param {{ live?: object|null, user?: object|null }} opts
 */
async function writeProfileDiscord(discordId, opts = {}) {
  const { live = null, user = null } = opts;
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
  const next = { ...prev };
  const patch = {};
  let dirty = false;

  if (live) {
    const prevLive = prev.discordLive || null;
    next.discordLive = {
      ...live,
      lastOnlineAt: live.lastOnlineAt || prevLive?.lastOnlineAt || null,
    };
    dirty = true;
  }

  const avi = applyDiscordAvatarToData(next, user);
  if (avi.changed) dirty = true;
  if (avi.avatar_url) patch.avatar_url = avi.avatar_url;

  if (!dirty) return false;

  patch.data = next;
  const { error: upErr } = await supabase
    .from('profiles')
    .update(patch)
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
      if (!row) return;
      const prevLive = row?.data?.discordLive || null;
      const live = await buildLive(presence, prevLive);
      const fp = presenceFingerprint(live.status, live.activities);
      // Seed lastFp depuis la DB si besoin (après restart bot)
      if (!lastFp.has(id) && prevLive) {
        lastFp.set(id, presenceFingerprint(prevLive.status, prevLive.activities || []));
      }
      const presenceChanged = lastFp.get(id) !== fp;
      if (!presenceChanged) {
        // Avatar seul éventuel
        await writeProfileDiscord(id, { user: presence?.user || null });
        return;
      }
      const ok = await writeProfileDiscord(id, {
        live,
        user: presence?.user || null,
      });
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

/** Boot : resync PDP Discord pour tous les membres du guild ayant un profil Matefindr. */
async function syncAllGuildAvatars() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    let updated = 0;
    let seen = 0;
    for (const [, member] of guild.members.cache) {
      if (!member?.user || member.user.bot) continue;
      seen++;
      const ok = await writeProfileDiscord(member.user.id, { user: member.user });
      if (ok) updated++;
    }
    console.log(`[presence] avatar sync: ${updated} updated / ${seen} members scanned`);
  } catch (e) {
    console.warn('[presence] avatar sync failed', e?.message || e);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.User, Partials.GuildMember],
});

client.once('ready', async () => {
  console.log(`[presence] logged in as ${client.user.tag} · guild ${GUILD_ID}`);
  // Point rouge Discord (ne pas déranger) — sinon le bot reste « En ligne » (vert).
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'Matefindr', type: ActivityType.Watching }],
  });
  await syncAllGuildAvatars();
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

/* Changement de PDP Discord sans présence → resync immédiat. */
client.on('userUpdate', (oldU, newU) => {
  try {
    if (!newU || newU.bot) return;
    if (oldU && oldU.avatar === newU.avatar) return;
    writeProfileDiscord(newU.id, { user: newU }).then((ok) => {
      if (ok) console.log('[presence] avatar updated', newU.id);
    }).catch(() => {});
  } catch (e) {
    console.warn('[presence] userUpdate error', e?.message || e);
  }
});

client.login(BOT_TOKEN).catch((e) => {
  console.error('[presence] login failed', e?.message || e);
  process.exit(1);
});

process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { client.destroy(); process.exit(0); });
