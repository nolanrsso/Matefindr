/* Modales compte partagées — lien perso + paramètres (index + éditeur) */
(function (global) {
  const STATE_KEY = 'matefindr_state';

  function $(id) { return document.getElementById(id); }

  const SLUG_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  function readSite() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) { return {}; }
  }

  function fmtSlugDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (_) { return ''; }
  }

  function slugCooldownInfo(changedAtIso) {
    if (!changedAtIso) return { locked: false, nextAt: null };
    const changedAt = new Date(changedAtIso).getTime();
    if (Number.isNaN(changedAt)) return { locked: false, nextAt: null };
    const nextAt = changedAt + SLUG_COOLDOWN_MS;
    return { locked: Date.now() < nextAt, nextAt: new Date(nextAt).toISOString() };
  }

  function reservedSlugs() {
    return global.__mfReservedSlugs || ['editor', 'index', 'settings', 'checkout', 'rules', 'admin', 'v2', 'assets', 'js', 'css', 'supabase', 'api', 'favicon'];
  }

  function showPop(popId, backdropId, beforeOpen) {
    if (typeof beforeOpen === 'function') beforeOpen();
    if (popId !== 'linkPop') hidePop('linkPop', 'linkBackdrop');
    if (popId !== 'settingsPop') hidePop('settingsPop', 'settingsBackdrop');
    const pop = $(popId);
    const back = backdropId ? $(backdropId) : null;
    if (back) { back.hidden = false; back.removeAttribute('hidden'); }
    if (pop) { pop.hidden = false; pop.removeAttribute('hidden'); }
  }

  function hidePop(popId, backdropId) {
    const pop = $(popId);
    const back = backdropId ? $(backdropId) : null;
    if (pop) { pop.hidden = true; pop.setAttribute('hidden', ''); }
    if (back) { back.hidden = true; back.setAttribute('hidden', ''); }
  }

  function closeSettingsPop() { hidePop('settingsPop', 'settingsBackdrop'); }

  function bindButtons(ids, handler) {
    (ids || []).forEach(function (id) {
      const btn = $(id);
      if (!btn) return;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        handler(e);
      });
    });
  }

  function initShareLink(opts) {
    opts = opts || {};
    const pop = $('linkPop');
    const back = $('linkBackdrop');
    const inp = $('linkSlug');
    const status = $('linkStatus');
    const share = $('linkShare');
    const copyBtn = $('linkCopy');
    const openBtn = $('linkOpen');
    const closeBtn = $('linkClose');
    const editSaveBtn = $('linkEditSave');
    const psetRow = $('linkPsetRow');
    const psetSlots = $('linkPsetSlots');
    if (!pop || !inp) return;

    const sanit = function (s) {
      let raw = String(s || '').trim();
      const fromUrl = raw.match(/matefindr\.com\/([a-z0-9_-]+)/i);
      if (fromUrl) raw = fromUrl[1];
      return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    };
    const isReserved = function (s) { return reservedSlugs().includes(String(s || '').toLowerCase()); };
    let fullHref = '';
    let slugChangedAt = '';
    let slugInputLocked = false;

    function currentSlug() {
      try { const st = readSite(); return (st.user && st.user.slug) || ''; } catch (_) { return ''; }
    }

    function currentSlugChangedAt() {
      if (slugChangedAt) return slugChangedAt;
      try { const st = readSite(); return (st.user && st.user.slugChangedAt) || ''; } catch (_) { return ''; }
    }

    async function loadSlugMeta() {
      slugChangedAt = currentSlugChangedAt();
      const getSupa = opts.getSupa || function () { return global.__supa || null; };
      const sb = getSupa();
      if (!sb) return;
      try {
        const sessionRes = await sb.auth.getSession();
        const session = sessionRes && sessionRes.data && sessionRes.data.session;
        if (!session) return;
        const rowRes = await sb.from('profiles').select('slug, data').eq('id', session.user.id).maybeSingle();
        const row = rowRes && rowRes.data;
        if (!row) return;
        if (row.slug) {
          try {
            const st = readSite();
            st.user = st.user || {};
            st.user.slug = row.slug;
            localStorage.setItem(STATE_KEY, JSON.stringify(st));
          } catch (_) {}
        }
        const d = row.data && typeof row.data === 'object' ? row.data : {};
        if (d.slugChangedAt) slugChangedAt = d.slugChangedAt;
        else if (row.slug) slugChangedAt = '';
      } catch (_) {}
    }

    function applySlugLockUi() {
      const cur = currentSlug();
      const row = $('linkInputRow');
      const cooldown = slugCooldownInfo(slugChangedAt);
      slugInputLocked = !!(cur && cooldown.locked);
      inp.readOnly = slugInputLocked;
      if (row) row.classList.toggle('is-locked', slugInputLocked);
      if (slugInputLocked && status) {
        status.className = 'link-status dim';
        status.textContent = 'Modification possible à partir du ' + fmtSlugDate(cooldown.nextAt) + ' (1 changement / 7 jours).';
      }
    }

    function showLink(slug) {
      fullHref = 'https://matefindr.com/' + slug;
      if (share) share.hidden = false;
      const lf = $('linkFull');
      if (lf) {
        lf.href = fullHref;
        lf.textContent = 'matefindr.com/' + slug;
        lf.hidden = false;
      }
      const lab = $('linkEditLabel');
      if (lab) lab.textContent = 'Modifier l’adresse';
    }

    function linkStatusForSlug(slug) {
      if (slug.length < 2) return { ok: true, text: '' };
      if (isReserved(slug)) return { ok: false, text: '« ' + slug + ' » est déjà pris, essaie autre chose.' };
      return { ok: true, text: '' };
    }

    function refreshDirty() {
      if (!editSaveBtn) return;
      const slug = sanit(inp.value);
      const st = linkStatusForSlug(slug);
      if (!st.ok) {
        if (status) { status.className = 'link-status err'; status.textContent = st.text; }
        editSaveBtn.disabled = true;
        return;
      }
      const prev = currentSlug();
      const dirty = slug !== prev;
      if (slugInputLocked) {
        editSaveBtn.textContent = 'Enregistrer';
        editSaveBtn.disabled = true;
        return;
      }
      if (prev && dirty) {
        const cooldown = slugCooldownInfo(slugChangedAt);
        if (cooldown.locked) {
          if (status) {
            status.className = 'link-status err';
            status.textContent = 'Tu pourras changer ton lien le ' + fmtSlugDate(cooldown.nextAt) + '.';
          }
          editSaveBtn.disabled = true;
          return;
        }
      }
      if (!prev) editSaveBtn.textContent = dirty ? 'Créer mon lien' : 'Créer mon lien';
      else editSaveBtn.textContent = dirty ? 'Enregistrer' : 'Enregistrer';
      editSaveBtn.disabled = !dirty || slug.length < 2;
      if (status && status.className.indexOf('err') === -1 && !slugInputLocked) {
        status.textContent = '';
        status.className = 'link-status';
      }
    }

    function renderLinkPresets() {
      if (!psetRow || !psetSlots || typeof opts.renderLinkPresets !== 'function') {
        if (psetRow) psetRow.hidden = true;
        return;
      }
      opts.renderLinkPresets(psetRow, psetSlots);
    }

    function openPop() {
      const cur = currentSlug();
      // Ne préremplit PAS avec le pseudo Discord / displayName : uniquement le slug déjà choisi.
      inp.value = cur || '';
      inp.readOnly = false;
      slugInputLocked = false;
      $('linkInputRow')?.classList.remove('is-locked');
      if (status) { status.textContent = ''; status.className = 'link-status'; }
      const lab = $('linkEditLabel');
      if (lab) lab.textContent = cur ? 'Modifier l’adresse' : 'Adresse personnalisée';
      if (cur) showLink(cur);
      else {
        if (share) share.hidden = true;
        if (lab) lab.textContent = 'Choisis ton adresse';
      }
      renderLinkPresets();
      refreshDirty();
      showPop('linkPop', 'linkBackdrop', opts.beforeOpen);
      loadSlugMeta().then(function () {
        const latest = currentSlug();
        if (latest && inp.value !== latest && !inp.value) inp.value = latest;
        if (latest) showLink(latest);
        applySlugLockUi();
        refreshDirty();
      });
      setTimeout(function () { if (!inp.readOnly && !cur) inp.focus(); }, 60);
    }

    function closePop() { hidePop('linkPop', 'linkBackdrop'); }

    bindButtons(opts.buttons || ['btnShareLink', 'navShareLink'], openPop);
    back && back.addEventListener('click', closePop);
    closeBtn && closeBtn.addEventListener('click', closePop);
    inp.addEventListener('input', function () {
      const v = sanit(inp.value);
      if (v !== inp.value) inp.value = v;
      refreshDirty();
    });
    copyBtn && copyBtn.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(fullHref);
        if (opts.toast) opts.toast('Lien copié 📋');
      } catch (_) { if (opts.toast) opts.toast('Copie impossible'); }
    });
    openBtn && openBtn.addEventListener('click', function () {
      if (fullHref) global.open(fullHref, '_blank', 'noopener');
    });
    editSaveBtn && editSaveBtn.addEventListener('click', async function () {
      const slug = sanit(inp.value);
      const prev = currentSlug();
      if (slug.length < 2) {
        if (status) { status.className = 'link-status err'; status.textContent = '2 caractères minimum.'; }
        return;
      }
      if (isReserved(slug)) {
        if (status) { status.className = 'link-status err'; status.textContent = '« ' + slug + ' » est déjà pris, essaie autre chose.'; }
        return;
      }
      if (slugInputLocked || (prev && slug !== prev && slugCooldownInfo(slugChangedAt).locked)) {
        const cooldown = slugCooldownInfo(slugChangedAt);
        if (status) {
          status.className = 'link-status err';
          status.textContent = 'Tu pourras changer ton lien le ' + fmtSlugDate(cooldown.nextAt) + '.';
        }
        return;
      }
      if (!prev) {
        const ok = global.confirm(
          'Une fois ton lien enregistré, tu ne pourras le modifier qu\'une fois tous les 7 jours.\n\nContinuer avec matefindr.com/' + slug + ' ?'
        );
        if (!ok) return;
      } else if (slug !== prev) {
        const ok = global.confirm(
          'Tu ne pourras plus changer ton lien avant 7 jours.\n\nPasser de matefindr.com/' + prev + ' à matefindr.com/' + slug + ' ?'
        );
        if (!ok) return;
      }
      const getSupa = opts.getSupa || function () { return global.__supa || null; };
      const sb = getSupa();
      if (!sb) {
        if (status) { status.className = 'link-status err'; status.textContent = 'Connexion requise.'; }
        return;
      }
      editSaveBtn.disabled = true;
      if (status) { status.className = 'link-status dim'; status.textContent = 'Vérification…'; }
      try {
        const sessionRes = await sb.auth.getSession();
        const session = sessionRes && sessionRes.data && sessionRes.data.session;
        if (!session) {
          if (status) { status.className = 'link-status err'; status.textContent = 'Reconnecte-toi pour créer ton lien.'; }
          editSaveBtn.disabled = false;
          return;
        }
        const takenRes = await sb.from('profiles').select('id').eq('slug', slug).neq('id', session.user.id).limit(1);
        const taken = takenRes && takenRes.data;
        if (taken && taken.length) {
          if (status) { status.className = 'link-status err'; status.textContent = '« ' + slug + ' » est déjà pris, essaie autre chose.'; }
          editSaveBtn.disabled = false;
          return;
        }
        const nowIso = new Date().toISOString();
        let dataPatch = {};
        try {
          const rowRes = await sb.from('profiles').select('data').eq('id', session.user.id).maybeSingle();
          const row = rowRes && rowRes.data;
          dataPatch = Object.assign({}, (row && row.data && typeof row.data === 'object') ? row.data : {}, { slugChangedAt: nowIso });
        } catch (_) {
          dataPatch = { slugChangedAt: nowIso };
        }
        const upd = await sb.from('profiles').update({ slug: slug, data: dataPatch }).eq('id', session.user.id);
        if (upd.error) {
          const err = upd.error;
          const m = ((err.message || '') + ' ' + (err.details || '') + ' ' + (err.hint || '')).toLowerCase();
          let msg = 'Échec, réessaie.';
          if (/duplicate|unique/.test(m)) msg = '« ' + slug + ' » est déjà pris, essaie autre chose.';
          else if (/slug|column|schema cache|does not exist/.test(m)) msg = 'Lien pas encore activé côté serveur (SQL à lancer).';
          else if (err.message) msg = err.message.slice(0, 90);
          if (status) { status.className = 'link-status err'; status.textContent = msg; }
          editSaveBtn.disabled = false;
          return;
        }
        slugChangedAt = nowIso;
        try {
          const st = readSite();
          st.user = st.user || {};
          st.user.slug = slug;
          st.user.slugChangedAt = nowIso;
          localStorage.setItem(STATE_KEY, JSON.stringify(st));
        } catch (_) {}
        if (typeof opts.onSlugSaved === 'function') opts.onSlugSaved(slug, nowIso);
        showLink(slug);
        applySlugLockUi();
        refreshDirty();
        if (status) {
          status.className = 'link-status ok';
          status.textContent = prev ? '✅ Lien mis à jour, prochain changement dans 7 jours.' : '✅ Ton lien est prêt ! Prochain changement possible dans 7 jours.';
        }
      } catch (e) {
        if (status) {
          status.className = 'link-status err';
          status.textContent = 'Erreur : ' + ((e && e.message) ? e.message.slice(0, 80) : 'réessaie.');
        }
        editSaveBtn.disabled = false;
      }
    });

    global.__mfOpenShareLink = openPop;
  }

  function initSettings(opts) {
    opts = opts || {};
    const body = $('settingsBody');
    if (!body) return;

    function openPop() {
      if (typeof opts.render === 'function') opts.render(body);
      showPop('settingsPop', 'settingsBackdrop', opts.beforeOpen);
    }

    bindButtons(opts.buttons || ['btnSettings', 'navSettings'], openPop);
    $('settingsClose') && $('settingsClose').addEventListener('click', closeSettingsPop);
    $('settingsBackdrop') && $('settingsBackdrop').addEventListener('click', closeSettingsPop);
    global.__mfOpenSettings = openPop;
  }

  global.MFAccountModals = {
    showPop: showPop,
    hidePop: hidePop,
    closeSettingsPop: closeSettingsPop,
    initShareLink: initShareLink,
    initSettings: initSettings,
    readSite: readSite
  };
})(window);
