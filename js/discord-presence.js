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

  function normalizeActivity(a){
    if(!a || typeof a !== 'object') return null;
    return {
      type: typeof a.type === 'number' ? a.type : 0,
      name: a.name || '',
      details: a.details || '',
      state: a.state || '',
      application_id: a.application_id || '',
      assets: a.assets || {},
      timestamps: a.timestamps || null,
    };
  }

  function applyPresence(status, activities){
    const st = (global.__matefindrStateRef && global.__matefindrStateRef()) || global.state;
    if(!st || !st.user) return;
    const prev = st.user.discordLive || {};
    const now = new Date().toISOString();
    const online = status && !['offline','invisible'].includes(status);
    const wasOnline = prev.status && !['offline','invisible'].includes(prev.status);
    const live = {
      status: status || 'offline',
      activities: (activities || []).map(normalizeActivity).filter(Boolean),
      updatedAt: now,
      lastOnlineAt: online ? now : (wasOnline ? now : (prev.lastOnlineAt || null)),
    };
    st.user.discordLive = live;
    try{ if(typeof global.__matefindrSave === 'function') global.__matefindrSave(); }catch(_){}
    try{ if(typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync(); }catch(_){}
    try{
      if(typeof global.__matefindrRefreshCard === 'function') global.__matefindrRefreshCard();
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
