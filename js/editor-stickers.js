/* Éditeur — stickers (GIFs + photos) : menu contextuel, sélection zone, presse-papiers */
(function (global) {
  'use strict';

  const W_MIN = 12;
  const W_MAX = 98;
  const W_DEFAULT = 48;

  let api = null;
  let clip = null;
  let selected = new Set();
  let marquee = null;
  let ctxEl = null;
  let activeTransform = null;

  function $(id) { return document.getElementById(id); }

  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function layerEl() { return $('photoLayer') || $('stickerLayer'); }

  function pxOffsetPct(pxX, pxY) {
    const lr = layerEl()?.getBoundingClientRect();
    if (!lr) return { dx: 1.5, dy: 1.5 };
    return { dx: (pxX / lr.width) * 100, dy: (pxY / lr.height) * 100 };
  }

  function normalizeItem(item) {
    if (!item) return item;
    if (typeof item.x !== 'number') item.x = 50;
    if (typeof item.y !== 'number') item.y = 50;
    if (typeof item.w !== 'number') item.w = W_DEFAULT;
    if (typeof item.rot !== 'number') item.rot = 0;
    if (typeof item.scaleX !== 'number' || !isFinite(item.scaleX)) item.scaleX = 1;
    if (typeof item.scaleY !== 'number' || !isFinite(item.scaleY)) item.scaleY = 1;
    return item;
  }

  function defaultSpawnPos() {
    const card = $('card');
    const layer = layerEl();
    if (!card || !layer) return { x: 105, y: 50, w: W_DEFAULT };
    const cr = card.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    const spawnScreenX = cr.right + cr.width * 0.12;
    const x = ((spawnScreenX - lr.left) / Math.max(1, lr.width)) * 100;
    return { x: Math.round(clampN(x, 0, 130) * 10) / 10, y: 50, w: W_DEFAULT };
  }

  function getKind(el) {
    return el && el.dataset.stickerKind === 'photo' ? 'photo' : 'gif';
  }

  function getArray(kind) {
    return kind === 'photo' ? api.S.photos : api.S.gifs;
  }

  function getIndex(el) {
    return parseInt(el.dataset.stickerIdx, 10);
  }

  function getItem(el) {
    const kind = getKind(el);
    const arr = getArray(kind);
    const idx = getIndex(el);
    return arr[idx] || null;
  }

  function clampW(w) {
    return api.clamp(w, W_MIN, W_MAX);
  }

  function applyImgStyles(img, item) {
    item = normalizeItem(item);
    img.style.objectFit = 'cover';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    const sx = item.scaleX || 1;
    const sy = item.scaleY || 1;
    if (item.posX != null && item.posY != null) {
      img.style.objectPosition = item.posX + '% ' + item.posY + '%';
      img.style.transformOrigin = item.posX + '% ' + item.posY + '%';
      const sc = item.scale || 1;
      img.style.transform = 'scale(' + (sc * sx) + ', ' + (sc * sy) + ')';
    } else {
      img.style.objectPosition = '50% 50%';
      img.style.transformOrigin = '50% 50%';
      img.style.transform = sx === 1 && sy === 1 ? '' : 'scale(' + sx + ', ' + sy + ')';
    }
  }

  function deselectAll() {
    exitTransformMode();
    selected.forEach(el => el.classList.remove('selected'));
    selected.clear();
  }

  function selectEl(el, additive) {
    if (!el) return;
    if (!additive) deselectAll();
    if (!el.classList.contains('selected')) {
      el.classList.add('selected');
      selected.add(el);
    }
  }

  function selectedItems() {
    const out = [];
    selected.forEach(el => {
      const item = getItem(el);
      if (item) out.push({ el, item, kind: getKind(el), idx: getIndex(el) });
    });
    return out;
  }

  function primaryTarget() {
    const list = selectedItems();
    if (list.length) return list[list.length - 1];
    return null;
  }

  function moveLayer(kind, idx, action) {
    const arr = getArray(kind);
    if (idx < 0 || idx >= arr.length) return;
    const item = arr[idx];
    arr.splice(idx, 1);
    if (action === 'front') arr.push(item);
    else if (action === 'back') arr.unshift(item);
    else if (action === 'forward') arr.splice(Math.min(idx + 1, arr.length), 0, item);
    else if (action === 'backward') arr.splice(Math.max(idx - 1, 0), 0, item);
    if (kind === 'photo') api.renderPhotos();
    else api.renderGifs();
    api.persist();
  }

  function resetItem(item) {
    item.rot = 0;
    delete item.posX;
    delete item.posY;
    delete item.scale;
    item.scaleX = 1;
    item.scaleY = 1;
  }

  function copySelection() {
    const t = primaryTarget();
    if (!t) return;
    clip = {
      kind: t.kind,
      data: JSON.parse(JSON.stringify(t.item)),
    };
    delete clip.data.posByMode;
    api.toast('Copié');
  }

  function pushToFront(arr, item) {
    const i = arr.indexOf(item);
    if (i >= 0) { arr.splice(i, 1); arr.push(item); }
  }

  function pasteExternalImage(file) {
    const isBoost = !document.body.classList.contains('not-boost');
    if (!isBoost) { api.openBoostGate(null, true); return; }
    if (!api.addPhotoFile) return;
    api.addPhotoFile(file);
  }

  function pasteClip() {
    if (!clip || !clip.data) { api.toast('Rien à coller'); return; }
    const isBoost = !document.body.classList.contains('not-boost');
    if (clip.kind === 'photo' && !isBoost) { api.openBoostGate(null, true); return; }
    const arr = getArray(clip.kind);
    const max = clip.kind === 'photo' ? api.PHOTO_MAX : api.GIF_MAX;
    if (arr.length >= max) { api.toast('Limite atteinte'); return; }
    const spawn = defaultSpawnPos();
    const dup = JSON.parse(JSON.stringify(clip.data));
    dup.x = spawn.x;
    dup.y = spawn.y;
    dup.w = spawn.w || dup.w || W_DEFAULT;
    normalizeItem(dup);
    arr.push(dup);
    pushToFront(arr, dup);
    if (clip.kind === 'photo') { api.renderPhotos(); api.updatePhotoCount(); }
    else { api.renderGifs(); api.updateGifCount(); }
    api.persist();
    api.toast(clip.kind === 'photo' ? 'Photo collée' : 'GIF collé');
  }

  function duplicateSelection() {
    const t = primaryTarget();
    if (!t) return;
    const isBoost = !document.body.classList.contains('not-boost');
    if (t.kind === 'photo' && !isBoost) { api.openBoostGate(null, true); return; }
    const arr = getArray(t.kind);
    const max = t.kind === 'photo' ? api.PHOTO_MAX : api.GIF_MAX;
    if (arr.length >= max) { api.toast('Limite atteinte'); return; }
    const off = pxOffsetPct(10, 10);
    const dup = JSON.parse(JSON.stringify(t.item));
    delete dup.posByMode;
    dup.x = (t.item.x || 50) + off.dx;
    dup.y = (t.item.y || 50) + off.dy;
    normalizeItem(dup);
    arr.push(dup);
    pushToFront(arr, dup);
    if (t.kind === 'photo') { api.renderPhotos(); api.updatePhotoCount(); }
    else { api.renderGifs(); api.updateGifCount(); }
    api.persist();
    api.toast('Dupliqué');
  }

  function deleteSelection() {
    if (!selected.size) return;
    const toRemove = selectedItems().sort((a, b) => b.idx - a.idx);
    toRemove.forEach(({ kind, idx }) => {
      getArray(kind).splice(idx, 1);
    });
    deselectAll();
    api.renderGifs();
    api.renderPhotos();
    api.updateGifCount();
    api.updatePhotoCount();
    api.persist();
    api.toast('Supprimé');
  }

  function ensureCropFields(item) {
    if (item.posX == null) item.posX = 50;
    if (item.posY == null) item.posY = 50;
    if (item.scale == null) item.scale = 1;
  }

  function refreshTransformImg(el, item) {
    const img = el.querySelector('.sticker-inner img');
    if (img) applyImgStyles(img, item);
  }

  function exitTransformMode() {
    if (!activeTransform) return;
    activeTransform.el.classList.remove('transform-crop', 'transform-stretch');
    activeTransform.el.querySelector('.ed-xform')?.remove();
    activeTransform = null;
  }

  function bindXformHandles(el, item, kind, mode) {
    const xform = el.querySelector('.ed-xform');
    if (!xform) return;
    xform.querySelectorAll('.ed-xh').forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const h = handle.dataset.h;
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        if (mode === 'crop') ensureCropFields(item);
        else { item.scaleX = item.scaleX || 1; item.scaleY = item.scaleY || 1; }
        const startX = e.clientX;
        const startY = e.clientY;
        const s = {
          posX: item.posX || 50,
          posY: item.posY || 50,
          scale: item.scale || 1,
          scaleX: item.scaleX || 1,
          scaleY: item.scaleY || 1,
        };
        const mv = ev => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (mode === 'crop') {
            if (h === 'n') item.posY = clampN(s.posY - dy * 0.18, 0, 100);
            else if (h === 's') item.posY = clampN(s.posY + dy * 0.18, 0, 100);
            else if (h === 'w') item.posX = clampN(s.posX - dx * 0.18, 0, 100);
            else if (h === 'e') item.posX = clampN(s.posX + dx * 0.18, 0, 100);
            else item.scale = clampN(s.scale + (dx + dy) * 0.004, 0.5, 4);
          } else {
            if (h === 'e') item.scaleX = clampN(s.scaleX + dx * 0.004, 0.25, 3);
            else if (h === 'w') item.scaleX = clampN(s.scaleX - dx * 0.004, 0.25, 3);
            else if (h === 's') item.scaleY = clampN(s.scaleY + dy * 0.004, 0.25, 3);
            else if (h === 'n') item.scaleY = clampN(s.scaleY - dy * 0.004, 0.25, 3);
            else {
              const delta = (dx + dy) * 0.004;
              item.scaleX = clampN(s.scaleX + delta, 0.25, 3);
              item.scaleY = clampN(s.scaleY + delta, 0.25, 3);
            }
          }
          refreshTransformImg(el, item);
        };
        const up = () => {
          handle.removeEventListener('pointermove', mv);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
          if (kind === 'photo') api.renderPhotos();
          else api.renderGifs();
          api.persist();
        };
        handle.addEventListener('pointermove', mv);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    });
  }

  function enterTransformMode(el, item, kind, mode) {
    exitTransformMode();
    selectEl(el, false);
    activeTransform = { el, item, kind, mode };
    if (mode === 'crop') ensureCropFields(item);
    else { item.scaleX = item.scaleX || 1; item.scaleY = item.scaleY || 1; }
    const box = document.createElement('div');
    box.className = 'ed-xform';
    ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(h => {
      const d = document.createElement('div');
      d.className = 'ed-xh ed-xh-' + h;
      d.dataset.h = h;
      box.appendChild(d);
    });
    el.appendChild(box);
    el.classList.add(mode === 'crop' ? 'transform-crop' : 'transform-stretch');
    bindXformHandles(el, item, kind, mode);
    refreshTransformImg(el, item);
  }

  function cropSelection() {
    const t = primaryTarget();
    if (!t) return;
    enterTransformMode(t.el, t.item, t.kind, 'crop');
    api.toast('Rogner — tire les poignées blanches');
  }

  function stretchSelection() {
    const t = primaryTarget();
    if (!t) return;
    enterTransformMode(t.el, t.item, t.kind, 'stretch');
    api.toast('Étirer — tire les poignées blanches');
  }

  function resetSelection() {
    exitTransformMode();
    selectedItems().forEach(({ item }) => {
      resetItem(item);
    });
    api.renderGifs();
    api.renderPhotos();
    api.persist();
    api.toast('Image réinitialisée');
  }

  function ensureCtxMenu() {
    if (ctxEl) return ctxEl;
    ctxEl = document.createElement('div');
    ctxEl.className = 'ed-ctx';
    ctxEl.hidden = true;
    ctxEl.innerHTML =
      '<button type="button" data-act="copy"><span>Copier</span><kbd>Ctrl+C</kbd></button>' +
      '<button type="button" data-act="paste"><span>Coller</span><kbd>Ctrl+V</kbd></button>' +
      '<button type="button" data-act="dup"><span>Dupliquer</span><kbd>Ctrl+D</kbd></button>' +
      '<button type="button" data-act="del"><span>Effacer</span><kbd>Suppr</kbd></button>' +
      '<div class="ed-ctx-sep"></div>' +
      '<button type="button" data-act="crop"><span>Rogner</span></button>' +
      '<button type="button" data-act="stretch"><span>Étirer</span></button>' +
      '<button type="button" data-act="reset"><span>Réinitialiser l\'image</span></button>' +
      '<div class="ed-ctx-sep"></div>' +
      '<div class="ed-ctx-sub">' +
        '<button type="button" class="ed-ctx-sub-btn"><span>Calque</span><span class="ed-ctx-arr">›</span></button>' +
        '<div class="ed-ctx-sub-menu">' +
          '<div class="ed-ctx-sub-menu-inner">' +
          '<button type="button" data-act="layer-front">Mettre au premier plan</button>' +
          '<button type="button" data-act="layer-fwd">Faire avancer d\'un niveau</button>' +
          '<button type="button" data-act="layer-back">Faire reculer d\'un niveau</button>' +
          '<button type="button" data-act="layer-rear">Mettre à l\'arrière-plan</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ctxEl);
    const ctxSub = ctxEl.querySelector('.ed-ctx-sub');
    let ctxSubTimer = null;
    function openCtxSub() {
      clearTimeout(ctxSubTimer);
      ctxSub.classList.add('open');
    }
    function scheduleCloseCtxSub() {
      clearTimeout(ctxSubTimer);
      ctxSubTimer = setTimeout(() => ctxSub.classList.remove('open'), 160);
    }
    ctxSub.addEventListener('mouseenter', openCtxSub);
    ctxSub.addEventListener('mouseleave', scheduleCloseCtxSub);
    ctxEl.querySelector('.ed-ctx-sub-menu').addEventListener('mouseenter', openCtxSub);
    ctxEl.querySelector('.ed-ctx-sub-menu').addEventListener('mouseleave', scheduleCloseCtxSub);
    ctxEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      const t = primaryTarget();
      closeCtx();
      if (act === 'copy') copySelection();
      else if (act === 'paste') pasteClip();
      else if (act === 'dup') duplicateSelection();
      else if (act === 'del') deleteSelection();
      else if (act === 'crop') cropSelection();
      else if (act === 'stretch') stretchSelection();
      else if (act === 'reset') resetSelection();
      else if (act === 'layer-front' && t) moveLayer(t.kind, t.idx, 'front');
      else if (act === 'layer-fwd' && t) moveLayer(t.kind, t.idx, 'forward');
      else if (act === 'layer-back' && t) moveLayer(t.kind, t.idx, 'backward');
      else if (act === 'layer-rear' && t) moveLayer(t.kind, t.idx, 'back');
    });
    return ctxEl;
  }

  function closeCtx() {
    if (ctxEl) {
      ctxEl.hidden = true;
      ctxEl.querySelector('.ed-ctx-sub')?.classList.remove('open');
    }
  }

  function openCtx(x, y, el) {
    ensureCtxMenu();
    selectEl(el, false);
    ctxEl.querySelector('.ed-ctx-sub')?.classList.remove('open');
    ctxEl.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    ctxEl.style.top = Math.min(y, window.innerHeight - 320) + 'px';
    ctxEl.hidden = false;
  }

  function makeEl(item, idx, layer, kind) {
    normalizeItem(item);
    const el = document.createElement('div');
    el.className = 'sticker';
    el.dataset.stickerKind = kind;
    el.dataset.stickerIdx = String(idx);
    el.style.zIndex = String(idx + 1);

    const apply = () => {
      el.style.left = item.x + '%';
      el.style.top = item.y + '%';
      el.style.width = item.w + '%';
      el.style.transform = 'translate(-50%,-50%) rotate(' + item.rot + 'deg)';
      const img = el.querySelector('img');
      if (img) applyImgStyles(img, item);
    };

    apply();
    el.innerHTML =
      '<div class="sticker-inner"><img src="' + item.url + '" alt="" draggable="false"></div>' +
      '<button class="sk-handle sk-del" title="Retirer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<div class="sk-handle sk-rot" title="Rotation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></div>' +
      '<div class="sk-handle sk-size" title="Taille"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H3v-6M21 9V3h-6M3 21 10 14M21 3l-7 7"/></svg></div>';
    applyImgStyles(el.querySelector('img'), item);

    const center = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    el.querySelector('.sk-del').addEventListener('pointerdown', e => e.stopPropagation());
    el.querySelector('.sk-del').addEventListener('click', e => {
      e.stopPropagation();
      getArray(kind).splice(idx, 1);
      if (kind === 'photo') { api.renderPhotos(); api.updatePhotoCount(); }
      else { api.renderGifs(); api.updateGifCount(); }
      api.toast(kind === 'photo' ? 'Photo retirée' : 'GIF retiré');
    });

    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      openCtx(e.clientX, e.clientY, el);
    });

    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.sk-handle, .ed-xh')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      selectEl(el, e.shiftKey);
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const er = el.getBoundingClientRect();
      drag = { mx: e.clientX, my: e.clientY, sx0: er.left + er.width / 2, sy0: er.top + er.height / 2 };
      el.classList.add('dragging');
      el.style.zIndex = '100';
      api.showGuide(kind === 'photo' ? 'photo' : 'gif');
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const half = el.getBoundingClientRect().height / 2;
      const bnd = api.stageBounds(Math.max(16, half));
      const cx = api.clamp(drag.sx0 + (e.clientX - drag.mx), bnd.minX, bnd.maxX);
      const cy = api.clamp(drag.sy0 + (e.clientY - drag.my), bnd.minY, bnd.maxY);
      const lr = layer.getBoundingClientRect();
      item.x = (cx - lr.left) / lr.width * 100;
      item.y = (cy - lr.top) / lr.height * 100;
      apply();
    });
    const endDrag = e => {
      if (!drag) return;
      drag = null;
      el.classList.remove('dragging');
      el.style.zIndex = String(idx + 1);
      api.hideGuide();
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      if (kind === 'photo') api._lastPhotoPlace = { x: item.x, y: item.y, w: item.w };
      else api._lastGifPlace = { x: item.x, y: item.y, w: item.w };
      api.persist();
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    const rz = el.querySelector('.sk-size');
    rz.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      try { rz.setPointerCapture(e.pointerId); } catch (_) {}
      const c = center();
      const d0 = Math.max(8, Math.hypot(e.clientX - c.x, e.clientY - c.y));
      const w0 = item.w;
      const mv = ev => {
        item.w = clampW(w0 * (Math.hypot(ev.clientX - c.x, ev.clientY - c.y) / d0));
        apply();
      };
      const up = ev => {
        rz.removeEventListener('pointermove', mv);
        rz.removeEventListener('pointerup', up);
        try { rz.releasePointerCapture(ev.pointerId); } catch (_) {}
        if (kind === 'photo') api._lastPhotoPlace = { x: item.x, y: item.y, w: item.w };
        else api._lastGifPlace = { x: item.x, y: item.y, w: item.w };
        api.persist();
      };
      rz.addEventListener('pointermove', mv);
      rz.addEventListener('pointerup', up);
    });

    const ro = el.querySelector('.sk-rot');
    ro.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      try { ro.setPointerCapture(e.pointerId); } catch (_) {}
      const c = center();
      const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
      const r0 = item.rot;
      const mv = ev => {
        const a = Math.atan2(ev.clientY - c.y, ev.clientX - c.x) * 180 / Math.PI;
        item.rot = Math.round(r0 + (a - a0));
        apply();
      };
      const up = ev => {
        ro.removeEventListener('pointermove', mv);
        ro.removeEventListener('pointerup', up);
        try { ro.releasePointerCapture(ev.pointerId); } catch (_) {}
        api.persist();
      };
      ro.addEventListener('pointermove', mv);
      ro.addEventListener('pointerup', up);
    });

    return el;
  }

  function ensureMarqueeEl() {
    let m = $('edMarquee');
    if (!m) {
      m = document.createElement('div');
      m.id = 'edMarquee';
      m.className = 'ed-marquee';
      m.hidden = true;
      document.body.appendChild(m);
    }
    return m;
  }

  function bindMarquee() {
    const zone = document.querySelector('.card-zone');
    if (!zone) return;
    const mEl = ensureMarqueeEl();

    zone.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.target.closest('.sticker, .orb-wrap, .card, .canvas-modes, .eye-dot, .toolbar, .tool, .sheet, .modal, .color-panel, .mf-vol, .ed-ctx, .act-fab, .pset-panel, .music-now, button, input, textarea, .voice, .editable, .conn')) return;
      e.preventDefault();
      marquee = { x0: e.clientX, y0: e.clientY, active: false };
      try { zone.setPointerCapture(e.pointerId); } catch (_) {}
    });

    zone.addEventListener('pointermove', e => {
      if (!marquee) return;
      const dx = Math.abs(e.clientX - marquee.x0);
      const dy = Math.abs(e.clientY - marquee.y0);
      if (!marquee.active && dx + dy < 6) return;
      marquee.active = true;
      const x = Math.min(marquee.x0, e.clientX);
      const y = Math.min(marquee.y0, e.clientY);
      const w = Math.abs(e.clientX - marquee.x0);
      const h = Math.abs(e.clientY - marquee.y0);
      mEl.hidden = false;
      mEl.style.left = x + 'px';
      mEl.style.top = y + 'px';
      mEl.style.width = w + 'px';
      mEl.style.height = h + 'px';
    });

    const endMarquee = e => {
      if (!marquee) return;
      const wasActive = marquee.active;
      const x0 = marquee.x0;
      const y0 = marquee.y0;
      marquee = null;
      mEl.hidden = true;
      try { zone.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!wasActive) return;
      const x1 = e.clientX;
      const y1 = e.clientY;
      const left = Math.min(x0, x1);
      const top = Math.min(y0, y1);
      const right = Math.max(x0, x1);
      const bottom = Math.max(y0, y1);
      deselectAll();
      document.querySelectorAll('.sticker').forEach(st => {
        const r = st.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx >= left && cx <= right && cy >= top && cy <= bottom) selectEl(st, true);
      });
    };
    zone.addEventListener('pointerup', endMarquee);
    zone.addEventListener('pointercancel', endMarquee);
  }

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.ctrlKey && e.key === 'c') { e.preventDefault(); copySelection(); }
      else if (e.ctrlKey && e.key === 'd') { e.preventDefault(); duplicateSelection(); }
      else if (e.key === 'Delete') { deleteSelection(); }
      else if (e.key === 'Escape') { closeCtx(); exitTransformMode(); }
    });
  }

  function bindPaste() {
    document.addEventListener('paste', e => {
      if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') === 0) {
            e.preventDefault();
            const f = items[i].getAsFile();
            if (f) { pasteExternalImage(f); return; }
          }
        }
      }
      const files = e.clipboardData && e.clipboardData.files;
      if (files && files.length) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            e.preventDefault();
            pasteExternalImage(files[i]);
            return;
          }
        }
      }
      if (clip && clip.data) {
        e.preventDefault();
        pasteClip();
      }
    });
  }

  function bindDrop() {
    const zone = document.querySelector('.card-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => {
      if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    });
    zone.addEventListener('drop', e => {
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      const isBoost = !document.body.classList.contains('not-boost');
      if (!isBoost) { api.openBoostGate(null, true); return; }
      const remaining = api.PHOTO_MAX - api.S.photos.length;
      if (remaining <= 0) { api.toast('Limite : ' + api.PHOTO_MAX + ' photos'); return; }
      files.slice(0, remaining).forEach(f => api.addPhotoFile(f));
    });
  }

  function bindGlobalClose() {
    document.addEventListener('pointerdown', e => {
      if (e.target.closest('.ed-xh')) return;
      if (!e.target.closest('.ed-ctx')) closeCtx();
      if (e.target.closest('.ed-ctx')) return;
      if (activeTransform && !e.target.closest('.ed-xform, .ed-xh')) exitTransformMode();
      if (!e.target.closest('.sticker, .photo-tile') && !e.shiftKey && !marquee) deselectAll();
    });
    document.addEventListener('contextmenu', e => {
      if (!e.target.closest('.sticker')) closeCtx();
    });
  }

  function stickerFields(item) {
    const o = {};
    if (item.posX != null) { o.posX = item.posX; o.posY = item.posY; o.scale = item.scale; }
    if (item.scaleX != null && item.scaleX !== 1) o.scaleX = item.scaleX;
    if (item.scaleY != null && item.scaleY !== 1) o.scaleY = item.scaleY;
    return o;
  }

  function hydrateFields(item, raw) {
    if (raw.posX != null) { item.posX = raw.posX; item.posY = raw.posY; item.scale = raw.scale; }
    if (raw.scaleX != null) item.scaleX = raw.scaleX;
    if (raw.scaleY != null) item.scaleY = raw.scaleY;
    normalizeItem(item);
  }

  function install(opts) {
    api = opts;
    ensureCtxMenu();
    bindMarquee();
    bindKeyboard();
    bindPaste();
    bindDrop();
    bindGlobalClose();
  }

  global.__EditorStickers = {
    install,
    makeEl,
    defaultSpawnPos,
    normalizeItem,
    stickerFields,
    hydrateFields,
    deselectAll,
    selectEl,
    W_MIN,
    W_MAX,
    W_DEFAULT,
  };
})(window);
