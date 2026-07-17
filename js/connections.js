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
    {id:'paypal',name:'PayPal',color:'00457C',icon:'paypal',prefix:'paypal.me/',placeholder:'…'},
    {id:'telegram',name:'Telegram',color:'26A5E4',prefix:'t.me/',placeholder:'…'},
    {id:'github',name:'GitHub',color:'ffffff',prefix:'github.com/',placeholder:'…'},
    {id:'roblox',name:'Roblox',color:'ffffff',prefix:'roblox.com/users/profile?username=',placeholder:'…'},
    {id:'steam',name:'Steam',color:'ffffff',prefix:'steamcommunity.com/id/',placeholder:'…'},
    {id:'playstation',name:'PlayStation',color:'0070D1',prefix:'profile.playstation.com/',placeholder:'…'},
    {id:'xbox',name:'Xbox',color:'107C10',icon:'xbox',prefix:'xboxgamertag.com/search/',placeholder:'…'},
    {id:'twitch',name:'Twitch',color:'9146FF',prefix:'twitch.tv/',placeholder:'…'},
    {id:'kick',name:'Kick',color:'53FC18',prefix:'kick.com/',placeholder:'…'},
    {id:'medal',name:'Medal',color:'F23B49',prefix:'medal.tv/users/',placeholder:'…',favicon:'https://www.google.com/s2/favicons?domain=medal.tv&sz=128'},
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
    xbox:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#107C10" d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 3.545 12 3.545v.006z"/></svg>',
    paypal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#003087" d="M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087z"/><path fill="#009cde" d="M19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z"/></svg>',
  };

  function connApp(id){ return CONN_BY_ID[id] || null; }

  function connLogo(app, colorOverride){
    if(typeof app === 'string') app = connApp(app);
    if(!app) return '';
    if(app.icon && ICON_SVG[app.icon]) return '';
    const col = colorOverride ? String(colorOverride).replace('#','') : app.color;
    return `https://cdn.simpleicons.org/${app.id}/${col}`;
  }

  function connSiteHost(url){
    try{
      let u=String(url||'').trim();
      if(!u) return '';
      if(!/^https?:\/\//i.test(u)) u='https://'+u;
      return new URL(u).hostname.replace(/^www\./i,'');
    }catch(_){ return ''; }
  }

  function connFaviconUrl(url){
    const host=connSiteHost(url);
    if(!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  }

  function connFaviconForEntry(entry){
    const e=connNormalize(entry);
    if(!e) return '';
    if(e.favicon) return e.favicon;
    return connFaviconUrl(e.v);
  }

  function connIconHtml(app, size, entry, uniformColor){
    if(typeof app === 'string') app = connApp(app);
    if(!app) return '';
    const px = size || 22;
    const dim = size ? ` width="${px}" height="${px}"` : '';
    const uCol = (uniformColor && /^#[0-9a-f]{6}$/i.test(uniformColor)) ? uniformColor : null;
    const sizeStyle = size ? `width:${px}px;height:${px}px` : '';
    if(app.id === 'custom'){
      const fav=connFaviconForEntry(entry);
      if(fav) return `<img src="${fav}" alt=""${dim} loading="lazy" class="conn-favicon">`;
    }
    if(app.favicon) return `<img src="${app.favicon}" alt=""${dim} loading="lazy" class="conn-favicon">`;
    if(app.icon && ICON_SVG[app.icon]){
      const style = [uCol ? `color:${uCol}` : '', sizeStyle].filter(Boolean).join(';');
      const cls = uCol ? ' conn-ico-uniform' : '';
      return `<span class="conn-ico-svg${cls}"${style ? ` style="${style}"` : ''}>${ICON_SVG[app.icon]}</span>`;
    }
    const logo = connLogo(app, uCol ? uCol.replace('#','') : null);
    return logo ? `<img src="${logo}" alt=""${dim} loading="lazy">` : '';
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
        showLabel: raw.showLabel !== false,
        label: raw.label || '',
        favicon: raw.favicon || '',
      };
    }
    return null;
  }

  const CONN_META_ORDER = '_order';

  function connIsMetaKey(id){ return id === CONN_META_ORDER; }

  function connGet(connObj, id){
    if(!connObj || typeof connObj !== 'object' || connIsMetaKey(id)) return null;
    return connNormalize(connObj[id]);
  }

  function connIsSet(connObj, id){
    if(connIsMetaKey(id)) return false;
    return !!connGet(connObj, id);
  }

  function connOrderedIds(connObj){
    if(!connObj || typeof connObj !== 'object') return [];
    const seen = new Set();
    const ordered = [];
    // Discord toujours en premier (floor fixe — non déplaçable dans l'éditeur).
    if(connIsSet(connObj, 'discord')){
      seen.add('discord');
      ordered.push('discord');
    }
    if(Array.isArray(connObj[CONN_META_ORDER])){
      connObj[CONN_META_ORDER].forEach(id => {
        if(seen.has(id) || !connIsSet(connObj, id)) return;
        seen.add(id);
        ordered.push(id);
      });
    }
    CONN_APPS.forEach(app => {
      if(seen.has(app.id) || !connIsSet(connObj, app.id)) return;
      seen.add(app.id);
      ordered.push(app.id);
    });
    return ordered;
  }

  function connSetOrder(connObj, ids){
    if(!connObj || typeof connObj !== 'object') return;
    // Discord reste piné en tête même si le drag essaie de le déplacer.
    const rest = (ids || []).filter(id => id !== 'discord' && connIsSet(connObj, id));
    connObj[CONN_META_ORDER] = connIsSet(connObj, 'discord') ? ['discord', ...rest] : rest;
  }

  function connEnsureOrder(connObj){
    connSetOrder(connObj, connOrderedIds(connObj));
  }

  function connRemove(connObj, id){
    if(!connObj || typeof connObj !== 'object' || connIsMetaKey(id)) return false;
    // Discord = statut lié au compte OAuth : non retirable (seulement prefs affichage).
    if(id === 'discord') return false;
    delete connObj[id];
    if(Array.isArray(connObj[CONN_META_ORDER]))
      connObj[CONN_META_ORDER] = connObj[CONN_META_ORDER].filter(x => x !== id);
    return true;
  }

  /** Compte créé / lié via Discord → connexion Discord obligatoire. */
  function connDiscordLocked(user){
    return !!(user && user.discordId);
  }

  /**
   * Garantit la présence de connections.discord pour un compte Discord.
   * Préserve showActivity / showStatus / showLabel si déjà définis.
   * @returns {boolean} true si ajout ou identité mise à jour
   */
  function ensureDiscordConnection(user, connObj){
    if(!user || !user.discordId || !connObj || typeof connObj !== 'object') return false;
    const id = String(user.discordId);
    const tag = String(user.discordTag || '').replace(/^@+/, '').replace(/#0$/, '');
    const cur = connNormalize(connObj.discord);
    if(cur){
      let dirty = false;
      const next = {
        v: id,
        mode: cur.mode === 'text' ? 'text' : 'link',
        showActivity: cur.showActivity !== false,
        showStatus: cur.showStatus !== false,
        showLabel: cur.showLabel !== false,
        label: tag || cur.label || '',
      };
      if(String(cur.v) !== id) dirty = true;
      if((cur.label || '') !== (next.label || '')) dirty = true;
      if(cur.showActivity === undefined || cur.showStatus === undefined || cur.showLabel === undefined) dirty = true;
      connObj.discord = next;
      return dirty;
    }
    connObj.discord = {
      v: id,
      mode: 'link',
      label: tag,
      showLabel: true,
      showActivity: true,
      showStatus: true,
    };
    connEnsureOrder(connObj);
    return true;
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

  function connProfileLabel(app, entry, profileTag){
    const e = connNormalize(entry);
    if(!e) return '';
    if(e.label) return cleanHandle(e.label);
    if(typeof app === 'string') app = connApp(app);
    if(app && app.id === 'discord'){
      if(profileTag) return cleanHandle(profileTag);
      if(e.v && !/^\d{15,22}$/.test(String(e.v).trim())) return cleanHandle(e.v);
      return '';
    }
    if(app && app.id === 'email') return e.v.replace(/^mailto:/i, '');
    if(app && app.id === 'custom'){
      const host=connSiteHost(e.v);
      if(host) return host;
    }
    return cleanHandle(e.v) || '';
  }

  function connCardHtml(app, entry, profileTag, esc, uniformColor){
    const e = connNormalize(entry);
    if(!e) return '';
    if(typeof app === 'string') app = connApp(app);
    const escFn = typeof esc === 'function' ? esc : s => String(s);
    const href = buildConnUrl(app, entry);
    const isDiscord = !!(app && app.id === 'discord');
    const showUser = e.showLabel !== false;
    // Discord : toujours le label (visible ou flouté). Autres : seulement si coché (révélation au survol).
    const user = (isDiscord || showUser) ? connProfileLabel(app, entry, profileTag) : '';
    const iconHtml = connIconHtml(app, null, e, uniformColor);
    let userCls = 'card-conn-user';
    let labelCls = '';
    if(user){
      if(isDiscord){
        if(!showUser){ userCls += ' card-conn-user--blur'; labelCls = ' card-conn--label-blur'; }
        else labelCls = ' card-conn--label-always';
      } else {
        labelCls = ' card-conn--hover-label';
      }
    }
    const labelHtml = user ? `<span class="${userCls}">${escFn(user)}</span>` : '';
    const inner = `<span class="card-conn-ico">${iconHtml}</span>${labelHtml}`;
    const name = app ? app.name : 'Connexion';
    const titleUser = user && (isDiscord ? showUser : true) ? ' · '+escFn(user) : '';
    if(e.mode !== 'text' && href)
      return `<a href="${href}" target="_blank" rel="noopener" class="card-conn${labelCls}" title="${escFn(name)}${titleUser}">${inner}</a>`;
    return `<span class="card-conn${labelCls}" title="${escFn(name)}${titleUser}">${inner}</span>`;
  }

  function connDisplayText(app, entry, profileTag){
    const user = connProfileLabel(app, entry, profileTag);
    if(user) return user;
    const e = connNormalize(entry);
    if(!e) return '';
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
    connSetOrder,
    connEnsureOrder,
    connRemove,
    connDiscordLocked,
    ensureDiscordConnection,
    buildConnUrl,
    connProfileLabel,
    connCardHtml,
    connDisplayText,
    connValueForInput,
    connFaviconUrl,
    connFaviconForEntry,
    connSiteHost,
    cleanHandle,
  };
})(typeof window !== 'undefined' ? window : global);
