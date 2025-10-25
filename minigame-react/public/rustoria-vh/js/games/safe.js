export function createSafeGame(context) {
  document.getElementById('overlayCard')?.classList.add('hidden');

  const PRESETS = {
    1: { stepCount: 3, stepSizeDeg: 4, bandWidth: 8, tolerance: 6, speed: 150 },
    2: { stepCount: 4, stepSizeDeg: 3.5, bandWidth: 6, tolerance: 5, speed: 180 },
    3: { stepCount: 5, stepSizeDeg: 3, bandWidth: 5, tolerance: 4, speed: 210 }
  };

  const state = {
    controls: null,
    container: null,
    dial: null,
    pointer: null,
    pointerNeedle: null,
    pointerTip: null,
    progressDots: [],
    steps: [],
    currentStep: 0,
    rawAngle: 0,
    angle: 0,
    stepSizeDeg: 4,
    bandWidth: 8,
    tolerance: 6,
    speed: 150,
    lastDirection: null,
    inputs: { left: false, right: false },
    frame: null,
    lastTick: 0,
    inBand: false,
    hintReady: true,
    tickPlayer: null,
    confirmAngles: [],
    cleanup: [],
    rng: null,
    bandEnteredAt: 0,
    lastStepTick: 0
  };

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

  function createTickPlayer() {
    let ctx = null;
    return () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return;
      }
      const now = performance.now();
      if (now - state.lastStepTick < 60) {
        return;
      }
      state.lastStepTick = now;
      if (!ctx) {
        try {
          ctx = new AudioContext();
        } catch (err) {
          ctx = null;
          return;
        }
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(420, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(t);
      oscillator.stop(t + 0.14);
    };
  }

  function normalizeAngle(value) {
    let result = value % 360;
    if (result < 0) {
      result += 360;
    }
    return result;
  }

  function dialValue() {
    const normalized = normalizeAngle(state.angle);
    return Math.round((100 - normalized / 3.6 + 1000) % 100);
  }

  function updatePointer() {
    if (!state.pointer || !state.dial) {
      return;
    }
    const dialRect = state.dial.getBoundingClientRect();
    if (!dialRect.width) {
      return;
    }
    const innerRadius = (dialRect.width * 0.64) / 2;
    const pointerMargin = 10;
    const radius = Math.max(24, innerRadius - pointerMargin);
    state.pointer.style.setProperty('--pointer-angle', `${(state.angle * Math.PI) / 180}rad`);
    state.pointer.style.setProperty('--pointer-radius', `${radius}px`);
    if (state.pointerNeedle) {
      state.pointerNeedle.style.width = `${radius}px`;
    }
  }

  function updateProgress() {
    for (let i = 0; i < state.progressDots.length; i += 1) {
      const dot = state.progressDots[i];
      if (!dot) {
        continue;
      }
      dot.classList.toggle('done', i < state.currentStep);
      dot.classList.toggle('active', i === state.currentStep);
    }
  }

  function setPointerVibrating(active) {
    if (!state.pointer) {
      return;
    }
    state.pointer.classList.toggle('safe-pointer-vibrating', active);
  }

  function describeStep(step) {
    return `STEP ${state.currentStep + 1}/${state.steps.length}: TURN ${step.direction.toUpperCase()} TO ${String(step.value).padStart(2, '0')}`;
  }

  function updateBandState(inBand) {
    if (state.inBand === inBand) {
      return;
    }
    state.inBand = inBand;
    setPointerVibrating(inBand);
    if (inBand) {
      state.bandEnteredAt = performance.now();
      playHint(0.12);
    }
  }

  function confirmCurrentStep() {
    const step = state.steps[state.currentStep];
    if (!step || !state.inBand) {
      return;
    }
    if (state.lastDirection !== step.direction) {
      return;
    }
    const normalized = normalizeAngle(state.angle);
    state.confirmAngles.push({
      index: state.currentStep + 1,
      angle: normalized
    });
    state.currentStep += 1;
    updateProgress();
    updateBandState(false);
    if (state.currentStep >= state.steps.length) {
      setStatus('SAFE CRACKED');
      if (state.controls && typeof state.controls.complete === 'function') {
        state.controls.complete({
          code: 'safe_clear',
          bandWidth: state.bandWidth,
          angle: normalized.toFixed(2),
          steps: state.steps.length
        });
      }
    } else {
      const next = state.steps[state.currentStep];
      setStatus(describeStep(next));
    }
  }

  function updateRotation(delta) {
    let direction = 0;
    if (state.inputs.left) {
      direction -= 1;
    }
    if (state.inputs.right) {
      direction += 1;
    }
    if (direction === 0) {
      return;
    }
    state.lastDirection = direction < 0 ? 'left' : 'right';
    state.rawAngle += (direction * state.speed * delta) / 1000;
    if (state.rawAngle > 1440 || state.rawAngle < -1440) {
      state.rawAngle = normalizeAngle(state.rawAngle);
    }
    const stepped = Math.round(state.rawAngle / state.stepSizeDeg) * state.stepSizeDeg;
    if (stepped !== state.angle) {
      state.angle = stepped;
      if (state.tickPlayer) {
        state.tickPlayer();
      }
      updatePointer();
    }
  }

  function evaluateStep() {
    const step = state.steps[state.currentStep];
    if (!step) {
      return;
    }
    const value = dialValue();
    const diff = Math.abs(value - step.value);
    const distance = Math.min(diff, 100 - diff);
    const inDirection = state.lastDirection === step.direction;
    const inWindow = distance <= state.bandWidth && inDirection;
    updateBandState(inWindow);
    if (distance <= state.tolerance && inDirection) {
      playHint(0.08);
    }
  }

  function animate(now) {
    if (!state.frame) {
      state.lastTick = now;
    }
    const delta = now - state.lastTick;
    state.lastTick = now;
    updateRotation(delta);
    evaluateStep();
    state.frame = context.requestFrame(animate);
  }

  function buildUI(stepCount) {
    const container = document.createElement('div');
    container.className = 'safe';

    const dial = document.createElement('div');
    dial.className = 'safe-dial';

    const pointer = document.createElement('div');
    pointer.className = 'safe-pointer';

    const pointerNeedle = document.createElement('div');
    pointerNeedle.className = 'safe-pointer-needle';
    const pointerTip = document.createElement('div');
    pointerTip.className = 'safe-pointer-tip';
    pointer.appendChild(pointerNeedle);
    pointer.appendChild(pointerTip);
    dial.appendChild(pointer);

    const instructions = document.createElement('div');
    instructions.className = 'safe-instructions';
    instructions.textContent = 'ALIGN THE RINGS';

    const progress = document.createElement('div');
    progress.className = 'safe-progress';
    state.progressDots = [];
    for (let i = 0; i < stepCount; i += 1) {
      const dot = document.createElement('div');
      dot.className = 'safe-step';
      progress.appendChild(dot);
      state.progressDots.push(dot);
    }

    container.appendChild(dial);
    container.appendChild(instructions);
    container.appendChild(progress);

    context.root.appendChild(container);
    state.container = container;
    state.dial = dial;
    state.pointer = pointer;
    state.pointerNeedle = pointerNeedle;
    state.pointerTip = pointerTip;
  }

  function generateSteps(count, rng) {
    const steps = [];
    let direction = 'left';
    for (let i = 0; i < count; i += 1) {
      const value = Math.floor(rng() * 100);
      steps.push({ value, direction });
      direction = direction === 'left' ? 'right' : 'left';
    }
    return steps;
  }

  function handleKeyDown(event) {
    if (event.repeat) {
      return;
    }
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      event.preventDefault();
      state.inputs.left = true;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      event.preventDefault();
      state.inputs.right = true;
    }
    if (key === ' ' || key === 'Spacebar' || key === 'Space') {
      event.preventDefault();
      confirmCurrentStep();
    }
  }

  function handleKeyUp(event) {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      state.inputs.left = false;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      state.inputs.right = false;
    }
  }

  return {
    start(setup, controls) {
      state.controls = controls;
      const difficulty = Math.max(1, Math.min(3, Number(setup && setup.difficulty) || 1));
      const preset = PRESETS[difficulty] || PRESETS[1];
      state.stepSizeDeg = preset.stepSizeDeg;
      state.bandWidth = preset.bandWidth;
      state.tolerance = preset.tolerance;
      state.speed = preset.speed;
      state.tickPlayer = createTickPlayer();
      state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('safe');
      state.steps = generateSteps(preset.stepCount, state.rng);
      state.currentStep = 0;
      state.rawAngle = 0;
      state.angle = 0;
      state.lastDirection = null;
      state.inputs.left = false;
      state.inputs.right = false;
      state.confirmAngles = [];
      state.inBand = false;
      state.hintReady = true;

      buildUI(state.steps.length);
      updatePointer();
      updateProgress();
      setStatus(describeStep(state.steps[state.currentStep]));
      setFootnote('A/D or arrow keys rotate. Space confirms. ESC cancels.');

      const keyDownRelease = controls.registerKeyDown(handleKeyDown);
      const keyUpRelease = controls.registerKeyUp(handleKeyUp);
      state.cleanup.push(keyDownRelease, keyUpRelease);

      if (state.frame) {
        context.cancelFrame(state.frame);
      }
      state.frame = context.requestFrame(animate);
    },
    stop() {
      if (state.frame) {
        context.cancelFrame(state.frame);
        state.frame = null;
      }
      state.inputs.left = false;
      state.inputs.right = false;
      state.inBand = false;
      setPointerVibrating(false);
    },
    destroy() {
      this.stop();
      if (state.container && state.container.parentElement) {
        state.container.parentElement.removeChild(state.container);
      }
      state.container = null;
      state.dial = null;
      state.pointer = null;
      state.pointerNeedle = null;
      state.pointerTip = null;
      state.progressDots = [];
      for (let i = 0; i < state.cleanup.length; i += 1) {
        try {
          state.cleanup[i]();
        } catch (err) {
          // ignore cleanup issues
        }
      }
      state.cleanup = [];
    }
  };
}