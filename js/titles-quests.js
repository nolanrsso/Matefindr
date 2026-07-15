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
    { id: 'rt_beauty', min: 4.7, max: 4.8, label: 'pure beauty', rarity: 12 },
    { id: 'rt_perfection', min: 4.8, max: 4.9, label: 'Perfection', rarity: 13 },
    { id: 'rt_1010', min: 4.9, max: 5.01, label: '10/10', rarity: 14 },
  ];

  const STAT_MISSIONS = [
    {
      id: 'views', group: 'profil', label: 'Vues de profil', stat: 'views',
      titles: ['Premier Regard', 'Vitrine Émergente', 'Spotlight Discret', 'Radar Social', 'Pôle d\'Attention', 'Constellation Vue', 'Horizon Matefindr', 'Phare Nocturne', 'Éclipse de Vues', 'Légende du Feed', 'Mythique du Scroll', 'Oracle des Vues', 'Monument Visible'],
    },
    {
      id: 'matches', group: 'profil', label: 'Matchs', stat: 'matches',
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
  ];

  const VOTES_UNLOCK = {
    id: 'votes_received', group: 'profil', label: 'Votes reçus sur ton profil', stat: 'votesReceived', threshold: 10,
    title: 'Voix du Public', rarity: 2,
  };

  function $(id) { return document.getElementById(id); }
  function readSite() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) { return {}; } }
  function writeSite(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {} }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  function defaultTitlesData() {
    return { collected: [], pending: [], equipped: null, color: '#C7A5FF' };
  }

  function getTitlesData(user) {
    const u = user || readSite().user || {};
    const td = u.titlesData && typeof u.titlesData === 'object' ? u.titlesData : defaultTitlesData();
    if (!Array.isArray(td.collected)) td.collected = [];
    if (!Array.isArray(td.pending)) td.pending = [];
    return td;
  }

  function saveTitlesData(patch) {
    const s = readSite();
    s.user = s.user || {};
    s.user.titlesData = Object.assign(defaultTitlesData(), getTitlesData(s.user), patch || {});
    writeSite(s);
    if (typeof global.__matefindrSave === 'function') global.__matefindrSave();
    if (typeof global.__scheduleCloudSync === 'function') global.__scheduleCloudSync();
    if (typeof global.__matefindrRefreshCard === 'function') global.__matefindrRefreshCard();
  }

  function missionId(statId, threshold) { return `${statId}_${threshold}`; }

  function buildMissionCatalog() {
    const list = [];
    list.push({
      id: VOTES_UNLOCK.id,
      group: VOTES_UNLOCK.group,
      label: VOTES_UNLOCK.label,
      stat: VOTES_UNLOCK.stat,
      threshold: VOTES_UNLOCK.threshold,
      title: VOTES_UNLOCK.title,
      rarity: VOTES_UNLOCK.rarity,
      desc: 'Reçois 10 votes sur ton profil pour débloquer les titres de note.',
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
        title: r.label,
        rarity: r.rarity,
        noTranslate: true,
        desc: `Note moyenne entre ${r.min} et ${r.max} (min. 10 votants).`,
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

  async function fetchStats(opts) {
    opts = opts || {};
    const s = readSite();
    const u = s.user || {};
    const views = typeof opts.views === 'number' ? opts.views : (u.profileViews || s.profile?.views || 0);
    let matches = 0, likesGiven = 0, votesGiven = 0, votesReceived = 0, newChats = 0;
    const sb = opts.supa || global.__supa;
    const uid = opts.uid || u.uid;
    if (sb && uid) {
      try {
        const [{ count: mC }, { count: lC }, { count: vC }, { count: vrC }, { count: cC }] = await Promise.all([
          sb.from('matches').select('*', { count: 'exact', head: true }).or(`user_a.eq.${uid},user_b.eq.${uid}`),
          sb.from('likes').select('*', { count: 'exact', head: true }).eq('liker_id', uid),
          sb.from('profile_reactions').select('*', { count: 'exact', head: true }).eq('reactor_id', uid),
          sb.from('profile_reactions').select('*', { count: 'exact', head: true }).eq('profile_id', uid),
          sb.from('matches').select('*', { count: 'exact', head: true }).or(`user_a.eq.${uid},user_b.eq.${uid}`),
        ]);
        matches = mC || 0;
        likesGiven = lC || 0;
        votesGiven = vC || 0;
        votesReceived = vrC || 0;
        newChats = cC || matches;
      } catch (_) {}
    }
    const ratingRec = opts.ratingRec || null;
    const rating = avgRating(ratingRec);
    const ratingVotes = ratingRec?.ratings?.length || 0;
    return { views, matches, likesGiven, votesGiven, votesReceived, newChats, rating, ratingVotes };
  }

  function syncStatsLocal(stats) {
    const s = readSite();
    s.user = s.user || {};
    s.user.questStats = stats;
    writeSite(s);
    return stats;
  }

  function missionProgress(m, stats) {
    if (m.id === VOTES_UNLOCK.id || m.stat === 'votesReceived') {
      const cur = stats.votesReceived || 0;
      const tgt = m.threshold || 10;
      return { current: cur, target: tgt, pct: Math.min(100, tgt ? (cur / tgt) * 100 : 0), complete: cur >= tgt, locked: false };
    }
    if (m.stat === 'rating') {
      if ((stats.ratingVotes || 0) < 10) return { current: stats.ratingVotes || 0, target: 10, pct: Math.min(100, ((stats.ratingVotes || 0) / 10) * 100), locked: true };
      const ok = stats.rating >= (m.ratingMin || 0) && stats.rating < (m.ratingMax || 99);
      return { current: stats.rating, target: m.ratingMax, pct: ok ? 100 : Math.min(99, (stats.rating / 5) * 100), locked: false, complete: ok };
    }
    const cur = stats[m.stat] || 0;
    const tgt = m.threshold || 0;
    return { current: cur, target: tgt, pct: Math.min(100, tgt ? (cur / tgt) * 100 : 0), complete: cur >= tgt, locked: false };
  }

  function computeEligible(stats) {
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

    const ratingIds = RATING_TITLES.map(r => r.id);
    if ((stats.ratingVotes || 0) >= 10) {
      RATING_TITLES.forEach(r => {
        if (stats.rating >= r.min && stats.rating < r.max) eligible.push(r.id);
      });
    }

    const uniq = [...new Set(eligible)];
    const td = getTitlesData();
    const kept = td.collected.filter(id => !ratingIds.includes(id) || uniq.includes(id));
    let equipped = td.equipped;
    if (equipped && ratingIds.includes(equipped) && !uniq.includes(equipped)) equipped = kept[0] || null;
    if (kept.length !== td.collected.length || equipped !== td.equipped) {
      saveTitlesData({ collected: kept, equipped });
    }
    return uniq;
  }

  function refreshPending(stats) {
    const td = getTitlesData();
    const eligible = computeEligible(stats);
    const pending = eligible.filter(id => !td.collected.includes(id));
    if (pending.length !== td.pending.length || pending.some((x, i) => x !== td.pending[i])) {
      saveTitlesData({ pending });
    }
    return pending;
  }

  function collectMission(id) {
    const td = getTitlesData();
    if (!td.pending.includes(id)) return false;
    td.collected.push(id);
    td.pending = td.pending.filter(x => x !== id);
    if (!td.equipped) td.equipped = id;
    saveTitlesData({ collected: td.collected, pending: td.pending, equipped: td.equipped });
    bumpGlobalStat(id);
    return true;
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

  function equippedTitleMeta(td) {
    if (!td?.equipped) return null;
    return getMission(td.equipped) || null;
  }

  function cardTitleHtml(p, escFn) {
    const escH = escFn || esc;
    const td = p.titlesData || (p.isMe ? getTitlesData(p) : null);
    const meta = equippedTitleMeta(td);
    if (!meta) return '';
    const color = td.color || '#C7A5FF';
    const rarity = meta.rarity || 3;
    const cls = p.isMe ? 'card-profile-title card-profile-title--clickable' : 'card-profile-title';
    return `<button type="button" class="${cls}" data-rarity="${rarity}" style="--title-color:${escH(color)}" title="${escH(meta.title)}"${p.isMe ? '' : ' tabindex="-1"'}>
      <span class="card-profile-title-aura" aria-hidden="true"></span>
      <span class="card-profile-title-text">${escH(meta.title)}</span>
    </button>`;
  }

  function discordTagLabel(p) {
    const MC = global.MatefindrConnections;
    if (!MC || !p.connections || !MC.connIsSet(p.connections, 'discord')) return '';
    const e = MC.connGet(p.connections, 'discord');
    const tag = (e?.label || p.tag || '').replace(/^@+/, '');
    return tag ? (tag.startsWith('.') ? tag : '.' + tag) : '';
  }

  function discordActivityLine(act) {
    if (!act) return '';
    const t = act.details || act.state || act.name || '';
    return t;
  }

  function discordFloorHtml(p, helpers) {
    helpers = helpers || {};
    const escH = helpers.esc || esc;
    const MC = global.MatefindrConnections;
    if (!MC || !p.connections || !MC.connIsSet(p.connections, 'discord')) return '';
    const e = MC.connGet(p.connections, 'discord');
    if (!e) return '';
    const showActivity = e.showActivity !== false;
    const showStatus = e.showStatus !== false;
    if (!showActivity && !showStatus) return '';

    const live = p.discordLive;
    const online = live?.status && !['offline', 'invisible'].includes(live.status);
    const act = online && showActivity ? live?.activities?.[0] : null;
    const tag = discordTagLabel(p);
    const avi = p.avatarUrl || '';
    const aviInner = avi
      ? `<img src="${escH(avi)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">`
      : `<span>${escH((p.initial || '?').charAt(0))}</span>`;

    let sub = '';
    if (online && act) sub = discordActivityLine(act);
    else if (online && showStatus) sub = 'En ligne';
    else if (showStatus) {
      const at = live?.lastOnlineAt || live?.updatedAt || p.lastSeenAt;
      sub = at ? `last seen ${helpers.fmtRelative ? helpers.fmtRelative(at) : ''}` : 'Hors ligne';
    }

    const dotCls = online ? 'online' : 'offline';

    return `<div class="discord-floor" aria-label="Discord">
      <div class="discord-floor-avi">
        <div class="discord-floor-avi-inner">${aviInner}</div>
        <span class="discord-floor-dot ${dotCls}" aria-hidden="true"></span>
      </div>
      <div class="discord-floor-meta">
        <b class="discord-floor-name">${escH(tag || '@' + (p.tag || 'user'))}</b>
        ${sub ? `<span class="discord-floor-sub">${escH(sub)}</span>` : ''}
      </div>
    </div>`;
  }

  function discordPreviewHtml(user, helpers) {
    helpers = helpers || {};
    const escH = helpers.esc || esc;
    const u = user || readSite().user || {};
    const live = u.discordLive;
    const online = live?.status && !['offline', 'invisible'].includes(live.status);
    const act = online ? live?.activities?.[0] : null;
    const tag = (u.discordTag || 'discord').replace(/^@+/, '');
    const avi = u.avatarUrl || '';
    const sub = online && act ? discordActivityLine(act) : (online ? 'En ligne' : (live?.lastOnlineAt ? `last seen ${helpers.fmtRelative ? helpers.fmtRelative(live.lastOnlineAt) : ''}` : 'Hors ligne'));
    return `<div class="discord-floor discord-floor--preview">
      <div class="discord-floor-avi">
        <div class="discord-floor-avi-inner">${avi ? `<img src="${escH(avi)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block">` : '<span>?</span>'}</div>
        <span class="discord-floor-dot ${online ? 'online' : 'offline'}"></span>
      </div>
      <div class="discord-floor-meta">
        <b class="discord-floor-name">.${escH(tag.replace(/^\.+/, ''))}</b>
        <span class="discord-floor-sub">${escH(sub)}</span>
      </div>
    </div>`;
  }

  function missionsForDisplay(stats) {
    const ids = new Set(MISSIONS.map(m => m.id));
    STAT_MISSIONS.forEach(sm => {
      const cur = stats[sm.stat] || 0;
      let th = 2500;
      while (th <= Math.max(cur, 2500) + 500) {
        ids.add(missionId(sm.id, th));
        th += 500;
      }
    });
    return [...ids].map(getMission).filter(Boolean);
  }

  function renderQuestsModal(body, stats) {
    refreshPending(stats);
    const td = getTitlesData();
    const groups = [
      { id: 'profil', label: 'Profil' },
      { id: 'interaction', label: 'Interaction' },
    ];
    let html = '<div class="tq-scroll">';
    groups.forEach(g => {
      html += `<h3 class="tq-group-title">${esc(g.label)}</h3>`;
      missionsForDisplay(stats).filter(m => m.group === g.id).forEach(m => {
        const p = missionProgress(m, stats);
        const done = td.collected.includes(m.id);
        const ready = td.pending.includes(m.id);
        html += `<div class="tq-mission${done ? ' tq-mission--done' : ''}${ready ? ' tq-mission--ready' : ''}" data-id="${esc(m.id)}">
          <div class="tq-mission-head">
            <span class="tq-mission-title">${esc(m.title)}</span>
            <span class="tq-mission-rarity" data-r="${m.rarity || 1}">★${m.rarity || 1}</span>
          </div>
          <p class="tq-mission-desc">${esc(m.desc || m.label)}</p>
          <div class="tq-bar"><span style="width:${p.pct.toFixed(1)}%"></span></div>
          <div class="tq-mission-foot">
            <span>${m.stat === 'rating' ? (p.locked ? `${Math.floor(p.current)}/10 votants` : p.current.toFixed(1) + '/5') : `${Math.floor(p.current)} / ${p.target}`}</span>
            ${ready ? `<button type="button" class="tq-collect" data-collect="${esc(m.id)}">Récolter</button>` : (done ? '<span class="tq-done-lbl">Obtenu</span>' : '')}
          </div>
        </div>`;
      });
    });
    html += '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-collect]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (collectMission(btn.getAttribute('data-collect'))) {
          global.MatefindrTitlesQuests.openQuests({ refresh: true });
        }
      });
    });
  }

  function renderTitlesModal(body, stats) {
    const td = getTitlesData();
    const eligible = computeEligible(stats);
    const byRarity = MISSIONS.slice().sort((a, b) => (b.rarity || 0) - (a.rarity || 0));
    let html = `<div class="tq-titles-toolbar">
      <label>Couleur du titre
        <input type="color" id="tqTitleColor" value="${esc(td.color || '#C7A5FF')}">
      </label>
    </div><div class="tq-scroll tq-titles-list">`;
    byRarity.forEach(m => {
      const meta = getMission(m.id) || m;
      const owned = td.collected.includes(m.id);
      const soon = !owned && eligible.includes(m.id);
      const locked = !owned && !soon;
      html += `<button type="button" class="tq-title-pick${owned ? ' owned' : ''}${soon ? ' soon' : ''}${locked ? ' locked' : ''}" data-id="${esc(meta.id)}" data-rarity="${meta.rarity || 1}" ${owned ? '' : 'disabled'}>
        <span class="tq-title-aura"></span>
        <span class="tq-title-label">${esc(meta.title)}</span>
        ${soon ? '<span class="tq-soon">Bientôt</span>' : ''}
      </button>`;
    });
    html += '</div>';
    body.innerHTML = html;
    body.querySelector('#tqTitleColor')?.addEventListener('input', e => {
      saveTitlesData({ color: e.target.value });
      if (td.equipped) renderTitlesModal(body, stats);
    });
    body.querySelectorAll('.tq-title-pick.owned').forEach(btn => {
      btn.addEventListener('click', () => {
        saveTitlesData({ equipped: btn.getAttribute('data-id') });
        btn.closest('.tq-modal')?.querySelector('.tq-close')?.click();
      });
      btn.addEventListener('mouseenter', () => {
        const st = globalTitleStats(btn.getAttribute('data-id'));
        btn.title = `${st.count} joueurs · ${st.pct}%`;
      });
    });
  }

  function ensureModals() {
    if ($('questsBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend', `
<div class="conn-pop-backdrop tq-backdrop" id="questsBackdrop" hidden></div>
<div class="conn-pop tq-modal" id="questsPop" hidden role="dialog" aria-labelledby="questsTitle">
  <div class="conn-pick-head"><h3 id="questsTitle">Quêtes</h3><button type="button" class="cp-close tq-close" id="questsClose" aria-label="Fermer">✕</button></div>
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

  function openModal(kind, renderFn, stats) {
    ensureModals();
    $(kind + 'Backdrop')?.removeAttribute('hidden');
    const pop = $(kind + 'Pop');
    if (pop) { pop.removeAttribute('hidden'); pop.dataset.open = 'true'; }
    const body = $(kind + 'Body');
    if (body && renderFn) renderFn(body, stats);
  }

  function closeModal(kind) {
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
      const stats = await fetchStats({ supa: global.__supa, uid: readSite().user?.uid, ratingRec: opts.getRatingRec?.() });
      syncStatsLocal(stats);
      openModal('quests', renderQuestsModal, stats);
    });
    bindButtons(opts.titleTriggers || [], () => {});
    document.addEventListener('click', e => {
      const t = e.target.closest('.card-profile-title--clickable');
      if (t) {
        e.preventDefault();
        openTitles();
      }
    });
  }

  async function openQuests(o) {
    o = o || {};
    const stats = o.stats || await fetchStats({ supa: global.__supa, uid: readSite().user?.uid, ratingRec: o.ratingRec });
    syncStatsLocal(stats);
    openModal('quests', renderQuestsModal, stats);
  }

  async function openTitles(o) {
    o = o || {};
    const stats = o.stats || await fetchStats({ supa: global.__supa, uid: readSite().user?.uid, ratingRec: o.ratingRec });
    openModal('titles', renderTitlesModal, stats);
  }

  function updateDiscordPreview(root) {
    const box = root || $('connDiscordPreview');
    if (!box) return;
    box.innerHTML = discordPreviewHtml(readSite().user, {
      fmtRelative: global.__mfFmtRelativeFr,
      esc,
    });
  }

  global.MatefindrTitlesQuests = {
    QUEST_SVG,
    MISSIONS,
    getTitlesData,
    saveTitlesData,
    fetchStats,
    syncStatsLocal,
    refreshPending,
    collectMission,
    cardTitleHtml,
    discordFloorHtml,
    discordPreviewHtml,
    updateDiscordPreview,
    init,
    openQuests,
    openTitles,
    globalTitleStats,
  };
})(window);
