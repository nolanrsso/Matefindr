/* Volume musique unifié — matefindr_state.user.musicVolume (0–1) + gain global */
(function (global) {
  const STATE_KEY = 'matefindr_state';
  const GAIN = 0.275;
  const DEFAULT = 0.5;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (_) { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {}
  }
  function normalizeVol(v) {
    if (typeof v !== 'number' || !isFinite(v)) return DEFAULT;
    if (v > 1) v = v / 100;
    return Math.max(0, Math.min(1, v));
  }
  function getVol() {
    const s = readState();
    const raw = s.user && typeof s.user.musicVolume === 'number' ? s.user.musicVolume : DEFAULT;
    return normalizeVol(raw);
  }
  function setVol(v, persist) {
    v = normalizeVol(v);
    if (persist !== false) {
      const s = readState();
      s.user = s.user || {};
      s.user.musicVolume = v;
      writeState(s);
    }
    global.dispatchEvent(new CustomEvent('mf:volume', { detail: { value: v, effective: v * GAIN } }));
    return v;
  }
  function effective(v) {
    return normalizeVol(v == null ? getVol() : v) * GAIN;
  }
  function paintRange(input, v) {
    if (!input) return;
    const pct = Math.round(normalizeVol(v) * 100);
    input.value = String(pct);
    input.style.setProperty('--mf-vol-pct', pct + '%');
  }
  function bindWidget(root, opts) {
    opts = opts || {};
    const btn = root.querySelector('.mf-vol-btn');
    const range = root.querySelector('.mf-vol-range');
    if (!range) return { refresh: function () {} };
    let preMute = null;
    const open = function () { root.classList.add('mf-vol--open'); };
    const close = function () {
      root.classList.remove('mf-vol--open');
      if (document.activeElement === range || document.activeElement === btn) {
        try { document.activeElement.blur(); } catch (_) {}
      }
    };
    root.addEventListener('mouseenter', open);
    root.addEventListener('mouseleave', close);
    range.addEventListener('blur', function () {
      if (!root.matches(':hover')) close();
    });
    btn.addEventListener('blur', function () {
      if (!root.matches(':hover') && document.activeElement !== range) close();
    });
    const apply = function (v, persist) {
      v = setVol(v, persist);
      paintRange(range, v);
      root.classList.toggle('muted', v === 0);
      if (opts.onChange) opts.onChange(v, effective(v));
    };
    range.addEventListener('input', function () {
      apply(parseInt(range.value, 10) / 100, opts.persist !== false);
    });
    range.addEventListener('change', function () {
      if (opts.onSave) opts.onSave(getVol());
    });
    if (btn) {
      btn.addEventListener('click', function () {
        const v = getVol();
        if (v > 0) { preMute = v; apply(0, true); }
        else apply(preMute || DEFAULT, true);
      });
    }
    apply(getVol(), false);
    return {
      refresh: function () { apply(getVol(), false); }
    };
  }

  global.MatefindrVolume = {
    GAIN: GAIN,
    DEFAULT: DEFAULT,
    getVol: getVol,
    setVol: setVol,
    effective: effective,
    normalizeVol: normalizeVol,
    paintRange: paintRange,
    bindWidget: bindWidget
  };
})(window);
