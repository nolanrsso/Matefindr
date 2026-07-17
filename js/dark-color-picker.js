/* Sélecteur de couleur sombre + pipette — partagé site Matefindr */
(function (global) {
  'use strict';

  const PRESETS = ['#1ED760', '#8DCBFF', '#C7A5FF', '#9146FF', '#FF4FA0', '#FFD83D', '#FFFFFF', '#242429'];
  const DROP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M12 11l2-2"/><path d="m15 8 3-3a2.8 2.8 0 0 1 4 4l-3 3"/><path d="m18 5 1 1"/></svg>';

  function $(id) { return document.getElementById(id); }

  function normHex6(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    return m ? '#' + m[1].toUpperCase() : null;
  }

  function hexToRgbObj(hex) {
    const h = normHex6(hex);
    if (!h) return null;
    return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
  }

  function rgbToHex(r, g, b) {
    const c = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max, v = max;
    if (d) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    return { h, s: s * 100, v: v * 100 };
  }

  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let rp = 0, gp = 0, bp = 0;
    if (h < 60) { rp = c; gp = x; } else if (h < 120) { rp = x; gp = c; } else if (h < 180) { gp = c; bp = x; }
    else if (h < 240) { gp = x; bp = c; } else if (h < 300) { rp = x; bp = c; } else { rp = c; bp = x; }
    return { r: Math.round((rp + m) * 255), g: Math.round((gp + m) * 255), b: Math.round((bp + m) * 255) };
  }

  const DarkColorPicker = (function () {
    let root, sv, hue, cursor, hueThumb, preview, hexIn, presetsEl, dropBtn;
    let anchor = null, onChange = null, h = 280, s = 70, v = 80, drag = null;

    function injectDom() {
      if ($('darkColorPicker')) return;
      document.body.insertAdjacentHTML('beforeend', `
<div class="dk-pick" id="darkColorPicker" hidden aria-hidden="true">
  <div class="dk-pick-sv" id="dkPickSv"><div class="dk-pick-cursor" id="dkPickCursor"></div></div>
  <div class="dk-pick-hue" id="dkPickHue"><div class="dk-pick-hue-thumb" id="dkPickHueThumb"></div></div>
  <div class="dk-pick-row">
    <button type="button" class="dk-pick-drop" id="dkPickDrop" title="Pipette : capturer une couleur à l'écran" aria-label="Pipette">${DROP_SVG}</button>
    <div class="dk-pick-preview" id="dkPickPreview"></div>
    <input class="dk-pick-hex" id="dkPickHex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Code hexadécimal">
  </div>
  <div class="dk-pick-presets" id="dkPickPresets"></div>
</div>`);
    }

    function ensure() {
      injectDom();
      if (root) return;
      root = $('darkColorPicker');
      sv = $('dkPickSv');
      hue = $('dkPickHue');
      cursor = $('dkPickCursor');
      hueThumb = $('dkPickHueThumb');
      preview = $('dkPickPreview');
      hexIn = $('dkPickHex');
      presetsEl = $('dkPickPresets');
      dropBtn = $('dkPickDrop');
      presetsEl.innerHTML = PRESETS.map(c => `<button type="button" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
      presetsEl.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => setFromHex(btn.dataset.c, true)));
      hexIn.addEventListener('change', () => {
        const nx = normHex6(hexIn.value);
        if (nx) setFromHex(nx, true);
        else hexIn.value = currentHex();
      });
      hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hexIn.blur(); } });
      sv.addEventListener('pointerdown', e => startDrag('sv', e));
      hue.addEventListener('pointerdown', e => startDrag('hue', e));
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && root && !root.hidden) close(); });
      document.addEventListener('pointerdown', e => {
        if (root.hidden || !anchor) return;
        if (root.contains(e.target) || anchor.contains(e.target)) return;
        close();
      }, true);
      if (dropBtn) {
        const hasEye = typeof EyeDropper !== 'undefined';
        dropBtn.disabled = !hasEye;
        dropBtn.title = hasEye ? 'Pipette : capturer une couleur à l\'écran' : 'Pipette non disponible sur ce navigateur';
        dropBtn.addEventListener('click', async () => {
          if (typeof EyeDropper === 'undefined') return;
          try {
            const ed = new EyeDropper();
            const res = await ed.open();
            if (res && res.sRGBHex) setFromHex(res.sRGBHex, true);
          } catch (_) {}
        });
      }
    }

    function currentHex() {
      const rgb = hsvToRgb(h, s, v);
      return rgbToHex(rgb.r, rgb.g, rgb.b).toUpperCase();
    }

    function paint(emit) {
      sv.style.background = 'hsl(' + h + ',100%,50%)';
      cursor.style.left = s + '%';
      cursor.style.top = (100 - v) + '%';
      hueThumb.style.left = (h / 360 * 100) + '%';
      const hex = currentHex();
      preview.style.background = hex;
      hexIn.value = hex;
      if (emit !== false && onChange) onChange(hex);
      if (anchor && anchor.style) anchor.style.background = hex;
    }

    function setFromHex(hex, emit) {
      const rgb = hexToRgbObj(hex);
      if (!rgb) return;
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      h = hsv.h; s = hsv.s; v = hsv.v;
      paint(emit);
    }

    function position() {
      if (!anchor || !root) return;
      const r = anchor.getBoundingClientRect();
      const pw = root.offsetWidth || 248;
      const ph = root.offsetHeight || 320;
      let left = r.right + 10;
      if (left + pw > window.innerWidth - 10) left = Math.max(10, r.left - pw - 10);
      let top = r.top;
      if (top + ph > window.innerHeight - 10) top = Math.max(10, window.innerHeight - ph - 10);
      root.style.left = left + 'px';
      root.style.top = top + 'px';
    }

    function startDrag(kind, e) {
      e.preventDefault();
      drag = kind;
      try { (kind === 'sv' ? sv : hue).setPointerCapture(e.pointerId); } catch (_) {}
      applyPoint(kind, e);
      root.setAttribute('aria-hidden', 'false');
    }

    function applyPoint(kind, e) {
      const box = (kind === 'sv' ? sv : hue).getBoundingClientRect();
      if (kind === 'sv') {
        s = Math.max(0, Math.min(100, (e.clientX - box.left) / box.width * 100));
        v = Math.max(0, Math.min(100, (1 - (e.clientY - box.top) / box.height) * 100));
      } else {
        h = Math.max(0, Math.min(360, (e.clientX - box.left) / box.width * 360));
      }
      paint();
    }

    function onMove(e) { if (!drag) return; applyPoint(drag, e); }
    function endDrag(e) {
      if (!drag) return;
      drag = null;
      try { sv.releasePointerCapture(e.pointerId); hue.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    function open(anchorEl, hex, cb) {
      ensure();
      anchor = anchorEl;
      onChange = cb || null;
      setFromHex(normHex6(hex) || '#9146FF', false);
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(position);
    }

    function close() {
      if (!root) return;
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      anchor = null;
      onChange = null;
      drag = null;
    }

    function bindSwatch(el, get, set) {
      if (!el || el.disabled) return;
      el.addEventListener('click', e => {
        if (el.disabled) return;
        e.stopPropagation();
        const start = normHex6(typeof get === 'function' ? get() : el.dataset.hex) || '#9146FF';
        setSwatchBg(el, start);
        open(el, start, hex => { if (typeof set === 'function') set(hex); });
      });
    }

    function setSwatchBg(el, hex) {
      if (!el) return;
      const c = normHex6(hex) || '#9146FF';
      el.dataset.hex = c;
      const n = parseInt(c.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      /* Couleurs très claires : damier sombre derrière → pas de carré blanc cramé sur UI dark */
      if (luma > 210) {
        el.style.background =
          'linear-gradient(' + c + ',' + c + ') center / calc(100% - 10px) calc(100% - 10px) no-repeat,' +
          'repeating-conic-gradient(#3a3a48 0% 25%, #1a1a24 0% 50%) 0 0 / 10px 10px';
        el.style.backgroundColor = '#1a1a24';
      } else {
        el.style.background = c;
        el.style.backgroundColor = c;
      }
    }

    return { open, close, bindSwatch, setSwatchBg, ensure, normHex6 };
  })();

  /** Remplace les input[type=color] natifs par un swatch + picker sombre. */
  function upgradeNativeColorInputs(root) {
    DarkColorPicker.ensure();
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input[type="color"]:not([data-dk-upgraded])').forEach(inp => {
      inp.dataset.dkUpgraded = '1';
      inp.hidden = true;
      inp.style.position = 'absolute';
      inp.style.width = '0';
      inp.style.height = '0';
      inp.style.opacity = '0';
      inp.style.pointerEvents = 'none';
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'mf-color-swatch';
      sw.setAttribute('aria-label', inp.getAttribute('aria-label') || 'Choisir une couleur');
      const val = normHex6(inp.value) || '#9146FF';
      DarkColorPicker.setSwatchBg(sw, val);
      inp.parentNode.insertBefore(sw, inp);
      DarkColorPicker.bindSwatch(sw, () => inp.value, hex => {
        inp.value = hex.toLowerCase();
        DarkColorPicker.setSwatchBg(sw, hex);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  }

  global.DarkColorPicker = DarkColorPicker;
  global.MFUpgradeColorInputs = upgradeNativeColorInputs;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => upgradeNativeColorInputs());
  } else {
    upgradeNativeColorInputs();
  }
})(typeof window !== 'undefined' ? window : globalThis);
