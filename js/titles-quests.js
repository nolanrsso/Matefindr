/* Titres & quêtes Matefindr */
(function (global) {
  const STATE_KEY = 'matefindr_state';
  const GLOBAL_STATS_KEY = 'mf_title_global_stats';
  const QUEST_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8c1.1 0 2 .9 2 2v11.5c0 .8-.6 1.5-1.4 1.5H7.4C6.6 18 6 17.3 6 16.5V5c0-1.1.9-2 2-2z"/><path d="M9 3v2.5c0 .8.7 1.5 1.5 1.5h3c.8 0 1.5-.7 1.5-1.5V3"/><path d="M8.5 9h7M8.5 12h5.5M8.5 15h4"/><path d="M16.5 4.5 19 7l-5.5 5.5-2-.5-.5-2L16.5 4.5z"/></svg>';

  const MILESTONES = [5, 15, 30, 50, 75, 100, 150, 200, 300, 500, 1000, 1500, 2000];

  function milestonesFrom(n) {
    const out = MILESTONES.slice();
    let v = 2000;
    while (v < n) { v += 500; out.push(v); }
    return out;
  }

  const RATING_TITLES = [
    { id: 'rt_subhuman', min: 1, max: 2, label: 'subhuman', rarity: 2 },
    { id: 'rt_mid', min: 2, max: 2.5, label: 'mid', rarity: 3 },
    { id: 'rt_tuff', min: 2.5, max: 3, label: 'tuff', rarity: 4 },
    { id: 'rt_aura', min: 3, max: 3.5, label: 'aura', rarity: 5 },
    { id: 'rt_aesthetic', min: 3.5, max: 4, label: 'aesthetic', rarity: 6 },
    { id: 'rt_peak', min: 4, max: 4.2, label: 'peak', rarity: 7 },
    { id: 'rt_cinema', min: 4.2, max: 4.4, label: 'absolute cinema', rarity: 8 },
    { id: 'rt_masterpeace', min: 4.4, max: 4.5, label: 'masterpeace', rarity: 9 },
    { id: 'rt_divine', min: 4.5, max: 4.6, label: 'divine', rarity: 10 },
    { id: 'rt_goated', min: 4.6, max: 4.7, label: 'goated', rarity: 11 },
    { id: 'rt_beauty', min: 4.7, max: 4.8, label: 'true adam', rarity: 12 },
    { id: 'rt_perfection', min: 4.8, max: 4.9, label: 'Perfection', rarity: 13 },
    { id: 'rt_1010', min: 4.9, max: 5.01, label: '10/10', rarity: 14 },
  ];

  const BEAUTY_EDITOR_MS = 2 * 60 * 1000;

  const STAT_MISSIONS = [
    {
      id: 'views', group: 'profil', label: 'Vues de profil', stat: 'views',
      titles: ['Premier Regard', 'Vitrine Émergente', 'Spotlight Discret', 'Radar Social', 'Pôle d\'Attention', 'Constellation Vue', 'Horizon Matefindr', 'Phare Nocturne', 'Éclipse de Vues', 'Légende du Feed', 'Mythique du Scroll', 'Oracle des Vues', 'Monument Visible'],
    },
    {
      id: 'matches', group: 'interaction', label: 'Matchs', stat: 'matches',
      titles: ['Étincelle Mutuelle', 'Double Connexion', 'Alchimie Douce', 'Symbiose Swipe', 'Destins Croisés', 'Réseau d\'Or', 'Cercle Fidèle', 'Galaxie Match', 'Architecte du Lien', 'Maestro du Match', 'Dynastie Swipe', 'Empire des Matchs', 'Apothéose Match'],
    },
    {
      id: 'likes', group: 'interaction', label: 'Likes envoyés', stat: 'likesGiven',
      titles: ['Pouce Novice', 'Curateur Spontané', 'Ambassadeur Like', 'Flamme Verte', 'Chasseur de Cœurs', 'Tisseur de Likes', 'Orfèvre du Swipe', 'Tempête Rose', 'Sultan du Like', 'Mythomane Romantique', 'Comète Cœur', 'Titans du Like', 'Divin Liké'],
    },
    {
      id: 'votes', group: 'interaction', label: 'Votes sur les profils', stat: 'votesGiven',
      titles: ['Juge Débutant', 'Critique Agile', 'Étoile Vagabonde', 'Jury Silencieux', 'Expert du Slider', 'Constellation Vote', 'Oracle des Notes', 'Grand Arbitre', 'Sceptre d\'Étoiles', 'Législateur Swipe', 'Nova du Vote', 'Panthéon Critique', 'Zenith Votant'],
    },
    {
      id: 'conversations', group: 'interaction', label: 'Nouvelles conversations', stat: 'newChats',
      titles: ['Premier Mot', 'Brise-Glace', 'Fil Tissé', 'Echo Social', 'Dialogue Vivant', 'Carrefour Chat', 'Mosaic Paroles', 'Pont Humain', 'Symphonie DM', 'Archiviste du Chat', 'Horizon Parlé', 'Citadelle DM', 'Transcendance Chat'],
    },
    {
      id: 'likes_received', group: 'profil', label: 'Likes reçus sur votre profil', stat: 'likesReceived',
      titles: ['Premier Cœur', 'Magnétisme Doux', 'Pôle d\'Attraction', 'Aura Like', 'Star du Swipe', 'Comète Rose', 'Légende Likée', 'Icône du Feed', 'Mythique du Like', 'Diva du Match', 'Empire Cœur', 'Titans Reçus', 'Apothéose Like'],
    },
  ];

  /* Pistes affichées dans la modale Quêtes. */
  const QUEST_TRACKS = [
    { group: 'profil', isRating: true, label: 'Esthétisme du profil' },
    {
      group: 'interaction', statId: 'votes', stat: 'votesGiven',
      label: 'Noter les autres profils',
      eventNote: 'Événement · récompense ×1.5',
      coinMult: 1.5,
    },
    {
      group: 'interaction', statId: 'likes', stat: 'likesGiven',
      label: 'Liker d\'autres profils',
      eventNote: 'Événement · récompense ×1.5',
      coinMult: 1.5,
    },
    { group: 'profil', statId: 'views', stat: 'views', label: 'Visionnage de mon profil' },
    { group: 'interaction', statId: 'matches', stat: 'matches', label: 'Matchs' },
    { group: 'interaction', statId: 'conversations', stat: 'newChats', label: 'Conversation (par personnes)' },
  ];

  const VOTES_UNLOCK = {
    id: 'votes_received', group: 'profil', label: 'Votes reçus sur ton profil', stat: 'votesReceived', threshold: 5,
    title: 'Voix du Public', rarity: 2,
  };

  const RATING_MIN_VOTERS = 5;

  /** Pièces gagnées à chaque palier terminé (niveau 1 = 36, niveau 2 = 62, …). */
  const QUEST_COIN_REWARD = [
    36, 62, 98, 146, 212, 286, 372, 470, 580, 702, 836, 982, 1140, 1310, 1492, 1686, 1892, 2110, 2340, 2582,
    2836, 3102, 3380, 3670, 3972, 4286, 4612, 4950, 5300, 5662, 6036, 6422, 6820, 7230, 7652, 8086, 8532, 8990,
    9460, 9942, 10436, 10942, 11460, 11990, 12532, 13086, 13652, 14230, 14820, 15422, 16036, 16662, 17300, 17950,
    18612, 19286, 19972, 20670, 21380, 22102, 22836, 23582, 24340, 25110, 25892, 26686, 27492, 28310, 29140, 29982,
    30836, 31702, 32580, 33470, 34372, 35286, 36212, 37150, 38100, 39062, 40036, 41022, 42020, 43030, 44052, 45086,
    46132, 47190, 48260, 49342, 50436, 51542, 52660, 53790, 54932, 56086, 57252, 58430, 59620, 60822, 62036, 63262,
    64500, 65750, 67012, 68286, 69572, 70870, 72180, 73502, 74836, 76182, 77540, 78910, 80292, 81686, 83092, 84510,
    85940, 87382, 88836, 90302, 91780, 93270, 94772, 96286, 97812, 99350, 100900, 102462,
  ];

  const TITLE_PRICE_BY_RARITY = {
    2: 150, 3: 280, 4: 450, 5: 680, 6: 950, 7: 1300, 8: 1750, 9: 2400,
    10: 3200, 11: 4200, 12: 5500, 13: 7200, 14: 10000,
  };

  const BETA_TESTER_ID = 'beta_tester';
  const DISCORDIEN_ID = 'discordien';
  const OWNER_DISCORD_TAG = 'alonemaxing';
  const OWNER_TITLE_ID = 'owner';
  const MATEFINDR_OWNER_TITLE_ID = 'matefindr_owner';
  const EXCLUSIVE_TITLE_IDS = [BETA_TESTER_ID, DISCORDIEN_ID, OWNER_TITLE_ID, MATEFINDR_OWNER_TITLE_ID];

  function currentUiLang() {
    try {
      return String(document.documentElement.lang || 'fr').toLowerCase().slice(0, 2);
    } catch (_) { return 'fr'; }
  }

  function discordienLabel() {
    return currentUiLang() === 'fr' ? 'Discordien' : 'Discordians';
  }

  function grantDiscordienTitle(td, opts) {
    opts = opts || {};
    const wasNew = !td.collected.includes(DISCORDIEN_ID);
    if (wasNew) td.collected.push(DISCORDIEN_ID);
    // Équipe par défaut à la création / si aucun titre choisi (ou encore Beta Tester)
    if (opts.forceEquip || !td.equipped || td.equipped === BETA_TESTER_ID) {
      td.equipped = DISCORDIEN_ID;
    }
    if (wasNew) bumpGlobalStat(DISCORDIEN_ID);
    return td;
  }

  function titleHoldersCount(id) {
    const st = globalTitleStats(id);
    const owned = (getTitlesData().collected || []).includes(id);
    return Math.max(typeof st.count === 'number' ? st.count : 0, owned ? 1 : 0);
  }

  function trackForMission(m) {
    if (!m) return null;
    if (m.stat === 'rating' || String(m.id || '').startsWith('rt_')) {
      return QUEST_TRACKS.find(t => t.isRating) || null;
    }
    const sid = String(m.id || '').replace(/_\d+$/, '');
    return QUEST_TRACKS.find(t => t.stat === m.stat || t.statId === sid) || null;
  }

  function missionCoinMult(m) {
    const track = trackForMission(m);
    return (track && track.coinMult) ? track.coinMult : 1;
  }

  function missionCoinRewardAmount(m) {
    const lvl = missionCoinLevel(m);
    if (lvl < 0) return 0;
    return Math.round(questCoinReward(lvl) * missionCoinMult(m));
  }

  function isKeepableTitleId(id) {
    if (!id) return false;
    if (id === BETA_TESTER_ID || id === DISCORDIEN_ID || EXCLUSIVE_TITLE_IDS.includes(id)) return true;
    if (String(id).startsWith('rt_')) return true;
    if (String(id).startsWith('custom_')) return true;
    return false;
  }

  function isOwnerDiscordTag(user) {
    const u = user || readSite().user || {};
    const tag = String(u.discordTag || u.tag || '').replace(/^@+/, '').replace(/#0$/, '').toLowerCase();
    return tag === OWNER_DISCORD_TAG.toLowerCase();
  }

  function grantOwnerTitles(td) {
    [OWNER_TITLE_ID, MATEFINDR_OWNER_TITLE_ID].forEach(id => {
      if (!td.collected.includes(id)) td.collected.push(id);
    });
    return td;
  }

  function $(id) { return document.getElementById(id); }
  function readSite() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) { return {}; } }
  function writeSite(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {} }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function defaultTitlesData() {
    return { collected: [], pending: [], equipped: null, color: '#C7A5FF', custom: {} };
  }

  function cloneCustomMap(src) {
    if (!src || typeof src !== 'object') return {};
    const out = {};
    Object.keys(src).forEach(id => {
      const c = src[id];
      if (c && typeof c === 'object' && c.title) {
        out[id] = { title: String(c.title), rarity: typeof c.rarity === 'number' ? c.rarity : 10 };
      }
    });
    return out;
  }

  function getTitlesData(user) {
    const u = user || readSite().user || {};
    const td = u.titlesData && typeof u.titlesData === 'object' ? u.titlesData : defaultTitlesData();
    if (!Array.isArray(td.collected)) td.collected = [];
    if (!Array.isArray(td.pending)) td.pending = [];
    const normalized = normalizeTitlesData(td);
    if (isOwnerDiscordTag(u)) grantOwnerTitles(normalized);
    return normalized;
  }

  function normalizeTitlesData(td) {
    td = td || defaultTitlesData();
    if (!Array.isArray(td.collected)) td.collected = [];
    if (!Array.isArray(td.pending)) td.pending = [];
    td.custom = cloneCustomMap(td.custom);
    // Garde les custom dans collected si définis
    Object.keys(td.custom).forEach(id => {
      if (!td.collected.includes(id)) td.collected.push(id);
    });
    if (!td.collected.includes(BETA_TESTER_ID)) td.collected.push(BETA_TESTER_ID);
    grantDiscordienTitle(td, { forceEquip: false });
    if (!td.equipped) td.equipped = DISCORDIEN_ID;
    return td;
  }

  function titlesDataForCard(p) {
    const raw = p.titlesData || (p.isMe ? getTitlesData(p) : null);
    if (!raw) return normalizeTitlesData(defaultTitlesData());
    const result = normalizeTitlesData({
      collected: Array.isArray(raw.collected) ? [...raw.collected] : [],
      pending: Array.isArray(raw.pending) ? [...raw.pending] : [],
      equipped: raw.equipped,
      color: raw.color,
      custom: raw.custom,
    });
    if (isOwnerDiscordTag(p)) grantOwnerTitles(result);
    return result;
  }

  function resolveTitleMeta(id, td) {
    if (!id) return null;
    const m = getMission(id);
    if (m) return m;
    const c = td && td.custom && td.custom[id];
    if (c && c.title) {
      return { id, title: String(c.title), rarity: typeof c.rarity === 'number' ? c.rarity : 10, noTranslate: true, custom: true };
    }
    return null;
  }

  function saveTitlesData(patch) {
    const s = readSite();
    s.user = s.user || {};
    s.user.titlesData = Object.assign(defaultTitlesData(), getTitlesData(s.user), patch || {});
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
    if (typeof global.__matefindrRefreshCard === 'function') global.__matefindrRefreshCard();
    if (typeof global.renderEditorCardMeta === 'function') global.renderEditorCardMeta();
  }

  function missionId(statId, threshold) { return `${statId}_${threshold}`; }

  function buildMissionCatalog() {
    const list = [];
    list.push({
      id: BETA_TESTER_ID,
      group: 'profil',
      label: 'Beta Tester',
      title: 'Beta Tester',
      rarity: 4,
      desc: 'Titre exclusif pour les testeurs de la beta Matefindr.',
      stat: 'beta',
    });
    list.push({
      id: DISCORDIEN_ID,
      group: 'profil',
      label: 'Discordien',
      title: 'Discordien',
      rarity: 5,
      noTranslate: true,
      exclusive: true,
      i18nTitle: true,
      desc: 'Titre offert à la création de compte via Discord.',
      stat: 'discord',
    });
    list.push({
      id: OWNER_TITLE_ID,
      group: 'profil',
      label: 'Owner',
      title: 'Owner',
      rarity: 14,
      noTranslate: true,
      exclusive: true,
      desc: 'Titre réservé au propriétaire de Matefindr.',
      stat: 'staff',
    });
    list.push({
      id: MATEFINDR_OWNER_TITLE_ID,
      group: 'profil',
      label: 'Matefindr Owner',
      title: 'Matefindr Owner',
      rarity: 14,
      noTranslate: true,
      exclusive: true,
      desc: 'Titre fondateur Matefindr.',
      stat: 'staff',
    });
    list.push({
      id: VOTES_UNLOCK.id,
      group: VOTES_UNLOCK.group,
      label: VOTES_UNLOCK.label,
      stat: VOTES_UNLOCK.stat,
      threshold: VOTES_UNLOCK.threshold,
      title: VOTES_UNLOCK.title,
      rarity: VOTES_UNLOCK.rarity,
      desc: 'Reçois 5 votes sur ton profil pour débloquer les titres de note.',
    });
    STAT_MISSIONS.forEach(m => {
      MILESTONES.forEach((th, i) => {
        list.push({
          id: missionId(m.id, th),
          group: m.group,
          label: m.label,
          stat: m.stat,
          threshold: th,
          title: m.titles[i] || `${m.label} ${th}`,
          rarity: Math.min(14, 2 + i),
          desc: `Atteins ${th} ${m.label.toLowerCase()}.`,
        });
      });
    });
    RATING_TITLES.forEach(r => {
      list.push({
        id: r.id,
        group: 'profil',
        label: 'Note de profil',
        stat: 'rating',
        ratingMin: r.min,
        ratingMax: r.max,
        threshold: r.min,
        title: r.label.charAt(0).toUpperCase() + r.label.slice(1),
        rarity: r.rarity,
        noTranslate: true,
        desc: `Note moyenne entre ${r.min} et ${r.max} (min. ${RATING_MIN_VOTERS} votants).`,
      });
    });
    return list;
  }

  const MISSIONS = buildMissionCatalog();
  const MISSION_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));

  function getMission(id) {
    if (MISSION_BY_ID[id]) return MISSION_BY_ID[id];
    const m = String(id).match(/^(\w+)_(\d+)$/);
    if (!m) return null;
    const statId = m[1];
    const th = parseInt(m[2], 10);
    const sm = STAT_MISSIONS.find(s => s.id === statId);
    if (!sm || !Number.isFinite(th)) return null;
    const idx = MILESTONES.indexOf(th);
    const extra = th > 2000 ? Math.floor((th - 2000) / 500) : 0;
    return {
      id,
      group: sm.group,
      label: sm.label,
      stat: sm.stat,
      threshold: th,
      title: idx >= 0 ? sm.titles[idx] : `${sm.label} · ${th}`,
      rarity: Math.min(14, 2 + (idx >= 0 ? idx : MILESTONES.length - 1 + extra)),
      desc: `Atteins ${th} ${sm.label.toLowerCase()}.`,
    };
  }

  function avgRating(rec) {
    if (!rec || !rec.ratings || !rec.ratings.length) return 0;
    const sum = rec.ratings.reduce((a, b) => a + b, 0);
    return sum / rec.ratings.length;
  }

  async function resolveQuestUid(opts, u, sb) {
    if (opts && opts.uid) return opts.uid;
    if (u && u.uid) return u.uid;
    if (typeof global.__mfMyUid === 'string' && global.__mfMyUid) return global.__mfMyUid;
    if (sb && sb.auth && typeof sb.auth.getSession === 'function') {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session && data.session.user && data.session.user.id) return data.session.user.id;
      } catch (_) {}
    }
    // Dernier recours : id anonyme (votes hors compte) — pas pour likes/matchs
    try {
      const rid = localStorage.getItem('matefindr_reactor_id');
      if (rid) return rid;
    } catch (_) {}
    return null;
  }

  function countFromRes(res) {
    if (!res || res.error) return null;
    if (typeof res.count === 'number') return res.count;
    if (Array.isArray(res.data)) return res.data.length;
    return null;
  }

  async function fetchStats(opts) {
    opts = opts || {};
    const s = readSite();
    const u = s.user || {};
    const prev = (u.questStats && typeof u.questStats === 'object') ? u.questStats : {};
    let views = typeof opts.views === 'number' ? opts.views : (u.profileViews || s.profile?.views || prev.views || 0);
    let matches = typeof prev.matches === 'number' ? prev.matches : 0;
    let likesGiven = typeof prev.likesGiven === 'number' ? prev.likesGiven : 0;
    let likesReceived = typeof prev.likesReceived === 'number' ? prev.likesReceived : 0;
    let votesGiven = typeof prev.votesGiven === 'number' ? prev.votesGiven : 0;
    let votesReceived = typeof prev.votesReceived === 'number' ? prev.votesReceived : 0;
    let newChats = typeof prev.newChats === 'number' ? prev.newChats : 0;
    const sb = opts.supa || global.__supa;
    const uid = await resolveQuestUid(opts, u, sb);
    let anonReactor = null;
    try { anonReactor = localStorage.getItem('matefindr_reactor_id'); } catch (_) {}
    if (sb && uid) {
      // Une requête qui plante ne doit PAS annuler les autres (ex. messages RLS).
      const safe = async (fn) => { try { return await fn(); } catch (_) { return null; } };
      const voteIds = [uid];
      if (anonReactor && anonReactor !== uid) voteIds.push(anonReactor);
      const [mRes, lRes, lrRes, vrRes, viewsRes, msgRes, ...voteResList] = await Promise.all([
        safe(() => sb.from('matches').select('id', { count: 'exact' }).or(`user_a.eq.${uid},user_b.eq.${uid}`)),
        safe(() => sb.from('likes').select('id', { count: 'exact' }).eq('liker_id', uid)),
        safe(() => sb.from('likes').select('id', { count: 'exact' }).eq('liked_id', uid)),
        // PK = (profile_id, reactor_id) — pas de colonne id
        safe(() => sb.from('profile_reactions').select('profile_id', { count: 'exact', head: true }).eq('profile_id', uid)),
        safe(() => sb.from('profiles').select('views').eq('id', uid).maybeSingle()),
        safe(() => sb.from('messages').select('match_id').eq('sender_id', uid).limit(5000)),
        ...voteIds.map(rid => safe(() =>
          sb.from('profile_reactions').select('profile_id', { count: 'exact', head: true }).eq('reactor_id', rid)
        )),
      ]);
      const mCount = countFromRes(mRes);
      if (mCount != null) matches = mCount;
      const lCount = countFromRes(lRes);
      if (lCount != null) likesGiven = lCount;
      const lrCount = countFromRes(lrRes);
      if (lrCount != null) likesReceived = lrCount;
      // Votes : compte auth + id anonyme (notes avant connexion)
      let votesSum = 0;
      let votesOk = false;
      voteResList.forEach(res => {
        const c = countFromRes(res);
        if (c != null) { votesSum += c; votesOk = true; }
      });
      if (votesOk) votesGiven = votesSum;
      if (vrRes && !vrRes.error && typeof vrRes.count === 'number') votesReceived = vrRes.count;
      if (msgRes && !msgRes.error) {
        const chatIds = new Set();
        (msgRes.data || []).forEach(row => { if (row && row.match_id) chatIds.add(row.match_id); });
        newChats = chatIds.size;
      } else if (matches > 0 && !newChats) {
        newChats = matches; // fallback si messages inaccessible
      }
      if (typeof opts.views !== 'number' && viewsRes && viewsRes.data && typeof viewsRes.data.views === 'number') {
        views = viewsRes.data.views;
      }
      // Persiste l'uid pour les prochains appels (app.js ne le met pas toujours dans state.user)
      if (!u.uid) {
        try {
          const st = readSite();
          st.user = st.user || {};
          st.user.uid = uid;
          writeSite(st);
        } catch (_) {}
      }
    }
    // Fallback UI app : conversations déjà chargées
    try {
      if (Array.isArray(global.CONVOS) && global.CONVOS.length > matches) matches = global.CONVOS.length;
    } catch (_) {}
    // Un match implique au moins un like envoyé
    if (matches > likesGiven) likesGiven = matches;
    let ratingRec = opts.ratingRec || null;
    if (typeof ratingRec === 'function') {
      try { ratingRec = await ratingRec(); } catch (_) { ratingRec = null; }
    }
    const rating = ratingRec ? avgRating(ratingRec) : (typeof prev.rating === 'number' ? prev.rating : 0);
    const ratingVotes = ratingRec?.ratings?.length || (typeof prev.ratingVotes === 'number' ? prev.ratingVotes : 0);
    return { views, matches, likesGiven, likesReceived, votesGiven, votesReceived, newChats, rating, ratingVotes };
  }

  function syncStatsLocal(stats) {
    const s = readSite();
    s.user = s.user || {};
    s.user.questStats = stats;
    writeSite(s);
    return stats;
  }

  /** Incrémente les notes envoyées (appelé après un nouveau vote réussi). */
  function bumpVotesGiven(n) {
    const s = readSite();
    s.user = s.user || {};
    const prev = (s.user.questStats && typeof s.user.questStats === 'object') ? s.user.questStats : {};
    const next = Math.max(0, (typeof prev.votesGiven === 'number' ? prev.votesGiven : 0) + (n || 1));
    s.user.questStats = Object.assign({}, prev, { votesGiven: next });
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
    try { updateQuestButtonBadge(s.user.questStats); } catch (_) {}
    return next;
  }

  function missionProgress(m, stats) {
    if (m.id === VOTES_UNLOCK.id || m.stat === 'votesReceived') {
      const cur = stats.votesReceived || 0;
      const tgt = m.threshold || RATING_MIN_VOTERS;
      return { current: cur, target: tgt, pct: Math.min(100, tgt ? (cur / tgt) * 100 : 0), complete: cur >= tgt, locked: false };
    }
    if (m.stat === 'rating') {
      if ((stats.ratingVotes || 0) < RATING_MIN_VOTERS) {
        const cur = stats.ratingVotes || 0;
        return { current: cur, target: RATING_MIN_VOTERS, pct: Math.min(100, (cur / RATING_MIN_VOTERS) * 100), locked: true, complete: false };
      }
      const rating = Number(stats.rating) || 0;
      const ok = rating >= (m.ratingMin || 0) && rating < (m.ratingMax || 99);
      // Barre Esthétisme : 100 % uniquement à 5/5
      const pct = rating >= 5 ? 100 : Math.min(99.9, Math.max(0, (rating / 5) * 100));
      return { current: rating, target: 5, pct, locked: false, complete: ok };
    }
    const cur = stats[m.stat] || 0;
    const tgt = m.threshold || 0;
    return { current: cur, target: tgt, pct: Math.min(100, tgt ? (cur / tgt) * 100 : 0), complete: cur >= tgt, locked: false };
  }

  /** Flèche Esthétisme : note actuelle → prochain palier (ou votants → 5). */
  function beautyArrow(stats) {
    const votes = stats.ratingVotes || 0;
    if (votes < RATING_MIN_VOTERS) {
      return {
        locked: true,
        from: votes,
        to: RATING_MIN_VOTERS,
        labelFrom: String(votes),
        labelTo: String(RATING_MIN_VOTERS),
        pct: Math.min(100, (votes / RATING_MIN_VOTERS) * 100),
        unit: 'votants',
        maxed: false,
      };
    }
    const rating = Number(stats.rating) || 0;
    let next = 5;
    for (let i = 0; i < RATING_TITLES.length; i++) {
      if (rating < RATING_TITLES[i].min) { next = RATING_TITLES[i].min; break; }
    }
    if (rating >= (RATING_TITLES[RATING_TITLES.length - 1].min || 5)) next = 5;
    const maxed = rating >= 5;
    return {
      locked: false,
      from: rating,
      to: next,
      labelFrom: rating.toFixed(1),
      labelTo: Number(next).toFixed(1),
      pct: maxed ? 100 : Math.min(99.9, Math.max(0, (rating / 5) * 100)),
      unit: 'note',
      maxed,
    };
  }

  function isBeautyQuestUnlocked() {
    const u = readSite().user || {};
    if (u.beautyQuestUnlocked === true) return true;
    if ((Number(u.editorActiveMs) || 0) >= BEAUTY_EDITOR_MS) return true;
    // Comptes déjà actifs avant le verrou 2 min
    const qs = u.questStats || {};
    if ((qs.matches || 0) > 0 || (qs.votesGiven || 0) > 0 || (qs.likesGiven || 0) > 0 || (qs.views || 0) > 5) return true;
    const collected = (u.titlesData && Array.isArray(u.titlesData.collected)) ? u.titlesData.collected : [];
    if (collected.some(id => String(id).startsWith('rt_'))) return true;
    return false;
  }

  function beautyUnlockProgress() {
    if (isBeautyQuestUnlocked()) {
      return { unlocked: true, ms: BEAUTY_EDITOR_MS, need: BEAUTY_EDITOR_MS, pct: 100 };
    }
    const ms = Math.max(0, Math.min(BEAUTY_EDITOR_MS, Number((readSite().user || {}).editorActiveMs) || 0));
    return { unlocked: false, ms, need: BEAUTY_EDITOR_MS, pct: (ms / BEAUTY_EDITOR_MS) * 100 };
  }

  function formatUnlockClock(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function highestCollectedBeautyId(collected) {
    let best = null;
    RATING_TITLES.forEach(r => {
      if (collected.includes(r.id)) best = r.id;
    });
    return best;
  }

  function listEligibleMissionIds(stats) {
    const eligible = [];
    if ((stats.votesReceived || 0) >= VOTES_UNLOCK.threshold) eligible.push(VOTES_UNLOCK.id);

    STAT_MISSIONS.forEach(m => {
      const cur = stats[m.stat] || 0;
      MILESTONES.forEach(th => {
        if (cur >= th) eligible.push(missionId(m.id, th));
      });
      let th = 2500;
      while (cur >= th) {
        eligible.push(missionId(m.id, th));
        th += 500;
      }
    });

    if (isBeautyQuestUnlocked() && (stats.ratingVotes || 0) >= RATING_MIN_VOTERS) {
      // Possession cumulative : atteindre un palier débloque aussi tous les titres en dessous
      RATING_TITLES.forEach(r => {
        if (stats.rating >= r.min) eligible.push(r.id);
      });
    }
    return [...new Set(eligible)];
  }

  /**
   * Applique quêtes → titres beauté + pending (et pièces si autoClaimCoins).
   * Pure : ne lit/écrit pas localStorage. Utilisé client + admin backfill.
   * Client : autoClaimCoins=false → pièces via bouton « Réclamer ».
   */
  function applyQuestProgress(stats, snapshot, opts) {
    snapshot = snapshot || {};
    opts = opts || {};
    const autoClaimCoins = !!opts.autoClaimCoins;
    const ratingIds = RATING_TITLES.map(r => r.id);
    const eligible = listEligibleMissionIds(stats || {});
    const srcTd = snapshot.titlesData && typeof snapshot.titlesData === 'object' ? snapshot.titlesData : {};
    let collected = Array.isArray(srcTd.collected) ? srcTd.collected.slice() : [];
    if (!collected.includes(BETA_TESTER_ID)) collected.push(BETA_TESTER_ID);
    if (!collected.includes(DISCORDIEN_ID)) collected.push(DISCORDIEN_ID);
    let equipped = srcTd.equipped || DISCORDIEN_ID;
    if (!equipped || equipped === BETA_TESTER_ID) equipped = DISCORDIEN_ID;
    const color = srcTd.color || '#C7A5FF';
    const custom = cloneCustomMap(srcTd.custom);
    const equippedWasBeauty = ratingIds.includes(srcTd.equipped) || ratingIds.includes(equipped);
    // Stats Esthétisme fiables = assez de votants. Sinon un fetch partiel (0 votes)
    // ne doit PAS stripper les titres ni forcer Discordien (bug « titre qui saute »).
    const beautyStatsReliable = (Number(stats && stats.ratingVotes) || 0) >= RATING_MIN_VOTERS;

    // Titres missions / boutique retirés : on ne garde que Esthétisme + exclusifs + custom admin
    collected = collected.filter(id => isKeepableTitleId(id));
    if (beautyStatsReliable) {
      // Retire les titres de note qui ne matchent plus la note actuelle (descente → titres plus bas)
      collected = collected.filter(id => !ratingIds.includes(id) || eligible.includes(id));
    }
    // Réinjecte les custom définis
    Object.keys(custom).forEach(id => {
      if (!collected.includes(id)) collected.push(id);
    });

    const newBeautyTitles = [];
    eligible.forEach(id => {
      if (!ratingIds.includes(id)) return;
      if (!collected.includes(id)) {
        collected.push(id);
        newBeautyTitles.push(id);
      }
    });

    const highestBeauty = highestCollectedBeautyId(collected);
    // Si un titre Esthétisme est (était) équipé : coller au plus haut encore valide (montée ou descente)
    // — uniquement quand les stats notes sont fiables, sinon on garde l'équipé actuel.
    if (equippedWasBeauty) {
      if (beautyStatsReliable) {
        equipped = highestBeauty || (collected.includes(srcTd.equipped) ? srcTd.equipped : null) || DISCORDIEN_ID;
      } else if (srcTd.equipped && collected.includes(srcTd.equipped)) {
        equipped = srcTd.equipped;
      } else if (highestBeauty) {
        equipped = highestBeauty;
      }
    } else if (equipped && !collected.includes(equipped)) {
      equipped = highestBeauty || collected.find(id => id !== BETA_TESTER_ID) || DISCORDIEN_ID;
    }

    let claims = Array.isArray(snapshot.questCoinClaims) ? snapshot.questCoinClaims.slice() : [];
    let coins = typeof snapshot.coins === 'number' ? snapshot.coins : 0;
    let gainedCoins = 0;
    const claimable = [];
    eligible.forEach(id => {
      if (ratingIds.includes(id)) return;
      if (!isVisibleQuestClaimId(id)) return;
      const m = getMission(id);
      const lvl = missionCoinLevel(m);
      if (lvl < 0) return;
      if (claims.includes(id)) return;
      claimable.push(id);
      if (autoClaimCoins) {
        const reward = missionCoinRewardAmount(m);
        coins += reward;
        gainedCoins += reward;
        claims.push(id);
      }
    });

    // pending = quêtes pièces à réclamer (plus de titres de missions)
    const pending = claimable.slice();
    return {
      coins,
      questCoinClaims: claims,
      titlesData: { collected, pending, equipped, color, custom },
      gainedCoins,
      newBeautyTitles,
      eligible,
      claimable,
    };
  }

  function computeEligible(stats) {
    const result = applyQuestProgress(stats, {
      coins: getCoins(),
      questCoinClaims: getQuestCoinClaims(),
      titlesData: getTitlesData(),
    }, { autoClaimCoins: false });
    const td = getTitlesData();
    const sameCollected = result.titlesData.collected.length === td.collected.length
      && result.titlesData.collected.every((id, i) => id === td.collected[i]);
    if (!sameCollected || result.titlesData.equipped !== td.equipped
      || result.titlesData.pending.length !== (td.pending || []).length
      || result.titlesData.pending.some((id, i) => id !== td.pending[i])) {
      saveTitlesData({
        collected: result.titlesData.collected,
        equipped: result.titlesData.equipped,
        pending: result.titlesData.pending,
      });
    }
    return result.eligible;
  }

  function missionCoinLevel(m) {
    if (!m || isRatingTitle(m) || m.stat === 'beta') return -1;
    // Déblocage Esthétisme : pas une quête à pièces
    if (m.id === VOTES_UNLOCK.id) return -1;
    const match = String(m.id).match(/^(\w+)_(\d+)$/);
    if (!match) return -1;
    const th = parseInt(match[2], 10);
    const idx = MILESTONES.indexOf(th);
    if (idx >= 0) return idx;
    if (th >= 2500) return MILESTONES.length + Math.floor((th - 2500) / 500);
    return -1;
  }

  function questTrackStatIds() {
    const ids = new Set();
    QUEST_TRACKS.forEach(t => { if (t.statId) ids.add(t.statId); });
    return ids;
  }

  /** Uniquement les paliers visibles dans la modale Quêtes (+ bonus quotidien). */
  function isVisibleQuestClaimId(id) {
    if (id === 'daily_login') return true;
    const match = String(id || '').match(/^([a-z_]+)_(\d+)$/i);
    if (!match) return false;
    return questTrackStatIds().has(match[1]);
  }

  function questCoinReward(levelIndex) {
    if (levelIndex < 0) return 0;
    return QUEST_COIN_REWARD[Math.min(levelIndex, QUEST_COIN_REWARD.length - 1)];
  }

  function getQuestCoinClaims() {
    const u = readSite().user || {};
    return Array.isArray(u.questCoinClaims) ? u.questCoinClaims : [];
  }

  function saveQuestCoinClaims(list) {
    const s = readSite();
    s.user = s.user || {};
    s.user.questCoinClaims = list;
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
  }

  /** Clé jour locale YYYY-MM-DD */
  function localDayKey(d) {
    const x = d || new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDayKey(d);
  }

  function getDailyLogin() {
    const u = readSite().user || {};
    const d = u.dailyLogin && typeof u.dailyLogin === 'object' ? u.dailyLogin : {};
    return {
      streak: typeof d.streak === 'number' ? d.streak : 0,
      lastClaim: typeof d.lastClaim === 'string' ? d.lastClaim : null,
    };
  }

  function saveDailyLogin(data) {
    const s = readSite();
    s.user = s.user || {};
    s.user.dailyLogin = {
      streak: Math.max(0, Math.floor(data.streak || 0)),
      lastClaim: data.lastClaim || null,
    };
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
  }

  /** Jour N → 50 + (N−1)×25 (jour 1 = 50, jour 2 = 75, jour 3 = 100…). */
  function dailyLoginReward(day) {
    const n = Math.max(1, Math.floor(day || 1));
    return 50 + (n - 1) * 25;
  }

  function evalDailyLogin() {
    const cur = getDailyLogin();
    const today = localDayKey();
    if (cur.lastClaim === today) {
      const claimed = cur.streak || 1;
      const nextDay = claimed + 1;
      return {
        streak: claimed,
        claimable: false,
        reward: dailyLoginReward(claimed),
        // Bouton : prévisualise le prochain jour (non cliquable)
        btnDay: nextDay,
        btnReward: dailyLoginReward(nextDay),
        dayLabel: claimed,
      };
    }
    const nextStreak = (cur.lastClaim === yesterdayKey()) ? (cur.streak || 0) + 1 : 1;
    return {
      streak: nextStreak,
      claimable: true,
      reward: dailyLoginReward(nextStreak),
      btnDay: nextStreak,
      btnReward: dailyLoginReward(nextStreak),
      dayLabel: nextStreak,
    };
  }

  function claimDailyLogin() {
    const state = evalDailyLogin();
    if (!state.claimable) return null;
    setCoins(getCoins() + state.reward);
    saveDailyLogin({ streak: state.streak, lastClaim: localDayKey() });
    updateQuestButtonBadge();
    return { gained: state.reward, streak: state.streak, coins: getCoins() };
  }

  function processQuestCoinRewards(stats) {
    refreshPending(stats);
    return 0;
  }

  function listClaimableQuestIds(stats) {
    const result = applyQuestProgress(stats || {}, {
      coins: getCoins(),
      questCoinClaims: getQuestCoinClaims(),
      titlesData: getTitlesData(),
    }, { autoClaimCoins: false });
    const ids = (result.claimable || []).filter(isVisibleQuestClaimId);
    if (evalDailyLogin().claimable) ids.push('daily_login');
    return ids;
  }

  function updateQuestButtonBadge(stats) {
    const ids = ['navQuests', 'btnQuests'];
    const claimable = listClaimableQuestIds(stats || (readSite().user || {}).questStats || {});
    const n = claimable.length;
    ids.forEach(id => {
      const btn = $(id);
      if (!btn) return;
      btn.style.overflow = 'visible';
      let badge = btn.querySelector('.tq-quest-badge');
      if (!n) {
        if (badge) badge.remove();
        btn.classList.remove('tq-quest-has-claim');
        btn.removeAttribute('data-quest-claims');
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tq-quest-badge';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      badge.textContent = n > 9 ? '9+' : String(n);
      btn.classList.add('tq-quest-has-claim');
      btn.setAttribute('data-quest-claims', String(n));
    });
  }

  function refreshPending(stats) {
    const before = getTitlesData();
    const beforeBeauty = (before.collected || []).filter(id => String(id).startsWith('rt_')).length;
    const result = applyQuestProgress(stats, {
      coins: getCoins(),
      questCoinClaims: getQuestCoinClaims(),
      titlesData: before,
    }, { autoClaimCoins: false });
    const next = result.titlesData;
    const sameCollected = next.collected.length === before.collected.length
      && next.collected.every((id, i) => id === before.collected[i]);
    const samePending = next.pending.length === (before.pending || []).length
      && next.pending.every((id, i) => id === before.pending[i]);
    const sameEquipped = next.equipped === before.equipped;
    const sameColor = (next.color || '#C7A5FF') === (before.color || '#C7A5FF');
    // Évite les saves/sync inutiles qui réécrivent Discordien en boucle
    if (!(sameCollected && samePending && sameEquipped && sameColor)) {
      saveTitlesData({
        collected: next.collected,
        pending: next.pending,
        equipped: next.equipped,
        color: next.color,
        custom: next.custom,
      });
    }
    if (result.newBeautyTitles.length) {
      result.newBeautyTitles.forEach(id => bumpGlobalStat(id));
      tqToast(result.newBeautyTitles.length === 1 ? 'Titre Esthétisme débloqué !' : 'Titres Esthétisme débloqués !');
    }
    const claimN = (result.claimable || []).length + (evalDailyLogin().claimable ? 1 : 0);
    if (claimN > 0 && !refreshPending._notifiedClaim) {
      refreshPending._notifiedClaim = true;
      tqToast(claimN === 1 ? '1 quête à réclamer !' : `${claimN} quêtes à réclamer !`);
    }
    if (typeof global.__scheduleCloudSync === 'function'
      && (result.newBeautyTitles.length || next.collected.filter(id => String(id).startsWith('rt_')).length !== beforeBeauty
        || !samePending || !sameEquipped)) {
      global.__scheduleCloudSync();
    }
    updateQuestButtonBadge(stats);
    return next.pending;
  }

  function collectMission(id) {
    const td = getTitlesData();
    if (!td.pending.includes(id) && !td.collected.includes(id)) return false;
    if (!td.collected.includes(id)) td.collected.push(id);
    td.pending = td.pending.filter(x => x !== id);
    if (!td.equipped) td.equipped = id;
    saveTitlesData({ collected: td.collected, pending: td.pending, equipped: td.equipped });
    bumpGlobalStat(id);
    return true;
  }

  /** Réclame les pièces d'un palier terminé (pas de titre de mission). */
  function claimQuestReward(id) {
    const m = getMission(id);
    if (!m || isRatingTitle(m)) return null;
    const stats = (readSite().user || {}).questStats || {};
    const eligible = listEligibleMissionIds(stats);
    if (!eligible.includes(id)) return null;

    let gained = 0;
    const claims = getQuestCoinClaims().slice();
    if (!claims.includes(id)) {
      gained = missionCoinRewardAmount(m);
      if (gained > 0) setCoins(getCoins() + gained);
      claims.push(id);
      saveQuestCoinClaims(claims);
    }
    const td = getTitlesData();
    td.pending = (td.pending || []).filter(x => x !== id);
    saveTitlesData({ pending: td.pending, collected: td.collected.filter(isKeepableTitleId), equipped: td.equipped });
    updateQuestButtonBadge(stats);
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
    return { id, gained, coins: getCoins() };
  }

  function bumpGlobalStat(id) {
    try {
      const g = JSON.parse(localStorage.getItem(GLOBAL_STATS_KEY) || '{}');
      g[id] = (g[id] || 0) + 1;
      g.__totalUsers = Math.max(g.__totalUsers || 120, Object.values(g).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0));
      localStorage.setItem(GLOBAL_STATS_KEY, JSON.stringify(g));
    } catch (_) {}
  }

  function globalTitleStats(id) {
    try {
      const g = JSON.parse(localStorage.getItem(GLOBAL_STATS_KEY) || '{}');
      const count = g[id] || 0;
      const total = Math.max(g.__totalUsers || 500, 1);
      return { count, pct: Math.round((count / total) * 1000) / 10 };
    } catch (_) { return { count: 0, pct: 0 }; }
  }

  function titleDisplay(m) {
    if (!m) return '';
    if (m.id === DISCORDIEN_ID) return discordienLabel();
    const t = m.title || '';
    if (m.noTranslate) return t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  }

  function isRatingTitle(m) {
    return !!(m && (m.stat === 'rating' || String(m.id || '').startsWith('rt_')));
  }

  function titleCoinPrice(m) {
    // Boutique de titres désactivée pour le moment
    return null;
  }

  function getCoins() {
    const u = readSite().user || {};
    return typeof u.coins === 'number' ? u.coins : 0;
  }

  function setCoins(n) {
    const s = readSite();
    s.user = s.user || {};
    s.user.coins = Math.max(0, Math.floor(n));
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
  }

  function tqToast(m) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = m;
    t.classList.add('show');
    clearTimeout(tqToast._t);
    tqToast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function buyTitle(id) {
    // Boutique désactivée temporairement
    return false;
  }

  function equippedTitleMeta(td) {
    if (!td?.equipped) return null;
    return resolveTitleMeta(td.equipped, td);
  }

  const TITLE_TYPO_POOL = [
    { family: '"Inter", system-ui, sans-serif', weight: 800, spacing: '.10em', transform: 'uppercase' },
    { family: '"Space Grotesk", sans-serif', weight: 700, spacing: '.11em', transform: 'uppercase' },
    { family: '"Clash Display", sans-serif', weight: 800, spacing: '.13em', transform: 'uppercase' },
    { family: '"Cinzel Decorative", serif', weight: 700, spacing: '.15em', transform: 'uppercase' },
    { family: '"Unbounded", sans-serif', weight: 800, spacing: '.09em', transform: 'uppercase' },
    { family: '"Bebas Neue", sans-serif', weight: 400, spacing: '.07em', transform: 'uppercase' },
    { family: '"Orbitron", sans-serif', weight: 900, spacing: '.11em', transform: 'uppercase' },
    { family: '"Playfair Display SC", serif', weight: 700, spacing: '.18em', transform: 'uppercase' },
  ];

  function titleTypoMeta(m) {
    if (!m) return TITLE_TYPO_POOL[3];
    if (m.noTranslate) {
      return { family: '"Space Grotesk", sans-serif', weight: 700, spacing: '.05em', transform: 'none' };
    }
    const h = String(m.id || m.title || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const base = TITLE_TYPO_POOL[h % TITLE_TYPO_POOL.length];
    const rBoost = Math.max(0, (m.rarity || 1) - 1) * 0.011;
    const spacing = (parseFloat(base.spacing) + rBoost).toFixed(3) + 'em';
    const weight = (m.rarity || 1) >= 12 ? 900 : base.weight;
    return { family: base.family, weight, spacing, transform: base.transform };
  }

  function titleTypoCss(m) {
    const t = titleTypoMeta(m);
    return `--title-font:${t.family};--title-weight:${t.weight};--title-spacing:${t.spacing};--title-transform:${t.transform}`;
  }

  function nextUncollectedMissionId(sm, td) {
    for (const th of MILESTONES) {
      const id = missionId(sm.id, th);
      if (!td.collected.includes(id)) return id;
    }
    let th = 2500;
    while (td.collected.includes(missionId(sm.id, th))) th += 500;
    return missionId(sm.id, th);
  }

  /** Titres verrouillés visibles dans la modale : prochain palier par piste + quêtes en attente. */
  function computeSoonTitleIds(stats, td) {
    td = td || getTitlesData();
    const soon = new Set();
    (td.pending || []).forEach(id => soon.add(id));

    QUEST_TRACKS.forEach(track => {
      const m = nextMissionForTrack(track, stats);
      if (!m || td.collected.includes(m.id)) return;
      const p = missionProgress(m, stats);
      if (p.current > 0 || p.pct >= 18 || td.pending.includes(m.id) || p.complete) soon.add(m.id);
    });

    if (!td.collected.includes(VOTES_UNLOCK.id)) {
      const p = missionProgress({ id: VOTES_UNLOCK.id, stat: VOTES_UNLOCK.stat, threshold: VOTES_UNLOCK.threshold }, stats);
      if (p.current > 0 || p.complete) soon.add(VOTES_UNLOCK.id);
    }

    STAT_MISSIONS.forEach(sm => {
      const id = nextUncollectedMissionId(sm, td);
      if (td.collected.includes(id)) return;
      const m = getMission(id);
      if (!m) return;
      const p = missionProgress(m, stats);
      if (p.current > 0 || p.pct >= 18 || td.pending.includes(id)) soon.add(id);
    });

    if ((stats.ratingVotes || 0) > 0 && (stats.ratingVotes || 0) < RATING_MIN_VOTERS && !td.collected.includes('rt_subhuman')) {
      soon.add('rt_subhuman');
    }

    if ((stats.ratingVotes || 0) >= RATING_MIN_VOTERS) {
      RATING_TITLES.forEach(r => {
        if (td.collected.includes(r.id)) return;
        if (stats.rating >= r.min - 0.35 && stats.rating < r.max + 0.15) soon.add(r.id);
      });
    }

    return soon;
  }

  function titleBadgeInnerHtml(title, rarity, escH) {
    const shine = (rarity >= 8) ? '<span class="card-profile-title-shine" aria-hidden="true"></span>' : '';
    return `<span class="card-profile-title-glow" aria-hidden="true"></span><span class="card-profile-title-aura" aria-hidden="true"></span>${shine}<span class="card-profile-title-text">${escH(title)}</span>`;
  }

  function cardTitleBadgeHtml(td, escH, opts) {
    opts = opts || {};
    const meta = equippedTitleMeta(td);
    if (!meta) return '';
    const color = td.color || '#C7A5FF';
    const rarity = meta.rarity || 3;
    const inner = titleBadgeInnerHtml(titleDisplay(meta), rarity, escH);
    const typo = titleTypoCss(meta);
    if (opts.asSpan) {
      return `<span class="card-profile-title" data-rarity="${rarity}" data-title-id="${escH(meta.id)}" style="--title-color:${escH(color)};${typo}" title="${escH(meta.title)}">${inner}</span>`;
    }
    const cls = opts.clickable ? 'card-profile-title card-profile-title--clickable' : 'card-profile-title';
    return `<button type="button" class="${cls}" data-rarity="${rarity}" data-title-id="${escH(meta.id)}" style="--title-color:${escH(color)};${typo}" title="${escH(meta.title)}"${opts.clickable ? '' : ' tabindex="-1"'}>${inner}</button>`;
  }

  function cardTitleHtml(p, escFn) {
    const escH = escFn || esc;
    const td = titlesDataForCard(p);
    return cardTitleBadgeHtml(td, escH, { clickable: !!p.isMe });
  }

  /** Éditeur : texte brut + petit bouton edit (pas de badge pill). */
  function editorTitleSlotHtml(p, escFn) {
    const escH = escFn || esc;
    const td = titlesDataForCard(p);
    const meta = equippedTitleMeta(td);
    if (!meta) return '';
    const color = td.color || '#C7A5FF';
    const typo = titleTypoCss(meta);
    return `<div class="ed-title-inline">
      <span class="ed-title-text" style="--title-color:${escH(color)};${typo}">${escH(titleDisplay(meta))}</span>
      <button type="button" class="ed-title-edit-btn" aria-label="Changer de titre">✎</button>
    </div>`;
  }

  function cardTitleSlotHtml(p, escFn) {
    const escH = escFn || esc;
    const td = titlesDataForCard(p);
    const inner = cardTitleBadgeHtml(td, escH, { asSpan: true });
    if (p.isMe) {
      return `<button type="button" class="card-title-slot card-title-slot--clickable" aria-label="Changer de titre">${inner}</button>`;
    }
    return inner ? `<div class="card-title-slot">${cardTitleBadgeHtml(td, escH, { clickable: false })}</div>` : '';
  }

  function discordTagLabel(p) {
    const MC = global.MatefindrConnections;
    if (!MC || !p.connections || !MC.connIsSet(p.connections, 'discord')) return '';
    const e = MC.connGet(p.connections, 'discord');
    const tag = (e?.label || p.discordTag || p.tag || '').replace(/^@+/, '').replace(/^\.+/, '');
    return tag || '';
  }

  const DISCORD_STATUS_LABEL = {
    online: 'En ligne', idle: 'Inactif', dnd: 'Ne pas déranger', offline: 'Hors ligne', invisible: 'Hors ligne',
  };

  function discordFloorAvatar(p) {
    return p.discordAvatarUrl || p.avatarUrl || '';
  }

  function listPlayableActivities(activities) {
    return (activities || []).filter(a =>
      a && typeof a === 'object' && a.type !== 4 && String(a.name || '') !== 'Custom Status'
    );
  }

  function pickBestActivity(activities) {
    const list = listPlayableActivities(activities);
    if (!list.length) return null;
    return list.find(a => a.type === 2) || list.find(a => a.type === 0) || list[0];
  }

  function rankActivities(activities) {
    const list = listPlayableActivities(activities).slice();
    const score = (x) => (x.type === 2 ? 0 : x.type === 0 ? 1 : x.type === 1 ? 2 : 3);
    list.sort((a, b) => score(a) - score(b));
    return list;
  }

  function discordActivitySubLine(act) {
    if (!act) return '';
    const head = discordActivityHeader(act);
    const detail = act.details || act.state || '';
    if (detail && detail !== act.name) return `${head} · ${detail}`;
    return head;
  }

  function discordActivityArt(act) {
    const img = act.assets?.large_image || act.assets?.small_image;
    if (!img) return null;
    const s = String(img);
    if (/^https?:\/\//i.test(s)) return s;
    /* Spotify Rich Presence : spotify:<id> → CDN Spotify */
    if (s.startsWith('spotify:')) {
      return 'https://i.scdn.co/image/' + s.slice(8);
    }
    if (s.startsWith('mp:external/')) {
      try {
        const encoded = s.split('/').slice(2).join('/');
        return decodeURIComponent(encoded);
      } catch (_) { return null; }
    }
    const appId = act.application_id || act.applicationId;
    if (appId) {
      const id = s.replace(/^mp:/, '');
      if (/^[a-zA-Z0-9_]+$/.test(id)) {
        return `https://cdn.discordapp.com/app-assets/${appId}/${id}.png?size=128`;
      }
    }
    return null;
  }

  function discordActivityHeader(act) {
    const t = typeof act.type === 'number' ? act.type : 0;
    const name = act.name || '';
    if (t === 2) return /spotify/i.test(name) ? 'Écoute Spotify' : (name ? `Écoute ${name}` : 'Écoute');
    if (t === 0) return name ? `Joue à ${name}` : 'En jeu';
    if (t === 3) return name ? `Regarde ${name}` : 'Regarde';
    if (t === 5) return name ? `En compétition sur ${name}` : 'En compétition';
    if (t === 1) return name ? `Stream ${name}` : 'En stream';
    return name || 'Activité';
  }

  function fmtActivityClock(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  function discordActivityProgress(act, nowMs) {
    const ts = act.timestamps;
    if (!ts || ts.start == null || ts.end == null) return null;
    const start = Number(ts.start), end = Number(ts.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    return { pct, current: fmtActivityClock(now - start), total: fmtActivityClock(end - start), start, end };
  }

  function discordActivityCoverFallback(act) {
    const t = typeof act.type === 'number' ? act.type : 0;
    if (t === 2) return '<svg width="22" height="22" viewBox="0 0 24 24" fill="#1DB954"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.7.7 0 0 1-.96.23c-2.6-1.6-5.9-1.96-9.78-1.07a.7.7 0 1 1-.3-1.37c4.2-.94 7.83-.54 10.7 1.24a.7.7 0 0 1 .23.97Zm1.25-2.78a.88.88 0 0 1-1.2.28c-2.97-1.83-7.5-2.36-11.02-1.3a.88.88 0 0 1-.5-1.69c4-1.2 8.97-.6 12.4 1.5.4.25.55.81.32 1.21Zm.1-2.9c-3.56-2.12-9.44-2.32-12.83-1.28a1.05 1.05 0 1 1-.6-2.02c3.9-1.18 10.4-.95 14.5 1.5a1.05 1.05 0 1 1-1.07 1.8Z"/></svg>';
    if (t === 0) return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 12h2M9 11v2M14 12h.01M16 13h.01"/></svg>';
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5be9ff" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
  }

  function discordActivityCardHtml(act, escH) {
    if (!act) return '';
    const art = discordActivityArt(act);
    const title = act.details || act.name || '';
    const sub = act.state || (act.details ? act.name : '') || '';
    const prog = discordActivityProgress(act);
    const isSpotify = /spotify/i.test(act.name || '');
    const brand = isSpotify ? 'https://cdn.simpleicons.org/spotify/1DB954' : '';
    const cover = art
      ? `<img class="discord-activity-cover" src="${escH(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="discord-activity-cover discord-activity-cover--ph">${discordActivityCoverFallback(act)}</span>`;
    const progHtml = prog
      ? `<div class="discord-activity-progress" data-start="${prog.start}" data-end="${prog.end}"><span style="width:${prog.pct.toFixed(1)}%"></span></div>
          <div class="discord-activity-times" data-start="${prog.start}" data-end="${prog.end}"><span class="da-cur">${prog.current}</span><span class="da-tot">${prog.total}</span></div>`
      : '';
    return `<div class="discord-activity${isSpotify ? ' discord-activity--spotify' : ''}">
      <div class="discord-activity-head">
        <span class="discord-activity-kind">${escH(discordActivityHeader(act))}</span>
        ${brand ? `<img class="discord-activity-brand" src="${brand}" alt="" width="16" height="16" loading="lazy">` : ''}
      </div>
      <div class="discord-activity-body">
        ${cover}
        <div class="discord-activity-meta">
          ${title ? `<b>${escH(title)}</b>` : ''}
          ${sub ? `<span>${escH(sub)}</span>` : ''}
          ${progHtml}
        </div>
      </div>
    </div>`;
  }

  function discordStatusLine(live, showStatus, fmtRelative) {
    if (!showStatus) return '';
    const status = live?.status || 'offline';
    const online = status && !['offline', 'invisible'].includes(status);
    if (online) return DISCORD_STATUS_LABEL[status] || DISCORD_STATUS_LABEL.online;
    const at = live?.lastOnlineAt || live?.updatedAt || null;
    if (!at) return DISCORD_STATUS_LABEL.offline;
    const rel = fmtRelative ? fmtRelative(at) : '';
    return rel ? `Vu ${rel}` : DISCORD_STATUS_LABEL.offline;
  }

  function discordDotClass(live) {
    const status = live?.status || 'offline';
    if (status === 'online') return 'online';
    if (status === 'idle') return 'idle';
    if (status === 'dnd') return 'dnd';
    return 'offline';
  }

  function discordActivityLine(act) {
    if (!act) return '';
    const t = act.details || act.state || act.name || '';
    return t;
  }

  function discordFloorHtml(p, helpers) {
    const head = discordCardHeadHtml(p, helpers);
    if (!head) return '';
    return head;
  }

  function discordCardHeadHtml(p, helpers) {
    helpers = helpers || {};
    const escH = helpers.esc || esc;
    const MC = global.MatefindrConnections;
    if (!MC || !p.connections || !MC.connIsSet(p.connections, 'discord')) return '';
    const e = MC.connGet(p.connections, 'discord');
    if (!e) return '';
    const showStatus = e.showStatus !== false;
    const showActivity = e.showActivity !== false;
    const showLabel = e.showLabel !== false;
    if (!showActivity && !showStatus) return '';

    const live = p.discordLive;
    const tag = discordTagLabel(p);
    const avi = discordFloorAvatar(p);
    const aviInner = avi
      ? `<img src="${escH(avi)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
      : `<span>${escH((p.initial || tag || '?').charAt(0).toUpperCase())}</span>`;

    const acts = showActivity ? rankActivities(live?.activities) : [];
    const primary = acts[0] || null;
    const extras = acts.slice(1);
    const statusSub = discordStatusLine(live, showStatus, helpers.fmtRelative);

    // Une seule ligne compacte ; au survol → détail de TOUTES les activités
    let subHtml = '';
    if (primary) {
      const line = discordActivitySubLine(primary);
      const moreN = extras.length;
      const detailCards = acts.map(a => discordActivityCardHtml(a, escH)).join('');
      subHtml = `<span class="discord-floor-act" tabindex="0">
        <span class="discord-floor-sub discord-floor-sub--activity">${escH(line)}</span>
        ${moreN ? `<span class="discord-floor-more">+${moreN}</span>` : ''}
        <span class="discord-floor-act-detail" role="tooltip">${detailCards}</span>
      </span>`;
    } else if (statusSub) {
      subHtml = `<span class="discord-floor-sub">${escH(statusSub)}</span>`;
    }

    const dotCls = discordDotClass(live);
    const nameCls = 'discord-floor-name' + (showLabel ? '' : ' discord-floor-name--blur');
    const nameText = tag || p.discordTag || p.tag || 'discord';

    return `<div class="discord-floor discord-floor--head${primary ? ' discord-floor--has-act' : ''}" aria-label="Discord">
      <div class="discord-floor-head">
        <div class="discord-floor-avi">
          <div class="discord-floor-avi-inner">${aviInner}</div>
          ${showStatus ? `<span class="discord-floor-dot ${dotCls}" aria-hidden="true"></span>` : ''}
        </div>
        <div class="discord-floor-meta">
          <b class="${nameCls}"${showLabel ? '' : ' title="Username masqué"'}>${escH(nameText)}</b>
          ${subHtml}
        </div>
      </div>
    </div>`;
  }

  function discordCardActivityHtml() {
    return '';
  }

  /* ---- Hover activités : portail fixed hors overflow de la carte ---- */
  let _daPortalDetail = null;
  let _daPortalHost = null;
  let _daLeaveTimer = null;

  function closeDiscordActPortal() {
    if (_daLeaveTimer) { clearTimeout(_daLeaveTimer); _daLeaveTimer = null; }
    if (!_daPortalDetail) return;
    _daPortalDetail.classList.remove('is-open', 'discord-floor-act-detail--portal');
    _daPortalDetail.style.cssText = '';
    if (_daPortalHost && _daPortalDetail.parentElement === document.body) {
      _daPortalHost.appendChild(_daPortalDetail);
    }
    _daPortalDetail = null;
    _daPortalHost = null;
  }

  function openDiscordActPortal(actEl) {
    const detail = actEl.querySelector(':scope > .discord-floor-act-detail');
    if (!detail) return;
    if (_daPortalHost === actEl && _daPortalDetail === detail) {
      if (_daLeaveTimer) { clearTimeout(_daLeaveTimer); _daLeaveTimer = null; }
      return;
    }
    closeDiscordActPortal();
    _daPortalHost = actEl;
    _daPortalDetail = detail;
    document.body.appendChild(detail);
    detail.classList.add('is-open', 'discord-floor-act-detail--portal');
    const r = actEl.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    detail.style.left = left + 'px';
    detail.style.top = top + 'px';
    detail.style.width = w + 'px';
    requestAnimationFrame(() => {
      if (_daPortalDetail !== detail) return;
      const h = detail.offsetHeight || 160;
      if (top + h > window.innerHeight - 8 && r.top > h + 16) {
        detail.style.top = Math.max(8, r.top - h - 8) + 'px';
      }
      tickDiscordActivityProgress(detail);
    });
  }

  function scheduleCloseDiscordActPortal() {
    if (_daLeaveTimer) clearTimeout(_daLeaveTimer);
    _daLeaveTimer = setTimeout(closeDiscordActPortal, 140);
  }

  function bindDiscordActPopovers(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.discord-floor-act').forEach(act => {
      if (act.dataset.daPortalBound) return;
      act.dataset.daPortalBound = '1';
      const detail = act.querySelector(':scope > .discord-floor-act-detail');
      if (!detail) return;
      act.addEventListener('mouseenter', () => openDiscordActPortal(act));
      act.addEventListener('mouseleave', scheduleCloseDiscordActPortal);
      act.addEventListener('focusin', () => openDiscordActPortal(act));
      act.addEventListener('focusout', (e) => {
        if (!act.contains(e.relatedTarget) && !(_daPortalDetail && _daPortalDetail.contains(e.relatedTarget))) {
          scheduleCloseDiscordActPortal();
        }
      });
      detail.addEventListener('mouseenter', () => {
        if (_daLeaveTimer) { clearTimeout(_daLeaveTimer); _daLeaveTimer = null; }
      });
      detail.addEventListener('mouseleave', scheduleCloseDiscordActPortal);
    });
  }

  /** Fait avancer le chrono Spotify localement (1×/s) sans refetch. */
  function tickDiscordActivityProgress(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const now = Date.now();
    scope.querySelectorAll('.discord-activity-progress[data-start][data-end]').forEach(el => {
      const start = Number(el.dataset.start);
      const end = Number(el.dataset.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
      const bar = el.querySelector('span');
      if (bar) bar.style.width = pct.toFixed(1) + '%';
      const times = el.nextElementSibling;
      if (times && times.classList.contains('discord-activity-times')) {
        const cur = times.querySelector('.da-cur');
        const tot = times.querySelector('.da-tot');
        if (cur) cur.textContent = fmtActivityClock(now - start);
        if (tot) tot.textContent = fmtActivityClock(end - start);
      }
    });
  }

  if (!global.__mfDaProgressTimer) {
    global.__mfDaProgressTimer = setInterval(() => {
      try { tickDiscordActivityProgress(document); } catch (_) {}
    }, 1000);
  }

  function discordPreviewHtml(user, helpers) {
    helpers = helpers || {};
    const escH = helpers.esc || esc;
    const u = user || readSite().user || {};
    const p = {
      connections: { discord: { v: u.discordId, showActivity: true, showStatus: true, label: u.discordTag } },
      discordLive: u.discordLive,
      discordTag: u.discordTag,
      tag: u.discordTag,
      avatarUrl: u.avatarUrl,
      discordAvatarUrl: u.discordAvatarUrl || u.avatarUrl,
      initial: (u.displayName || 'T').charAt(0),
    };
    return discordFloorHtml(p, helpers);
  }

  function missionLevelLabel(m) {
    if (!m) return '';
    if (isRatingTitle(m)) {
      const idx = RATING_TITLES.findIndex(r => r.id === m.id);
      if (idx < 0) return '';
      const r = RATING_TITLES[idx];
      const max = r.max > 5 ? 5 : r.max;
      return `Lvl ${idx + 1} · ${r.min.toFixed(1)}–${max.toFixed(1)}★`;
    }
    const lvl = missionCoinLevel(m);
    return lvl >= 0 ? `Lvl ${lvl + 1}` : '';
  }

  function nextBeautyTitleMeta(stats) {
    const arrow = beautyArrow(stats);
    if (arrow.locked || arrow.maxed) return null;
    const r = RATING_TITLES.find(t => stats.rating < t.min) || RATING_TITLES[RATING_TITLES.length - 1];
    if (!r) return null;
    return getMission(r.id) || {
      id: r.id,
      title: r.label.charAt(0).toUpperCase() + r.label.slice(1),
      rarity: r.rarity,
      ratingMin: r.min,
      ratingMax: r.max,
      noTranslate: true,
      stat: 'rating',
    };
  }

  function renderBeautyTitlesPanel(stats, td) {
    const soon = nextBeautyTitleMeta(stats);
    const rating = Number(stats.rating) || 0;
    const unlocked = (stats.ratingVotes || 0) >= RATING_MIN_VOTERS;
    let rows = '';
    RATING_TITLES.forEach((r, i) => {
      const meta = getMission(r.id);
      const owned = td.collected.includes(r.id);
      const isSoon = soon && soon.id === r.id;
      const isCurrent = unlocked && rating >= r.min && rating < r.max;
      const typo = titleTypoCss(meta || { id: r.id, title: r.label, rarity: r.rarity, noTranslate: true });
      const cls = `tq-beauty-title-row${owned ? ' is-owned' : ''}${isSoon ? ' is-soon' : ''}${isCurrent ? ' is-current' : ''}`;
      rows += `<div class="${cls}" style="--title-color:${esc(td.color || '#C7A5FF')};${typo}">
        <span class="tq-beauty-title-lvl">Lvl ${i + 1}</span>
        <span class="tq-beauty-title-name">${esc(titleDisplay(meta) || (r.label.charAt(0).toUpperCase() + r.label.slice(1)))}</span>
        <span class="tq-beauty-title-range">${r.min.toFixed(1)} – ${(r.max > 5 ? 5 : r.max).toFixed(1)}</span>
        ${owned ? '<span class="tq-done-lbl">Obtenu</span>' : (isSoon ? '<span class="tq-soon">Bientôt</span>' : '')}
      </div>`;
    });
    return `<div class="tq-beauty-titles" id="tqBeautyTitles" hidden>
      ${soon && !arrowLocked(stats) ? `<div class="tq-beauty-soon-banner">Bientôt : <b>${esc(titleDisplay(soon))}</b> · ${Number(soon.ratingMin || soon.threshold || 0).toFixed(1)}★</div>` : ''}
      ${rows}
    </div>`;
  }

  function arrowLocked(stats) {
    return (stats.ratingVotes || 0) < RATING_MIN_VOTERS;
  }

  function nextMissionForTrack(track, stats) {
    if (track.isRating) {
      if ((stats.ratingVotes || 0) < RATING_MIN_VOTERS) {
        return getMission('rt_subhuman') || MISSIONS.find(m => m.id === 'rt_subhuman');
      }
      const bracket = RATING_TITLES.find(r => stats.rating >= r.min && stats.rating < r.max);
      return getMission((bracket || RATING_TITLES[RATING_TITLES.length - 1]).id);
    }
    const cur = stats[track.stat] || 0;
    const claims = getQuestCoinClaims();
    const thresholds = milestonesFrom(Math.max(cur + 1, 2000));
    // 1) Premier palier atteint non réclamé → bouton Réclamer à 100 %
    for (let i = 0; i < thresholds.length; i++) {
      const th = thresholds[i];
      const id = missionId(track.statId, th);
      if (cur >= th && !claims.includes(id)) return getMission(id);
    }
    // 2) Sinon prochain palier en cours
    let targetTh = thresholds.find(th => cur < th);
    if (!targetTh) {
      let th = thresholds[thresholds.length - 1] || 2500;
      while (cur >= th) th += 500;
      targetTh = th;
    }
    return getMission(missionId(track.statId, targetTh));
  }

  function renderQuestsDailyBtn() {
    const daily = evalDailyLogin();
    const btn = $('questsDailyBtn');
    if (!btn) return;
    btn.textContent = `Jour ${daily.btnDay} = ${daily.btnReward} pièces`;
    btn.disabled = !daily.claimable;
    btn.classList.toggle('is-claimable', daily.claimable);
    btn.classList.toggle('is-locked', !daily.claimable);
    btn.setAttribute('aria-label', daily.claimable
      ? `Réclamer bonus jour ${daily.btnDay}`
      : `Bonus jour ${daily.btnDay} demain`);
    // Pastille notif quand le bonus journalier est réclamable
    let notif = btn.querySelector('.tq-daily-notif');
    if (daily.claimable) {
      if (!notif) {
        notif = document.createElement('span');
        notif.className = 'tq-daily-notif';
        notif.setAttribute('aria-hidden', 'true');
        btn.appendChild(notif);
      }
    } else if (notif) {
      notif.remove();
    }
    if (!btn.dataset.tqDailyBound) {
      btn.dataset.tqDailyBound = '1';
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const res = claimDailyLogin();
        if (!res) return;
        tqToast(`Jour ${res.streak} · +${res.gained.toLocaleString('fr-FR')} pièces !`);
        global.MatefindrTitlesQuests.openQuests({ refresh: true });
      });
    }
  }

  function renderQuestsModal(body, stats) {
    refreshPending(stats);
    const td = getTitlesData();
    const claims = getQuestCoinClaims();
    const coins = getCoins();
    let html = `<div class="tq-quests-top">
      <div class="tq-quests-top-left">
        <div class="tq-coins tq-coins--quests" aria-label="Pièces"><span class="tq-coins-ico" aria-hidden="true">🪙</span><b>${coins.toLocaleString('fr-FR')}</b><span>pièces</span></div>
        <button type="button" class="tq-daily-btn" id="questsDailyBtn">Jour 1 = 50 pièces</button>
      </div>
      <button type="button" class="tq-spend-btn" data-open-titles>Dépenser · acheter des titres</button>
    </div>
    <div class="tq-scroll tq-quests-list">`;
    QUEST_TRACKS.forEach(track => {
      if (track.isRating) {
        const unlock = beautyUnlockProgress();
        const arrow = beautyArrow(stats);
        const soonMeta = unlock.unlocked ? nextBeautyTitleMeta(stats) : null;
        const lockedCls = unlock.unlocked ? '' : ' tq-mission--beauty-locked';
        html += `<article class="tq-mission tq-mission--hero tq-mission--rating${arrow.maxed && unlock.unlocked ? ' tq-mission--done' : ''}${lockedCls}">
          <div class="tq-mission-head">
            <span class="tq-mission-head-left">
              <span class="tq-mission-title">${esc(track.label)}</span>
              ${soonMeta ? `<span class="tq-lvl-badge">${esc(missionLevelLabel(soonMeta))}</span>` : ''}
            </span>
            ${arrow.maxed && unlock.unlocked ? '<span class="tq-done-lbl">5/5</span>' : ''}
          </div>
          <p class="tq-mission-desc">${!unlock.unlocked
            ? 'Personnalise ton profil dans l’éditeur pour activer cette quête.'
            : (arrow.locked
              ? `Encore ${RATING_MIN_VOTERS} votes pour activer la note.`
              : 'Ta note de profil — la barre atteint 100 % à 5/5.')}</p>
          <div class="tq-beauty-arrow" aria-label="${esc(arrow.locked ? 'Votants' : 'Note')}">
            <span class="tq-beauty-from">${esc(arrow.labelFrom)}</span>
            <span class="tq-beauty-chevron" aria-hidden="true">→</span>
            <span class="tq-beauty-to">${esc(arrow.labelTo)}</span>
            ${arrow.locked ? '<span class="tq-beauty-unit">votants</span>' : ''}
          </div>
          ${soonMeta && !arrow.locked ? `<div class="tq-beauty-next-title">Bientôt : <b>${esc(titleDisplay(soonMeta))}</b></div>` : ''}
          <div class="tq-bar tq-bar--lg" role="progressbar" aria-valuenow="${Math.round(arrow.pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${arrow.pct.toFixed(1)}%"></span></div>
          <div class="tq-mission-foot">
            <span class="tq-mission-count">${arrow.locked
              ? `${arrow.from} / ${arrow.to} votants`
              : `Note ${arrow.labelFrom} / 5`}</span>
            <button type="button" class="tq-beauty-titles-btn" data-toggle-beauty-titles ${unlock.unlocked ? '' : 'disabled'}>Titres par note</button>
          </div>
          ${renderBeautyTitlesPanel(stats, td)}
          ${!unlock.unlocked ? `<div class="tq-beauty-lock" role="status">
            <div class="tq-beauty-lock-msg">Passe <b>2 min</b> dans l’éditeur à modifier ton profil pour activer Esthétisme</div>
            <div class="tq-beauty-lock-bar" aria-hidden="true"><span style="width:${unlock.pct.toFixed(1)}%"></span></div>
            <div class="tq-beauty-lock-time">${formatUnlockClock(unlock.ms)} / 2:00</div>
          </div>` : ''}
        </article>`;
        return;
      }
      const m = nextMissionForTrack(track, stats);
      if (!m) return;
      const p = missionProgress(m, stats);
      const claimed = claims.includes(m.id);
      const ready = p.complete && !claimed;
      const coinReward = missionCoinRewardAmount(m);
      const pct = ready ? 100 : p.pct;
      const lvlLbl = missionLevelLabel(m);
      html += `<article class="tq-mission${ready ? ' tq-mission--ready' : ''}${track.eventNote ? ' tq-mission--event' : ''}" data-id="${esc(m.id)}">
        <div class="tq-mission-head">
          <span class="tq-mission-head-left">
            <span class="tq-mission-title">${esc(track.label)}</span>
            ${lvlLbl ? `<span class="tq-lvl-badge">${esc(lvlLbl)}</span>` : ''}
          </span>
          <span class="tq-mission-head-right">
            ${track.eventNote ? `<span class="tq-event-note">${esc(track.eventNote)}</span>` : ''}
            ${coinReward && !claimed ? `<span class="tq-coin-reward">+${coinReward} 🪙</span>` : ''}
          </span>
        </div>
        <div class="tq-bar tq-bar--lg" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="tq-mission-foot">
          <span class="tq-mission-count">${Math.floor(p.current)} / ${p.target}</span>
          ${ready
            ? `<button type="button" class="tq-collect" data-claim="${esc(m.id)}">Réclamer${coinReward ? ` · +${coinReward} 🪙` : ''}</button>`
            : ''}
        </div>
      </article>`;
    });
    html += '</div>';
    body.innerHTML = html;
    renderQuestsDailyBtn();
    body.querySelectorAll('[data-claim]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-claim');
        const res = claimQuestReward(id);
        if (!res) return;
        if (res.gained > 0) tqToast(`+${res.gained.toLocaleString('fr-FR')} pièces récupérées !`);
        else tqToast('Récompense réclamée');
        global.MatefindrTitlesQuests.openQuests({ refresh: true, stats });
      });
    });
    const toggleBtn = body.querySelector('[data-toggle-beauty-titles]');
    const panel = body.querySelector('#tqBeautyTitles');
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', () => {
        const open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        toggleBtn.textContent = open ? 'Masquer les titres' : 'Titres par note';
        toggleBtn.classList.toggle('is-open', open);
      });
    }
    body.querySelector('[data-open-titles]')?.addEventListener('click', () => {
      closeModal('quests');
      global.MatefindrTitlesQuests.openTitles({ stats });
    });
  }

  function renderShopTitleRow(meta, td) {
    const price = titleCoinPrice(meta);
    if (price == null) return '';
    const typo = titleTypoCss(meta);
    const canBuy = getCoins() >= price;
    return `<div class="tq-shop-row" data-id="${esc(meta.id)}" data-rarity="${meta.rarity || 1}" style="--title-color:${esc(td.color || '#C7A5FF')};${typo}">
      <span class="tq-lvl-badge">${esc(missionLevelLabel(meta) || '')}</span>
      <span class="tq-title-label">${esc(titleDisplay(meta))}</span>
      <button type="button" class="tq-buy-btn"${canBuy ? '' : ' disabled'} data-buy="${esc(meta.id)}" data-price="${price}">Acheter · ${price.toLocaleString('fr-FR')} 🪙</button>
    </div>`;
  }

  function renderTitlePickRow(meta, td, soonIds, opts) {
    opts = opts || {};
    const owned = td.collected.includes(meta.id);
    const soon = !owned && soonIds.has(meta.id);
    const pending = td.pending.includes(meta.id);
    const price = opts.shop ? titleCoinPrice(meta) : null;
    const lvl = missionLevelLabel(meta);
    // Niveau toujours visible (y compris titres possédés) — plus précis pour Esthétisme
    const lvlHtml = lvl ? `<span class="tq-lvl-badge">${esc(lvl)}</span>` : '';
    let status = '';
    if (!owned && price != null) status = `<span class="tq-price"><span class="tq-price-ico" aria-hidden="true">🪙</span>${price}</span>`;
    else if (!owned && pending) status = '<span class="tq-soon tq-soon--ready">Quête prête</span>';
    else if (!owned && soon) status = `<span class="tq-soon">Bientôt</span>`;
    const badge = `${lvlHtml}${status}`;
    const typo = titleTypoCss(meta);
    const cls = `tq-title-pick${owned ? ' owned' : ''}${soon ? ' soon' : ''}${opts.shop ? ' shop' : ''}${opts.beautyTop ? ' tq-title-pick--beauty-top' : ''}${opts.beautyChild ? ' tq-title-pick--beauty-child' : ''}${opts.expandable ? ' tq-title-pick--expandable' : ''}`;
    const canBuy = opts.shop && price != null && getCoins() >= price;
    const expand = opts.expandable
      ? `<span class="tq-beauty-drop" data-beauty-expand role="button" tabindex="0" aria-expanded="false" aria-label="Afficher les niveaux inférieurs" title="Niveaux inférieurs">▾</span>`
      : '';
    const pick = `<button type="button" class="${cls}" data-id="${esc(meta.id)}" data-rarity="${meta.rarity || 1}" data-price="${price || ''}" style="--title-color:${esc(td.color || '#C7A5FF')};${typo}" ${owned || canBuy ? '' : 'disabled'}>
        <span class="tq-title-glow" aria-hidden="true"></span>
        <span class="tq-title-aura" aria-hidden="true"></span>
        ${expand}
        <span class="tq-title-label">${esc(titleDisplay(meta))}</span>
        ${badge}
      </button>`;
    return pick;
  }

  function renderTitlesModal(body, stats) {
    refreshPending(stats);
    const td = getTitlesData();
    const coins = getCoins();
    const soonIds = computeSoonTitleIds(stats, td);
    const ratingIds = RATING_TITLES.map(r => r.id);
    // Esthétisme : du plus haut au plus bas
    const ownedBeauty = RATING_TITLES
      .filter(r => td.collected.includes(r.id))
      .map(r => getMission(r.id))
      .filter(Boolean)
      .sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    const ownedOther = MISSIONS
      .filter(m => td.collected.includes(m.id) && isKeepableTitleId(m.id) && !ratingIds.includes(m.id))
      .sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    const ownedCustom = Object.keys(td.custom || {})
      .filter(id => td.collected.includes(id))
      .map(id => resolveTitleMeta(id, td))
      .filter(Boolean)
      .sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    const titleColor = td.color || '#C7A5FF';
    let html = `<div class="tq-titles-toolbar">
      <div class="tq-coins" aria-label="Pièces"><span class="tq-coins-ico" aria-hidden="true">🪙</span><b>${coins.toLocaleString('fr-FR')}</b><span>pièces</span></div>
      <div class="tq-title-color-row">
        <span class="tq-title-color-lbl">Teinte</span>
        <button type="button" class="mf-color-swatch" id="tqTitleColorSw" aria-label="Teinte du titre" data-hex="${esc(titleColor)}" style="background:${esc(titleColor)}"></button>
      </div>
    </div><div class="tq-scroll tq-titles-list">`;
    if (ownedBeauty.length || ownedOther.length || ownedCustom.length) {
      html += '<div class="tq-section-label">Mes titres</div>';
      if (ownedBeauty.length) {
        const top = ownedBeauty[0];
        const lower = ownedBeauty.slice(1);
        html += `<div class="tq-beauty-owned">`;
        html += renderTitlePickRow(top, td, soonIds, { beautyTop: true, expandable: lower.length > 0 });
        if (lower.length) {
          html += `<div class="tq-beauty-owned-lower" id="tqBeautyOwnedLower" hidden>`;
          lower.forEach(m => { html += renderTitlePickRow(m, td, soonIds, { beautyChild: true }); });
          html += `</div>`;
        }
        html += `</div>`;
      }
      ownedOther.forEach(m => { html += renderTitlePickRow(getMission(m.id) || m, td, soonIds); });
      ownedCustom.forEach(m => { html += renderTitlePickRow(m, td, soonIds); });
    }
    html += `<div class="tq-section-label">Boutique</div>
      <p class="tq-titles-empty">L’achat de titres arrive bientôt — garde tes pièces 🪙</p>`;
    if (!ownedBeauty.length && !ownedOther.length) {
      html += '<p class="tq-titles-empty">Aucun titre pour l’instant — progresse en Esthétisme du profil pour en débloquer.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
    const colorSw = body.querySelector('#tqTitleColorSw');
    if (colorSw && global.DarkColorPicker) {
      global.DarkColorPicker.setSwatchBg(colorSw, titleColor);
      global.DarkColorPicker.bindSwatch(colorSw, () => getTitlesData().color || '#C7A5FF', hex => {
        saveTitlesData({ color: hex });
        body.querySelectorAll('.tq-title-pick').forEach(btn => btn.style.setProperty('--title-color', hex));
      });
    }
    const lowerBox = body.querySelector('#tqBeautyOwnedLower');
    const expandBtn = body.querySelector('[data-beauty-expand]');
    if (expandBtn && lowerBox) {
      const toggle = e => {
        e.preventDefault();
        e.stopPropagation();
        const open = lowerBox.hasAttribute('hidden');
        if (open) lowerBox.removeAttribute('hidden');
        else lowerBox.setAttribute('hidden', '');
        expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        expandBtn.classList.toggle('is-open', open);
        expandBtn.textContent = open ? '▴' : '▾';
        expandBtn.setAttribute('aria-label', open ? 'Masquer les niveaux inférieurs' : 'Afficher les niveaux inférieurs');
      };
      expandBtn.addEventListener('click', toggle);
      expandBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e);
      });
    }
    body.querySelectorAll('.tq-title-pick.owned').forEach(btn => {
      btn.addEventListener('click', e => {
        if (e.target.closest('[data-beauty-expand]')) return;
        saveTitlesData({ equipped: btn.getAttribute('data-id') });
        btn.closest('.tq-modal')?.querySelector('.tq-close')?.click();
      });
    });
  }

  function ensureModals() {
    if ($('questsBackdrop')) {
      const qp = $('questsPop');
      if (qp && !qp.classList.contains('tq-modal--quests')) qp.classList.add('tq-modal--quests');
      ensureQuestsHead();
      return;
    }
    document.body.insertAdjacentHTML('beforeend', `
<div class="conn-pop-backdrop tq-backdrop" id="questsBackdrop" hidden></div>
<div class="conn-pop tq-modal tq-modal--quests" id="questsPop" hidden role="dialog" aria-labelledby="questsTitle">
  <div class="conn-pick-head tq-quests-head">
    <h3 id="questsTitle">Quêtes</h3>
    <button type="button" class="cp-close tq-close" id="questsClose" aria-label="Fermer">✕</button>
  </div>
  <div class="tq-body" id="questsBody"></div>
</div>
<div class="conn-pop-backdrop tq-backdrop" id="titlesBackdrop" hidden></div>
<div class="conn-pop tq-modal" id="titlesPop" hidden role="dialog" aria-labelledby="titlesTitle">
  <div class="conn-pick-head"><h3 id="titlesTitle">Titres</h3><button type="button" class="cp-close tq-close" id="titlesClose" aria-label="Fermer">✕</button></div>
  <div class="tq-body" id="titlesBody"></div>
</div>`);
    ['quests', 'titles'].forEach(kind => {
      $(kind + 'Backdrop')?.addEventListener('click', () => closeModal(kind));
      $(kind + 'Close')?.addEventListener('click', () => closeModal(kind));
    });
  }

  function ensureQuestsHead() {
    const head = $('questsPop')?.querySelector('.conn-pick-head');
    if (!head) return;
    head.classList.add('tq-quests-head');
    // Ancien bouton quotidien dans le header → on le retire (il est à côté des pièces)
    const oldDaily = head.querySelector('#questsDailyBtn, .tq-daily-btn');
    if (oldDaily) oldDaily.remove();
  }

  function openModal(kind, renderFn, stats) {
    ensureModals();
    $(kind + 'Backdrop')?.removeAttribute('hidden');
    const pop = $(kind + 'Pop');
    if (pop) { pop.removeAttribute('hidden'); pop.dataset.open = 'true'; }
    const body = $(kind + 'Body');
    if (body && renderFn) renderFn(body, stats);
  }

  function closeModal(kind) {
    if (global.DarkColorPicker) global.DarkColorPicker.close();
    $(kind + 'Backdrop')?.setAttribute('hidden', '');
    const pop = $(kind + 'Pop');
    if (pop) { pop.setAttribute('hidden', ''); delete pop.dataset.open; }
  }

  function bindButtons(ids, handler) {
    (ids || []).forEach(id => {
      const el = $(id);
      if (!el || el.dataset.tqBound) return;
      el.dataset.tqBound = '1';
      el.addEventListener('click', handler);
    });
  }

  function init(opts) {
    opts = opts || {};
    ensureModals();
    bindButtons(opts.questButtons || ['navQuests', 'btnQuests'], async () => {
      const uid = (typeof opts.getUid === 'function' ? opts.getUid() : null) || null;
      const stats = await fetchStats({
        supa: global.__supa,
        uid: uid || undefined,
        ratingRec: opts.getRatingRec,
      });
      syncStatsLocal(stats);
      refreshPending(stats);
      openModal('quests', renderQuestsModal, stats);
    });
    bindButtons(opts.titleTriggers || [], () => {});
    document.addEventListener('click', e => {
      const t = e.target.closest('.card-title-slot--clickable, .card-profile-title--clickable, .ed-title-edit-btn');
      if (t) {
        e.preventDefault();
        openTitles({ getRatingRec: opts.getRatingRec, getUid: opts.getUid });
      }
    });
    const u = readSite().user || {};
    const prev = u.titlesData;
    const td = getTitlesData(u);
    const ownerGranted = isOwnerDiscordTag(u) && [OWNER_TITLE_ID, MATEFINDR_OWNER_TITLE_ID].some(id => !prev?.collected?.includes(id));
    const needDiscordien = !prev?.collected?.includes(DISCORDIEN_ID)
      || !prev?.equipped
      || prev?.equipped === BETA_TESTER_ID
      || ownerGranted
      || !prev?.collected?.includes(BETA_TESTER_ID);
    if (needDiscordien) {
      saveTitlesData({ collected: td.collected, equipped: td.equipped, pending: td.pending || [] });
    }
    (async () => {
      try {
        const uid = (typeof opts.getUid === 'function' ? opts.getUid() : null) || null;
        const stats = await fetchStats({
          supa: global.__supa,
          uid: uid || undefined,
          ratingRec: opts.getRatingRec,
        });
        syncStatsLocal(stats);
        refreshPending(stats);
      } catch (_) {}
    })();
  }

  async function openQuests(o) {
    o = o || {};
    const uid = (typeof o.getUid === 'function' ? o.getUid() : null) || global.__mfMyUid || null;
    const stats = o.stats || await fetchStats({
      supa: global.__supa,
      uid: uid || readSite().user?.uid,
      ratingRec: o.ratingRec || o.getRatingRec,
    });
    syncStatsLocal(stats);
    refreshPending(stats);
    openModal('quests', renderQuestsModal, stats);
  }

  async function openTitles(o) {
    o = o || {};
    const uid = (typeof o.getUid === 'function' ? o.getUid() : null) || global.__mfMyUid || null;
    const stats = o.stats || await fetchStats({
      supa: global.__supa,
      uid: uid || readSite().user?.uid,
      ratingRec: o.ratingRec || o.getRatingRec,
    });
    refreshPending(stats);
    openModal('titles', renderTitlesModal, stats);
  }

  function updateDiscordPreview(root) {
    const box = root || $('connDiscordPreview');
    if (!box) return;
    const st = readSite();
    const u = st.user || {};
    const actEl = global.document && global.document.getElementById('connDiscordActivity');
    const statEl = global.document && global.document.getElementById('connDiscordStatus');
    const p = {
      connections: {
        discord: {
          v: u.discordId,
          showActivity: actEl ? actEl.checked : true,
          showStatus: statEl ? statEl.checked : true,
          label: u.discordTag,
        },
      },
      discordLive: u.discordLive,
      discordTag: u.discordTag,
      tag: u.discordTag,
      avatarUrl: u.avatarUrl,
      discordAvatarUrl: u.discordAvatarUrl || u.avatarUrl,
      initial: (u.displayName || 'T').charAt(0),
    };
    box.innerHTML = discordFloorHtml(p, {
      fmtRelative: global.__mfFmtRelativeFr,
      esc,
    });
    bindDiscordActPopovers(box);
    tickDiscordActivityProgress(box);
  }

  global.MatefindrTitlesQuests = {
    QUEST_SVG,
    MISSIONS,
    DISCORDIEN_ID,
    grantDiscordienTitle,
    discordienLabel,
    getTitlesData,
    saveTitlesData,
    fetchStats,
    syncStatsLocal,
    bumpVotesGiven,
    processQuestCoinRewards,
    questCoinReward,
    applyQuestProgress,
    isBeautyQuestUnlocked,
    beautyUnlockProgress,
    listEligibleMissionIds,
    listClaimableQuestIds,
    refreshPending,
    collectMission,
    claimQuestReward,
    claimDailyLogin,
    evalDailyLogin,
    updateQuestButtonBadge,
    beautyArrow,
    cardTitleHtml,
    cardTitleSlotHtml,
    editorTitleSlotHtml,
    discordFloorHtml,
    discordCardHeadHtml,
    discordCardActivityHtml,
    discordPreviewHtml,
    updateDiscordPreview,
    bindDiscordActPopovers,
    tickDiscordActivityProgress,
    init,
    openQuests,
    openTitles,
    globalTitleStats,
    getMission,
    resolveTitleMeta,
    titleDisplay,
    isKeepableTitleId,
    RATING_TITLES,
  };
})(window);
