  /* ====== Supabase client (real Discord OAuth) ====== */
  const SUPABASE_URL = 'https://pdhffpxssagclexttfox.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkaGZmcHhzc2FnY2xleHR0Zm94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzA4NjgsImV4cCI6MjA5NjI0Njg2OH0.wqnVvxAcjMGfl6QgeUfgEs4EEJAQDjVLMOwy676sccg';
  const supa = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
  window.__supa = supa;

  /* Redimensionne/compresse une image côté client avant upload (évite les
     photos de plusieurs Mo qui gonflaient la base en base64). */
  function resizeImageFile(file, maxDim, quality){
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale); height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  /* Upload un blob vers Supabase Storage (bucket profile-media, un dossier par
     user id) et retourne l'URL publique. Remplace le stockage base64 en base
     (qui faisait exploser la taille de la DB à quelques dizaines d'utilisateurs). */
  async function uploadProfileMedia(blob, kind /* 'avatar' | 'banner' */){
    if (!window.__supa) return null;
    const { data: { session } } = await window.__supa.auth.getSession();
    if (!session) return null;
    const path = session.user.id + '/' + kind + '-' + Date.now() + '.jpg';
    const { error } = await window.__supa.storage.from('profile-media').upload(path, blob, {
      upsert: true, contentType: 'image/jpeg',
    });
    if (error) { console.warn('uploadProfileMedia failed', error); return null; }
    const { data } = window.__supa.storage.from('profile-media').getPublicUrl(path);
    return data && data.publicUrl;
  }

  /* Fetch full Discord profile (banner, badges, decoration) via provider token.
     Supabase only mirrors a subset of fields into user_metadata, so we hit
     Discord directly with the OAuth access token to get the rest. */
  async function fetchDiscordProfile(accessToken){
    if (!accessToken) return null;
    try {
      const r = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  async function fetchDiscordGuilds(accessToken){
    if (!accessToken) return [];
    try {
      const r = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: 'Bearer ' + accessToken },
      });
      if (!r.ok) {
        console.warn('[Matefindr] Discord guilds fetch failed:', r.status);
        return [];
      }
      const list = await r.json();
      // Keep what we need: id, name, icon hash → URL
      return (list || []).map(g => ({
        id: g.id,
        name: g.name,
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith('a_') ? 'gif' : 'png'}?size=64` : null,
      }));
    } catch { return []; }
  }
  const DISCORD_TOKEN_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
  function getStoredDiscordToken(discordId){
    const stored = localStorage.getItem('matefindr_discord_token');
    const storedUid = localStorage.getItem('matefindr_discord_token_uid');
    const ts = parseInt(localStorage.getItem('matefindr_discord_token_ts') || '0', 10);
    if (!stored || !discordId || storedUid !== String(discordId)) return null;
    if ((Date.now() - ts) > DISCORD_TOKEN_MAX_AGE_MS) return null;
    return stored;
  }
  async function refreshDiscordGuildsForUser(discordId){
    const token = getStoredDiscordToken(discordId);
    if (!token) return null;
    const guilds = await fetchDiscordGuilds(token);
    return guilds.length ? guilds : null;
  }
  function discordBannerUrl(id, hash){
    if (!id || !hash) return null;
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/banners/${id}/${hash}.${ext}?size=600`;
  }
  function discordAvatarUrl(id, hash){
    if (!id || !hash) return null;
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=256`;
  }
  function discordDecorationUrl(asset){
    // Discord serves the decoration as an animated APNG. The `passthrough=false`
    // variant returns a STATIC version, so we use the default (animated) URL.
    // `size=128` gives a high-res asset that scales cleanly.
    return asset ? `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?size=128` : null;
  }

  /* Build the user payload Matefindr expects from a Supabase session.
     If we have a provider_token, we enrich with a direct Discord API call so
     we always get banner / decoration / public_flags / premium_type / accent_color. */
  async function userFromSupabaseSession(session){
    if (!session || !session.user) return null;
    const u = session.user;
    const m = u.user_metadata || {};
    let id = m.provider_id || m.sub || u.id;

    // Defaults from Supabase metadata (always present)
    let avatar_url = m.avatar_url || null;
    let discord_avatar_url = avatar_url;
    let banner_url = discordBannerUrl(id, m.banner);
    let deco = m.avatar_decoration_data || m.custom_claims?.avatar_decoration_data;
    let decoration_url = discordDecorationUrl(deco?.asset);
    let public_flags = m.public_flags || 0;
    let premium_type = m.premium_type || 0;
    let accent_color = m.accent_color || null;
    let displayName = m.global_name || m.full_name || m.name || m.user_name || 'Discord user';
    let discordTag  = (m.user_name || m.preferred_username || m.name || '').replace(/#0$/, '') || null;

    // Enrich from Discord API if provider_token is available.
    // Try session first, fallback to localStorage (captured at OAuth callback).
    let token = session.provider_token;
    if (!token) {
      const stored = localStorage.getItem('matefindr_discord_token');
      const storedUid = localStorage.getItem('matefindr_discord_token_uid');
      const ts = parseInt(localStorage.getItem('matefindr_discord_token_ts') || '0', 10);
      // Discord access tokens last ~7 days; we keep ours up to 24h to be safe.
      // CRITIQUE : un token stocké pour un AUTRE compte Supabase (session précédente,
      // pas nettoyée à la déconnexion) ne doit JAMAIS être réutilisé ici — sinon on
      // récupère l'identité Discord de l'ancien compte et on l'attribue au nouveau
      // (fuite de profil entre comptes).
      if (stored && storedUid === id && (Date.now() - ts) < DISCORD_TOKEN_MAX_AGE_MS) token = stored;
    }
    let guilds = [];
    if (token) {
      console.log('[Matefindr] Fetching real Discord profile…');
      const d = await fetchDiscordProfile(token);
      console.log('[Matefindr] Discord profile:', d);
      if (d) {
        id = d.id || id;
        if (d.avatar) {
          avatar_url = discordAvatarUrl(d.id, d.avatar);
          discord_avatar_url = avatar_url;
        }
        if (d.banner) banner_url = discordBannerUrl(d.id, d.banner);
        if (d.avatar_decoration_data?.asset) decoration_url = discordDecorationUrl(d.avatar_decoration_data.asset);
        public_flags = (typeof d.public_flags === 'number') ? d.public_flags : public_flags;
        premium_type = (typeof d.premium_type === 'number') ? d.premium_type : premium_type;
        accent_color = (typeof d.accent_color === 'number') ? d.accent_color : accent_color;
        displayName  = d.global_name || d.username || displayName;
        discordTag   = (d.username || '').replace(/#0$/, '') || discordTag;
      }
      guilds = await fetchDiscordGuilds(token);
      console.log('[Matefindr] Discord guilds:', guilds.length);
    }

    return {
      displayName,
      discordTag,
      discordId:   id,
      email:       u.email || m.email || null,
      avatarUrl:   avatar_url,
      discordAvatarUrl: discord_avatar_url,
      bannerUrl:   banner_url,
      decorationUrl: decoration_url,
      publicFlags: public_flags,
      premiumType: premium_type,
      accentColor: accent_color,
      guilds,
      mode:        'discord',
    };
  }

  /* Kick off Discord OAuth through Supabase. */
  function signInWithDiscord(){
    if (!supa) { alert('Supabase non chargé.'); return; }
    return supa.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        scopes: 'identify email guilds guilds.join',
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
  }
  window.signInWithDiscord = signInWithDiscord;
  window.__refreshDiscordGuilds = refreshDiscordGuildsForUser;
  window.getStoredDiscordToken = getStoredDiscordToken;
  window.fetchDiscordProfile = fetchDiscordProfile;
  window.discordAvatarUrl = discordAvatarUrl;

  /* Slugs réservés pour matefindr.com/<slug> — routes système, jamais assignables. */
  window.__mfReservedSlugs = [
    'editor', 'index', 'settings', 'checkout', 'rules',
    'admin', 'v2', 'assets', 'js', 'css', 'supabase', 'api', 'favicon',
  ];
  window.__mfIsReservedSlug = function(slug){
    return window.__mfReservedSlugs.includes(String(slug || '').toLowerCase());
  };

