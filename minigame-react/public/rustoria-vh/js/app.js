import { createLockpickGame } from './games/lockpick.js';
import { createKeypadGame } from './games/keypad.js';
import { createSafeGame } from './games/safe.js';
import { createWireGame } from './games/wire.js';
import { createInsideGame } from './games/inside.js';

const RESOURCE_NAME = 'rustoria-vh';
const DEFAULT_TIME_LIMIT = 20000;
const OVERLAY_TIMEOUT_MS = 1200;

const elements = {
  tier: document.querySelector('[data-hook="tier"]'),
  title: document.querySelector('[data-hook="title"]'),
  status: document.querySelector('[data-hook="status"]'),
  timerFill: document.querySelector('[data-hook="timer-fill"]'),
  timerRemaining: document.querySelector('[data-hook="timer-remaining"]'),
  footInfo: document.querySelector('[data-hook="foot-info"]'),
  overlay: document.querySelector('[data-hook="overlay"]'),
  overlayMessage: document.querySelector('[data-hook="overlay-message"]'),
  overlayDismiss: document.querySelector('[data-hook="overlay-dismiss"]'),
  gameRoot: document.querySelector('[data-hook="game-root"]')
};

const state = {
  current: null,
  locale: 'en',
  translations: {},
  focusLost: false,
  overlayTimer: null
};

const gameFactories = {
  lockpick: createLockpickGame,
  keypad: createKeypadGame,
  safe: createSafeGame,
  wire: createWireGame,
  inside: createInsideGame
};

const audio = createAudioMixer();

bootstrap();

function bootstrap() {
  attachGlobalListeners();
  loadLocale(state.locale);
}

function attachGlobalListeners() {
  window.addEventListener('message', handleMessage);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  document.body.addEventListener('mousedown', handlePointerResume);
  document.body.addEventListener('touchstart', handlePointerResume, { passive: true });
  if (elements.overlayDismiss) {
    elements.overlayDismiss.addEventListener('click', hideOverlay);
  }
}

