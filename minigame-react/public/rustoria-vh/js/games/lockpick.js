const MIN_WIDTH = 0.08;
const MAX_WIDTH = 0.32;

export function createLockpickGame(context) {
  document.getElementById('overlayCard')?.classList.add('hidden');
  const state = {
    frame: null,
    pointerPos: 0,
    direction: 1,
    pointerEl: null,
    windowEl: null,
    trackEl: null,
    pins: [],
    targets: [],
    currentPin: 0,
    attemptCount: 0,
    active: false,
    rng: null,
    cleanup: [],
    controls: null,
    lastTick: 0,
    speed: 0.001
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setStatus(message) {
    if (state.controls && typeof state.controls.setStatus === 'function') {
      state.controls.setStatus(message);
    }
  }

  function setFootnote(message) {
    if (state.controls && typeof state.controls.setFootnote === 'function') {
      state.controls.setFootnote(message);
    }
  }

  function playHint(intensity) {
    if (state.controls && typeof state.controls.playHint === 'function') {
      state.controls.playHint(intensity);
    }
  }

  function updateActivePin(index) {
    for (let i = 0; i < state.pins.length; i += 1) {
      state.pins[i].classList.toggle('active', i === index);
    }
    const target = state.targets[index];
    if (target && state.windowEl) {
      state.windowEl.style.left = `${(target.start * 100).toFixed(2)}%`;
      state.windowEl.style.width = `${((target.end - target.start) * 100).toFixed(2)}%`;
    }
    const total = state.targets.length;
    setStatus(`PIN ${index + 1} / ${total}`);
  }

  function markPinCleared(index) {
    const pin = state.pins[index];
    if (pin) {
      pin.classList.remove('active');
      pin.classList.add('cleared');
    }
  }

  function onAttempt() {
    if (!state.active) {
      return;
    }
    state.attemptCount += 1;
    const target = state.targets[state.currentPin];
    const inWindow = state.pointerPos >= target.start && state.pointerPos <= target.end;
    if (inWindow) {
      markPinCleared(state.currentPin);
      state.currentPin += 1;
      if (state.currentPin >= state.targets.length) {
        state.active = false;
        setStatus('CYLINDER UNLOCKED');
        if (state.controls && typeof state.controls.complete === 'function') {
          state.controls.complete({
            code: 'lockpick_clear',
            attempts: state.attemptCount,
            pins: state.targets.length
          });
        }
        return;
      }
      updateActivePin(state.currentPin);
    } else {
      setStatus('PIN MISSED - RESETTING');
      playHint(0.25);
      state.pointerPos = clamp(state.pointerPos + (state.direction > 0 ? -0.12 : 0.12), 0, 1);
      state.direction *= -1;
    }
  }

  function animate(now) {
    if (!state.active) {
      return;
    }
    if (!state.lastTick) {
      state.lastTick = now;
    }
    const delta = now - state.lastTick;
    state.lastTick = now;
    state.pointerPos += delta * state.speed * state.direction;
    if (state.pointerPos >= 1) {
      state.pointerPos = 1;
      state.direction = -1;
    } else if (state.pointerPos <= 0) {
      state.pointerPos = 0;
      state.direction = 1;
    }
    if (state.pointerEl) {
      state.pointerEl.style.left = `${(state.pointerPos * 100).toFixed(2)}%`;
    }
    state.frame = context.requestFrame(animate);
  }

  function stopAnimation() {
    if (state.frame) {
      context.cancelFrame(state.frame);
      state.frame = null;
    }
    state.lastTick = 0;
  }

  function mount(pinCount, windowWidth) {
    const container = document.createElement('div');
    container.className = 'lockpick';

    const pinsWrap = document.createElement('div');
    pinsWrap.className = 'lockpick-pins';
    state.pins = [];
    for (let i = 0; i < pinCount; i += 1) {
      const pin = document.createElement('div');
      pin.className = 'lockpick-pin';
      pinsWrap.appendChild(pin);
      state.pins.push(pin);
    }

    const track = document.createElement('div');
    track.className = 'lockpick-track';

    const windowEl = document.createElement('div');
    windowEl.className = 'lockpick-window';
    windowEl.style.width = `${(windowWidth * 100).toFixed(2)}%`;

    const pointer = document.createElement('div');
    pointer.className = 'lockpick-pointer';

    track.appendChild(windowEl);
    track.appendChild(pointer);

    const helper = document.createElement('div');
    helper.className = 'lockpick-helper';
    helper.textContent = 'SPACE / CLICK TO SET PIN';

    container.appendChild(pinsWrap);
    container.appendChild(track);
    container.appendChild(helper);

    context.root.appendChild(container);
    state.pointerEl = pointer;
    state.windowEl = windowEl;
    state.trackEl = track;

    const attemptHandler = (event) => {
      event.preventDefault();
      onAttempt();
    };
    track.addEventListener('pointerdown', attemptHandler);
    state.cleanup.push(() => track.removeEventListener('pointerdown', attemptHandler));
  }

  function resetTargets(pinCount, windowWidth) {
    state.targets = [];
    const spacing = 1 - windowWidth;
    for (let i = 0; i < pinCount; i += 1) {
      let start = state.rng() * spacing;
      start = clamp(start, 0.04, spacing);
      const end = clamp(start + windowWidth, windowWidth, 1);
      state.targets.push({ start, end });
    }
  }

  return {
    start(setup, controls) {
      state.controls = controls;
      const cfg = setup && setup.config ? setup.config : {};
      const pinCount = clamp(Math.round(cfg.pinCount !== undefined ? cfg.pinCount : (setup.difficulty >= 2 ? 6 : 4)), 3, 8);
      const windowWidth = clamp(Number(cfg.windowWidth !== undefined ? cfg.windowWidth : (setup.difficulty >= 2 ? 0.16 : 0.22)), MIN_WIDTH, MAX_WIDTH);
      state.speed = setup.difficulty >= 2 ? 0.0012 : 0.0009;
      mount(pinCount, windowWidth);
      const keyRelease = controls.registerKeyDown((event) => {
        if (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault();
          onAttempt();
        }
      });
      state.cleanup.push(keyRelease);

      state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('lockpick');
      state.pointerPos = clamp(state.rng(), 0, 1);
      state.direction = state.pointerPos > 0.5 ? -1 : 1;
      resetTargets(pinCount, windowWidth);
      state.currentPin = 0;
      state.attemptCount = 0;
      state.active = true;
      updateActivePin(0);
      setFootnote('SPACE または クリックでピンを固定。"ESCキーでミニゲーム終了"');
      stopAnimation();
      state.frame = context.requestFrame(animate);
    },
    stop() {
      state.active = false;
      stopAnimation();
    },
    destroy() {
      this.stop();
      for (let i = 0; i < state.cleanup.length; i += 1) {
        try {
          state.cleanup[i]();
        } catch (err) {
          // ignore cleanup failures
        }
      }
      state.cleanup = [];
      if (context.root) {
        context.root.innerHTML = '';
      }
    }
  };
}
