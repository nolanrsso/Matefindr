/* Connexions sociales — config partagée éditeur + swipe */
(function(global){
  const CONN_APPS = [
    {id:'discord',name:'Discord',color:'5865F2',prefix:'discord.com/users/',special:'discord',placeholder:'…'},
    {id:'spotify',name:'Spotify',color:'1DB954',prefix:'open.spotify.com/user/',placeholder:'…'},
    {id:'soundcloud',name:'SoundCloud',color:'FF5500',prefix:'soundcloud.com/',placeholder:'…'},
    {id:'applemusic',name:'Apple Music',color:'FA243C',prefix:'music.apple.com/profile/',placeholder:'…'},
    {id:'deezer',name:'Deezer',color:'FEAA2D',prefix:'deezer.com/profile/',placeholder:'…'},
    {id:'x',name:'X',color:'ffffff',prefix:'x.com/',placeholder:'…'},
    {id:'tiktok',name:'TikTok',color:'ffffff',prefix:'tiktok.com/@',placeholder:'…'},
    {id:'instagram',name:'Instagram',color:'E4405F',prefix:'instagram.com/',placeholder:'…'},
    {id:'snapchat',name:'Snapchat',color:'FFFC00',prefix:'snapchat.com/add/',placeholder:'…'},
    {id:'youtube',name:'YouTube',color:'FF0000',prefix:'youtube.com/@',placeholder:'…'},
    {id:'paypal',name:'PayPal',color:'00457C',prefix:'paypal.me/',placeholder:'…'},
    {id:'telegram',name:'Telegram',color:'26A5E4',prefix:'t.me/',placeholder:'…'},
    {id:'github',name:'GitHub',color:'ffffff',prefix:'github.com/',placeholder:'…'},
    {id:'roblox',name:'Roblox',color:'ffffff',prefix:'roblox.com/users/profile?username=',placeholder:'…'},
    {id:'steam',name:'Steam',color:'ffffff',prefix:'steamcommunity.com/id/',placeholder:'…'},
    {id:'playstation',name:'PlayStation',color:'0070D1',prefix:'profile.playstation.com/',placeholder:'…'},
    {id:'xbox',name:'Xbox',color:'107C10',prefix:'xboxgamertag.com/search/',placeholder:'…'},
    {id:'twitch',name:'Twitch',color:'9146FF',prefix:'twitch.tv/',placeholder:'…'},
    {id:'kick',name:'Kick',color:'53FC18',prefix:'kick.com/',placeholder:'…'},
    {id:'pinterest',name:'Pinterest',color:'BD081C',prefix:'pinterest.com/',placeholder:'…'},
    {id:'facebook',name:'Facebook',color:'1877F2',prefix:'facebook.com/',placeholder:'…'},
    {id:'threads',name:'Threads',color:'ffffff',prefix:'threads.net/@',placeholder:'…'},
    {id:'reddit',name:'Reddit',color:'FF4500',prefix:'reddit.com/user/',placeholder:'…'},
    {id:'onlyfans',name:'OnlyFans',color:'00AFF0',prefix:'onlyfans.com/',placeholder:'…'},
    {id:'email',name:'E-mail',color:'ffffff',icon:'email',prefix:'',placeholder:'adresse@email.com',inputType:'email'},
    {id:'custom',name:'URL personnalisée',color:'ffffff',icon:'globe',prefix:'https://',placeholder:'…',wide:true},
  ];

  const CONN_BY_ID = Object.fromEntries(CONN_APPS.map(a => [a.id, a]));

  const ICON_SVG = {
    email:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>',
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
  };

  function connApp(id){ return CONN_BY_ID[id] || null; }

  function connLogo(app){
    if(typeof app === 'string') app = connApp(app);
    if(!app) return '';
    if(app.icon === 'email' || app.icon === 'globe') return '';
    return `https://cdn.simpleicons.org/${app.id}/${app.color}`;
  }

  function connIconHtml(app, size){
    if(typeof app === 'string') app = connApp(app);
    if(!app) return '';
    const px = size || 22;
    if(app.icon && ICON_SVG[app.icon])
      return `<span class="conn-ico-svg" style="width:${px}px;height:${px}px">${ICON_SVG[app.icon]}</span>`;
    const logo = connLogo(app);
    return logo ? `<img src="${logo}" alt="" width="${px}" height="${px}" loading="lazy">` : '';
  }

  function connNormalize(raw){
    if(raw == null || raw === '') return null;
    if(typeof raw === 'string') return {v: raw, mode: 'link'};
    if(typeof raw === 'object'){
      const v = raw.v != null ? String(raw.v) : (raw.value != null ? String(raw.value) : '');
      if(!v) return null;
      return {
        v,
        mode: raw.mode === 'text' ? 'text' : 'link',
        showActivity: raw.showActivity !== false,
        showStatus: raw.showStatus !== false,
        label: raw.label || '',
      };
    }
    return null;
  }

  function connGet(connObj, id){
    if(!connObj || typeof connObj !== 'object') return null;
    return connNormalize(connObj[id]);
  }

  function connIsSet(connObj, id){ return !!connGet(connObj, id); }

  function connOrderedIds(connObj){
    if(!connObj || typeof connObj !== 'object') return [];
    return CONN_APPS.map(a => a.id).filter(id => connIsSet(connObj, id));
  }

  function cleanHandle(v){
    return String(v || '').trim().replace(/^@+/, '').replace(/^\/+/, '');
  }

  function buildConnUrl(app, entry){
    const e = connNormalize(entry);
    if(!e || e.mode === 'text') return null;
    const v = e.v.trim();
    if(!v) return null;
    if(/^https?:\/\//i.test(v)) return v;
    if(typeof app === 'string') app = connApp(app);
    if(!app) return null;
    if(app.id === 'email'){
      return /^mailto:/i.test(v) ? v : `mailto:${v}`;
    }
    if(app.id === 'discord'){
      return /^\d+$/.test(v) ? `https://discord.com/users/${v}` : `https://discord.com/users/${encodeURIComponent(v)}`;
    }
    const handle = cleanHandle(v);
    if(!handle) return null;
    const p = app.prefix || '';
    if(p.startsWith('http')) return p + handle.replace(/^https?:\/\//i, '');
    return `https://${p}${handle}`;
  }

  function connDisplayText(app, entry){
    const e = connNormalize(entry);
    if(!e) return '';
    if(e.label) return e.label;
    if(typeof app === 'string') app = connApp(app);
    if(!app) return e.v;
    if(app.id === 'email') return e.v.replace(/^mailto:/i, '');
    if(/^https?:\/\//i.test(e.v)) return e.v.replace(/^https?:\/\//, '');
    const handle = cleanHandle(e.v);
    if(app.prefix && handle) return (app.prefix + handle).replace(/^https?:\/\//, '');
    return handle || e.v;
  }

  function connValueForInput(app, entry){
    const e = connNormalize(entry);
    if(!e) return '';
    if(typeof app === 'string') app = connApp(app);
    if(!app) return e.v;
    if(app.id === 'custom'){
      if(/^https?:\/\//i.test(e.v)) return e.v.replace(/^https:\/\//i, '');
      return e.v;
    }
    if(app.id === 'email') return e.v.replace(/^mailto:/i, '');
    if(app.id === 'discord') return e.v;
    return cleanHandle(e.v);
  }

  global.MatefindrConnections = {
    CONN_APPS,
    CONN_BY_ID,
    connApp,
    connLogo,
    connIconHtml,
    connNormalize,
    connGet,
    connIsSet,
    connOrderedIds,
    buildConnUrl,
    connDisplayText,
    connValueForInput,
    cleanHandle,
  };
})(typeof window !== 'undefined' ? window : global);
