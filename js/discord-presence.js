/* Sync Discord status + activity.
   Source principale = bot Gateway (bot/discord-presence) → profiles.data.discordLive.
   Ce client WS reste un fallback léger pour SA propre présence pendant qu'il est sur le site. */
(function(global){
  let ws = null, heartbeat = null, seq = null, userId = null, reconnectT = null;

  function getToken(){
    try{
      const t = localStorage.getItem('matefindr_discord_token');
      const ts = parseInt(localStorage.getItem('matefindr_discord_token_ts') || '0', 10);
      if(!t || (Date.now() - ts) > 7 * 24 * 3600 * 1000) return null;
      return t;
    }catch(_){ return null; }
  }

  function resolveAssetUrl(key, applicationId){
    if(!key) return null;
    const s = String(key);
    if(/^https?:\/\//i.test(s)) return s;
    if(s.startsWith('spotify:')) return 'https://i.scdn.co/image/' + s.slice(8);
    if(s.startsWith('mp:external/')){
      try{ return decodeURIComponent(s.split('/').slice(2).join('/')); }catch(_){ return null; }
    }
    if(s.startsWith('mp:')) return 'https://media.discordapp.net/' + s.slice(3);
    if(applicationId && /^[a-zA-Z0-9_-]+$/.test(s))
      return `https://cdn.discordapp.com/app-assets/${applicationId}/${s}.png?size=128`;
    return null;
  }

  function normalizeActivity(a){
    if(!a || typeof a !== 'object') return null;
    const application_id = a.application_id || a.applicationId || '';
    const rawAssets = a.assets || {};
    const assets = Object.assign({}, rawAssets);
    if(!assets.large_image_url && (assets.large_image || rawAssets.large_image))
      assets.large_image_url = resolveAssetUrl(assets.large_image || rawAssets.large_image, application_id);
    if(!assets.small_image_url && (assets.small_image || rawAssets.small_image))
      assets.small_image_url = resolveAssetUrl(assets.small_image || rawAssets.small_image, application_id);
    return {
      type: typeof a.type === 'number' ? a.type : 0,
      name: a.name || '',
      details: a.details || '',
      state: a.state || '',
      application_id,
      assets,
      timestamps: a.timestamps || null,
    };
  }

  /** Garde les URLs d'art déjà résolues (bot) si le Gateway local n'en a pas. */
  function mergeActivityArt(nextActs, prevActs){
    if(!Array.isArray(nextActs) || !Array.isArray(prevActs)) return nextActs || [];
    return nextActs.map(a => {
      if(a?.assets?.large_image_url) return a;
      const prev = prevActs.find(p => p && p.name === a.name && p.type === a.type);
      if(prev?.assets?.large_image_url){
        a.assets = Object.assign({}, a.assets || {}, {
          large_image_url: prev.assets.large_image_url,
          small_image_url: a.assets?.small_image_url || prev.assets.small_image_url,
        });
      }
      return a;
    });
  }

  function applyPresence(status, activities){
    const st = (global.__matefindrStateRef && global.__matefindrStateRef()) || global.state;
    if(!st || !st.user) return;
    const prev = st.user.discordLive || {};
    const now = new Date().toISOString();
    const online = status && !['offline','invisible'].includes(status);
    const wasOnline = prev.status && !['offline','invisible'].includes(prev.status);
    const nextActs = mergeActivityArt(
      (activities || []).map(normalizeActivity).filter(Boolean),
      prev.activities || []
    );
    const live = {
      status: status || 'offline',
      activities: nextActs,
      updatedAt: now,
      lastOnlineAt: online ? now : (wasOnline ? now : (prev.lastOnlineAt || null)),
      source: 'client',
    };
    st.user.discordLive = live;
    try{ if(typeof global.__matefindrSave === 'function') global.__matefindrSave(); }catch(_){}
    try{ if(typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync(); }catch(_){}
    try{
      if(typeof global.__mfRerenderDiscordFloor === 'function') global.__mfRerenderDiscordFloor();
      else if(typeof global.__matefindrRefreshCard === 'function') global.__matefindrRefreshCard();
    }catch(_){}
  }

  function disconnect(){
    clearInterval(heartbeat);
    heartbeat = null;
    if(ws){ try{ ws.close(); }catch(_){} ws = null; }
  }

  async function connect(){
    const token = getToken();
    if(!token) return;
    disconnect();
    try{
      const gw = await fetch('https://discord.com/api/v10/gateway').then(r => r.json());
      if(!gw || !gw.url) return;
      ws = new WebSocket(gw.url + '?v=10&encoding=json');
      ws.onclose = () => { ws = null; };
      ws.onerror = () => {};
      ws.onmessage = (ev) => {
        let msg;
        try{ msg = JSON.parse(ev.data); }catch(_){ return; }
        if(msg.s != null) seq = msg.s;
        if(msg.op === 10){
          clearInterval(heartbeat);
          heartbeat = setInterval(() => {
            if(ws && ws.readyState === 1) ws.send(JSON.stringify({ op: 1, d: seq }));
          }, msg.d.heartbeat_interval);
          ws.send(JSON.stringify({
            op: 2,
            d: {
              token,
              capabilities: 253,
              properties: { os: 'Windows', browser: 'Chrome', device: 'Matefindr' },
              presence: { status: 'online', since: 0, activities: [], afk: false },
              compress: false,
              client_state: { guild_versions: {} },
            },
          }));
        }
        if(msg.op === 0 && msg.t === 'READY'){
          userId = msg.d.user?.id || userId;
        }
        if(msg.op === 0 && msg.t === 'SESSIONS_REPLACE'){
          const sessions = Array.isArray(msg.d) ? msg.d : [];
          const pick = sessions.find(s => s.status && s.status !== 'offline') || sessions[0];
          if(pick) applyPresence(pick.status, pick.activities || []);
        }
        if(msg.op === 0 && msg.t === 'PRESENCE_UPDATE'){
          const d = msg.d || {};
          const uid = d.user?.id;
          if(userId && uid === userId){
            applyPresence(d.status, d.activities || []);
          }
        }
      };
    }catch(e){
      console.warn('[Matefindr] discord presence connect failed', e);
    }
  }

  function start(){
    if(reconnectT) return;
    connect();
    reconnectT = setInterval(connect, 4 * 60 * 1000);
  }

  function stop(){
    if(reconnectT){ clearInterval(reconnectT); reconnectT = null; }
    disconnect();
  }

  global.MatefindrDiscordPresence = { start, stop, applyPresence };
})(typeof window !== 'undefined' ? window : global);
