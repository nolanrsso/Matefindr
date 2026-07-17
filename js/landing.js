  /* ====== Animated bubble field with mouse repulsion + click explosion ====== */
  const layer = document.getElementById('bubbles');

  const ICONS = {
    pad:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="12" r=".9" fill="currentColor"/><circle cx="17.5" cy="14" r=".9" fill="currentColor"/><path d="M6 18c-2.5 0-4-1.7-4-4 0-3 1.5-7 4-7h12c2.5 0 4 4 4 7 0 2.3-1.5 4-4 4-1.8 0-2.6-2-4-2h-4c-1.4 0-2.2 2-4 2Z"/></svg>',
    mic:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>',
    dice:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1" fill="currentColor" stroke="none"/></svg>',
    chat:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12c0 4.4-4 8-9 8-1.3 0-2.6-.3-3.7-.7L3 21l1.3-4.6C3.5 15.1 3 13.6 3 12c0-4.4 4-8 9-8s9 3.6 9 8Z"/></svg>',
    heart:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.3-9.3C1 8.3 3 4.5 6.7 4.5c1.9 0 3.5 1 4.3 2.4l1 1.7 1-1.7C13.8 5.5 15.4 4.5 17.3 4.5 21 4.5 23 8.3 21.3 11.7 19 16.5 12 21 12 21Z"/></svg>',
    ghost:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V10a7 7 0 0 1 14 0v11l-2-2-2 2-2-2-2 2-2-2-2 2-2-2Z"/><circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none"/></svg>',
    bolt:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg>',
    sparkle:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/></svg>',
    star:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.4 7 .7-5.3 4.7 1.6 6.8L12 17.7l-6.2 3.4 1.6-6.8L2.1 9.6l7-.7L12 2.5Z"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
    discord:'<svg viewBox="0 0 127 96" fill="currentColor"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2.04 20.94 9.86 43.7 9.86 64.64 0 .87.7 1.76 1.38 2.66 2.04a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.15c2.64-27.38-4.51-51.11-18.91-72.14ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg>',
  };

  /* Images de marque pour le hub (CDN stables, hotlink OK) — fallback emoji si échec */
  const HUB_MEDIA = {
    carti:      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/ba/1e/05/ba1e058e-5637-e53c-563c-f5b9a1a6c344/20UM1IM18331.rgb.jpg/300x300bb.jpg',
    minecraft:  'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c9/81/16/c981164e-410c-7a07-d76b-3a8e4238793b/AppIcon-0-0-1x_U007emarketing-0-10-0-85-220.png/300x300bb.jpg',
    tokyoghoul: 'https://cdn.myanimelist.net/images/anime/1498/134443.jpg',
    valorant:   'https://cdn.simpleicons.org/valorant/ffffff',
  };

  const AVATAR_PALETTES = [
    ['#FF7EB6','#9146FF','#fff'],
    ['#5BE9FF','#9146FF','#fff'],
    ['#FFB66E','#FF4FA0','#0D0B1E'],
    ['#3BD17C','#5BE9FF','#0D0B1E'],
    ['#A65BFF','#FF7EB6','#fff'],
  ];

  const CONFIG = [
    { kind:'img',   src:HUB_MEDIA.carti,      fb:'💿', size:118, hue:'#c0152b' },
    { kind:'logo',  src:HUB_MEDIA.valorant,   fb:'🎯', size:100, hue:'#FF4655', bg:'linear-gradient(150deg,#FF4655,#8a1020)' },
    { kind:'img',   src:HUB_MEDIA.minecraft,  fb:'⛏️', size:104, hue:'#5d9c3c' },
    { kind:'img',   src:HUB_MEDIA.tokyoghoul, fb:'🎭', size:112, hue:'#8a0f1a' },
    { kind:'glyph', glyph:'♂', size:80, hue:'#5B8DEF', color:'#9DC3FF' },
    { kind:'glyph', glyph:'♀', size:74, hue:'#FF7EB6', color:'#FFB3D8' },
    { kind:'icon',  icon:'chat',    size:82, hue:'#5BE9FF' },
    { kind:'icon',  icon:'discord', size:96, hue:'#5865F2' },
    { kind:'icon',  icon:'heart',   size:86, hue:'#FF4FA0' },
  ];

  let W = layer.clientWidth, H = layer.clientHeight;
  const bubbles = [];
  const mouse = { x: -9999, y: -9999, has: false };
  // exclusion zone (center text)
  function centerRect(){
    const r = layer.getBoundingClientRect();
    return {
      cx: r.width/2, cy: r.height/2,
      w: Math.min(r.width*.7, 760), h: 360
    };
  }

  function rand(a,b){ return a + Math.random()*(b-a); }

  function spawn(cfg, idx, initial){
    const c = centerRect();
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.width = cfg.size + 'px';
    el.style.height = cfg.size + 'px';
    // Taille de base exposée en variable CSS : permet à la media query de
    // recalculer une taille responsive (fluide) tout en gardant les
    // proportions relatives entre bulles (grosse pochette vs petit glyphe).
    el.style.setProperty('--bsize', cfg.size + 'px');

    if (cfg.kind === 'icon'){
      el.innerHTML = `<div class="glow" style="background:${cfg.hue}"></div>${ICONS[cfg.icon]}`;
    } else if (cfg.kind === 'glyph'){
      el.innerHTML = `<div class="glow" style="background:${cfg.hue}"></div><div class="b-glyph" style="color:${cfg.color || '#fff'}">${cfg.glyph}</div>`;
    } else if (cfg.kind === 'img' || cfg.kind === 'logo'){
      if (cfg.bg) el.style.background = cfg.bg;
      const cls = cfg.kind === 'logo' ? 'b-logo' : 'b-img';
      el.innerHTML = `<div class="glow" style="background:${cfg.hue}"></div><img class="${cls}" src="${cfg.src}" alt="" loading="lazy">`;
      const img = el.querySelector('img');
      img.addEventListener('error', () => { img.outerHTML = `<div class="b-glyph">${cfg.fb || '✨'}</div>`; });
    } else {
      const p = AVATAR_PALETTES[cfg.palette];
      el.innerHTML = `<div class="glow" style="background:${p[0]}"></div><div class="face" style="background:linear-gradient(135deg,${p[0]},${p[1]});color:${p[2]}">${cfg.letter}</div>`;
    }

    // pick a position outside the center text rect
    let x, y, tries = 0;
    do {
      x = rand(20, W - cfg.size - 20);
      y = rand(20, H - cfg.size - 20);
      tries++;
    } while (insideCenter(x + cfg.size/2, y + cfg.size/2, c) && tries < 40);

    const b = {
      el, cfg,
      x, y,
      // free-drifting velocity
      vx: rand(-.16,.16), vy: rand(-.16,.16),
      r: cfg.size/2,
      // wandering phases — keep the bubble gently drifting on its own
      wphase: Math.random()*Math.PI*2,
      wphase2: Math.random()*Math.PI*2,
      wspd: rand(.008,.014),
      idx,
      alive: true,
    };
    layer.appendChild(el);
    el.addEventListener('click', (e) => { e.stopPropagation(); explode(b); });
    bubbles.push(b);
    return b;
  }

  function insideCenter(px, py, c){
    return Math.abs(px - c.cx) < c.w/2 && Math.abs(py - c.cy) < c.h/2;
  }

  function init(){
    W = layer.clientWidth; H = layer.clientHeight;
    layer.innerHTML = '';
    bubbles.length = 0;
    CONFIG.forEach((cfg, i) => spawn(cfg, i, true));
  }

  function resize(){
    W = layer.clientWidth; H = layer.clientHeight;
  }
  window.addEventListener('resize', resize);

  window.addEventListener('mousemove', (e) => {
    const r = layer.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.has = true;
  });
  window.addEventListener('mouseleave', () => { mouse.has = false; mouse.x = -9999; mouse.y = -9999; });

  /* explosion */
  function explode(b){
    if (!b.alive) return;
    b.alive = false;

    // Center computed from the actual rendered bubble — bulletproof against any
    // transform / layout edge case. (cx, cy) are coords inside the .bubbles layer.
    const bubbleRect = b.el.getBoundingClientRect();
    const layerRect  = layer.getBoundingClientRect();
    const cx = bubbleRect.left - layerRect.left + bubbleRect.width  / 2;
    const cy = bubbleRect.top  - layerRect.top  + bubbleRect.height / 2;

    const palette = b.cfg.kind === 'avatar'
      ? AVATAR_PALETTES[b.cfg.palette]
      : [b.cfg.hue, '#FF7EB6', '#fff'];
    const main = palette[0];
    const accent = palette[1] || '#FF7EB6';

    // 1) Core flash (white → main color) — short, bright
    const flash = document.createElement('div');
    flash.className = 'particle';
    flash.style.cssText = `left:${cx}px;top:${cy}px;width:${b.r*2.2}px;height:${b.r*2.2}px;border-radius:50%;background:radial-gradient(circle, #fff 0%, ${main} 45%, transparent 72%);transform:translate(-50%,-50%) scale(.4);mix-blend-mode:screen;filter:blur(3px)`;
    layer.appendChild(flash);
    flash.animate(
      [{transform:'translate(-50%,-50%) scale(.4)', opacity:1},
       {transform:'translate(-50%,-50%) scale(1.5)', opacity:.85, offset:.35},
       {transform:'translate(-50%,-50%) scale(2.4)', opacity:0}],
      {duration:380, easing:'cubic-bezier(.1,.7,.3,1)', fill:'forwards'}
    ).onfinish = () => flash.remove();

    // 2) Single clean shockwave ring
    const ring = document.createElement('div');
    ring.className = 'particle';
    ring.style.cssText = `left:${cx}px;top:${cy}px;width:${b.r*2}px;height:${b.r*2}px;border-radius:50%;border:2px solid ${main};transform:translate(-50%,-50%) scale(.7);box-shadow:0 0 24px ${main}, inset 0 0 12px ${main}80`;
    layer.appendChild(ring);
    ring.animate(
      [{transform:'translate(-50%,-50%) scale(.7)', opacity:.9, borderWidth:'2px'},
       {transform:'translate(-50%,-50%) scale(2.8)', opacity:0,  borderWidth:'.5px'}],
      {duration:650, easing:'cubic-bezier(.2,.7,.25,1)', fill:'forwards'}
    ).onfinish = () => ring.remove();

    // 3) Confetti shards — colored chunks tumbling outward
    const shardCount = 7;
    for (let i=0; i<shardCount; i++){
      const s = document.createElement('div');
      const ssize = rand(b.r*.35, b.r*.7);
      const c = palette[i % palette.length];
      s.className = 'particle';
      s.style.cssText = `left:${cx}px;top:${cy}px;width:${ssize}px;height:${ssize*rand(.5,1)}px;border-radius:${rand(20,50)}% ${rand(40,70)}% ${rand(30,60)}% ${rand(20,50)}%;background:linear-gradient(135deg, ${c}, ${c}66);border:1px solid rgba(255,255,255,.4);box-shadow:0 4px 14px ${c}88;transform:translate(-50%,-50%);`;
      layer.appendChild(s);
      const ang = (i/shardCount)*Math.PI*2 + rand(-.3,.3);
      const dist = rand(110, 200);
      const dx = Math.cos(ang)*dist;
      const dy = Math.sin(ang)*dist;
      const rot = rand(-480, 480);
      const dur = rand(750, 1100);
      s.animate(
        [{transform:'translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1)', opacity:1},
         {transform:`translate(-50%,-50%) translate(${dx*.55}px, ${dy*.55 - 16}px) rotate(${rot*.5}deg) scale(.95)`, opacity:.95, offset:.45},
         {transform:`translate(-50%,-50%) translate(${dx}px, ${dy + dist*.85}px) rotate(${rot}deg) scale(.35)`, opacity:0}],
        {duration:dur, easing:'cubic-bezier(.2,.6,.3,1)', fill:'forwards'}
      ).onfinish = () => s.remove();
    }

    // 4) Sparks — small bright dots, radial burst with gravity
    const sparkN = 24 + Math.floor(Math.random()*6);
    for (let i=0; i<sparkN; i++){
      const p = document.createElement('div');
      const size = rand(3, 6);
      const c = palette[i % palette.length];
      p.className = 'particle';
      p.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;border-radius:50%;background:${c};box-shadow:0 0 12px ${c}, 0 0 3px #fff;transform:translate(-50%,-50%)`;
      layer.appendChild(p);
      const ang = (i / sparkN) * Math.PI*2 + rand(-.25,.25);
      const dist = rand(90, 240);
      const dx = Math.cos(ang)*dist;
      const dy = Math.sin(ang)*dist;
      const grav = rand(70, 140);
      const dur = rand(700, 1100);
      p.animate(
        [{transform:'translate(-50%,-50%) translate(0,0) scale(1.3)', opacity:1},
         {transform:`translate(-50%,-50%) translate(${dx*.5}px,${dy*.5 - 4}px) scale(1)`, opacity:1, offset:.3},
         {transform:`translate(-50%,-50%) translate(${dx}px,${dy + grav}px) scale(.15)`, opacity:0}],
        {duration:dur, easing:'cubic-bezier(.2,.55,.3,1)', fill:'forwards'}
      ).onfinish = () => p.remove();
    }

    // 5) Dying bubble — animate with translate preserved (no class‑based @keyframes
    //    which would clobber the translate and visually “reset” the bubble to 0,0).
    const startT = `translate(${b.x}px, ${b.y}px)`;
    b.el.style.pointerEvents = 'none';
    b.el.animate(
      [{transform:`${startT} scale(1) rotate(0)`,    opacity:1, filter:'brightness(1)'},
       {transform:`${startT} scale(1.25) rotate(6deg)`, opacity:1, filter:'brightness(2)', offset:.28},
       {transform:`${startT} scale(.15) rotate(-32deg)`, opacity:0, filter:'brightness(3)'}],
      {duration:380, easing:'cubic-bezier(.2,.7,.3,1)', fill:'forwards'}
    ).onfinish = () => b.el.remove();

    // 6) Shockwave — nudge nearby bubbles outward (also feeds collision system)
    for (const other of bubbles){
      if (other === b || !other.alive) continue;
      const ox = other.x + other.r, oy = other.y + other.r;
      const dx = ox - cx, dy = oy - cy;
      const d = Math.hypot(dx, dy);
      const range = 220;
      if (d < range){
        const force = (1 - d/range) * 12;
        const nx = dx / (d || 1), ny = dy / (d || 1);
        other.vx += nx * force;
        other.vy += ny * force;
      }
    }

    // respawn after 15 seconds
    setTimeout(() => respawn(b.cfg, b.idx), 15000);
    const idx = bubbles.indexOf(b);
    if (idx >= 0) bubbles.splice(idx, 1);
  }

  function respawn(cfg, idx){
    const c = centerRect();
    // enter from a random wall, drifting inward
    const fromRight = Math.random() < 0.5;
    const x = fromRight ? W + cfg.size : -cfg.size;
    const y = rand(20, H - cfg.size - 20);
    const b = spawn(cfg, idx, false);
    b.x = x; b.y = y;
    // head toward a random spot outside the center text
    let ax, ay, tries=0;
    do {
      ax = rand(40, W - cfg.size - 40);
      ay = rand(40, H - cfg.size - 40);
      tries++;
    } while (insideCenter(ax + cfg.size/2, ay + cfg.size/2, c) && tries < 40);
    b.vx = (ax - b.x) * 0.012;
    b.vy = (ay - b.y) * 0.012;
  }

  /* simulation */
  function step(){
    const c = centerRect();
    for (const b of bubbles){
      if (!b.alive) continue;

      // 1) wandering très léger — dérive lente quand on n'interagit pas
      b.wphase  += b.wspd;
      b.wphase2 += b.wspd * 0.7;
      b.vx += Math.cos(b.wphase)  * 0.0112;
      b.vy += Math.sin(b.wphase2) * 0.0112;

      // 2) mouse interaction — grand rayon, MAIS zone d'attrape près du curseur
      if (mouse.has){
        const dx = (b.x + b.r) - mouse.x;
        const dy = (b.y + b.r) - mouse.y;
        const d2 = dx*dx + dy*dy;
        const range  = 320;              // grand rayon de répulsion
        const catchR = b.r;              // frein seulement dans la zone cliquable de la bulle
        if (d2 < catchR*catchR){
          // curseur posé sur la bulle → pas de frein, elle garde sa glisse
          // (le push est annulé ici pour qu'elle reste facile à cliquer)
        } else if (d2 < range*range){
          const d = Math.sqrt(d2) || 1;
          // poussée qui culmine à mi-distance et S'ANNULE près du curseur
          const t = (d - catchR) / (range - catchR);   // 0 près, 1 au bord
          const force = Math.sin(t * Math.PI);          // 0 aux extrémités, 1 au milieu
          b.vx += (dx/d) * force * 0.48;
          b.vy += (dy/d) * force * 0.48;
        }
      }

      // 3) soft push away from center text rect
      const px = b.x + b.r, py = b.y + b.r;
      if (insideCenter(px, py, c)){
        const dx = px - c.cx, dy = py - c.cy;
        const d = Math.hypot(dx,dy) || 1;
        b.vx += (dx/d) * 0.24;
        b.vy += (dy/d) * 0.24;
      }

      // 4) damping plus fort = repos beaucoup plus lent
      b.vx *= 0.965;
      b.vy *= 0.965;

      // clamp max speed — doux
      const sp = Math.hypot(b.vx, b.vy);
      const max = 1.92;
      if (sp > max){ b.vx = b.vx/sp*max; b.vy = b.vy/sp*max; }

      b.x += b.vx;
      b.y += b.vy;

      // bounce off walls
      if (b.x < 8){ b.x = 8; b.vx = Math.abs(b.vx)*.65; }
      if (b.x + b.cfg.size > W - 8){ b.x = W - 8 - b.cfg.size; b.vx = -Math.abs(b.vx)*.65; }
      if (b.y < 8){ b.y = 8; b.vy = Math.abs(b.vy)*.65; }
      if (b.y + b.cfg.size > H - 8){ b.y = H - 8 - b.cfg.size; b.vy = -Math.abs(b.vy)*.65; }
    }

    // === bubble ↔ bubble collisions ===
    for (let i=0; i<bubbles.length; i++){
      const a = bubbles[i];
      if (!a.alive) continue;
      for (let j=i+1; j<bubbles.length; j++){
        const b2 = bubbles[j];
        if (!b2.alive) continue;
        const ax = a.x + a.r, ay = a.y + a.r;
        const bx = b2.x + b2.r, by = b2.y + b2.r;
        const dx = bx - ax, dy = by - ay;
        const minDist = a.r + b2.r;
        const d2 = dx*dx + dy*dy;
        if (d2 < minDist*minDist && d2 > 0.0001){
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          // positional correction (equal mass)
          const overlap = (minDist - d) * 0.5;
          a.x  -= nx * overlap;  a.y  -= ny * overlap;
          b2.x += nx * overlap;  b2.y += ny * overlap;
          // elastic exchange along normal
          const va = a.vx*nx + a.vy*ny;
          const vb = b2.vx*nx + b2.vy*ny;
          if (va - vb > 0) continue;
          const restitution = 0.8;
          const impulse = (vb - va) * restitution;
          a.vx  += nx * impulse;  a.vy  += ny * impulse;
          b2.vx -= nx * impulse;  b2.vy -= ny * impulse;
        }
      }
    }

    // commit transforms
    for (const b of bubbles){
      if (!b.alive) continue;
      b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }
    requestAnimationFrame(step);
  }

  // Bulles créées seulement si largeur ET hauteur ≥1000px (aligné sur le CSS).
  const _noBubbles = !window.matchMedia('(min-width:1000px) and (min-height:1000px)').matches;
  if (_noBubbles) { layer.style.display = 'none'; }
  else { init(); requestAnimationFrame(step); }

  // background blob parallax
  const blobsEls = document.querySelectorAll('.blob');
  let rx=0, ry=0, tx=0, ty=0;
  window.addEventListener('mousemove', (e) => {
    tx = (e.clientX / window.innerWidth - .5) * 30;
    ty = (e.clientY / window.innerHeight - .5) * 30;
  }, { passive:true });
  function blobTick(){
    rx += (tx-rx)*.04; ry += (ty-ry)*.04;
    blobsEls.forEach((b,i) => {
      const f = (i+1)*0.6;
      b.style.translate = `${rx*f}px ${ry*f}px`;
    });
    requestAnimationFrame(blobTick);
  }
  blobTick();

  // Nombre RÉEL de membres en ligne sur le serveur Discord, via l'API d'invitation
  // publique (with_counts) — CORS autorisé, aucun token requis. Rafraîchi toutes les 60 s.
  const el = document.getElementById('onlineCount');
  if (el) {
    const INVITE = 'hxCBJGPDsP';
    const fmt = v => v.toLocaleString('fr-FR').replace(/,/g, ' ');
    let shown = null;
    function animateTo(target){
      let n = shown == null ? Math.max(0, target - Math.min(6, target)) : shown;
      const step = setInterval(() => {
        n += Math.sign(target - n) || 0;
        el.textContent = fmt(n);
        shown = n;
        if (n === target) clearInterval(step);
      }, 70);
    }
    async function fetchOnline(){
      try {
        const r = await fetch('https://discord.com/api/v10/invites/' + INVITE + '?with_counts=true');
        if (!r.ok) return;
        const j = await r.json();
        const n = j.approximate_presence_count;
        if (typeof n === 'number' && n !== shown) animateTo(n);
      } catch(_){ /* hors-ligne / rate-limit : on garde la dernière valeur */ }
    }
    fetchOnline();
    setInterval(fetchOnline, 60000);
  }

  // Shared i18n dictionary (used by language switcher AND auth modal)
  const I18N = {
      FR: {
        login:        'Se connecter',
        badge:        'Bêta fermée',
        tagline:      'Trouve un <span class="accent">Mate</span>, pas un random',
        sub:          '<b>Swipe</b> des profils Discord, <b>Like</b> les pépites à ton goût<br><b>Match</b> et à toi de jouer',
        cta:          'Se connecter avec Discord',
        online:       'en ligne',
        tags:         'Gaming <span class="sep">·</span> Chat <span class="sep">·</span> Rencontres',
        footer:       'EXPLOSE LES BULLES, ON SAIT JAMAIS, ELLES TE CACHENT PEUT-ÊTRE QUELQUE CHOSE',
        auth_title:   'Se connecter',
        auth_sub:     'Choisis ta méthode préférée',
        auth_discord: 'Continuer avec Discord',
        auth_email:   'Continuer avec un email',
        email_title:  'Connexion par email',
        email_sub:    'Entre tes identifiants pour continuer',
        email_label:  'Adresse email',
        pw_label:     'Mot de passe',
        username_label: 'Pseudo',
        remember:     'Se souvenir de moi',
        forgot:       'Mot de passe oublié ?',
        email_submit: 'Se connecter',
        cta_email_link: 'Se connecter par email',
        no_account:   'Pas encore de compte ?',
        signup:       "S'inscrire",
        signup_title: 'Créer un compte',
        signup_sub:   'Rejoins Matefindr en 30 secondes',
        signup_submit:'Créer mon compte',
        has_account:  'Déjà inscrit ?',
        sign_in:      'Se connecter',
        msg_signed:   'Connexion réussie. Bienvenue !',
        msg_created:  'Compte créé. Bienvenue sur Matefindr !',
        msg_confirm_email: "Compte créé, vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.",
        msg_reset_sent: 'Email envoyé, vérifie ta boîte de réception pour réinitialiser ton mot de passe.',
        msg_username_required: 'Choisis un pseudo pour continuer.',
        msg_invalid:  'Email ou mot de passe invalide.',
        msg_short_pw: 'Le mot de passe doit faire au moins 6 caractères.',
        my_account:   'Mon profil',
        onb_q1:       'Ton genre ?',
        onb_q1_sub:   'Cette info aide à proposer les bonnes rencontres',
        pronoun_autre:'Non binaire',
        onb_q2:       'Quel âge as-tu ?',
        onb_q2_sub:   'Tu dois avoir 18 ans ou plus',
        onb_q3:       'Tu cherches quoi ?',
        onb_q3_sub:   'Tu pourras changer plus tard dans ton profil',
        gender_male:  'Homme',
        gender_female:'Femme',
        gender_nb:    'Non-binaire',
        gender_trans_m:'Trans homme',
        gender_trans_f:'Trans femme',
        gender_fluid: 'Genderfluid',
        gender_agender:'Agender',
        gender_other: 'Préfère pas dire',
        look_chill:   'Chill',
        look_game:    'Une game',
        look_now:     'Mate maintenant',
        look_sleep:   'Sleepcall',
        look_chill_sub:'Détente, discussions',
        look_game_sub: 'Tryhard ou casual',
        look_now_sub:  'Dispo immédiatement',
        look_sleep_sub:"Voix douce pour s'endormir",
        msg_title:    'Messages',
        msg_send:     'Envoyer',
        msg_empty:    "Aucune conversation pour l'instant. Like des profils pour matcher !",
        joined_on:    'A rejoint Matefindr le',
        nitro:        'NITRO',
        continue:     'Continuer',
        back:         'Retour',
        onb_finish:   'Découvrir Matefindr',
        acc_gender:   'Genre',
        acc_age:      'Âge',
        acc_looking:  'Je cherche',
        acc_bio:      'Bio',
        acc_edit:     'Modifier mon profil',
        acc_pseudo:   'Pseudo',
        acc_music:    '🎵 Musique préférée',
        acc_game:     '🎮 Jeu préféré',
        acc_anime:    '📺 Anime / Série préférée',
        acc_preview:  'Aperçu de ton profil',
        acc_socials:  'Comptes liés',
        acc_lang:     'Langue',
        acc_account:  'Infos compte',
        connect:      'Connecter',
        connected:    'Connecté ✓',
        save:         'Enregistrer',
        back_to_swipe:'← Retour aux profils',
        logout:       'Se déconnecter',
        saved:        'Profil mis à jour ✓',
        no_more:      'Plus personne pour le moment !',
        no_more_sub:  'Reviens plus tard pour découvrir de nouveaux profils.',
        set_lang_fr:  '🇫🇷 Français',
        set_lang_en:  '🇬🇧 English',
        set_volume:   'Volume de la musique',
        set_billing:  'Abonnement &amp; facturation',
        set_free:     'Gratuit',
        set_free_sub: 'Aucun abonnement actif',
        set_upgrade:  'Passer à Matefindr Boost',
        set_legal:    'Légal',
        set_terms_link:"📋 Conditions d'utilisation",
        set_danger:   'Zone dangereuse',
        set_delete:   'Supprimer mon compte',
        set_delete_warn:"Cette action est <b>définitive</b> : profil, bulles, GIFs/photos, likes, matchs, messages et notes reçues seront supprimés. Tape <code>SUPPRIMER</code> pour confirmer.",
        set_delete_confirm_btn:'Supprimer définitivement',
        set_cancel:   'Annuler',
        onb_terms:    "J'ai 18 ans ou plus et j'accepte les <a href=\"rules.html\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Conditions d'utilisation</a> de Matefindr.",
        terms_gate_title:'Conditions d\'utilisation',
        terms_gate_desc: "Pour continuer à utiliser Matefindr, confirme que tu as 18 ans ou plus et que tu acceptes nos <a href=\"rules.html\" target=\"_blank\" rel=\"noopener\" style=\"color:#c7a5ff\">Conditions d'utilisation</a> (pas de nudité/violence dans les images, pas de musique protégée par le droit d'auteur dans les vocaux).",
        terms_gate_accept:"J'ai 18 ans et j'accepte",
        terms_gate_refuse:'Refuser et me déconnecter',
      },
      EN: {
        login:        'Sign in',
        badge:        'Closed beta',
        tagline:      'Find a <span class="accent">Mate</span>, not just a random',
        sub:          '<b>Swipe</b> Discord profiles, <b>Like</b> the gems you fancy<br><b>Match</b> and game on',
        cta:          'Sign in with Discord',
        online:       'online',
        tags:         'Gaming <span class="sep">·</span> Chat <span class="sep">·</span> Dating',
        footer:       'POP THE BUBBLES: WHO KNOWS WHAT THEY MIGHT BE HIDING',
        auth_title:   'Sign in',
        auth_sub:     'Pick your preferred method',
        auth_discord: 'Continue with Discord',
        auth_email:   'Continue with email',
        email_title:  'Sign in with email',
        email_sub:    'Enter your credentials to continue',
        email_label:  'Email address',
        pw_label:     'Password',
        username_label: 'Username',
        remember:     'Remember me',
        forgot:       'Forgot password?',
        email_submit: 'Sign in',
        cta_email_link: 'Sign in by email',
        no_account:   'No account yet?',
        signup:       'Sign up',
        signup_title: 'Create an account',
        signup_sub:   'Join Matefindr in 30 seconds',
        signup_submit:'Create my account',
        has_account:  'Already a member?',
        sign_in:      'Sign in',
        msg_signed:   'Signed in. Welcome!',
        msg_created:  'Account created. Welcome to Matefindr!',
        msg_confirm_email: 'Account created, check your inbox to confirm your email before signing in.',
        msg_reset_sent: 'Email sent, check your inbox to reset your password.',
        msg_username_required: 'Choose a username to continue.',
        msg_invalid:  'Invalid email or password.',
        msg_short_pw: 'Password must be at least 6 characters.',
        my_account:   'My profile',
        onb_q1:       'Your gender?',
        onb_q1_sub:   'Helps us suggest better matches',
        pronoun_autre:'Non-binary',
        onb_q2:       'How old are you?',
        onb_q2_sub:   'You must be 18 or older',
        onb_q3:       'What are you looking for?',
        onb_q3_sub:   'You can change this later in your profile',
        gender_male:  'Male',
        gender_female:'Female',
        gender_nb:    'Non-binary',
        gender_trans_m:'Trans man',
        gender_trans_f:'Trans woman',
        gender_fluid: 'Genderfluid',
        gender_agender:'Agender',
        gender_other: 'Prefer not to say',
        look_chill:   'Chill',
        look_game:    'A game',
        look_now:     'Mate now',
        look_sleep:   'Sleepcall',
        look_chill_sub:'Hang out & chat',
        look_game_sub: 'Sweaty or casual',
        look_now_sub:  'Available right now',
        look_sleep_sub:'Soft voice for falling asleep',
        msg_title:    'Messages',
        msg_send:     'Send',
        msg_empty:    'No conversations yet. Like profiles to match!',
        joined_on:    'Joined Matefindr on',
        nitro:        'NITRO',
        continue:     'Continue',
        back:         'Back',
        onb_finish:   'Discover Matefindr',
        acc_gender:   'Gender',
        acc_age:      'Age',
        acc_looking:  'Looking for',
        acc_bio:      'Bio',
        acc_edit:     'Edit my profile',
        acc_pseudo:   'Username',
        acc_music:    '🎵 Favorite track',
        acc_game:     '🎮 Favorite game',
        acc_anime:    '📺 Favorite anime / show',
        acc_preview:  'Profile preview',
        acc_socials:  'Linked accounts',
        acc_lang:     'Language',
        acc_account:  'Account info',
        connect:      'Connect',
        connected:    'Connected ✓',
        save:         'Save',
        back_to_swipe:'← Back to swipe',
        logout:       'Sign out',
        saved:        'Profile updated ✓',
        no_more:      'No one left for now!',
        no_more_sub:  'Come back later to discover new profiles.',
        set_lang_fr:  '🇫🇷 Français',
        set_lang_en:  '🇬🇧 English',
        set_volume:   'Music volume',
        set_billing:  'Subscription &amp; billing',
        set_free:     'Free',
        set_free_sub: 'No active subscription',
        set_upgrade:  'Upgrade to Matefindr Boost',
        set_legal:    'Legal',
        set_terms_link:'📋 Terms of use',
        set_danger:   'Danger zone',
        set_delete:   'Delete my account',
        set_delete_warn:"This action is <b>permanent</b>: your profile, bubbles, GIFs/photos, likes, matches, messages and received ratings will be deleted. Type <code>DELETE</code> to confirm.",
        set_delete_confirm_btn:'Delete permanently',
        set_cancel:   'Cancel',
        onb_terms:    "I'm 18 or older and I agree to Matefindr's <a href=\"rules.html\" target=\"_blank\" rel=\"noopener\" onclick=\"event.stopPropagation()\">Terms of Use</a>.",
        terms_gate_title:'Terms of Use',
        terms_gate_desc: "To keep using Matefindr, confirm you're 18 or older and agree to our <a href=\"rules.html\" target=\"_blank\" rel=\"noopener\" style=\"color:#c7a5ff\">Terms of Use</a> (no nudity/violence in images, no copyrighted music in voice clips).",
        terms_gate_accept:"I'm 18 and I agree",
        terms_gate_refuse:'Decline and sign out',
      },
    };

  // Language switcher — persisté (localStorage) pour s'appliquer aussi une fois connecté
  // (le sélecteur #langSwitch de la landing est masqué en data-auth="in" -- cf. Paramètres).
  const LANG_KEY = 'matefindr_lang';
  (() => {
    const root = document.getElementById('langSwitch');
    const btn  = root.querySelector('.ls-btn');
    const menu = root.querySelector('.ls-menu');
    const cur  = root.querySelector('.ls-current');
    let open = false;

    function applyLang(code, opts){
      code = (I18N[code] ? code : 'FR');
      const dict = I18N[code];
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (dict[k] != null) el.innerHTML = dict[k];
      });
      document.documentElement.lang = code.toLowerCase();
      cur.textContent = code;
      menu.querySelectorAll('li').forEach(li => {
        li.setAttribute('aria-selected', li.dataset.code === code);
      });
      if (!opts || opts.persist !== false) { try { localStorage.setItem(LANG_KEY, code); } catch(_){} }
    }

    function setOpen(v){
      open = v;
      root.setAttribute('data-open', String(v));
      btn.setAttribute('aria-expanded', String(v));
      menu.hidden = !v;
    }
    function select(code){
      applyLang(code);
      setOpen(false);
    }

    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!open); });
    menu.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-code]');
      if (li) select(li.dataset.code);
    });
    document.addEventListener('click', (e) => {
      if (open && !root.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

    // Applique la langue déjà choisie (autre visite, ou depuis les Paramètres une fois connecté).
    let saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch(_){}
    if (saved && I18N[saved]) applyLang(saved, { persist:false });

    // Exposé pour le panneau Paramètres (js/app.js), qui n'a pas accès à ces closures.
    window.__mfApplyLang = applyLang;
    window.__mfCurrentLang = () => (document.documentElement.lang || 'fr').toUpperCase();
  })();

  // CTA click — if logged in: go to swipe; otherwise: Discord OAuth
  function refreshLandingCta(){
    const label = document.getElementById('joinLabel');
    const icoD  = document.getElementById('joinIcoDiscord');
    const icoP  = document.getElementById('joinIcoPlay');
    const emailLink = document.getElementById('ctaEmailLink');
    const loggedIn = document.body.getAttribute('data-auth') === 'in';
    if (emailLink) emailLink.style.display = loggedIn ? 'none' : '';
    if (!label) return;
    if (loggedIn) {
      label.textContent = 'Commencer à swiper';
      if (icoD) icoD.style.display = 'none';
      if (icoP) icoP.style.display = '';
    } else {
      label.textContent = (window.__i18n && window.__i18n('cta')) || 'Se connecter avec Discord';
      if (icoD) icoD.style.display = '';
      if (icoP) icoP.style.display = 'none';
    }
  }
  window.refreshLandingCta = refreshLandingCta;
  document.getElementById('join')?.addEventListener('click', (e) => {
    e.preventDefault();
    const b = e.currentTarget;
    b.animate(
      [{ transform: 'translateY(-2px) scale(1)' }, { transform: 'translateY(-2px) scale(0.97)' }, { transform: 'translateY(-2px) scale(1)' }],
      { duration: 220, easing: 'ease-out' }
    );
    const loggedIn = document.body.getAttribute('data-auth') === 'in';
    if (loggedIn) {
      // Connected: skip OAuth, go straight to swipe (onboarding if profile missing)
      setTimeout(() => {
        if (window.__matefindr && typeof window.__matefindr.go === 'function') {
          window.__matefindr.go(window.__matefindr.hasProfile && window.__matefindr.hasProfile() ? 'swipe' : 'onboarding');
        }
      }, 220);
      return;
    }
    setTimeout(() => { window.signInWithDiscord && window.signInWithDiscord(); }, 220);
  });

  // ===== Auth modal =====
  (() => {
    const modal = document.getElementById('authModal');
    const trigger = document.getElementById('loginBtn');
    const closeBtn = document.getElementById('authClose');

    // OAuth URL — built dynamically so the redirect_uri always matches the current origin.
    const DISCORD_CLIENT_ID = '1504782353199927296';
    const REDIRECT = location.origin + location.pathname;
    const DISCORD_URL = 'https://discord.com/oauth2/authorize?client_id=' + DISCORD_CLIENT_ID + '&response_type=code&scope=identify%20email&redirect_uri=' + encodeURIComponent(REDIRECT);
    // Sync the main CTA href too (it had a stale hardcoded URL previously).
    const joinLink = document.getElementById('join');
    if (joinLink) joinLink.setAttribute('href', DISCORD_URL);

    function open(){
      modal.setAttribute('data-open', 'true');
      document.body.style.overflow = 'hidden';
    }
    function close(){
      modal.setAttribute('data-open', 'false');
      document.body.style.overflow = '';
    }

    trigger.addEventListener('click', (e) => { e.preventDefault(); open(); });
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.getAttribute('data-open') === 'true') close();
    });

    document.getElementById('authDiscord')?.addEventListener('click', () => {
      // Real Discord OAuth via Supabase. Will redirect to Discord, then back here.
      close();
      window.signInWithDiscord && window.signInWithDiscord();
    });

    // ----- Email view -----
    const card         = document.getElementById('authCard');
    const backBtn      = document.getElementById('authBack');
    const emailBtn     = document.getElementById('authEmail');
    const emailForm    = document.getElementById('emailForm');
    const emailInput   = document.getElementById('emailInput');
    const pwInput      = document.getElementById('pwInput');
    const usernameField= document.getElementById('usernameField');
    const usernameInput= document.getElementById('usernameInput');
    const emailMsg     = document.getElementById('emailMsg');
    const emailSwitch  = document.getElementById('emailSwitch');
    const emailForgot  = document.getElementById('emailForgot');
    const ctaEmailLink = document.getElementById('ctaEmailLink');

    let mode = 'signin'; // 'signin' | 'signup'

    function t(key){
      const code = (document.documentElement.lang || 'fr').toUpperCase();
      const dict = (window.__I18N_FOR_AUTH && window.__I18N_FOR_AUTH[code]) || null;
      return dict && dict[key] ? dict[key] : key;
    }
    // expose I18N for t() — populated in select() lifecycle. Fallback dict:
    window.__I18N_FOR_AUTH = I18N;

    function setView(view){
      card.setAttribute('data-view', view);
      backBtn.style.display = view === 'email' ? 'grid' : 'none';
      emailMsg.setAttribute('data-show', 'false');
      if (view === 'email') setTimeout(() => emailInput.focus(), 80);
    }
    function setMode(next){
      mode = next;
      const isSignup = mode === 'signup';
      const card2 = card;
      // update labels via i18n keys depending on mode
      card2.querySelector('.auth-view--email h2').textContent      = t(isSignup ? 'signup_title' : 'email_title');
      card2.querySelector('.auth-view--email .auth-sub').textContent= t(isSignup ? 'signup_sub'   : 'email_sub');
      card2.querySelector('.auth-submit').textContent              = t(isSignup ? 'signup_submit': 'email_submit');
      card2.querySelector('.auth-footer span').textContent         = t(isSignup ? 'has_account'  : 'no_account');
      emailSwitch.textContent                                       = t(isSignup ? 'sign_in'      : 'signup');
      pwInput.autocomplete = isSignup ? 'new-password' : 'current-password';
      // Le pseudo n'a de sens qu'à l'inscription (les comptes email n'ont pas
      // d'identité Discord pour fournir un nom automatiquement).
      if (usernameField) usernameField.style.display = isSignup ? '' : 'none';
      emailMsg.setAttribute('data-show', 'false');
    }

    if (emailBtn) emailBtn.addEventListener('click', () => setView('email'));
    if (ctaEmailLink) ctaEmailLink.addEventListener('click', (e) => { e.preventDefault(); open(); setView('email'); });
    backBtn.addEventListener('click',  () => { setView('providers'); setMode('signin'); });
    emailSwitch.addEventListener('click', (e) => { e.preventDefault(); setMode(mode === 'signin' ? 'signup' : 'signin'); });

    function showMsg(text, ok){
      emailMsg.textContent = text;
      emailMsg.setAttribute('data-show', 'true');
      emailMsg.style.background = ok ? 'rgba(59,209,124,.12)' : 'rgba(255,79,160,.12)';
      emailMsg.style.borderColor = ok ? 'rgba(59,209,124,.35)' : 'rgba(255,79,160,.45)';
      emailMsg.style.color = ok ? '#9CF0BD' : '#FFB1D2';
    }

    emailForgot.addEventListener('click', async (e) => {
      e.preventDefault();
      const v = (emailInput.value || '').trim();
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      if (!okEmail) { emailInput.focus(); emailInput.classList.add('invalid'); showMsg(t('msg_invalid'), false); return; }
      if (!window.__supa) { showMsg(t('msg_invalid'), false); return; }
      try {
        const { error } = await window.__supa.auth.resetPasswordForEmail(v, { redirectTo: location.origin + location.pathname });
        if (error) { showMsg(error.message || t('msg_invalid'), false); return; }
        showMsg(t('msg_reset_sent'), true);
      } catch(err) { showMsg((err && err.message) || t('msg_invalid'), false); }
    });

    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const pw    = pwInput.value;
      const username = (usernameInput && usernameInput.value.trim()) || '';
      const isSignup = mode === 'signup';
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      emailInput.classList.toggle('invalid', !okEmail);
      pwInput.classList.toggle('invalid', pw.length < 6);
      if (isSignup && usernameInput) usernameInput.classList.toggle('invalid', username.length < 2);

      if (!okEmail) { showMsg(t('msg_invalid'), false); return; }
      if (pw.length < 6) { showMsg(t('msg_short_pw'), false); return; }
      if (isSignup && username.length < 2) { showMsg(t('msg_username_required'), false); return; }
      if (!window.__supa) { showMsg(t('msg_invalid'), false); return; }

      const submitBtn = card.querySelector('.auth-submit');
      submitBtn.disabled = true;
      try {
        if (isSignup) {
          const { data, error } = await window.__supa.auth.signUp({
            email, password: pw,
            options: { data: { username } },
          });
          if (error) { showMsg(error.message || t('msg_invalid'), false); submitBtn.disabled = false; return; }
          if (!data.session) {
            // Confirmation par email activée côté Supabase : pas de session tout de
            // suite, il faut d'abord cliquer le lien reçu par mail.
            showMsg(t('msg_confirm_email'), true);
            submitBtn.disabled = false;
            return;
          }
          showMsg(t('msg_created'), true);
        } else {
          const { error } = await window.__supa.auth.signInWithPassword({ email, password: pw });
          if (error) { showMsg(t('msg_invalid'), false); submitBtn.disabled = false; return; }
          showMsg(t('msg_signed'), true);
        }
        // La vraie session Supabase déclenche onAuthStateChange (app.js), qui
        // appelle lui-même window.__matefindr.onLogin() -- pas besoin de le
        // rappeler ici (et surtout pas avec un faux objet utilisateur).
        setTimeout(() => {
          close(); setView('providers'); setMode('signin'); emailForm.reset();
          submitBtn.disabled = false;
        }, 900);
      } catch(err) {
        showMsg((err && err.message) || t('msg_invalid'), false);
        submitBtn.disabled = false;
      }
    });

    // Reset to providers view whenever modal reopens
    trigger.addEventListener('click', () => { setView('providers'); setMode('signin'); emailForm.reset(); });
  })();

