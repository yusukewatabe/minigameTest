const LAYOUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'];

export function createKeypadGame(context) {
  document.getElementById('overlayCard')?.classList.add('hidden');
  const state = {
    controls: null,
    container: null,
    displayValue: null,
    statusLabel: null,
    buttons: new Map(),
    code: [],
    entered: [],
    mode: 'code',
    accepting: false,
    mistakes: 0,
    allowedMistakes: 1,
    rng: null,
    cleanup: [],
    timers: [],
    previewEnabled: true
  };

  function clearTimers() {
    for (let i = 0; i < state.timers.length; i += 1) {
      clearTimeout(state.timers[i]);
    }
    state.timers = [];
  }

  function schedule(fn, delay) {
    const id = setTimeout(fn, delay);
    state.timers.push(id);
    return id;
  }
  function normalizeDigits(source) {
    if (!source) {
      return null;
    }
    const parts = Array.isArray(source) ? source : String(source).split('');
    const digits = [];
    for (let i = 0; i < parts.length; i += 1) {
      const value = String(parts[i]).trim();
      if (/^[0-9]$/.test(value)) {
        digits.push(value);
      }
    }
    return digits.length >= 3 ? digits : null;
  }

  function deriveServerCode(config, setup) {
    if (!config) {
      return normalizeDigits(setup && setup.code);
    }
    const attempt =
      normalizeDigits(config.serverCode) ||
      normalizeDigits(config.code) ||
      normalizeDigits(config.digits) ||
      normalizeDigits(config.sequence) ||
      normalizeDigits(setup && setup.code);
    return attempt;
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

  function flashDisplay(className) {
    if (!state.displayValue) {
      return;
    }
    state.displayValue.classList.add(className);
    schedule(() => state.displayValue.classList.remove(className), 180);
  }

  function updateDisplay() {
    if (!state.displayValue) {
      return;
    }
    const total = state.code.length;
    const fragments = [];
    for (let i = 0; i < total; i += 1) {
      if (state.entered[i]) {
        fragments.push(state.entered[i]);
      } else {
        fragments.push('?');
      }
    }
    state.displayValue.textContent = fragments.join(' ');
    if (state.statusLabel) {
      state.statusLabel.textContent = `${state.mode === 'memory' ? 'REPEAT' : 'ENTER'} ${state.entered.length}/${total}`;
    }
  }

  function highlightButton(value, active) {
    const btn = state.buttons.get(value);
    if (btn) {
      btn.classList.toggle('active', active);
    }
  }

  function evaluate() {
    const success = state.entered.join(') === state.code.join(');
    if (success) {
      setStatus('ACCESS ACCEPTED');
      if (state.controls && typeof state.controls.complete === 'function') {
        state.controls.complete({
          code: 'keypad_clear',
          length: state.code.length,
          mistakes: state.mistakes
        });
      }
      state.accepting = false;
      return;
    }
    state.mistakes += 1;
    flashDisplay('text-danger');
    playHint(0.35);
    if (state.mistakes > state.allowedMistakes) {
      setStatus('LOCKED OUT');
      if (state.controls && typeof state.controls.fail === 'function') {
        state.controls.fail({
          code: 'keypad_lockout',
          mistakes: state.mistakes
        });
      }
      state.accepting = false;
      return;
    }
    setStatus('INCORRECT - RESET');
    state.entered = [];
    schedule(() => {
      updateDisplay();
      setStatus('TRY AGAIN');
    }, 220);
  }

  function handleInput(symbol) {
    if (!state.accepting && symbol !== 'CLR' && symbol !== 'DEL') {
      return;
    }
    if (symbol === 'CLR') {
      state.entered = [];
      updateDisplay();
      return;
    }
    if (symbol === 'DEL') {
      state.entered.pop();
      updateDisplay();
      return;
    }
    if (state.entered.length >= state.code.length) {
      return;
    }
    state.entered.push(symbol);
    updateDisplay();
    if (state.entered.length === state.code.length) {
      evaluate();
    }
  }

  function playPreview(index) {
    if (!state.previewEnabled) {
      state.accepting = true;
      updateDisplay();
      setStatus('ENTER THE CODE');
      return;
    }
    if (state.mode !== 'memory') {
      state.accepting = true;
      updateDisplay();
      setStatus('ENTER SEQUENCE');
      return;
    }
    state.accepting = false;
    if (index >= state.code.length) {
      schedule(() => {
        setStatus('REPEAT PATTERN');
        state.entered = [];
        updateDisplay();
        state.accepting = true;
      }, 240);
      return;
    }
    const symbol = state.code[index];
    highlightButton(symbol, true);
    schedule(() => {
      highlightButton(symbol, false);
      playPreview(index + 1);
    }, 420);
  }

  function generateSequence(length) {
    const sequence = [];
    for (let i = 0; i < length; i += 1) {
      const digit = Math.floor(state.rng() * 10);
      sequence.push(String(digit));
    }
    return sequence;
  }

  function bindButtons() {
    const onClick = (event) => {
      const value = event.currentTarget.getAttribute('data-key');
      handleInput(value);
    };
    state.buttons.forEach((button) => {
      button.addEventListener('pointerdown', onClick);
      state.cleanup.push(() => button.removeEventListener('pointerdown', onClick));
    });
  }

  function buildUI() {
    const container = document.createElement('div');
    container.className = 'keypad';

    const display = document.createElement('div');
    display.className = 'keypad-display';

    const value = document.createElement('span');
    value.textContent = '';
    display.appendChild(value);

    const status = document.createElement('div');
    status.className = 'keypad-status';
    status.textContent = 'READY';
    display.appendChild(status);

    const grid = document.createElement('div');
    grid.className = 'keypad-grid';

    state.buttons = new Map();
    for (let i = 0; i < LAYOUT.length; i += 1) {
      const key = LAYOUT[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'keypad-key';
      button.setAttribute('data-key', key);
      button.textContent = key;
      grid.appendChild(button);
      state.buttons.set(key, button);
    }

    container.appendChild(display);
    container.appendChild(grid);

    context.root.appendChild(container);
    state.container = container;
    state.displayValue = value;
    state.statusLabel = status;
    bindButtons();
  }

  return {
    start(setup, controls) {
      state.controls = controls;
      const cfg = setup && setup.config ? setup.config : {};
      state.mode = cfg.mode ? String(cfg.mode) : setup.difficulty >= 2 ? 'memory' : 'code';
      state.allowedMistakes = cfg.allowedMistakes !== undefined ? Number(cfg.allowedMistakes) : setup.difficulty >= 2 ? 1 : 2;
      const sequenceLength = cfg.sequenceLength !== undefined ? Number(cfg.sequenceLength) : setup.difficulty >= 2 ? 6 : 4;
      buildUI();
      const keyRelease = controls.registerKeyDown((event) => {
        if (event.key >= '0' && event.key <= '9') {
          handleInput(event.key);
          event.preventDefault();
        } else if (event.key === 'Backspace') {
          handleInput('DEL');
          event.preventDefault();
        } else if (event.key === 'Delete') {
          handleInput('CLR');
          event.preventDefault();
        }
      });
      state.cleanup.push(keyRelease);

      const providedCode = deriveServerCode(cfg, setup);
      const desiredLength = cfg.sequenceLength !== undefined ? Number(cfg.sequenceLength) : setup.difficulty >= 2 ? 6 : 4;
      const normalizedLength = Math.max(3, Math.min(8, Math.floor(desiredLength || 4)));
      if (providedCode) {
        const trimmed = providedCode.slice(0, Math.min(8, Math.max(3, providedCode.length)));
        state.code = trimmed;
      } else {
        state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('keypad');
        state.code = generateSequence(normalizedLength);
      }
      state.previewEnabled = state.mode === 'memory' && cfg.preview !== false && state.code.length > 0;
      if (state.mode !== 'memory') {
        state.previewEnabled = false;
      }
      state.entered = [];
      state.mistakes = 0;
      clearTimers();
      updateDisplay();
      setStatus(state.previewEnabled ? 'WATCH THE PATTERN' : 'ENTER THE CODE');
      setFootnote('Use keypad buttons or number keys. ESC closes.');
      if (state.previewEnabled) {
        playPreview(0);
      } else {
        state.accepting = true;
      }
    }
  }
}