async function loadLocale(locale) {
  try {
    const res = await fetch(`./js/i18n/${locale}.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      state.translations = data || {};
      state.locale = locale;
    }
  } catch (err) {
    console.warn('NUI locale load failed', err);
  }
}

function t(key, fallback = '') {
  const value = key
    .split('.')
    .reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), state.translations);
  return typeof value === 'string' ? value : fallback;
}

function renderIdle() {
  setTier('');
  setTitle('MINIGAME READY');
  setStatus('WAITING FOR SIGNAL');
  setFootnote('Stand by for server instructions');
  setTimerDisplay(0, 1);
  hideOverlay();
  if (elements.gameRoot) {
    elements.gameRoot.innerHTML = '';
  }
}

function handleMessage(event) {
  const data = event && event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  switch (data.action) {
    case 'minigame:start':
      console.log(data)
      startMinigame(data);
      break;
    case 'minigame:stop':
      failCurrent(data.reason || 'server');
      break;
    case 'minigame:close':
      document.getElementById('app')?.classList.add('hidden');
      tearDownCurrent();
      hideOverlay();
      renderIdle();
      break;
    case 'inside_open':
      startInsideMinigame(data.payload || {});
      break;
    case 'inside_close':
      document.getElementById('app')?.classList.add('hidden');
      tearDownCurrent();
      hideOverlay();
      renderIdle();
      break;
    case 'minigame:set-locale':
      if (data.locale) {
        loadLocale(String(data.locale));
      }
      break;
    default:
      break;
  }
}

function startMinigame(message) {
  document.getElementById('app')?.classList.remove('hidden');
  const gameId = String(message.gameId || '').toLowerCase();
  const factory = gameFactories[gameId];
  if (!factory) {
    console.warn('[minigame] Unknown gameId', gameId);
    return;
  }

  hideOverlay();
  tearDownCurrent();

  if (elements.gameRoot) {
    elements.gameRoot.innerHTML = '';
  }
  const container = document.createElement('div');
  container.className = 'game-container';
  elements.gameRoot.appendChild(container);

  const difficulty = Number(message.difficulty ?? 1) || 1;
  const timeLimitMs = clampInt(message.timeLimitMs ?? DEFAULT_TIME_LIMIT, 5000, 60000);
  const tierLabel = typeof message.tier === 'string' ? message.tier : difficulty >= 2 ? 'LUXE' : 'CHEAP';

  setTier(formatTier(tierLabel));
  setTitle(t(`game.${gameId}.title`, gameId.toUpperCase()));
  setStatus(t('status.prepare', 'ENGAGE THE DEVICE'));
  setFootnote(t('foot.default', 'Follow the prompts to clear the puzzle'));

  const context = buildGameContext(container, message, difficulty);
  const instance = factory(context);

    const current = {
    instance,
    gameId,
    difficulty,
    seed: String(message.seed || ''),
    seedSignature: message.seedSignature || message.seed_signature || '',
    tier: tierLabel,
    startedAt: performance.now(),
    timeLimitMs,
    deadline: performance.now() + timeLimitMs,
    timerFrame: null,
    finalized: false,
    keyHandlers: { down: new Set(), up: new Set() },
    disposers: [],
    mode: 'standard'
  };

  state.current = current;
  setTimerDisplay(timeLimitMs, 1);

  startTimer(current);

  const config = message.config || message.payload || {};
  instance.start(
    {
      difficulty,
      seed: current.seed,
      config,
      timeLimitMs,
      tier: tierLabel,
      rng: context.makeRng('main')
    },
    {
      translate: t,
      setStatus,
      setFootnote,
      playHint: audio.hint,
      registerKeyDown: (handler) => {
        const release = registerKeyHandler(current, 'down', handler);
        current.disposers.push(release);
        return release;
      },
      registerKeyUp: (handler) => {
        const release = registerKeyHandler(current, 'up', handler);
        current.disposers.push(release);
        return release;
      },
      complete: (detail) => finalize('PASS', detail),
      fail: (detail) => finalize('FAIL', detail)
    }
  );
}

function mapInsideDifficulty(label) {
  switch (label) {
    case 'EXPERT':
      return 4;
    case 'HARD':
      return 3;
    case 'NORMAL':
      return 2;
    default:
      return 1;
  }
}

function startInsideMinigame(payload) {
  document.getElementById('app')?.classList.remove('hidden');
  hideOverlay();
  tearDownCurrent();

  if (elements.gameRoot) {
    elements.gameRoot.innerHTML = '';
  }
  const container = document.createElement('div');
  container.className = 'game-container';
  elements.gameRoot.appendChild(container);

  const requestedGameId = String(payload.gameId || '').toLowerCase();
  const factory = gameFactories[requestedGameId] || gameFactories.inside;
  const gameId = factory === gameFactories[requestedGameId] ? requestedGameId : 'inside';

  const difficultyLabel = typeof payload.difficulty === 'string' ? payload.difficulty.toUpperCase() : 'EASY';
  const difficulty = mapInsideDifficulty(difficultyLabel);
  const params = payload.params || {};
  const timeLimitMs = clampInt(
    params.timeLimitMs !== undefined ? Number(params.timeLimitMs) :
    params.timeLimitSec !== undefined ? Number(params.timeLimitSec) * 1000 :
    15000,
    5000,
    30000
  );
  const tierLabel = typeof payload.tier === 'string' ? payload.tier : difficultyLabel;

  setTier(formatTier(tierLabel));
  setTitle(payload.title || t('game.inside.title', 'INSIDE TASK'));
  setStatus(payload.subtitle || t('status.prepare', 'ENGAGE THE DEVICE'));
  setFootnote(payload.footnote || t('foot.inside', 'Click when the pad glows'));

  const seed = String(payload.seed || `inside:${Date.now()}`);
  const context = buildGameContext(container, { seed, gameId }, difficulty);
  const instance = factory(context);

  const current = {
    instance,
    gameId,
    difficulty,
    seed,
    seedSignature: '',
    tier: tierLabel,
    startedAt: performance.now(),
    timeLimitMs,
    deadline: performance.now() + timeLimitMs,
    timerFrame: null,
    finalized: false,
    keyHandlers: { down: new Set(), up: new Set() },
    disposers: [],
    mode: 'inside'
  };

  state.current = current;
  setTimerDisplay(timeLimitMs, 1);
  startTimer(current);

  const setup = {
    difficulty,
    seed,
    config: params,
    timeLimitMs,
    tier: tierLabel,
    rng: context.makeRng('main')
  };

  instance.start(
    setup,
    {
      translate: t,
      setStatus,
      setFootnote,
      playHint: audio.hint,
      registerKeyDown: (handler) => {
        const release = registerKeyHandler(current, "down", handler);
        current.disposers.push(release);
        return release;
      },
      registerKeyUp: (handler) => {
        const release = registerKeyHandler(current, "up", handler);
        current.disposers.push(release);
        return release;
      },
      complete: (detail) => finalize('PASS', detail),
      fail: (detail) => finalize('FAIL', detail),
      cancel: (detail) => cancelInside(detail && detail.reason ? detail.reason : "cancelled")
    }
  );
}

function buildGameContext(container, message, difficulty) {
  const baseSeed = `${message.seed || ''}:${message.gameId || ''}:${difficulty}`;
  return {
    root: container,
    translate: t,
    makeRng: (salt = '') => makeRng(`${baseSeed}:${salt}`),
    requestFrame: (fn) => requestAnimationFrame(fn),
    cancelFrame: (id) => cancelAnimationFrame(id)
  };
}

function registerKeyHandler(current, type, handler) {
  if (!current || typeof handler !== 'function') {
    return () => {};
  }
  const bucket = current.keyHandlers[type];
  bucket.add(handler);
  return () => {
    bucket.delete(handler);
  };
}

function startTimer(current) {
  const tick = (now) => {
    if (!state.current || state.current !== current) {
      return;
    }
    const remaining = Math.max(0, current.deadline - now);
    const ratio = remaining / current.timeLimitMs;
    setTimerDisplay(remaining, ratio);
    if (remaining <= 0) {
      finalize('FAIL', { code: 'timeout' });
      return;
    }
    current.timerFrame = requestAnimationFrame(tick);
  };
  current.timerFrame = requestAnimationFrame(tick);
}

function stopTimer(current) {
  if (current.timerFrame) {
    cancelAnimationFrame(current.timerFrame);
    current.timerFrame = null;
  }
}

function finalize(result, detail = {}) {
  const current = state.current;
  if (!current || current.finalized) {
    return;
  }
  current.finalized = true;
  stopTimer(current);

  const normalizedResult = result === 'PASS' ? 'PASS' : 'FAIL';
  const detailPayload = sanitizeDetail(detail);
  setStatus(
    normalizedResult === 'PASS'
      ? t('status.success', 'PUZZLE CLEARED')
      : t('status.fail', 'PUZZLE FAILED')
  );
  if (normalizedResult === 'PASS') {
    audio.play('success');
  } else {
    audio.play('fail');
  }

  if (current.mode === 'inside') {
    postNui('insideMiniFinish', {
      result: normalizedResult === 'PASS',
      detail: detailPayload
    });
    showOverlay(
      normalizedResult === 'PASS'
        ? t('overlay.success', 'ACCESS GRANTED')
        : t('overlay.fail', 'ACCESS DENIED'),
      normalizedResult === 'PASS' ? 'success' : 'danger'
    );
    tearDownCurrent();
    return;
  }

  const elapsed = Math.max(0, Math.round(performance.now() - current.startedAt));
  const trace = buildTrace(current, normalizedResult, detailPayload);
  const clientProof = buildClientProof(current.seed, trace, elapsed);

  postNui('minigame:result', {
    result: normalizedResult,
    detail: detailPayload,
    elapsedMs: elapsed,
    trace,
    clientProof,
    seed: current.seed,
    seedSignature: current.seedSignature,
    gameId: current.gameId,
    difficulty: current.difficulty
  });

  showOverlay(
    normalizedResult === 'PASS'
      ? t('overlay.success', 'ACCESS GRANTED')
      : t('overlay.fail', 'ACCESS DENIED'),
    normalizedResult === 'PASS' ? 'success' : 'danger'
  );

  tearDownCurrent();
}

function buildTrace(current, result, detail) {
  const code = typeof detail.code === 'string' ? detail.code : result === 'PASS' ? 'ok' : 'fail';
  const stage = typeof detail.stage === 'string' ? detail.stage : 'final';
  const attempt = typeof detail.attempt === 'number' ? detail.attempt : 0;
  return [current.gameId, result, code, stage, current.difficulty, attempt].join('|');
}

function buildClientProof(seed, trace, elapsed) {
  const payload = `${trace}|${elapsed}`;
  return hmacSeed(seed, payload);
}

function sanitizeDetail(detail) {
  if (!detail || typeof detail !== 'object') {
    return {};
  }
  const clean = {};
  Object.keys(detail).forEach((key) => {
    const value = detail[key];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      clean[key] = value;
    }
  });
  return clean;
}

function tearDownCurrent() {
  const current = state.current;
  if (!current) {
    return;
  }
  if (current.timerFrame) {
    cancelAnimationFrame(current.timerFrame);
    current.timerFrame = null;
  }
  current.disposers.forEach((dispose) => {
    try {
      dispose();
    } catch (err) {
      console.warn('dispose failed', err);
    }
  });
  current.disposers = [];
  if (current.instance) {
    if (typeof current.instance.stop === 'function') {
      current.instance.stop();
    }
    if (typeof current.instance.destroy === 'function') {
      current.instance.destroy();
    }
  }
  if (elements.gameRoot) {
    elements.gameRoot.innerHTML = '';
  }
  state.current = null;
}

function cancelInside(reason) {
  const current = state.current;
  if (!current || current.mode !== "inside" || current.finalized) {
    return;
  }
  current.finalized = true;
  stopTimer(current);
  postNui('insideMiniCancel', { reason: reason || 'cancelled' });
  setStatus('OPERATION ABORTED');
  audio.play('fail');
  showOverlay(t('overlay.fail', 'ACCESS DENIED'), 'danger');
  tearDownCurrent();
}
function failCurrent(reason) {
  const current = state.current;
  if (!current) {
    return;
  }
  if (current.mode === 'inside' && reason === 'escape') {
    cancelInside(reason);
    return;
  }
  finalize('FAIL', { code: reason || 'server' });
}

function showOverlay(message, tone) {
  if (!elements.overlay || !elements.overlayMessage) {
    return;
  }
  elements.overlayMessage.textContent = message;
  elements.overlayMessage.classList.remove('text-success', 'text-danger');
  if (tone === 'success') {
    elements.overlayMessage.classList.add('text-success');
  } else if (tone === 'danger') {
    elements.overlayMessage.classList.add('text-danger');
  }
  elements.overlay.hidden = false;
  if (state.overlayTimer) {
    clearTimeout(state.overlayTimer);
  }
  state.overlayTimer = setTimeout(hideOverlay, OVERLAY_TIMEOUT_MS);
}

function hideOverlay() {
  if (!elements.overlay) {
    return;
  }
  elements.overlay.hidden = true;
  if (state.overlayTimer) {
    clearTimeout(state.overlayTimer);
    state.overlayTimer = null;
  }
}

function handleKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (state.current && state.current.mode === 'inside') {
      cancelInside('escape');
    } else {
      failCurrent('escape');
    }
    return;
  }
  const current = state.current;
  if (!current) {
    return;
  }
  if (event.repeat) {
    return;
  }
  current.keyHandlers.down.forEach((handler) => {
    try {
      handler(event);
    } catch (err) {
      console.warn('KeyDown handler error', err);
    }
  });
}

function handleKeyUp(event) {
  const current = state.current;
  if (!current) {
    return;
  }
  current.keyHandlers.up.forEach((handler) => {
    try {
      handler(event);
    } catch (err) {
      console.warn('KeyUp handler error', err);
    }
  });
}

function handleBlur() {
  state.focusLost = true;
  document.body.classList.add('focus-lost');
  setStatus(t('status.focus', 'FOCUS LOST - CLICK TO RESUME'));
}

function handleFocus() {
  state.focusLost = false;
  document.body.classList.remove('focus-lost');
}

function handlePointerResume() {
  if (state.focusLost) {
    state.focusLost = false;
    document.body.classList.remove('focus-lost');
    setStatus(t('status.resume', 'RESUMED CONTROL'));
  }
}

function setTitle(text) {
  if (elements.title) {
    elements.title.textContent = text || '';
  }
}

function setTier(text) {
  if (elements.tier) {
    elements.tier.textContent = text || '';
  }
}

function setStatus(text) {
  if (elements.status) {
    elements.status.textContent = text || '';
  }
}

function setFootnote(text) {
  if (elements.footInfo) {
    elements.footInfo.textContent = text || '';
  }
}

function setTimerDisplay(remainingMs, ratio) {
  if (elements.timerRemaining) {
    elements.timerRemaining.textContent = (Math.max(0, remainingMs) / 1000).toFixed(1);
  }
  if (elements.timerFill) {
    elements.timerFill.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;
  }
}

function formatTier(tier) {
  if (!tier) {
    return '';
  }
  const key = tier.toLowerCase();
  return t(`tier.${key}`, tier.toUpperCase());
}

function clampInt(value, min, max) {
  const numeric = Number(value) || 0;
  return Math.round(Math.min(max, Math.max(min, numeric)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function postNui(action, data) {
  fetch(`https://${RESOURCE_NAME}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(data || {})
  }).catch(() => {});
}

function makeRng(seedText) {
  const base = hashString(seedText);
  let stateValue = base;
  return () => {
    stateValue |= 0;
    stateValue = (stateValue + 0x6d2b79f5) | 0;
    let t = Math.imul(stateValue ^ (stateValue >>> 15), 1 | stateValue);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}

function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash >>> 0;
}

function hmacSeed(seed, payload) {
  return fnv1a(`${seed}|${payload}`);
}

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
    hash >>>= 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function createAudioMixer() {
  let ctx = null;

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    ctx = new AudioCtor();
    return ctx;
  }

  function play(type) {
    const context = ensureContext();
    if (!context) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const freq = type === 'success' ? 880 : 240;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
  }

  function hint(intensity = 0.4) {
    const context = ensureContext();
    if (!context) {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.value = clamp(200 + intensity * 400, 200, 700);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.05 * clamp(intensity, 0.05, 1), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }

  return {
    play,
    hint
  };
}
