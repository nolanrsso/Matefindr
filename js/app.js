  /* ============================================================
     APP STATE MACHINE — landing → onboarding → swipe → account
     ============================================================ */
  (() => {
    // ⚠️ SÉCURITÉ : ce secret Spotify est EXPOSÉ dans le frontend public.
    // N'importe qui peut le récupérer dans le code source et l'utiliser pour
    // consommer le quota de notre app. À DÉPLACER ABSOLUMENT côté backend
    // (Supabase Edge Function "spotify-token" qui proxie la génération de token)
    // avant la mise en production réelle. En attendant, surveille la console
    // Spotify Developer (https://developer.spotify.com/dashboard) pour repérer
    // tout abus, et révoque/recrée le secret en cas de compromission.
    const SPOTIFY_CLIENT_ID     = '97ee507ff2694d9c916f2cd930afcb4c';
    const SPOTIFY_CLIENT_SECRET = '1775eb6d41204c489c9e0ed9cf72f2bb';

    const KEY = 'matefindr_state';
    let state = { user:null, profile:null };
    try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch(_){}
    // Fantôme éditeur : placeholder HTML "Matefindr_user" écrit dans matefindr_state
    // sans session Discord → index te montrait connecté à personne de réel.
    function isGhostLocalUser(u){
      if (!u || typeof u !== 'object') return true;
      if (u.discordId || u.uid || u.email) return false;
      const dn = String(u.displayName || '').trim();
      if (!dn || dn === 'Matefindr_user') return true;
      return false;
    }
    if (isGhostLocalUser(state.user)) {
      state = { user: null, profile: null };
      try { localStorage.removeItem(KEY); } catch(_){}
    }
    /* Recadrage avatar : certaines sauvegardes ont scale=100 (valeur du slider %) au lieu
       d'un multiplicateur ~1–3 → transform:scale(100) déborde visuellement de l'avatar. */
    function normalizeAvatarPos(ap){
      if (!ap || typeof ap !== 'object') return null;
      let posX = Number(ap.posX), posY = Number(ap.posY), scale = Number(ap.scale);
      if (!Number.isFinite(posX)) posX = 50;
      if (!Number.isFinite(posY)) posY = 50;
      if (!Number.isFinite(scale)) scale = 1;
      if (scale > 10) scale = scale / 100;
      scale = Math.min(4, Math.max(0.5, scale));
      return { posX: Math.min(100, Math.max(0, posX)), posY: Math.min(100, Math.max(0, posY)), scale };
    }
    if (state.user && state.user.avatarPos) {
      const fixed = normalizeAvatarPos(state.user.avatarPos);
      if (JSON.stringify(fixed) !== JSON.stringify(state.user.avatarPos)) {
        state.user.avatarPos = fixed;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(_){}
      } else state.user.avatarPos = fixed;
    }
    /* Garde multi-onglets : si l'éditeur (dans un AUTRE onglet) vient de sauvegarder
       pendant que cet onglet affiche l'aperçu de SON profil, l'évènement 'storage'
       (déclenché uniquement par les écritures d'un AUTRE onglet, jamais les siennes)
       permet de relire l'état frais et de re-rendre la carte au lieu de rester
       figé sur une version périmée. */
    window.addEventListener('storage', e => {
      if (e.key !== KEY) return;
      try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch(_){}
      if (_previewMode && typeof ensureDeckSync === 'function') ensureDeckSync({ force: true });
    });

    function save(){
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(_){}
      try { if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } catch(_){}
    }

    /* ===== Mode maintenance (admin.html) =====
       Coupe l'accès au site à TOUT LE MONDE sauf au(x) compte(s) Discord listé(s)
       (comparaison sur le tag Discord). Réglage global dans la table site_settings
       (lisible par tous via la clé anon, modifiable uniquement par admin.html via
       service_role). Vérifié tôt (avant même une connexion, avec le tag déjà connu
       localement s'il y en a un) ET réévalué à chaque login avec le tag FRAIS venu
       de Discord (le cache local peut être absent ou périmé). */
    let _maintenanceInfo = null;
    function showMaintenanceOverlay(){
      if (document.getElementById('mfMaintenanceOverlay')) return;
      document.documentElement.style.overflow = 'hidden';
      const ov = document.createElement('div');
      ov.id = 'mfMaintenanceOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:24px;'
        + 'background:radial-gradient(1100px 700px at 15% -10%,#201642 0%,transparent 55%),radial-gradient(900px 700px at 95% 0%,#2a1636 0%,transparent 50%),#0D0B1E;';
      ov.innerHTML = ''
        + '<div style="width:min(440px,100%);text-align:center;background:linear-gradient(180deg,rgba(30,24,58,.7),rgba(16,12,34,.7));'
        +   'border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:36px 28px;box-shadow:0 30px 80px rgba(0,0,0,.5);backdrop-filter:blur(14px);'
        +   'font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff">'
        +   '<div style="font-size:44px;margin-bottom:10px">🚧</div>'
        +   '<h1 style="margin:0 0 10px;font-size:22px">Matefindr est en maintenance</h1>'
        +   '<p style="color:#b9bbbe;font-size:14.5px;line-height:1.55;margin:0">On revient très vite — reste à l\'écoute sur notre Discord pour les mises à jour.</p>'
        + '</div>';
      document.body.appendChild(ov);
    }
    function hideMaintenanceOverlay(){
      const ov = document.getElementById('mfMaintenanceOverlay');
      if (ov) { ov.remove(); document.documentElement.style.overflow = ''; }
    }
    function applyMaintenanceGate(discordTag){
      if (!_maintenanceInfo || !_maintenanceInfo.enabled) { hideMaintenanceOverlay(); return; }
      const allowed = !!(_maintenanceInfo.allowedTag && discordTag && discordTag.toLowerCase() === _maintenanceInfo.allowedTag.toLowerCase());
      if (allowed) hideMaintenanceOverlay(); else showMaintenanceOverlay();
    }
    (async () => {
      try {
        if (!window.__supa) return;
        const { data } = await window.__supa.from('site_settings').select('maintenance_mode,maintenance_allowed_tag').eq('id', 1).maybeSingle();
        _maintenanceInfo = { enabled: !!(data && data.maintenance_mode), allowedTag: (data && data.maintenance_allowed_tag) || null };
        applyMaintenanceGate((state.user && state.user.discordTag) || null);
      } catch(_){}
    })();
    function tx(k){
      const code = (document.documentElement.lang || 'fr').toUpperCase();
      return (I18N[code] && I18N[code][k]) || (I18N.FR[k]) || k;
    }
    function revealApp(){
      // Retire le cache anti-flash posé par index.html (lien de partage / retour éditeur).
      document.documentElement.classList.remove('mf-boot-hidden');
    }
    function setScreen(name){
      // Profil désactivé par un admin (admin.html) : garde-fou -- même si quelque chose
      // tente de rouvrir le swipe (onglet déjà ouvert, retour navigateur…), on renvoie
      // systématiquement vers l'éditeur, seul endroit accessible tant que non réactivé.
      if (name === 'swipe' && state.user && state.user.disabled) { location.href = 'editor.html'; return; }
      document.body.setAttribute('data-screen', name);
      revealApp();
      if (name === 'account') renderAccount();
      if (name === 'onboarding' && typeof window.__initOnboarding === 'function') window.__initOnboarding();
      // force=true : (ré)entrer sur le swipe court-circuite le cache 30s de fetchOtherProfiles
      // -- sinon un profil réactivé (ou désactivé) par un admin entre-temps pouvait rester
      // invisible/visible à tort jusqu'à 30s de plus après être revenu sur cet écran.
      if (name === 'swipe') {
        // Deck normal : nettoyer un état « lien perso » résiduel (sinon like/dislike masqués
        // et commitSwipe bloqué tant que _sharedProfile ou data-shared traîne en session).
        if (!_previewMode) {
          const slug = (typeof getSharedSlug === 'function') ? getSharedSlug() : null;
          if (!slug) {
            _sharedProfile = null;
            document.body.removeAttribute('data-shared');
            document.body.removeAttribute('data-shared-own');
          }
        }
        deckIdx = 0; ensureDeck(true); refreshMyStatusUI(); refreshSwipeTools();
      }
      if (name !== 'swipe')   {
        stopSwipeMusic();
        if (typeof orbSimStop === 'function') orbSimStop();
        // #swipeStickersBg (GIFs + photos perso) est ajouté en enfant direct de <body>
        // (pas dans #screen-swipe) -> pas caché par le changement d'écran, il
        // faut le retirer explicitement en quittant le swipe, sinon il reste
        // visible par-dessus le menu (landing) au retour.
        const _sb = document.getElementById('swipeStickersBg'); if (_sb) _sb.remove();
        _previewMode = false; _previewProfile = null; _previewFromEditor = false;
        document.body.removeAttribute('data-preview'); // sort du mode aperçu
        try { sessionStorage.removeItem('mf_from_editor'); } catch(_){}
      }
    }
    function setAuth(on){
      document.body.setAttribute('data-auth', on ? 'in' : 'out');
      if (on) updateChip();
      else {
        // Déconnecté → jamais laisser l'onboarding / compte / swipe "app" visibles
        // (sinon "Se connecter" + formulaire "Hey, toi !" en même temps).
        // Exception : carte ouverte via lien perso (consultable hors connexion).
        const scr = document.body.getAttribute('data-screen');
        const shared = !!_sharedProfile || document.body.getAttribute('data-shared') === 'true';
        if (!shared && scr && scr !== 'landing' && typeof setScreen === 'function') {
          setScreen('landing');
        }
      }
      if (typeof refreshLandingCta === 'function') refreshLandingCta();
    }
    /* Ouvre le VRAI reste de l'app (landing/onboarding) -- avec un garde-fou : un
       visiteur arrivé via un lien perso (matefindr.com/<slug>, consultable SANS le
       mot de passe) ne doit jamais atterrir ici sans avoir saisi le code, même s'il
       s'est connecté via Discord (like/réaction) depuis ce lien. window.__mfIsSlugPath
       et window.__mfShowGate sont posés par le script du gate dans index.html. */
    function enterFullApp(){
      const target = state.profile ? 'landing' : 'onboarding';
      let gateOk = true;
      try { gateOk = localStorage.getItem('matefindr_gate_ok') === '1'; } catch(_){}
      if (window.__mfIsSlugPath && !gateOk && typeof window.__mfShowGate === 'function') {
        window.__mfOnGatePassed = () => setScreen(target);
        window.__mfShowGate();
      } else {
        setScreen(target);
      }
    }
    function updateChip(){
      const u = state.user || {};
      const avi = document.getElementById('accountChipAvatar');
      if (u.avatarUrl) {
        // Respecte le recadrage choisi dans l'éditeur (posX/posY/scale) — sans ça la
        // pastille "Mon profil" montrait toujours le cover par défaut de l'image brute,
        // qui ne correspond pas forcément au recadrage voulu par l'utilisateur.
        const ap = normalizeAvatarPos(u.avatarPos);
        const posX = ap ? ap.posX : 50;
        const posY = ap ? ap.posY : 50;
        const scale = ap ? ap.scale : 1;
        avi.innerHTML = `<img src="${u.avatarUrl}" alt="${escapeHtmlMini(u.displayName || '')}" style="width:100%;height:100%;object-fit:cover;object-position:${posX}% ${posY}%;transform-origin:${posX}% ${posY}%;transform:scale(${scale})">`;
        avi.style.background = 'none';
      } else {
        avi.textContent = (u.displayName || u.email || 'U').charAt(0).toUpperCase();
        avi.style.background = 'linear-gradient(135deg,#FF7EB6,#9146FF)';
      }
    }

    // Plein écran simple pour un VISITEUR qui force l'accès à un profil désactivé (lien
    // perso partagé) -- pas de raison exposée (c'est une info de modération interne, pas
    // pour un inconnu), juste le constat. Le propriétaire, lui, est redirigé vers l'éditeur
    // (cf. onLogin) et ne voit jamais cet écran.
    function showAccountDisabledMessage(){
      if (document.getElementById('mfDisabledOverlay')) return;
      document.documentElement.style.overflow = 'hidden';
      const ov = document.createElement('div');
      ov.id = 'mfDisabledOverlay';
      ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;'
        + 'background:radial-gradient(1100px 700px at 15% -10%,#201642 0%,transparent 55%),radial-gradient(900px 700px at 95% 0%,#2a1636 0%,transparent 50%),#0D0B1E;';
      ov.innerHTML = ''
        + '<div style="width:min(400px,100%);text-align:center;background:linear-gradient(180deg,rgba(30,24,58,.7),rgba(16,12,34,.7));'
        +   'border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:36px 28px;box-shadow:0 30px 80px rgba(0,0,0,.5);backdrop-filter:blur(14px);'
        +   'font-family:Inter,system-ui,-apple-system,sans-serif;color:#fff">'
        +   '<div style="font-size:44px;margin-bottom:10px">🚫</div>'
        +   '<h1 style="margin:0 0 18px;font-size:19px">Ce compte a été désactivé</h1>'
        +   '<button id="mfDisabledBack" type="button" style="display:inline-block;width:100%;padding:13px;border-radius:13px;font-weight:800;font-size:15px;color:#fff;'
        +     'background:linear-gradient(180deg,#9146FF,#6B2BFF);box-shadow:0 12px 30px rgba(107,43,255,.4);border:none;cursor:pointer;box-sizing:border-box">'
        +     'Retour à l\'accueil'
        +   '</button>'
        + '</div>';
      document.body.appendChild(ov);
      const btn = document.getElementById('mfDisabledBack');
      if (btn) btn.addEventListener('click', () => { location.href = '/'; });
    }

    // Bannière fermable en haut du site -- posée par un admin via admin.html ("Message
    // du staff"). Reste fermée une fois la croix cliquée, sauf si un NOUVEAU message
    // (ts différent) arrive ensuite -- comparé à un marqueur local par appareil.
    function showStaffMessageBanner(msg){
      const prev = document.getElementById('mfStaffBanner');
      if (prev) { prev.remove(); document.body.style.paddingTop = ''; }
      if (!msg || !msg.text) return;
      let dismissedTs = null;
      try { dismissedTs = localStorage.getItem('matefindr_staffmsg_dismissed_ts'); } catch(_){}
      if (msg.ts && dismissedTs === msg.ts) return;
      const el = document.createElement('div');
      el.id = 'mfStaffBanner';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:linear-gradient(90deg,#6B2BFF,#9146FF);'
        + 'color:#fff;font:600 13.5px/1.5 Inter,system-ui,-apple-system,sans-serif;padding:10px 44px 10px 16px;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.35)';
      el.innerHTML = '📢 <b>Message du staff :</b> ' + escapeHtmlMini(msg.text)
        + '<button id="mfStaffBannerClose" type="button" aria-label="Fermer" style="position:absolute;top:6px;right:10px;width:26px;height:26px;'
        +   'border-radius:8px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:16px;line-height:1;cursor:pointer">×</button>';
      document.body.prepend(el);
      requestAnimationFrame(() => { document.body.style.paddingTop = el.offsetHeight + 'px'; });
      document.getElementById('mfStaffBannerClose').addEventListener('click', () => {
        try { localStorage.setItem('matefindr_staffmsg_dismissed_ts', msg.ts || '1'); } catch(_){}
        el.remove();
        document.body.style.paddingTop = '';
      });
    }

    // "Dernier vu sur le site" (admin.html) -- posé au login puis rafraîchi au retour sur
    // l'onglet (throttlé), pas juste au login initial (une session peut durer des heures).
    async function pingLastSeen(){
      try{
        if (!window.__supa) return;
        const { data:{ session } } = await window.__supa.auth.getSession();
        if (!session) return;
        const { data: row } = await window.__supa.from('profiles').select('data').eq('id', session.user.id).maybeSingle();
        const nowIso = new Date().toISOString();
        const dataPatch = Object.assign({}, (row && row.data) || {}, { lastSeenAt: nowIso });
        const { error } = await window.__supa.from('profiles').update({ data: dataPatch }).eq('id', session.user.id);
        if (!error) { state.user = state.user || {}; state.user.lastSeenAt = nowIso; }
      }catch(_){}
    }
    let _lastPingAt = 0;
    window.addEventListener('focus', () => {
      const now = Date.now();
      if (now - _lastPingAt > 5 * 60 * 1000) { _lastPingAt = now; pingLastSeen(); }
    });

    // Hand-off used by login/signup handlers
    window.__matefindr = {
      async onLogin(user){
        // Mode maintenance : réévalué avec le tag Discord FRAIS (pas le cache local,
        // potentiellement absent/périmé) dès qu'on sait qui se connecte.
        if (typeof applyMaintenanceGate === 'function') applyMaintenanceGate(user && user.discordTag);
        // Déjà connecté et déjà dans l'app ? (ex : onAuthStateChange qui refire quand on
        // revient sur l'onglet) → on met à jour les données SANS changer l'écran courant.
        // Fonction (pas une const figée ici) : ce onLogin() traverse plusieurs `await`
        // réseau (syncMyProfileToCloud, discordJoinDM, fetchOtherProfiles) qui peuvent
        // prendre plusieurs secondes -- si on la calculait UNE FOIS ici, la valeur serait
        // périmée au moment de l'utiliser plus bas : un utilisateur qui clique "Commencer
        // à swiper" PENDANT ces awaits (data-screen passe à 'swipe' entre-temps) se
        // faisait renvoyer de force vers le menu une fois les awaits terminés, alors
        // même qu'il était déjà en train de swiper. Il faut relire l'écran ACTUEL au
        // moment du if (!alreadyInApp()), pas celui du tout début de la fonction.
        const alreadyInApp = () => document.body.getAttribute('data-auth') === 'in'
          && !['landing','onboarding'].includes(document.body.getAttribute('data-screen'));
        // Préserve les assets custom (Boost) avant le merge Discord
        // Garde-fou CRITIQUE : si un `state.user`/`state.profile` d'un AUTRE compte
        // Discord traînait encore (localStorage pas nettoyé, race condition, onglet
        // resté ouvert…), on ne doit JAMAIS réutiliser ses champs pour le nouveau
        // compte (fuite de profil entre comptes : bannière/couleurs/orbes/bio de
        // l'ancien compte qui apparaissent chez le nouveau).
        const rawPrev = state.user || {};
        const sameAccount = !rawPrev.discordId || !user.discordId || rawPrev.discordId === user.discordId;
        if (!sameAccount) { state.profile = null; }
        const prev = sameAccount ? rawPrev : {};
        // Serveurs Discord : ne jamais écraser une liste connue par [] (token OAuth absent/expiré).
        if ((!user.guilds || !user.guilds.length) && user.discordId && window.__refreshDiscordGuilds) {
          try {
            const freshGuilds = await window.__refreshDiscordGuilds(user.discordId);
            if (freshGuilds && freshGuilds.length) user.guilds = freshGuilds;
          } catch(_){}
        }
        if ((!user.guilds || !user.guilds.length) && sameAccount && Array.isArray(prev.guilds) && prev.guilds.length) {
          user.guilds = prev.guilds;
        }
        // Profil Matefindr déjà créé → plus de sync Discord visuelle (avatar, bannière,
        // déco, pseudo, nitro, accent). Seulement username, serveurs, email.
        const hadProfile = sameAccount && !!state.profile;
        if (hadProfile) {
          state.user = Object.assign({}, prev, {
            discordId: user.discordId || prev.discordId,
            discordTag: user.discordTag || prev.discordTag,
            email: user.email || prev.email,
            guilds: (user.guilds && user.guilds.length) ? user.guilds : prev.guilds,
            mode: user.mode || prev.mode || 'discord',
          });
        } else {
          const keepBanner = prev.bannerCustom && prev.bannerUrl;
          const keepDeco   = prev.decoCustom && prev.decorationUrl;
          const keepAvatar = prev.avatarCustom && prev.avatarUrl;
          const keepName = prev.nameCustom && prev.displayName;
          state.user = Object.assign({}, prev, user);
          if (keepBanner) { state.user.bannerUrl = prev.bannerUrl; state.user.bannerCustom = true; }
          if (keepDeco)   { state.user.decorationUrl = prev.decorationUrl; state.user.decoCustom = true; state.user.decorationHash = prev.decorationHash || null; }
          if (keepAvatar) { state.user.avatarUrl = prev.avatarUrl; state.user.avatarCustom = true; state.user.avatarPos = prev.avatarPos || null; }
          if (keepName)   { state.user.displayName = prev.displayName; state.user.nameCustom = true; }
        }
        if (sameAccount && prev.discordLive) state.user.discordLive = prev.discordLive;
        // Restore an archived profile if we have one for this Discord ID
        try {
          const key = state.user.discordId || state.user.email || state.user.discordTag;
          if (key && !state.profile) {
            const archives = JSON.parse(localStorage.getItem('matefindr_archived_profiles') || '{}');
            const arch = archives[key];
            if (arch && arch.profile) {
              state.profile = arch.profile;
              // Merge non-identity user extras (voice, color, music settings, boost, etc.)
              if (arch.userExtras) {
                Object.entries(arch.userExtras).forEach(([k, v]) => {
                  if (v !== null && v !== undefined && state.user[k] == null) state.user[k] = v;
                });
                // Custom banner overrides the Discord one if the user had imported one
                if (arch.userExtras.bannerCustom && arch.userExtras.bannerUrl) {
                  state.user.bannerUrl = arch.userExtras.bannerUrl;
                  state.user.bannerCustom = true;
                }
              }
              console.log('[Matefindr] Restored archived profile for', key);
            }
          }
        } catch (e) { console.warn('restore archive failed', e); }
        // Reconnexion sur un AUTRE appareil / cache vidé : aucun profil local, mais il
        // existe peut-être en base (profiles.data). On le restaure, sinon l'utilisateur
        // repasse par l'onboarding et "doit tout recommencer" alors que son profil existe.
        // Requête toujours exécutée (pas seulement si `!state.profile`) : le flag Boost doit
        // remonter du cloud même pour un compte déjà connu localement (ex: cadeau de Boost
        // accordé en masse côté base à des comptes déjà actifs).
        if (window.__supa) {
          try {
            const { data: { session } } = await window.__supa.auth.getSession();
            if (session) {
              const { data: row } = await window.__supa.from('profiles').select('data').eq('id', session.user.id).maybeSingle();
              if (!row) {
                // Tout premier login de ce compte (aucune ligne en base) → offre de lancement :
                // Boost offert tant qu'il reste de la place sur les 100 premiers comptes.
                try {
                  const { count } = await window.__supa.from('profiles').select('id', { count: 'exact', head: true });
                  if (typeof count === 'number' && count < 100) {
                    state.user.boost = true;
                    state.user.boostPlan = 'launch';
                    state.user.boostSince = new Date().toISOString();
                  }
                } catch (e) { console.warn('[Matefindr] launch boost check failed', e); }
              }
              const dRaw = (row && row.data && typeof row.data === 'object') ? row.data : null;
              // Déconnexion forcée par un admin (admin.html "Déconnecter") : comparée au
              // timestamp de notre dernier login mémorisé localement. Pas de kick temps réel
              // (session déjà ouverte dans un onglet) -- effectif au prochain login/reload.
              if (dRaw && dRaw.forceLogoutAt) {
                const lastLoginAt = parseInt(localStorage.getItem('matefindr_login_at') || '0', 10);
                const kickAt = new Date(dRaw.forceLogoutAt).getTime();
                if (kickAt > lastLoginAt) {
                  try { await window.__supa.auth.signOut(); } catch(_){}
                  try { localStorage.removeItem(KEY); localStorage.removeItem('matefindr_login_at'); } catch(_){}
                  alert('Tu as été déconnecté par un administrateur. Reconnecte-toi si besoin.');
                  location.href = '/';
                  return;
                }
              }
              try { localStorage.setItem('matefindr_login_at', String(Date.now())); } catch(_){}
              // Profil désactivé (contenu signalé) par un admin : invisible pour les autres
              // (fetchOtherProfiles/openSharedProfile le filtrent). Le propriétaire, lui, reste
              // connectable mais n'a accès qu'à l'éditeur (pour corriger son profil) -- swipe et
              // messagerie sont bloqués (cf. garde-fous dans setScreen() et l'envoi de messages).
              state.user.disabled = (dRaw && dRaw.disabled === true);
              state.user.disabledReason = state.user.disabled ? (dRaw.disabledReason || '') : null;
              state.user.disabledCount = (dRaw && typeof dRaw.disabledCount === 'number') ? dRaw.disabledCount : (state.user.disabledCount || 0);
              // Message du staff (admin.html) : posé dans state.user quoi qu'il arrive
              // (editor.html le lit aussi si le compte est désactivé), affiché ici seulement
              // si on reste sur ce site (sinon inutile juste avant la redirection éditeur).
              state.user.staffMessage = (dRaw && dRaw.staffMessage && typeof dRaw.staffMessage === 'object' && dRaw.staffMessage.text) ? dRaw.staffMessage : null;
              if (state.user.disabled) {
                save();
                location.href = 'editor.html';
                return;
              }
              if (typeof showStaffMessageBanner === 'function') showStaffMessageBanner(state.user.staffMessage);
              if (typeof pingLastSeen === 'function') { pingLastSeen(); _lastPingAt = Date.now(); }
              if (dRaw && dRaw.boost === true && !state.user.boost) {
                state.user.boost = true;
                if (dRaw.boostPlan) state.user.boostPlan = dRaw.boostPlan;
                if (dRaw.boostSince) state.user.boostSince = dRaw.boostSince;
                if (dRaw.boostNextPayment) state.user.boostNextPayment = dRaw.boostNextPayment;
              }
              if (dRaw && dRaw.slugChangedAt) state.user.slugChangedAt = dRaw.slugChangedAt;
              // Compte existant = déjà passé par l'onboarding (âge/genre/pays/orbes…)
              // — pas seulement `data.name` (sinon → "Hey, toi !" à chaque reconnexion).
              const hasCloudProfile = !!(dRaw && (
                dRaw.name || dRaw.age || dRaw.gender || dRaw.country
                || (Array.isArray(dRaw.orbs) && dRaw.orbs.length)
                || (dRaw.dailyLogin && dRaw.dailyLogin.lastClaim)
                || (Array.isArray(dRaw.gifs) && dRaw.gifs.length)
                || (Array.isArray(dRaw.photos) && dRaw.photos.length)
              ));
              const d = hasCloudProfile ? dRaw : null;
              if (!state.profile && d) {
                const su = state.user;
                state.profile = {
                  age: d.age || null, gender: d.gender || '', country: d.country || '', countryFlag: d.countryFlag || '',
                  looking: d.looking || 'game',
                  bio: (d.bio && d.bio.indexOf('Complète ta bio') === -1) ? d.bio : '',
                  game: (Array.isArray(d.games) ? d.games[0] : null) || null,
                  connections: (d.connections && typeof d.connections === 'object') ? d.connections : {},
                  userOrbs: Array.isArray(d.orbs) ? d.orbs : [],
                  pseudo: d.name || '',
                };
                // Identité visuelle : on restaure ce qui était sauvé en base (pas le Discord
                // frais du login). Avatar/bannière CDN Discord figés au dernier save.
                if (d.name) { su.displayName = d.name; }
                if (d.avatarUrl) {
                  su.avatarUrl = d.avatarUrl;
                  if (!/cdn\.discordapp\.com/i.test(d.avatarUrl)) { su.avatarCustom = true; su.avatarPos = d.avatarPos || null; }
                  else { su.avatarPos = d.avatarPos || su.avatarPos || null; }
                }
                if (d.discordAvatarUrl) su.discordAvatarUrl = d.discordAvatarUrl;
                if (d.bannerUrl) {
                  su.bannerUrl = d.bannerUrl;
                  if (!/cdn\.discordapp\.com/i.test(d.bannerUrl)) su.bannerCustom = true;
                }
                if (d.decorationUrl) { su.decorationUrl = d.decorationUrl; su.decoCustom = true; }
                // Username / email / serveurs : toujours la valeur Discord fraîche du login.
                if (user && user.discordTag) su.discordTag = user.discordTag;
                if (user && user.email) su.email = user.email;
                if (user && Array.isArray(user.guilds) && user.guilds.length) su.guilds = user.guilds;
                if (d.profileColor)  su.profileColor  = d.profileColor;
                if (d.profileColor2) su.profileColor2 = d.profileColor2;
                if (d.nameColor)     su.nameColor     = d.nameColor;
                if (typeof d.showBoostName === 'boolean') su.boostShowName = d.showBoostName;
                if (typeof d.boost === 'boolean') su.boost = d.boost;
                if (Array.isArray(d.gifs)) su.gifs = d.gifs;
                if (typeof d.gifContour === 'boolean') su.gifContour = d.gifContour;
                if (Array.isArray(d.photos)) su.photos = d.photos;
                if (typeof d.photoContour === 'boolean') su.photoContour = d.photoContour;
                if (d.bg)         su.boostBg    = d.bg;
                if (d.bgPos)      su.boostBgPos = d.bgPos;
                if (d.swipeMusic) su.swipeMusic = d.swipeMusic;
                if (d.socials && typeof d.socials === 'object') su.socials = d.socials;
                if (typeof d.handleBlur === 'boolean') su.handleBlur = d.handleBlur;
                if (d.connUniformColor && /^#[0-9a-f]{6}$/i.test(d.connUniformColor)) su.connUniformColor = d.connUniformColor;
                else if (d.connUniformColor === null) su.connUniformColor = null;
                if (d.profileVoice) su.profileVoice = d.profileVoice;
                if (Array.isArray(d.presets)) su.presets = d.presets;
                if (typeof d.sharePresetIdx === 'number') su.sharePresetIdx = d.sharePresetIdx;
                if (d.titlesData) su.titlesData = d.titlesData;
                if (typeof d.coins === 'number') su.coins = d.coins;
                if (Array.isArray(d.questCoinClaims)) su.questCoinClaims = d.questCoinClaims;
                if (d.dailyLogin) su.dailyLogin = mergeDailyLogin(su.dailyLogin, d.dailyLogin);
                if (d.questStats && typeof d.questStats === 'object') su.questStats = Object.assign({}, d.questStats);
                if (typeof d.editorActiveMs === 'number') su.editorActiveMs = Math.max(Number(su.editorActiveMs) || 0, d.editorActiveMs);
                if (d.beautyQuestUnlocked) su.beautyQuestUnlocked = true;
                if (d.lastEditedAt) su.lastEditedAt = d.lastEditedAt;
                if (d.discordLive) su.discordLive = d.discordLive;
                console.log('[Matefindr] Profil restauré depuis le cloud (reconnexion).');
              } else if (dRaw) {
                // Même si le profil local existe déjà, ne pas perdre presets / sharePresetIdx / quêtes
                if (Array.isArray(dRaw.presets) && !Array.isArray(state.user.presets)) state.user.presets = dRaw.presets;
                if (typeof dRaw.sharePresetIdx === 'number' && typeof state.user.sharePresetIdx !== 'number') state.user.sharePresetIdx = dRaw.sharePresetIdx;
                if (dRaw.discordLive) {
                  const locTs = state.user.discordLive?.updatedAt ? new Date(state.user.discordLive.updatedAt).getTime() : 0;
                  const cloudTs = dRaw.discordLive.updatedAt ? new Date(dRaw.discordLive.updatedAt).getTime() : 0;
                  if (!locTs || cloudTs >= locTs) state.user.discordLive = dRaw.discordLive;
                }
                if (typeof dRaw.coins === 'number') {
                  state.user.coins = typeof state.user.coins === 'number' ? Math.max(state.user.coins, dRaw.coins) : dRaw.coins;
                }
                if (Array.isArray(dRaw.questCoinClaims)) {
                  state.user.questCoinClaims = [...new Set([...(state.user.questCoinClaims || []), ...dRaw.questCoinClaims])];
                }
                if (dRaw.dailyLogin) {
                  state.user.dailyLogin = mergeDailyLogin(state.user.dailyLogin, dRaw.dailyLogin);
                }
                if (dRaw.questStats && typeof dRaw.questStats === 'object') {
                  const locQs = (state.user.questStats && typeof state.user.questStats === 'object') ? state.user.questStats : {};
                  state.user.questStats = Object.assign({}, locQs, dRaw.questStats);
                  // Garde le max pour chaque compteur (évite de régresser la note / votes)
                  ['views','matches','likesGiven','likesReceived','votesGiven','votesReceived','newChats','ratingVotes'].forEach(k => {
                    const a = Number(locQs[k]) || 0, b = Number(dRaw.questStats[k]) || 0;
                    if (a || b) state.user.questStats[k] = Math.max(a, b);
                  });
                  if (typeof locQs.rating === 'number' || typeof dRaw.questStats.rating === 'number') {
                    const locV = Number(locQs.ratingVotes) || 0, cloudV = Number(dRaw.questStats.ratingVotes) || 0;
                    state.user.questStats.rating = cloudV >= locV
                      ? (typeof dRaw.questStats.rating === 'number' ? dRaw.questStats.rating : locQs.rating)
                      : (typeof locQs.rating === 'number' ? locQs.rating : dRaw.questStats.rating);
                  }
                }
                if (dRaw.titlesData && dRaw.titlesData.collected) {
                  const loc = (state.user.titlesData && state.user.titlesData.collected) || [];
                  const merged = [...new Set([...loc, ...dRaw.titlesData.collected])];
                  const locTd = state.user.titlesData || {};
                  const cloudTd = dRaw.titlesData || {};
                  let equipped = cloudTd.equipped || locTd.equipped || null;
                  // Garde-fou : un Discordien/Beta cloud (souvent un reset parasite) ne doit
                  // pas écraser un titre local volontaire encore dans la collection.
                  if (locTd.equipped && locTd.equipped !== 'discordien' && locTd.equipped !== 'beta_tester'
                    && merged.includes(locTd.equipped)
                    && (!cloudTd.equipped || cloudTd.equipped === 'discordien' || cloudTd.equipped === 'beta_tester')) {
                    equipped = locTd.equipped;
                  }
                  state.user.titlesData = Object.assign({}, locTd, cloudTd, { collected: merged, equipped });
                }
                if (typeof dRaw.editorActiveMs === 'number') {
                  state.user.editorActiveMs = Math.max(Number(state.user.editorActiveMs) || 0, dRaw.editorActiveMs);
                }
                if (dRaw.beautyQuestUnlocked) state.user.beautyQuestUnlocked = true;
                // Ne jamais écraser un lastEditedAt local plus récent ; sinon restaurer le cloud
                if (dRaw.lastEditedAt) {
                  const locTs = state.user.lastEditedAt ? new Date(state.user.lastEditedAt).getTime() : 0;
                  const cloudTs = new Date(dRaw.lastEditedAt).getTime();
                  if (!locTs || cloudTs >= locTs) state.user.lastEditedAt = dRaw.lastEditedAt;
                }
              }
            }
          } catch (e) { console.warn('[Matefindr] cloud profile restore failed', e); }
        }
        save(); setAuth(true);
        if (window.MatefindrDiscordPresence?.start) window.MatefindrDiscordPresence.start();
        // Sync quêtes (note / votes) dès la connexion — init() a souvent tourné avant l'auth.
        try { await refreshQuestsAfterLogin(); } catch(_){}
        // Sync AVANT l'appel Discord (awaited) : discord-join-dm lit profiles.data.boost
        // pour synchroniser le rôle Discord "Boost" → il faut que la base soit à jour
        // (ex: juste après un achat Boost) avant que la fonction ne la lise.
        try { if (typeof syncMyProfileToCloud === 'function') await syncMyProfileToCloud(); } catch(_){}
        try { window.__discordJoinDM && await window.__discordJoinDM(); } catch(_){}
        try { if (typeof fetchOtherProfiles === 'function') fetchOtherProfiles(true); } catch(_){}
        // Replay d'une action venue d'un lien de partage (❤️/✖️ fait AVANT la création
        // de compte) : on enregistre le like puis on nettoie et on renvoie à l'accueil.
        // (Les réactions, elles, ne nécessitent plus de compte -- cf. sendReaction/getReactorId --
        // donc plus aucun replay post-login n'est nécessaire pour elles.)
        let _hadPendingShared = false;
        try {
          const raw = localStorage.getItem('matefindr_pending_action');
          if (raw) {
            localStorage.removeItem('matefindr_pending_action');
            _hadPendingShared = true;
            const pa = JSON.parse(raw);
            if (pa && pa.action === 'like' && pa.uid && typeof recordLike === 'function') recordLike({ uid: pa.uid });
            _sharedProfile = null;
            document.body.removeAttribute('data-shared');
            document.body.removeAttribute('data-shared-own');
            try { history.replaceState(null, '', '/'); } catch(_){}
          }
        } catch(_){}
        // On ne (re)définit l'écran QUE lors de la vraie connexion initiale, jamais sur un
        // re-événement d'auth (focus d'onglet) → sinon ça renverrait à l'accueil sans cesse.
        if (!alreadyInApp()) {
          // Aperçu ouvert depuis l'éditeur : on entre DIRECTEMENT en aperçu ici (dernier
          // setScreen après les awaits) → sinon ce setScreen écrase l'enterPreviewMode de
          // handleEditorReturn et on retombe sur l'index (la landing).
          let wantPreview = false;
          try { wantPreview = location.hash === '#preview' || sessionStorage.getItem('mf_from_editor') === '1'; } catch(_){}
          // Lien de partage en cours (et pas d'action en attente déjà rejouée ci-dessus) →
          // c'est handleSharedLink()/openSharedProfile() qui décident de l'écran, pas nous
          // (sinon ça flashe landing avant que le profil partagé s'affiche).
          const wantShared = !_hadPendingShared && typeof getSharedSlug === 'function' && !!getSharedSlug();
          if (wantPreview && typeof enterPreviewMode === 'function') {
            _previewFromEditor = true;
            // Consommer le flag immédiatement — sinon un retour landing +
            // "Commencer à swiper" / re-login rouvre l'aperçu tout seul.
            try { sessionStorage.removeItem('mf_from_editor'); } catch(_){}
            enterPreviewMode();
            try { history.replaceState(null, '', location.pathname); } catch(_){}
          } else if (wantShared) {
            // no-op : laissé à handleSharedLink()/openSharedProfile()
          } else {
            enterFullApp();
          }
        }
      },
      go(screen){
        // "Commencer à swiper" / navigation volontaire → jamais rouvrir l'aperçu éditeur
        if (screen === 'swipe') {
          _previewMode = false;
          _previewProfile = null;
          _previewFromEditor = false;
          try { sessionStorage.removeItem('mf_from_editor'); } catch(_){}
          document.body.removeAttribute('data-preview');
        }
        setScreen(screen);
      },
      hasProfile(){ return !!state.profile; },
    };

    /* Ajoute l'utilisateur au serveur Discord (scope guilds.join) puis lui envoie
       un DM de bienvenue via le bot — appel à l'edge function Supabase.
       Rappelée à CHAQUE login (pas juste la 1re fois) pour re-ajouter automatiquement
       quelqu'un qui aurait quitté le serveur Discord entre-temps. Le DM de bienvenue,
       lui, n'est envoyé qu'UNE SEULE FOIS DANS LA VIE de l'utilisateur — c'est
       l'Edge Function qui le garantit côté serveur (table discord_welcome_dm), pas
       le navigateur, donc ça tient même en changeant d'appareil ou en vidant le cache. */
    let _joinDmCalled = false; // évite le double appel getSession()+onAuthStateChange sur CE chargement de page
    window.__discordJoinDM = async function(){
      const u = state.user || {};
      const token  = localStorage.getItem('matefindr_discord_token');
      const userId = u.discordId;
      if (!token || !userId) return;
      if (_joinDmCalled) return;
      _joinDmCalled = true;
      try {
        const res = await fetch(SUPABASE_URL + '/functions/v1/discord-join-dm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ access_token: token, user_id: userId }),
        });
        const data = await res.json().catch(() => ({}));
        console.log('[Matefindr] discord join+DM:', data);
      } catch (e) {
        console.warn('[Matefindr] discord join+DM failed', e);
      }
    };

    // ---------- Onboarding (welcome → age → genre → pays → perso) ----------
    const draft = { age:null, gender:null, country:null, countryFlag:'', pseudo:'', bio:'', color1:null, color2:null, avatar:null };
    function selectOpt(container, value){
      container.querySelectorAll('.onb-opt').forEach(b => b.classList.toggle('selected', b.dataset.val === value));
    }
    function $onb(id){ return document.getElementById(id); }

    // Populate the welcome "Hey, X !" page from any known name/avatar (priorité au compte Discord connecté)
    function initOnboarding(){
      let name = 'toi', avatarUrl = null;
      try {
        const u = state.user || {};
        name = u.displayName
            || (window.__discordUser && window.__discordUser.username)
            || (document.getElementById('accName') && document.getElementById('accName').textContent.trim())
            || (state.profile && state.profile.pseudo) || 'toi';
        avatarUrl = u.avatarUrl
            || (window.__discordUser && window.__discordUser.avatarUrl)
            || null;
      } catch(_){}
      const nEl = $onb('onbWelcomeName'); if (nEl) nEl.textContent = (name && name !== '—' && name.trim()) ? name : 'toi';
      const av = $onb('onbWelcomeAvatar');
      if (av) {
        if (avatarUrl) { av.classList.add('has-img'); av.innerHTML = '<img src="'+avatarUrl+'" alt="">'; }
        else { av.classList.remove('has-img'); av.textContent = '🎉'; }
      }
      // Préremplit pseudo (depuis Discord) + bio (étape perso)
      try {
        const u = state.user || {};
        const pseudoEl = $onb('onbPseudo');
        if (pseudoEl && !pseudoEl.value && (u.displayName || name !== 'toi')) {
          pseudoEl.value = u.displayName || name;
          draft.pseudo = pseudoEl.value;
        }
        const bioEl = $onb('onbBio');
        if (bioEl && !bioEl.value && u.bio) { bioEl.value = u.bio; draft.bio = u.bio; }
      } catch(_){}
      goStep(1);
    }
    window.__initOnboarding = initOnboarding;

    // Step 1 — page fusionnée : âge + genre + pays (validation unifiée)
    function refreshStep1Validation(){
      const next = $onb('onbNext1');
      if (!next) return;
      next.disabled = !(draft.age != null && draft.gender && draft.country);
    }
    $onb('onbGender').addEventListener('click', e => {
      const b = e.target.closest('.onb-opt'); if (!b) return;
      draft.gender = b.dataset.val;
      selectOpt(b.parentElement, draft.gender);
      $onb('onbGenderSkip')?.classList.remove('is-active');
      refreshStep1Validation();
    });
    $onb('onbGenderSkip')?.addEventListener('click', e => {
      draft.gender = e.currentTarget.dataset.val; // 'hidden'
      document.querySelectorAll('#onbGender .onb-opt').forEach(b => b.classList.remove('selected'));
      e.currentTarget.classList.add('is-active');
      refreshStep1Validation();
    });
    $onb('onbAge').addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      draft.age = (v >= 18 && v <= 99) ? v : null;
      refreshStep1Validation();
    });
    $onb('onbCountry').addEventListener('change', e => {
      const opt = e.target.selectedOptions[0];
      draft.country = e.target.value || null;
      draft.countryFlag = opt ? (opt.getAttribute('data-flag') || '') : '';
      refreshStep1Validation();
    });

    /* Country picker custom — affiche les vraies images flagcdn dans le dropdown */
    (function initCountryPicker(){
      const picker  = $onb('onbCountryPicker');
      const trigger = $onb('onbCountryTrigger');
      const search  = $onb('onbCountrySearch');
      const list    = $onb('onbCountryList');
      const select  = $onb('onbCountry');
      if (!picker || !trigger || !search || !list || !select) return;
      const countries = [...select.querySelectorAll('option')]
        .filter(o => o.value)
        .map(o => ({ code: o.value, name: o.textContent.replace(/^\s*\S+\s*/, '').trim() })); // retire emoji devant
      const flagUrl = c => c === 'OTHER' ? '' : `https://flagcdn.com/${c.toLowerCase()}.svg`;
      function renderList(filter){
        const q = (filter || '').toLowerCase().trim();
        const matches = countries.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
        list.innerHTML = matches.length
          ? matches.map(c => `<div class="ctry-item" data-code="${c.code}"><span style="display:inline-flex;width:26px;height:18px;justify-content:center;align-items:center;flex:0 0 auto">${c.code === 'OTHER' ? '🏳️' : `<img src="${flagUrl(c.code)}" alt="${c.code}" loading="lazy">`}</span><span>${c.name}</span></div>`).join('')
          : `<div class="ctry-empty">Aucun pays</div>`;
      }
      function setTriggerLabel(code, name){
        if (!code) { trigger.innerHTML = '<span class="ctry-name ctry-placeholder">Choisis ton pays…</span>'; return; }
        const flag = code === 'OTHER' ? '<span style="font-size:18px">🏳️</span>' : `<img class="ctry-flag" src="${flagUrl(code)}" alt="${code}">`;
        trigger.innerHTML = `${flag}<span class="ctry-name">${name}</span>`;
      }
      function open(){ picker.setAttribute('data-open', 'true'); renderList(''); search.value=''; setTimeout(() => search.focus(), 0); }
      function close(){ picker.setAttribute('data-open', 'false'); }
      function pick(code){
        const c = countries.find(x => x.code === code); if (!c) return;
        select.value = code;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        setTriggerLabel(code, c.name);
        close();
      }
      trigger.addEventListener('click', e => { e.stopPropagation(); picker.getAttribute('data-open') === 'true' ? close() : open(); });
      search.addEventListener('input', e => renderList(e.target.value));
      list.addEventListener('click', e => { const it = e.target.closest('.ctry-item'); if (it) pick(it.dataset.code); });
      document.addEventListener('click', e => { if (!picker.contains(e.target)) close(); });
      // Init affichage si valeur déjà sélectionnée
      if (select.value) { const c = countries.find(x => x.code === select.value); if (c) setTriggerLabel(c.code, c.name); }
      renderList('');
    })();
    // Step 4 — personnalisation : champs déplacés dans l'éditeur (bindings gardés null-safe)
    $onb('onbPseudo')?.addEventListener('input', e => { draft.pseudo = e.target.value.trim(); });
    $onb('onbBio')?.addEventListener('input', e => { draft.bio = e.target.value.trim(); });
    $onb('onbColor1')?.addEventListener('input', e => { draft.color1 = e.target.value; });
    $onb('onbColor2')?.addEventListener('input', e => { draft.color2 = e.target.value; });
    $onb('onbAvatarFile')?.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { draft.avatar = rd.result; const inner = $onb('onbAvatarInner'); if (inner) inner.outerHTML = '<img id="onbAvatarInner" src="'+rd.result+'" alt="">'; };
      rd.readAsDataURL(f);
    });

    function goStep(n){
      document.querySelectorAll('.onb-step').forEach(s => {
        s.hidden = parseInt(s.dataset.step, 10) !== n;
      });
      // 2 dots : step 1 (bienvenue + formulaire) et step 4 (perso)
      const dots = $onb('onbProgress').children;
      const stepIdx = (n === 1) ? 1 : 2;
      for (let i=0; i<dots.length; i++) dots[i].classList.toggle('done', i < stepIdx);
      try { $onb('screen-onboarding').scrollTop = 0; } catch(_){}
    }
    $onb('onbStart')?.addEventListener('click', () => goStep(1));
    $onb('onbNext1').addEventListener('click', () => goStep(4));
    document.querySelectorAll('#screen-onboarding [data-go]').forEach(b => b.addEventListener('click', () => goStep(parseInt(b.dataset.go, 10))));

    function finishOnboarding(openBubbles){
      state.profile = {
        gender: draft.gender, age: draft.age,
        country: draft.country, countryFlag: draft.countryFlag,
        looking: 'chill',
        pseudo: draft.pseudo || '', bio: draft.bio || '',
        color1: draft.color1, color2: draft.color2,
        avatar: draft.avatar || null
      };
      save();
      // Reflète les choix de perso dans le compte si les champs existent
      try {
        if (draft.pseudo){ const el=$onb('accPseudo'); if(el){ el.value=draft.pseudo; el.dispatchEvent(new Event('input',{bubbles:true})); } }
        if (draft.bio){ const el=$onb('accBio'); if(el){ el.value=draft.bio; el.dispatchEvent(new Event('input',{bubbles:true})); } }
        if (draft.color1){ const el=$onb('accProfileColor'); if(el){ el.value=draft.color1; el.dispatchEvent(new Event('input',{bubbles:true})); } }
        if (draft.color2){ const el=$onb('accProfileColor2'); if(el){ el.value=draft.color2; el.dispatchEvent(new Event('input',{bubbles:true})); } }
      } catch(_){}
      if (openBubbles){
        // Les bulles s'éditent dans l'éditeur → on ouvre l'éditeur (pas l'écran Paramètres).
        location.href = 'editor.html';
      } else {
        setScreen('swipe');
      }
    }
    // « Personnaliser votre profil » → ouvre l'éditeur ; « Plus tard » → va au swipe
    $onb('onbPersoBtn')?.addEventListener('click', () => finishOnboarding(true));
    $onb('onbSkip')?.addEventListener('click', () => finishOnboarding(false));
    $onb('onbFinish')?.addEventListener('click', () => finishOnboarding(false));
    $onb('onbBubblesBtn')?.addEventListener('click', () => finishOnboarding(true));

    // ---------- Swipe deck ----------
    // Mock profiles. Each has nitro flag, joinedOn date, and an `orbs` array
    // — bubbles that orbit the card. Click an orb to hear/see its content.
    // Bots retirés — la liste est désormais alimentée par Supabase (table public.profiles).
    // Cf. _remoteProfiles ci-dessous et fetchOtherProfiles() qui hydrate ce cache.
    const _PROFILES_LEGACY = [
      { name:'Alex', tag:'alex', age:21, gender:'male', looking:'game', status:'online', nitro:true, boost:true,
        joinedOn:'14 oct. 2025',
        activity:{type:'game', title:'CS2', sub:'En partie — Dust2 16-12'},
        games:['CS2','Valorant','Apex'], bio:'Faceit lvl 8, on tryhard ?',
        common:{friends:3, servers:2}, c1:'#FF7EB6', c2:'#9146FF', initial:'A',
        orbs:[
          {kind:'music', title:'Sicko Mode',         sub:'Travis Scott',     emoji:'🎵', voice:null},
          {kind:'voice', title:'Note vocale',        sub:"« Yo c'est Alex »", emoji:'🎤', voice:"Yo, c'est Alex. On tryhard CS ce soir ?"},
          {kind:'game',  title:'Counter-Strike 2',    sub:'2 134 h de jeu',   emoji:'🎮', rank:'Global Elite'},
          {kind:'film', title:'One Piece',           sub:'Anime préféré',     emoji:'📺'},
          {kind:'music', title:'Mo Bamba',           sub:'Sheck Wes',         emoji:'🎵'},
          {kind:'game',  title:'Valorant',            sub:'Immortal 2',        emoji:'🎮', rank:'Immortal'},
        ] },
      { name:'Léa', tag:'leah_', age:19, gender:'female', looking:'chill', status:'idle', nitro:true,
        joinedOn:'2 sept. 2025',
        activity:{type:'music', title:'Spotify', sub:'Sweater Weather · The Neighbourhood'},
        games:['Stardew','Hades'], bio:'Stardew & Animal Crossing, binôme cosy 🌱',
        common:{friends:1, servers:4}, c1:'#5BE9FF', c2:'#9146FF', initial:'L',
        orbs:[
          {kind:'music', title:'Sweater Weather',    sub:'The Neighbourhood', emoji:'🎵'},
          {kind:'voice', title:'Note vocale',        sub:"« Salut toi »",     emoji:'🎤', voice:"Coucou, moi c'est Léa, ravie de te rencontrer !"},
          {kind:'film', title:'Studio Ghibli',       sub:'Pokoyo, Totoro',    emoji:'📺'},
          {kind:'game',  title:'Stardew Valley',     sub:'400h+ de farm',     emoji:'🎮'},
          {kind:'music', title:'Strawberries & Cigarettes', sub:'Troye Sivan', emoji:'🎵'},
          {kind:'film', title:'Demon Slayer',       sub:'En cours',          emoji:'📺'},
        ] },
      { name:'Mo', tag:'mo.zzz', age:23, gender:'male', looking:'sleep', status:'dnd', nitro:false,
        joinedOn:'21 août 2025',
        activity:{type:'call', title:'Dans un appel', sub:'Voicechat — Matefindr Chill'},
        games:['Minecraft','Rocket League'], bio:'Insomniaque. Sleepcall ce soir ?',
        common:{friends:0, servers:1}, c1:'#FFB66E', c2:'#FF4FA0', initial:'M',
        orbs:[
          {kind:'voice', title:'Note vocale',        sub:"« Bonne nuit »",    emoji:'🎤', voice:"Hey, si tu galères à dormir, je suis dispo en sleepcall."},
          {kind:'music', title:'Drown',              sub:'Cuco',              emoji:'🎵'},
          {kind:'game',  title:'Minecraft',          sub:'Realm chill',       emoji:'🎮'},
          {kind:'film', title:'Cowboy Bebop',       sub:'Anime culte',       emoji:'📺'},
        ] },
      { name:'Sam', tag:'sam.exe', age:20, gender:'other', looking:'talk', status:'online', nitro:true, boost:true,
        joinedOn:'5 nov. 2025',
        activity:{type:'game', title:'League of Legends', sub:'File d\'attente — Solo/Duo'},
        games:['LoL','TFT'], bio:'Main support, je carry les mid 🙃',
        common:{friends:5, servers:3}, c1:'#3BD17C', c2:'#5BE9FF', initial:'S',
        orbs:[
          {kind:'game',  title:'League of Legends', sub:'Soraka one-trick',   emoji:'🎮'},
          {kind:'music', title:'Industry Baby',      sub:'Lil Nas X',         emoji:'🎵'},
          {kind:'voice', title:'Note vocale',        sub:"« Duo maintenant ? »", emoji:'🎤', voice:"Yo, t'es chaud pour un duo ranked maintenant ?"},
          {kind:'film', title:'Jujutsu Kaisen',     sub:'Saison 2',          emoji:'📺'},
        ] },
      { name:'Nora', tag:'noraaa', age:22, gender:'female', looking:'chill', status:'online', nitro:false,
        joinedOn:'12 juil. 2025',
        activity:{type:'game', title:'Phasmophobia', sub:'En partie depuis 23 min'},
        games:['Phasmo','Stardew'], bio:"Films d'horreur + popcorn, t'es chaud ?",
        common:{friends:2, servers:2}, c1:'#A65BFF', c2:'#FF7EB6', initial:'N',
        orbs:[
          {kind:'film', title:'Junji Ito',          sub:'Tomié, Uzumaki',    emoji:'📺'},
          {kind:'music', title:'Bury a Friend',       sub:'Billie Eilish',     emoji:'🎵'},
          {kind:'game',  title:'Phasmophobia',       sub:'Pro hunter',        emoji:'🎮'},
          {kind:'voice', title:'Note vocale',        sub:"« Halloween toute l'année »", emoji:'🎤', voice:"Hello, on regarde Insidious ensemble ?"},
        ] },
      { name:'Theo', tag:'theo_apex', age:25, gender:'male', looking:'talk', status:'online', nitro:true,
        joinedOn:'29 juin 2025',
        activity:{type:'game', title:'Apex Legends', sub:'En partie ranked'},
        games:['Apex','Warzone'], bio:'Predator EU. Cherche duo sérieux maintenant.',
        common:{friends:4, servers:1}, c1:'#FF4FA0', c2:'#9146FF', initial:'T',
        orbs:[
          {kind:'game',  title:'Apex Legends',       sub:'Predator EU',       emoji:'🎮'},
          {kind:'music', title:'Sicko Mode',          sub:'Travis Scott',      emoji:'🎵'},
          {kind:'voice', title:'Note vocale',        sub:"« Duo Apex now ? »", emoji:'🎤', voice:"Yo, je cherche un duo Apex là, t'es bon comment ?"},
          {kind:'game',  title:'Warzone',            sub:'KD 2.4',            emoji:'🎮'},
        ] },
      { name:'Iris', tag:'iris_zzz', age:18, gender:'female', looking:'sleep', status:'idle', nitro:true, boost:true,
        joinedOn:'18 sept. 2025',
        activity:{type:'call', title:'Dans un appel', sub:'2 personnes'},
        games:['Minecraft'], bio:'Voix douce, sleepcall calme ☁️',
        common:{friends:1, servers:5}, c1:'#5BE9FF', c2:'#FF7EB6', initial:'I',
        orbs:[
          {kind:'voice', title:'Note vocale',        sub:"« Bonsoir »",       emoji:'🎤', voice:"Bonsoir, je m'appelle Iris. Tu veux un sleepcall ?"},
          {kind:'music', title:'Lover',               sub:'Taylor Swift',      emoji:'🎵'},
          {kind:'film', title:'Your Name',          sub:'Makoto Shinkai',    emoji:'📺'},
          {kind:'game',  title:'Minecraft',          sub:'Survie tranquille', emoji:'🎮'},
        ] },
      { name:'Kai', tag:'kai.lofi', age:24, gender:'other', looking:'chill', status:'online', nitro:false,
        joinedOn:'3 oct. 2025',
        activity:{type:'music', title:'Spotify', sub:'lofi hip hop radio — beats'},
        games:['Disco Elysium'], bio:'Lecture, lo-fi, débats jusqu\'à 4h du mat.',
        common:{friends:0, servers:6}, c1:'#9146FF', c2:'#3BD17C', initial:'K',
        orbs:[
          {kind:'music', title:'lofi beats',          sub:'ChilledCow',        emoji:'🎵'},
          {kind:'film', title:'Mushishi',           sub:'Slow anime',        emoji:'📺'},
          {kind:'game',  title:'Disco Elysium',      sub:'3x rejoué',         emoji:'🎮'},
          {kind:'voice', title:'Note vocale',        sub:"« Hello »",         emoji:'🎤', voice:"Salut, je m'appelle Kai. On discute philo ce soir ?"},
        ] },
      { name:'Zoé', tag:'zoe.dia', age:21, gender:'female', looking:'talk', status:'online', nitro:true,
        joinedOn:'24 oct. 2025',
        activity:{type:'game', title:'Valorant', sub:'Ranked — Diamond II'},
        games:['Valorant','Overwatch'], bio:'Diamond mais je rage pas (trop)',
        common:{friends:6, servers:2}, c1:'#FF7EB6', c2:'#FFB66E', initial:'Z',
        orbs:[
          {kind:'game',  title:'Valorant',           sub:'Diamond II',        emoji:'🎮'},
          {kind:'music', title:'Bad Habits',          sub:'Ed Sheeran',        emoji:'🎵'},
          {kind:'voice', title:'Note vocale',        sub:"« Duo Valo ? »",    emoji:'🎤', voice:"Hello, t'es chaud pour une ranked Valo là ?"},
          {kind:'game',  title:'Overwatch 2',        sub:'Master support',    emoji:'🎮'},
        ] },
      { name:'Hugo', tag:'hugo.rev', age:26, gender:'male', looking:'chill', status:'dnd', nitro:false,
        joinedOn:'11 avr. 2025',
        activity:{type:'game', title:'Elden Ring', sub:'Boss : Malenia'},
        games:['Resident Evil','Elden Ring'], bio:'Marathon Resi 4, stream le soir.',
        common:{friends:2, servers:3}, c1:'#6B2BFF', c2:'#5BE9FF', initial:'H',
        orbs:[
          {kind:'game',  title:'Elden Ring',         sub:'NG+3',              emoji:'🎮'},
          {kind:'film', title:'Berserk',            sub:'Manga + anime',     emoji:'📺'},
          {kind:'music', title:'Mind Mischief',       sub:'Tame Impala',       emoji:'🎵'},
          {kind:'voice', title:'Note vocale',        sub:"« On stream ? »",   emoji:'🎤', voice:"Yo, je stream Resi 4 ce soir, t'es chaud pour venir ?"},
        ] },
    ];
    let deckIdx = 0;
    /** Resync Discord limité : username (tag) + serveurs + email — rien d'autre. */
    function applyLimitedDiscordResync(u, d, guilds){
      if (!u) return false;
      let dirty = false;
      if (d) {
        if (d.id && u.discordId !== d.id) { u.discordId = d.id; dirty = true; }
        const tag = (d.username || '').replace(/#0$/, '');
        if (tag && u.discordTag !== tag) { u.discordTag = tag; dirty = true; }
        if (d.email && u.email !== d.email) { u.email = d.email; dirty = true; }
      }
      if (Array.isArray(guilds) && guilds.length) {
        u.guilds = guilds;
        dirty = true;
      }
      return dirty;
    }

    let _guildRefreshPending = false;
    function refreshMyGuildsIfNeeded(){
      const u = state.user;
      if (!u || !u.discordId || (Array.isArray(u.guilds) && u.guilds.length) || _guildRefreshPending || !window.__refreshDiscordGuilds) return;
      _guildRefreshPending = true;
      window.__refreshDiscordGuilds(u.discordId).then(g => {
        _guildRefreshPending = false;
        if (!g || !g.length) return;
        state.user.guilds = g;
        save();
        try { scheduleCloudSync(); } catch(_){}
        // Soft refresh : met à jour les serveurs en commun SANS rejouer l'anim d'entrée.
        if (document.body.getAttribute('data-screen') === 'swipe') softRefreshSwipeCard();
      }).catch(() => { _guildRefreshPending = false; });
    }

    /** Profil actuellement affiché dans #swipeWrap (après ensureDeckSync). */
    function currentSwipeProfile(){
      if (_sharedProfile && !_previewMode) return _sharedProfile;
      if (_previewMode) return _previewProfile || buildUserProfile() || buildMinimalProfile();
      const pool = genderFilteredProfiles();
      return pool[deckIdx] || null;
    }

    function commonGuildsForProfile(p){
      const myGuilds = (state.user && Array.isArray(state.user.guilds)) ? state.user.guilds : [];
      if (!p || p.isMe || !Array.isArray(p.guildIds) || !myGuilds.length) return [];
      const theirs = new Set(p.guildIds.map(String));
      return myGuilds.filter(g => theirs.has(String(g.id)));
    }

    function guildsBlockHtml(commonGuilds){
      const nGuild = commonGuilds.length;
      if (!nGuild) return '';
      const guildIconHtml = (g) => g.iconUrl
        ? `<img class="cg-icon" src="${g.iconUrl}" alt="${escapeHtmlMini(g.name || '')}" title="${escapeHtmlMini(g.name || '')}">`
        : `<span class="cg-icon cg-icon--ph" title="${escapeHtmlMini(g.name || '')}">${escapeHtmlMini((g.name || '?').charAt(0).toUpperCase())}</span>`;
      const guildLabel = nGuild === 1
        ? `<b>1</b> serveur commun`
        : `<b>${nGuild}</b> serveurs communs`;
      return `<div class="card-guilds card-guilds--head" title="${nGuild} serveur${nGuild > 1 ? 's' : ''} Discord en commun">
          <span class="cg-label">${guildLabel}</span>
          <div class="cg-icons">
            ${commonGuilds.slice(0, 5).map(guildIconHtml).join('')}
            ${nGuild > 5 ? `<span class="cg-more">+${nGuild - 5}</span>` : ''}
          </div>
        </div>`;
    }

    /**
     * Serveurs en commun à droite du titre par défaut.
     * Si le titre (1 ligne) + pastille ne tiennent pas → stack (serveurs juste au-dessus).
     */
    function syncTitleGuildsLayout(card){
      if (!card) return;
      const row = card.querySelector('.card-title-guilds-row');
      if (!row) return;
      const guilds = row.querySelector('.card-guilds--head');
      const titleSlot = row.querySelector('.card-title-slot:not(.card-title-slot--empty)');
      if (!guilds || !titleSlot) {
        row.classList.remove('card-title-guilds-row--stack');
        return;
      }
      row.classList.remove('card-title-guilds-row--stack');
      const text = titleSlot.querySelector('.card-profile-title-text') || titleSlot;
      const prevWs = text.style.whiteSpace;
      text.style.whiteSpace = 'nowrap';
      const titleW = text.scrollWidth;
      text.style.whiteSpace = prevWs;
      const guildsW = Math.max(guilds.offsetWidth || 0, 96);
      const gap = 14;
      const needsStack = titleW + guildsW + gap > row.clientWidth + 1;
      row.classList.toggle('card-title-guilds-row--stack', needsStack);
    }

    /** Met à jour la carte déjà à l'écran (guilds / vues) sans wipe ni anim cardIn. */
    function softRefreshSwipeCard(){
      const wrap = document.getElementById('swipeWrap');
      const card = wrap && wrap.querySelector('.swipe-card');
      const p = currentSwipeProfile();
      if (!card || !p) return;
      const sameUid = p.uid && card.dataset.profileUid === String(p.uid);
      const sameMe = p.isMe && card.dataset.profileMe === '1';
      if (!sameUid && !sameMe) return;

      const guildsHtml = guildsBlockHtml(commonGuildsForProfile(p));
      let row = card.querySelector('.card-title-guilds-row');
      const titleSlot = card.querySelector('.card-title-slot');
      if (guildsHtml) {
        if (!row) {
          row = document.createElement('div');
          row.className = 'card-title-guilds-row';
          const handle = card.querySelector('.handle');
          if (handle && handle.parentElement) {
            handle.insertAdjacentElement('afterend', row);
          } else {
            const body = card.querySelector('.body > div');
            if (body) body.appendChild(row);
          }
        }
        if (titleSlot) {
          if (!row.contains(titleSlot)) row.appendChild(titleSlot);
        } else if (!row.querySelector('.card-title-slot')) {
          const empty = document.createElement('span');
          empty.className = 'card-title-slot card-title-slot--empty';
          empty.setAttribute('aria-hidden', 'true');
          row.appendChild(empty);
        }
        const oldG = row.querySelector('.card-guilds--head');
        if (oldG) oldG.outerHTML = guildsHtml;
        else {
          const titleEl = row.querySelector('.card-title-slot');
          if (titleEl) titleEl.insertAdjacentHTML('beforebegin', guildsHtml);
          else row.insertAdjacentHTML('afterbegin', guildsHtml);
        }
        // Remet le titre après les guilds si l'ordre a dérivé
        const gEl = row.querySelector('.card-guilds--head');
        const tEl = row.querySelector('.card-title-slot');
        if (gEl && tEl && gEl.compareDocumentPosition(tEl) & Node.DOCUMENT_POSITION_PRECEDING) {
          row.insertBefore(gEl, tEl);
        }
        card.classList.add('has-common-guilds');
        requestAnimationFrame(() => syncTitleGuildsLayout(card));
      } else {
        const oldG = card.querySelector('.card-guilds--head');
        if (oldG) oldG.remove();
        if (row) row.classList.remove('card-title-guilds-row--stack');
        if (row && !row.querySelector('.card-title-slot:not(.card-title-slot--empty)') && !row.querySelector('.card-guilds')) {
          row.remove();
        }
        card.classList.remove('has-common-guilds');
      }

      const viewsB = card.querySelector('.card-views b');
      if (viewsB && typeof p.views === 'number') viewsB.textContent = (p.views || 0).toLocaleString('fr-FR');
      syncSwipeWrapGradient(p);
    }

    /** Rafraîchit discordLive (bot Gateway) sur la carte visible sans rebuild complet. */
    async function refreshVisibleDiscordLive(){
      if (!window.__supa) return;
      if (document.body.getAttribute('data-screen') !== 'swipe') return;
      const p = currentSwipeProfile();
      if (!p || !p.uid) return;
      try {
        const { data: row } = await window.__supa.from('profiles').select('data').eq('id', p.uid).maybeSingle();
        const live = row?.data?.discordLive;
        if (!live || typeof live !== 'object') return;
        const prev = p.discordLive ? JSON.stringify(p.discordLive) : '';
        if (prev === JSON.stringify(live)) return;
        p.discordLive = live;
        const cached = (_remoteProfiles || []).find(x => x.uid === p.uid);
        if (cached) cached.discordLive = live;
        if (p.isMe && state.user) {
          state.user.discordLive = live;
          try { save(); } catch(_){}
        }
        const wrap = document.getElementById('swipeWrap');
        const card = wrap && wrap.querySelector('.swipe-card');
        if (!card) return;
        const TQ = window.MatefindrTitlesQuests;
        if (!TQ || typeof TQ.discordFloorHtml !== 'function') return;
        const floorHtml = TQ.discordFloorHtml(p, { esc: escapeHtmlMini, fmtRelative: fmtRelativeFr });
        let stack = card.querySelector('.card-discord-conn-stack');
        if (!floorHtml) {
          stack?.querySelectorAll('.discord-floor').forEach(el => el.remove());
          return;
        }
        if (!stack) {
          stack = document.createElement('div');
          stack.className = 'card-discord-conn-stack';
          const bio = card.querySelector('.bio');
          const body = card.querySelector('.body');
          if (bio) bio.insertAdjacentElement('afterend', stack);
          else if (body) body.appendChild(stack);
        }
        stack.querySelectorAll('.discord-floor').forEach(el => el.remove());
        stack.insertAdjacentHTML('afterbegin', floorHtml);
        card.classList.add('has-discord-floor');
      } catch (_) {}
    }
    setInterval(() => { try { refreshVisibleDiscordLive(); } catch(_){} }, 20000);
    let _previewMode = false; // true = aperçu complet d'UNE carte figée (pas de swipe, bouton "Quitter")
    let _previewProfile = null; // profil affiché en aperçu -- null = MA propre carte (comportement historique), sinon un profil tiers (ex: ouvert depuis un chat/qui-t'a-liké)
    let _previewReturn = null; // { screen, deckIdx } capturé à l'entrée en aperçu D'UN PROFIL TIERS -- "Quitter" y revient au lieu de toujours renvoyer au hub (comportement historique gardé pour SA PROPRE carte, voir enterPreviewMode)
    let _previewFromEditor = false; // true = aperçu ouvert depuis editor.html (#preview) → "Quitter" doit y retourner
    let _sharedProfile = null; // profil ouvert via un lien de partage matefindr.com/<slug> (carte + like/dislike)
    // Gain global appliqué à la musique (entrée + previews) — baisse le son partout (trop fort sinon)
    const ENTRY_MUSIC_GAIN = (window.MatefindrVolume && window.MatefindrVolume.GAIN) || 0.275;
    const DEFAULT_MUSIC_VOL = 0.5; // 50% par défaut
    function mediaEffectiveVol(){
      const MV = window.MatefindrVolume;
      const raw = (state.user && typeof state.user.musicVolume === 'number') ? state.user.musicVolume : DEFAULT_MUSIC_VOL;
      return MV ? MV.effective(raw) : raw * ENTRY_MUSIC_GAIN;
    }
    function refreshProfileVoiceVol(){
      document.querySelectorAll('.card-voice').forEach(w => {
        if (w._voiceAudio) try { w._voiceAudio.volume = mediaEffectiveVol(); } catch(_){}
      });
    }

    function buildMinimalProfile(){
      const u = state.user || {};
      const p = state.profile || {};
      return {
        name: u.displayName || u.email?.split('@')[0] || 'Mon profil',
        tag: u.discordTag || 'moi',
        age: p.age || '',
        gender: p.gender || '',
        country: p.country || '',
        countryFlag: p.countryFlag || '',
        looking: p.looking || 'game',
        status: 'online',
        nitro: false,
        fakeDeco: null,
        boost: !!u.boost,
        showBoostName: u.boostShowName !== false,
        nameColor: u.nameColor || null,
        handleBlur: !!u.handleBlur,
        connUniformColor: (u.connUniformColor && /^#[0-9a-f]{6}$/i.test(u.connUniformColor)) ? u.connUniformColor : null,
        joinedOn: '',
        games: [],
        bio: p.bio || '',
        common: { friends:0, servers:0 },
        c1:'#242429', c2:'#1c1d22',
        initial: (u.displayName || u.email || 'M').charAt(0).toUpperCase(),
        avatarUrl: u.avatarUrl || null,
        discordAvatarUrl: u.discordAvatarUrl || u.avatarUrl || null,
        avatarPos: normalizeAvatarPos(u.avatarPos),
        bannerUrl: u.bannerUrl || null,
        profileColor: u.profileColor || '#393a41',
        profileColor2: u.profileColor2 || '#393a41',
        accentColor: u.accentColor || null,
        profileVoice: u.profileVoice || null,
        guildIds: [],
        orbs: [],
        gifs: Array.isArray(u.gifs) ? u.gifs : [],
        photos: Array.isArray(u.photos) ? u.photos : [],
        bg: u.boostBg || null,
        bgPos: u.boostBgPos || null,
        connections: (p.connections && typeof p.connections === 'object') ? p.connections : {},
        titlesData: window.MatefindrTitlesQuests ? window.MatefindrTitlesQuests.getTitlesData(u) : (u.titlesData || null),
        discordLive: u.discordLive || null,
        isMe: true,
        views: _myViewsCache,
      };
    }

    function buildUserProfile(){
      const u = state.user || {};
      const p = state.profile || {};
      if (!u.displayName && !u.email && !u.discordTag) return null;
      const subByKind  = {music:'musique', game:'jeu', anime:'série', film:'film'};
      const emoByKind  = {music:'🎵', game:'🎮', anime:'📺', film:'🎬'};
      const orbs = (p.userOrbs || []).map(o => ({
        kind: o.kind, title: o.title,
        sub: (o.kind === 'game' && o.rank) ? o.rank : (subByKind[o.kind] || ''),
        emoji: emoByKind[o.kind] || '✨',
        cover: o.cover || null, previewUrl: o.previewUrl || null,
        rank: o.rank || null, clipUrl: o.clipUrl || null,
        color: (o.color && /^#[0-9a-f]{6}$/i.test(o.color)) ? o.color : null,
        glow: (o.glow === false) ? false : (o.glow === true ? true : undefined),
        contour: (o.contour === false) ? false : (o.contour === true ? true : undefined),
        // Conserver la position custom (drag&drop) pour que la carte de swipe
        // place la bulle exactement là où l'utilisateur l'a posée dans l'éditeur.
        // + positions séparées par orientation (portrait/paysage téléphone).
        customX: o.customX, customY: o.customY,
        posPortrait: o.posPortrait || null, posLandscape: o.posLandscape || null,
      }));
      return {
        name: u.displayName || u.email?.split('@')[0] || 'Moi',
        tag: u.discordTag || 'moi',
        age: p.age || '',
        gender: p.gender || '',
        country: p.country || '',
        countryFlag: p.countryFlag || '',
        looking: p.looking || 'game',
        status: 'online',
        nitro: !!(u.boost && u.fakeNitro),
        fakeDeco: (u.boost && u.fakeNitro) ? (u.fakeDeco || null) : null,
        boost: !!u.boost,
        boostPlan: u.boostPlan || null,
        boostSince: u.boostSince || null,
        showBoostName: u.boostShowName !== false,
        nameColor: u.nameColor || null,
        handleBlur: !!u.handleBlur,
        connUniformColor: (u.connUniformColor && /^#[0-9a-f]{6}$/i.test(u.connUniformColor)) ? u.connUniformColor : null,
        joinedOn: new Date().toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}),
        games: [p.game].filter(Boolean),
        bio: p.bio || '',
        common: {friends:0, servers:0},
        c1:'#393a41', c2:'#393a41',
        initial: (u.displayName || u.email || 'T').charAt(0).toUpperCase(),
        avatarUrl: u.avatarUrl || null,
        discordAvatarUrl: u.discordAvatarUrl || u.avatarUrl || null,
        avatarPos: normalizeAvatarPos(u.avatarPos),
        bannerUrl: u.bannerUrl || null,
        decorationUrl: u.decorationUrl || null,
        // Couleur Discord par défaut (#393a41) tant que l'utilisateur n'a pas choisi la sienne.
        profileColor: u.profileColor || '#393a41',
        profileColor2: u.profileColor2 || '#393a41',
        accentColor: u.accentColor || null,
        profileVoice: u.profileVoice || null,
        // IDs des serveurs Discord → calcul des serveurs en commun chez les autres.
        guildIds: (Array.isArray(u.guilds) ? u.guilds.map(g => String(g.id)) : []),
        orbs,
        orbColors: (p.orbColors && typeof p.orbColors === 'object') ? p.orbColors : null,
        orbGlow: (p.orbGlow && typeof p.orbGlow === 'object') ? p.orbGlow : null,
        orbContour: (p.orbContour && typeof p.orbContour === 'object') ? p.orbContour : null,
        // Champs posés par admin.html -- jamais modifiés depuis ce site, mais buildUserProfile()
        // remplace TOUTE la colonne data à chaque sync : sans ce passthrough, se reconnecter
        // effacerait silencieusement le message du staff / le flag disabled / le compteur.
        disabled: !!u.disabled, disabledReason: u.disabledReason || null, disabledCount: u.disabledCount || 0,
        lastSeenAt: u.lastSeenAt || null,
        // Posé uniquement par l'éditeur sur une vraie modif visuelle — passthrough obligatoire
        // sinon un sync (notes → titres) écrase lastEditedAt et l'admin croit à une modif.
        lastEditedAt: u.lastEditedAt || null,
        staffMessage: u.staffMessage || null,
        forceLogoutAt: u.forceLogoutAt || null,
        discordLive: u.discordLive || null,
        discordTag: u.discordTag || null,
        publicFlags: u.publicFlags || 0,
        premiumType: u.premiumType || 0,
        socials: u.socials || {},
        // Cross-user : GIFs, fond perso et musique d'entrée → visibles par les autres
        gifs: Array.isArray(u.gifs) ? u.gifs : [],
        gifContour: (u.gifContour !== false),
        photos: Array.isArray(u.photos) ? u.photos : [],
        photoContour: (u.photoContour !== false),
        bg: u.boostBg || null,
        bgPos: u.boostBgPos || null,
        swipeMusic: u.swipeMusic || null,
        connections: (p.connections && typeof p.connections === 'object') ? p.connections : {},
        titlesData: window.MatefindrTitlesQuests ? window.MatefindrTitlesQuests.getTitlesData(u) : (u.titlesData || null),
        coins: typeof u.coins === 'number' ? u.coins : 0,
        questCoinClaims: Array.isArray(u.questCoinClaims) ? u.questCoinClaims : [],
        // Quêtes / connexion quotidienne — passthrough obligatoire sinon sync cloud
        // écrase lastClaim et on peut re-réclamer la récompense du jour.
        dailyLogin: (u.dailyLogin && typeof u.dailyLogin === 'object') ? u.dailyLogin : null,
        questStats: (u.questStats && typeof u.questStats === 'object') ? u.questStats : null,
        editorActiveMs: typeof u.editorActiveMs === 'number' ? u.editorActiveMs : 0,
        beautyQuestUnlocked: !!u.beautyQuestUnlocked,
        isMe: true,
        views: _myViewsCache,
        // Presets + preset du lien perso (indépendant du profil équipé / deck swipe)
        presets: Array.isArray(u.presets) ? u.presets : null,
        sharePresetIdx: (typeof u.sharePresetIdx === 'number') ? u.sharePresetIdx : null,
      };
    }

    /* ===== Notes des profils (slider à étoiles, 0.0 à 5.0, pas de 0.1) =====
       Une note par (profil, votant), remplaçable. Noter ne swipe/dismiss JAMAIS la
       carte -- ça met juste à jour le badge en direct. Le graphique (répartition
       réelle) ne se révèle QUE pour un profil auquel JE (le votant courant) ai déjà
       mis une note -- avant ça, le badge reste un simple teaser (5 barres identiques,
       étiquetées 1-5, aucune donnée affichée). */
    const _reactionsCache = {}; // uid -> { ratings:number[], mine:number|null, total }
    function reactionBadgeInnerHtml(rec, forceReveal){
      const reacted = !!forceReveal || !!(rec && rec.mine != null);
      const ratings = (rec && rec.ratings) || [];
      const total = ratings.length;
      const counts = [0,0,0,0,0]; // bucket i = note arrondie à l'entier i+1 (1 à 5 étoiles)
      ratings.forEach(r => { const b = Math.min(5, Math.max(1, Math.round(r))); counts[b - 1]++; });
      const topIdx = reacted && total > 0 ? counts.indexOf(Math.max(...counts)) : -1;
      const avg = total > 0 ? (ratings.reduce((a, b) => a + b, 0) / total) : 0;
      const cols = counts.map((n, i) => {
        const pct = reacted && total > 0 ? (n / total) : 0;
        const h = reacted ? Math.round(9 + pct * 27) : 9; // 9px repos, jusqu'à 36px révélé
        const isTop = i === topIdx;
        return `<span class="cr-col"><i class="${isTop ? 'top' : ''}" style="height:${h}px"></i><b>${i + 1}</b></span>`;
      }).join('');
      // Moyenne : uniquement une fois QUE J'AI noté (jamais avant), au-dessus des 5
      // jauges (qui restent toutes visibles, étiquetées 1-5) -- icône étoile, pas un emoji.
      const avgHtml = reacted ? `<span class="cr-avg">${avg.toFixed(1)}<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.5l7.1-.6z"/></svg></span>` : '';
      return `${avgHtml}<span class="cr-dots">${cols}</span>`;
    }
    function reactionBadgeHtml(p){
      if (!p) return '';
      // Ma propre carte (aperçu) : mes stats reçues, toujours révélées (comme dans
      // l'éditeur) -- pas de teaser, on ne réagit jamais à soi-même. uid pas encore
      // connu au tout premier rendu -> refreshMyViewsAndReactions() le complète après coup.
      if (p.isMe) {
        const uid = _myUidCache || '';
        const rec = uid ? _reactionsCache[uid] : null;
        return `<span class="card-reactions" data-uid="${uid}" data-mine="true" data-reacted="true">${reactionBadgeInnerHtml(rec, true)}</span>`;
      }
      if (!p.uid) return '';
      const rec = _reactionsCache[p.uid];
      return `<span class="card-reactions" data-uid="${p.uid}" data-reacted="${!!(rec && rec.mine != null)}">${reactionBadgeInnerHtml(rec)}</span>`;
    }
    function renderReactionBadges(uid){
      const rec = _reactionsCache[uid];
      document.querySelectorAll(`.card-reactions[data-uid="${uid}"]`).forEach(el => {
        const forceReveal = el.getAttribute('data-mine') === 'true';
        el.setAttribute('data-reacted', String(forceReveal || !!(rec && rec.mine != null)));
        el.innerHTML = reactionBadgeInnerHtml(rec, forceReveal);
      });
    }
    /* Mes propres stats (vues + notes reçues) affichées quand ma carte est en aperçu.
       uid pas connu synchroniquement (buildUserProfile() n'a pas la session) -- on le
       résout une fois, on met en cache, et on met à jour les badges déjà rendus. */
    let _myUidCache = null;
    let _myViewsCache = 0;
    async function refreshMyViewsAndReactions(){
      if (!window.__supa) return;
      try {
        const { data: { session } } = await window.__supa.auth.getSession();
        if (!session) return;
        _myUidCache = session.user.id;
        try { window.__mfMyUid = _myUidCache; } catch (_) {}
        const { data } = await window.__supa.from('profiles').select('views').eq('id', _myUidCache).maybeSingle();
        _myViewsCache = (data && data.views) || 0;
        document.querySelectorAll('.card-views[data-mine="true"] b').forEach(b => { b.textContent = _myViewsCache.toLocaleString('fr-FR'); });
        document.querySelectorAll('.card-reactions[data-mine="true"]').forEach(el => el.setAttribute('data-uid', _myUidCache));
        if (typeof loadReactions === 'function') loadReactions(_myUidCache);
      } catch (e) { console.warn('[Matefindr] refresh my stats', e); }
    }
    /** Après login : uid + notes + progression quêtes (sinon badge/note périmés jusqu'à ouvrir Quêtes). */
    async function refreshQuestsAfterLogin(){
      const TQ = window.MatefindrTitlesQuests;
      if (!TQ || !window.__supa) return;
      try {
        const { data: { session } } = await window.__supa.auth.getSession();
        if (!session) return;
        _myUidCache = session.user.id;
        try { window.__mfMyUid = _myUidCache; } catch (_) {}
        if (state.user) state.user.uid = _myUidCache;
        await loadReactions(_myUidCache);
        const stats = await TQ.fetchStats({
          supa: window.__supa,
          uid: _myUidCache,
          ratingRec: () => _reactionsCache[_myUidCache] || null,
        });
        TQ.syncStatsLocal(stats);
        TQ.refreshPending(stats);
        TQ.updateQuestButtonBadge(stats);
        save();
      } catch (e) { console.warn('[Matefindr] refresh quests after login', e); }
    }
    /* Identité du votant : le vrai compte si connecté, sinon un id anonyme persisté en
       localStorage (généré une fois, réutilisé partout) -- pas besoin d'être connecté pour
       noter, mais une seule note par personne et par profil quoi qu'il arrive, connecté
       ou non : upsert sur (profile_id, reactor_id), l'ancienne note est remplacée par la
       nouvelle. */
    async function getReactorId(){
      try { const { data:{ session } } = await window.__supa.auth.getSession(); if (session) return session.user.id; } catch(_){}
      let id = null;
      try { id = localStorage.getItem('matefindr_reactor_id'); } catch(_){}
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('r-' + Date.now() + '-' + Math.random().toString(16).slice(2));
        try { localStorage.setItem('matefindr_reactor_id', id); } catch(_){}
      }
      return id;
    }
    async function loadReactions(profileId){
      if (!window.__supa || !profileId) return null;
      try {
        const { data } = await window.__supa.from('profile_reactions').select('rating').eq('profile_id', profileId).limit(5000);
        const ratings = [];
        (data || []).forEach(r => {
          const v = Number(r.rating);
          if (!Number.isNaN(v)) ratings.push(v);
        });
        // On ne restaure JAMAIS "mine" depuis la base : si on retombe sur un profil
        // (rechargement de page, ou plus tard dans le deck), on repart comme si on
        // n'avait jamais noté -- pas de graphique révélé tant qu'on n'a pas revoté
        // PENDANT cette visite (sendReaction met "mine" à jour lui-même). Le vieux
        // vote reste bien compté dans la moyenne/les jauges, juste plus marqué "moi"
        // après coup -- et si on revote, il est remplacé (upsert) comme avant.
        const existingMine = (_reactionsCache[profileId] && _reactionsCache[profileId].mine != null) ? _reactionsCache[profileId].mine : null;
        const rec = { ratings, mine: existingMine, total: ratings.length };
        _reactionsCache[profileId] = rec;
        renderReactionBadges(profileId);
        if (typeof updateSlidersFor === 'function') updateSlidersFor(profileId);
        return rec;
      } catch(e){ console.warn('[Matefindr] load reactions', e); return null; }
    }
    async function sendReaction(profileId, rating){
      if (!profileId || rating == null || !window.__supa) return;
      const reactorId = await getReactorId();
      // Mise à jour optimiste locale (réactive immédiatement, avant la confirmation réseau).
      const rec = _reactionsCache[profileId] || { ratings: [], mine: null, total: 0 };
      const isNewVote = rec.mine == null;
      if (rec.mine != null) { const idx = rec.ratings.indexOf(rec.mine); if (idx !== -1) rec.ratings.splice(idx, 1); }
      rec.ratings.push(rating);
      rec.mine = rating;
      rec.total = rec.ratings.length;
      _reactionsCache[profileId] = rec;
      renderReactionBadges(profileId);
      if (typeof updateSlidersFor === 'function') updateSlidersFor(profileId);
      try {
        const { error } = await window.__supa.from('profile_reactions')
          .upsert({ profile_id: profileId, reactor_id: reactorId, rating }, { onConflict: 'profile_id,reactor_id' });
        if (error) console.warn('[Matefindr] send reaction', error.message || error);
        else if (isNewVote && window.MatefindrTitlesQuests && typeof window.MatefindrTitlesQuests.bumpVotesGiven === 'function') {
          window.MatefindrTitlesQuests.bumpVotesGiven(1);
        }
      } catch(e){ console.warn('[Matefindr] send reaction error', e); }
    }
    /* Compteur de vues : +1 une seule fois par navigateur pour ce profil (même mécanique
       que sur les liens perso -- swiper un profil dans le deck normal compte aussi comme
       une vue, pas seulement le visiter via son lien). */
    function bumpProfileViewOnce(profile){
      if (!profile || !profile.uid || !window.__supa) return;
      try {
        const seen = 'mf_viewed_' + profile.uid;
        if (localStorage.getItem(seen)) return;
        localStorage.setItem(seen, '1');
        window.__supa.rpc('bump_profile_views', { p_id: profile.uid }).then(() => {
          profile.views = (profile.views || 0) + 1;
        }).catch(() => {});
      } catch(_){}
    }
    function currentReactTarget(){
      if (_sharedProfile) return _sharedProfile;
      const pool = (typeof genderFilteredProfiles === 'function') ? genderFilteredProfiles() : [];
      return pool[deckIdx] || null;
    }
    /* ===== Slider à étoiles : glisser la poignée bleue vers la droite par-dessus les
       étoiles (jaunes au fur et à mesure). Note affichée au-dessus pendant le glissé.
       Au relâchement : envoi de la note, la poignée revient tout à gauche ("retour de
       force") et affiche la note envoyée à la place de la flèche. */
    function setSliderRestState(root, mine){
      if (!root) return;
      const handle = root.querySelector('.rate-handle');
      const stars = [...root.querySelectorAll('.rate-star')];
      handle.style.left = '0px';
      handle.classList.remove('show-rate-value');
      const valueLbl = handle.querySelector('.rate-value');
      if (valueLbl) valueLbl.textContent = '';
      stars.forEach(s => s.classList.remove('active'));
      handle.setAttribute('aria-valuenow', '0');
      if (mine != null) {
        handle.classList.add('has-submitted');
        handle.querySelector('.rate-submitted').textContent = Number(mine).toFixed(1);
      } else {
        handle.classList.remove('has-submitted');
      }
    }
    function updateSlidersFor(profileId){
      const rec = _reactionsCache[profileId];
      const mine = rec ? rec.mine : null;
      const reactRoot = document.getElementById('reactSlider');
      const target = currentReactTarget();
      if (reactRoot && target && target.uid === profileId) setSliderRestState(reactRoot, mine);
      const sharedRoot = document.getElementById('sharedSlider');
      if (sharedRoot && _sharedProfile && _sharedProfile.uid === profileId) setSliderRestState(sharedRoot, mine);
    }
    function initRatingSlider(root, getTarget, onSubmitted){
      if (!root) return;
      const stars = [...root.querySelectorAll('.rate-star')];
      const handle = root.querySelector('.rate-handle');
      const valueLbl = handle.querySelector('.rate-value');
      let dragging = false, pending = 0;
      function maxLeft(){ return Math.max(1, root.clientWidth - handle.offsetWidth); }
      function updateStarsFromHandle(){
        const handleRect = handle.getBoundingClientRect();
        const handleCenter = handleRect.left + handleRect.width / 2;
        stars.forEach(s => {
          const starRect = s.getBoundingClientRect();
          const starCenter = starRect.left + starRect.width / 2;
          s.classList.toggle('active', handleCenter >= starCenter);
        });
      }
      function applyFromClientX(clientX){
        const rect = root.getBoundingClientRect();
        const half = handle.offsetWidth / 2;
        let left = clientX - rect.left - half;
        left = Math.max(0, Math.min(maxLeft(), left));
        const rating = Math.round((left / maxLeft()) * 5 * 10) / 10; // 0.0 à 5.0 -- mais il faut atteindre 1.0 (fin de la 1re étoile) pour valider, cf. onUp()
        pending = rating;
        handle.style.left = left + 'px';
        handle.classList.toggle('show-rate-value', rating >= 1);
        valueLbl.textContent = rating >= 1 ? rating.toFixed(1) : '';
        updateStarsFromHandle();
        handle.setAttribute('aria-valuenow', String(rating));
      }
      function onMove(e){ if (dragging) applyFromClientX(e.clientX); }
      function onUp(){
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging', 'show-rate-value');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const target = getTarget && getTarget();
        // Il faut avoir glissé au moins jusqu'à la fin de la 1re étoile (note >= 1.0)
        // pour valider -- en dessous, on relâche sans rien envoyer (retour de force
        // "à vide" : la poignée revient à gauche, l'ancien état -- flèche ou note déjà
        // envoyée -- est restauré tel quel, cf. setSliderRestState).
        if (target && target.uid && pending >= 1) {
          sendReaction(target.uid, pending);
        } else {
          const rec = target && target.uid ? _reactionsCache[target.uid] : null;
          setSliderRestState(root, rec ? rec.mine : null);
        }
        // Retour de force : la poignée revient tout à gauche (setSliderRestState via
        // sendReaction -> updateSlidersFor s'occupe d'afficher la note envoyée).
        if (typeof onSubmitted === 'function') onSubmitted();
      }
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragging = true;
        handle.classList.add('dragging');
        applyFromClientX(e.clientX);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    }
    initRatingSlider(document.getElementById('reactSlider'), currentReactTarget, () => {
      document.getElementById('reactPopup')?.setAttribute('data-open', 'false');
    });
    initRatingSlider(document.getElementById('sharedSlider'), () => _sharedProfile);
    document.getElementById('reactToggleBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const pop = document.getElementById('reactPopup');
      if (!pop) return;
      const opening = pop.getAttribute('data-open') !== 'true';
      pop.setAttribute('data-open', opening ? 'true' : 'false');
      if (opening) {
        const target = currentReactTarget();
        if (target && target.uid) {
          setSliderRestState(document.getElementById('reactSlider'), (_reactionsCache[target.uid] || {}).mine ?? null);
          if (!_reactionsCache[target.uid]) loadReactions(target.uid);
        }
      }
    });
    document.addEventListener('click', (e) => {
      const pop = document.getElementById('reactPopup');
      if (!pop || pop.getAttribute('data-open') !== 'true') return;
      if (e.target.closest('#reactPopup') || e.target.closest('#reactToggleBtn')) return;
      pop.setAttribute('data-open', 'false');
    });

    /* ===== Cloud sync (Supabase) — la liste de profils provient des vrais utilisateurs ===== */
    let _remoteProfiles = []; // hydraté depuis Supabase
    let _remoteFetchedAt = 0;
    let _syncTimer = null;

    /* UPSERT du profil courant dans Supabase. Debounce pour éviter le spam. */
    function scheduleCloudSync(){
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(syncMyProfileToCloud, 800);
    }
    /** Garde le claim quotidien le plus avancé (évite re-réclamer après reconnexion). */
    function mergeDailyLogin(a, b){
      const A = (a && typeof a === 'object') ? a : null;
      const B = (b && typeof b === 'object') ? b : null;
      if (!A && !B) return null;
      if (!A) return { streak: Math.max(0, Math.floor(B.streak || 0)), lastClaim: B.lastClaim || null };
      if (!B) return { streak: Math.max(0, Math.floor(A.streak || 0)), lastClaim: A.lastClaim || null };
      const la = typeof A.lastClaim === 'string' ? A.lastClaim : '';
      const lb = typeof B.lastClaim === 'string' ? B.lastClaim : '';
      if (lb && (!la || lb > la)) return { streak: Math.max(0, Math.floor(B.streak || A.streak || 0)), lastClaim: lb };
      if (la && (!lb || la > lb)) return { streak: Math.max(0, Math.floor(A.streak || B.streak || 0)), lastClaim: la };
      return {
        streak: Math.max(0, Math.floor(A.streak || 0), Math.floor(B.streak || 0)),
        lastClaim: la || lb || null,
      };
    }
    async function syncMyProfileToCloud(){
      try {
        if (!window.__supa) return;
        const { data: { session } } = await window.__supa.auth.getSession();
        if (!session) return;
        const my = buildUserProfile();
        if (!my) return;
        delete my.isMe;
        // Colonnes "legacy" du schéma existant (lisibles par tous, même sans colonne data)
        const base = {
          id: session.user.id,
          display_name: my.name || null,
          avatar_url: my.avatarUrl || null,
          banner_url: my.bannerUrl || null,
          decoration_url: my.decorationUrl || null,
          bio: my.bio || null,
          look_for: my.looking || null,
          updated_at: new Date().toISOString(),
        };
        if (state.user && state.user.discordId) base.discord_id = state.user.discordId;
        // discordLive / dailyLogin : ne jamais écraser le cloud avec une valeur locale vide/vieille.
        try {
          const { data: liveRow } = await window.__supa.from('profiles').select('data').eq('id', session.user.id).maybeSingle();
          const cloudData = liveRow?.data;
          const cloudLive = cloudData?.discordLive;
          if (cloudLive && typeof cloudLive === 'object') {
            const locTs = my.discordLive?.updatedAt ? new Date(my.discordLive.updatedAt).getTime() : 0;
            const cloudTs = cloudLive.updatedAt ? new Date(cloudLive.updatedAt).getTime() : 0;
            if (!locTs || cloudTs >= locTs) my.discordLive = cloudLive;
          }
          const mergedDaily = mergeDailyLogin(my.dailyLogin, cloudData?.dailyLogin);
          if (mergedDaily) {
            my.dailyLogin = mergedDaily;
            if (state.user) state.user.dailyLogin = mergedDaily;
          }
        } catch (_) {}
        // ANTI-ÉCRASEMENT : un profil "vide" (identité Discord seule, onboarding pas
        // rempli) ne doit JAMAIS écraser un profil riche déjà en base. On n'écrit alors
        // que les colonnes legacy et on LAISSE la colonne data intacte (récupérable).
        const _noOrbs = !Array.isArray(my.orbs) || my.orbs.length === 0;
        const _noGifs = !Array.isArray(my.gifs) || my.gifs.length === 0;
        const _noBio  = !my.bio || /Complète ta bio/.test(my.bio);
        const looksEmpty = _noOrbs && _noGifs && _noBio && !my.age && !my.gender && !my.country && !my.swipeMusic;
        const guildIds = Array.isArray(my.guildIds) ? my.guildIds : [];
        if (looksEmpty) {
          if (guildIds.length) {
            const { data: row } = await window.__supa.from('profiles').select('data').eq('id', session.user.id).maybeSingle();
            const prevData = (row && row.data && typeof row.data === 'object') ? row.data : {};
            const merged = Object.assign({}, prevData, {
              name: my.name || prevData.name || null,
              tag: my.tag || prevData.tag || null,
              guildIds,
            });
            // Preserve / merge daily claim even on guildIds-only sync
            const dMerged = mergeDailyLogin(my.dailyLogin, prevData.dailyLogin);
            if (dMerged) merged.dailyLogin = dMerged;
            const { error } = await window.__supa.from('profiles').upsert({ ...base, data: merged }, { onConflict: 'id' });
            if (error) console.warn('[Matefindr] sync guildIds failed', error.message || error);
          } else {
            const { error } = await window.__supa.from('profiles').upsert(base, { onConflict: 'id' });
            if (error) console.warn('[Matefindr] sync legacy-only failed', error.message || error);
          }
          return;
        }
        // 1) Essai avec la colonne data (profil COMPLET : âge, genre, pays, gifs, fond, etc.)
        let { error } = await window.__supa.from('profiles').upsert({ ...base, data: my }, { onConflict: 'id' });
        // 2) Si la colonne data n'existe pas encore → upsert legacy seul (ne casse pas)
        if (error && /data/i.test((error.message || '') + (error.details || ''))) {
          ({ error } = await window.__supa.from('profiles').upsert(base, { onConflict: 'id' }));
        }
        if (error) console.warn('[Matefindr] sync profile failed', error.message || error);
      } catch (e) { console.warn('[Matefindr] sync profile error', e); }
    }
    window.__syncMyProfileToCloud = syncMyProfileToCloud;
    window.__scheduleCloudSync = scheduleCloudSync;
    window.__matefindrStateRef = () => state;
    window.__matefindrSave = save;
    window.__matefindrRefreshCard = () => {
      if (typeof ensureDeckSync !== 'function') return;
      if (document.body.getAttribute('data-screen') !== 'swipe') return;
      if (_previewMode) ensureDeckSync({ force: true });
    };

    /* Convertit une ligne Supabase (data jsonb OU colonnes legacy) en profil pour buildCard. */
    function rowToProfile(r){
      if (!r) return null;
      // Profil complet stocké dans data → on l'utilise tel quel
      if (r.data && typeof r.data === 'object' && r.data.name) {
        const p = Object.assign({}, r.data);
        p.isMe = false; p.uid = r.id; p.views = r.views || 0; p.slug = r.slug || null; p._showViews = true;
        if (r.data.titlesData) p.titlesData = r.data.titlesData;
        // Conserver presets / sharePresetIdx pour openSharedProfile (lien perso seulement)
        if (Array.isArray(r.data.presets)) p.presets = r.data.presets;
        if (typeof r.data.sharePresetIdx === 'number') p.sharePresetIdx = r.data.sharePresetIdx;
        return p;
      }
      // Sinon : on reconstruit depuis les colonnes existantes (name/avatar/bio/bulles…)
      if (!r.display_name && !r.avatar_url) return null;
      const subByKind = {music:'musique', game:'jeu', anime:'série', film:'film'};
      const emoByKind = {music:'🎵', game:'🎮', anime:'📺', film:'🎬'};
      let bubbles = [];
      if (Array.isArray(r.bubbles)) bubbles = r.bubbles;
      else if (r.bubbles && Array.isArray(r.bubbles.userOrbs)) bubbles = r.bubbles.userOrbs;
      const orbs = bubbles.map(o => ({
        kind: o.kind, title: o.title,
        sub: (o.kind === 'game' && o.rank) ? o.rank : (subByKind[o.kind] || ''),
        emoji: emoByKind[o.kind] || '✨',
        cover: o.cover || null, previewUrl: o.previewUrl || null,
        rank: o.rank || null, customX: o.customX, customY: o.customY,
        posPortrait: o.posPortrait || null, posLandscape: o.posLandscape || null,
      }));
      return {
        name: r.display_name || 'Matefindr',
        tag: r.discord_tag || (r.discord_id ? String(r.discord_id).slice(0, 8) : 'user'),
        age: r.age || '', gender: r.gender || '', country: r.country || '', countryFlag: '',
        looking: r.look_for || 'chill', status: 'online',
        nitro: false, boost: false,
        joinedOn: r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}) : 'récemment',
        games: [], bio: r.bio || '',
        common: {friends:0, servers:0},
        c1:'#5865F2', c2:'#404EED',
        profileColor:'#393a41', profileColor2:'#393a41',
        initial: (r.display_name || 'T').charAt(0).toUpperCase(),
        avatarUrl: r.avatar_url || null, bannerUrl: r.banner_url || null, decorationUrl: r.decoration_url || null,
        accentColor: (typeof r.accent_color === 'number') ? r.accent_color : null,
        orbs, socials:{}, isMe:false, uid: r.id, views: r.views || 0, slug: r.slug || null, _showViews: true,
        disabled: !!(r.data && r.data.disabled),
        handleBlur: !!(r.data && r.data.handleBlur),
      };
    }

    /* Agrégat des notes profil pour le tri découverte (cache léger par fetch). */
    const RATING_MIN_VOTERS_DISCOVER = 5;
    async function fetchProfileRatingMap(uids) {
      if (!window.__supa || !uids || !uids.length) return {};
      try {
        const { data } = await window.__supa.from('profile_reactions').select('profile_id, rating').in('profile_id', uids.slice(0, 200));
        const acc = {};
        (data || []).forEach(row => {
          const id = row.profile_id;
          const v = Number(row.rating);
          if (!acc[id]) acc[id] = { sum: 0, count: 0 };
          if (!Number.isNaN(v)) { acc[id].sum += v; acc[id].count += 1; }
        });
        const out = {};
        Object.keys(acc).forEach(id => {
          const { sum, count } = acc[id];
          out[id] = { avg: count ? sum / count : 0, count };
        });
        return out;
      } catch (_) { return {}; }
    }

    /* SELECT tous les autres profils (cache 30s pour ne pas spam). */
    let _profilesInFlight = null;
    async function fetchOtherProfiles(force){
      if (!window.__supa) return _remoteProfiles;
      if (!force && Date.now() - _remoteFetchedAt < 30000) return _remoteProfiles;
      if (_profilesInFlight) return _profilesInFlight; // évite les requêtes concurrentes (lag)
      _profilesInFlight = (async () => {
        try {
          const { data: { session } } = await window.__supa.auth.getSession();
          const myId = session && session.user && session.user.id;
          let q = window.__supa.from('profiles').select('*').order('updated_at', { ascending: false }).limit(200);
          if (myId) q = q.neq('id', myId);
          // Timeout 8s : un Supabase lent ne doit jamais bloquer indéfiniment.
          const result = await Promise.race([q, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
          const { data, error } = result;
          if (error) { console.warn('[Matefindr] fetch profiles failed', error.message || error); return _remoteProfiles; }
          // Tri découverte : note moyenne (avec aléatoire) + médias.
          const uids = (data || []).map(r => r.id).filter(Boolean);
          const ratingMap = await fetchProfileRatingMap(uids);
          const mediaCount = (p) => (Array.isArray(p.photos) ? p.photos.length : 0) + (Array.isArray(p.gifs) ? p.gifs.length : 0);
          const DISCOVER_RANDOM = 18;
          _remoteProfiles = (data || []).map(rowToProfile).filter(Boolean).filter(p => p.disabled !== true)
            .map(p => {
              const r = ratingMap[p.uid] || { avg: 0, count: 0 };
              const voteFactor = r.count >= RATING_MIN_VOTERS_DISCOVER ? 1 : (r.count / RATING_MIN_VOTERS_DISCOVER);
              const ratingScore = r.avg * voteFactor * 22;
              const mediaScore = mediaCount(p) * 1.2;
              const jitter = Math.random() * DISCOVER_RANDOM;
              return { p, score: ratingScore + mediaScore + jitter };
            })
            .sort((a, b) => b.score - a.score)
            .map(x => {
              const r = ratingMap[x.p.uid] || { avg: 0, count: 0 };
              x.p.profileRating = r.avg;
              x.p.profileRatingVotes = r.count;
              return x.p;
            });
          _remoteFetchedAt = Date.now();
          return _remoteProfiles;
        } catch (e) { console.warn('[Matefindr] fetch profiles error', e); return _remoteProfiles; }
        finally { _profilesInFlight = null; }
      })();
      return _profilesInFlight;
    }
    window.__fetchOtherProfiles = fetchOtherProfiles;

    /* ===== Likes / Match (table public.likes) ===== */
    async function recordLike(profile){
      try {
        if (state.user && state.user.disabled) return; // profil désactivé → pas de like/match
        if (!window.__supa || !profile || !profile.uid) return;
        const { data:{ session } } = await window.__supa.auth.getSession();
        if (!session) return;
        const myId = session.user.id;
        await window.__supa.from('likes').upsert({ liker_id: myId, liked_id: profile.uid }, { onConflict: 'liker_id,liked_id' });
        // L'autre m'a-t-il déjà liké ? → MATCH
        const { data: back } = await window.__supa.from('likes')
          .select('liker_id').eq('liker_id', profile.uid).eq('liked_id', myId).limit(1);
        if (back && back.length && typeof triggerMatch === 'function') triggerMatch(profile);
      } catch(e){ console.warn('[Matefindr] like error', e); }
    }
    function triggerMatch(p){
      // Like réciproque détecté → crée le match en DB (l'autre est notifié via Realtime) + anim.
      if (typeof startMatch === 'function') startMatch(p, { unread:false });
      else if (typeof playMatchAnimation === 'function') playMatchAnimation(p, 'm_'+Date.now());
    }
    /* uids des likers auxquels j'ai DÉJÀ répondu (❤️ like en retour OU ✕ rejet).
       Persisté en localStorage → un like traité ne revient JAMAIS dans le panneau,
       même si l'écriture Supabase échoue ou sur un autre device après sync. */
    const DISMISSED_LIKERS = (() => {
      try { return new Set(JSON.parse(localStorage.getItem('matefindr_dismissed_likers') || '[]')); }
      catch(_){ return new Set(); }
    })();
    function dismissLiker(uid){
      if (!uid) return;
      DISMISSED_LIKERS.add(uid);
      try { localStorage.setItem('matefindr_dismissed_likers', JSON.stringify([...DISMISSED_LIKERS])); } catch(_){}
    }
    /* Récupère les profils qui M'ONT liké (pour le panneau + badge cœur). */
    async function fetchLikesReceived(){
      try {
        if (!window.__supa) return [];
        const { data:{ session } } = await window.__supa.auth.getSession();
        if (!session) return [];
        const myId = session.user.id;
        const { data: rows } = await window.__supa.from('likes').select('liker_id, created_at').eq('liked_id', myId).order('created_at',{ascending:false}).limit(100);
        if (!rows || !rows.length) return [];
        // Exclure ceux à qui j'ai déjà répondu (like en retour = match) → ils quittent le panneau.
        let likedBack = new Set();
        try { const { data: mine } = await window.__supa.from('likes').select('liked_id').eq('liker_id', myId);
              likedBack = new Set((mine||[]).map(r => r.liked_id)); } catch(_){}
        const fresh = rows.filter(r => !likedBack.has(r.liker_id) && !DISMISSED_LIKERS.has(r.liker_id));
        if (!fresh.length) return [];
        const ids = fresh.map(r => r.liker_id);
        const { data: profs } = await window.__supa.from('profiles').select('*').in('id', ids);
        return fresh.map(r => { const pr = (profs||[]).find(p => p.id === r.liker_id); return pr ? rowToProfile(pr) : null; }).filter(Boolean);
      } catch(e){ console.warn('[Matefindr] fetch likes error', e); return []; }
    }
    async function refreshLikesReceived(){
      const list = await fetchLikesReceived();
      if (typeof LIKED_ME === 'undefined') return;
      LIKED_ME.length = 0;
      list.forEach(p => LIKED_ME.push({ name:p.name, tag:p.tag, age:p.age||'', c1:p.c1||'#5865F2', c2:p.c2||'#404EED', initial:p.initial||(p.name||'?').charAt(0), avatarUrl:p.avatarUrl||null, uid:p.uid, _full:p }));
      if (typeof window.__heartFabRefresh === 'function') window.__heartFabRefresh();
      const lp = document.getElementById('likedPanel');
      if (typeof renderLikedMe === 'function' && lp && lp.getAttribute('data-open') === 'true') renderLikedMe();
    }
    window.__recordLike = recordLike;
    window.__refreshLikesReceived = refreshLikesReceived;

    function genderFilteredProfiles(){
      const f = state.user && state.user.boost && state.user.genderFilter;
      const pool = _remoteProfiles;
      if (!f || f === 'all') return pool;
      const map = { il:['male','il'], elle:['female','elle'] };
      const accept = map[f] || [];
      return pool.filter(p => accept.includes(p.gender));
    }
    function ensureDeck(force){
      // Rendu IMMÉDIAT (depuis le cache + ta propre carte) → jamais d'écran blanc/bloqué
      // en attendant le réseau Supabase. Le rafraîchissement se fait en arrière-plan.
      ensureDeckSync();
      const wasEmpty = document.body.getAttribute('data-swipe-empty') === 'true';
      // Profil actuellement affiché AVANT le refresh réseau -- si un admin le désactive
      // (ou le supprime) pendant qu'il est déjà à l'écran, fetchOtherProfiles() le retire
      // de _remoteProfiles mais la carte déjà rendue restait affichée indéfiniment tant
      // qu'on ne swipait pas dessus (le deck n'était re-rendu QUE si vide auparavant).
      let shownUid = null;
      try { const pool = genderFilteredProfiles(); shownUid = (pool[deckIdx] && pool[deckIdx].uid) || null; } catch(_){}
      fetchOtherProfiles(force).then(() => {
        if (document.body.getAttribute('data-screen') !== 'swipe') return;
        // Mode aperçu : une seule carte figée — ne jamais re-rendre le deck quand
        // les profils distants arrivent (sinon on remplace l'aperçu par le deck normal).
        if (_previewMode) return;
        // On re-rend si le deck était vide (nouveaux profils arrivés), OU si le profil
        // affiché à l'écran a disparu du pool entre-temps (désactivé/supprimé).
        if (wasEmpty) { ensureDeckSync({ force: true }); return; }
        if (shownUid && !genderFilteredProfiles().some(p => p.uid === shownUid)) ensureDeckSync({ force: true });
      }).catch(() => {});
    }
    function syncSwipeWrapGradient(p){
      const wrap = document.getElementById('swipeWrap');
      if (!wrap || !p) return;
      const shell = wrap.parentElement;
      const shellWrap = shell?.parentElement;
      const accentHex = p.accentColor ? `#${p.accentColor.toString(16).padStart(6,'0')}` : null;
      const pc1 = (p.profileColor && p.profileColor !== 'discord') ? p.profileColor : null;
      const pc2 = (p.profileColor2 && p.profileColor2 !== 'discord') ? p.profileColor2 : null;
      let c1 = '#242429', c2 = '#1c1d22';
      if (pc1 && pc2) { c1 = pc1; c2 = pc2; }
      else if (pc1) { c1 = pc2 = pc1; }
      else if (accentHex) { c1 = c2 = accentHex; }
      [shellWrap, shell, wrap].forEach(el => {
        if (!el) return;
        el.style.setProperty('--c1', c1);
        el.style.setProperty('--c2', c2);
      });
    }
    function ensureDeckSync(opts){
      opts = opts || {};
      refreshMyGuildsIfNeeded();
      const wrap = document.getElementById('swipeWrap');
      if (!wrap) return;

      // ---- Résoudre le profil cible AVANT de vider le DOM ----
      let p = null;
      if (_sharedProfile && !_previewMode) {
        p = _sharedProfile;
      } else {
        const myP = buildUserProfile() || (_previewMode ? buildMinimalProfile() : null);
        const previewP = _previewMode ? (_previewProfile || myP) : null;
        const inPreview = !!(_previewMode && previewP);
        const pool = _previewMode ? [] : genderFilteredProfiles();
        const offset = inPreview ? 1 : 0;
        const total = pool.length + offset;
        if (deckIdx >= total) {
          wrap.innerHTML = `<div class="swipe-empty"><h3>${tx('no_more')}</h3><p>${tx('no_more_sub')}</p></div>`;
          renderOrbs(null);
          renderSwipeGifs(null);
          renderSwipePhotos(null);
          playProfileEntryMusic(null);
          if (typeof applyBgChoice === 'function') applyBgChoice(null);
          document.body.setAttribute('data-swipe-empty', 'true');
          return;
        }
        document.body.removeAttribute('data-swipe-empty');
        p = inPreview ? previewP : pool[deckIdx];
      }

      if (!p) {
        wrap.innerHTML = `<div class="swipe-empty"><h3>${tx('no_more')}</h3><p>${tx('no_more_sub')}</p></div>`;
        if (typeof applyBgChoice === 'function') applyBgChoice(null);
        document.body.setAttribute('data-swipe-empty', 'true');
        return;
      }

      // Même profil déjà affiché → soft update (pas d'anim d'entrée, pas de reset musique/orbs)
      const existing = wrap.querySelector('.swipe-card');
      const sameUid = existing && p.uid && existing.dataset.profileUid === String(p.uid);
      const sameMe = existing && p.isMe && existing.dataset.profileMe === '1'
        && (!p.uid || existing.dataset.profileUid === String(p.uid));
      if (!opts.force && existing && (sameUid || sameMe)) {
        softRefreshSwipeCard();
        return;
      }

      wrap.innerHTML = '';
      document.body.removeAttribute('data-swipe-empty');
      if (typeof applyBgChoice === 'function') applyBgChoice(p && p.bg, p && p.bgPos);

      if (_sharedProfile && !_previewMode) {
        try {
          wrap.appendChild(buildCard(_sharedProfile, true));
          syncSwipeWrapGradient(_sharedProfile);
          renderOrbs(_sharedProfile);
          renderSwipeGifs(_sharedProfile);
          renderSwipePhotos(_sharedProfile);
          playProfileEntryMusic(_sharedProfile);
        } catch (e) { try { wrap.appendChild(buildCard(_sharedProfile, true)); } catch(_){} }
        return;
      }

      const myP = buildUserProfile() || (_previewMode ? buildMinimalProfile() : null);
      const previewP = _previewMode ? (_previewProfile || myP) : null;
      const inPreview = !!(_previewMode && previewP);
      const pool = _previewMode ? [] : genderFilteredProfiles();
      const offset = inPreview ? 1 : 0;
      const total = pool.length + offset;
      try {
        wrap.appendChild(buildCard(p, true));
        syncSwipeWrapGradient(p);
        renderOrbs(p);
        renderSwipeGifs(p);
        renderSwipePhotos(p);
        playProfileEntryMusic(p);
      } catch (err) {
        console.warn('[Matefindr] profil illisible, on passe au suivant', err, p);
        wrap.innerHTML = '';
        if (typeof applyBgChoice === 'function') applyBgChoice(null);
        if (deckIdx < total - 1) { deckIdx++; ensureDeckSync({ force: true }); return; }
        wrap.innerHTML = `<div class="swipe-empty"><h3>${tx('no_more')}</h3><p>${tx('no_more_sub')}</p></div>`;
        document.body.setAttribute('data-swipe-empty', 'true');
      }
    }

    /* (legacy) Plays the profile owner's entry music when the card is displayed.
       No longer called automatically — voice memo replaces this behavior. */
    function _smSetPlayingUI(playing){
      const cov = document.getElementById('smCover');
      if (cov) cov.classList.toggle('is-paused', !playing);
      const ip = document.getElementById('smIcoPlay'), ipa = document.getElementById('smIcoPause');
      if (ip)  ip.style.display  = playing ? 'none' : '';
      if (ipa) ipa.style.display = playing ? '' : 'none';
    }
    async function playProfileEntryMusic(p){
      // Nouveau profil : on coupe la bulle de musique éventuellement en cours et on réinitialise le relais.
      _swipeMusicPausedForOrb = false;
      if (typeof _spotifyAudio !== 'undefined' && _spotifyAudio) { _spotifyAudio._userStopped = true; try { _spotifyAudio.pause(); } catch(_){} _spotifyAudio = null; document.querySelectorAll('.interest-orb.playing,.orb.playing').forEach(o=>o.classList.remove('playing')); }
      if (_swipeMusicAudio) { _swipeMusicAudio.pause(); _swipeMusicAudio = null; }
      const box = document.getElementById('swipeMusic');
      if (box) box.setAttribute('data-show', 'false');
      // Musique d'intro de profil retirée du site — plus aucune lecture d'entrée.
      return;
    }
    /* Débloque l'autoplay : au premier geste de l'utilisateur, si une musique d'entrée
       est en attente (chip affiché mais en pause car autoplay bloqué), on la lance. */
    let _audioUnlockBound = false;
    function _bindAudioUnlock(){
      if (_audioUnlockBound) return;
      _audioUnlockBound = true;
      const tryResume = () => {
        // Ne pas relancer la musique d'entrée si une bulle de musique joue (ou l'a volontairement coupée).
        if (_spotifyAudio || _swipeMusicPausedForOrb) return;
        const box = document.getElementById('swipeMusic');
        if (_swipeMusicAudio && _swipeMusicAudio.paused && box && box.getAttribute('data-show') === 'true') {
          _swipeMusicAudio.play().then(() => _smSetPlayingUI(true)).catch(() => {});
        }
      };
      document.addEventListener('pointerdown', tryResume, true);
      document.addEventListener('keydown', tryResume, true);
    }
    _bindAudioUnlock();

    /* GIFs + photos perso en couche d'arrière-plan (body > #swipeStickersBg, z:1) :
       - en arrière des bulles (.orbit z:5) et de la carte (main z:6)
       - un seul calque partagé (triage par item.z) pour que "premier plan/arrière-plan"
         défini dans l'éditeur fonctionne entre GIFs et photos, pas seulement au sein d'un type
       - positions calculées en pixels viewport à partir des % de la carte
       - se mettent à jour à chaque resize */
    function ensureSwipeStickersLayer() {
      let layer = document.getElementById('swipeStickersBg');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'swipeStickersBg';
        layer.className = 'swipe-gifs-bg';
        document.body.appendChild(layer);
      }
      return layer;
    }
    function reorderSwipeStickersLayer() {
      const layer = document.getElementById('swipeStickersBg');
      if (!layer) return;
      const kids = Array.from(layer.children);
      kids.sort((a, b) => (parseFloat(a.dataset.z) || 0) - (parseFloat(b.dataset.z) || 0));
      kids.forEach(k => layer.appendChild(k));
    }
    function swipeStickerZ(item, kind, idx) {
      if (typeof item.z === 'number') return item.z;
      return kind === 'gif' ? (-1000 + idx) : (1000 + idx);
    }
    function applySwipeStickerImg(img, m, baseWpx) {
      if (!img || !m) return;
      const inner = img.parentElement;
      const wrap = inner && inner.parentElement;
      if (!inner || !wrap) return;
      // Aligné sur js/editor-stickers.js (PX_MIN + même math crop/stretch).
      const PX_MIN = 20;

      inner.style.transform = '';
      inner.style.clipPath = '';
      inner.style.overflow = 'hidden';
      inner.style.position = 'relative';
      inner.style.marginLeft = '0';
      inner.style.marginTop = '0';
      img.style.margin = '0';
      img.style.maxWidth = 'none';
      img.style.display = 'block';

      const cl = m.cropL || 0;
      const cr = m.cropR || 0;
      const ct = m.cropT || 0;
      const cb = m.cropB || 0;
      const sx = m.scaleX || 1;
      const sy = m.scaleY || 1;

      const bw = Math.max(PX_MIN, baseWpx || wrap.getBoundingClientRect().width || PX_MIN);
      let aspect = 1;
      if (img.naturalWidth > 0) aspect = img.naturalHeight / img.naturalWidth;
      else if (m._imgAspect > 0) aspect = m._imgAspect;
      else if (img.offsetWidth > 0 && img.offsetHeight > 0) aspect = img.offsetHeight / img.offsetWidth;
      const bh = Math.max(PX_MIN, bw * aspect);
      const coreW = bw * (1 - cl / 100 - cr / 100);
      const coreH = bh * (1 - ct / 100 - cb / 100);
      const visW = Math.max(PX_MIN, coreW * sx);
      const visH = Math.max(PX_MIN, coreH * sy);

      wrap.style.width = visW + 'px';
      wrap.style.height = visH + 'px';

      inner.style.width = '100%';
      inner.style.height = '100%';

      img.style.position = 'absolute';
      img.style.margin = '0';
      img.style.maxWidth = 'none';
      img.style.transform = '';
      img.style.transformOrigin = '';
      img.style.objectPosition = '50% 50%';
      img.style.clipPath = 'none';
      img.style.right = 'auto';
      img.style.bottom = 'auto';

      const hasStretch = sx !== 1 || sy !== 1;
      const hasCrop = cl || cr || ct || cb;

      if (hasCrop && hasStretch) {
        img.style.width = (bw * sx) + 'px';
        img.style.height = (bh * sy) + 'px';
        img.style.left = (-cl / 100 * bw * sx) + 'px';
        img.style.top = (-ct / 100 * bh * sy) + 'px';
        img.style.objectFit = 'fill';
      } else if (hasCrop) {
        img.style.width = bw + 'px';
        img.style.height = bh + 'px';
        img.style.left = (-cl / 100 * bw) + 'px';
        img.style.top = (-ct / 100 * bh) + 'px';
        img.style.objectFit = 'cover';
      } else if (hasStretch) {
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'fill';
      } else {
        img.style.top = '0';
        img.style.left = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
      }

      // Même règle que l'éditeur : zoom legacy seulement si scale ≠ 1.
      if (m.posX != null && m.posY != null && (m.scale || 1) !== 1) {
        img.style.objectPosition = m.posX + '% ' + m.posY + '%';
        img.style.transformOrigin = m.posX + '% ' + m.posY + '%';
        img.style.transform = 'scale(' + (m.scale || 1) + ')';
      }
    }
    /** Position sticker : x/y/w/rot par mode, crop/stretch/zoom hérités du root (partagés). */
    function swipeStickerPos(g) {
      const mode = activeLayoutMode();
      const m = (mode === 'portrait'  && g.portrait)  ? g.portrait
              : (mode === 'landscape' && g.landscape) ? g.landscape
              : g;
      const pick = (k) => (m[k] != null ? m[k] : g[k]);
      return {
        x: (typeof m.x === 'number') ? m.x : 50,
        y: (typeof m.y === 'number') ? m.y : 30,
        w: (typeof m.w === 'number') ? m.w : 32,
        rot: m.rot || 0,
        posX: pick('posX'), posY: pick('posY'), scale: pick('scale'),
        scaleX: pick('scaleX'), scaleY: pick('scaleY'),
        cropT: pick('cropT'), cropR: pick('cropR'), cropB: pick('cropB'), cropL: pick('cropL'),
        _imgAspect: g._imgAspect,
      };
    }
    let _swipeGifsResize = null;
    function renderSwipeGifs(p){
      if (_swipeGifsResize) {
        window.removeEventListener('resize', _swipeGifsResize);
        _swipeGifsResize = null;
      }
      // GIFs : les miens (state.user) OU ceux du profil affiché (cross-user, depuis p.gifs)
      const old = document.getElementById('swipeStickersBg');
      if (old) old.querySelectorAll('.swipe-gif[data-kind="gif"]').forEach(n => n.remove());
      const isMe = p && p.isMe;
      const gifs = isMe ? ((state.user && state.user.gifs) || []) : ((p && p.gifs) || []);
      if (!gifs.length) { reorderSwipeStickersLayer(); return; }
      const contourOn = isMe ? ((state.user && state.user.gifContour) !== false) : (p && p.gifContour !== false);
      const wrap = document.getElementById('swipeWrap');
      if (!wrap) return;
      const layer = ensureSwipeStickersLayer();
      const items = gifs.map((g, i) => {
        const el = document.createElement('div');
        el.className = 'swipe-gif' + (contourOn ? '' : ' no-contour');
        el.dataset.kind = 'gif';
        el.dataset.z = String(swipeStickerZ(g, 'gif', i));
        el.innerHTML = `<div class="swipe-gif-inner"><img src="${g.full || g.preview}" alt=""></div>`;
        layer.appendChild(el);
        return { el, g };
      });
      reorderSwipeStickersLayer();
      // Position d'un GIF selon l'orientation courante (portrait/paysage/bureau).
      function layoutOne(el, g) {
        const wr = wrap.getBoundingClientRect();
        const p = swipeStickerPos(g);
        const wpx = (p.w / 100) * wr.width;
        const cx = wr.left + (p.x / 100) * wr.width;
        const cy = wr.top  + (p.y / 100) * wr.height;
        el.style.left = cx + 'px';
        el.style.top  = cy + 'px';
        el.style.transform = `translate(-50%,-50%) rotate(${p.rot}deg)`;
        const img = el.querySelector('img');
        if (!img) return;
        if (img.naturalWidth > 0) g._imgAspect = img.naturalHeight / img.naturalWidth;
        applySwipeStickerImg(img, swipeStickerPos(g), wpx);
        if (!(img.complete && img.naturalWidth) && !img.dataset.mfCropBound) {
          img.dataset.mfCropBound = '1';
          img.addEventListener('load', () => layoutOne(el, g), { once: true });
        }
      }
      function reposition(){
        items.forEach(({ el, g }) => layoutOne(el, g));
      }
      reposition();
      _swipeGifsResize = () => reposition();
      window.addEventListener('resize', _swipeGifsResize);
    }
    /* Photos perso (Boost) : même mécanique que les GIFs ci-dessus, dans le même
       calque partagé #swipeStickersBg (cf. renderSwipeGifs) pour que le tri par
       calque défini dans l'éditeur soit respecté entre GIFs et photos. */
    let _swipePhotosResize = null;
    function renderSwipePhotos(p){
      if (_swipePhotosResize) {
        window.removeEventListener('resize', _swipePhotosResize);
        _swipePhotosResize = null;
      }
      const old = document.getElementById('swipeStickersBg');
      if (old) old.querySelectorAll('.swipe-gif[data-kind="photo"]').forEach(n => n.remove());
      const isMe = p && p.isMe;
      const photos = isMe ? ((state.user && state.user.photos) || []) : ((p && p.photos) || []);
      if (!photos.length) { reorderSwipeStickersLayer(); return; }
      const contourOn = isMe ? ((state.user && state.user.photoContour) !== false) : (p && p.photoContour !== false);
      const wrap = document.getElementById('swipeWrap');
      if (!wrap) return;
      const layer = ensureSwipeStickersLayer();
      const items = photos.map((ph, i) => {
        const el = document.createElement('div');
        el.className = 'swipe-gif' + (contourOn ? '' : ' no-contour');
        el.dataset.kind = 'photo';
        el.dataset.z = String(swipeStickerZ(ph, 'photo', i));
        el.innerHTML = `<div class="swipe-gif-inner"><img src="${ph.url}" alt=""></div>`;
        layer.appendChild(el);
        return { el, g: ph };
      });
      reorderSwipeStickersLayer();
      function layoutOne(el, g) {
        const wr = wrap.getBoundingClientRect();
        const p2 = swipeStickerPos(g);
        const wpx = (p2.w / 100) * wr.width;
        const cx = wr.left + (p2.x / 100) * wr.width;
        const cy = wr.top  + (p2.y / 100) * wr.height;
        el.style.left = cx + 'px';
        el.style.top  = cy + 'px';
        el.style.transform = `translate(-50%,-50%) rotate(${p2.rot}deg)`;
        const img = el.querySelector('img');
        if (!img) return;
        if (img.naturalWidth > 0) g._imgAspect = img.naturalHeight / img.naturalWidth;
        applySwipeStickerImg(img, swipeStickerPos(g), wpx);
        if (!(img.complete && img.naturalWidth) && !img.dataset.mfCropBound) {
          img.dataset.mfCropBound = '1';
          img.addEventListener('load', () => layoutOne(el, g), { once: true });
        }
      }
      function reposition(){
        items.forEach(({ el, g }) => layoutOne(el, g));
      }
      reposition();
      _swipePhotosResize = () => reposition();
      window.addEventListener('resize', _swipePhotosResize);
    }
    /* Bind the play button of the profile voice-memo widget on a card */
    function bindCardVoice(card){
      const widget = card.querySelector('.card-voice');
      if (!widget) return;
      const src  = widget.dataset.voice;
      const btn  = widget.querySelector('.card-voice-play');
      const bar  = widget.querySelector('.card-voice-bar');
      const time = widget.querySelector('.card-voice-time');
      const audio = new Audio(src);
      audio.preload = 'metadata';
      audio.volume = mediaEffectiveVol();
      widget._voiceAudio = audio;
      const fmt = t => { const s = Math.floor(t || 0); return '0:' + (s < 10 ? '0' + s : s); };
      audio.addEventListener('loadedmetadata', () => { time.textContent = fmt(audio.duration); });
      audio.addEventListener('play',  () => widget.setAttribute('data-playing','true'));
      audio.addEventListener('pause', () => widget.setAttribute('data-playing','false'));
      audio.addEventListener('ended', () => { widget.setAttribute('data-playing','false'); bar.style.width = '0%'; time.textContent = fmt(audio.duration); });
      audio.addEventListener('timeupdate', () => {
        if (audio.duration && isFinite(audio.duration)) {
          bar.style.width = (audio.currentTime / audio.duration * 100) + '%';
          time.textContent = fmt(audio.duration - audio.currentTime);
        }
      });
      btn.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (audio.paused) audio.play().catch(()=>{});
        else audio.pause();
      });
    }

    function activityIcon(type){
      if (type === 'call')  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5be9ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>`;
      if (type === 'music') return `<svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.7.7 0 0 1-.96.23c-2.6-1.6-5.9-1.96-9.78-1.07a.7.7 0 1 1-.3-1.37c4.2-.94 7.83-.54 10.7 1.24a.7.7 0 0 1 .23.97Zm1.25-2.78a.88.88 0 0 1-1.2.28c-2.97-1.83-7.5-2.36-11.02-1.3a.88.88 0 0 1-.5-1.69c4-1.2 8.97-.6 12.4 1.5.4.25.55.81.32 1.21Zm.1-2.9c-3.56-2.12-9.44-2.32-12.83-1.28a1.05 1.05 0 1 1-.6-2.02c3.9-1.18 10.4-.95 14.5 1.5a1.05 1.05 0 1 1-1.07 1.8Z"/></svg>`;
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 12h2M9 11v2M14 12h.01M16 13h.01"/></svg>`;
    }
    const STATUS_LABEL = { online:'En ligne sur Matefindr', idle:'Inactif', dnd:'Ne pas déranger', offline:'Inactif' };
    const DISCORD_STATUS_LABEL = { online:'En ligne', idle:'Inactif', dnd:'Ne pas déranger', offline:'Hors ligne', invisible:'Hors ligne' };

    function discordConnPrefs(p){
      const MC = window.MatefindrConnections;
      if(!MC || !p.connections || !MC.connIsSet(p.connections, 'discord')) return null;
      const e = MC.connGet(p.connections, 'discord');
      if(!e) return null;
      return { showActivity: e.showActivity !== false, showStatus: e.showStatus !== false };
    }

    function fmtRelativeFr(iso){
      if(!iso) return '';
      const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if(s < 45) return 'à l\'instant';
      if(s < 3600) return `il y a ${Math.floor(s / 60)} min`;
      if(s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
      if(s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
      return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    }
    window.__mfFmtRelativeFr = fmtRelativeFr;

    function discordActivityArt(act){
      const img = act.assets?.large_image || act.assets?.small_image;
      if(!img) return null;
      if(String(img).startsWith('mp:external/')){
        try{
          const encoded = String(img).split('/').slice(2).join('/');
          return decodeURIComponent(encoded);
        }catch(_){ return null; }
      }
      if(act.application_id) return `https://cdn.discordapp.com/app-assets/${act.application_id}/${img}.png?size=128`;
      return null;
    }

    function discordActivityHeader(act){
      const t = typeof act.type === 'number' ? act.type : 0;
      const name = act.name || '';
      if(t === 2) return /spotify/i.test(name) ? 'Écoute Spotify' : (name ? `Écoute ${name}` : 'Écoute');
      if(t === 0) return name ? `Joue à ${name}` : 'En jeu';
      if(t === 3) return name ? `Regarde ${name}` : 'Regarde';
      if(t === 5) return name ? `En compétition sur ${name}` : 'En compétition';
      if(t === 1) return name ? `Stream ${name}` : 'En stream';
      return name || 'Activité';
    }

    function discordActivityProgress(act){
      const ts = act.timestamps;
      if(!ts || ts.start == null || ts.end == null) return null;
      const start = Number(ts.start), end = Number(ts.end);
      if(!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      const now = Date.now();
      const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      const fmt = (ms) => {
        const sec = Math.max(0, Math.floor(ms / 1000));
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      };
      return { pct, current: fmt(now - start), total: fmt(end - start) };
    }

    function cardDiscordActivityHtml(p){
      const prefs = discordConnPrefs(p);
      if(!prefs?.showActivity) return '';
      const live = p.discordLive;
      const act = live?.activities?.[0];
      if(!act) return '';
      const art = discordActivityArt(act);
      const title = act.details || act.name || '';
      const sub = act.state || (act.details ? act.name : '') || '';
      const prog = discordActivityProgress(act);
      const brand = /spotify/i.test(act.name || '') ? 'https://cdn.simpleicons.org/spotify/1DB954' : '';
      const isSpotify = /spotify/i.test(act.name || '');
      return `<div class="discord-activity${isSpotify ? ' discord-activity--spotify' : ''}">
        <div class="discord-activity-head">
          <span class="discord-activity-kind">${escapeHtmlMini(discordActivityHeader(act))}</span>
          ${brand ? `<img class="discord-activity-brand" src="${brand}" alt="" width="16" height="16" loading="lazy">` : ''}
        </div>
        <div class="discord-activity-body">
          ${art ? `<img class="discord-activity-cover" src="${escapeHtmlMini(art)}" alt="" loading="lazy">` : `<span class="discord-activity-cover discord-activity-cover--ph">${activityIcon(act.type === 2 ? 'music' : act.type === 0 ? 'game' : 'call')}</span>`}
          <div class="discord-activity-meta">
            ${title ? `<b>${escapeHtmlMini(title)}</b>` : ''}
            ${sub ? `<span>${escapeHtmlMini(sub)}</span>` : ''}
            ${prog ? `<div class="discord-activity-progress"><span style="width:${prog.pct.toFixed(1)}%"></span></div>
            <div class="discord-activity-times"><span>${prog.current}</span><span>${prog.total}</span></div>` : ''}
          </div>
        </div>
      </div>`;
    }

    function cardDiscordLastSeenHtml(p){
      const prefs = discordConnPrefs(p);
      if(!prefs?.showStatus) return '';
      const live = p.discordLive;
      const online = live?.status && !['offline','invisible'].includes(live.status);
      if(online) return '';
      const at = live?.lastOnlineAt || live?.updatedAt || p.lastSeenAt;
      if(!at) return '';
      return `<div class="discord-last-seen">Dernière fois en ligne ${fmtRelativeFr(at)}</div>`;
    }

    function cardPresenceHtml(p){
      if(p.profileVoice) return '';
      const disc = cardDiscordActivityHtml(p);
      if(disc) return disc;
      return cardActivityHtml(p);
    }
    /* Moon icon shown over the avatar for inactive/offline users (Discord-style) */
    const STATUS_MOON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#dcddde"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>';
    // Outline-style SVG icons (white) for looking_for badges — same DA as ♂ ♀ ⭐
    const LOOK_SVG = {
      chill: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M3 14v-3a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3"/><path d="M3 14h18"/><path d="M6 19v2M18 19v2"/></svg>',
      game:  '<svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9h14a3 3 0 0 1 2.9 2.2l1 4A3 3 0 0 1 22 19c-1.4 0-2.2-.8-3-1.6L17.2 16H10.8L9 17.4C8.2 18.2 7.4 19 6 19a3 3 0 0 1-2.9-3.8l1-4A3 3 0 0 1 7 9Z"/><path d="M9 13h2M10 12v2"/><circle cx="17.5" cy="12" r="1" fill="#fff" stroke="none"/><circle cx="19.5" cy="14" r="1" fill="#fff" stroke="none"/></svg>',
      talk:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.3 7.3L3 21l1.7-6.7A8 8 0 1 1 21 12Z"/><circle cx="9" cy="12" r="1" fill="#fff" stroke="none"/><circle cx="12" cy="12" r="1" fill="#fff" stroke="none"/><circle cx="15" cy="12" r="1" fill="#fff" stroke="none"/></svg>',
      sleep: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>',
    };
    // Backwards-compat alias (some legacy code uses LOOK_EMOJI string)
    const LOOK_EMOJI = LOOK_SVG;

    function cardBioText(raw){
      const t = String(raw || '').trim();
      if(!t || /Complète ta bio/i.test(t)) return '';
      return t;
    }

    function isPlaceholderActivity(act){
      if(!act || typeof act !== 'object') return true;
      const title = String(act.title || '').trim();
      const sub = String(act.sub || '').trim();
      if(!title && !sub) return true;
      if(/^Matefindr$/i.test(title)) return true;
      if(/Swipe en cours|Sur Matefindr|Vient de te liker/i.test(sub)) return true;
      return false;
    }

    function cardActivityHtml(p){
      if(p.profileVoice) return '';
      const act = (p.activity && typeof p.activity === 'object') ? p.activity : null;
      if(isPlaceholderActivity(act)) return '';
      const type = act.type || 'game';
      return `<div class="activity">
              <div class="icon">${activityIcon(type)}</div>
              <div class="lbl"><b>${escapeHtmlMini(act.title || '')}</b><span>${escapeHtmlMini(act.sub || '')}</span></div>
            </div>`;
    }

    function buildCard(p, isTop){
      const c = document.createElement('div');
      c.className = 'swipe-card' + (isTop ? ' entering' : '');
      if (p.uid) c.dataset.profileUid = String(p.uid);
      if (p.isMe) c.dataset.profileMe = '1';
      c.style.setProperty('--c1', p.c1);
      c.style.setProperty('--c2', p.c2);
      if (!isTop) {
        c.style.transform = 'scale(0.96) translateY(10px)';
        c.style.pointerEvents = 'none';
        c.style.opacity = '0.85';
      }
      const lookLabel = { chill:tx('look_chill'), game:tx('look_game'), talk:tx('look_talk'), sleep:tx('look_sleep') }[p.looking] || p.looking;
      // PROFILE BODY COLOR : primary + optional secondary as a gradient on the card body (below banner).
      // Si pas de couleur custom → on retombe sur l'accent_color Discord (= "reset Discord").
      const accentHex = p.accentColor ? `#${p.accentColor.toString(16).padStart(6,'0')}` : null;
      const pc1 = (p.profileColor && p.profileColor !== 'discord') ? p.profileColor : null;
      const pc2 = (p.profileColor2 && p.profileColor2 !== 'discord') ? p.profileColor2 : null;
      if (pc1 && pc2) {
        c.style.setProperty('--c1', pc1);
        c.style.setProperty('--c2', pc2);
      } else if (pc1) {
        c.style.setProperty('--c1', pc1);
        c.style.setProperty('--c2', pc1);
      } else if (accentHex) {
        c.style.setProperty('--c1', accentHex);
        c.style.setProperty('--c2', accentHex);
      } else {
        c.style.setProperty('--c1', '#242429');
        c.style.setProperty('--c2', '#1c1d22');
      }
      // BANNER : image Discord/custom si dispo, sinon TRANSPARENTE → c'est le dégradé
      // du corps de la carte (déjà posé sur .swipe-card, pleine hauteur) qui montre au
      // travers, sans couture ni second dégradé recalculé sur la seule bande du haut
      // (qui donnait un rendu différent de la vraie couleur du profil).
      const bannerStyle = p.bannerUrl
        ? `background-image:url('${p.bannerUrl}');background-size:cover;background-position:center`
        : 'background:transparent';
      // Auto-contrast : if the card body is too light, switch text to dark.
      const lum = (hex) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
        const r = parseInt(m[1].slice(0,2),16)/255, g = parseInt(m[1].slice(2,4),16)/255, b = parseInt(m[1].slice(4,6),16)/255;
        const lin = (v) => (v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4));
        return .2126*lin(r) + .7152*lin(g) + .0722*lin(b);
      };
      const L1 = lum(pc1), L2 = lum(pc2);
      const avg = (L1!=null && L2!=null) ? (L1+L2)/2 : (L1!=null ? L1 : (L2!=null ? L2 : null));
      if (avg != null && avg > 0.55) c.classList.add('light-bg');
      // (default stays #1c1d22 from the .swipe-card class)
      // Avatar wrap background follows the card body so the circle blends in
      const aviBg = pc1 || '#1c1d22';
      // Recadrage de la photo (depuis l'éditeur) : object-position + zoom appliqués à la carte.
      // transform-origin DOIT matcher object-position (voir editor.html/setCroppedMedia) :
      // sinon scale() zoome autour du centre de la boîte au lieu du point de pan choisi
      // dans le recadrage, et l'image atterrit ailleurs que prévisualisé dès que scale≠1.
      const ap = normalizeAvatarPos(p.avatarPos);
      const apStyle = ap
        ? `object-position:${ap.posX}% ${ap.posY}%;transform-origin:${ap.posX}% ${ap.posY}%;${ap.scale !== 1 ? `transform:scale(${ap.scale});` : ''}`
        : '';
      const aviInner = p.avatarUrl
        ? `<img src="${p.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;${apStyle}" alt="${p.name}">`
        : p.initial;
      const aviStyle = p.avatarUrl ? '' : `style="background:linear-gradient(135deg,${p.c1},${p.c2})"`;
      // Décorations Discord retirées du site → plus d'overlay de décoration sur l'avatar.
      const decoHtml = '';
      // Fake-Nitro custom decoration (CSS effect around the avatar) — Boost uniquement.
      const fakeDeco = (p.nitro && p.fakeDeco && p.fakeDeco !== 'none') ? p.fakeDeco : null;
      const fakeDecoHtml = fakeDeco ? `<span class="deco-effect deco-${fakeDeco}"></span>` : '';
      // Discord common guilds (icons + count). For mock profiles, pick a random subset
      // of the user's real guilds the first time we build the card, then cache it on
      // the profile so re-renders stay stable for that session.
      // Serveurs en commun RÉELS : intersection entre mes serveurs Discord et ceux de l'autre
      // (p.guildIds = liste d'IDs stockée dans son profil). On affiche les serveurs via MES
      // propres icônes/noms (je suis forcément dedans aussi). Si l'autre n'a pas encore d'IDs
      // synchronisés → on n'affiche rien (plutôt qu'un faux nombre aléatoire).
      const commonGuilds = commonGuildsForProfile(p);
      const guildsHtml = guildsBlockHtml(commonGuilds);
      const viewsHtml = (p._showViews || p.isMe) ? `<span class="card-views"${p.isMe ? ' data-mine="true"' : ''}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg><b>${(p.views||0).toLocaleString('fr-FR')}</b></span>` : '';
      // Connexions — sous « A rejoint Matefindr », zone flexible jusqu'à ~200px du bas.
      const MC = window.MatefindrConnections;
      const conns = (p.connections && typeof p.connections === 'object') ? p.connections : {};
      const TQ = window.MatefindrTitlesQuests;
      const discHelpers = { esc: escapeHtmlMini, fmtRelative: fmtRelativeFr };
      const discordFloorHtml = TQ ? TQ.discordFloorHtml(p, discHelpers) : '';
      const titleHtml = TQ ? TQ.cardTitleSlotHtml(p, escapeHtmlMini) : '';
      const hasDiscordFloor = !!discordFloorHtml;
      let connKeys = MC ? MC.connOrderedIds(conns) : Object.keys(conns).filter(k => conns[k]);
      if (hasDiscordFloor) connKeys = connKeys.filter(k => k !== 'discord');
      const connDensity = connKeys.length >= 9 ? ' card-connections--dense' : connKeys.length >= 6 ? ' card-connections--many' : '';
      const connectionsInner = connKeys.map(k => {
        const app = MC ? MC.connApp(k) : null;
        const entry = MC ? MC.connGet(conns, k) : { v: String(conns[k]), mode: 'link' };
        if (!entry) return '';
        if (MC && app) return MC.connCardHtml(app, entry, p.tag, escapeHtmlMini, p.connUniformColor);
        const label = String(entry.v || conns[k]);
        return `<span class="card-conn" title="${escapeHtmlMini(k)}"><span class="card-conn-ico"><img src="https://cdn.simpleicons.org/${k}/ffffff" alt="" loading="lazy"></span><span class="card-conn-user">${escapeHtmlMini(label)}</span></span>`;
      }).join('');
      const connectionsBlock = connKeys.length
        ? `<div class="card-connections-wrap"><div class="card-connections${connDensity}">${connectionsInner}</div></div>` : '';
      // Vues + date d'inscription en bas à gauche (serveurs en commun → zone titre)
      const joinedHtml = p.joinedOn ? `<div class="joined">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              ${tx('joined_on')} ${p.joinedOn}
            </div>` : '';
      const bottomLeftHtml = (viewsHtml || joinedHtml)
        ? `<div class="card-bottom-left">${viewsHtml}${joinedHtml}</div>` : '';
      if (commonGuilds.length > 0) c.classList.add('has-common-guilds');
      if (connKeys.length > 0) c.classList.add('has-card-connections');
      if (hasDiscordFloor) c.classList.add('has-discord-floor');
      if (viewsHtml || joinedHtml) c.classList.add('has-bottom-stack');
      const titleGuildsRow = (titleHtml || guildsHtml)
        ? `<div class="card-title-guilds-row">${guildsHtml}${titleHtml || '<span class="card-title-slot card-title-slot--empty" aria-hidden="true"></span>'}</div>`
        : '';
      const s = p.socials || {};
      const cleanHandle = (h) => (h || '').replace(/^@+/, '').trim();
      const igH = cleanHandle(s.instagram), ttH = cleanHandle(s.tiktok), spH = cleanHandle(s.spotify);
      const igUrl = igH ? `https://instagram.com/${encodeURIComponent(igH)}` : null;
      const ttUrl = ttH ? `https://www.tiktok.com/@${encodeURIComponent(ttH)}` : null;
      const spUrl = spH ? `https://open.spotify.com/user/${encodeURIComponent(spH)}` : null;
      const socialHtml = (igUrl || ttUrl || spUrl) ? `<div class="card-socials">
        ${igUrl ? `<a href="${igUrl}" target="_blank" rel="noopener" class="card-social" data-kind="instagram" title="Voir le profil Instagram"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.4a4 4 0 1 1-7.9 1.1A4 4 0 0 1 16 11.4z"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/></svg><span>@${escapeHtmlMini(igH)}</span></a>` : ''}
        ${ttUrl ? `<a href="${ttUrl}" target="_blank" rel="noopener" class="card-social" data-kind="tiktok" title="Voir le profil TikTok"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 7.5a6.5 6.5 0 0 1-3.8-1.2v8.3a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.1a2.9 2.9 0 1 0 2 2.7V2h3a3.5 3.5 0 0 0 3.8 3.5v2z"/></svg><span>@${escapeHtmlMini(ttH)}</span></a>` : ''}
        ${spUrl ? `<a href="${spUrl}" target="_blank" rel="noopener" class="card-social" data-kind="spotify" title="Voir le profil Spotify"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm4.6 14.4a.7.7 0 0 1-.96.23c-2.6-1.6-5.9-1.96-9.78-1.07a.7.7 0 1 1-.3-1.37c4.2-.94 7.83-.54 10.7 1.24a.7.7 0 0 1 .23.97Z"/></svg><span>${escapeHtmlMini(spH)}</span></a>` : ''}
      </div>` : '';
      const bioText = cardBioText(p.bio);
      const bioHtml = bioText ? `<div class="bio"><b>Bio</b>${escapeHtmlMini(bioText)}</div>` : '';
      const discPrefs = discordConnPrefs(p);
      const discLive = p.discordLive;
      let cardStatus = p.status || 'offline';
      if(discPrefs?.showStatus && discLive?.status){
        cardStatus = discLive.status === 'invisible' ? 'offline' : discLive.status;
      }
      const statusLabel = (discPrefs?.showStatus && discLive?.status)
        ? (DISCORD_STATUS_LABEL[discLive.status] || DISCORD_STATUS_LABEL.offline)
        : (STATUS_LABEL[p.status] || '');
      // Age + gender badge in the top-right corner of the banner.
      // 'hidden' (Je préfère ne pas dire) : no symbol — just the age.
      // 'autre' : outline star SVG (white) instead of ⚧.
      const GENDER_SYM = {
        male:'♂', il:'♂',
        female:'♀', elle:'♀',
        nonbinary: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3 14.7 9.2 21 9.7l-4.8 4.2 1.5 6.6L12 17l-5.7 3.5 1.5-6.6L3 9.7l6.3-.5L12 3Z"/></svg>',
        other:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3 14.7 9.2 21 9.7l-4.8 4.2 1.5 6.6L12 17l-5.7 3.5 1.5-6.6L3 9.7l6.3-.5L12 3Z"/></svg>',
        autre:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3 14.7 9.2 21 9.7l-4.8 4.2 1.5 6.6L12 17l-5.7 3.5 1.5-6.6L3 9.7l6.3-.5L12 3Z"/></svg>',
      };
      const gSym = GENDER_SYM[p.gender] || '';
      // Drapeau : image flagcdn (les emojis 🇫🇷 s'affichent "FR" sur Windows)
      const countryCode = (p.country && typeof p.country === 'string' && /^[A-Z]{2}$/i.test(p.country)) ? p.country.toUpperCase() : null;
      const flagImg = countryCode ? `<img src="https://flagcdn.com/${countryCode.toLowerCase()}.svg" alt="${countryCode}" loading="lazy">` : (p.countryFlag || '');
      const ageBadgeHtml = (p.age || gSym || flagImg) ? `
        <div class="card-age-badge">
          ${p.age ? `<span class="cab-age">${p.age}</span>` : ''}
          ${flagImg ? `<span class="cab-flag" title="${countryCode || ''}">${flagImg}</span>` : ''}
          ${gSym ? `<span class="cab-gender" data-g="${p.gender || ''}">${gSym}</span>` : ''}
        </div>` : '';
      c.innerHTML = `
        <div class="badge-stamp like">LIKE</div>
        <div class="badge-stamp nope">NOPE</div>
        ${p.isMe ? '<span class="me-chip">Moi</span>' : ''}
        ${bottomLeftHtml}
        ${reactionBadgeHtml(p)}
        <div class="banner"${bannerStyle ? ` style="${bannerStyle}"` : ''}></div>
        ${ageBadgeHtml}
        <div class="avatar-wrap${(p.nitro && !fakeDeco) ? ' nitro' : ''}${fakeDeco ? ' has-fake-deco' : ''}">
          ${fakeDecoHtml}
          <div class="avi" ${aviStyle}>${aviInner}</div>
          <span class="status-dot ${cardStatus}">${(cardStatus === 'offline' || cardStatus === 'idle') ? STATUS_MOON_SVG : ''}</span>
        </div>
        ${p.nitro ? `<span class="nitro-badge">${tx('nitro')}</span>` : ''}
        <div class="body">
          <div>
            <div class="name-row">
              <span class="name${(p.boost && p.showBoostName !== false && !(p.nameColor && /^#[0-9a-f]{6}$/i.test(p.nameColor))) ? ' name--boost' : ''}"${(p.nameColor && /^#[0-9a-f]{6}$/i.test(p.nameColor)) ? ` style="color:${p.nameColor};-webkit-text-fill-color:${p.nameColor}"` : ''}>${p.name}${(p.boost && p.showBoostName !== false && !(p.nameColor && /^#[0-9a-f]{6}$/i.test(p.nameColor))) ? '<span class="name-boost-star" aria-label="Boost"></span>' : ''}</span>
            </div>
            <div class="handle"><span class="handle-tag${p.handleBlur ? ' handle-tag--blur' : ''}">@${p.tag}</span>${statusLabel && !hasDiscordFloor ? ` <span class="sep">•</span> ${statusLabel}` : ''}</div>
            ${titleGuildsRow}
          </div>
          <hr class="div"/>
          ${p.profileVoice ? `
            <div class="card-voice" data-voice="${escapeHtmlMini(p.profileVoice)}">
              <button type="button" class="card-voice-play" aria-label="Lecture vocal">
                <svg class="ico-play"  width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg>
                <svg class="ico-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
              </button>
              <div class="card-voice-info">
                <b>Vocal du profil</b>
                <div class="card-voice-track"><span class="card-voice-bar"></span></div>
              </div>
              <span class="card-voice-time">0:00</span>
            </div>
          ` : (hasDiscordFloor ? '' : cardPresenceHtml(p))}
          ${bioHtml}
          ${(discordFloorHtml || connectionsBlock) ? `<div class="card-discord-conn-stack">${discordFloorHtml}${connectionsBlock}</div>` : ''}
          ${hasDiscordFloor ? '' : cardDiscordLastSeenHtml(p)}
          ${socialHtml}
        </div>
      `;
      // Réactions : chargées à la demande (pas encore en cache) puis mises à jour en
      // direct dans le(s) badge(s) déjà affichés via renderReactionBadges().
      if (p.uid && !p.isMe && !_reactionsCache[p.uid] && typeof loadReactions === 'function') loadReactions(p.uid);
      // Ma propre carte (aperçu) : vues + notes reçues, résolues après coup (uid pas
      // connu au moment du rendu synchrone) puis injectées dans les badges déjà affichés.
      if (p.isMe && typeof refreshMyViewsAndReactions === 'function') refreshMyViewsAndReactions();
      // En mode APERÇU on peut aussi traîner la carte : attachDrag détecte le
      // preview et la fait rebondir au centre au relâchement (aucun swipe).
      if (isTop) attachDrag(c);
      // Voice-memo player on the card (if any)
      bindCardVoice(c);
      // Clean up the entering class once the animation completes so future transforms (drag) aren't clobbered
      c.addEventListener('animationend', (ev) => { if (ev.animationName === 'cardIn') c.classList.remove('entering'); }, { once:true });
      // Titre + serveurs : même ligne si ça tient, sinon serveurs juste au-dessus
      if (titleHtml && guildsHtml) {
        requestAnimationFrame(() => syncTitleGuildsLayout(c));
      }
      return c;
    }

    /* Bubble budget — socials no longer count against the bubble limit.
       Free: 4 bubbles. Boost: 14 bubbles. */
    function orbBudget(){ return (state.user && state.user.boost) ? 16 : 4; }
    function socialsCount(){
      const s = (state.user && state.user.socials) || {};
      return ['instagram','tiktok','spotify'].filter(k => s[k]).length;
    }
    function orbsUsed(){
      return ((state.profile && state.profile.userOrbs) || []).length;
    }

    /* SVG icons used inside each orb (so all orbs of the same kind look identical) */
    const ORB_SVG = {
      /* Spotify logo */
      music: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm4.6 14.4a.7.7 0 0 1-.96.23c-2.6-1.6-5.9-1.96-9.78-1.07a.7.7 0 1 1-.3-1.37c4.2-.94 7.83-.54 10.7 1.24a.7.7 0 0 1 .23.97Zm1.25-2.78a.88.88 0 0 1-1.2.28C13.68 12.07 9.15 11.54 5.63 12.6a.88.88 0 0 1-.5-1.69c4-1.2 8.97-.6 12.4 1.5.4.25.55.81.32 1.21Zm.1-2.9C14.39 8.64 8.51 8.44 5.12 9.48a1.05 1.05 0 1 1-.6-2.02c3.9-1.18 10.4-.95 14.5 1.5a1.05 1.05 0 1 1-1.07 1.8Z"/></svg>',
      /* Microphone with sound waves */
      voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M9 21h6"/></svg>',
      /* Star (anime) */
      anime: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.6-5.1 4.5 1.6 6.8L12 17l-6.3 3.2 1.6-6.8L2.2 8.9l6.9-.6L12 2z"/></svg>',
      /* Gamepad */
      game:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18c-2.5 0-4-1.7-4-4 0-3 1.5-7 4-7h12c2.5 0 4 4 4 7 0 2.3-1.5 4-4 4-1.8 0-2.6-2-4-2h-4c-1.4 0-2.2 2-4 2Z"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/><circle cx="17.5" cy="14" r="1" fill="currentColor"/><path d="M8 11h4M10 9v4"/></svg>',
      /* Film strip */
      film:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>',
    };
    /* Build the inside of an orb: a cover image (if available) or a fallback SVG */
    function orbInner(o){
      if (o && o.cover) return `<img class="orb-cover" src="${o.cover}" alt="" />`;
      return ORB_SVG[o.kind] || ORB_SVG.music;
    }

    /* ===== Source unique de vérité pour le placement des bulles =====
       Calcule, pour une liste de bulles, une position NORMALISÉE {rx, ry} :
         - rx = fraction de la LARGEUR de la carte, relative au centre carte (négatif = gauche)
         - ry = fraction de la HAUTEUR de la carte, relative au centre carte (négatif = haut)
       Cette même fonction est utilisée par l'éditeur (overlay) ET par la carte de swipe,
       donc une bulle posée à gauche reste à gauche partout, au même emplacement relatif.
       - Bulle avec customX/customY (drag&drop) → garde sa position exacte.
       - Bulle sans position → slot par défaut : colonnes symétriques gauche/droite,
         max 4 par colonne, nouvelle colonne plus loin si pleine.
       Renvoie { rel: Map(orb -> {rx,ry}), plus: {rx,ry}|null } (plus = emplacement du "+"). */
    const ORB_LAYOUT = { COL0: 0.735, COL_GAP: 0.42, ROW_STEP: 0.215, MAX_PER_COL: 4 };
    /* Orientation d'affichage courante → détermine quelle disposition de profil
       utiliser (le profil peut être arrangé séparément par orientation dans l'éditeur).
       - portrait : téléphone étroit (≤600px)
       - landscape : téléphone tenu à l'horizontale (pointeur grossier, court en hauteur)
       - desktop : tout le reste (grand écran). */
    function activeLayoutMode(){
      try {
        if (window.matchMedia('(max-width:600px)').matches) return 'portrait';
        if (window.matchMedia('(pointer:coarse) and (orientation:landscape) and (max-height:600px)').matches) return 'landscape';
      } catch(_){}
      return 'desktop';
    }
    function orbRelLayout(orbs, withPlus, mode){
      mode = mode || 'desktop';
      const { COL0, COL_GAP, ROW_STEP, MAX_PER_COL } = ORB_LAYOUT;
      // Position sauvegardée POUR LE MODE courant (portrait/paysage), repli sur bureau.
      const posFor = (o) => {
        if (!o) return null;
        if (mode === 'portrait'  && o.posPortrait  && typeof o.posPortrait.x  === 'number') return { rx: o.posPortrait.x,  ry: o.posPortrait.y  };
        if (mode === 'landscape' && o.posLandscape && typeof o.posLandscape.x === 'number') return { rx: o.posLandscape.x, ry: o.posLandscape.y };
        if (typeof o.customX === 'number' && typeof o.customY === 'number') return { rx: o.customX, ry: o.customY };
        return null;
      };
      const rel = new Map();
      // 1) Bulles avec position sauvegardée pour ce mode : prioritaire
      orbs.forEach(o => { const p = posFor(o); if (p) rel.set(o, p); });
      const auto = orbs.filter(o => !rel.has(o));
      // 2a) PORTRAIT (téléphone) : 1 colonne étroite par côté, alternée et centrée
      //     verticalement — identique à l'éditeur portrait (orbLayout).
      if (mode === 'portrait'){
        const MCOL = 0.64;
        const leftN = Math.ceil(auto.length / 2), rightN = Math.floor(auto.length / 2);
        const MROW = Math.min(0.33, 1.6 / Math.max(leftN, 1));
        let li = 0, ri = 0;
        auto.forEach((o, i) => {
          const side = (i % 2 === 0) ? -1 : 1;
          const idxOnSide = (side < 0) ? li++ : ri++;
          const cnt = (side < 0) ? leftN : rightN;
          rel.set(o, { rx: side * MCOL, ry: (idxOnSide - (cnt - 1) / 2) * MROW });
        });
        return { rel, plus: null };
      }
      // 2b) BUREAU / PAYSAGE : colonnes symétriques larges (alternance gauche/droite, 4 max/colonne).
      const sides = [[], []]; // 0 = gauche, 1 = droite
      auto.forEach((o, i) => sides[i % 2].push(o));
      const cols = [[], []]; // par côté : [{rx, count, lastRy}]
      sides.forEach((arr, s) => {
        const sign = s === 0 ? -1 : 1;
        for (let c = 0; c * MAX_PER_COL < arr.length; c++){
          const chunk = arr.slice(c * MAX_PER_COL, c * MAX_PER_COL + MAX_PER_COL);
          const rx = sign * (COL0 + c * COL_GAP);
          const startRy = -((chunk.length - 1) * ROW_STEP) / 2;
          chunk.forEach((o, r) => rel.set(o, { rx, ry: startRy + r * ROW_STEP }));
          cols[s].push({ rx, count: chunk.length, lastRy: startRy + (chunk.length - 1) * ROW_STEP });
        }
      });
      // 3) "+" : sous la colonne du côté le moins rempli (gauche en cas d'égalité),
      //    sans déplacer les bulles existantes. Nouvelle colonne si la dernière est pleine.
      let plus = null;
      if (withPlus){
        const s = sides[0].length <= sides[1].length ? 0 : 1;
        const sign = s === 0 ? -1 : 1;
        const sc = cols[s];
        if (!sc.length) plus = { rx: sign * COL0, ry: 0 };
        else {
          const last = sc[sc.length - 1];
          plus = last.count >= MAX_PER_COL
            ? { rx: sign * (COL0 + sc.length * COL_GAP), ry: 0 }
            : { rx: last.rx, ry: last.lastRy + ROW_STEP };
        }
      }
      return { rel, plus };
    }

    /* Petit popup affiché au clic sur une bulle verrouillée (compte incomplet). */
    function showLockPopup(ownCount){
      const msg = (ownCount === 0)
        ? "Pour voir tout le contenu du profil, finis de compléter ton propre profil."
        : "Ajoute plus de bulles à ton profil pour débloquer celles des autres.";
      let el = document.getElementById('orbLockPop');
      if (!el) {
        el = document.createElement('div');
        el.id = 'orbLockPop';
        el.className = 'orb-lock-pop';
        el.innerHTML = '<div class="olp-backdrop"></div><div class="olp-box">'
          + '<span class="olp-ico">🔒</span><p class="olp-msg"></p>'
          + '<button type="button" class="olp-btn">Compléter mon profil</button></div>';
        document.body.appendChild(el);
        el.querySelector('.olp-backdrop').addEventListener('click', () => el.classList.remove('open'));
        el.querySelector('.olp-btn').addEventListener('click', () => { el.classList.remove('open'); location.href = 'editor.html'; });
      }
      el.querySelector('.olp-msg').textContent = msg;
      el.classList.add('open');
    }

    /* Render the orb constellation around the top card */
    /* Live physics state for the profile orbs (mouse repulsion + drift) */
    let _orbSim = { items: [], mouse: { x: -9999, y: -9999, has: false }, raf: null };

    let _swipeCurrentP = null;      // profil actuellement affiché (pour re-render à la rotation)
    let _swipeRenderedMode = null;  // orientation utilisée au dernier rendu des bulles
    // Couleur perso choisie dans l'éditeur pour un type de bulle (music/game/film) →
    // dérive les 3 stops du dégradé + les couleurs de bordure/halo en CSS custom
    // properties, lues par les règles .orb[data-kind] de css/app.css (fallback = couleur par défaut).
    function shadeHex(hex, amt){
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex;
      const r = parseInt(m[1].substr(0,2),16), g = parseInt(m[1].substr(2,2),16), b = parseInt(m[1].substr(4,2),16);
      const f = v => amt >= 0 ? Math.round(v + (255 - v) * amt) : Math.round(v * (1 + amt));
      return '#' + [f(r),f(g),f(b)].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2,'0')).join('');
    }
    function hexToRgbaOrb(hex, a){
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
      const r = parseInt(m[1].substr(0,2),16), g = parseInt(m[1].substr(2,2),16), b = parseInt(m[1].substr(4,2),16);
      return `rgba(${r},${g},${b},${a})`;
    }
    // glowOff : n'annule que le halo flou (--orb-gc/--orb-hc), le contour/anneau
    // (--orb-bc/--orb-rc) reste inchangé même quand le glow est désactivé.
    function orbDisplayColor(o, p){
      if (o.color && /^#[0-9a-f]{6}$/i.test(o.color)) return o.color;
      if (p.orbColors && p.orbColors[o.kind]) return p.orbColors[o.kind];
      return null;
    }
    function orbDisplayGlowOff(o, p){
      if (o.glow === false) return true;
      if (o.glow === true) return false;
      return !!(p.orbGlow && p.orbGlow[o.kind] === false);
    }
    function orbDisplayContourOff(o, p){
      if (o.contour === false) return true;
      if (o.contour === true) return false;
      return !!(p.orbContour && p.orbContour[o.kind] === false);
    }
    function applyOrbCustomColor(el, hex, glowOff, contourOff){
      if (!el) return;
      el.classList.toggle('orb--no-contour', !!contourOff);
      el.classList.toggle('orb--no-glow', !!glowOff);
      const valid = hex && /^#[0-9a-f]{6}$/i.test(hex);
      if (contourOff) {
        el.style.setProperty('--orb-bc', 'transparent');
        el.style.setProperty('--orb-rc', 'transparent');
      } else if (valid) {
        el.style.setProperty('--orb-c1', shadeHex(hex, .35));
        el.style.setProperty('--orb-c2', hex);
        el.style.setProperty('--orb-c3', shadeHex(hex, -.55));
        el.style.setProperty('--orb-bc', hexToRgbaOrb(hex, .85));
        el.style.setProperty('--orb-rc', hexToRgbaOrb(hex, .45));
      }
      if (glowOff) {
        el.style.setProperty('--orb-gc', 'rgba(0,0,0,0)');
        el.style.setProperty('--orb-hc', 'rgba(0,0,0,0)');
      } else if (valid) {
        el.style.setProperty('--orb-gc', hexToRgbaOrb(hex, .8));
        el.style.setProperty('--orb-hc', hexToRgbaOrb(hex, .45));
      }
    }
    /* Hint centre bulle : note (musique) / clic (jeu+clip).
       Dès l'affichage d'un profil : 1s fade-in → 1s hold max → 1s fade-out → 5s off. */
    const ORB_HINT_SRC = {
      music: 'assets/orb-hint-music.png',
      clip: 'assets/orb-hint-click.png',
    };
    const ORB_HINT_MAX_OP = 0.624; // +30% vs 0.48
    const ORB_HINT_FADE_MS = 1000;
    const ORB_HINT_HOLD_MS = 1000; // 1s à opacité max avant fade-out
    const ORB_HINT_OFF_MS = 5000;  // 5s caché avant réapparition
    const ORB_HINT_PERIOD_MS = ORB_HINT_FADE_MS + ORB_HINT_HOLD_MS + ORB_HINT_FADE_MS + ORB_HINT_OFF_MS; // 8s
    let _orbHintCycleTimer = null;
    let _orbHintPhaseTimers = [];
    function clearOrbHintPhaseTimers(){
      _orbHintPhaseTimers.forEach(t => clearTimeout(t));
      _orbHintPhaseTimers = [];
    }
    function orbHintNodes(){
      return document.querySelectorAll('#swipeOrbit .orb-click-hint');
    }
    function runOrbHintPulse(){
      clearOrbHintPhaseTimers();
      const nodes = orbHintNodes();
      if (!nodes.length) return;
      // Reset sans transition
      nodes.forEach(h => {
        h.style.transition = 'none';
        h.style.opacity = '0';
        h.style.visibility = 'visible';
        void h.offsetWidth;
      });
      // Fade-in 1s
      nodes.forEach(h => {
        h.style.transition = 'opacity ' + ORB_HINT_FADE_MS + 'ms linear';
        h.style.opacity = String(ORB_HINT_MAX_OP);
      });
      // Après fade-in + hold 1s : fade-out 1s
      _orbHintPhaseTimers.push(setTimeout(() => {
        orbHintNodes().forEach(h => {
          h.style.visibility = 'visible';
          h.style.transition = 'opacity ' + ORB_HINT_FADE_MS + 'ms linear';
          h.style.opacity = '0';
        });
      }, ORB_HINT_FADE_MS + ORB_HINT_HOLD_MS));
      // Après fade-out : caché totalement
      _orbHintPhaseTimers.push(setTimeout(() => {
        orbHintNodes().forEach(h => {
          h.style.transition = 'none';
          h.style.opacity = '0';
          h.style.visibility = 'hidden';
        });
      }, ORB_HINT_FADE_MS + ORB_HINT_HOLD_MS + ORB_HINT_FADE_MS));
    }
    /** Relance le cycle dès qu'un profil (ses bulles) est affiché. */
    function restartOrbHintCycle(){
      clearOrbHintPhaseTimers();
      if (_orbHintCycleTimer) {
        clearInterval(_orbHintCycleTimer);
        _orbHintCycleTimer = null;
      }
      // Laisser le DOM peindre les hints avant de lancer le fade
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          runOrbHintPulse();
          _orbHintCycleTimer = setInterval(runOrbHintPulse, ORB_HINT_PERIOD_MS);
        });
      });
    }
    function appendOrbClickHint(btn, kind){
      if (!btn || btn.querySelector('.orb-click-hint')) return;
      const src = ORB_HINT_SRC[kind];
      if (!src) return;
      const hint = document.createElement('span');
      hint.className = 'orb-click-hint orb-click-hint--' + kind;
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = '<img class="orb-click-hint__ico" src="' + src + '" alt="" draggable="false">';
      btn.appendChild(hint);
    }

    function renderOrbs(p){
      _swipeCurrentP = p;
      _swipeRenderedMode = activeLayoutMode();
      const orbit = document.getElementById('swipeOrbit');
      orbit.innerHTML = '';
      _orbSim.items = [];
      if (_orbSim.raf) { cancelAnimationFrame(_orbSim.raf); _orbSim.raf = null; }
      if (!p || !p.orbs) return;
      // Build a set of my own orbs (kind + normalized title) so we can highlight
      // bubbles shared with the displayed profile.
      const norm = (s) => (s || '').toLowerCase().trim();
      const myOrbs = (state.profile && state.profile.userOrbs) || [];
      const mineSet = new Set(myOrbs.map(o => `${o.kind}::${norm(o.title)}`));

      // === Verrouillage des bulles (comptes SANS Boost) ===
      // L'utilisateur voit, sur le profil des autres, autant de bulles qu'il en a
      // sur le SIEN : 0→aucune (toutes « ? »), 1→1, 2→2, 3→3, 4+→toutes. Boost = tout.
      // EXCEPTION : un lien de partage perso (matefindr.com/<slug>) doit toujours
      // montrer le profil complet, déverrouillé, à N'IMPORTE QUI qui clique dessus
      // (c'est tout le but d'un lien à partager) — pas de comparaison "combien de
      // bulles as-tu toi-même" comme dans le deck de swipe. p._showViews n'est posé
      // QUE par openSharedProfile() → marqueur fiable "c'est un lien perso".
      const isSharedLink = !!p._showViews;
      const viewerBoost = !!(state.user && state.user.boost);
      const ownCount = myOrbs.length;
      const unlimited = p.isMe || isSharedLink || viewerBoost || ownCount >= 4;
      const unlockCount = unlimited ? Infinity : ownCount;

      // Sur les autres profils on affiche TOUTES leurs bulles (max 14) ; certaines
      // seront verrouillées. Sur sa propre carte, on garde son budget.
      const maxOrbs = p.isMe ? orbBudget() : 16;
      const list = p.orbs.slice(0, maxOrbs);
      const n = list.length;
      orbit.classList.toggle('orbit--dynamic', n > 0);

      // Déverrouille en priorité les bulles EN COMMUN avec l'autre profil.
      let unlockedSet = null;
      if (!unlimited) {
        const commonIdx = [], otherIdx = [];
        list.forEach((o, i) => {
          (mineSet.has(`${o.kind}::${norm(o.title)}`) ? commonIdx : otherIdx).push(i);
        });
        unlockedSet = new Set(commonIdx.concat(otherIdx).slice(0, unlockCount));
      }

      // Fullscreen viewport bounds
      const sw = window.innerWidth;
      const sh = window.innerHeight;

      // Position the orbs around the visible profile card using the SAME normalized
      // layout as the edit overlay (orbRelLayout). Each position is a fraction of the
      // card (rx of width, ry of height) relative to the card center — so a bubble the
      // user dropped on the left in the editor stays on the left here, same spot.
      // Use the swipeWrap rect (stable, no transform) — the card itself may be mid
      // slide-in animation when this runs, so its own rect is unreliable for frame 1.
      const wrapEl = document.getElementById('swipeWrap');
      const cardRect = wrapEl
        ? wrapEl.getBoundingClientRect()
        : { left: sw/2 - 190, top: sh/2 - 310, width: 380, height: 620 };
      const cardCx = cardRect.left + cardRect.width / 2;
      const cardCy = cardRect.top  + cardRect.height / 2;
      // Orientation active (portrait / paysage téléphone / bureau) → détermine
      // quelles positions lire ET la taille des bulles. La disposition compacte
      // portrait est centralisée dans orbRelLayout (source unique éditeur+swipe).
      const layoutMode = activeLayoutMode();
      const orbRadius = () => layoutMode === 'portrait' ? 32 : layoutMode === 'landscape' ? 38 : 58;
      // Map orb -> {rx, ry} : positions du mode courant (posPortrait/posLandscape/customX).
      const { rel: orbRel } = orbRelLayout(list, false, layoutMode);
      function relToPx(rel, orbR){
        const r = rel || { rx: ORB_LAYOUT.COL0, ry: 0 };
        const x = cardCx + r.rx * cardRect.width;
        const y = cardCy + r.ry * cardRect.height;
        return {
          x: Math.max(orbR + 6, Math.min(sw - orbR - 6, x)),
          y: Math.max(orbR + 6, Math.min(sh - orbR - 6, y)),
        };
      }
      function pickPos(orbR, idx){ return relToPx(orbRel.get(list[idx]), orbR); }

      list.forEach((o, i) => {
        const locked = unlockedSet ? !unlockedSet.has(i) : false;
        // Pas de highlight "en commun" (halo doré) sur un lien perso : comparer les
        // bulles du visiteur à celles du propriétaire n'a de sens que dans le deck
        // de swipe (deux vrais profils qui se matchent), pas sur un lien à partager.
        const isCommon = !p.isMe && !isSharedLink && !locked && mineSet.has(`${o.kind}::${norm(o.title)}`);
        const wrap = document.createElement('div');
        wrap.className = 'orb-wrap' + (isCommon ? ' orb-wrap--common' : '') + (locked ? ' orb-wrap--locked' : '');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'orb' + (isCommon ? ' orb--common' : '') + (locked ? ' orb--locked' : '');
        btn.dataset.kind = o.kind;
        if (!locked) applyOrbCustomColor(btn, orbDisplayColor(o, p), orbDisplayGlowOff(o, p), orbDisplayContourOff(o, p));
        if (locked) {
          btn.title = 'Bulle verrouillée';
          btn.innerHTML = '<span class="orb-lock-glyph">' + (ownCount === 0 ? '?' : '!') + '</span>';
        } else {
          btn.title = `${o.title} · ${o.sub || ''}${isCommon ? ' · En commun ✨' : ''}${o.kind === 'music' ? ' · Clique pour écouter' : (o.kind === 'game' && o.clipUrl ? ' · Clique pour le clip' : '')}`;
          btn.innerHTML = orbInner(o);
        }
        // Rank as a round mini-bubble (with the tier icon) orbiting around the game orb
        if (!locked && o.kind === 'game' && o.rank) {
          const v = rankVisual(o.rank);
          const iconUrl = rankIconUrl(o.title, o.rank);
          const iconHtml = iconUrl
            ? `<img class="orb-rank-img" src="${iconUrl}" alt="${escapeHtmlMini(o.rank)}" loading="lazy" decoding="async">`
            : `<span class="orb-rank-ico">${v.ico}</span>`;
          const rk = document.createElement('span');
          rk.className = 'orb-rank-orbit';
          rk.innerHTML = `<span class="orb-rank-ball${iconUrl ? ' orb-rank-ball--img' : ''}" style="--rc1:${v.c1};--rc2:${v.c2}" title="${escapeHtmlMini(o.rank)}">${iconHtml}</span>`;
          btn.appendChild(rk);
        }
        // Hint centre : toutes les bulles musique + chaque jeu avec clip (cycle sync CSS)
        if (!locked) {
          if (o.kind === 'music') appendOrbClickHint(btn, 'music');
          else if (o.kind === 'game' && o.clipUrl) appendOrbClickHint(btn, 'clip');
        }
        // (Le "+" pour ajouter rank/clip n'apparaît PLUS sur la carte de swipe —
        // il reste accessible uniquement via l'overlay d'édition des bulles.
        // Empêche le clic accidentel "+" en bord de bulle pendant le swipe.)
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (locked) { showLockPopup(ownCount); return; }
          if (o.kind === 'music') {
            for (let r = 0; r < 3; r++) {
              const ripple = document.createElement('span');
              ripple.className = 'orb-sound-ripple';
              ripple.style.animationDelay = (r * 0.18) + 's';
              btn.appendChild(ripple);
              setTimeout(() => ripple.remove(), 1500);
            }
          }
          playOrb(o, btn);
        });
        const label = document.createElement('span');
        label.className = 'orb-label';
        label.textContent = locked ? '' : ((o.title || '').length > 14 ? o.title.slice(0, 13) + '…' : (o.title || ''));
        wrap.appendChild(btn);
        wrap.appendChild(label);

        const isMusic = o.kind === 'music';
        const orbR = orbRadius(o);
        const pos = pickPos(orbR, i);

        if (isMusic) wrap.classList.add('orb-wrap--music');
        wrap.style.position = 'absolute';
        wrap.style.left = '0';
        wrap.style.top  = '0';
        wrap.style.willChange = 'transform';
        wrap.style.animation = 'none';
        wrap.style.zIndex = isMusic ? '6' : '5';

        orbit.appendChild(wrap);

        // Start at rest at the anchor — the spring keeps them locked unless interacted.
        _orbSim.items.push({
          el: wrap,
          orb: o,
          rel: orbRel.get(o) || { rx: ORB_LAYOUT.COL0, ry: 0 },
          ax: pos.x, ay: pos.y,
          x:  pos.x, y:  pos.y,
          vx: 0, vy: 0,
          phase: Math.random() * Math.PI * 2,
          r: wrap.offsetWidth / 2 || orbR,
          isMusic,
        });
      });

      // Initial paint
      _orbSim.items.forEach(it => { it.el.style.transform = `translate(${it.x - it.r}px, ${it.y - it.r}px)`; });
      orbSimStart();
      // Hints : fade dès l'affichage de CE profil (pas un cycle global déjà lancé)
      restartOrbHintCycle();
    }
    // Recompute anchors on viewport resize from each orb's stored relative position
    // (rx, ry) — keeps bubbles locked to the same spot relative to the card.
    function _swipeOrbsOnResize(){
      // Changement d'orientation (portrait <-> paysage <-> bureau) → re-rendu complet
      // des bulles pour lire la disposition ET la taille du nouveau mode.
      if (activeLayoutMode() !== _swipeRenderedMode) {
        if (_swipeCurrentP) renderOrbs(_swipeCurrentP);
        return;
      }
      if (!_orbSim.items.length) return;
      const wrapEl = document.getElementById('swipeWrap');
      if (!wrapEl) return;
      const cardRect = wrapEl.getBoundingClientRect();
      const cardCx = cardRect.left + cardRect.width / 2;
      const cardCy = cardRect.top  + cardRect.height / 2;
      const sw = window.innerWidth, sh = window.innerHeight;
      for (const it of _orbSim.items){
        const r = it.rel || { rx: ORB_LAYOUT.COL0, ry: 0 };
        it.ax = Math.max(it.r + 6, Math.min(sw - it.r - 6, cardCx + r.rx * cardRect.width));
        it.ay = Math.max(it.r + 6, Math.min(sh - it.r - 6, cardCy + r.ry * cardRect.height));
      }
    }
    window.addEventListener('resize', _swipeOrbsOnResize);
    // Le zoom navigateur (Ctrl +/-) change la taille réelle de la carte mais ne
    // déclenche pas TOUJOURS un window 'resize' de façon fiable selon le navigateur
    // -> ResizeObserver sur #swipeWrap est la SOURCE DE VÉRITÉ (se déclenche pour
    // toute cause de changement de taille, zoom inclus). On simule un vrai 'resize'
    // pour que TOUS les listeners déjà branchés dessus (bulles ci-dessus, GIFs/photos
    // dans renderSwipeGifs/renderSwipePhotos, fond perso dans positionCustomBgLayer)
    // se recalent ensemble, sans dupliquer leur logique ici.
    if (typeof ResizeObserver !== 'undefined') {
      const _swipeWrapEl = document.getElementById('swipeWrap');
      if (_swipeWrapEl) new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(_swipeWrapEl);
    }
    // La rotation du téléphone ne déclenche pas toujours 'resize' → on force le re-rendu.
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { if (_swipeCurrentP && activeLayoutMode() !== _swipeRenderedMode) renderOrbs(_swipeCurrentP); }, 120);
    });

    /* Mouse tracking on the WHOLE viewport (orbit is fullscreen) */
    (function bindOrbMouse(){
      window.addEventListener('mousemove', (e) => {
        _orbSim.mouse.x = e.clientX;
        _orbSim.mouse.y = e.clientY;
        _orbSim.mouse.has = true;
      });
      window.addEventListener('mouseleave', () => { _orbSim.mouse.has = false; });
    })();

    /* Returns a list of rects representing UI zones bubbles must avoid.
       Each rect: { x, y, w, h, hard:bool }. hard=true => no entry allowed. */
    function forbiddenRects(){
      const rects = [];
      const add = (sel, hard, padding = 12) => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el || el.hidden) return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          rects.push({
            x: r.left - padding,
            y: r.top - padding,
            w: r.width + padding * 2,
            h: r.height + padding * 2,
            hard,
          });
        });
      };
      // Hard block — top navigation bar
      add('header', true, 6);
      // Soft avoid — interactive UI
      add('.msg-fab', false, 20);
      add('.swipe-actions', false, 16);
      add('.swipe-tools', false, 14);
      add('.my-status', false, 16);
      add('.acc-discord-fab', false, 16);
      add('.bf-fab', false, 18);
      add('.mf-vol', false, 14);
      return rects;
    }

    function orbSimStart(){
      if (_orbSim.raf) return;
      let _zoneCache = null, _zoneCacheT = 0;
      const step = () => {
        const m = _orbSim.mouse;
        const sw = window.innerWidth;
        const sh = window.innerHeight;
        // Refresh forbidden zones every ~400ms (cheaper than every frame)
        const now = performance.now();
        if (!_zoneCache || now - _zoneCacheT > 400){
          _zoneCache = forbiddenRects();
          _zoneCacheT = now;
        }
        const zones = _zoneCache;
        for (const it of _orbSim.items){
          it.phase += 0.014;

          // Forbidden-zone repulsion — push the orb out of nav/FAB/etc.
          for (const z of zones){
            // Closest point on rect to orb center
            const cx = Math.max(z.x, Math.min(it.x, z.x + z.w));
            const cy = Math.max(z.y, Math.min(it.y, z.y + z.h));
            const dx = it.x - cx;
            const dy = it.y - cy;
            const inside = dx === 0 && dy === 0;
            const d = Math.sqrt(dx*dx + dy*dy);
            const reach = it.r + (z.hard ? 6 : 18);
            if (inside || d < reach){
              // Compute push direction (use rect center if inside)
              let nx, ny;
              if (inside){
                const rcx = z.x + z.w / 2, rcy = z.y + z.h / 2;
                nx = (it.x - rcx) || 1;
                ny = (it.y - rcy) || 1;
                const nl = Math.hypot(nx, ny) || 1;
                nx /= nl; ny /= nl;
              } else {
                nx = dx / (d || 1);
                ny = dy / (d || 1);
              }
              const fScale = z.hard ? 8 : 3.5;
              const overlap = Math.max(0, reach - d);
              it.vx += nx * (0.6 + overlap * 0.05) * fScale * 0.3;
              it.vy += ny * (0.6 + overlap * 0.05) * fScale * 0.3;
              // Hard zones : also clamp position so orbs really can't enter
              if (z.hard && inside){
                it.x = z.x + z.w / 2 + nx * (z.w / 2 + it.r + 4);
                it.y = z.y + z.h / 2 + ny * (z.h / 2 + it.r + 4);
              }
            }
          }

          // Mouse repulsion — identique pour toutes les bulles
          if (m.has){
            const dx = it.x - m.x;
            const dy = it.y - m.y;
            const d2 = dx*dx + dy*dy;
            const range  = 100;
            const fScale = 0.42;
            if (d2 < range*range){
              const d = Math.sqrt(d2) || 1;
              const force = (1 - d/range);
              it.vx += (dx/d) * force * fScale;
              it.vy += (dy/d) * force * fScale;
            }
          }

          // Mouvement subtil — TOUTES les bulles bougent pareil (les bulles musique ne
          // vibrent plus). Un peu plus d'amplitude qu'avant pour qu'elles soient moins fixes,
          // mais le ressort (sk) les garde ancrées à leur position.
          const breathAmp = 3.2;
          const jitter   = 0.045;
          const maxSp    = 1.7;
          const breathX = Math.cos(it.phase * 0.55) * breathAmp;
          const breathY = Math.sin(it.phase * 0.45) * breathAmp;
          const sk = 0.034;  // ressort un peu plus mou → balancement plus ample, reste ancré
          it.vx += ((it.ax + breathX) - it.x) * sk;
          it.vy += ((it.ay + breathY) - it.y) * sk;
          it.vx += (Math.random() - 0.5) * jitter;
          it.vy += (Math.random() - 0.5) * jitter;
          const damp = 0.84;
          it.vx *= damp;
          it.vy *= damp;
          const sp = Math.hypot(it.vx, it.vy);
          if (sp > maxSp) { it.vx = it.vx / sp * maxSp; it.vy = it.vy / sp * maxSp; }

          it.x += it.vx;
          it.y += it.vy;

          // Rebond dans une ZONE limitée (pas tout l'écran) — bulles restent autour de la carte
          const zoneMX = sw * 0.06;          // marge horizontale (6% de chaque côté)
          const zoneTop = sh * 0.12;         // marge haute (sous le header)
          const zoneBot = sh * 0.90;         // marge basse (au-dessus des boutons swipe)
          const minX = zoneMX + it.r, maxX = sw - zoneMX - it.r;
          const minY = zoneTop + it.r, maxY = zoneBot - it.r;
          if (it.x < minX)      { it.x = minX; it.vx = Math.abs(it.vx); }
          else if (it.x > maxX) { it.x = maxX; it.vx = -Math.abs(it.vx); }
          if (it.y < minY)      { it.y = minY; it.vy = Math.abs(it.vy); }
          else if (it.y > maxY) { it.y = maxY; it.vy = -Math.abs(it.vy); }
        }
        // Pairwise interactions :
        // 1. Personal-space repulsion (soft) when close but not touching
        // 2. Elastic collision (hard) when overlapping
        const items = _orbSim.items;
        for (let i = 0; i < items.length; i++){
          const a = items[i];
          for (let j = i + 1; j < items.length; j++){
            const b = items[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d  = Math.hypot(dx, dy);
            if (d <= 0) continue;
            const minD = a.r + b.r;
            const space = minD + 26; // personal-space radius
            const nx = dx / d, ny = dy / d;

            if (d < minD){
              // HARD collision — separate + elastic bounce
              const overlap = (minD - d);
              const totalR = a.r + b.r;
              const wa = b.r / totalR, wb = a.r / totalR;
              a.x -= nx * overlap * wa;
              a.y -= ny * overlap * wa;
              b.x += nx * overlap * wb;
              b.y += ny * overlap * wb;
              const va = a.vx * nx + a.vy * ny;
              const vb = b.vx * nx + b.vy * ny;
              const diff = vb - va;
              a.vx += nx * diff * 0.5 * 0.7;
              a.vy += ny * diff * 0.5 * 0.7;
              b.vx -= nx * diff * 0.5 * 0.7;
              b.vy -= ny * diff * 0.5 * 0.7;
            } else if (d < space){
              // SOFT push — encourages spacing without sticking
              const force = (1 - (d - minD) / (space - minD)) * 0.18;
              a.vx -= nx * force;
              a.vy -= ny * force;
              b.vx += nx * force;
              b.vy += ny * force;
            }
          }
        }
        // Apply transforms after collision resolution
        for (const it of items){
          it.el.style.transform = `translate(${it.x - it.r}px, ${it.y - it.r}px)`;
        }
        _orbSim.raf = requestAnimationFrame(step);
      };
      _orbSim.raf = requestAnimationFrame(step);
    }
    /* Pause simulation when not on swipe screen (saves CPU) */
    function orbSimStop(){ if (_orbSim.raf) { cancelAnimationFrame(_orbSim.raf); _orbSim.raf = null; } }
    function escapeHtmlMini(s){ return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

    /* Spotify Client Credentials */
    let _spotifyToken = null, _spotifyTokenExp = 0;
    async function getSpotifyToken(){
      if (_spotifyToken && _spotifyTokenExp > Date.now()) return _spotifyToken;
      const resp = await fetch('https://accounts.spotify.com/api/token', {
        method:'POST',
        headers:{
          'Content-Type':'application/x-www-form-urlencoded',
          'Authorization':'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET),
        },
        body:'grant_type=client_credentials',
      });
      const d = await resp.json();
      _spotifyToken = d.access_token;
      _spotifyTokenExp = Date.now() + (d.expires_in - 60) * 1000;
      return _spotifyToken;
    }
    /* iTunes Search API — fallback #2 pour les previews 30s */
    const _itunesCache = new Map();
    async function itunesPreview(artist, name){
      const key = ((artist||'') + '|' + (name||'')).toLowerCase().trim();
      if (_itunesCache.has(key)) return _itunesCache.get(key);
      try {
        const q = encodeURIComponent(((artist||'') + ' ' + (name||'')).trim());
        const resp = await fetch('https://itunes.apple.com/search?term=' + q + '&entity=song&limit=1&media=music');
        const d = await resp.json();
        const url = d.results?.[0]?.previewUrl || null;
        _itunesCache.set(key, url);
        return url;
      } catch { _itunesCache.set(key, null); return null; }
    }

    /* Deezer API — fallback #1 pour les previews 30s. CORS bloque /search direct
       → on utilise leur endpoint JSONP qui marche depuis le navigateur. */
    const _deezerCache = new Map();
    function jsonpFetch(url, timeoutMs = 5000){
      return new Promise((resolve, reject) => {
        const cbName = 'dz_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        const sep = url.includes('?') ? '&' : '?';
        const fullUrl = url + sep + 'output=jsonp&callback=' + cbName;
        const script = document.createElement('script');
        const cleanup = () => { delete window[cbName]; script.remove(); };
        const timeout = setTimeout(() => { cleanup(); reject(new Error('jsonp timeout')); }, timeoutMs);
        window[cbName] = (data) => { clearTimeout(timeout); cleanup(); resolve(data); };
        script.onerror = () => { clearTimeout(timeout); cleanup(); reject(new Error('jsonp error')); };
        script.src = fullUrl;
        document.head.appendChild(script);
      });
    }
    async function deezerPreview(artist, name){
      const key = ((artist||'') + '|' + (name||'')).toLowerCase().trim();
      if (_deezerCache.has(key)) return _deezerCache.get(key);
      try {
        const q = encodeURIComponent(((artist||'') + ' ' + (name||'')).trim());
        const data = await jsonpFetch('https://api.deezer.com/search?q=' + q + '&limit=1');
        const url = data?.data?.[0]?.preview || null;
        _deezerCache.set(key, url);
        return url;
      } catch { _deezerCache.set(key, null); return null; }
    }

    async function searchSpotifyTracks(query, limit=6){
      const token = await getSpotifyToken();
      const resp = await fetch(
        'https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=' + limit,
        { headers:{ Authorization:'Bearer ' + token } }
      );
      const d = await resp.json();
      const items = (d.tracks?.items || []).map(t => ({
        name:       t.name,
        artist:     t.artists?.[0]?.name || '',
        cover:      t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || null,
        previewUrl: t.preview_url,
        durationMs: t.duration_ms,
      }));
      // Cascade : Spotify → Deezer → iTunes pour le preview URL
      await Promise.all(items.map(async t => {
        if (!t.previewUrl) t.previewUrl = await deezerPreview(t.artist, t.name);
        if (!t.previewUrl) t.previewUrl = await itunesPreview(t.artist, t.name);
      }));
      return items;
    }
    let _spotifyAudio = null;
    let _swipeMusicPausedForOrb = false;
    // Volume cible d'une bulle de musique = même réglage que la musique d'entrée.
    function orbMusicTarget(){
      return mediaEffectiveVol();
    }
    // Quand une bulle de musique démarre : on met en pause la musique d'entrée (pas de superposition).
    function pauseProfileMusicForOrb(){
      if (_swipeMusicAudio && !_swipeMusicAudio.paused) { _swipeMusicAudio.pause(); _smSetPlayingUI(false); _swipeMusicPausedForOrb = true; }
    }
    // Quand plus aucune bulle ne joue : on relance la musique d'entrée si on l'avait coupée.
    function resumeProfileMusicAfterOrb(){
      if (!_swipeMusicPausedForOrb) return;
      _swipeMusicPausedForOrb = false;
      if (_swipeMusicAudio && _swipeMusicAudio.paused) {
        _swipeMusicAudio.play().then(() => _smSetPlayingUI(true)).catch(() => {});
      }
    }

    /* Audio fade helpers */
    function fadeIn(audio, target=0.45, dur=700){
      if (!audio) return;
      const step = 40, n = Math.max(1, Math.round(dur/step));
      let i = 0;
      audio.volume = 0;
      const tick = () => {
        if (!audio || audio.paused) return;
        i++;
        audio.volume = Math.min(target, (i/n) * target);
        if (i < n) setTimeout(tick, step);
      };
      tick();
    }
    function fadeOutAndStop(audio, dur=250){
      if (!audio) return;
      const start = audio.volume, step = 40, n = Math.max(1, Math.round(dur/step));
      let i = 0;
      const tick = () => {
        if (!audio) return;
        i++;
        audio.volume = Math.max(0, start * (1 - i/n));
        if (i < n) setTimeout(tick, step);
        else audio.pause();
      };
      tick();
    }

    /* Jikan API for anime covers (free, no auth). Prefer large/HD image variants. */
    async function searchAnime(query){
      try {
        const resp = await withTimeout(fetch('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(query) + '&limit=6&sfw=true&order_by=popularity&sort=asc'), 2500);
        if (!resp) return [];
        const d = await resp.json();
        return (d.data || []).map(a => ({
          name:   a.title_english || a.title,
          sub:    a.title_japanese || (a.type || '') + (a.year ? ' · ' + a.year : ''),
          cover:  a.images?.webp?.large_image_url
                || a.images?.jpg?.large_image_url
                || a.images?.webp?.image_url
                || a.images?.jpg?.image_url
                || null,
        }));
      } catch(_){ return []; }
    }

    /* Wikipedia search → thumbnails (free, CORS-friendly). Used for games + films. */
    async function searchWiki(query, kindHint){
      const hint = kindHint === 'film' ? ' film' : kindHint === 'game' ? ' video game' : '';
      try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json' +
          '&prop=pageimages|pageterms&piprop=thumbnail&pithumbsize=300&wbptterms=description' +
          '&generator=search&gsrlimit=6&origin=*&gsrsearch=' + encodeURIComponent(query + hint);
        const resp = await fetch(url);
        const d = await resp.json();
        const pages = d.query?.pages ? Object.values(d.query.pages) : [];
        return pages
          .sort((a,b) => (a.index||0) - (b.index||0))
          .map(p => ({
            name:  p.title,
            sub:   (p.terms?.description?.[0] || '').slice(0,60),
            cover: p.thumbnail?.source || null,
          }))
          .filter(r => r.cover);
      } catch(_){ return []; }
    }

    /* Toast + media playback for an orb */
    let _voice = null;
    function showToast(ico, title, sub){
      const t = document.getElementById('swipeToast');
      document.getElementById('toastIco').textContent = ico;
      document.getElementById('toastTitle').textContent = title;
      document.getElementById('toastSub').textContent = sub;
      t.setAttribute('data-show', 'true');
      clearTimeout(showToast._h);
      showToast._h = setTimeout(() => t.setAttribute('data-show', 'false'), 3200);
    }
    /* ===== Game meta modal (rank + clip URL after a game bubble is added) ===== */
    let _editingGameOrb = null;
    function openGameMetaModal(orb){
      _editingGameOrb = orb;
      const modal     = document.getElementById('gameMetaModal');
      const nameEl    = document.getElementById('gmmGameName');
      const rankWrap  = document.getElementById('gmmRankField');
      const rankSel   = document.getElementById('gmmRankSelect');
      const clipInput = document.getElementById('gmmClipInput');
      if (!modal) return;
      nameEl.textContent = orb.title;
      const ranks = RANKED_GAMES[orb.title];
      if (ranks) {
        rankWrap.hidden = false;
        rankSel.innerHTML = '<option value="">Pas classé</option>' + ranks.map(r => `<option value="${r}">${r}</option>`).join('');
        rankSel.value = orb.rank || '';
      } else {
        rankWrap.hidden = true;
        rankSel.value = '';
      }
      clipInput.value = orb.clipUrl || '';
      modal.setAttribute('data-open', 'true');
      setTimeout(() => clipInput.focus(), 60);
    }
    function closeGameMetaModal(){
      _editingGameOrb = null;
      document.getElementById('gameMetaModal').setAttribute('data-open', 'false');
    }
    window.openGameMetaModal = openGameMetaModal;
    (function bindGameMetaModal(){
      const modal = document.getElementById('gameMetaModal');
      if (!modal) return;
      document.getElementById('gmmClose')?.addEventListener('click', closeGameMetaModal);
      document.getElementById('gmmBackdrop')?.addEventListener('click', closeGameMetaModal);
      document.getElementById('gmmSkip')?.addEventListener('click', closeGameMetaModal);
      document.getElementById('gmmSave')?.addEventListener('click', () => {
        if (!_editingGameOrb) { closeGameMetaModal(); return; }
        const editedOrb = _editingGameOrb; // capture before close nulls the ref
        const rank = document.getElementById('gmmRankSelect').value.trim();
        const clip = document.getElementById('gmmClipInput').value.trim();
        if (clip && !clipUrlToEmbed(clip)) {
          showToast('⚠️', 'Lien non supporté', 'YouTube, Twitch, Streamable ou Medal uniquement');
          return;
        }
        if (rank) editedOrb.rank = rank; else delete editedOrb.rank;
        if (clip) editedOrb.clipUrl = clip; else delete editedOrb.clipUrl;
        save();
        renderUserOrbs();
        if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
        // Re-render the bubble layout(s) so the new rank icon shows immediately
        if (typeof renderOrbEditLayout === 'function' && document.getElementById('orbEditOverlay')?.getAttribute('data-show') === 'true') {
          renderOrbEditLayout();
        }
        if (typeof ensureDeck === 'function' && document.body.getAttribute('data-screen') === 'swipe') {
          ensureDeck();
        }
        closeGameMetaModal();
        showToast('🎮', 'Bulle mise à jour', `${editedOrb.title || ''} ${rank ? '· ' + rank : ''}`);
      });
    })();

    /* ===== Clip overlay (plays when a game orb is clicked) ===== */
    /* Whitelist d'embeds — bloque les URL malicieuses (javascript:, data:, etc.)
       Seuls YouTube / Twitch / Streamable / Medal (HTTPS) sont acceptés. */
    function clipUrlToEmbed(url){
      if (!url) return null;
      const u = String(url).trim();
      // YouTube watch / short / shorts — extract video ID. Use youtube.com (pas nocookie) car
      // certaines vidéos refusent l'embed nocookie. Pas d'autoplay : l'utilisateur clique Play.
      let m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
      if (m) return { type:'iframe', src:`https://www.youtube.com/embed/${encodeURIComponent(m[1])}?autoplay=0&rel=0&playsinline=1`, externalUrl:`https://www.youtube.com/watch?v=${encodeURIComponent(m[1])}` };
      // Twitch clip — pause jusqu'au clic utilisateur
      m = u.match(/clips\.twitch\.tv\/([\w-]+)/i) || u.match(/twitch\.tv\/\w+\/clip\/([\w-]+)/i);
      if (m) return { type:'iframe', src:`https://clips.twitch.tv/embed?clip=${encodeURIComponent(m[1])}&parent=${encodeURIComponent(location.hostname)}&autoplay=false` };
      // Streamable
      m = u.match(/streamable\.com\/([\w-]+)/i);
      if (m) return { type:'iframe', src:`https://streamable.com/e/${encodeURIComponent(m[1])}?autoplay=0` };
      // Medal.tv — pas d'autoplay (évite aussi le double flux audio)
      m = u.match(/medal\.tv\/clip\/([A-Za-z0-9_-]+)(?:\/([A-Za-z0-9_-]+))?/i);
      if (m) {
        const path = m[2] ? (m[1] + '/' + m[2]) : m[1];
        return { type:'iframe', src:`https://medal.tv/clip/${path}?autoplay=0&muted=0&cta=0&loop=0`, externalUrl:u.split(/[?#]/)[0], provider:'medal' };
      }
      m = u.match(/medal\.tv\/(?:games\/[^/?#]+\/)?clips\/([A-Za-z0-9_-]+)/i);
      if (m) return { type:'iframe', src:`https://medal.tv/clip/${encodeURIComponent(m[1])}?autoplay=0&muted=0&cta=0&loop=0`, externalUrl:u.split(/[?#]/)[0], provider:'medal' };
      return null;
    }
    let _clipOpenLockUntil = 0;
    function openClipOverlay(orb){
      const overlay = document.getElementById('clipOverlay');
      const content = document.getElementById('clipContent');
      if (!overlay || !content) return;
      const now = Date.now();
      if (now < _clipOpenLockUntil) return;
      _clipOpenLockUntil = now + 500;
      // Coupe musique d'entrée / preview bulle pour ne pas empiler avec le clip
      // (le clip reste en pause jusqu'au Play de l'utilisateur).
      try {
        if (_spotifyAudio) {
          _spotifyAudio._userStopped = true;
          fadeOutAndStop(_spotifyAudio);
          _spotifyAudio = null;
          document.querySelectorAll('.orb.playing').forEach(el => el.classList.remove('playing'));
        }
        pauseProfileMusicForOrb();
      } catch(_){}
      const url = orb && orb.clipUrl;
      const embed = clipUrlToEmbed(url);
      const safeTitle = escapeHtmlMini((orb && orb.title) || 'cette bulle');
      // Always use DOM manipulation (createElement + setAttribute) for embed src
      // so we never inject untrusted strings into innerHTML.
      content.innerHTML = '';
      if (!embed) {
        const div = document.createElement('div');
        div.className = 'clip-empty';
        div.innerHTML = `Pas de clip associé à ${safeTitle}.<br><small>Le propriétaire du profil n'a rien partagé pour le moment.</small>`;
        content.appendChild(div);
      } else {
        const f = document.createElement('iframe');
        // Embeds sans autoplay — l'utilisateur clique Play dans le player.
        f.src = embed.src;
        f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
        f.setAttribute('allowfullscreen', '');
        if (embed.provider === 'medal') {
          f.setAttribute('scrolling', 'no');
          f.setAttribute('frameborder', '0');
        }
        // PAS de referrerpolicy no-referrer : YouTube a besoin du referrer pour valider
        // le domaine, sinon erreur 153. On garde origin-when-cross-origin (défaut sûr).
        content.appendChild(f);
        // Fallback : lien externe en bas (utile si l'embed est bloqué par le créateur)
        if (embed.externalUrl) {
          const fb = document.createElement('a');
          fb.href = embed.externalUrl;
          fb.target = '_blank';
          fb.rel = 'noopener noreferrer';
          fb.className = 'clip-external-link';
          fb.textContent = 'Si la vidéo ne se charge pas → l\'ouvrir directement';
          content.appendChild(fb);
        }
      }
      overlay.setAttribute('data-show', 'true');
      overlay.setAttribute('aria-hidden', 'false');
    }
    function closeClipOverlay(){
      const overlay = document.getElementById('clipOverlay');
      if (!overlay) return;
      overlay.setAttribute('data-show', 'false');
      overlay.setAttribute('aria-hidden', 'true');
      // Stop the video by emptying the iframe (coupe aussi le double flux Medal)
      const content = document.getElementById('clipContent');
      if (content) content.innerHTML = '';
      try { resumeProfileMusicAfterOrb(); } catch(_){}
    }
    (function bindClipOverlay(){
      const overlay = document.getElementById('clipOverlay');
      if (!overlay) return;
      document.getElementById('clipClose')?.addEventListener('click', closeClipOverlay);
      document.getElementById('clipBackdrop')?.addEventListener('click', closeClipOverlay);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.getAttribute('data-show') === 'true') closeClipOverlay(); });
    })();
    window.openClipOverlay = openClipOverlay;

    function playOrb(o, el){
      // Game orb → ouvre le clip UNIQUEMENT s'il y en a un (sinon rien ne se passe).
      if (o.kind === 'game') { if (o.clipUrl) openClipOverlay(o); return; }
      if (o.kind === 'voice' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(o.voice || o.title);
          u.lang = (document.documentElement.lang === 'en') ? 'en-US' : 'fr-FR';
          u.rate = 1; u.pitch = 1;
          el.classList.add('playing');
          u.onend = () => el.classList.remove('playing');
          u.onerror = () => el.classList.remove('playing');
          window.speechSynthesis.speak(u);
        } catch(_){}
      } else if (o.kind === 'music') {
        // Toggle: re-click on the same playing orb stops it
        if (_spotifyAudio && _spotifyAudio._orbEl === el) {
          _spotifyAudio._userStopped = true;
          fadeOutAndStop(_spotifyAudio);
          _spotifyAudio = null;
          el.classList.remove('playing');
          resumeProfileMusicAfterOrb();
          return;
        }
        // Different orb: stop previous, start new
        if (_spotifyAudio) { _spotifyAudio._userStopped = true; fadeOutAndStop(_spotifyAudio); _spotifyAudio = null; }
        el.classList.add('playing');
        // Sépare "Titre · Artiste" pour pouvoir re-chercher une preview ailleurs.
        const parseTitle = () => {
          const t = (o.title || '').trim();
          const parts = t.split('·');
          return { name: (parts[0] || t).trim(), artist: (parts[1] || o.sub || '').trim() };
        };
        const playUrl = (url) => {
          if (!url) { el.classList.remove('playing'); return; }
          pauseProfileMusicForOrb();
          const a = new Audio(url);
          a._orbEl = el;
          a._userStopped = false;
          a.volume = 0;
          const startSec = (state.user && typeof state.user.musicStartTime === 'number') ? state.user.musicStartTime : 0;
          if (startSec > 0) a.currentTime = Math.min(startSec, 28);
          a.play().catch(() => {});
          fadeIn(a, orbMusicTarget(), 700);
          a.addEventListener('ended', () => { el.classList.remove('playing'); if (_spotifyAudio === a) { _spotifyAudio = null; resumeProfileMusicAfterOrb(); } });
          // URL morte (preview Spotify expirée, 404…) → on retente une fois via Deezer/iTunes.
          a.addEventListener('error', () => {
            if (_spotifyAudio !== a) return;
            _spotifyAudio = null;
            if (!o._triedMusicFallback) { o._triedMusicFallback = true; resolveAndPlay(true); }
            else el.classList.remove('playing');
          });
          // Anti-cutoff : si l'audio est pausé sans intervention utilisateur (swipe, re-render,
          // perte de focus de l'onglet…), on le redémarre automatiquement.
          a.addEventListener('pause', () => {
            if (a._userStopped || a.ended) return;
            if (_spotifyAudio !== a) return;
            setTimeout(() => {
              if (!a._userStopped && !a.ended && _spotifyAudio === a && a.paused) {
                a.play().catch(() => {});
              }
            }, 50);
          });
          _spotifyAudio = a;
        };
        // Résout une preview JOUABLE sans dépendre d'un token Spotify :
        // 1) previewUrl sauvegardé  2) Deezer  3) iTunes  4) recherche Spotify (si dispo).
        async function resolveAndPlay(skipSaved){
          try {
            const { name, artist } = parseTitle();
            let url = (!skipSaved && o.previewUrl) ? o.previewUrl : null;
            if (!url) url = await deezerPreview(artist, name);
            if (!url) url = await itunesPreview(artist, name);
            if (!url) { try { const r = (await searchSpotifyTracks(o.title, 1))[0]; if (r && r.previewUrl) url = r.previewUrl; } catch(_){} }
            if (url) playUrl(url); else el.classList.remove('playing');
          } catch { el.classList.remove('playing'); }
        }
        resolveAndPlay(false);
      }
    }
    function attachDrag(card){
      let sx=0, sy=0, dx=0, dy=0, dragging=false;
      const like = card.querySelector('.badge-stamp.like');
      const nope = card.querySelector('.badge-stamp.nope');
      function onDown(e){
        // Don't start a drag if user is clicking an interactive element (links, buttons)
        const tgt = e.target;
        if (tgt && (tgt.closest('a') || tgt.closest('button'))) return;
        dragging = true;
        const p = e.touches ? e.touches[0] : e;
        sx = p.clientX; sy = p.clientY; dx = 0; dy = 0;
        card.style.transition = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive:false });
        document.addEventListener('touchend', onUp);
      }
      const wrap = document.getElementById('swipeWrap');
      const actions = document.getElementById('screen-swipe')?.querySelector('.swipe-actions');
      function setDir(dir){
        if (!actions) return;
        actions.classList.toggle('dir-right', dir === 'right');
        actions.classList.toggle('dir-left',  dir === 'left');
      }
      function onMove(e){
        if (!dragging) return;
        if (e.touches) e.preventDefault();
        const p = e.touches ? e.touches[0] : e;
        dx = p.clientX - sx; dy = p.clientY - sy;
        card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.06}deg)`;
        // Aperçu / lien perso : on déplace librement la carte, sans stamps LIKE/NOPE
        // ni boutons de swipe (le lien perso n'a plus qu'un cœur, pas de dislike).
        if (_previewMode || _sharedProfile) return;
        if (like) like.style.opacity = Math.max(0, Math.min(1, dx / 120));
        if (nope) nope.style.opacity = Math.max(0, Math.min(1, -dx / 120));
        if (dx > 40) setDir('right');
        else if (dx < -40) setDir('left');
        else setDir(null);
      }
      function onUp(){
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        card.style.transition = '';
        // En mode aperçu / lien perso : la carte rebondit toujours au centre (pas de
        // swipe au drag -- le lien perso ne like que via le bouton cœur dédié).
        if (!_previewMode && !_sharedProfile && Math.abs(dx) > 110) commitSwipe(dx > 0 ? 'yes' : 'no', card);
        else {
          // Retour au centre avec un léger ressort.
          card.style.transition = 'transform .55s cubic-bezier(.34,1.4,.5,1)';
          card.style.transform = '';
          if (like) like.style.opacity = 0;
          if (nope) nope.style.opacity = 0;
          setDir(null);
        }
      }
      card.addEventListener('mousedown', onDown);
      card.addEventListener('touchstart', onDown, { passive:true });
    }
    function commitSwipe(dir, cardEl){
      if (_previewMode) return; // pas de swipe en mode aperçu
      // Lien de partage : ❤️/✖️ animent la carte puis déclenchent l'action (compte + replay).
      if (_sharedProfile) {
        const off = dir === 'yes' ? window.innerWidth + 200 : -(window.innerWidth + 200);
        cardEl.style.transition = 'transform .35s ease-out, opacity .35s';
        cardEl.style.transform = `translate(${off}px, ${dir === 'yes' ? -80 : 80}px) rotate(${dir === 'yes' ? 22 : -22}deg)`;
        cardEl.style.opacity = '0';
        handleSharedAction(dir === 'yes' ? 'like' : 'dislike');
        return;
      }
      const off = dir === 'yes' ? window.innerWidth + 200 : -(window.innerWidth + 200);
      cardEl.style.transition = 'transform .35s ease-out, opacity .35s';
      cardEl.style.transform = `translate(${off}px, ${dir === 'yes' ? -80 : 80}px) rotate(${dir === 'yes' ? 22 : -22}deg)`;
      cardEl.style.opacity = '0';
      const actions = document.querySelector('#screen-swipe .swipe-actions');
      if (actions) actions.classList.remove('dir-right', 'dir-left');
      state.user = state.user || {};
      state.user.stats = state.user.stats || { viewed:0, liked:0 };
      state.user.stats.viewed++;
      const pool = (typeof genderFilteredProfiles === 'function') ? genderFilteredProfiles() : [];
      const swiped = pool[deckIdx]; // mode normal : le deck ne contient que les autres
      if (swiped && !swiped.isMe && swiped.uid && typeof bumpProfileViewOnce === 'function') bumpProfileViewOnce(swiped);
      // LIKE → enregistre un vrai like dans Supabase (match auto si l'autre m'a déjà liké)
      if (dir === 'yes') {
        state.user.stats.liked++;
        if (swiped && !swiped.isMe && swiped.uid && typeof recordLike === 'function') {
          recordLike(swiped);
        }
      }
      save();
      refreshSwipeTools();
      setTimeout(() => { deckIdx++; ensureDeck(); }, 320);
    }

    /* Swipe toolbar : update counts + filter / music labels */
    function refreshSwipeTools(){
      const u = state.user || {};
      const stats = u.stats || { viewed:0, liked:0 };
      document.getElementById('stoolViewed').textContent = stats.viewed;
      document.getElementById('stoolLikesGiven').textContent = stats.liked;
      const rate = stats.viewed > 0 ? Math.round((stats.liked / stats.viewed) * 100) : null;
      document.getElementById('stoolRate').textContent = rate != null ? rate + '%' : '—';
      document.getElementById('stoolLikesCount').textContent = LIKED_ME.length;
      const filt = (u.boost && u.genderFilter) || 'all';
      document.getElementById('stoolFilterLbl').textContent = ({all:'Tous', il:'Il', elle:'Elle'}[filt] || 'Tous');
    }
    document.getElementById('stoolLikes')?.addEventListener('click', () => {
      renderLikedMe();
      document.getElementById('likedPanel').setAttribute('data-open','true');
    });
    document.getElementById('stoolFilter')?.addEventListener('click', () => {
      if (!state.user || !state.user.boost) { openBoostModal(); return; }
      const order = ['all','il','elle'];
      const cur = state.user.genderFilter || 'all';
      const next = order[(order.indexOf(cur)+1) % order.length];
      state.user.genderFilter = next;
      save();
      deckIdx = 0;
      ensureDeck();
      refreshSwipeTools();
      showToast('🔍', 'Filtre', {all:'Tous', il:'Hommes (Il)', elle:'Femmes (Elle)'}[next]);
    });
    function topCard(){ return document.querySelector('#swipeWrap .swipe-card:last-child'); }
    document.getElementById('swipeYes')?.addEventListener('click', () => { const t = topCard(); if (t) commitSwipe('yes', t); });
    document.getElementById('swipeNo')?.addEventListener('click',  () => { const t = topCard(); if (t) commitSwipe('no',  t); });

    // ---------- My-status floating control ----------
    const LOOK_EMO = { chill:'🛋️', game:'🎮', now:'⌨️', sleep:'💤' };
    function refreshMyStatusUI(){
      const cur = (state.profile && state.profile.looking) || 'game';
      const btn = document.getElementById('myStatusBtn');
      btn.setAttribute('data-look', cur);
      document.getElementById('myStatusEmoji').textContent = LOOK_EMO[cur] || '🎮';
      const lbl = document.getElementById('myStatusLabel');
      lbl.setAttribute('data-i18n', 'look_' + cur);
      lbl.textContent = tx('look_' + cur);
      document.querySelectorAll('#myStatusPop button').forEach(b => b.classList.toggle('selected', b.dataset.val === cur));
    }
    const msBtn = document.getElementById('myStatusBtn');
    const msPop = document.getElementById('myStatusPop');
    msBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      msPop.setAttribute('data-open', msPop.getAttribute('data-open') === 'true' ? 'false' : 'true');
    });
    msPop.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      state.profile = state.profile || { gender:null, age:null, looking:null, bio:'' };
      state.profile.looking = b.dataset.val;
      save();
      refreshMyStatusUI();
      msPop.setAttribute('data-open', 'false');
      showToast(LOOK_EMO[state.profile.looking] || '🎮', tx('saved'), tx('look_' + state.profile.looking));
    });
    document.addEventListener('click', (e) => {
      if (msPop.getAttribute('data-open') === 'true' && !msPop.contains(e.target) && !msBtn.contains(e.target)) {
        msPop.setAttribute('data-open', 'false');
      }
    });
    // Make sure the status pill is correct as soon as we land on swipe
    if (document.body.getAttribute('data-screen') === 'swipe') refreshMyStatusUI();

    // ---------- Messages panel ----------
    // Conversations mock retirées — sera branche sur Supabase a part
    const CONVOS = [];

    const panel = document.getElementById('msgPanel');
    const fab   = document.getElementById('msgFab');
    const fabBadge = document.getElementById('msgFabBadge');
    const listEl = document.getElementById('msgList');
    const chatBody = document.getElementById('msgChatBody');
    const msgInput = document.getElementById('msgInput');
    const msgInputField = document.getElementById('msgInputField');
    let activeConvo = null;

    function convoTagLabel(c){
      if (!c) return '';
      if (c.handleBlur) return 'Pseudo Discord masqué';
      return c.tag ? '@' + c.tag : '';
    }

    function renderMsgList(){
      const unread = CONVOS.filter(c => c.unread).length;
      if (unread > 0) { fabBadge.textContent = unread; fabBadge.style.display = 'grid'; }
      else fabBadge.style.display = 'none';
      if (!CONVOS.length) {
        listEl.innerHTML = `<p class="msg-empty">${tx('msg_empty')}</p>`;
        return;
      }
      listEl.innerHTML = '';
      CONVOS.forEach(c => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'msg-item' + (c.unread ? '' : ' read');
        el.dataset.id = c.id;
        // Heure affichée = celle du dernier message (et non « à l'instant »).
        const lastWithTime = [...c.msgs].reverse().find(m => m.t);
        const tLabel = lastWithTime ? lastWithTime.t : '';
        el.innerHTML = `
          <div class="avi" style="background:linear-gradient(135deg, ${c.c1}, ${c.c2});overflow:hidden">${c.avatarUrl ? `<img src="${c.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : c.initial}</div>
          <div class="info">
            <div class="top"><b>${c.name}</b><span class="t">${tLabel}</span></div>
            <p>${c.last}</p>
          </div>
          ${c.unread ? '<span class="dot"></span>' : ''}`;
        el.addEventListener('click', () => openConvo(c.id));
        listEl.appendChild(el);
      });
    }

    function openConvo(id){
      const c = CONVOS.find(x => x.id === id);
      if (!c) return;
      activeConvo = c;
      c.unread = false;
      panel.setAttribute('data-view', 'chat');
      const chatAvi = document.getElementById('msgChatAvi');
      chatAvi.style.background = `linear-gradient(135deg, ${c.c1}, ${c.c2})`;
      chatAvi.style.overflow = 'hidden';
      chatAvi.innerHTML = c.avatarUrl ? `<img src="${c.avatarUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : escapeHtml(c.initial || '');
      document.getElementById('msgChatName').textContent = c.name;
      const subEl = document.getElementById('msgChatSub');
      subEl.textContent = convoTagLabel(c);
      subEl.classList.toggle('msg-chat-sub--hidden', !!c.handleBlur);
      // Clic sur l'avatar / le nom → ouvre le profil de la personne.
      const openProf = (e) => { if (e) e.stopPropagation(); openConvoProfile(c); };
      chatAvi.onclick = openProf;
      const nameWrap = document.getElementById('msgChatName').parentElement;
      if (nameWrap) nameWrap.onclick = openProf;
      chatBody.innerHTML = '';
      chatBody._lastTs = null;
      c.msgs.forEach(m => renderMsgInto(m, c));
      chatBody.scrollTop = chatBody.scrollHeight;
      setTimeout(() => msgInputField.focus(), 200);
      renderMsgList();
    }
    // Ouvre le profil complet d'une personne depuis sa conversation.
    async function openConvoProfile(c){
      if (!c) return;
      let p = null;
      try { if (c.uid && typeof rtProfile === 'function') p = await rtProfile(c.uid); } catch(_){}
      if (!p) p = { name:c.name, tag:c.handleBlur ? '' : c.tag, c1:c.c1, c2:c.c2, initial:c.initial, avatarUrl:c.avatarUrl, age:'', orbs:[], handleBlur:!!c.handleBlur };
      if (typeof openProfilePreview === 'function') openProfilePreview(p);
    }
    function escapeHtml(s){ return s.replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

    fab.addEventListener('click', () => {
      // Profil désactivé par un admin : messagerie bloquée -- seul l'éditeur reste accessible.
      if (state.user && state.user.disabled) { location.href = 'editor.html'; return; }
      panel.setAttribute('data-open', 'true');
      panel.setAttribute('data-view', 'list');
      renderMsgList();
    });
    document.getElementById('msgClose')?.addEventListener('click', () => panel.setAttribute('data-open', 'false'));
    document.getElementById('msgCloseChat')?.addEventListener('click', () => panel.setAttribute('data-open', 'false'));
    document.getElementById('msgBack')?.addEventListener('click', () => { panel.setAttribute('data-view', 'list'); activeConvo = null; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.getAttribute('data-open') === 'true') {
        if (panel.getAttribute('data-view') === 'chat') panel.setAttribute('data-view', 'list');
        else panel.setAttribute('data-open', 'false');
      }
    });
    msgInput.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state.user && state.user.disabled) return; // profil désactivé → pas d'envoi de message
      const v = msgInputField.value.trim();
      if (!v || !activeConvo) return;
      const t = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
      const msg = { who:'me', text:v, t, ts: Date.now() };
      activeConvo.msgs.push(msg);
      activeConvo.last = v;
      activeConvo.t    = t;
      msgInputField.value = '';
      renderMsgInto(msg, activeConvo);
      chatBody.scrollTop = chatBody.scrollHeight;
      // Envoi réel vers Supabase (l'autre le reçoit via Realtime).
      if (activeConvo.matchId && window.__supa) {
        rtMyId().then(me => {
          if (!me) return;
          window.__supa.from('messages').insert({ match_id: activeConvo.matchId, sender_id: me, body: v })
            .then(({ error }) => { if (error) console.warn('[Matefindr] send msg', error.message || error); });
        });
      }
      renderMsgList();
    });
    renderMsgList();

    /* ===================================================================
       TEMPS RÉEL — matches + messages (Supabase). Relie les 2 clients :
       like réciproque → match (animation chez les 2), conversations live.
       Échoue en silence si les tables n'existent pas encore.
       =================================================================== */
    const RT = { myId:null, ready:false, convoByMatch:new Map(), seenMsgIds:new Set(), pollTimer:null };
    function fmtMsgTime(iso){ try { return new Date(iso).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' }); } catch(_){ return ''; } }
    function msgBubbleEl(m, c){
      if (m.who === 'system') {
        const s = document.createElement('div'); s.className = 'msg-bubble system'; s.textContent = m.text; return s;
      }
      const me = m.who === 'me';
      const u = (state && state.user) || {};
      const avatarUrl = me ? u.avatarUrl : (c && c.avatarUrl);
      const initial = me ? ((u.displayName || 'M').charAt(0).toUpperCase()) : ((c && c.initial) || '?');
      const c1 = me ? '#5865F2' : ((c && c.c1) || '#5865F2');
      const c2 = me ? '#404EED' : ((c && c.c2) || '#404EED');
      const row = document.createElement('div');
      row.className = 'msg-row ' + m.who;
      row.innerHTML =
        `<div class="msg-avi" style="background:linear-gradient(135deg,${c1},${c2})">${avatarUrl ? `<img src="${avatarUrl}" alt="">` : escapeHtml(initial)}</div>` +
        `<div class="msg-col">` +
          (m.t ? `<span class="msg-time">${m.t}</span>` : '') +
          `<div class="msg-bubble ${m.who}">${escapeHtml(m.text)}</div>` +
        `</div>`;
      return row;
    }
    // Deux timestamps tombent-ils le même jour calendaire ?
    function sameDay(a, b){
      const da = new Date(a), db = new Date(b);
      return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
    }
    // Libellé d'un séparateur de date : "Aujourd'hui", "Hier", "lundi" (cette semaine),
    // sinon "lundi 23 juin" (et l'année si différente).
    function fmtDaySep(ts){
      const d = new Date(ts), now = new Date();
      const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((start(now) - start(d)) / 86400000);
      if (diff === 0) return "Aujourd'hui";
      if (diff === 1) return "Hier";
      if (diff > 1 && diff < 7) return d.toLocaleDateString('fr-FR', { weekday:'long' });
      const sameYear = d.getFullYear() === now.getFullYear();
      return d.toLocaleDateString('fr-FR', sameYear
        ? { weekday:'long', day:'numeric', month:'long' }
        : { day:'numeric', month:'long', year:'numeric' });
    }
    // Crée la chip-séparateur de jour.
    function daySepEl(ts){
      const s = document.createElement('div');
      s.className = 'msg-daysep';
      s.textContent = fmtDaySep(ts);
      return s;
    }
    // Ajoute un message au flux de chat, précédé d'un séparateur de jour si la date
    // diffère du dernier message rendu (chatBody._lastTs sert de curseur).
    function renderMsgInto(m, c){
      const ts = m.ts || Date.now();
      if (m.who !== 'system' && (chatBody._lastTs == null || !sameDay(chatBody._lastTs, ts))){
        chatBody.appendChild(daySepEl(ts));
      }
      chatBody.appendChild(msgBubbleEl(m, c));
      if (m.who !== 'system') chatBody._lastTs = ts;
    }
    async function rtMyId(){
      if (RT.myId) return RT.myId;
      try { const { data:{ session } } = await window.__supa.auth.getSession(); RT.myId = (session && session.user && session.user.id) || null; } catch(_){}
      return RT.myId;
    }
    async function rtProfile(otherId){
      let p = (typeof _remoteProfiles !== 'undefined') && _remoteProfiles.find(x => x.uid === otherId);
      if (p) return p;
      try { const { data } = await window.__supa.from('profiles').select('*').eq('id', otherId).limit(1);
            if (data && data[0] && typeof rowToProfile === 'function') return rowToProfile(data[0]); } catch(_){}
      return null;
    }
    // Crée (ou retrouve) la ligne match normalisée (user_a < user_b). Renvoie son id.
    async function ensureMatchRow(otherId){
      const me = await rtMyId();
      if (!me || !otherId || !window.__supa) return null;
      const a = me < otherId ? me : otherId, b = me < otherId ? otherId : me;
      try {
        const { data, error } = await window.__supa.from('matches')
          .upsert({ user_a:a, user_b:b }, { onConflict:'user_a,user_b' }).select('id').limit(1);
        if (error) { console.warn('[Matefindr] match upsert', error.message || error); return null; }
        return (data && data[0] && data[0].id) || null;
      } catch(e){ console.warn('[Matefindr] match err', e); return null; }
    }
    // Construit/maj une conversation locale liée à un matchId.
    function rtUpsertConvo(matchId, otherId, p, opts){
      opts = opts || {};
      let c = CONVOS.find(x => x.matchId === matchId)
           || (p && CONVOS.find(x => (p.tag && x.tag === p.tag) || (otherId && x.uid === otherId)));
      if (!c) {
        c = { id:'m_'+matchId, matchId, uid:otherId,
              name:(p&&p.name)||'Match', tag:(p&&p.handleBlur)?'':((p&&p.tag)||''),
              handleBlur:!!(p&&p.handleBlur),
              c1:(p&&p.c1)||'#5865F2', c2:(p&&p.c2)||'#404EED',
              initial:(p&&p.initial)||(((p&&p.name)||'?').charAt(0)), avatarUrl:(p&&p.avatarUrl)||null,
              t:"à l'instant", unread:!!opts.unread,
              last:opts.last || 'Vous venez de matcher 🎉',
              msgs: (opts.system === false) ? [] : [{ who:'system', text:`🎉 C'est un match${(p&&p.name)?` avec ${p.name}`:''} ! Lancez la conversation.` }] };
        CONVOS.unshift(c);
      } else {
        c.matchId = matchId; if (otherId) c.uid = otherId;
        if (p) {
          if (p.name) c.name = p.name;
          if (typeof p.handleBlur === 'boolean') c.handleBlur = p.handleBlur;
          if (p.tag && !p.handleBlur) c.tag = p.tag;
          else if (p.handleBlur) c.tag = '';
          if (p.avatarUrl) c.avatarUrl = p.avatarUrl;
          if (p.c1) c.c1 = p.c1;
          if (p.c2) c.c2 = p.c2;
          if (p.initial) c.initial = p.initial;
        }
        if (opts.unread) c.unread = true;
      }
      RT.convoByMatch.set(matchId, c);
      return c;
    }
    // Point d'entrée unique « démarrer un match » (swipe réciproque OU clic cœur dans les likes).
    async function startMatch(p, opts){
      opts = opts || {};
      let c;
      if (p && p.uid) {
        const matchId = await ensureMatchRow(p.uid);
        if (matchId) c = rtUpsertConvo(matchId, p.uid, p, { unread:!!opts.unread });
      }
      if (!c) { // fallback hors-ligne / sans uid
        const id = 'm_' + Date.now();
        c = CONVOS.find(x => p && p.tag && x.tag === p.tag);
        if (!c) { c = { id, name:p.name, tag:p.handleBlur?'':p.tag, handleBlur:!!p.handleBlur, uid:p.uid||null, c1:p.c1||'#5865F2', c2:p.c2||'#404EED',
              initial:p.initial||(p.name||'?').charAt(0), avatarUrl:p.avatarUrl||null,
              t:"à l'instant", unread:!!opts.unread, last:'Vous venez de matcher 🎉',
              msgs:[{ who:'system', text:`🎉 C'est un match avec ${p.name} ! Lancez la conversation.` }] }; CONVOS.unshift(c); }
      }
      if (typeof renderMsgList === 'function') renderMsgList();
      if (typeof playMatchAnimation === 'function') playMatchAnimation(p, c.id);
      return c;
    }
    // Retrouve un match par son id (vérifie via RLS qu'il m'appartient) et crée la convo.
    async function rtResolveMatch(matchId){
      const me = await rtMyId(); if (!me) return null;
      try {
        const { data } = await window.__supa.from('matches').select('*').eq('id', matchId).limit(1);
        if (!data || !data[0]) return null;
        const m = data[0]; const other = m.user_a === me ? m.user_b : m.user_a;
        const p = await rtProfile(other);
        return rtUpsertConvo(matchId, other, p, { system:false });
      } catch(_){ return null; }
    }
    // Message entrant (Realtime) — n'affiche QUE les messages des autres dans mes convos.
    function rtHandleIncomingMessage(row){
      RT.seenMsgIds.add(row.id);
      rtMyId().then(async me => {
        if (!me || row.sender_id === me) return; // mes propres messages sont déjà affichés (optimiste)
        let c = RT.convoByMatch.get(row.match_id) || CONVOS.find(x => x.matchId === row.match_id);
        if (!c) c = await rtResolveMatch(row.match_id); // match créé hors session
        if (!c) return; // pas un de mes matchs → ignoré
        if (c.msgs.some(m => m._id === row.id)) return;
        const tm = fmtMsgTime(row.created_at);
        const msg = { who:'them', text:row.body, _id:row.id, t:tm, ts: new Date(row.created_at).getTime() };
        c.msgs.push(msg);
        c.last = row.body; c.t = "à l'instant";
        if (activeConvo && activeConvo.matchId === c.matchId) {
          renderMsgInto(msg, c);
          chatBody.scrollTop = chatBody.scrollHeight;
          c.unread = false;
        } else { c.unread = true; }
        renderMsgList();
      });
    }
    // Nouveau match (Realtime) — l'autre utilisateur reçoit l'animation en même temps que moi.
    function rtHandleNewMatch(row){
      rtMyId().then(async me => {
        if (!me || (row.user_a !== me && row.user_b !== me)) return;
        if (RT.convoByMatch.has(row.id)) return; // c'est moi qui l'ai initié → déjà animé
        const other = row.user_a === me ? row.user_b : row.user_a;
        const p = await rtProfile(other) || { name:'Nouveau match', initial:'?', uid:other, c1:'#FF7EB6', c2:'#9146FF' };
        const c = rtUpsertConvo(row.id, other, p, { unread:true });
        renderMsgList();
        if (typeof playMatchAnimation === 'function') playMatchAnimation(p, c.id);
        if (typeof window.__heartFabRefresh === 'function') window.__heartFabRefresh();
      });
    }
    // Charge mes conversations existantes (matchs + historique) au démarrage.
    async function rtLoadConversations(){
      const me = await rtMyId(); if (!me || !window.__supa) return;
      let matches = [];
      try {
        const { data, error } = await window.__supa.from('matches').select('*')
          .or(`user_a.eq.${me},user_b.eq.${me}`).order('created_at', { ascending:false }).limit(200);
        if (error) { console.warn('[Matefindr] load matches', error.message || error); return; }
        matches = data || [];
      } catch(_){ return; }
      for (const m of matches) {
        const other = m.user_a === me ? m.user_b : m.user_a;
        const p = await rtProfile(other);
        const c = rtUpsertConvo(m.id, other, p, { system:true });
        try {
          const { data: msgs } = await window.__supa.from('messages').select('*')
            .eq('match_id', m.id).order('created_at', { ascending:true }).limit(500);
          if (msgs && msgs.length) {
            c.msgs = msgs.map(r => { RT.seenMsgIds.add(r.id); return { who: r.sender_id === me ? 'me' : 'them', text:r.body, _id:r.id, t:fmtMsgTime(r.created_at), ts:new Date(r.created_at).getTime() }; });
            c.last = msgs[msgs.length-1].body;
          }
        } catch(_){}
      }
      renderMsgList();
    }
    // Filet de sécurité : sondage toutes les 2 s. Suivi par ID (anti-décalage d'horloge) →
    // instantané et fiable même si le Realtime ne délivre pas.
    async function rtPoll(){
      if (!RT.ready || !window.__supa) return;
      const me = RT.myId; if (!me) return;
      try {
        // 1) nouveaux matchs : ceux pas encore connus (convoByMatch fait office de curseur)
        const { data: matches, error: mErr } = await window.__supa.from('matches').select('*')
          .or(`user_a.eq.${me},user_b.eq.${me}`).order('created_at', { ascending:true }).limit(100);
        if (mErr) throw mErr;
        if (matches) for (const m of matches) { if (!RT.convoByMatch.has(m.id)) rtHandleNewMatch(m); }
        // 2) nouveaux messages : derniers messages de mes convos, on traite les ID jamais vus
        const ids = Array.from(RT.convoByMatch.keys());
        if (ids.length) {
          const { data: msgs, error: msgErr } = await window.__supa.from('messages').select('*')
            .in('match_id', ids).order('created_at', { ascending:false }).limit(60);
          if (msgErr) throw msgErr;
          if (msgs) msgs.slice().reverse().forEach(row => {
            if (RT.seenMsgIds.has(row.id)) return;
            RT.seenMsgIds.add(row.id);
            if (row.sender_id !== me) rtHandleIncomingMessage(row);
          });
        }
        RT.pollFails = 0;
      } catch(e){
        // Coupe-circuit : si matches/messages n'existent pas (SQL pas encore lancé),
        // on arrête le sondage après 3 échecs pour ne pas marteler Supabase (cause de lag).
        RT.pollFails = (RT.pollFails || 0) + 1;
        if (RT.pollFails >= 3 && RT.pollTimer) {
          clearInterval(RT.pollTimer); RT.pollTimer = null;
          console.warn('[Matefindr] sondage Realtime arrêté (tables matches/messages manquantes ?)', e && e.message);
        }
      }
    }
    // Abonnement Realtime (idempotent).
    async function rtStart(){
      if (RT.ready || !window.__supa) return;
      const me = await rtMyId(); if (!me) return;
      RT.ready = true;
      await rtLoadConversations();
      try {
        window.__supa.channel('rt-'+me)
          .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, payload => rtHandleIncomingMessage(payload.new))
          .on('postgres_changes', { event:'INSERT', schema:'public', table:'matches'  }, payload => rtHandleNewMatch(payload.new))
          .subscribe();
      } catch(e){ console.warn('[Matefindr] realtime subscribe', e); }
      // Filet de sécurité : sondage toutes les 2 s (instantané garanti même sans Realtime).
      if (!RT.pollTimer) RT.pollTimer = setInterval(rtPoll, 2000);
    }
    window.__rtStart = rtStart;

    // Create a match from a liker → match animation, then fly to msg-fab + badge
    window.createMatchFromLiker = function(p){
      const idx = LIKED_ME.findIndex(x => x.tag === p.tag);
      if (idx >= 0) LIKED_ME.splice(idx, 1);
      // Ce liker a reçu une réponse → il ne doit JAMAIS revenir dans le panneau.
      dismissLiker(p.uid);
      // Enregistre mon like en retour en DB (upsert direct, sans re-déclencher de match)
      // → likedBack le filtrera aussi sur les autres appareils après sync.
      (async () => {
        try {
          if (window.__supa && p.uid) {
            const { data:{ session } } = await window.__supa.auth.getSession();
            if (session) await window.__supa.from('likes')
              .upsert({ liker_id: session.user.id, liked_id: p.uid }, { onConflict: 'liker_id,liked_id' });
          }
        } catch(_){}
      })();
      // Discord notification (match)
      if (typeof sendDiscordNotif === 'function') sendDiscordNotif('match', p);
      // Crée le vrai match en DB (anti-doublon géré par startMatch/Realtime) + notifie l'autre.
      if (typeof startMatch === 'function') startMatch(p, { unread:true });
      else playMatchAnimation(p, 'm_'+Date.now());
      // Close the liked panel + refresh
      if (typeof renderLikedMe === 'function') renderLikedMe();
      if (typeof window.__heartFabRefresh === 'function') window.__heartFabRefresh();
      document.getElementById('likedPanel').setAttribute('data-open', 'false');
    };

    function playMatchAnimation(p, convoId){
      const overlay = document.getElementById('matchOverlay');
      const aviMe   = document.getElementById('matchAviMe');
      const aviThem = document.getElementById('matchAviThem');
      const initMe   = document.getElementById('matchInitMe');
      const initThem = document.getElementById('matchInitThem');
      const nameMe   = document.getElementById('matchNameMe');
      const nameThem = document.getElementById('matchNameThem');
      const fly      = document.getElementById('matchFly');
      const flyInit  = document.getElementById('matchFlyInit');

      // CLEANUP : reset all leftover state from a previous match animation so
      // we never see ghost avatars / opacities / classes overlapping.
      fly.classList.remove('is-flying');
      fly.hidden = true;
      fly.style.cssText = '';
      flyInit.innerHTML = '';
      aviThem.style.background = '';
      aviMe.style.background = '';
      initMe.innerHTML = '';
      initThem.innerHTML = '';
      overlay.querySelector('.match-content').style.opacity = '';
      overlay.querySelector('.match-content').style.transition = '';

      const u = state.user || {};
      const myName = u.displayName || 'Moi';
      const myInit = (myName || 'M').charAt(0).toUpperCase();
      const myAvatar = u.avatarUrl;
      const themInit = (p.initial || (p.name || '?').charAt(0)).toUpperCase();
      const themAvatar = p.avatarUrl;

      nameMe.textContent = myName;
      nameThem.textContent = p.name;
      initMe.innerHTML = myAvatar ? `<img src="${myAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : escapeHtmlMini(myInit);
      initThem.innerHTML = themAvatar ? `<img src="${themAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : escapeHtmlMini(themInit);
      // Only show the gradient fallback when the other person has no real avatar
      if (!themAvatar) aviThem.style.background = `linear-gradient(135deg,${p.c1 || '#FF7EB6'},${p.c2 || '#9146FF'})`;

      overlay.setAttribute('data-show', 'true');
      document.body.classList.add('match-active');

      // After 1.9s : start the fly-to-fab animation
      setTimeout(() => {
        const aviRect = aviThem.getBoundingClientRect();
        const fab = document.getElementById('msgFab');
        const fabRect = fab ? fab.getBoundingClientRect() : { left: 30, top: window.innerHeight - 50 };
        const fx = (fabRect.left + fabRect.width / 2) - (aviRect.left + aviRect.width / 2);
        const fy = (fabRect.top  + fabRect.height / 2) - (aviRect.top  + aviRect.height / 2);

        fly.style.left = aviRect.left + 'px';
        fly.style.top  = aviRect.top  + 'px';
        fly.style.width  = aviRect.width  + 'px';
        fly.style.height = aviRect.height + 'px';
        if (themAvatar) {
          flyInit.innerHTML = `<img src="${themAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
          fly.style.background = '';
        } else {
          flyInit.textContent = themInit;
          fly.style.background = `linear-gradient(135deg,${p.c1 || '#FF7EB6'},${p.c2 || '#9146FF'})`;
        }
        fly.style.setProperty('--fx', fx + 'px');
        fly.style.setProperty('--fy', fy + 'px');
        fly.hidden = false;

        // Fade out the main content while the avatar flies
        overlay.querySelector('.match-content').style.transition = 'opacity .3s';
        overlay.querySelector('.match-content').style.opacity = '0';

        // Start the fly animation
        requestAnimationFrame(() => fly.classList.add('is-flying'));

        // When the avatar lands : update badge + pulse + close overlay
        setTimeout(() => {
          fly.classList.remove('is-flying');
          fly.hidden = true;
          overlay.setAttribute('data-show', 'false');
          document.body.classList.remove('match-active');
          overlay.querySelector('.match-content').style.opacity = '';
          // Bump the FAB unread badge + pulse
          if (fab) {
            fab.classList.remove('pulse-match'); void fab.offsetWidth; fab.classList.add('pulse-match');
          }
          renderMsgList();
        }, 1100);
      }, 1900);
    }

    // ---------- Orb manager ----------
    const ORB_KIND_SOON = new Set(['game', 'film', 'anime']);
    function isOrbKindSoon(kind) { return ORB_KIND_SOON.has(kind); }
    function showOrbKindSoonToast() { showToast('🕐', 'Bientôt redisponible', 'Les bulles jeu et série·film reviennent très bientôt.'); }

    let selectedOrbKind = 'music';
    const orbPlaceholders = {
      music:'Recherche un son Spotify…',
      game: 'ex: Valorant, Minecraft…',
      anime:'ex: One Piece, Demon Slayer…',
      film: 'ex: Inception, Breaking Bad…',
    };

    function renderUserOrbs(){
      const p = state.profile || {};
      const orbs = p.userOrbs || [];
      const grid = document.getElementById('accOrbGrid');
      if (!grid) return;
      grid.innerHTML = '';
      // Set a count class so CSS can shrink bubbles when >6 (and even more when >12)
      grid.classList.toggle('acc-orb-grid--many',  orbs.length > 6  && orbs.length <= 12);
      grid.classList.toggle('acc-orb-grid--many2', orbs.length > 12);
      orbs.forEach((o, i) => {
        const item = document.createElement('div');
        item.className = 'acc-orb-item';
        const circle = document.createElement('div');
        circle.className = 'acc-orb-circle';
        circle.dataset.kind = o.kind;
        applyOrbCustomColor(circle, orbDisplayColor(o, p), orbDisplayGlowOff(o, p), orbDisplayContourOff(o, p));
        circle.innerHTML = orbInner(o);
        if (o.kind === 'game' && o.rank) {
          const rb = document.createElement('span');
          rb.className = 'orb-rank';
          rb.textContent = o.rank;
          circle.appendChild(rb);
        }
        // Click on a game orb tile → re-open the rank+clip modal to edit
        if (o.kind === 'game') {
          circle.style.cursor = 'pointer';
          circle.addEventListener('click', () => openGameMetaModal(o));
        }
        const lbl = document.createElement('span');
        lbl.className = 'acc-orb-lbl';
        lbl.textContent = o.title + (o.rank ? ` · ${o.rank}` : '');
        const del = document.createElement('button');
        del.className = 'acc-orb-del';
        del.type = 'button';
        del.textContent = '×';
        del.addEventListener('click', () => {
          (state.profile.userOrbs || []).splice(i, 1);
          renderUserOrbs();
          refreshAccountPreview();
        });
        item.append(circle, lbl, del);
        grid.appendChild(item);
      });
      const pill = document.getElementById('orbCounterPill');
      const used = orbsUsed();
      const max = orbBudget();
      if (pill) {
        const sc = socialsCount();
        pill.textContent = used + '/' + max + (sc ? ' (' + sc + ' social' + (sc>1?'s':'') + ')' : '');
      }
      // Sync the chip next to the Bulles tab (legacy — tab is now hidden)
      const tabCount = document.getElementById('tabBulleCount');
      if (tabCount) {
        const orbsOnly = ((state.profile && state.profile.userOrbs) || []).length;
        tabCount.textContent = orbsOnly;
        tabCount.setAttribute('data-show', orbsOnly > 0 ? 'true' : 'false');
      }
      // Update the "Mes bulles" CTA counter on the Profil tab
      if (typeof window.__refreshBullesCta === 'function') window.__refreshBullesCta();
    }

    document.querySelectorAll('.acc-orb-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isOrbKindSoon(btn.dataset.kind)) { showOrbKindSoonToast(); return; }
        document.querySelectorAll('.acc-orb-cat').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedOrbKind = btn.dataset.kind;
        document.getElementById('accOrbInput').placeholder = orbPlaceholders[selectedOrbKind] || 'Tape ici…';
      });
    });

    let _pendingSpotifyOrb = null;
    let _suggDebounce = null;

    function closeSugg(){
      const s = document.getElementById('spotifySugg');
      s.innerHTML = ''; s.classList.remove('open');
    }

    function addOrb(orbOverride){
      const input = document.getElementById('accOrbInput');
      const val = input.value.trim();
      if (!val) return;
      state.profile = state.profile || {};
      state.profile.userOrbs = state.profile.userOrbs || [];
      if (orbsUsed() >= orbBudget()) { showToast('🫧', 'Limite atteinte', orbBudget() + ' bulles max — Boost pour +12'); return; }
      const orb = orbOverride || _pendingSpotifyOrb || {kind: selectedOrbKind, title: val};
      if (isOrbKindSoon(orb.kind)) { showOrbKindSoonToast(); return; }
      // Empêche les doublons (même kind + même titre normalisé)
      const normTitle = (orb.title || '').toLowerCase().trim();
      const dup = (state.profile.userOrbs || []).some(o => o.kind === orb.kind && (o.title || '').toLowerCase().trim() === normTitle);
      if (dup) { showToast('⚠️', 'Déjà ajoutée', orb.title); return; }
      state.profile.userOrbs.push(orb);
      _pendingSpotifyOrb = null;
      input.value = '';
      closeSugg();
      save();
      renderUserOrbs();
      refreshAccountPreview();
      showToast(({music:'🎵',anime:'📺',game:'🎮',film:'🎬'}[orb.kind]||'✨'), 'Bulle ajoutée', orb.title);
    }

    // Free-text adding is disabled — orbs can only be created by clicking a suggestion
    document.getElementById('accOrbAdd')?.addEventListener('click', () => {
      showToast('🔎', 'Choisis dans la liste', 'Clique sur une suggestion pour créer une bulle');
      document.getElementById('accOrbInput').focus();
    });
    document.getElementById('accOrbInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#spotifySugg .sp-item');
        if (first) first.dispatchEvent(new MouseEvent('mousedown'));
        else showToast('🔎', 'Choisis dans la liste', 'Aucune suggestion à valider');
      }
    });

    /* Games that have a ranked / competitive ladder → we ask the user which
       rank they're at when they add the bubble. The rank shows as a small
       badge on the orb and on the profile card. */
    /* Unified ranking strategy : main tiers as a single label, then the
       TWO LAST tiers BEFORE the apex get sub-divisions (1/2/3), then the apex.
       Example Valorant: Iron, …, Diamond, Ascendant 1/2/3, Immortal 1/2/3, Radiant. */
    function _ranksWithTopSubTiers(base, apex) {
      const out = [];
      const lastTwoStart = Math.max(0, base.length - 2);
      for (let i = 0; i < base.length; i++) {
        if (i >= lastTwoStart) {
          for (const n of [1,2,3]) out.push(`${base[i]} ${n}`);
        } else {
          out.push(base[i]);
        }
      }
      if (apex) out.push(apex);
      return out;
    }
    const RANKED_GAMES = {
      'Valorant':                       _ranksWithTopSubTiers(['Iron','Bronze','Silver','Gold','Platinum','Diamond','Ascendant','Immortal'], 'Radiant'),
      'League of Legends':              _ranksWithTopSubTiers(['Iron','Bronze','Silver','Gold','Platinum','Emerald','Diamond','Master','Grandmaster'], 'Challenger'),
      'Counter-Strike 2':               _ranksWithTopSubTiers(['Silver','Gold Nova','Master Guardian','DMG','LE','LEM','Supreme','Global Elite'], 'Premier'),
      'Rocket League':                  _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Champion','Grand Champion'], 'Supersonic Legend'),
      'Apex Legends':                   _ranksWithTopSubTiers(['Rookie','Bronze','Silver','Gold','Platinum','Diamond','Master'], 'Apex Predator'),
      'Overwatch 2':                    _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Master','Grandmaster'], 'Top 500'),
      "Tom Clancy's Rainbow Six Siege": _ranksWithTopSubTiers(['Copper','Bronze','Silver','Gold','Platinum','Emerald','Diamond'], 'Champion'),
      'Dota 2':                         _ranksWithTopSubTiers(['Herald','Guardian','Crusader','Archon','Legend','Ancient','Divine'], 'Immortal'),
      'Fortnite':                       _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Elite','Champion'], 'Unreal'),
      'PUBG: Battlegrounds':            _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Crown','Ace'], 'Master'),
      'Marvel Rivals':                  _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Grandmaster','Celestial','Eternity'], 'One Above All'),
      'Call of Duty: Warzone':          _ranksWithTopSubTiers(['Bronze','Silver','Gold','Platinum','Diamond','Crimson','Iridescent'], 'Top 250'),
      'Mortal Kombat 1':                _ranksWithTopSubTiers(['Apprentice','Novice','Warrior','Kombatant','Elite','Champion','Demigod'], 'Elder God'),
      'Tekken 8':                       _ranksWithTopSubTiers(['Beginner','Vanquisher','Cavalry','Warrior','Fighter','Eliminator','Vindicator','Tekken King'], 'Tekken God'),
      'Street Fighter 6':               _ranksWithTopSubTiers(['Rookie','Iron','Bronze','Silver','Gold','Platinum','Diamond'], 'Master'),
    };
    function isRankedGame(title){ return !!RANKED_GAMES[title]; }

    /* Visuals for each rank tier : emoji-style icon + brand color.
       Used to render the rank as a small round bubble (not a text chip). */
    const RANK_VISUAL = {
      // Universal tiers
      'Iron':              { ico:'⚙', c1:'#7a7a7a', c2:'#3a3a3a' },
      'Copper':            { ico:'🟤', c1:'#cd7f32', c2:'#7a4818' },
      'Bronze':            { ico:'🥉', c1:'#cd7f32', c2:'#5c3a14' },
      'Silver':            { ico:'🥈', c1:'#d8d8d8', c2:'#6a6a6a' },
      'Gold':              { ico:'🥇', c1:'#ffd700', c2:'#8c6e0a' },
      'Gold Nova':         { ico:'🥇', c1:'#ffd700', c2:'#8c6e0a' },
      'Master Guardian':   { ico:'🛡', c1:'#5ce0ff', c2:'#1a3a5c' },
      'DMG':               { ico:'🛡', c1:'#5ce0ff', c2:'#1a3a5c' },
      'LE':                { ico:'🦅', c1:'#FF4FA0', c2:'#5c0e2a' },
      'LEM':               { ico:'🦅', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Platinum':          { ico:'💠', c1:'#5ce0ff', c2:'#14495c' },
      'Emerald':           { ico:'🟢', c1:'#3bff8c', c2:'#0e3a1f' },
      'Diamond':           { ico:'💎', c1:'#5ce0ff', c2:'#1a3a5c' },
      'Ascendant':         { ico:'🔱', c1:'#3bd17c', c2:'#0e3a1f' },
      'Master':            { ico:'👑', c1:'#C7A5FF', c2:'#4a1bc1' },
      'Immortal':          { ico:'⚔', c1:'#9c27b0', c2:'#3a0e5c' },
      'Radiant':           { ico:'✨', c1:'#fffacd', c2:'#8c7014' },
      'Grandmaster':       { ico:'👑', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Challenger':        { ico:'🏆', c1:'#FFD83D', c2:'#8c6e0a' },
      'Global Elite':      { ico:'⭐', c1:'#FFD83D', c2:'#8c6e0a' },
      'Supreme':           { ico:'⚔', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Premier':           { ico:'🎯', c1:'#9146FF', c2:'#2a0e5c' },
      // Apex / Overwatch / etc.
      'Apex Predator':     { ico:'🦅', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Top 500':           { ico:'⭐', c1:'#FFD83D', c2:'#8c6e0a' },
      'Top 250':           { ico:'⭐', c1:'#FFD83D', c2:'#8c6e0a' },
      'Rookie':            { ico:'🔰', c1:'#7a7a7a', c2:'#3a3a3a' },
      // Rocket League
      'Champion':          { ico:'🏆', c1:'#FFD83D', c2:'#8c6e0a' },
      'Grand Champion':    { ico:'👑', c1:'#C7A5FF', c2:'#4a1bc1' },
      'Supersonic Legend': { ico:'🚀', c1:'#FF4FA0', c2:'#5c0e2a' },
      // Fortnite / COD / R6
      'Elite':             { ico:'⭐', c1:'#3bff8c', c2:'#0e3a1f' },
      'Crimson':           { ico:'🔥', c1:'#ED4245', c2:'#5c1414' },
      'Iridescent':        { ico:'🌈', c1:'#FF7EB6', c2:'#5c0e3a' },
      'Unreal':            { ico:'⚡', c1:'#9146FF', c2:'#2a0e5c' },
      // Dota
      'Herald':            { ico:'🛡', c1:'#7a7a7a', c2:'#3a3a3a' },
      'Guardian':          { ico:'🛡', c1:'#cd7f32', c2:'#5c3a14' },
      'Crusader':          { ico:'⚔', c1:'#d8d8d8', c2:'#6a6a6a' },
      'Archon':            { ico:'🛡', c1:'#ffd700', c2:'#8c6e0a' },
      'Legend':            { ico:'⚔', c1:'#5ce0ff', c2:'#1a3a5c' },
      'Ancient':           { ico:'💎', c1:'#3bd17c', c2:'#0e3a1f' },
      'Divine':            { ico:'👑', c1:'#C7A5FF', c2:'#4a1bc1' },
      // PUBG
      'Crown':             { ico:'👑', c1:'#FFD83D', c2:'#8c6e0a' },
      'Ace':               { ico:'🎯', c1:'#9146FF', c2:'#2a0e5c' },
      // Marvel Rivals
      'Celestial':         { ico:'🌟', c1:'#FF7EB6', c2:'#5c0e3a' },
      'Eternity':          { ico:'♾', c1:'#9c27b0', c2:'#3a0e5c' },
      'One Above All':     { ico:'☀', c1:'#fffacd', c2:'#8c7014' },
      // MK / Tekken / SF
      'Apprentice':        { ico:'🌱', c1:'#7a7a7a', c2:'#3a3a3a' },
      'Novice':            { ico:'⚪', c1:'#cd7f32', c2:'#5c3a14' },
      'Warrior':           { ico:'⚔', c1:'#d8d8d8', c2:'#6a6a6a' },
      'Kombatant':         { ico:'🥊', c1:'#ffd700', c2:'#8c6e0a' },
      'Demigod':           { ico:'⚡', c1:'#9c27b0', c2:'#3a0e5c' },
      'Elder God':         { ico:'☠', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Beginner':          { ico:'🔰', c1:'#7a7a7a', c2:'#3a3a3a' },
      'Vanquisher':        { ico:'⚔', c1:'#cd7f32', c2:'#5c3a14' },
      'Cavalry':           { ico:'🐎', c1:'#d8d8d8', c2:'#6a6a6a' },
      'Fighter':           { ico:'🥊', c1:'#5ce0ff', c2:'#1a3a5c' },
      'Eliminator':        { ico:'🎯', c1:'#3bff8c', c2:'#0e3a1f' },
      'Vindicator':        { ico:'⚔', c1:'#FF4FA0', c2:'#5c0e2a' },
      'Tekken King':       { ico:'👑', c1:'#FFD83D', c2:'#8c6e0a' },
      'Tekken God':        { ico:'⚡', c1:'#fffacd', c2:'#8c7014' },
    };
    function rankVisual(rank){
      if (!rank) return null;
      // Try exact match first, then strip the sub-tier ("Platinum 2" → "Platinum")
      if (RANK_VISUAL[rank]) return RANK_VISUAL[rank];
      const base = String(rank).replace(/\s+\d+\s*$/, '');
      if (RANK_VISUAL[base]) return RANK_VISUAL[base];
      return { ico:'⭐', c1:'#FFD83D', c2:'#8c6e0a' };
    }

    /* Real rank icons (cropped from official rank charts). Keyed by game → rank → URL.
       When present, the orbiting rank bubble displays this image instead of an emoji. */
    /* Helper : Valorant has 3 sub-tiers per rank (Iron 1/2/3, Bronze 1/2/3, …) +
       Radiant. We expose every sub-tier individually so the rank picker can
       offer "Platinum 2" etc., and each gets its own cropped PNG. */
    function _valorantRanks(){
      const base = ['iron','bronze','silver','gold','platinum','diamond','ascendant','immortal'];
      const out = {};
      const CAP = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      for (const r of base) {
        // Canonical fallback (no sub-tier)
        out[CAP(r)] = `assets/ranks/valorant/${r}.png`;
        for (const n of [1,2,3]) out[`${CAP(r)} ${n}`] = `assets/ranks/valorant/${r}_${n}.png`;
      }
      out['Radiant'] = 'assets/ranks/valorant/radiant.png';
      return out;
    }
    const RANK_ICONS = {
      'Valorant': _valorantRanks(),
      'Fortnite': {
        'Bronze':   'assets/ranks/fortnite/bronze.png',
        'Silver':   'assets/ranks/fortnite/silver.png',
        'Gold':     'assets/ranks/fortnite/gold.png',
        'Platinum': 'assets/ranks/fortnite/platinum.png',
        'Diamond':  'assets/ranks/fortnite/diamond.png',
        'Elite':    'assets/ranks/fortnite/elite.png',
        'Champion': 'assets/ranks/fortnite/champion.png',
        'Unreal':   'assets/ranks/fortnite/unreal.png',
      },
      'Rocket League': {
        'Bronze':             'assets/ranks/rocket-league/bronze.png',
        'Silver':             'assets/ranks/rocket-league/silver.png',
        'Gold':               'assets/ranks/rocket-league/gold.png',
        'Platinum':           'assets/ranks/rocket-league/platinum.png',
        'Diamond':            'assets/ranks/rocket-league/diamond.png',
        'Champion':           'assets/ranks/rocket-league/champion.png',
        'Grand Champion':     'assets/ranks/rocket-league/grand_champion.png',
        'Supersonic Legend':  'assets/ranks/rocket-league/supersonic_legend.png',
      },
      'League of Legends': {
        'Iron':         'assets/ranks/league-of-legends/iron.png',
        'Bronze':       'assets/ranks/league-of-legends/bronze.png',
        'Silver':       'assets/ranks/league-of-legends/silver.png',
        'Gold':         'assets/ranks/league-of-legends/gold.png',
        'Platinum':     'assets/ranks/league-of-legends/platinum.png',
        'Emerald':      'assets/ranks/league-of-legends/emerald.png',
        'Diamond':      'assets/ranks/league-of-legends/diamond.png',
        'Master':       'assets/ranks/league-of-legends/master.png',
        'Grandmaster':  'assets/ranks/league-of-legends/grandmaster.png',
        'Challenger':   'assets/ranks/league-of-legends/challenger.png',
      },
    };
    function rankIconUrl(game, rank){
      if (!game || !rank) return null;
      const g = RANK_ICONS[game];
      if (!g) return null;
      // Try exact match first ("Platinum 2"), then strip the sub-tier ("Platinum")
      if (g[rank]) return g[rank];
      const base = String(rank).replace(/\s+\d+\s*$/, '');
      return g[base] || null;
    }

    /* Curated suggestion lists by category — used as the primary set of
       suggestions for game / anime / film bubbles. Covers are fetched on
       demand via Wikipedia (game / film) or Jikan (anime). */
    const ORB_SUGGESTIONS = {
      game: ["Minecraft","Valorant","Rocket League","Fortnite","League of Legends","Counter-Strike 2","Grand Theft Auto V","Roblox","Apex Legends","Call of Duty: Warzone","Overwatch 2","Tom Clancy's Rainbow Six Siege","Dota 2","PUBG: Battlegrounds","Genshin Impact","World of Warcraft","Final Fantasy XIV","Destiny 2","Honkai: Star Rail","Diablo IV","The Sims 4","Stardew Valley","Terraria","Among Us","Fall Guys","Marvel Rivals","Sea of Thieves","Dead by Daylight","Phasmophobia","Warframe","Path of Exile 2","Hearthstone","Magic: The Gathering Arena","Elden Ring","Cyberpunk 2077","Baldur's Gate 3","The Witcher 3: Wild Hunt","Red Dead Redemption 2","The Elder Scrolls V: Skyrim","EA Sports FC 24","NBA 2K24","Forza Horizon 5","Mortal Kombat 1","Tekken 8","Street Fighter 6","Lethal Company","Helldivers 2","Lost Ark","New World","Hogwarts Legacy"],
      film: ["One Piece","Naruto","Dragon Ball Z","Bleach","Hunter x Hunter","Attack on Titan","Jujutsu Kaisen","Demon Slayer","Chainsaw Man","My Hero Academia","Fullmetal Alchemist: Brotherhood","Death Note","JoJo's Bizarre Adventure","Vinland Saga","Spy x Family","Cowboy Bebop","Neon Genesis Evangelion","Steins;Gate","Code Geass","Haikyuu!!","Blue Lock","Re:Zero","Mob Psycho 100","Made in Abyss","Tokyo Ghoul","Fire Force","Black Clover","Frieren","Solo Leveling","Bocchi the Rock!","Spirited Away","Princess Mononoke","Howl's Moving Castle","My Neighbor Totoro","Your Name","Akira","Ghost in the Shell","Breaking Bad","Better Call Saul","The Wire","The Sopranos","Peaky Blinders","Dexter","True Detective","Fargo","Sons of Anarchy","Narcos","Ozark","Mindhunter","Prison Break","The Shield","Boardwalk Empire","The Night Of","Game of Thrones","House of the Dragon","Stranger Things","The X-Files","Black Mirror","The Twilight Zone","Doctor Who","Battlestar Galactica","The Expanse","Westworld","Dark","The Boys","The Umbrella Academy","Lost","Fringe","Foundation","Silo","The Office","Friends","Seinfeld","The Simpsons","South Park","Rick and Morty","It's Always Sunny in Philadelphia","Parks and Recreation","Brooklyn Nine-Nine","How I Met Your Mother","Arrested Development","Community","Curb Your Enthusiasm","Ted Lasso","The Good Place","Silicon Valley","The Godfather","Pulp Fiction","Fight Club","Inception","Interstellar","The Dark Knight","The Matrix","Star Wars: A New Hope","The Empire Strikes Back","Return of the Jedi","The Lord of the Rings: The Fellowship of the Ring","The Two Towers","The Return of the King","Jurassic Park","Terminator","Terminator 2: Judgment Day","Blade Runner","Alien","The Shawshank Redemption","Forrest Gump","Saving Private Ryan","Gladiator","Se7en","Shutter Island","Parasite","Spirited Away","The Silence of the Lambs","The Shining","Psycho","Casablanca","Citizen Kane","2001: A Space Odyssey","Apocalypse Now","Taxi Driver","Goodfellas","Reservoir Dogs","The Big Lebowski","No Country for Old Men","There Will Be Blood","Whiplash","Birdman","The Grand Budapest Hotel","The Truman Show","Eternal Sunshine of the Spotless Mind","Memento","Donnie Darko","A Clockwork Orange","Full Metal Jacket","Dr. Strangelove","Lord of War","American Psycho","Scarface","Heat","Casino","The Departed","Dunkirk","Oppenheimer","Tenet","The Prestige","Batman Begins","The Dark Knight Rises","Joker","Logan","Mad Max: Fury Road","Braveheart","Troy","Kingdom of Heaven","300","Sin City","Watchmen","V for Vendetta","Children of Men","District 9","Arrival","Gravity","The Martian","Ad Astra","Moon","Ex Machina","Her","Up","Wall-E","Ratatouille","Finding Nemo","The Incredibles","Toy Story","The Lion King","Aladdin","Beauty and the Beast","Princess Mononoke","Howl's Moving Castle","My Neighbor Totoro","Grave of the Fireflies","Your Name","Weathering With You","Suzume"],
    };
    /* Cache: kind+title -> coverUrl. Mirrored in localStorage so covers fetched
       in a previous session are instantly available — no Wikipedia/Wikidata round-trip. */
    const COVER_CACHE_KEY = 'matefindr_cover_cache_v3';
    /* Titres reconnus comme anime → on fetch via Jikan (artwork de qualité) au lieu
       de Wikipedia/Wikidata qui retournent souvent des posters moches ou des covers
       de tome 1 de manga. Liste à étendre quand on ajoute des animes dans ORB_SUGGESTIONS.film. */
    const ANIME_TITLES = new Set([
      'One Piece','Naruto','Dragon Ball Z','Bleach','Hunter x Hunter','Attack on Titan',
      'Jujutsu Kaisen','Demon Slayer','Chainsaw Man','My Hero Academia','Fullmetal Alchemist: Brotherhood',
      'Death Note',"JoJo's Bizarre Adventure",'Vinland Saga','Spy x Family','Cowboy Bebop',
      'Neon Genesis Evangelion','Steins;Gate','Code Geass','Haikyuu!!','Blue Lock','Re:Zero',
      'Mob Psycho 100','Made in Abyss','Tokyo Ghoul','Fire Force','Black Clover','Frieren',
      'Solo Leveling','Bocchi the Rock!','Spirited Away','Princess Mononoke',"Howl's Moving Castle",
      'My Neighbor Totoro','Your Name','Akira','Ghost in the Shell','Dragon Ball Super',
      'Hellsing Ultimate','Death Parade','Erased','Monster','Berserk','Psycho-Pass',
      'Parasyte: The Maxim','Future Diary','Another','The Promised Neverland','Hajime no Ippo',
      'Slam Dunk',"Kuroko's Basketball",'Your Lie in April','Clannad','Toradora','Golden Time',
      'Kaguya-sama: Love is War','Nichijou','Great Teacher Onizuka','Saiki K','March Comes in Like a Lion',
      'Trigun','Samurai Champloo','FLCL','Tengen Toppa Gurren Lagann','Mobile Suit Gundam',
      'Macross','Serial Experiments Lain','Paprika','Perfect Blue','Konosuba','Overlord',
      'That Time I Got Reincarnated as a Slime','Mushoku Tensei','Ranking of Kings',
      'Ping Pong the Animation','Kill la Kill','Devilman Crybaby','Dorohedoro','Golden Kamuy',
      'Nana','Fruits Basket','Ouran High School Host Club','Azumanga Daioh','Lucky Star',
      'K-On!','Cardcaptor Sakura','Sailor Moon','Pokemon','Digimon','Yu-Gi-Oh!','Inuyasha',
      'Ranma 1/2','Maison Ikkoku','City Hunter','Space Dandy','Soul Eater','Fairy Tail',
      'YuYu Hakusho','Seven Deadly Sins','Dr. Stone','Tokyo Revengers','Elfen Lied','Mushishi',
      "Junji Ito",'Studio Ghibli','Weathering With You','Suzume','Grave of the Fireflies',
    ]);
    const _suggCoverCache = (() => {
      try {
        const raw = localStorage.getItem(COVER_CACHE_KEY);
        if (raw) return new Map(Object.entries(JSON.parse(raw)));
      } catch (_){}
      return new Map();
    })();
    let _coverCachePersistTimer = null;
    function persistCoverCache(){
      clearTimeout(_coverCachePersistTimer);
      _coverCachePersistTimer = setTimeout(() => {
        try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(Object.fromEntries(_suggCoverCache))); } catch(_){}
      }, 800);
    }

    /* Wrap a Promise with a hard timeout — falls back to null if the network is slow,
       so the UI never freezes waiting for a single fetch. */
    function withTimeout(promise, ms){
      return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(null), ms)),
      ]);
    }

    async function wikiPageSummary(title){
      try {
        const r = await withTimeout(fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/\s/g, '_'))), 2500);
        if (!r || !r.ok) return null;
        const d = await r.json();
        return d.thumbnail?.source || d.originalimage?.source || null;
      } catch { return null; }
    }
    /* Wikipedia → Wikidata QID (e.g. "Minecraft" → "Q49740") */
    async function wikiWikibaseId(title){
      try {
        const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=' + encodeURIComponent(title) + '&format=json&origin=*';
        const r = await withTimeout(fetch(url), 2500);
        if (!r || !r.ok) return null;
        const d = await r.json();
        const pages = d.query?.pages;
        if (!pages) return null;
        const first = Object.values(pages)[0];
        return first?.pageprops?.wikibase_item || null;
      } catch { return null; }
    }
    /* Wikidata claim → image. Tries each property in order (P154=logo, P18=image, P2716=collage). */
    async function wikidataImage(qid, props){
      if (!qid) return null;
      try {
        const r = await withTimeout(fetch('https://www.wikidata.org/wiki/Special:EntityData/' + qid + '.json'), 2500);
        if (!r || !r.ok) return null;
        const d = await r.json();
        const claims = d.entities?.[qid]?.claims;
        if (!claims) return null;
        for (const p of props) {
          const filename = claims?.[p]?.[0]?.mainsnak?.datavalue?.value;
          if (filename) {
            return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(filename) + '?width=400';
          }
        }
        return null;
      } catch { return null; }
    }
    /* High-level: title → image via Wikidata logo (preferred for games) or image (preferred for films). */
    async function wikidataCover(title, props){
      let qid = await wikiWikibaseId(title);
      if (qid) {
        const img = await wikidataImage(qid, props);
        if (img) return img;
      }
      return null;
    }
    /* Detect images with a transparent background.
       Strict mode : ANY pixel along the outer ring with alpha < 252 = transparent.
       Tainted canvas (CORS denied) → treat as transparent (safer for the "no transparency" rule). */
    async function imageHasTransparency(url){
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const TIMEOUT = setTimeout(() => resolve(true), 5000); // timeout → safer to skip
        img.onload = () => {
          clearTimeout(TIMEOUT);
          try {
            const canvas = document.createElement('canvas');
            const w = canvas.width = 64, h = canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            // Sample the full outer ring (top row, bottom row, left col, right col)
            // Plus 1px inset to catch images with a tiny border.
            let transparentCount = 0;
            const sampleAlpha = (x, y) => data[(y * w + x) * 4 + 3];
            for (let i = 0; i < w; i++) {
              if (sampleAlpha(i, 0)   < 252) transparentCount++;
              if (sampleAlpha(i, h-1) < 252) transparentCount++;
              if (sampleAlpha(i, 1)   < 252) transparentCount++;
              if (sampleAlpha(i, h-2) < 252) transparentCount++;
            }
            for (let j = 1; j < h-1; j++) {
              if (sampleAlpha(0, j)   < 252) transparentCount++;
              if (sampleAlpha(w-1, j) < 252) transparentCount++;
              if (sampleAlpha(1, j)   < 252) transparentCount++;
              if (sampleAlpha(w-2, j) < 252) transparentCount++;
            }
            // Total samples ≈ 4*w + 4*(h-2) = 4*64 + 4*62 = 504
            // If >5% have transparency, it's a transparent-bg image
            resolve(transparentCount > 25);
          } catch {
            // CORS-tainted canvas → can't read pixels → safer to skip this image
            resolve(true);
          }
        };
        img.onerror = () => { clearTimeout(TIMEOUT); resolve(true); };
        img.src = url;
      });
    }
    /* Manual overrides for specific games — used when Wikidata only has a
       transparent logo or a bad asset. Either a forced URL, or "logo:true" to
       accept a transparent logo for that game (e.g. Dead by Daylight). */
    const GAME_COVER_OVERRIDES = {
      // Custom covers (local assets) — replace each entry as we get the artwork
      'Minecraft': 'assets/games/minecraft.png',
      'Valorant':  'assets/games/valorant.png',
      'Rocket League': 'assets/games/rocket-league.webp',
      'Fortnite': 'assets/games/fortnite.png',
      'League of Legends': 'assets/games/league-of-legends.png',
      'Counter-Strike 2': 'assets/games/counter-strike-2.png',
      'Grand Theft Auto V': 'assets/games/gta-v.png',
      'Roblox': 'assets/games/roblox.png',
      'Apex Legends': 'assets/games/apex-legends.png',
      'Call of Duty: Warzone': 'assets/games/warzone.png',
      'Overwatch 2': 'assets/games/overwatch-2.png',
      "Tom Clancy's Rainbow Six Siege": 'assets/games/r6-siege.png',
      'Dota 2': 'assets/games/dota-2.png',
      'PUBG: Battlegrounds': 'assets/games/pubg.webp',
      'Genshin Impact': 'assets/games/genshin-impact.png',
      'Dead by Daylight': { logo: true }, // allow transparent logo
    };

    /* Quickly verifies an image URL loads (HEAD + size > 0). Returns true if usable. */
    async function imageLoads(url){
      return new Promise(resolve => {
        const img = new Image();
        const TIMEOUT = setTimeout(() => resolve(false), 4000);
        img.onload = () => { clearTimeout(TIMEOUT); resolve(img.naturalWidth > 0); };
        img.onerror = () => { clearTimeout(TIMEOUT); resolve(false); };
        img.src = url;
      });
    }

    /* Try Wikidata cover variants for games and pick the best image.
       Strategy: prefer opaque, but ALWAYS return something if available
       (fallback to transparent/logo). */
    /* iTunes Search — rapide (200-400ms) et fiable pour les jeux populaires (Minecraft,
       Fortnite, Among Us, Roblox, etc.). Retourne une image opaque carrée 512x512. */
    async function itunesGameCover(title){
      try {
        const r = await fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(title) + '&entity=software&limit=3');
        const d = await r.json();
        if (!d.results || !d.results.length) return null;
        // Prend le 1er résultat dont le nom matche raisonnablement
        const q = title.toLowerCase();
        const best = d.results.find(it => (it.trackName || '').toLowerCase().includes(q)) || d.results[0];
        // artworkUrl100 → 512x512 pour une meilleure qualité
        return (best.artworkUrl512 || best.artworkUrl100 || '').replace(/\/100x100bb\.(jpg|png)$/, '/512x512bb.$1');
      } catch { return null; }
    }

    async function gameCoverOpaque(title){
      // Manual override (forced URL) — verify it loads before using
      const ovr = GAME_COVER_OVERRIDES[title];
      if (ovr && typeof ovr === 'string') {
        if (await imageLoads(ovr)) return ovr;
      }
      const allowLogo = !!(ovr && ovr.logo);

      // === Premier essai : iTunes (rapide, opaque, fiable) ===
      const itu = await itunesGameCover(title);
      if (itu && await imageLoads(itu)) return itu;

      // === Fallback : Wikidata (plus lent, plus de couverture) ===
      const qid = await wikiWikibaseId(title);
      if (!qid) return null;
      const props = ['P18', 'P154', 'P2716'];
      let firstAny = null;
      for (const p of props){
        const url = await wikidataImage(qid, [p]);
        if (!url) continue;
        if (!firstAny) firstAny = url;
        // SVG : always transparent. If not allowed → only used as last-resort fallback.
        if (/\.svg(\?|$)/i.test(url) && !allowLogo) continue;
        const transparent = await imageHasTransparency(url);
        if (!transparent) return url;
      }
      // No opaque image found — fall back to whatever we have (even transparent)
      return firstAny;
    }

    async function fetchSuggCover(kind, title){
      const k = kind + ':' + title;
      if (_suggCoverCache.has(k)) return _suggCoverCache.get(k);
      let cover = null;
      try {
        if (kind === 'anime') {
          const r = await searchAnime(title);
          cover = (r && r[0] && r[0].cover) || null;
          if (!cover) cover = await wikidataCover(title, ['P154', 'P18']);
          if (!cover) cover = await wikidataCover(title + ' (anime)', ['P154', 'P18']);
        } else if (kind === 'game') {
          // Try opaque cover first (skip transparent / SVG)
          cover = await gameCoverOpaque(title);
          if (!cover) cover = await gameCoverOpaque(title + ' (video game)');
          // Fallback REST thumbnail if nothing opaque found
          if (!cover) cover = await wikiPageSummary(title);
        } else if (kind === 'film') {
          // For known anime titles, prefer Jikan (much better artwork than Wikipedia)
          if (ANIME_TITLES.has(title)) {
            const r = await searchAnime(title);
            cover = (r && r[0] && r[0].cover) || null;
            if (!cover) {
              const r2 = await searchAnime(title + ' anime');
              cover = (r2 && r2[0] && r2[0].cover) || null;
            }
            if (!cover) cover = await wikidataCover(title + ' (anime)', ['P18', 'P154']);
            if (!cover) cover = await wikidataCover(title, ['P18', 'P154']);
          } else {
            // Real films / TV series : Wikipedia/Wikidata first
            cover = await wikidataCover(title, ['P18', 'P154']);
            if (!cover) cover = await wikidataCover(title + ' (film)', ['P18', 'P154']);
            if (!cover) cover = await wikidataCover(title + ' (TV series)', ['P18', 'P154']);
            if (!cover) cover = await wikiPageSummary(title);
            // Last resort : maybe it's actually an anime we don't know about
            if (!cover) {
              const r = await searchAnime(title);
              cover = (r && r[0] && r[0].cover) || null;
            }
          }
        }
      } catch {}
      _suggCoverCache.set(k, cover);
      persistCoverCache();
      return cover;
    }
    function curatedMatches(query, kind, limit){
      const arr = ORB_SUGGESTIONS[kind] || [];
      const q = (query || '').toLowerCase().trim();
      if (!q) return arr.slice(0, limit);
      const starts = [], contains = [];
      for (const t of arr) {
        const lt = t.toLowerCase();
        if (lt.startsWith(q)) starts.push(t);
        else if (lt.includes(q)) contains.push(t);
        if (starts.length + contains.length >= limit + 4) break;
      }
      return starts.concat(contains).slice(0, limit);
    }

    /* Live search dropdown — kind-aware (Spotify / Jikan / Wikipedia) */
    /* Render the suggestions panel from a normalized results array.
       Items pending cover are dimmed and labelled "...". A click on an item
       ensures a cover is fetched before adding — no cover = no bulle. */
    async function ensureCoverThenAdd(r, kind){
      if (isOrbKindSoon(kind)) { showOrbKindSoonToast(); return; }
      let cover = r.cover;
      if (!cover && (kind === 'game' || kind === 'film' || kind === 'anime')) {
        cover = await fetchSuggCover(kind, r.orb.title);
      }
      if (!cover) {
        showToast('⚠️', 'Pas d\'image trouvée', 'Choisis un autre titre');
        return;
      }
      r.cover = cover; r.orb.cover = cover;
      document.getElementById('accOrbInput').value = r.orb.title;
      addOrb(r.orb);
    }

    function renderOrbSugg(results, kind){
      const sugg = document.getElementById('spotifySugg');
      const fallbackIcon = {music:'🎵', anime:'📺', game:'🎮', film:'🎬'}[kind] || '✨';
      sugg.innerHTML = '';
      results.forEach((r, idx) => {
        const item = document.createElement('div');
        item.className = 'sp-item' + (r.cover ? '' : ' sp-item--loading');
        item.dataset.suggIdx = String(idx);
        item.innerHTML =
          (r.cover ? `<img src="${r.cover}" alt="" loading="lazy" decoding="async">` : `<div class="sp-no-cover">${fallbackIcon}</div>`) +
          `<div class="sp-info"><div class="sp-title">${escapeHtmlMini(r.name)}</div>` +
          `<div class="sp-artist">${escapeHtmlMini(r.sub || '')}</div></div>`;
        item.addEventListener('mousedown', ev => {
          ev.preventDefault();
          ensureCoverThenAdd(r, kind);
        });
        sugg.appendChild(item);
      });
      sugg.classList.add('open');
    }

    /* Lazy-fetch covers for curated suggestions (game/anime/film). */
    async function hydrateCuratedCovers(results, kind, requestId){
      const sugg = document.getElementById('spotifySugg');
      for (let i = 0; i < results.length; i++) {
        if (requestId !== _suggReqId) return; // newer query started
        const r = results[i];
        if (r.cover) continue;
        const cover = await fetchSuggCover(kind, r.orb.title);
        if (requestId !== _suggReqId) return;
        const item = sugg.querySelector(`.sp-item[data-sugg-idx="${i}"]`);
        if (cover) {
          r.cover = cover; r.orb.cover = cover;
          if (item) {
            const ph = item.querySelector('.sp-no-cover');
            if (ph) ph.outerHTML = `<img src="${cover}" alt="">`;
            item.classList.remove('sp-item--loading');
          }
        } else if (item) {
          // No cover available — visually mark and disable
          item.classList.remove('sp-item--loading');
          item.classList.add('sp-item--unavailable');
        }
      }
    }

    let _suggReqId = 0;
    async function runOrbSearch(val){
      const reqId = ++_suggReqId;
      const sugg = document.getElementById('spotifySugg');
      const kind = selectedOrbKind;

      if (isOrbKindSoon(kind)) { closeSugg(); return; }

      if (kind === 'music') {
        if (val.length < 2) { closeSugg(); return; }
        const tracks = await searchSpotifyTracks(val);
        if (reqId !== _suggReqId) return;
        const results = tracks
          .filter(t => t.previewUrl && t.cover)
          .map(t => ({ name:t.name, sub:t.artist, cover:t.cover,
            orb:{kind:'music', title:t.name+' · '+t.artist, previewUrl:t.previewUrl, cover:t.cover}}));
        if (!results.length) { closeSugg(); return; }
        renderOrbSugg(results, kind);
        return;
      }

      // game / anime / film : ONLY curated list (no Wikipedia/API fallback to avoid
      // geographic places etc. polluting the suggestions).
      const titles = curatedMatches(val, kind, 30);
      const results = titles.map(t => ({
        name: t, sub: '', cover: null,
        orb: { kind, title: t, cover: null },
      }));
      if (results.length) {
        renderOrbSugg(results, kind);
        hydrateCuratedCovers(results, kind, reqId);
      } else {
        closeSugg();
      }
    }

    document.getElementById('accOrbInput')?.addEventListener('input', e => {
      _pendingSpotifyOrb = null;
      const val = e.target.value.trim();
      clearTimeout(_suggDebounce);
      _suggDebounce = setTimeout(() => runOrbSearch(val), selectedOrbKind === 'music' ? 320 : 80);
    });
    /* Show curated suggestions immediately on focus (empty input → top of list) */
    document.getElementById('accOrbInput')?.addEventListener('focus', () => {
      if (selectedOrbKind === 'music') return;
      const val = document.getElementById('accOrbInput').value.trim();
      runOrbSearch(val);
    });
    document.getElementById('accOrbInput')?.addEventListener('blur', () => setTimeout(closeSugg, 200));

    // ---------- Account screen ----------
    function renderAccount(){
      // Always reset to Profil tab on (re)entry — previously left tab state would
      // bleed across screen transitions and look like a render bug.
      const card = document.querySelector('#screen-account .acc-card');
      // L'écran compte/paramètres a été retiré (les réglages sont dans l'éditeur).
      if (!card) return;
      card.setAttribute('data-current-tab', 'infos');
      document.querySelectorAll('#accTabs .acc-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'infos'));
      document.querySelectorAll('#screen-account .acc-tab').forEach(p => { p.hidden = (p.dataset.tab !== 'infos'); });
      if (typeof refreshBillingUI === 'function') refreshBillingUI();
      const u = state.user || {};
      const p = state.profile || {};
      document.getElementById('accName').textContent = u.displayName || u.email || 'Matefindr user';
      document.getElementById('accHandle').textContent = u.discordTag ? '@' + u.discordTag : (u.email || '—');
      const avi = document.getElementById('accAvatar');
      if (u.avatarUrl) {
        avi.innerHTML = `<img src="${u.avatarUrl}" alt="${u.displayName || ''}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`;
        avi.style.background = 'none';
        avi.style.color = 'transparent';
        avi.style.fontSize = '0';
      } else {
        avi.innerHTML = '';
        avi.textContent = (u.displayName || u.email || 'T').charAt(0).toUpperCase();
        avi.style.background = 'linear-gradient(135deg,#FF7EB6,#9146FF)';
        avi.style.color = '#fff';
        avi.style.fontSize = '';
      }
      // Sync l'avatar visible dans le hero du nouveau layout
      if (typeof refreshHeroAvatar === 'function') refreshHeroAvatar();
      document.getElementById('accGender').textContent  = ({ il:'Il', elle:'Elle', autre:'Préciser / Autre', male:'Il', female:'Elle', nonbinary:'Iel', other:'Autre' }[p.gender] || '—');
      const _accAgeEl = document.getElementById('accAge');
      const _ccAcc = (p.country && /^[A-Z]{2}$/i.test(p.country)) ? p.country.toUpperCase() : null;
      _accAgeEl.innerHTML = (p.age ? p.age : '—') + (_ccAcc ? `  <img src="https://flagcdn.com/${_ccAcc.toLowerCase()}.svg" alt="${_ccAcc}" style="width:22px;height:16px;object-fit:cover;border-radius:3px;vertical-align:-3px;margin-left:4px">` : (p.countryFlag ? '  ' + p.countryFlag : ''));
      const vol = (window.MatefindrVolume && window.MatefindrVolume.normalizeVol)
        ? window.MatefindrVolume.normalizeVol(u.musicVolume)
        : (typeof u.musicVolume === 'number' ? u.musicVolume : DEFAULT_MUSIC_VOL);
      const volSlider = document.getElementById('musicVolume');
      if (volSlider) { volSlider.value = Math.round(vol * 100); document.getElementById('musicVolVal').textContent = Math.round(vol * 100) + '%'; }
      if (typeof window.__mfVolRefresh === 'function') window.__mfVolRefresh();
      const startSec = typeof u.musicStartTime === 'number' ? u.musicStartTime : 0;
      const startSlider = document.getElementById('musicStartTime');
      if (startSlider) { startSlider.value = startSec; document.getElementById('musicStartVal').textContent = startSec + 's'; }
      document.getElementById('accPseudo').value  = u.displayName || '';
      document.getElementById('accBio').value     = p.bio || '';
      document.getElementById('accLookSel').value = p.looking || 'game';
      renderUserOrbs();
      refreshBoostUI();
      if (typeof window.__refreshBannerPrev === 'function') window.__refreshBannerPrev();
      if (typeof window.__refreshDecoPicker === 'function') window.__refreshDecoPicker();
      if (typeof window.__hydrateDiscordNotifs === 'function') window.__hydrateDiscordNotifs();
      // Hydrate color wheels from state
      const cw1 = document.getElementById('accProfileColor');
      const cw2 = document.getElementById('accProfileColor2');
      if (cw1) cw1.value = (u.profileColor && /^#[0-9a-f]{6}$/i.test(u.profileColor)) ? u.profileColor : '#36393F';
      if (cw2) cw2.value = (u.profileColor2 && /^#[0-9a-f]{6}$/i.test(u.profileColor2)) ? u.profileColor2 : '#2F3136';
      // Update "Mes bulles" CTA counter
      if (typeof window.__refreshBullesCta === 'function') window.__refreshBullesCta();
      const s = u.socials || {};
      document.getElementById('socIg').value = s.instagram || '';
      document.getElementById('socTt').value = s.tiktok    || '';
      document.getElementById('socSp').value = s.spotify   || '';
      [['Ig','instagram'],['Tt','tiktok'],['Sp','spotify']].forEach(([k,key]) => {
        const btn = document.getElementById('soc' + k + 'Btn');
        const has = !!(s[key]);
        btn.textContent = has ? tx('connected') : tx('connect');
        btn.classList.toggle('connected', has);
      });
      const cur = (document.documentElement.lang || 'fr').toUpperCase();
      document.querySelectorAll('#accLangs button').forEach(b => b.classList.toggle('active', b.dataset.val === cur));
      refreshAccountPreview();
      if (typeof MFUpgradeColorInputs === 'function') MFUpgradeColorInputs(card);
      // Reset dirty-state snapshot after fresh render
      if (typeof window.__resetSaveSnapshot === 'function') window.__resetSaveSnapshot();
    }
    function refreshAccountPreview(){
      const wrap = document.getElementById('accPreview');
      if (!wrap) return;
      // Sync transient form values into state so buildUserProfile picks them up
      const pseudoEl = document.getElementById('accPseudo');
      const bioEl    = document.getElementById('accBio');
      state.user = state.user || {};
      state.profile = state.profile || {};
      if (pseudoEl && pseudoEl.value.trim()) state.user.displayName = pseudoEl.value.trim();
      if (bioEl) state.profile.bio = bioEl.value.trim();
      const myP = (typeof buildUserProfile === 'function') ? buildUserProfile() : null;
      if (!myP) return;
      // Render a non-draggable mini swipe-card
      wrap.innerHTML = '';
      const card = buildCard(myP, false);
      // Strip the "background card" styling (opacity, scale, etc.)
      card.style.cssText += ';position:relative !important;inset:auto !important;opacity:1 !important;transform:none !important;cursor:default !important;pointer-events:auto';
      card.classList.add('preview-mode');
      wrap.appendChild(card);
    }
    ['accPseudo','accBio','accLookSel'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input',  refreshAccountPreview);
      el.addEventListener('change', refreshAccountPreview);
    });
    /* Aperçu : ouvre le swipe sur UNE carte figée (bulles + GIFs + fond rendus en
       vrai) → AUCUN swipe, un seul bouton "Quitter l'aperçu". Sans argument, montre
       SA PROPRE carte (comportement historique, depuis les Paramètres/l'éditeur) ;
       avec un profil, montre CE profil-là (ex: ouvert depuis un chat ou la liste
       "qui t'a liké" — voir openProfilePreview). */
    function enterPreviewMode(profile){
      // Relit matefindr_state À CHAUD juste avant d'afficher l'aperçu : si cet
      // onglet est resté ouvert un moment (ou a été rouvert), `state` en mémoire
      // peut être périmé par rapport à ce que l'éditeur vient d'enregistrer
      // (ex : preset actif changé) → sans ce refresh, l'aperçu pouvait montrer
      // un ancien preset au lieu de celui qu'on vient de quitter. Inutile pour
      // le profil D'UN TIERS (rien à re-synchroniser depuis MON état local).
      if (!profile) { try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch(_){} }
      // Nettoyage défensif : l'aperçu ne doit JAMAIS afficher un profil venu
      // d'un lien de partage (sinon on se retrouve avec l'URL /<slug> et les
      // boutons like/dislike au lieu de "Quitter l'aperçu"). Idem pour l'attribut
      // data-shared : s'il restait posé (lien perso visité plus tôt dans la même
      // session, jamais nettoyé car finishShared() n'a pas été appelé), le cœur du
      // lien perso (sharedHeartBtn) apparaissait par-dessus l'aperçu "Mon profil".
      _sharedProfile = null;
      document.body.removeAttribute('data-shared');
      document.body.removeAttribute('data-shared-own');
      _previewMode = true;
      _previewProfile = profile || null;
      // Aperçu D'UN TIERS (chat/qui-t'a-liké) : "Quitter" doit revenir là où on
      // était (menu, ou swipe au même profil), PAS toujours au hub -- contrairement
      // à l'aperçu de SA PROPRE carte (depuis les Paramètres), dont "Quitter" a
      // toujours renvoyé au hub volontairement (voir plus bas).
      _previewReturn = profile ? { screen: document.body.getAttribute('data-screen'), deckIdx } : null;
      document.body.setAttribute('data-preview', 'true');
      deckIdx = 0;
      if (typeof setScreen === 'function') setScreen('swipe');
    }
    // Bouton legacy de l'ancien écran compte ; le vrai déclencheur est le retour de
    // l'éditeur avec #preview (géré dans handleEditorReturn plus bas).
    document.getElementById('accPreviewFull')?.addEventListener('click', enterPreviewMode);
    document.getElementById('previewExitBtn')?.addEventListener('click', () => {
      // Aperçu de ton propre lien perso (matefindr.com/<slug> en étant connecté)
      if (document.body.getAttribute('data-shared-own') === 'true' && typeof finishShared === 'function') {
        finishShared();
        return;
      }
      // Signal robuste posé par l'éditeur avant la navigation (survit aux races
      // entre onLogin/handleEditorReturn, contrairement à la variable JS seule).
      let fromEditor = _previewFromEditor;
      try { if (sessionStorage.getItem('mf_from_editor') === '1') fromEditor = true; } catch(_){}
      if (fromEditor) {
        // Aperçu ouvert depuis l'éditeur → "Quitter" doit y retourner, pas au hub.
        // On navigue IMMÉDIATEMENT, SANS toucher à _previewMode/data-preview : les
        // retirer ici ré-affiche pour quelques frames le vrai deck de swipe (les
        // autres profils, boutons like/dislike) pendant que la page se décharge —
        // un flash visible avant d'atterrir sur editor.html.
        _previewFromEditor = false;
        try { sessionStorage.removeItem('mf_from_editor'); } catch(_){}
        location.href = 'editor.html';
        return;
      }
      _previewMode = false;
      _previewProfile = null;
      _sharedProfile = null;
      document.body.removeAttribute('data-preview');
      const ret = _previewReturn; _previewReturn = null;
      if (ret && ret.screen && ret.screen !== 'swipe') {
        // Aperçu d'un profil tiers ouvert depuis un autre écran (menu…) → on y revient.
        if (typeof setScreen === 'function') setScreen(ret.screen);
      } else {
        // Pas d'info de retour (aperçu de SA PROPRE carte, depuis les Paramètres) →
        // comportement historique : toujours le hub, jamais les Paramètres. Aperçu
        // d'un tiers ouvert DEPUIS le hub → même hub, mais reposé sur le MÊME profil
        // qu'avant (pas remis à zéro sur le premier de la liste).
        if (typeof setScreen === 'function') setScreen('swipe');
        if (ret && typeof ret.deckIdx === 'number') {
          deckIdx = ret.deckIdx;
          if (typeof ensureDeckSync === 'function') ensureDeckSync();
        }
      }
    });
    // Pseudo → met à jour le titre du header en live
    document.getElementById('accPseudo')?.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      if (v) document.getElementById('accName').textContent = v;
    });
    // Social connect buttons
    function bindSocial(btnId, inputId, key){
      const btn = document.getElementById(btnId), input = document.getElementById(inputId);
      if (!btn || !input) return;
      btn.addEventListener('click', () => {
        const v = input.value.trim().replace(/^@/, '');
        state.user = state.user || {};
        state.user.socials = state.user.socials || {};
        if (state.user.socials[key]) {
          delete state.user.socials[key];
          input.value = '';
          btn.textContent = tx('connect');
          btn.classList.remove('connected');
        } else if (v) {
          if (orbsUsed() >= orbBudget()) { showToast('🫧', 'Limite atteinte', orbBudget() + ' bulles max — Boost pour +12'); return; }
          state.user.socials[key] = v;
          btn.textContent = tx('connected');
          btn.classList.add('connected');
        }
        save();
        renderUserOrbs();
      });
    }
    bindSocial('socIgBtn', 'socIg', 'instagram');
    bindSocial('socTtBtn', 'socTt', 'tiktok');
    bindSocial('socSpBtn', 'socSp', 'spotify');

    /* ===== Boost: Fake Nitro toggle ===== */
    /* Account tabs */
    document.querySelectorAll('#accTabs .acc-tab-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#accTabs .acc-tab-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const t = b.dataset.tab;
        document.querySelectorAll('#screen-account .acc-tab').forEach(p => {
          p.hidden = (p.dataset.tab !== t);
        });
        // Track current tab on acc-card for identity panel visibility
        const card = document.querySelector('#screen-account .acc-card');
        if (card) card.setAttribute('data-current-tab', t);
      });
    });

    function _toggleBoostBannerField(show){
      const f = document.getElementById('boostBannerField');
      if (f) f.hidden = !show;
      const d = document.getElementById('boostDiscordDecoField');
      if (d) d.hidden = !show;
      const panel = document.getElementById('fnPanel');
      if (panel) panel.classList.toggle('is-on', !!show);  // glow + révèle le corps du panneau
    }
    document.getElementById('boostFakeNitro')?.addEventListener('change', e => {
      state.user = state.user || {};
      state.user.fakeNitro = e.target.checked;
      save();
      _toggleBoostBannerField(e.target.checked);  // affiche/masque Bannière + Déco d'avatar
      if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
      if (typeof ensureDeck === 'function' && document.body.getAttribute('data-screen') === 'swipe') ensureDeck();
      showToast('👑', e.target.checked ? 'Fake Nitro activé' : 'Fake Nitro désactivé', 'Bannière + déco d\'avatar');
    });
    // Init banner visibility from state on load
    setTimeout(() => {
      const tg = document.getElementById('boostFakeNitro');
      _toggleBoostBannerField(!!(tg && tg.checked));
    }, 0);

    /* ===== Boost: afficher / masquer le badge Boost sur le pseudo ===== */
    const _boostShowNameTg = document.getElementById('boostShowName');
    if (_boostShowNameTg) _boostShowNameTg.addEventListener('change', e => {
      if (!state.user || !state.user.boost) { e.target.checked = true; openBoostModal(); return; }
      state.user.boostShowName = e.target.checked;
      save();
      if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
      if (typeof ensureDeck === 'function' && document.body.getAttribute('data-screen') === 'swipe') ensureDeck();
      showToast('👑', e.target.checked ? 'Badge Boost affiché' : 'Badge Boost masqué', 'Apparence de ton pseudo');
    });

    /* ===== Boost: Fond d'écran personnalisé ===== */
    function ensureCustomBgLayer(){
      let l = document.getElementById('customBgLayer');
      if (!l) { l = document.createElement('div'); l.id = 'customBgLayer'; document.body.insertBefore(l, document.body.firstChild); }
      return l;
    }
    // Fond perso = un multiple FIXE de la taille de LA CARTE, centré dessus (pas le viewport
    // entier) -> il scale avec la carte, donc avec tout le reste (bulles/gifs/photos déjà en
    // % de la carte) : fond + carte + bulles + GIFs/photos bougent ENSEMBLE, comme un seul
    // bloc, à n'importe quelle résolution/ratio de fenêtre — bandes vides sur les côtés plutôt
    // qu'un fond qui se recadre différemment tout seul (object-fit:cover plein viewport).
    const BG_SCALE_W = 5.5, BG_SCALE_H = 2.0;
    function positionCustomBgLayer(){
      const layer = document.getElementById('customBgLayer');
      if (!layer || !layer.classList.contains('on')) return;
      const wrap = document.getElementById('swipeWrap');
      if (!wrap) return;
      const card = wrap.getBoundingClientRect();
      const cx = card.left + card.width / 2, cy = card.top + card.height / 2;
      const bw = card.width * BG_SCALE_W, bh = card.height * BG_SCALE_H;
      layer.style.left = (cx - bw / 2) + 'px';
      layer.style.top = (cy - bh / 2) + 'px';
      layer.style.width = bw + 'px';
      layer.style.height = bh + 'px';
    }
    let _customBgResize = null;
    if (!_customBgResize) {
      _customBgResize = () => positionCustomBgLayer();
      window.addEventListener('resize', _customBgResize);
    }
    function applyBgChoice(bg, pos){
      const picker = document.getElementById('bgPicker');
      const layer = ensureCustomBgLayer();
      // Fond personnalisé importé (URL Storage) → couche image/vidéo dédiée.
      if (bg && /^https?:\/\//.test(bg)) {
        document.body.removeAttribute('data-bg');
        const isVideo = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(bg);
        if (layer._src !== bg) {
          layer._src = bg; layer.innerHTML = '';
          if (isVideo) {
            const v = document.createElement('video'); v.src = bg; v.autoplay = true; v.muted = true; v.loop = true; v.playsInline = true;
            layer.appendChild(v);
          } else {
            const im = document.createElement('img'); im.src = bg; layer.appendChild(im);
          }
        }
        // Recadrage (posX/posY/scale, choisi dans l'éditeur) — pas de crop pour une vidéo.
        if (!isVideo) {
          const img = layer.querySelector('img');
          if (img) {
            const posX = (pos && typeof pos.posX === 'number') ? pos.posX : 50;
            const posY = (pos && typeof pos.posY === 'number') ? pos.posY : 50;
            const scale = (pos && typeof pos.scale === 'number') ? pos.scale : 1;
            img.style.objectPosition = posX + '% ' + posY + '%';
            img.style.transformOrigin = posX + '% ' + posY + '%'; // doit matcher object-position (cf. avatar)
            img.style.transform = 'scale(' + scale + ')';
          }
        }
        layer.classList.add('on');
        positionCustomBgLayer();
        if (picker) picker.querySelectorAll('.bg-tile').forEach(t => t.classList.remove('is-active'));
        return;
      }
      // Sinon : preset (via data-bg) → on masque la couche custom.
      layer.classList.remove('on'); layer.innerHTML = ''; layer.style.backgroundImage = ''; layer._src = '';
      const v = bg || 'default';
      if (v === 'default') document.body.removeAttribute('data-bg');
      else document.body.setAttribute('data-bg', v);
      if (picker) picker.querySelectorAll('.bg-tile').forEach(t => t.classList.toggle('is-active', t.dataset.bg === v));
    }
    window.__applyBgChoice = applyBgChoice;
    (function bindBgPicker(){
      const picker = document.getElementById('bgPicker');
      if (!picker) return;
      picker.querySelectorAll('.bg-tile').forEach(tile => {
        tile.addEventListener('click', () => {
          const bg = tile.dataset.bg;
          state.user = state.user || {};
          state.user.boostBg = bg;
          save();
          applyBgChoice(bg);
          const label = (tile.textContent || '').trim();
          showToast('🎨', 'Fond mis à jour', label);
        });
      });
    })();
    // Applique le fond sauvegardé dès le chargement
    applyBgChoice(state.user && state.user.boostBg, state.user && state.user.boostBgPos);

    /* ===== Boost: Gender filter ===== */
    document.getElementById('boostGenderFilter')?.addEventListener('change', e => {
      if (!state.user || !state.user.boost) { e.target.value = 'all'; openBoostModal(); return; }
      state.user.genderFilter = e.target.value;
      save();
      deckIdx = 0;
    });

    /* ===== Boost: Liked-me list (mock) ===== */
    // Mocks retirés — passera par Supabase quand la fonctionnalité "Likes recus" sera branchee
    const LIKED_ME = [];
    // Ouvre le VRAI aperçu plein écran (carte + bulles + GIFs/photos + fond perso,
    // bouton "Quitter l'aperçu") sur le profil d'un tiers -- même mécanique que
    // enterPreviewMode() pour SA propre carte (voir plus bas), généralisée pour
    // accepter n'importe quel profil au lieu d'être câblée sur buildUserProfile().
    function openProfilePreview(p){
      // Profil COMPLET : les entrées de la liste des likes ne portent qu'un
      // sous-ensemble + le vrai profil dans _full. On part du profil complet
      // (bio, orbes, bannière, connexions, GIFs…) si dispo, sinon des champs
      // de surface + des valeurs par défaut.
      const f = (p && p._full) ? p._full : p;
      const profileObj = {
        name: f.name || p.name,
        tag: f.tag || p.tag,
        age: f.age || p.age || '',
        gender: f.gender || p.gender || '',
        country: f.country || p.country || '',
        countryFlag: f.countryFlag || p.countryFlag || '',
        looking: f.looking || p.looking || 'game',
        status: f.status || p.status || 'online',
        nitro: !!f.nitro,
        boost: !!f.boost,
        nameColor: f.nameColor || null,
        showBoostName: f.showBoostName,
        joinedOn: f.joinedOn || 'récemment',
        activity: f.activity,
        games: f.games || [],
        bio: f.bio || 'Vient de liker ton profil. Réponds vite ?',
        common: f.common || { friends:0, servers:0 },
        c1: f.c1 || p.c1, c2: f.c2 || p.c2,
        profileColor: f.profileColor, profileColor2: f.profileColor2,
        initial: f.initial || p.initial,
        avatarUrl: f.avatarUrl || p.avatarUrl || null,
        avatarPos: f.avatarPos || null,
        bannerUrl: f.bannerUrl || p.bannerUrl || null,
        decorationUrl: f.decorationUrl || p.decorationUrl || null,
        orbs: f.orbs || p.orbs || [],
        orbColors: f.orbColors || p.orbColors || null,
        orbGlow: f.orbGlow || p.orbGlow || null,
        orbContour: f.orbContour || p.orbContour || null,
        gifs: f.gifs || [],
        gifContour: f.gifContour !== false,
        photos: f.photos || [],
        photoContour: f.photoContour !== false,
        bg: f.bg || null,
        connections: f.connections || {},
        publicFlags: f.publicFlags || 0,
        premiumType: f.premiumType || 0,
        socials: f.socials || {},
        guildIds: f.guildIds || p.guildIds,
        profileVoice: f.profileVoice || null,
        discordLive: f.discordLive || p.discordLive || null,
        isMe: false,
      };
      // Referme les panneaux (messages/qui t'a liké) : l'aperçu prend tout l'écran,
      // rien ne doit traîner derrière une fois "Quitter l'aperçu" cliqué.
      document.getElementById('msgPanel')?.setAttribute('data-open', 'false');
      document.getElementById('likedPanel')?.setAttribute('data-open', 'false');
      if (typeof enterPreviewMode === 'function') enterPreviewMode(profileObj);
    }

    function renderLikedMe(){
      const list = document.getElementById('likedList');
      list.innerHTML = '';
      const unlocked = !!(state.user && state.user.boost);
      const likers = LIKED_ME || [];

      if (likers.length === 0) {
        // No likes yet : simple message
        const empty = document.createElement('div');
        empty.className = 'liked-empty';
        empty.innerHTML = `
          <p>Personne ne t'a encore liké en secret.</p>
          <p style="color:#72767d;font-size:12.5px">Continue à swiper pour augmenter tes chances ✨</p>
        `;
        list.appendChild(empty);
        return;
      }

      // List of likers — photo always visible on the LEFT, info blurred for non-boost
      // (revealed on hover). Boost users : click info area to OPEN profile, click ❤️ to match, click ✕ to reject.
      likers.forEach((p, idx) => {
        const it = document.createElement('div');
        it.className = 'liked-item' + (unlocked ? ' liked-item--clickable' : ' liked-item--locked');
        it.dataset.idx = String(idx);
        it.innerHTML =
          `<div class="lavi" style="background:linear-gradient(135deg,${p.c1},${p.c2})">${p.avatarUrl ? `<img src="${p.avatarUrl}" alt="" loading="lazy">` : p.initial}</div>` +
          `<div class="li-info">
             <b class="${unlocked ? '' : 'li-blur'}">${escapeHtmlMini(p.name)} · ${p.age}</b>
             <small class="${unlocked ? '' : 'li-blur'}">@${escapeHtmlMini(p.tag)}</small>
           </div>` +
          (unlocked ? `
            <button type="button" class="li-action li-act-heart" title="Like en retour">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.3-9.3C1 8.3 3 4.5 6.7 4.5c1.9 0 3.5 1 4.3 2.4l1 1.7 1-1.7C13.8 5.5 15.4 4.5 17.3 4.5 21 4.5 23 8.3 21.3 11.7 19 16.5 12 21 12 21Z"/></svg>
            </button>
            <button type="button" class="li-action li-act-x" title="Supprimer ce like">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6l-12 12"/></svg>
            </button>
          ` : '');
        if (unlocked) {
          // Click on the avatar/info area → open the full profile overlay
          const heartBtn = it.querySelector('.li-act-heart');
          const xBtn = it.querySelector('.li-act-x');
          it.querySelector('.lavi').addEventListener('click', (e) => { e.stopPropagation(); openProfilePreview(p); });
          it.querySelector('.li-info').addEventListener('click', (e) => { e.stopPropagation(); openProfilePreview(p); });
          heartBtn.addEventListener('click', (e) => { e.stopPropagation(); createMatchFromLiker(p); });
          xBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const i = LIKED_ME.findIndex(x => x.tag === p.tag);
            if (i >= 0) LIKED_ME.splice(i, 1);
            // Réponse (rejet) → ce liker ne doit JAMAIS revenir, même si le delete DB échoue.
            dismissLiker(p.uid);
            renderLikedMe();
            if (typeof window.__heartFabRefresh === 'function') window.__heartFabRefresh();
            // Supprime le like en DB pour qu'il ne réapparaisse pas au prochain refresh.
            try {
              if (window.__supa && p.uid) {
                const { data:{ session } } = await window.__supa.auth.getSession();
                if (session) await window.__supa.from('likes').delete().eq('liker_id', p.uid).eq('liked_id', session.user.id);
              }
            } catch(_){}
          });
        }
        list.appendChild(it);
      });

      if (!unlocked) {
        // Paywall CTA at the bottom : text + boost button (no avatars row)
        const cta = document.createElement('div');
        cta.className = 'liked-paywall';
        cta.innerHTML = `
          <p class="lp-text">Pour voir qui t'as liké, passe à <b>Matefindr Boost</b> ✨</p>
          <button type="button" class="acc-btn acc-btn--primary lp-cta" id="likedPaywallCta">Découvrir Boost</button>
        `;
        list.appendChild(cta);
        const cta2 = list.querySelector('#likedPaywallCta');
        if (cta2) cta2.addEventListener('click', () => {
          document.getElementById('likedPanel').setAttribute('data-open','false');
          if (typeof openBoostModal === 'function') openBoostModal();
        });
      }
    }
    document.getElementById('likedClose')?.addEventListener('click', () => {
      document.getElementById('likedPanel').setAttribute('data-open','false');
    });

    /* ===== Boost: Swipe ambient music ===== */
    let _smDebounce = null;
    let _swipeMusicAudio = null;
    function renderSwipeMusicCurrent(){
      const box = document.getElementById('swipeMusicCurrent');
      if (!box) return;
      const sm = state.user && state.user.swipeMusic;
      if (!sm) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML =
        (sm.cover ? `<img src="${sm.cover}" alt="" loading="lazy" decoding="async">` : '') +
        `<div class="smc-info"><b>${escapeHtmlMini(sm.title)}</b><small>${escapeHtmlMini(sm.artist || '')}</small></div>` +
        `<button type="button" id="smcRemove">Retirer</button>`;
      document.getElementById('smcRemove')?.addEventListener('click', () => {
        state.user.swipeMusic = null;
        save();
        renderSwipeMusicCurrent();
        stopSwipeMusic();
      });
    }
    document.getElementById('swipeMusicInput')?.addEventListener('input', e => {
      const val = e.target.value.trim();
      const sugg = document.getElementById('swipeMusicSugg');
      if (val.length < 2) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
      clearTimeout(_smDebounce);
      _smDebounce = setTimeout(async () => {
        try {
          const allResults = await searchSpotifyTracks(val);
          const results = allResults.filter(r => r.previewUrl);
          if (!results.length) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
          sugg.innerHTML = '';
          results.forEach(r => {
            const it = document.createElement('div');
            it.className = 'sp-item';
            it.innerHTML =
              (r.cover ? `<img src="${r.cover}" alt="" loading="lazy" decoding="async">` : '<div class="sp-no-cover"></div>') +
              `<div class="sp-info"><div class="sp-title">${escapeHtmlMini(r.name)}</div>` +
              `<div class="sp-artist">${escapeHtmlMini(r.artist)}</div></div>`;
            it.addEventListener('mousedown', ev => {
              ev.preventDefault();
              if (!state.user || !state.user.boost) { openBoostModal(); return; }
              state.user.swipeMusic = { title: r.name+' · '+r.artist, artist: r.artist, previewUrl: r.previewUrl, cover: r.cover };
              save();
              document.getElementById('swipeMusicInput').value = '';
              sugg.innerHTML=''; sugg.classList.remove('open');
              renderSwipeMusicCurrent();
              showToast('🎵', 'Musique d\'ambiance définie', r.name);
            });
            sugg.appendChild(it);
          });
          sugg.classList.add('open');
        } catch(_){}
      }, 320);
    });
    document.getElementById('swipeMusicInput')?.addEventListener('blur', () => setTimeout(() => {
      const s = document.getElementById('swipeMusicSugg');
      s.innerHTML=''; s.classList.remove('open');
    }, 200));

    async function startSwipeMusic(){
      const sm = state.user && state.user.swipeMusic;
      if (!sm) return;
      if (_swipeMusicAudio) return;
      if (!sm.previewUrl) {
        const parts = (sm.title || '').split(' · ');
        const itu = await itunesPreview(sm.artist || parts[1] || '', parts[0] || sm.title || '');
        if (!itu) { showToast('🎵', sm.title || 'Musique', 'Pas de preview disponible'); return; }
        sm.previewUrl = itu; save();
      }
      _swipeMusicAudio = new Audio(sm.previewUrl);
      _swipeMusicAudio.loop = true;
      _swipeMusicAudio.volume = orbMusicTarget();
      _swipeMusicAudio.play().catch(() => {});
      const box = document.getElementById('swipeMusic');
      document.getElementById('smTitle').textContent = sm.title;
      document.getElementById('smArtist').textContent = sm.artist || '';
      document.getElementById('smCover').style.backgroundImage = sm.cover ? `url('${sm.cover}')` : '';
      document.getElementById('smCover').classList.remove('is-paused');
      document.getElementById('smIcoPlay').style.display = 'none';
      document.getElementById('smIcoPause').style.display = '';
      box.setAttribute('data-show', 'true');
    }
    function stopSwipeMusic(){
      if (_swipeMusicAudio) { _swipeMusicAudio.pause(); _swipeMusicAudio = null; }
      const box = document.getElementById('swipeMusic');
      if (box) box.setAttribute('data-show', 'false');
    }
    document.getElementById('smToggle')?.addEventListener('click', () => {
      if (!_swipeMusicAudio) return;
      if (_swipeMusicAudio.paused) {
        _swipeMusicAudio.play().catch(()=>{});
        document.getElementById('smCover').classList.remove('is-paused');
        document.getElementById('smIcoPlay').style.display = 'none';
        document.getElementById('smIcoPause').style.display = '';
      } else {
        _swipeMusicAudio.pause();
        document.getElementById('smCover').classList.add('is-paused');
        document.getElementById('smIcoPlay').style.display = '';
        document.getElementById('smIcoPause').style.display = 'none';
      }
    });

    /* ===== Boost: GIFs (Giphy) ===== */
    // GIFs via Klipy (clé publique côté front, comme une clé Giphy — pas un secret serveur).
    const KLIPY_KEY = '5DKFHDcNL2x6c4fwtYy3UM1voKXxmrZqjkmZTdUtTHqFwZlbJeybC2J4M7DAi7lu';
    const MAX_GIFS = 10;
    let _gifDebounce = null;
    function klipyCid(){ return (state.user && state.user.discordId) || 'anon'; }

    // Conserve le nom searchGiphy (appelé ailleurs) ; renvoie { preview, full }.
    async function searchGiphy(query){
      try {
        const url = 'https://api.klipy.com/api/v1/' + KLIPY_KEY + '/gifs/search?q=' +
          encodeURIComponent(query) + '&per_page=50&page=1&customer_id=' + encodeURIComponent(klipyCid());
        const resp = await fetch(url);
        const d = await resp.json();
        const items = (d && d.data && d.data.data) || [];
        return items.map(it => {
          const f = it.file || {};
          return {
            preview: (f.sm && f.sm.gif && f.sm.gif.url) || (f.xs && f.xs.gif && f.xs.gif.url) || (f.md && f.md.gif && f.md.gif.url),
            full:    (f.md && f.md.gif && f.md.gif.url) || (f.hd && f.hd.gif && f.hd.gif.url) || (f.sm && f.sm.gif && f.sm.gif.url),
          };
        }).filter(g => g.preview && g.full);
      } catch(_){ return []; }
    }

    function refreshGifCounter(){
      const n = ((state.user && state.user.gifs) || []).length;
      const pill = document.getElementById('gifCounterPill');
      if (pill) pill.textContent = n + '/' + MAX_GIFS;
      const ctaC = document.getElementById('accGifsCtaCount');
      if (ctaC) ctaC.textContent = n + ' / ' + MAX_GIFS;
    }

    function renderGifStage(){
      const stage = document.getElementById('gifStage');
      if (!stage) return;
      stage.querySelectorAll('.gif-item').forEach(n => n.remove());
      const gifs = (state.user && state.user.gifs) || [];
      gifs.forEach((g, i) => {
        const item = document.createElement('div');
        item.className = 'gif-item';
        item.style.left = g.x + '%';
        item.style.top  = g.y + '%';
        item.style.transform = 'translate(-50%,-50%)';
        item.innerHTML = `<img src="${g.preview}" alt=""><button type="button" class="gif-del" aria-label="Supprimer">×</button>`;
        item.querySelector('.gif-del').addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.user.gifs.splice(i, 1);
          save();
          renderGifStage();
          refreshGifCounter();
        });
        attachGifDrag(item, i, stage);
        stage.appendChild(item);
      });
      refreshGifCounter();
    }

    function attachGifDrag(item, idx, stage){
      let dragging = false;
      const onDown = (e) => {
        if (e.target.classList.contains('gif-del')) return;
        dragging = true;
        e.preventDefault();
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive:false });
        document.addEventListener('touchend', onUp);
      };
      const onMove = (e) => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        const rect = stage.getBoundingClientRect();
        const x = Math.max(4, Math.min(96, ((p.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(4, Math.min(96, ((p.clientY - rect.top) / rect.height) * 100));
        item.style.left = x + '%';
        item.style.top  = y + '%';
        if (state.user && state.user.gifs && state.user.gifs[idx]) {
          state.user.gifs[idx].x = x;
          state.user.gifs[idx].y = y;
        }
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        save();
      };
      item.addEventListener('mousedown', onDown);
      item.addEventListener('touchstart', onDown, { passive:false });
    }

    document.getElementById('gifInput')?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const sugg = document.getElementById('gifSugg');
      if (val.length < 2) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
      clearTimeout(_gifDebounce);
      _gifDebounce = setTimeout(async () => {
        const results = await searchGiphy(val);
        if (!results.length) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
        sugg.innerHTML = '';
        sugg.style.display = 'grid';
        sugg.style.gridTemplateColumns = 'repeat(3,1fr)';
        sugg.style.gap = '6px';
        sugg.style.padding = '8px';
        results.forEach(r => {
          const it = document.createElement('div');
          it.style.cssText = 'cursor:pointer;border-radius:8px;overflow:hidden;aspect-ratio:1;background:#000';
          it.innerHTML = `<img src="${r.preview}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">`;
          it.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            state.user = state.user || {};
            state.user.gifs = state.user.gifs || [];
            if (state.user.gifs.length >= MAX_GIFS) { showToast('🎞️', 'Limite atteinte', MAX_GIFS + ' GIFs max'); return; }
            state.user.gifs.push({ preview:r.preview, full:r.full, x:-30, y:50, w:34, rot:0 });
            save();
            // Re-render dans l'aperçu pour montrer le GIF placé à gauche
            const o2 = document.getElementById('swipeStickersBg'); if (o2) o2.remove();
            document.getElementById('gifInput').value = '';
            sugg.innerHTML=''; sugg.classList.remove('open');
            renderGifStage();
            showToast('🎞️', 'GIF ajouté', 'Fais-le glisser pour le positionner');
          });
          sugg.appendChild(it);
        });
        sugg.classList.add('open');
      }, 320);
    });
    document.getElementById('gifInput')?.addEventListener('blur', () => setTimeout(() => {
      const s = document.getElementById('gifSugg');
      s.innerHTML=''; s.classList.remove('open');
    }, 200));

    /* ===== GIF edit overlay (drag + redimensionnement + rotation, comme l'éditeur de bulles) ===== */
    const GIF_W_MIN = 12, GIF_W_MAX = 75; // taille raisonnable (% largeur carte)
    /* Affiche les BULLES en read-only (contexte) autour de la carte d'un éditeur */
    function renderContextOrbs(wrapEl){
      if (!wrapEl) return;
      [...wrapEl.querySelectorAll('.ctx-orb')].forEach(n => n.remove());
      const orbs = (state.profile && state.profile.userOrbs) || [];
      if (!orbs.length || typeof orbRelLayout !== 'function') return;
      const { rel } = orbRelLayout(orbs, false);
      orbs.forEach(o => {
        const r = rel.get(o); if (!r) return;
        const el = document.createElement('div');
        el.className = 'ctx-orb';
        el.style.cssText = `position:absolute;width:58px;height:58px;border-radius:50%;left:${(50+r.rx*100).toFixed(2)}%;top:${(50+r.ry*100).toFixed(2)}%;transform:translate(-50%,-50%);pointer-events:none;z-index:6;overflow:hidden;border:2px solid rgba(255,255,255,.55);box-shadow:0 6px 16px rgba(0,0,0,.55);background:#1c1d22;display:grid;place-items:center;color:#fff`;
        el.innerHTML = o.cover ? `<img src="${o.cover}" alt="" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-size:22px">${({music:'🎵',game:'🎮',film:'🎬',anime:'📺',voice:'🎤'}[o.kind]||'🫧')}</span>`;
        wrapEl.appendChild(el);
      });
    }
    /* Affiche les GIFs en read-only (contexte) sur la carte d'un éditeur (sous les bulles) */
    function renderContextGifs(wrapEl){
      if (!wrapEl) return;
      [...wrapEl.querySelectorAll('.ctx-gif')].forEach(n => n.remove());
      const gifs = (state.user && state.user.gifs) || [];
      gifs.forEach(g => {
        const el = document.createElement('div');
        el.className = 'ctx-gif';
        el.style.cssText = `position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w||34}%;transform:translate(-50%,-50%) rotate(${g.rot||0}deg);pointer-events:none;z-index:4;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,.22);box-shadow:0 8px 20px rgba(0,0,0,.5);opacity:.9`;
        el.innerHTML = `<img src="${g.preview||g.full}" alt="" style="width:100%;height:auto;display:block">`;
        wrapEl.appendChild(el);
      });
    }

    function openGifEditOverlay(){
      const overlay = document.getElementById('gifEditOverlay');
      const wrap    = document.getElementById('gefCardWrap');
      const layer   = document.getElementById('gefGifLayer');
      if (!overlay || !wrap || !layer) return;
      const myP = (typeof buildUserProfile === 'function') ? buildUserProfile() : null;
      [...wrap.querySelectorAll('.swipe-card')].forEach(c => c.remove());
      if (myP) {
        const card = buildCard(myP, false);
        card.style.cssText += ';position:absolute !important;inset:0 !important;opacity:1 !important;transform:none !important;cursor:default !important;pointer-events:none';
        wrap.insertBefore(card, layer); // carte sous la couche d'édition
      }
      overlay.setAttribute('data-show', 'true');
      const se = document.getElementById('gefSearch'); if (se) se.value = '';
      const sg = document.getElementById('gefSugg'); if (sg){ sg.innerHTML=''; sg.classList.remove('open'); }
      requestAnimationFrame(() => { renderGifEditItems(); renderContextOrbs(wrap); }); // montre aussi les bulles
    }
    function closeGifEditOverlay(){
      const overlay = document.getElementById('gifEditOverlay');
      if (overlay) overlay.setAttribute('data-show', 'false');
      if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
    }
    function renderGifEditItems(){
      const layer = document.getElementById('gefGifLayer');
      if (!layer) return;
      layer.innerHTML = '';
      const gifs = (state.user && state.user.gifs) || [];
      gifs.forEach((g, i) => layer.appendChild(makeEditGif(g, i, layer)));
      refreshGifCounter();
    }
    function makeEditGif(g, idx, layer){
      if (typeof g.x !== 'number') g.x = 50;
      if (typeof g.y !== 'number') g.y = 30;
      if (typeof g.w !== 'number') g.w = 34;
      if (typeof g.rot !== 'number') g.rot = 0;
      const el = document.createElement('div');
      el.className = 'gef-gif';
      const apply = () => {
        el.style.left = g.x + '%';
        el.style.top  = g.y + '%';
        el.style.width = g.w + '%';
        el.style.transform = `translate(-50%,-50%) rotate(${g.rot}deg)`;
      };
      apply();
      el.innerHTML =
        `<div class="gef-gif-inner"><img src="${g.preview || g.full}" alt="" draggable="false"></div>` +
        `<button type="button" class="gef-handle gef-del" aria-label="Supprimer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` +
        `<div class="gef-handle gef-rotate" aria-label="Rotation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></div>` +
        `<div class="gef-handle gef-resize" aria-label="Taille"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H3v-6M21 9V3h-6M3 21 10 14M21 3l-7 7"/></svg></div>`;
      const center = () => { const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; };
      // Supprimer
      const del = el.querySelector('.gef-del');
      del.addEventListener('pointerdown', e => e.stopPropagation());
      del.addEventListener('click', e => {
        e.stopPropagation();
        (state.user.gifs || []).splice(idx, 1);
        save(); renderGifEditItems();
      });
      // Déplacer (corps)
      let drag = null;
      el.addEventListener('pointerdown', e => {
        if (e.target.closest('.gef-handle')) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch(_){}
        const lr = layer.getBoundingClientRect();
        drag = { mx:e.clientX, my:e.clientY, x0:g.x, y0:g.y, lw:lr.width, lh:lr.height };
        el.classList.add('dragging'); el.style.zIndex = '10';
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        // GIFs peuvent maintenant être placés en DEHORS de la carte (jusqu'à 60% sur les côtés)
        g.x = Math.max(-60, Math.min(160, drag.x0 + (e.clientX - drag.mx) / drag.lw * 100));
        g.y = Math.max(-30, Math.min(130, drag.y0 + (e.clientY - drag.my) / drag.lh * 100));
        apply();
      });
      const endDrag = e => {
        if (!drag) return; drag = null; el.classList.remove('dragging'); el.style.zIndex='';
        try{ el.releasePointerCapture(e.pointerId);}catch(_){}
        save();
        // Avertissement si le GIF chevauche la carte de profil
        const half = (g.w || 34) / 2;
        if (g.x + half > 10 && g.x - half < 90 && g.y + half > 10 && g.y - half < 90 && typeof showToast === 'function') {
          showToast('⚠️', 'Superposition déconseillée', 'Évite de poser un GIF sur la carte de profil');
        }
      };
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      // Redimensionner (coin vert) — distance centre→pointeur (insensible à la rotation)
      const rz = el.querySelector('.gef-resize');
      rz.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { rz.setPointerCapture(e.pointerId); } catch(_){}
        const c = center();
        const d0 = Math.max(8, Math.hypot(e.clientX - c.x, e.clientY - c.y));
        const w0 = g.w;
        const mv = ev => { g.w = Math.max(GIF_W_MIN, Math.min(GIF_W_MAX, w0 * (Math.hypot(ev.clientX - c.x, ev.clientY - c.y) / d0))); apply(); };
        const up = ev => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); try{ rz.releasePointerCapture(ev.pointerId);}catch(_){} save(); };
        rz.addEventListener('pointermove', mv);
        rz.addEventListener('pointerup', up);
      });
      // Rotation (coin bleu) — angle centre→pointeur
      const ro = el.querySelector('.gef-rotate');
      ro.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { ro.setPointerCapture(e.pointerId); } catch(_){}
        const c = center();
        const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
        const r0 = g.rot;
        const mv = ev => { const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x) * 180 / Math.PI; g.rot = Math.round(r0 + (a - a0)); apply(); };
        const up = ev => { ro.removeEventListener('pointermove', mv); ro.removeEventListener('pointerup', up); try{ ro.releasePointerCapture(ev.pointerId);}catch(_){} save(); };
        ro.addEventListener('pointermove', mv);
        ro.addEventListener('pointerup', up);
      });
      return el;
    }
    // Recherche d'ajout dans l'overlay GIF
    let _gefDebounce = null;
    (function(){
      const se = document.getElementById('gefSearch');
      if (!se) return;
      se.addEventListener('input', e => {
        const val = e.target.value.trim();
        const sugg = document.getElementById('gefSugg');
        if (val.length < 2) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
        clearTimeout(_gefDebounce);
        _gefDebounce = setTimeout(async () => {
          const results = await searchGiphy(val);
          if (!results.length) { sugg.innerHTML=''; sugg.classList.remove('open'); return; }
          sugg.innerHTML = '';
          results.forEach(r => {
            const it = document.createElement('div');
            it.className = 'gef-sg-item';
            it.innerHTML = `<img src="${r.preview}" alt="">`;
            it.addEventListener('pointerdown', ev => {
              ev.preventDefault();
              state.user = state.user || {};
              state.user.gifs = state.user.gifs || [];
              if (state.user.gifs.length >= MAX_GIFS) { showToast('🎞️', 'Limite atteinte', MAX_GIFS + ' GIFs max'); return; }
              state.user.gifs.push({ preview:r.preview, full:r.full, x:50, y:35, w:34, rot:0 });
              save();
              se.value = ''; sugg.innerHTML=''; sugg.classList.remove('open');
              renderGifEditItems();
              showToast('🎞️', 'GIF ajouté', 'Déplace · agrandis · oriente');
            });
            sugg.appendChild(it);
          });
          sugg.classList.add('open');
        }, 320);
      });
      se.addEventListener('blur', () => setTimeout(() => { const s = document.getElementById('gefSugg'); if (s){ s.innerHTML=''; s.classList.remove('open'); } }, 200));
    })();
    document.getElementById('gefClose')?.addEventListener('click', closeGifEditOverlay);
    document.getElementById('gefBackdrop')?.addEventListener('click', closeGifEditOverlay);
    document.getElementById('accGifsCta')?.addEventListener('click', () => {
      openGifEditOverlay();
    });

    /* ===== Boost banner + pricing modal ===== */
    function refreshBoostUI(){
      const active = !!(state.user && state.user.boost);
      // Bannière + formulaires Boost : retirés avec l'écran compte → on no-op s'ils manquent.
      const banner = document.getElementById('boostBanner');
      if (banner) {
        const title = document.getElementById('boostBannerTitle');
        const sub   = document.getElementById('boostBannerSub');
        const cta   = document.getElementById('boostBannerCta');
        banner.classList.toggle('is-active', active);
        if (active) {
          const plan = state.user.boostPlan === 'lifetime' ? 'À vie' : state.user.boostPlan === 'launch' ? 'Offert' : 'Mensuel';
          if (title) title.textContent = 'Matefindr Boost actif';
          if (sub)   sub.textContent   = plan + ' · 16 bulles, Fake Nitro, filtre H/F…';
          if (cta)   cta.textContent   = 'Gérer';
        } else {
          if (title) title.textContent = 'Passer en Matefindr Boost';
          if (sub)   sub.textContent   = '16 bulles, Fake Nitro, filtre H/F, likes secrets…';
          if (cta)   cta.textContent   = 'Découvrir';
        }
      }
      const bmActive = document.getElementById('bmActive');
      if (bmActive) {
        document.querySelectorAll('.bm-plan').forEach(b => b.style.opacity = active ? '.45' : '1');
        bmActive.hidden = !active;
        const bmp = document.getElementById('bmActivePlan');
        if (active && bmp) bmp.textContent = '· ' + (state.user.boostPlan === 'lifetime' ? '14,99€ à vie' : state.user.boostPlan === 'launch' ? 'offert' : '3,79€/mois');
      }
      const fn = document.getElementById('boostFakeNitro');
      if (fn) fn.checked = !!(state.user && state.user.fakeNitro);
      const _bsn = document.getElementById('boostShowName');
      if (_bsn) _bsn.checked = !(state.user && state.user.boostShowName === false);
      if (typeof applyBgChoice === 'function') applyBgChoice(state.user && state.user.boostBg, state.user && state.user.boostBgPos);
      const gfEl = document.getElementById('boostGenderFilter');
      if (gfEl) gfEl.value = (state.user && state.user.genderFilter) || 'all';
      if (typeof renderSwipeMusicCurrent === 'function') renderSwipeMusicCurrent();
      if (typeof renderGifStage === 'function') renderGifStage();
      if (typeof renderUserOrbs === 'function') renderUserOrbs();
    }
    /* Vérifie l'échéance d'un abonnement MENSUEL (mock, sans backend de paiement) :
       - période en cours (now < prochain paiement) → rien.
       - échéance atteinte + résilié → l'abonnement EXPIRE (le Boost dure bien le mois payé, pas plus).
       - échéance atteinte + actif → renouvellement (+1 mois), comme un vrai prélèvement. */
    function checkBoostExpiry(){
      const u = state.user;
      if (!u || !u.boost || u.boostPlan !== 'monthly' || !u.boostNextPayment) return;
      const now = Date.now(), due = new Date(u.boostNextPayment).getTime();
      if (isNaN(due) || now < due) return;
      if (u.boostCancelled) {
        u.boost = false; u.boostPlan = null; u.boostNextPayment = null; u.boostSince = null; u.boostCancelled = false;
      } else {
        const d = new Date(due);
        while (d.getTime() <= now) d.setMonth(d.getMonth() + 1); // rattrape plusieurs mois si besoin
        u.boostNextPayment = d.toISOString();
      }
      save();
      if (typeof refreshBoostUI === 'function') refreshBoostUI();
    }
    window.__checkBoostExpiry = checkBoostExpiry;

    /* Section Abonnement & facturation (onglet Paramètres). */
    function refreshBillingUI(){
      checkBoostExpiry();
      const box = document.getElementById('accBilling');
      if (!box) return;
      const u = state.user || {};
      const fmt = (d) => { try { return new Date(d).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'}); } catch(_){ return '—'; } };
      if (!u.boost) {
        box.innerHTML = `<div class="bill-row"><span class="bill-k">Formule</span><span class="bill-v">Gratuit</span></div>
          <div class="bill-row"><span class="bill-k">Statut</span><span class="bill-v">Aucun abonnement actif</span></div>`;
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'acc-btn acc-btn--primary'; btn.style.cssText = 'width:100%;margin-top:11px';
        btn.textContent = 'Passer en Matefindr Boost';
        btn.onclick = () => { window.location.href = 'checkout.html?plan=monthly'; };
        box.appendChild(btn);
        return;
      }
      const lifetime = u.boostPlan === 'lifetime';
      const launch = u.boostPlan === 'launch';
      const permanent = lifetime || launch;
      const cancelled = !permanent && !!u.boostCancelled;
      box.innerHTML =
        `<div class="bill-row"><span class="bill-k">Formule</span><span class="bill-v">${launch ? 'Boost offert (lancement)' : lifetime ? 'Boost à vie' : 'Boost mensuel'}</span></div>` +
        `<div class="bill-row"><span class="bill-k">Prix</span><span class="bill-v">${launch ? 'Offert' : lifetime ? '14,99€ · paiement unique' : '3,79€ / mois'}</span></div>` +
        `<div class="bill-row"><span class="bill-k">Abonné depuis</span><span class="bill-v">${u.boostSince ? fmt(u.boostSince) : '—'}</span></div>` +
        (permanent
          ? `<div class="bill-row"><span class="bill-k">Renouvellement</span><span class="bill-v">Aucun — accès à vie</span></div>`
          : cancelled
            ? `<div class="bill-row"><span class="bill-k">Statut</span><span class="bill-v" style="color:#FFB66E">Résilié</span></div>
               <div class="bill-row"><span class="bill-k">Actif jusqu'au</span><span class="bill-v" style="color:#9CF0BD">${u.boostNextPayment ? fmt(u.boostNextPayment) : '—'}</span></div>`
            : `<div class="bill-row"><span class="bill-k">Prochain paiement</span><span class="bill-v" style="color:#9CF0BD">${u.boostNextPayment ? fmt(u.boostNextPayment) : '—'}</span></div>`);
      if (!permanent) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width:100%;margin-top:11px';
        if (cancelled) {
          btn.className = 'acc-btn acc-btn--primary';
          btn.textContent = "Réactiver l'abonnement";
          btn.onclick = () => {
            state.user.boostCancelled = false; save();
            refreshBillingUI();
            if (typeof showToast === 'function') showToast('✓', 'Abonnement réactivé', 'Le renouvellement reprend');
          };
        } else {
          btn.className = 'acc-btn acc-btn--ghost';
          btn.textContent = "Résilier l'abonnement";
          btn.onclick = () => {
            const until = u.boostNextPayment ? fmt(u.boostNextPayment) : 'la fin de la période';
            if (!confirm("Résilier ton abonnement Matefindr Boost ?\nTu gardes les avantages jusqu'au " + until + ", puis ton compte repassera en gratuit.")) return;
            state.user.boostCancelled = true; // on garde boost=true jusqu'à l'échéance
            save();
            refreshBillingUI();
            if (typeof showToast === 'function') showToast('✓', 'Résiliation programmée', 'Actif jusqu\'au ' + until);
          };
        }
        box.appendChild(btn);
      }
    }
    window.__refreshBillingUI = refreshBillingUI;
    function openBoostModal(){ document.getElementById('boostModal').setAttribute('data-open','true'); refreshBoostUI(); }
    function closeBoostModal(){ document.getElementById('boostModal').setAttribute('data-open','false'); }
    document.getElementById('boostBanner')?.addEventListener('click', openBoostModal);
    document.getElementById('boostModalClose')?.addEventListener('click', closeBoostModal);
    document.getElementById('boostModalBackdrop')?.addEventListener('click', closeBoostModal);
    document.querySelectorAll('.bm-plan').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.user && state.user.boost) return;
        // Direction la page de paiement (le Boost est activé après le checkout)
        window.location.href = 'checkout.html?plan=' + (btn.dataset.plan || 'monthly');
      });
    });
    document.getElementById('bmCancel')?.addEventListener('click', () => {
      if (!state.user) return;
      state.user.boost = false;
      state.user.boostPlan = null;
      save();
      refreshBoostUI();
      showToast('💔', 'Boost annulé', 'Retour à la version gratuite');
    });
    // Language toggle in account
    document.getElementById('accLangs')?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-val]');
      if (!b) return;
      const li = document.querySelector(`#langSwitch .ls-menu li[data-code="${b.dataset.val}"]`);
      if (li) li.click();
      else document.documentElement.lang = b.dataset.val.toLowerCase();
      document.querySelectorAll('#accLangs button').forEach(x => x.classList.toggle('active', x.dataset.val === b.dataset.val));
      refreshAccountPreview();
    });

    // Avatar upload — click avatar to pick a file
    (function bindAvatarUpload(){
      // Legacy (caché)
      const av = document.getElementById('accAvatar');
      const fi = document.getElementById('accAvatarFile');
      if (av && fi) {
        av.addEventListener('click', () => fi.click());
        fi.addEventListener('change', handleFile.bind(null, fi));
      }
      // Nouveau hero avatar
      const fih = document.getElementById('accAvatarFileHero');
      if (fih) fih.addEventListener('change', handleFile.bind(null, fih));
      async function handleFile(input, e){
        const f = e.target.files && e.target.files[0];
        input.value = '';
        if (!f) return;
        try {
          const blob = await resizeImageFile(f, 512, 0.86);
          const url = await uploadProfileMedia(blob, 'avatar');
          if (!url) { showToast('⚠️', 'Échec de l’envoi', 'Connecte-toi et réessaie'); return; }
          state.user = state.user || {};
          state.user.avatarUrl = url;
          save();
          renderAccount();
          refreshAccountPreview();
          refreshHeroAvatar();
          showToast('📷', 'Photo de profil', 'Mise à jour');
        } catch(err){
          console.warn('avatar upload error', err);
          showToast('⚠️', 'Erreur', 'Image invalide, réessaie');
        }
      }
    })();

    /* Sync l'avatar visible dans le hero avec state.user.avatarUrl */
    function refreshHeroAvatar(){
      const circle = document.getElementById('accHeroAvatar');
      const img = document.getElementById('accHeroAvatarImg');
      if (!circle || !img) return;
      const url = (state.user && state.user.avatarUrl) || '';
      if (url) {
        img.src = url;
        circle.setAttribute('data-has-img', 'true');
      } else {
        img.removeAttribute('src');
        circle.removeAttribute('data-has-img');
      }
    }
    window.__refreshHeroAvatar = refreshHeroAvatar;

    // Music volume slider — live update + persistence (écran compte)
    (function bindMusicVolume(){
      const sl = document.getElementById('musicVolume');
      if (!sl || !window.MatefindrVolume) return;
      const MV = window.MatefindrVolume;
      sl.addEventListener('input', () => {
        const v = parseInt(sl.value, 10) / 100;
        document.getElementById('musicVolVal').textContent = Math.round(v * 100) + '%';
        MV.setVol(v, true);
        state.user = state.user || {};
        state.user.musicVolume = v;
        const eff = MV.effective(v);
        if (_swipeMusicAudio) _swipeMusicAudio.volume = eff;
        if (_spotifyAudio) _spotifyAudio.volume = eff;
        refreshProfileVoiceVol();
        if (typeof window.__mfVolRefresh === 'function') window.__mfVolRefresh();
        save();
      });
      window.addEventListener('mf:volume', e => {
        const v = e.detail.value;
        sl.value = Math.round(v * 100);
        const vv = document.getElementById('musicVolVal');
        if (vv) vv.textContent = Math.round(v * 100) + '%';
        state.user = state.user || {};
        state.user.musicVolume = v;
      });
    })();

    // Volume musique — widget global (swipe, aperçu, lien perso)
    (function bindMfVol(){
      const root = document.getElementById('mfVol');
      const MV = window.MatefindrVolume;
      if (!root || !MV) return;
      const widget = MV.bindWidget(root, {
        onChange(v, eff) {
          state.user = state.user || {};
          state.user.musicVolume = v;
          if (_swipeMusicAudio) _swipeMusicAudio.volume = eff;
          if (typeof _spotifyAudio !== 'undefined' && _spotifyAudio) _spotifyAudio.volume = eff;
          refreshProfileVoiceVol();
          const sl = document.getElementById('musicVolume');
          if (sl) {
            sl.value = Math.round(v * 100);
            const vv = document.getElementById('musicVolVal');
            if (vv) vv.textContent = Math.round(v * 100) + '%';
          }
        },
        onSave() { if (typeof save === 'function') save(); }
      });
      window.__mfVolRefresh = () => widget.refresh();
      window.addEventListener('mf:volume', () => refreshProfileVoiceVol());
    })();

    // Discord resync button — fetches latest Discord profile and merges into state.user
    /* ===== Voice memo (profile audio, max 5s, listen + delete only) ===== */
    (function bindVoiceRecorder(){
      const fab = document.getElementById('accVoiceFab');
      const timer = document.getElementById('accVoiceTimer');
      const lbl = document.getElementById('accVoiceLabel');
      const preview = document.getElementById('accVoicePreview');
      const audioEl = document.getElementById('accVoiceAudio');
      const playBtn = document.getElementById('accVoicePlay');
      const delBtn = document.getElementById('accVoiceDel');
      const bar = document.getElementById('accVoiceBar');
      const timeLbl = document.getElementById('accVoiceTime');
      if (!fab) return;
      let mediaRec = null, chunks = [], tickIv = null, secs = 0;
      const MAX = 5;

      function fmtTime(t){
        const s = Math.floor(t); return '0:' + (s < 10 ? '0' + s : s);
      }
      function renderExisting(){
        const u = state.user || {};
        const has = !!u.profileVoice;
        // Reset recording state
        fab.setAttribute('data-state', 'idle');
        timer.textContent = '';
        if (has) {
          audioEl.src = u.profileVoice;
          try { audioEl.volume = mediaEffectiveVol(); } catch(_){}
          preview.hidden = false;
          fab.hidden = false;
          lbl.textContent = 'Ré-enregistrer le vocal';
        } else {
          audioEl.src = '';
          preview.hidden = true;
          fab.hidden = false;
          lbl.textContent = 'Enregistrer un vocal';
        }
      }
      renderExisting();
      window.__voiceRefresh = renderExisting;

      async function start(){
        if (!navigator.mediaDevices?.getUserMedia) { alert('Enregistrement non supporté par ce navigateur.'); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          mediaRec = new MediaRecorder(stream);
          mediaRec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
          mediaRec.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(chunks, { type: mediaRec.mimeType || 'audio/webm' });
            const reader = new FileReader();
            reader.onload = () => {
              state.user = state.user || {};
              state.user.profileVoice = reader.result;
              save();
              renderExisting();
            };
            reader.readAsDataURL(blob);
            clearInterval(tickIv); tickIv = null; secs = 0;
          };
          mediaRec.start();
          fab.setAttribute('data-state', 'recording');
          lbl.textContent = 'Enregistrement…';
          secs = 0;
          timer.textContent = (MAX - secs) + 's';
          tickIv = setInterval(() => {
            secs++;
            timer.textContent = (MAX - secs) + 's';
            if (secs >= MAX) stop();
          }, 1000);
        } catch (e) {
          console.warn('mic denied', e);
          alert('Accès au micro refusé.');
        }
      }
      function stop(){ try { mediaRec?.stop(); } catch {} }
      fab.addEventListener('click', () => {
        if (fab.dataset.state === 'recording') stop(); else start();
      });
      delBtn.addEventListener('click', () => {
        try { audioEl.pause(); } catch {}
        state.user = state.user || {};
        delete state.user.profileVoice;
        save();
        renderExisting();
      });
      // Custom player controls
      playBtn.addEventListener('click', () => {
        try { audioEl.volume = mediaEffectiveVol(); } catch(_){}
        if (audioEl.paused) audioEl.play().catch(()=>{});
        else audioEl.pause();
      });
      audioEl.addEventListener('play',  () => playBtn.setAttribute('data-playing','true'));
      audioEl.addEventListener('pause', () => playBtn.setAttribute('data-playing','false'));
      audioEl.addEventListener('ended', () => { playBtn.setAttribute('data-playing','false'); bar.style.width = '0%'; });
      audioEl.addEventListener('timeupdate', () => {
        if (!audioEl.duration || !isFinite(audioEl.duration)) return;
        const p = (audioEl.currentTime / audioEl.duration) * 100;
        bar.style.width = p + '%';
        timeLbl.textContent = fmtTime(audioEl.currentTime);
      });
      audioEl.addEventListener('loadedmetadata', () => {
        const dur = isFinite(audioEl.duration) ? audioEl.duration : 5;
        timeLbl.textContent = fmtTime(dur);
      });
      window.addEventListener('mf:volume', () => {
        try { audioEl.volume = mediaEffectiveVol(); } catch(_){}
      });
    })();

    (function bindDiscordResync(){
      const btn = document.getElementById('accResyncDiscord');
      if (!btn) return;
      const label = document.getElementById('accResyncLabel');
      const ico   = document.getElementById('accResyncIco');
      const hint  = document.getElementById('accResyncHint');
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        if (ico) ico.style.animation = 'nitroSpin 1s linear infinite';
        const oldLabel = label.textContent;
        label.textContent = 'Synchronisation en cours…';

        let token = null;
        try {
          const { data: { session } } = await window.__supa.auth.getSession();
          token = session?.provider_token;
        } catch {}
        if (!token) {
          const stored = localStorage.getItem('matefindr_discord_token');
          const ts = parseInt(localStorage.getItem('matefindr_discord_token_ts') || '0', 10);
          if (stored && (Date.now() - ts) < 7 * 24 * 3600 * 1000) token = stored;
        }

        if (!token) {
          // Need to re-login to get a fresh provider_token
          label.textContent = 'Reconnexion Discord requise…';
          if (ico) ico.style.animation = '';
          setTimeout(() => { signInWithDiscord(); }, 800);
          return;
        }

        const d = await fetchDiscordProfile(token);
        if (ico) ico.style.animation = '';

        if (!d) {
          label.textContent = 'Échec — token expiré ?';
          if (hint) hint.textContent = 'Reconnecte-toi avec Discord pour rafraîchir tes infos.';
          setTimeout(() => { btn.disabled = false; label.textContent = oldLabel; }, 2600);
          return;
        }

        // Merge limité : username Discord + serveurs + email — pas d'avatar/bannière/pseudo Matefindr.
        state.user = state.user || {};
        const u = state.user;
        let guilds = null;
        if (window.__refreshDiscordGuilds && (d.id || u.discordId)) {
          guilds = await window.__refreshDiscordGuilds(d.id || u.discordId);
        }
        if (typeof applyLimitedDiscordResync === 'function') {
          applyLimitedDiscordResync(u, d, guilds);
        } else {
          u.discordId = d.id || u.discordId;
          u.discordTag = (d.username || '').replace(/#0$/, '') || u.discordTag;
          if (d.email) u.email = d.email;
          if (guilds && guilds.length) u.guilds = guilds;
        }
        save();
        updateChip();
        renderAccount();
        refreshMyStatusUI();
        try { if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } catch(_){}

        label.textContent = 'Username & serveurs à jour ✓';
        setTimeout(() => { btn.disabled = false; label.textContent = oldLabel; }, 1800);
      });
    })();

    // Profile color picker
    (function bindProfileColor(){
      const rows = document.querySelectorAll('.acc-color-row[data-target]');
      if (!rows.length) return;
      rows.forEach(row => {
        const key = row.dataset.target; // 'profileColor' or 'profileColor2'
        const swatches = row.querySelectorAll('.acc-color-swatch');
        const pickerId = key === 'profileColor' ? 'accProfileColor' : 'accProfileColor2';
        const picker = document.getElementById(pickerId);
        function applyActive(val){
          swatches.forEach(s => s.classList.toggle('active', s.dataset.color === val));
        }
        function setColor(val){
          state.user = state.user || {};
          state.user[key] = (val === 'discord') ? null : val;
          save();
          refreshAccountPreview();
        }
        swatches.forEach(s => {
          s.addEventListener('click', () => {
            const val = s.dataset.color;
            applyActive(val);
            setColor(val);
          });
        });
        if (picker) {
          picker.addEventListener('input', () => {
            applyActive(null);
            setColor(picker.value);
          });
        }
        const stored = (state.user && state.user[key]) || 'discord';
        applyActive(stored);
        if (picker && stored && stored !== 'discord' && /^#[0-9a-f]{6}$/i.test(stored)) picker.value = stored;
      });
    })();

    /* "Reset Discord" button on the color wheels */
    (function bindColorReset(){
      const btn = document.getElementById('accColorReset');
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.user = state.user || {};
        // Reset = couleur de base Discord (le gris sombre de l'app)
        const DISCORD_BASE = '#36393F';
        const DISCORD_BASE_DARK = '#2F3136';
        state.user.profileColor  = DISCORD_BASE;
        state.user.profileColor2 = DISCORD_BASE_DARK;
        save();
        const cw1 = document.getElementById('accProfileColor');
        const cw2 = document.getElementById('accProfileColor2');
        if (cw1) cw1.value = DISCORD_BASE;
        if (cw2) cw2.value = DISCORD_BASE_DARK;
        if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
        showToast('↺', 'Couleur Discord appliquée', 'Gris de base');
      });
    })();

    /* "Mes bulles" CTA → ouvre l'overlay d'édition des bulles */
    (function bindBullesCta(){
      const btn = document.getElementById('accBullesCta');
      if (!btn) return;
      function refresh(){
        const used = (typeof orbsUsed === 'function') ? orbsUsed() : ((state.profile && state.profile.userOrbs) || []).length;
        const max  = (typeof orbBudget === 'function') ? orbBudget() : 4;
        const lbl  = document.getElementById('accBullesCtaCount');
        if (lbl) lbl.textContent = `${used} / ${max}`;
      }
      window.__refreshBullesCta = refresh;
      refresh();
      btn.addEventListener('click', () => {
        if (typeof openOrbEditOverlay === 'function') openOrbEditOverlay();
      });
    })();

    // Custom banner import — file → data URL → state.user.bannerUrl
    (function bindBannerImport(){
      const importBtn = document.getElementById('accBannerImport');
      const resetBtn  = document.getElementById('accBannerReset');
      const fileEl    = document.getElementById('accBannerFile');
      const prev      = document.getElementById('accBannerPrev');
      if (!importBtn || !fileEl || !prev) return;
      function refreshPrev(){
        const url = state.user && state.user.bannerUrl;
        if (url) {
          prev.style.backgroundImage = `url('${url}')`;
          resetBtn.hidden = !(state.user && state.user.bannerCustom);
        } else {
          prev.style.backgroundImage = '';
          resetBtn.hidden = true;
        }
      }
      refreshPrev();
      window.__refreshBannerPrev = refreshPrev;
      importBtn.addEventListener('click', () => {
        fileEl.click();
      });
      fileEl.addEventListener('change', async e => {
        const file = e.target.files && e.target.files[0];
        fileEl.value = '';
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
          showToast('⚠️', 'Image trop lourde', 'Maximum 20 Mo');
          return;
        }
        try {
          const blob = await resizeImageFile(file, 1600, 0.82);
          const url = await uploadProfileMedia(blob, 'banner');
          if (!url) { showToast('⚠️', 'Échec de l’envoi', 'Connecte-toi et réessaie'); return; }
          state.user = state.user || {};
          state.user.bannerUrl = url;
          state.user.bannerCustom = true;
          save();
          refreshPrev();
          if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
          showToast('🖼️', 'Bannière mise à jour', 'Visible sur ton profil');
        } catch(err){
          console.warn('banner upload error', err);
          showToast('⚠️', 'Erreur', 'Image invalide, réessaie');
        }
      });
      resetBtn.addEventListener('click', async () => {
        state.user = state.user || {};
        state.user.bannerUrl = null;
        state.user.bannerCustom = false;
        save();
        // Re-fetch Discord pour récupérer l'URL de la bannière Discord (si l'utilisateur en a une)
        try { if (typeof window.__autoResyncDiscord === 'function') await window.__autoResyncDiscord(); } catch(_){}
        refreshPrev();
        if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
        showToast('↩️', 'Bannière réinitialisée', 'On utilise celle de Discord');
      });
    })();

    // Fake-Nitro decoration picker (custom CSS effects around the avatar)
    (function bindFakeDecoPicker(){
      const grid = document.getElementById('accDecoGrid');
      if (!grid) return;
      const tiles = grid.querySelectorAll('.acc-deco-tile');
      function applyActive(val){
        tiles.forEach(t => t.classList.toggle('selected', t.dataset.deco === (val || 'none')));
      }
      tiles.forEach(t => {
        t.addEventListener('click', () => {
          if (!state.user || !state.user.boost) { openBoostModal(); return; }
          const val = t.dataset.deco === 'none' ? null : t.dataset.deco;
          state.user.fakeDeco = val;
          // Enabling a decoration also enables fakeNitro (otherwise it wouldn't render)
          if (val) {
            state.user.fakeNitro = true;
            const tg = document.getElementById('boostFakeNitro');
            if (tg) tg.checked = true;
          }
          save();
          applyActive(t.dataset.deco);
          if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
          if (typeof ensureDeck === 'function' && document.body.getAttribute('data-screen') === 'swipe') ensureDeck();
        });
      });
      applyActive((state.user && state.user.fakeDeco) || 'none');
      window.__refreshDecoPicker = () => applyActive((state.user && state.user.fakeDeco) || 'none');
    })();

    /* ===== Discord avatar-decoration picker (real Discord shop decos) =====
       Loads assets/discord-decos.json (hash + label list) and renders a searchable
       grid. Each tile is the real Discord PNG served by cdn.discordapp.com. */
    (function bindDiscordDecoPicker(){
      const grid = document.getElementById('ddDecoGrid');
      const searchEl = document.getElementById('ddDecoSearch');
      if (!grid || !searchEl) return;
      const DD_CDN = (hash) => `https://cdn.discordapp.com/avatar-decoration-presets/${hash}.png?size=128&passthrough=true`;
      let _decos = null;
      let _selectedHash = (state.user && state.user.decorationHash) || '';
      function applySelected(){
        grid.querySelectorAll('.dd-deco-tile').forEach(t => {
          t.classList.toggle('selected', (t.dataset.hash || '') === _selectedHash);
        });
      }
      function tileHTML(d){
        const url = DD_CDN(d.hash);
        const safeName = escapeHtmlMini(d.label || d.hash);
        return `<button type="button" class="dd-deco-tile" data-hash="${escapeHtmlMini(d.hash)}" data-label="${safeName}" title="${safeName}">
          <img src="${url}" alt="${safeName}" loading="lazy" decoding="async" />
          <span class="dd-deco-name">${safeName}</span>
        </button>`;
      }
      function render(filter){
        if (!_decos) return;
        const q = (filter || '').trim().toLowerCase();
        const items = q
          ? _decos.filter(d => (d.label || '').toLowerCase().includes(q))
          : _decos;
        // Keep the "Aucune" tile (already in HTML), append filtered
        grid.querySelectorAll('.dd-deco-tile:not(.dd-deco-tile--none)').forEach(el => el.remove());
        if (!items.length) {
          grid.insertAdjacentHTML('beforeend', '<div class="dd-deco-empty-wrap">Aucun résultat</div>');
          return;
        }
        grid.insertAdjacentHTML('beforeend', items.slice(0, 60).map(tileHTML).join(''));
        applySelected();
      }
      function pick(hash, label){
        if (!state.user || !state.user.boost) { openBoostModal(); return; }
        _selectedHash = hash || '';
        state.user = state.user || {};
        state.user.decorationHash = _selectedHash || null;
        state.user.decoCustom = !!_selectedHash;
        state.user.decorationUrl = _selectedHash ? DD_CDN(_selectedHash) : (state.user._originalDecorationUrl || null);
        save();
        applySelected();
        if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
        if (typeof ensureDeck === 'function' && document.body.getAttribute('data-screen') === 'swipe') ensureDeck();
        if (_selectedHash) showToast('✨', 'Décoration appliquée', label || _selectedHash);
        else showToast('↩️', 'Décoration retirée', 'Aucune');
      }
      grid.addEventListener('click', (e) => {
        const t = e.target.closest('.dd-deco-tile');
        if (!t) return;
        pick(t.dataset.hash || '', t.dataset.label || '');
      });
      searchEl.addEventListener('input', (e) => render(e.target.value));
      // Load decorations list (cached by browser after first fetch)
      fetch('assets/discord-decos.json')
        .then(r => r.ok ? r.json() : [])
        .then(arr => {
          _decos = Array.isArray(arr) ? arr : [];
          render('');
        })
        .catch(() => { _decos = []; });
      window.__refreshDiscordDecoPicker = () => {
        _selectedHash = (state.user && state.user.decorationHash) || '';
        applySelected();
      };
    })();

    // Music start time slider
    (function bindMusicStartTime(){
      const sl = document.getElementById('musicStartTime');
      if (!sl) return;
      sl.addEventListener('input', () => {
        const v = parseInt(sl.value, 10);
        document.getElementById('musicStartVal').textContent = v + 's';
        state.user = state.user || {};
        state.user.musicStartTime = v;
        save();
      });
    })();

    /* Heart FAB — shows count of likes received */
    (function bindHeartFab(){
      const fab = document.getElementById('heartFab');
      const badge = document.getElementById('heartFabBadge');
      if (!fab) return;
      function refresh(){
        const n = (typeof LIKED_ME !== 'undefined') ? LIKED_ME.length : ((state.user && state.user.likesReceived) || 0);
        badge.textContent = String(n);
        badge.style.display = n > 0 ? 'grid' : 'none';
      }
      refresh();
      window.__heartFabRefresh = refresh;
      fab.addEventListener('click', async () => {
        const panel = document.getElementById('likedPanel');
        if (panel) panel.setAttribute('data-open', 'true');
        if (typeof refreshLikesReceived === 'function') await refreshLikesReceived(); // vraies données
        if (typeof renderLikedMe === 'function') renderLikedMe();
      });
      // Rafraîchit le compteur de likes reçus régulièrement + au démarrage
      if (typeof refreshLikesReceived === 'function') {
        refreshLikesReceived();
        setInterval(refreshLikesReceived, 60000);
      }
    })();

    /* ===== Discord webhook notifications ===== */
    /* Build a stable PNG avatar URL from a profile. Discord webhooks need a real
       https:// image for `thumbnail.url` — gradient + initial cards have no URL,
       so we fall back to ui-avatars.com (free, CORS-friendly, returns a PNG). */
    function profileToAvatarUrl(p){
      if (!p) return null;
      if (p.avatarUrl && /^https?:/i.test(p.avatarUrl)) return p.avatarUrl;
      const name = encodeURIComponent(p.name || p.initial || '?');
      const c1   = (p.c1 || '#9146FF').replace('#', '');
      return `https://ui-avatars.com/api/?name=${name}&size=128&background=${c1}&color=fff&bold=true&format=png`;
    }
    /* Send an embed to the user's Discord webhook. type ∈ 'like'|'match'|'message'|'test'. */
    async function sendDiscordNotif(type, p, extra){
      const u = state.user || {};
      const url = (u.discordWebhook || '').trim();
      if (!url || !/^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\//i.test(url)) return false;
      const enabled = u.notifTypes || {};
      if (type !== 'test' && !enabled[type]) return false;
      const meta = {
        like:    { title: '❤️ Nouveau like sur Matefindr',    color: 0xFF4FA0, desc: `**${p?.name || 'Quelqu\'un'}** t'a liké !` },
        match:   { title: '💞 C\'est un match !',           color: 0x9146FF, desc: `Tu as matché avec **${p?.name || 'quelqu\'un'}** sur Matefindr.` },
        message: { title: '💬 Nouveau message Matefindr',     color: 0x5BE9FF, desc: `**${p?.name || 'Quelqu\'un'}** t'a écrit : ${extra ? `\n> ${String(extra).slice(0,200)}` : ''}` },
        test:    { title: '🔔 Notification de test',        color: 0x3BD17C, desc: `Si tu vois ce message dans Discord, ton webhook est bien configuré !` },
      }[type] || null;
      if (!meta) return false;
      const thumbUrl = profileToAvatarUrl(p);
      const body = {
        username: 'Matefindr',
        avatar_url: 'https://ui-avatars.com/api/?name=T&size=128&background=9146FF&color=fff&bold=true&format=png',
        embeds: [{
          title: meta.title,
          description: meta.desc,
          color: meta.color,
          thumbnail: thumbUrl ? { url: thumbUrl } : undefined,
          timestamp: new Date().toISOString(),
          footer: { text: 'Matefindr' },
        }],
      };
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return r.ok;
      } catch (e) {
        console.warn('Discord webhook failed', e);
        return false;
      }
    }
    window.sendDiscordNotif = sendDiscordNotif;

    /* Sync notif prefs to Supabase so the server-side Edge Function can read them.
       When Matefindr runs against the real backend (likes/matches/messages tables +
       database webhooks → Edge Function "notify"), this is what makes the Discord
       webhook fire even when the user's tab is closed. */
    async function syncNotifPrefsToSupabase(){
      try {
        if (!window.__supa) return;
        const { data: { user } } = await window.__supa.auth.getUser();
        if (!user) return;
        const u = state.user || {};
        const t = u.notifTypes || {};
        await window.__supa.from('user_notif_prefs').upsert({
          user_id:         user.id,
          discord_webhook: u.discordWebhook || null,
          notif_like:      !!t.like,
          notif_match:     !!t.match,
          notif_message:   !!t.message,
          display_name:    u.displayName || null,
          avatar_url:      u.avatarUrl || null,
          c1:              u.profileColor || '#36393F',
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (e) { console.warn('[Matefindr] syncNotifPrefs failed (table user_notif_prefs missing?):', e?.message || e); }
    }
    window.__syncNotifPrefs = syncNotifPrefsToSupabase;

    /* Bind the Paramètres → Notifications Discord panel */
    (function bindDiscordNotifs(){
      const urlEl = document.getElementById('accDiscordWebhook');
      const tg    = { like: document.getElementById('notifLike'), match: document.getElementById('notifMatch'), message: document.getElementById('notifMessage') };
      const testBtn = document.getElementById('notifTestBtn');
      const testStatus = document.getElementById('notifTestStatus');
      if (!urlEl) return;
      // Hydrate from state
      function hydrate(){
        state.user = state.user || {};
        urlEl.value = state.user.discordWebhook || '';
        const t = state.user.notifTypes || {};
        tg.like.checked    = !!t.like;
        tg.match.checked   = !!t.match;
        tg.message.checked = !!t.message;
      }
      hydrate();
      window.__hydrateDiscordNotifs = hydrate;
      // Debounced sync (URL field fires lots of input events)
      let _syncTimer = null;
      function scheduleSync(){
        clearTimeout(_syncTimer);
        _syncTimer = setTimeout(syncNotifPrefsToSupabase, 600);
      }
      urlEl.addEventListener('input', () => {
        state.user = state.user || {};
        state.user.discordWebhook = urlEl.value.trim();
        save();
        scheduleSync();
      });
      Object.entries(tg).forEach(([k, el]) => {
        el.addEventListener('change', () => {
          state.user = state.user || {};
          state.user.notifTypes = Object.assign({}, state.user.notifTypes || {}, { [k]: el.checked });
          save();
          scheduleSync();
        });
      });
      testBtn.addEventListener('click', async () => {
        testStatus.textContent = 'Envoi…';
        testStatus.style.color = '#b9bbbe';
        const me = state.user || {};
        const fakeMe = {
          name: me.displayName || 'Toi',
          initial: (me.displayName || 'T').charAt(0).toUpperCase(),
          avatarUrl: me.avatarUrl,
          c1: '#9146FF', c2: '#FF7EB6',
        };
        const ok = await sendDiscordNotif('test', fakeMe);
        testStatus.textContent = ok ? '✅ Envoyé ! Vérifie ton serveur Discord.' : '❌ Échec — URL invalide ?';
        testStatus.style.color = ok ? '#3BD17C' : '#FF4FA0';
        setTimeout(() => { testStatus.textContent = ''; }, 5000);
      });
    })();

    /* ===== Orb edit overlay (fullscreen profile preview + symmetric "+" layout) ===== */
    function openOrbEditOverlay(){
      const overlay = document.getElementById('orbEditOverlay');
      const wrap    = document.getElementById('oeoCardWrap');
      if (!overlay || !wrap) return;
      // Re-render the profile card big inside the overlay
      const myP = (typeof buildUserProfile === 'function') ? buildUserProfile() : null;
      wrap.innerHTML = '';
      if (myP) {
        const card = buildCard(myP, false);
        card.style.cssText += ';position:absolute !important;inset:0 !important;opacity:1 !important;transform:none !important;cursor:default !important;pointer-events:auto';
        wrap.appendChild(card);
        if (typeof renderContextGifs === 'function') renderContextGifs(wrap); // montre aussi les GIFs (contexte)
      } else {
        wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#b9bbbe">Pas encore de profil — connecte-toi d\'abord.</div>';
      }
      overlay.setAttribute('data-show', 'true');
      // Reset add panel
      document.getElementById('oeoAddPanel').setAttribute('data-open', 'false');
      document.getElementById('oeoSugg').innerHTML = '';
      document.getElementById('oeoSearch').value = '';
      // Render the symmetric orb layout (existing bubbles + floating "+")
      // Wait a frame so the card has a measurable bounding box
      requestAnimationFrame(renderOrbEditLayout);
    }
    /* Render the existing user orbs in two symmetric columns around the profile card,
       and add a transparent "+" bubble at the next position.
       Layout rules :
         - 1ère bulle au milieu-gauche
         - 2ème au milieu-droite (même y)
         - 3ème en bas-gauche (les bulles gauche remontent pour rester centrées)
         - 4ème en bas-droite (idem côté droit)
         - etc.
       Implémenté en split [pair → gauche, impair → droite], "+" sur la colonne qui
       a le moins de bulles (gauche en cas d'égalité). */
    function renderOrbEditLayout(){
      const stage = document.getElementById('oeoStage');
      const wrap  = document.getElementById('oeoCardWrap');
      if (!stage || !wrap) return;
      stage.querySelectorAll('.oeo-orb, .oeo-add-fab').forEach(el => el.remove());
      const orbs = (state.profile && state.profile.userOrbs) || [];
      const canAddMore = orbs.length < (typeof orbBudget === 'function' ? orbBudget() : 4);

      const sRect = stage.getBoundingClientRect();
      const cRect = wrap.getBoundingClientRect();
      const cx = (cRect.left + cRect.width / 2) - sRect.left;
      const cy = (cRect.top  + cRect.height / 2) - sRect.top;
      // Lit la taille effective depuis le CSS — suit automatiquement les media queries
      // (115px desktop, 70px mobile <780px). Garde l'éditeur À LA MÊME ÉCHELLE que le swipe.
      const orbR = (function(){
        const probe = document.createElement('div');
        probe.className = 'oeo-orb';
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        stage.appendChild(probe);
        const w = probe.offsetWidth || 115;
        probe.remove();
        return w / 2;
      })();
      const pad = 6;
      // Si le panel "+" est ouvert (à droite), on réduit la zone utile pour ne pas
      // poser de bulles sous le panel.
      const panel = document.getElementById('oeoAddPanel');
      const panelOpen = panel && panel.getAttribute('data-open') === 'true';
      const panelLeft = panelOpen ? (panel.getBoundingClientRect().left - sRect.left) : sRect.width;
      const availLeft  = pad + orbR;
      const availRight = Math.min(sRect.width, panelLeft) - pad - orbR;
      const availTop   = pad + orbR;
      const availBot   = sRect.height - pad - orbR;
      const clampX = (x) => Math.max(availLeft, Math.min(availRight, x));
      const clampY = (y) => Math.max(availTop,  Math.min(availBot,  y));

      // SAME normalized layout as the swipe card (orbRelLayout) → identical placement.
      const { rel, plus } = orbRelLayout(orbs, canAddMore);

      // PROPORTIONNEL : si la position par défaut (auto) sort de la zone, on
      // resserre uniformément TOUTES les bulles auto (échelle X et Y) pour qu'elles
      // rentrent — pas d'empilement au bord. Les bulles custom (drag) gardent
      // leur position absolue : elles sont juste clampées si elles débordent.
      const isCustom = (o) => o && typeof o.customX === 'number' && typeof o.customY === 'number';
      let maxAutoRx = 0, maxAutoRy = 0;
      rel.forEach((r, o) => {
        if (!isCustom(o)) {
          maxAutoRx = Math.max(maxAutoRx, Math.abs(r.rx));
          maxAutoRy = Math.max(maxAutoRy, Math.abs(r.ry));
        }
      });
      if (plus) {
        maxAutoRx = Math.max(maxAutoRx, Math.abs(plus.rx));
        maxAutoRy = Math.max(maxAutoRy, Math.abs(plus.ry));
      }
      // Espace disponible de chaque côté du centre carte (en px), puis fraction max
      // que peut atteindre |rx| sans déborder
      const sideXmax = Math.min(cx - availLeft, availRight - cx);
      const sideYmax = Math.min(cy - availTop,  availBot  - cy);
      const maxAllowedRx = sideXmax / cRect.width;
      const maxAllowedRy = sideYmax / cRect.height;
      const scaleX = (maxAutoRx > maxAllowedRx) ? (maxAllowedRx / maxAutoRx) : 1;
      const scaleY = (maxAutoRy > maxAllowedRy) ? (maxAllowedRy / maxAutoRy) : 1;
      const scale  = Math.min(scaleX, scaleY); // échelle uniforme → garde les proportions

      const toPx = (r, custom) => {
        const sx = custom ? 1 : scale;
        const sy = custom ? 1 : scale;
        return { x: clampX(cx + r.rx * sx * cRect.width), y: clampY(cy + r.ry * sy * cRect.height) };
      };

      // Garde en mémoire les positions (px) déjà occupées pour empêcher le "+" de chevaucher.
      const occupied = [];
      orbs.forEach(o => {
        const r = rel.get(o); if (!r) return;
        const p = toPx(r, isCustom(o));
        occupied.push({ x: p.x, y: p.y });
        stage.appendChild(makeMiniOrb(o, p.x - orbR, p.y - orbR, orbs.indexOf(o)));
      });
      if (plus){
        let pp = toPx(plus, false);
        // Le "+" doit être proche de la carte (par construction de plus.rx ~ COL0) mais
        // ne doit pas chevaucher d'autres bulles. On le pousse hors collision.
        const minGap = orbR * 2 + 6;
        for (let pass = 0; pass < 8; pass++){
          let collided = false;
          for (const o of occupied){
            const dxC = pp.x - o.x, dyC = pp.y - o.y;
            const dist = Math.hypot(dxC, dyC) || 0.001;
            if (dist < minGap){
              const push = (minGap - dist) + 1;
              pp.x += (dxC / dist) * push;
              pp.y += (dyC / dist) * push;
              collided = true;
            }
          }
          pp.x = clampX(pp.x); pp.y = clampY(pp.y);
          if (!collided) break;
        }
        // Évite la carte centrale (ne traverse pas)
        const cardL = cRect.left - sRect.left, cardT = cRect.top - sRect.top;
        const cardR = cardL + cRect.width, cardB = cardT + cRect.height;
        if (pp.x > cardL && pp.x < cardR && pp.y > cardT && pp.y < cardB){
          const distL = pp.x - cardL, distR = cardR - pp.x;
          pp.x = (distL < distR) ? Math.max(availLeft, cardL - 2) : Math.min(availRight, cardR + 2);
        }
        stage.appendChild(makeAddFab(pp.x - orbR, pp.y - orbR));
      }
    }
    function makeMiniOrb(o, leftPx, topPx, indexInUserOrbs){
      const el = document.createElement('div');
      el.className = 'oeo-orb';
      el.dataset.kind = o.kind;
      el.style.left = leftPx + 'px';
      el.style.top  = topPx  + 'px';
      el.title = `${o.title}${o.rank ? ' · ' + o.rank : ''} — glisse pour repositionner`;
      const fallback = {music:'🎵', game:'🎮', film:'🎬'}[o.kind] || '✨';
      if (o.cover) {
        el.innerHTML = `<img src="${o.cover}" alt="${escapeHtmlMini(o.title)}" draggable="false">`;
      } else {
        el.innerHTML = `<span class="oeo-orb-ico">${fallback}</span>`;
      }
      // Rank as a round mini-bubble (with the tier icon) orbiting the game orb
      if (o.kind === 'game' && o.rank){
        const v = rankVisual(o.rank);
        const iconUrl = rankIconUrl(o.title, o.rank);
        const iconHtml = iconUrl
          ? `<img class="oeo-orb-rank-img" src="${iconUrl}" alt="${escapeHtmlMini(o.rank)}" loading="lazy" decoding="async">`
          : `<span class="oeo-orb-rank-ico">${v.ico}</span>`;
        const rk = document.createElement('span');
        rk.className = 'oeo-orb-rank-orbit';
        rk.innerHTML = `<span class="oeo-orb-rank-ball${iconUrl ? ' oeo-orb-rank-ball--img' : ''}" style="--rc1:${v.c1};--rc2:${v.c2}" title="${escapeHtmlMini(o.rank)}">${iconHtml}</span>`;
        el.appendChild(rk);
      }
      // Delete (×) chip
      const del = document.createElement('button');
      del.className = 'oeo-orb-del';
      del.type = 'button';
      del.setAttribute('aria-label', 'Supprimer cette bulle');
      del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (indexInUserOrbs >= 0) (state.profile.userOrbs || []).splice(indexInUserOrbs, 1);
        save();
        renderUserOrbs();
        if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
        if (typeof window.__refreshBullesCta === 'function') window.__refreshBullesCta();
        renderOrbEditLayout();
      });
      el.appendChild(del);
      // Mini "+" button (smaller than the orb) for game orbs → add/edit rank & clip
      if (o.kind === 'game') {
        const meta = document.createElement('button');
        meta.className = 'oeo-orb-meta';
        meta.type = 'button';
        meta.setAttribute('aria-label', 'Ajouter rank / clip');
        meta.innerHTML = '+';
        meta.title = o.rank || o.clipUrl ? 'Modifier rank / clip' : 'Ajouter rank / clip';
        meta.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (typeof openGameMetaModal === 'function') openGameMetaModal(o);
        });
        el.appendChild(meta);
      }
      // ===== Drag & drop pour positionner librement la bulle =====
      // L'utilisateur peut attraper une bulle et la lâcher où il veut autour de la carte.
      // La position est sauvegardée en fraction relative à la carte (customX, customY),
      // et ré-appliquée à la fois dans cet overlay et sur la carte de swipe.
      let dragMoved = false;
      let dragData = null;
      let recentDragEnd = 0;
      el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.oeo-orb-del') || e.target.closest('.oeo-orb-meta')) return;
        if (e.button !== undefined && e.button !== 0) return;
        try { el.setPointerCapture(e.pointerId); } catch(_){}
        const stage = document.getElementById('oeoStage');
        const wrap  = document.getElementById('oeoCardWrap');
        if (!stage || !wrap) return;
        const sRect  = stage.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        dragData = {
          startMouseX: e.clientX, startMouseY: e.clientY,
          startLeft: elRect.left - sRect.left,
          startTop:  elRect.top  - sRect.top,
          stage, wrap,
        };
        dragMoved = false;
      });
      el.addEventListener('pointermove', (e) => {
        if (!dragData) return;
        const dx = e.clientX - dragData.startMouseX;
        const dy = e.clientY - dragData.startMouseY;
        if (!dragMoved && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
          dragMoved = true;
          el.classList.add('oeo-orb--dragging');
          el.style.zIndex = '20';
          el.style.transition = 'none';
          el.style.cursor = 'grabbing';
        }
        if (dragMoved) {
          const sRect = dragData.stage.getBoundingClientRect();
          const w = el.offsetWidth, h = el.offsetHeight;
          const pad = 4;
          const panel = document.getElementById('oeoAddPanel');
          const panelOpen = panel && panel.getAttribute('data-open') === 'true';
          const panelLeft = panelOpen ? (panel.getBoundingClientRect().left - sRect.left) : sRect.width;
          const maxLeft = Math.max(pad, Math.min(sRect.width - w - pad, panelLeft - w - pad));
          const maxTop  = sRect.height - h - pad;
          let left = Math.max(pad, Math.min(maxLeft, dragData.startLeft + dx));
          let top  = Math.max(pad, Math.min(maxTop,  dragData.startTop  + dy));

          // === Évite la carte de profil (la bulle ne peut PAS la traverser) ===
          const cardRect = dragData.wrap.getBoundingClientRect();
          const cardL = cardRect.left - sRect.left;
          const cardT = cardRect.top  - sRect.top;
          const cardR = cardL + cardRect.width;
          const cardB = cardT + cardRect.height;
          // bulle = cercle de rayon w/2 centré sur (left+w/2, top+h/2)
          const cx = left + w/2, cy = top + h/2;
          // Si le centre de la bulle entre dans la zone de la carte → on pousse au bord le plus proche
          if (cx > cardL && cx < cardR && cy > cardT && cy < cardB){
            // Distance à chaque bord (côté pointer)
            const distL = cx - cardL, distR = cardR - cx, distT = cy - cardT, distB = cardB - cy;
            const minDist = Math.min(distL, distR, distT, distB);
            if (minDist === distL)      left = cardL - w/2;          // pousse à gauche
            else if (minDist === distR) left = cardR - w/2;          // pousse à droite
            else if (minDist === distT) top  = cardT - h/2;          // pousse en haut
            else                        top  = cardB - h/2;          // pousse en bas
            // Re-clamp dans le stage
            left = Math.max(pad, Math.min(maxLeft, left));
            top  = Math.max(pad, Math.min(maxTop,  top));
          }

          // === Évite les autres bulles (pas de chevauchement) ===
          const others = [...dragData.stage.querySelectorAll('.oeo-orb')].filter(n => n !== el);
          const minGap = 4; // px de marge entre cercles
          for (let pass = 0; pass < 4; pass++){
            let collided = false;
            for (const other of others){
              const oRect = other.getBoundingClientRect();
              const ow = other.offsetWidth, oh = other.offsetHeight;
              const ocx = (oRect.left - sRect.left) + ow/2;
              const ocy = (oRect.top  - sRect.top)  + oh/2;
              const cx2 = left + w/2, cy2 = top + h/2;
              const dxC = cx2 - ocx, dyC = cy2 - ocy;
              const dist = Math.hypot(dxC, dyC) || 0.001;
              const minDist = (w + ow) / 2 + minGap;
              if (dist < minDist){
                // Pousse la bulle dans la direction opposée à la collision
                const push = (minDist - dist) + 0.5;
                left += (dxC / dist) * push;
                top  += (dyC / dist) * push;
                collided = true;
              }
            }
            left = Math.max(pad, Math.min(maxLeft, left));
            top  = Math.max(pad, Math.min(maxTop,  top));
            if (!collided) break;
          }

          el.style.left = left + 'px';
          el.style.top  = top  + 'px';
        }
      });
      function endDrag(e){
        if (!dragData) return;
        try { el.releasePointerCapture(e.pointerId); } catch(_){}
        el.classList.remove('oeo-orb--dragging');
        el.style.zIndex = '';
        el.style.transition = '';
        el.style.cursor = '';
        if (dragMoved) {
          // Position finale : centre de la bulle relatif au centre de la carte, en fraction de la taille carte
          const elRect   = el.getBoundingClientRect();
          const cardRect = dragData.wrap.getBoundingClientRect();
          const cx = (elRect.left + elRect.width / 2);
          const cy = (elRect.top  + elRect.height / 2);
          const ccx = cardRect.left + cardRect.width  / 2;
          const ccy = cardRect.top  + cardRect.height / 2;
          o.customX = (cx - ccx) / cardRect.width;
          o.customY = (cy - ccy) / cardRect.height;
          try { save(); } catch(_){}
          if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
          recentDragEnd = Date.now();
        }
        dragData = null;
      }
      el.addEventListener('pointerup', endDrag);
      el.addEventListener('pointercancel', endDrag);
      // Click on the orb itself → play the content (clip for game, audio for music)
      // Ignore le click si on vient juste de drag (évite ouvrir le clip après un déplacement)
      el.addEventListener('click', (ev) => {
        if (Date.now() - recentDragEnd < 250) { ev.preventDefault(); return; }
        if (typeof playOrb === 'function') playOrb(o, el);
      });
      return el;
    }
    function makeAddFab(leftPx, topPx){
      const btn = document.createElement('button');
      btn.className = 'oeo-add-fab';
      btn.type = 'button';
      btn.title = 'Ajouter une bulle';
      btn.style.left = leftPx + 'px';
      btn.style.top  = topPx  + 'px';
      btn.innerHTML = '<span class="oeo-plus">+</span>';
      btn.addEventListener('click', () => {
        document.getElementById('oeoAddPanel').setAttribute('data-open', 'true');
        setTimeout(() => document.getElementById('oeoSearch').focus(), 200);
      });
      return btn;
    }
    window.renderOrbEditLayout = renderOrbEditLayout;
    function closeOrbEditOverlay(){
      document.getElementById('orbEditOverlay').setAttribute('data-show', 'false');
      document.getElementById('oeoAddPanel').setAttribute('data-open', 'false');
      // Defensive : force a save + refresh of the account preview/counter
      // so any in-memory orb that wasn't yet persisted gets locked in.
      try { save(); } catch(_){}
      if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
      if (typeof renderUserOrbs === 'function') renderUserOrbs();
      if (typeof window.__refreshBullesCta === 'function') window.__refreshBullesCta();
      const n = ((state.profile && state.profile.userOrbs) || []).length;
      console.log('[Matefindr] orbs after close:', n, state.profile && state.profile.userOrbs);
    }
    window.openOrbEditOverlay = openOrbEditOverlay;

    (function bindOrbEditOverlay(){
      const overlay = document.getElementById('orbEditOverlay');
      if (!overlay) return;
      document.getElementById('oeoBackdrop')?.addEventListener('click', closeOrbEditOverlay);
      document.getElementById('oeoClose')?.addEventListener('click', closeOrbEditOverlay);
      document.getElementById('oeoPanelClose')?.addEventListener('click', () => {
        document.getElementById('oeoAddPanel').setAttribute('data-open', 'false');
      });
      // The "+" FAB is now created dynamically by renderOrbEditLayout()
      // and opens the add panel via the click handler set in makeAddFab().
      // Category tabs
      let oeoKind = 'music';
      document.querySelectorAll('#oeoCats button').forEach(b => {
        b.addEventListener('click', () => {
          if (isOrbKindSoon(b.dataset.kind)) { showOrbKindSoonToast(); return; }
          document.querySelectorAll('#oeoCats button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          oeoKind = b.dataset.kind;
          const ph = { music:'Recherche un son Spotify…', game:'ex: Valorant, Minecraft…', film:'ex: One Piece, Inception…' };
          document.getElementById('oeoSearch').placeholder = ph[oeoKind] || 'Tape ici…';
          document.getElementById('oeoSearch').disabled = false;
          runOeoSearch(document.getElementById('oeoSearch').value);
        });
      });
      // Live search (reuses the curated lists + cover fetcher already in the app)
      let _oeoDebounce = null;
      async function runOeoSearch(q){
        clearTimeout(_oeoDebounce);
        _oeoDebounce = setTimeout(async () => {
          const sugg = document.getElementById('oeoSugg');
          if (isOrbKindSoon(oeoKind)) {
            sugg.innerHTML = '<div style="color:#FFD15C;font-size:12.5px;padding:8px;line-height:1.45">Bientôt redisponible — les bulles jeu et série·film reviennent très bientôt.</div>';
            return;
          }
          sugg.innerHTML = '<div style="color:#72767d;font-size:12.5px;padding:8px">Chargement…</div>';
          let results = [];
          if (oeoKind === 'music') {
            if (!q.trim()) { sugg.innerHTML = '<div style="color:#72767d;font-size:12.5px;padding:8px">Tape le nom d\'un son…</div>'; return; }
            const items = await searchSpotifyTracks(q, 8);
            results = (items || []).map(it => ({
              name: it.name, sub: it.artist, cover: it.cover,
              orb: { kind:'music', title: it.name, sub: it.artist, cover: it.cover, previewUrl: it.previewUrl || null },
            }));
          } else {
            const titles = curatedMatches(q, oeoKind, 10);
            results = titles.map(t => ({ name:t, sub:'', cover:null, orb:{ kind: oeoKind, title: t } }));
            // Fire-and-forget : prefetch covers
            results.forEach(async (r, i) => {
              const cv = await fetchSuggCover(oeoKind, r.orb.title);
              if (cv) {
                r.cover = cv; r.orb.cover = cv;
                const node = sugg.children[i];
                if (node) {
                  const img = node.querySelector('img');
                  if (img) img.src = cv;
                }
              }
            });
          }
          if (!results.length) {
            sugg.innerHTML = '<div style="color:#72767d;font-size:12.5px;padding:8px">Aucun résultat</div>';
            return;
          }
          sugg.innerHTML = '';
          const fallbackIcon = {music:'🎵', game:'🎮', film:'🎬'}[oeoKind] || '✨';
          results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'sp-item';
            item.innerHTML =
              (r.cover ? `<img src="${r.cover}" alt="" loading="lazy" decoding="async">` : `<div class="sp-no-cover">${fallbackIcon}</div>`) +
              `<div class="sp-info"><div class="sp-title">${escapeHtmlMini(r.name)}</div>` +
              `<div class="sp-artist">${escapeHtmlMini(r.sub || '')}</div></div>`;
            item.addEventListener('click', async () => {
              if (isOrbKindSoon(oeoKind) || isOrbKindSoon(r.orb.kind)) { showOrbKindSoonToast(); return; }
              // Make sure we have a cover before adding
              if (!r.cover && oeoKind !== 'music') {
                r.cover = await fetchSuggCover(oeoKind, r.orb.title);
                r.orb.cover = r.cover;
              }
              if (!r.cover && oeoKind !== 'music') { showToast('⚠️','Pas d\'image','Choisis un autre titre'); return; }
              state.profile = state.profile || {};
              state.profile.userOrbs = state.profile.userOrbs || [];
              if (orbsUsed() >= orbBudget()) { showToast('🫧','Limite atteinte', orbBudget()+' bulles max'); return; }
              // Empêche les doublons (même kind + même titre normalisé)
              const dupKey = (r.orb.title || '').toLowerCase().trim();
              const isDup = state.profile.userOrbs.some(o => o.kind === r.orb.kind && (o.title || '').toLowerCase().trim() === dupKey);
              if (isDup) { showToast('⚠️','Déjà ajoutée', r.orb.title); return; }
              state.profile.userOrbs.push(r.orb);
              save();
              renderUserOrbs();
              if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
              if (typeof window.__refreshBullesCta === 'function') window.__refreshBullesCta();
              showToast(fallbackIcon, 'Bulle ajoutée', r.orb.title);
              // Re-render just the bubbles layout (keep card in place, close panel)
              renderOrbEditLayout();
              document.getElementById('oeoAddPanel').setAttribute('data-open', 'false');
              document.getElementById('oeoSearch').value = '';
              document.getElementById('oeoSugg').innerHTML = '';
            });
            sugg.appendChild(item);
          });
        }, 220);
      }
      document.getElementById('oeoSearch')?.addEventListener('input', e => runOeoSearch(e.target.value));
      // Esc closes the overlay
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.getAttribute('data-show') === 'true') closeOrbEditOverlay();
      });
      // Re-render layout on resize (keeps the columns aligned with the card)
      window.addEventListener('resize', () => {
        if (overlay.getAttribute('data-show') === 'true') renderOrbEditLayout();
      });
    })();

    document.getElementById('orbPreviewBtn')?.addEventListener('click', openOrbEditOverlay);
    document.getElementById('accountChip')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof finishShared === 'function' && (_sharedProfile || document.body.getAttribute('data-shared') === 'true')) {
        try { sessionStorage.setItem('mf_open_editor', '1'); } catch(_){}
        finishShared();
        return;
      }
      location.href = 'editor.html';
    });

    /* ===== Modales navbar : lien perso + paramètres (même fenêtres que l'éditeur) ===== */
    (function initAccountModals(){
      const AM = window.MFAccountModals;
      if (!AM) return;

      function fmtDate(iso){ try{ return new Date(iso).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}); }catch(_){ return '—'; } }

      function renderIndexSettings(body){
        const st = AM.readSite();
        const u = Object.assign({}, st.user || {}, state.user || {});
        const MV = window.MatefindrVolume;
        const volPct = Math.round((MV ? MV.getVol() : 0.5) * 100);
        let bill;
        if (u.boost) {
          const lifetime = u.boostPlan === 'lifetime';
          const promo = u.boostPromo;
          bill = `<b>Matefindr Boost</b> ${promo ? '· <span style="color:#5ee6a0">offert (code)</span>' : ''}<br>`
            + `<small>${lifetime ? 'Accès à vie — aucun prélèvement' : ('Mensuel · prochain paiement ' + (u.boostNextPayment ? fmtDate(u.boostNextPayment) : '—'))}</small>`;
        } else {
          bill = `<b>Gratuit</b><br><small>Aucun abonnement actif</small>`;
        }
        body.innerHTML = `
          <div class="set-sheet">
            <div class="ss-group">
              <div class="ss-lbl">Volume de la musique <span id="ssVolVal">${volPct}%</span></div>
              <input type="range" id="ssVol" min="0" max="100" value="${volPct}">
            </div>
            <div class="ss-group">
              <div class="ss-lbl">Abonnement &amp; facturation</div>
              <div class="ss-bill">${bill}</div>
              ${u.boost ? '' : '<button type="button" class="btn primary" id="ssBoost" style="width:100%;margin-top:9px">Passer à Matefindr Boost</button>'}
            </div>
            <div class="ss-group ss-danger">
              <div class="ss-lbl">Zone dangereuse</div>
              <button type="button" class="btn" id="ssLogout">Se déconnecter</button>
              <button type="button" class="btn ghost-danger" id="ssDelete">Supprimer mon compte</button>
            </div>
          </div>`;
        const vEl = body.querySelector('#ssVol');
        vEl.addEventListener('input', () => {
          const pct = parseInt(vEl.value, 10);
          body.querySelector('#ssVolVal').textContent = pct + '%';
          const v = pct / 100;
          if (MV) MV.setVol(v, true);
          state.user = state.user || {};
          state.user.musicVolume = v;
          if (typeof window.__mfVolRefresh === 'function') window.__mfVolRefresh();
          save();
        });
        body.querySelector('#ssBoost')?.addEventListener('click', () => { location.href = 'checkout.html?plan=monthly'; });
        body.querySelector('#ssLogout')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          try { btn.disabled = true; btn.textContent = 'Déconnexion…'; } catch (_) {}
          try { if (window.__supa) await window.__supa.auth.signOut(); } catch (_) {}
          clearDiscordTokenKeys();
          state = { user: null, profile: null };
          try { localStorage.removeItem('matefindr_state'); } catch (_) {}
          // Ne PAS save() ici : ça réécrirait {user:null} puis un autre onglet/éditeur
          // pourrait ressusciter Matefindr_user. L'état mémoire suffit + removeItem.
          setAuth(false);
          AM.closeSettingsPop();
          setScreen('landing');
          if (typeof refreshLandingCta === 'function') refreshLandingCta();
        });
        body.querySelector('#ssDelete')?.addEventListener('click', () => {
          if (!confirm('Supprimer définitivement ton compte Matefindr ? Toutes tes données locales seront effacées.')) return;
          try { localStorage.clear(); } catch (_) {}
          try { if (window.__supa) window.__supa.auth.signOut().catch(() => {}); } catch (_) {}
          state = { user: null, profile: null };
          setAuth(false);
          AM.closeSettingsPop();
          setScreen('landing');
        });
      }

      AM.initShareLink({
        buttons: ['navShareLink'],
        getSupa: () => window.__supa,
        toast: (m) => { if (typeof showToast === 'function') showToast('🔗', m, ''); },
        onSlugSaved(slug, changedAt) {
          state.user = state.user || {};
          state.user.slug = slug;
          if (changedAt) state.user.slugChangedAt = changedAt;
          save();
        }
      });

      AM.initSettings({
        buttons: ['navSettings'],
        render: renderIndexSettings
      });

      if (window.MatefindrTitlesQuests) {
        window.MatefindrTitlesQuests.init({
          questButtons: ['navQuests'],
          getUid: () => _myUidCache || window.__mfMyUid || null,
          getRatingRec: async () => {
            if (!_myUidCache) return null;
            if (!_reactionsCache[_myUidCache] && typeof loadReactions === 'function') {
              await loadReactions(_myUidCache);
            }
            return _reactionsCache[_myUidCache] || null;
          },
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const linkPop = document.getElementById('linkPop');
        const settingsPop = document.getElementById('settingsPop');
        if (linkPop && !linkPop.hidden) document.getElementById('linkClose')?.click();
        else if (settingsPop && !settingsPop.hidden) AM.closeSettingsPop();
      });
    })();
    /* Retour depuis l'éditeur :
       #account → écran Paramètres (le SEUL endroit où les réglages apparaissent, accessible uniquement via l'éditeur).
       #preview → aperçu direct du profil (mode aperçu sur le swipe), SANS passer par l'écran Paramètres. */
    /* ===== Lien de partage : matefindr.com/<slug> ouvre CE profil avec ❤️/✖️ ===== */
    function getSharedSlug(){
      try {
        const seg = decodeURIComponent((location.pathname || '').split('/').filter(Boolean)[0] || '');
        if (!seg || seg.includes('.')) return null;
        const reserved = window.__mfReservedSlugs || ['editor','index','settings','checkout','rules','admin','v2','assets','js','css','supabase','api','favicon'];
        if (reserved.includes(seg.toLowerCase())) return null;
        if (!/^[a-z0-9_-]{2,40}$/i.test(seg)) return null;
        return seg.toLowerCase();
      } catch(_) { return null; }
    }
    // Lit l'action en attente (like/dislike posé avant la connexion Discord) et la
    // considère PÉRIMÉE après 2 min : si l'OAuth a été annulé/interrompu, ce flag ne
    // doit jamais bloquer les lien de partage pour toujours (sinon plus aucun /<slug>
    // ne s'ouvre dans ce navigateur).
    function hasFreshPendingAction(){
      try {
        const raw = localStorage.getItem('matefindr_pending_action');
        if (!raw) return false;
        const pa = JSON.parse(raw);
        if (!pa || !pa.ts || (Date.now() - pa.ts) > 2 * 60 * 1000) {
          localStorage.removeItem('matefindr_pending_action');
          return false;
        }
        return true;
      } catch(_) { try { localStorage.removeItem('matefindr_pending_action'); } catch(_){} return false; }
    }
    /* Applique le preset choisi pour le LIEN PERSO (indépendant du profil équipé
       visible dans le deck). Snapshots éditeur → champs carte swipe. */
    function applySharePresetOverlay(prof){
      if (!prof || !Array.isArray(prof.presets)) return prof;
      const idx = prof.sharePresetIdx;
      if (typeof idx !== 'number' || idx < 0 || idx >= prof.presets.length) return prof;
      const snap = prof.presets[idx];
      if (!snap || typeof snap !== 'object') return prof;
      try {
        if (snap.username) { prof.name = snap.username; prof.initial = String(snap.username).charAt(0).toUpperCase(); }
        if (typeof snap.bio === 'string') prof.bio = snap.bio;
        if (snap.avatar && snap.avatar.url) {
          prof.avatarUrl = snap.avatar.url;
          prof.avatarPos = { posX: snap.avatar.posX, posY: snap.avatar.posY, scale: snap.avatar.scale };
        } else if (snap.avatar === null) {
          prof.avatarUrl = null; prof.avatarPos = null;
        }
        if (snap.banner && snap.banner.url) {
          prof.bannerUrl = snap.banner.url;
          prof.bannerPos = { posX: snap.banner.posX, posY: snap.banner.posY, scale: snap.banner.scale };
        } else if (snap.banner === null) {
          prof.bannerUrl = null; prof.bannerPos = null;
        }
        if (snap.voice && snap.voice.url) prof.profileVoice = snap.voice.url;
        else if (snap.voice === null) prof.profileVoice = null;
        if (snap.c1) prof.profileColor = snap.c1;
        if (snap.c2) prof.profileColor2 = snap.c2;
        if (snap.nameColor && /^#[0-9a-f]{6}$/i.test(snap.nameColor)) prof.nameColor = snap.nameColor;
        else if (snap.nameColor === null) prof.nameColor = null;
        if (snap.connUniformColor && /^#[0-9a-f]{6}$/i.test(snap.connUniformColor)) prof.connUniformColor = snap.connUniformColor;
        else if (snap.connUniformColor === null) prof.connUniformColor = null;
        prof.handleBlur = !!snap.handleBlur;
        if (snap.boostShowName === false) prof.showBoostName = false;
        else if (snap.boostShowName === true) prof.showBoostName = true;
        if (snap.bg) {
          if (snap.bg.type === 'preset') { prof.bg = snap.bg.value; prof.bgPos = null; }
          else if (snap.bg.type === 'custom' && snap.bg.value) {
            prof.bg = snap.bg.value;
            prof.bgPos = (!snap.bg.video && typeof snap.bg.posX === 'number')
              ? { posX: snap.bg.posX, posY: snap.bg.posY, scale: snap.bg.scale } : null;
          }
        }
        if (snap.orbColors && typeof snap.orbColors === 'object') prof.orbColors = snap.orbColors;
        if (snap.orbGlow && typeof snap.orbGlow === 'object') prof.orbGlow = snap.orbGlow;
        if (snap.connections && typeof snap.connections === 'object') prof.connections = snap.connections;
        prof.gifContour = (snap.gifContour !== false);
        prof.photoContour = (snap.photoContour !== false);
        const subByKind = { music:'musique', game:'jeu', anime:'série', film:'film' };
        const emoByKind = { music:'🎵', game:'🎮', anime:'📺', film:'🎬' };
        if (Array.isArray(snap.orbs)) {
          prof.orbs = snap.orbs.map(o => {
            const out = {
              kind: o.kind, title: o.title,
              sub: (o.kind === 'game' && o.rank) ? o.rank : (o.sub || subByKind[o.kind] || ''),
              emoji: emoByKind[o.kind] || '✨',
              cover: o.cover || null, previewUrl: o.previewUrl || null,
              rank: o.rank || null, clipUrl: o.clipUrl || null,
            };
            if (o.color && /^#[0-9a-f]{6}$/i.test(o.color)) out.color = o.color;
            if (o.glow === false) out.glow = false;
            if (o.contour === false) out.contour = false;
            if (typeof o.customX === 'number') { out.customX = o.customX; out.customY = o.customY; }
            else {
              const pm = o.posByMode || {};
              const d = pm.desktop || ((typeof o.x === 'number' && typeof o.y === 'number') ? { x: o.x, y: o.y } : null);
              if (d && typeof d.x === 'number') { out.customX = (d.x - 50) / 100; out.customY = (d.y - 50) / 100; }
            }
            if (o.posPortrait) out.posPortrait = o.posPortrait;
            else if (o.posByMode && o.posByMode.portrait && typeof o.posByMode.portrait.x === 'number') {
              out.posPortrait = { x: (o.posByMode.portrait.x - 50) / 100, y: (o.posByMode.portrait.y - 50) / 100 };
            }
            if (o.posLandscape) out.posLandscape = o.posLandscape;
            else if (o.posByMode && o.posByMode.landscape && typeof o.posByMode.landscape.x === 'number') {
              out.posLandscape = { x: (o.posByMode.landscape.x - 50) / 100, y: (o.posByMode.landscape.y - 50) / 100 };
            }
            return out;
          });
        }
        const mapStickerFields = (g) => {
          if (!g || typeof g !== 'object') return {};
          const o = {};
          if (g.posX != null) { o.posX = g.posX; o.posY = g.posY; o.scale = g.scale; }
          if (g.cropT) o.cropT = g.cropT;
          if (g.cropR) o.cropR = g.cropR;
          if (g.cropB) o.cropB = g.cropB;
          if (g.cropL) o.cropL = g.cropL;
          if (g.scaleX != null && g.scaleX !== 1) o.scaleX = g.scaleX;
          if (g.scaleY != null && g.scaleY !== 1) o.scaleY = g.scaleY;
          if (typeof g.z === 'number') o.z = g.z;
          return o;
        };
        const mapSticker = (g, urlKey) => {
          const pm = g.posByMode || {};
          const d = pm.desktop || { x: g.x, y: g.y, w: g.w, rot: g.rot };
          const url = g[urlKey] || g.url || g.preview || g.full || '';
          const fields = mapStickerFields(g);
          const out = Object.assign({
            preview: url, full: url, url,
            x: d.x, y: d.y, w: d.w, rot: d.rot,
          }, fields);
          if (pm.portrait) {
            out.portrait = Object.assign(
              { x: pm.portrait.x, y: pm.portrait.y, w: pm.portrait.w, rot: pm.portrait.rot },
              fields, mapStickerFields(pm.portrait)
            );
          }
          if (pm.landscape) {
            out.landscape = Object.assign(
              { x: pm.landscape.x, y: pm.landscape.y, w: pm.landscape.w, rot: pm.landscape.rot },
              fields, mapStickerFields(pm.landscape)
            );
          }
          // Snapshot writeState / preset : portrait|landscape déjà sérialisés avec crop/stretch
          if (g.portrait) {
            out.portrait = Object.assign(
              { x: g.portrait.x, y: g.portrait.y, w: g.portrait.w, rot: g.portrait.rot },
              fields, mapStickerFields(g.portrait)
            );
          }
          if (g.landscape) {
            out.landscape = Object.assign(
              { x: g.landscape.x, y: g.landscape.y, w: g.landscape.w, rot: g.landscape.rot },
              fields, mapStickerFields(g.landscape)
            );
          }
          return out;
        };
        if (Array.isArray(snap.gifs)) prof.gifs = snap.gifs.map(g => mapSticker(g, 'url'));
        if (Array.isArray(snap.photos)) prof.photos = snap.photos.map(p => mapSticker(p, 'url'));
      } catch (e) { console.warn('[Matefindr] applySharePresetOverlay', e); }
      return prof;
    }
    async function openSharedProfile(slug){
      // Nettoyage défensif : un lien de partage ne doit jamais s'ouvrir en mode aperçu.
      _previewMode = false;
      document.body.removeAttribute('data-preview');
      // Retour d'OAuth avec une action en attente → on ne ré-affiche PAS la carte ici ;
      // onLogin va rejouer l'action (like → renvoie à l'accueil ; réaction → rouvre ce
      // même profil en rappelant openSharedProfile() une fois l'action nettoyée).
      if (hasFreshPendingAction()) { try { history.replaceState(null,'','/'); } catch(_){} return; } // onLogin/setScreen révèlera
      let prof = null;
      try {
        const { data } = await window.__supa.from('profiles').select('*').eq('slug', slug).limit(1);
        if (data && data[0]) prof = applySharePresetOverlay(rowToProfile(data[0]));
      } catch(e){ console.warn('[Matefindr] shared profile fetch', e); }
      if (!prof) { try { history.replaceState(null,'','/'); } catch(_){} revealApp(); return; } // slug inconnu → app normale
      if (prof.disabled === true) { try { history.replaceState(null,'','/'); } catch(_){} showAccountDisabledMessage(); return; }
      // Propriétaire connecté sur son propre lien → aperçu visiteur (ne plus renvoyer
      // silencieusement à l'accueil : ça donnait l'impression que le lien était cassé).
      let isOwnLink = false;
      try {
        const { data: { session } } = await window.__supa.auth.getSession();
        if (session && prof.uid === session.user.id) isOwnLink = true;
      } catch(_){}
      prof._showViews = true;
      _sharedProfile = prof;
      document.body.setAttribute('data-shared', 'true');
      if (isOwnLink) document.body.setAttribute('data-shared-own', 'true');
      else document.body.removeAttribute('data-shared-own');
      // Compteur de vues : +1 une seule fois par navigateur pour ce profil (pas pour soi).
      if (!isOwnLink) {
        try {
          const seen = 'mf_viewed_' + prof.uid;
          if (!localStorage.getItem(seen)) {
            localStorage.setItem(seen, '1');
            window.__supa.rpc('bump_profile_views', { p_id: prof.uid }).then(() => {
              if (_sharedProfile) { _sharedProfile.views = (_sharedProfile.views || 0) + 1; if (document.body.getAttribute('data-screen') === 'swipe') softRefreshSwipeCard(); }
            }).catch(() => {});
          }
        } catch(_){}
      }
      setScreen('swipe'); // ensureDeckSync affiche _sharedProfile
    }
    async function handleSharedAction(action){
      const target = _sharedProfile;
      let session = null;
      try { ({ data:{ session } } = await window.__supa.auth.getSession()); } catch(_){}
      if (session) {
        if (action === 'like' && target && target.uid && typeof recordLike === 'function') recordLike(target);
        finishShared();
      } else {
        // Pas de compte → on mémorise l'action et on lance la connexion Discord (= création de compte).
        try { localStorage.setItem('matefindr_pending_action', JSON.stringify({ uid: target && target.uid, action, ts: Date.now() })); } catch(_){}
        if (typeof signInWithDiscord === 'function') signInWithDiscord();
        else if (window.signInWithDiscord) window.signInWithDiscord();
      }
    }
    function finishShared(){
      _sharedProfile = null;
      document.body.removeAttribute('data-shared');
      document.body.removeAttribute('data-shared-own');
      let openEditor = false;
      try { openEditor = sessionStorage.getItem('mf_open_editor') === '1'; sessionStorage.removeItem('mf_open_editor'); } catch(_){}
      if (openEditor) { location.href = 'editor.html'; return; }
      try { history.replaceState(null,'','/'); } catch(_){}
      if (typeof enterFullApp === 'function') enterFullApp();
    }
    // Au chargement : si l'URL est un slug, on ouvre le profil partagé (même sans être connecté).
    (function handleSharedLink(){
      // Retour d'OAuth avec une action en attente → onLogin s'en charge (et révèlera la page), on ne rouvre pas la carte.
      if (hasFreshPendingAction()) return;
      const slug = getSharedSlug();
      if (!slug) return;
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.__supa && typeof buildCard === 'function' && typeof setScreen === 'function') {
          clearInterval(iv);
          openSharedProfile(slug);
        } else if (tries > 100) { clearInterval(iv); revealApp(); }
      }, 100);
    })();

    (function handleEditorReturn(){
      const h = location.hash;
      if (h !== '#account' && h !== '#preview') return;
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (document.body.getAttribute('data-auth') === 'in' && typeof setScreen === 'function') {
          clearInterval(iv);
          if (h === '#preview') {
            // Aperçu direct depuis l'éditeur : on entre VRAIMENT en mode aperçu
            // (ma carte uniquement, figée). Avant on cherchait #accPreviewFull qui
            // n'existe plus → fallback sur le hub normal = aperçu cassé (carte absente).
            _previewFromEditor = true; // "Quitter l'aperçu" devra revenir sur editor.html
            try { sessionStorage.removeItem('mf_from_editor'); } catch(_){}
            enterPreviewMode();
          } else {
            // L'écran Paramètres a été retiré → les réglages sont dans l'éditeur.
            location.href = 'editor.html';
          }
          try { history.replaceState(null, '', location.pathname); } catch(_){}
        } else if (tries > 80) { clearInterval(iv); revealApp(); }
      }, 150);
    })();
    /* Dirty-state tracking: snapshot of editable fields at render time.
       If any field differs from the snapshot, the floating save bar appears. */
    let _accSnapshot = null;
    function _accSnap(){
      const pseudoEl = document.getElementById('accPseudo');
      if (!pseudoEl) return '';
      const fn = document.getElementById('boostFakeNitro');
      const gf = document.getElementById('boostGenderFilter');
      return JSON.stringify({
        pseudo: pseudoEl.value,
        bio:    document.getElementById('accBio').value,
        look:   document.getElementById('accLookSel').value,
        fakeNitro: fn ? !!fn.checked : false,
        gender: gf ? gf.value : 'all',
      });
    }
    function refreshSaveBar(){
      const bar = document.getElementById('accSaveBar');
      if (!bar) return;
      const dirty = _accSnapshot !== null && _accSnap() !== _accSnapshot;
      bar.setAttribute('data-show', dirty ? 'true' : 'false');
    }
    window.__resetSaveSnapshot = () => { _accSnapshot = _accSnap(); refreshSaveBar(); };
    // Re-snapshot whenever the account screen is rendered fresh
    const _origRenderAccount = window.renderAccount;
    // Hook into setScreen: snapshot when entering account
    (function hookAccountSnapshot(){
      const origSet = window.setScreen;
      // Auto-save profile fields after a short debounce — no need to click "Sauvegarder"
      let _autoSaveTimer = null;
      function scheduleAutoSave(){
        clearTimeout(_autoSaveTimer);
        _autoSaveTimer = setTimeout(() => {
          // Inline silent save (no toast / message)
          state.profile = state.profile || { gender:null, age:null, looking:null };
          const bioEl = document.getElementById('accBio');
          const lookEl = document.getElementById('accLookSel');
          const pseudoEl = document.getElementById('accPseudo');
          if (bioEl)    state.profile.bio     = bioEl.value.trim();
          if (lookEl)   state.profile.looking = lookEl.value;
          if (pseudoEl && pseudoEl.value.trim()) {
            state.user = state.user || {};
            state.user.displayName = pseudoEl.value.trim();
          }
          const fn = document.getElementById('boostFakeNitro');
          const gf = document.getElementById('boostGenderFilter');
          if (fn) {
            state.user = state.user || {};
            // Only persist fakeNitro if user has Boost (otherwise toggle was cancelled)
            if (state.user.boost) state.user.fakeNitro = !!fn.checked;
          }
          if (gf && state.user && state.user.boost) state.user.genderFilter = gf.value;
          save();
          updateChip();
          if (typeof refreshMyStatusUI === 'function') refreshMyStatusUI();
          if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
          // Mark as clean so the save bar disappears
          _accSnapshot = _accSnap();
          refreshSaveBar();
        }, 400);
      }
      ['accPseudo','accBio','accLookSel','boostFakeNitro','boostGenderFilter'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input',  () => { refreshSaveBar(); scheduleAutoSave(); });
        el.addEventListener('change', () => { refreshSaveBar(); scheduleAutoSave(); });
      });
      // Also auto-save when the user leaves the page
      window.addEventListener('beforeunload', () => { try { save(); } catch(_){} });
    })();

    function doAccSave(){
      state.profile = state.profile || { gender:null, age:null, looking:null };
      state.profile.bio     = document.getElementById('accBio').value.trim();
      state.profile.looking = document.getElementById('accLookSel').value;
      const pseudo = document.getElementById('accPseudo').value.trim();
      if (pseudo) { state.user = state.user || {}; state.user.displayName = pseudo; }

      // If the user edited Boost-only options without being premium, auto-impose Boost
      const fakeNitro = !!document.getElementById('boostFakeNitro').checked;
      const genderFilter = document.getElementById('boostGenderFilter').value || 'all';
      // Le Boost ne s'auto-active PLUS : il s'obtient uniquement via le paiement (checkout.html).
      // Les réglages Boost ne sont appliqués que si l'utilisateur est déjà abonné.
      if (state.user && state.user.boost) {
        state.user.fakeNitro = fakeNitro;
        state.user.genderFilter = genderFilter;
      }

      save();
      updateChip();
      refreshMyStatusUI();
      _accSnapshot = _accSnap();
      refreshSaveBar();
      const msg = document.getElementById('accMsg');
      msg.textContent = tx('saved');
      msg.setAttribute('data-show', 'true');
      setTimeout(() => msg.setAttribute('data-show', 'false'), 1800);
    }
    document.getElementById('accSave')?.addEventListener('click', doAccSave);
    // Delete account
    document.getElementById('accDeleteAccount')?.addEventListener('click', () => {
      if (!confirm('Supprimer définitivement ton compte Matefindr ? Toutes tes données locales seront effacées.')) return;
      try { localStorage.clear(); } catch {}
      try { if (window.__supa) window.__supa.auth.signOut().catch(() => {}); } catch {}
      state = { user:null, profile:null };
      setAuth(false);
      setScreen('landing');
    });
    // Nettoyage défensif : dans tous les cas, ces clés ne doivent jamais survivre
    // à une déconnexion (sinon le compte suivant peut hériter du token Discord — donc
    // de l'identité — du précédent, ET des presets de l'éditeur (matefindr_presets /
    // matefindr_active_preset ne sont PAS scopés par compte Discord contrairement à
    // matefindr_state) → se déconnecter puis créer un nouveau compte sur le même
    // navigateur appliquait encore la couleur/bulles/GIFs/fond du compte précédent au
    // nouveau, jusqu'à écraser son profil Supabase avec ces presets périmés).
    function clearDiscordTokenKeys(){
      try {
        localStorage.removeItem('matefindr_discord_token');
        localStorage.removeItem('matefindr_discord_token_ts');
        localStorage.removeItem('matefindr_discord_token_uid');
        localStorage.removeItem('matefindr_presets');
        localStorage.removeItem('matefindr_active_preset');
        localStorage.removeItem('matefindr_share_preset');
      } catch(_){}
    }
    document.getElementById('accSaveReset')?.addEventListener('click', () => {
      // Revert fields to last snapshot
      const u = state.user || {}; const p = state.profile || {};
      document.getElementById('accPseudo').value  = u.displayName || '';
      document.getElementById('accBio').value     = p.bio || '';
      document.getElementById('accLookSel').value = p.looking || 'game';
      _accSnapshot = _accSnap();
      refreshSaveBar();
      refreshAccountPreview();
    });
    document.getElementById('accBackSwipe')?.addEventListener('click', () => setScreen('swipe'));
    document.getElementById('accLogout')?.addEventListener('click', () => {
      // Archive the current profile so we can restore it on next Discord reconnect.
      // Keyed by Discord ID (or email as fallback) so different users keep separate profiles.
      try {
        const u = state.user || {};
        const key = u.discordId || u.email || u.discordTag;
        if (key && state.profile) {
          const archives = JSON.parse(localStorage.getItem('matefindr_archived_profiles') || '{}');
          archives[key] = {
            profile: state.profile,
            userExtras: {
              profileVoice: u.profileVoice || null,
              profileColor: u.profileColor || null,
              profileColor2: u.profileColor2 || null,
              musicVolume: u.musicVolume || null,
              musicStartTime: u.musicStartTime || null,
              socials: u.socials || null,
              swipeMusic: u.swipeMusic || null,
              gifs: u.gifs || null,
              fakeNitro: u.fakeNitro || null,
              fakeDeco: u.fakeDeco || null,
              bannerUrl: u.bannerCustom ? (u.bannerUrl || null) : null,
              bannerCustom: u.bannerCustom || null,
              discordWebhook: u.discordWebhook || null,
              notifTypes: u.notifTypes || null,
              genderFilter: u.genderFilter || null,
              boost: u.boost || null,
              boostPlan: u.boostPlan || null,
              boostSince: u.boostSince || null,
              boostNextPayment: u.boostNextPayment || null,
              boostCancelled: u.boostCancelled || null,
              boostShowName: (u.boostShowName === false) ? false : null,
              boostBg: u.boostBg || null,
              boostBgPos: u.boostBgPos || null,
            },
            savedAt: Date.now(),
          };
          localStorage.setItem('matefindr_archived_profiles', JSON.stringify(archives));
        }
      } catch (e) { console.warn('archive failed', e); }
      // Invalide la session Supabase (pas juste l'état local) — sinon un reload
      // reconnecte automatiquement via la session persistée en localStorage.
      try { if (window.__supa) window.__supa.auth.signOut().catch(() => {}); } catch {}
      clearDiscordTokenKeys();
      state = { user:null, profile:null };
      try { localStorage.removeItem(KEY); } catch(_){}
      setAuth(false);
      setScreen('landing');
      if (typeof refreshLandingCta === 'function') refreshLandingCta();
    });

    /* Backfill covers for orbs created before the cover feature existed.
       Runs in background, updates state.profile.userOrbs and re-renders. */
    async function backfillCovers(){
      const orbs = state.profile && state.profile.userOrbs;
      if (!Array.isArray(orbs) || !orbs.length) return false;
      let dirty = false;
      for (const o of orbs) {
        if (o.cover) continue;
        try {
          if (o.kind === 'music') {
            const r = (await searchSpotifyTracks(o.title, 1))[0];
            if (r) {
              if (r.cover) { o.cover = r.cover; dirty = true; }
              if (!o.previewUrl && r.previewUrl) { o.previewUrl = r.previewUrl; dirty = true; }
            }
          } else if (o.kind === 'anime') {
            const r = (await searchAnime(o.title))[0];
            if (r && r.cover) { o.cover = r.cover; dirty = true; }
          } else if (o.kind === 'game' || o.kind === 'film') {
            const r = (await searchWiki(o.title, o.kind))[0];
            if (r && r.cover) { o.cover = r.cover; dirty = true; }
          }
        } catch(_){}
      }
      if (dirty) {
        save();
        if (document.body.getAttribute('data-screen') === 'account') renderUserOrbs();
        // Ne pas reconstruire la carte swipe (évite l'anim d'entrée) — les covers
        // backfillées concernent MES bulles, pas la carte d'autrui à l'écran.
        if (document.body.getAttribute('data-screen') === 'swipe' && _previewMode) ensureDeckSync({ force: true });
      }
      return dirty;
    }

    // Migration : ancien statut 'now' -> nouveau 'talk' (Discuter)
    if (state.profile && state.profile.looking === 'now') {
      state.profile.looking = 'talk';
      save();
    }

    // ---------- Init from persisted state ----------
    if (typeof checkBoostExpiry === 'function') checkBoostExpiry(); // expiration/renouvellement mensuel au chargement
    if (state.user) {
      setAuth(true);
      refreshMyGuildsIfNeeded();
      if (window.MatefindrDiscordPresence?.start) window.MatefindrDiscordPresence.start();
      // Si l'URL va être reprise par un lien de partage (/<slug>) ou un retour
      // d'éditeur (#preview/#account), on NE révèle PAS encore landing/onboarding
      // (ça flasherait avant le bon écran) : on pose juste l'attribut en silence,
      // handleSharedLink/handleEditorReturn appelleront setScreen (donc revealApp)
      // eux-mêmes une fois résolus.
      const willBeOverridden = !!getSharedSlug() || location.hash === '#preview' || location.hash === '#account';
      if (willBeOverridden) document.body.setAttribute('data-screen', state.profile ? 'landing' : 'onboarding');
      else setScreen(state.profile ? 'landing' : 'onboarding');
      backfillCovers();
    }
    if (typeof refreshLandingCta === 'function') refreshLandingCta();

    // ---------- Supabase: hydrate from session (after OAuth redirect) ----------
    (async () => {
      if (!window.__supa) return;

      // Capture provider_token from URL hash IMMEDIATELY (before Supabase eats it)
      // because Supabase doesn't persist provider_token between page loads.
      function capProviderToken(){
        try {
          const hash = window.location.hash || '';
          if (!hash.includes('provider_token')) return;
          const params = new URLSearchParams(hash.slice(1));
          const pt = params.get('provider_token');
          if (pt) {
            localStorage.setItem('matefindr_discord_token', pt);
            localStorage.setItem('matefindr_discord_token_ts', String(Date.now()));
            console.log('[Matefindr] Discord provider_token captured.');
          }
        } catch {}
      }
      capProviderToken();

      try {
        const { data: { session } } = await window.__supa.auth.getSession();
        console.log('[Matefindr] Supabase session:', !!session, 'provider_token:', !!session?.provider_token);
        if (session) {
          const u = await userFromSupabaseSession(session);
          if (u) window.__matefindr.onLogin(u);
          if (window.__rtStart) window.__rtStart(); // temps réel : matches + messages
        } else {
          // Pas de session → personne connecté. setAuth(false) renvoie aussi à la
          // landing si on était resté bloqué sur l'onboarding (bug "Hey toi" + Se connecter).
          if (state.user) {
            clearDiscordTokenKeys();
            state = { user: null, profile: null };
            try { localStorage.removeItem(KEY); } catch(_){}
          }
          setAuth(false);
        }
        window.__supa.auth.onAuthStateChange(async (event, s) => {
          console.log('[Matefindr] auth event:', event, 'provider_token:', !!s?.provider_token);
          if (event === 'SIGNED_OUT') {
            // Déconnexion réelle → personne connecté (pas de fantôme Matefindr_user)
            clearDiscordTokenKeys();
            state = { user: null, profile: null };
            try { localStorage.removeItem(KEY); } catch(_){}
            setAuth(false);
            if (typeof refreshLandingCta === 'function') refreshLandingCta();
            return;
          }
          if (s) {
            // Save token from session if present (Supabase may include it in SIGNED_IN)
            if (s.provider_token) {
              localStorage.setItem('matefindr_discord_token', s.provider_token);
              localStorage.setItem('matefindr_discord_token_ts', String(Date.now()));
              try {
                const m = s.user?.user_metadata || {};
                localStorage.setItem('matefindr_discord_token_uid', m.provider_id || m.sub || s.user?.id || '');
              } catch(_){}
            }
            const u = await userFromSupabaseSession(s);
            if (u) window.__matefindr.onLogin(u);
            if (window.__rtStart) window.__rtStart(); // temps réel : matches + messages
          }
        });

        /* === Auto-resync Discord (limité) ===
           Une fois le profil créé, on ne resynchronise PLUS avatar / bannière / déco /
           pseudo Matefindr / nitro / accent. Seulement username, serveurs, email. */
        async function autoResyncDiscord(){
          try {
            try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch(_){}
            const u = state.user = state.user || {};
            if (!u.discordId) return;
            const stored = typeof getStoredDiscordToken === 'function' ? getStoredDiscordToken(u.discordId) : null;
            if (!stored) return;
            const d = await fetchDiscordProfile(stored);
            let guilds = null;
            if (window.__refreshDiscordGuilds) {
              guilds = await window.__refreshDiscordGuilds(u.discordId);
            }
            try {
              if (window.__supa) {
                const { data: { session } } = await window.__supa.auth.getSession();
                const em = session && (session.user?.email || session.user?.user_metadata?.email);
                if (em && (!d || !d.email) && u.email !== em) u.email = em;
              }
            } catch(_){}
            const dirty = applyLimitedDiscordResync(u, d, guilds);
            if (!dirty && !d && !(guilds && guilds.length)) return;
            save();
            if (guilds && guilds.length && typeof scheduleCloudSync === 'function') scheduleCloudSync();
            if (typeof updateChip === 'function') updateChip();
            if (typeof refreshAccountPreview === 'function') refreshAccountPreview();
            if (document.body.getAttribute('data-screen') === 'swipe') {
              if (typeof softRefreshSwipeCard === 'function') softRefreshSwipeCard();
            }
            console.log('[Matefindr] auto-resync Discord OK (tag/guilds/email only)');
          } catch (e) { console.warn('[Matefindr] auto-resync failed', e); }
        }
        // Toutes les 5 minutes
        setInterval(autoResyncDiscord, 5 * 60 * 1000);
        // Quand l'onglet redevient visible (user revient sur l'app)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') autoResyncDiscord();
        });
        // Au chargement initial (après quelques secondes pour ne pas bloquer le init)
        setTimeout(autoResyncDiscord, 3000);
        window.__autoResyncDiscord = autoResyncDiscord;
      } catch (e) { console.warn('Supabase session error', e); }
    })();
  })();

  // Sign-out wrapper: call Supabase sign-out alongside our local reset.
  // (The original accLogout listener runs first and clears local state; this just
  // makes sure the Supabase session is also invalidated so the next reload
  // doesn't re-hydrate it.)
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#accLogout') && window.__supa) {
      window.__supa.auth.signOut().catch(() => {});
    }
  });
