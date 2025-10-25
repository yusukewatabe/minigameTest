const DEFAULT_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const COLOR_MAP = {
  red: '#ff4d5a',
  blue: '#3b82f6',
  green: '#4ade80',
  yellow: '#facc15',
  purple: '#a855f7',
  orange: '#f97316',
  cyan: '#22d3ee',
  white: '#f1f5f9'
};

export function createWireGame(context) {
  document.getElementById('overlayCard')?.classList.add('hidden');
  document.getElementById('wireHidden')?.classList.add('hidden');
  const state = {
    controls: null,
    container: null,
    intro: null,
    board: null,
    orderEl: null,
    wires: [],
    sequence: [],
    index: 0,
    mistakes: 0,
    allowedMistakes: 0,
    rng: null,
    cleanup: []
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

  function updateOrder() {
    if (!state.orderEl) {
      return;
    }
    const nodes = state.orderEl.querySelectorAll('span');
    nodes.forEach((node, idx) => {
      node.classList.toggle('active', idx === state.index);
      node.classList.toggle('done', idx < state.index);
    });
  }

  function failCut(reason) {
    setStatus('SEQUENCE FAILED');
    if (state.controls && typeof state.controls.fail === 'function') {
      state.controls.fail({
        code: reason || 'wire_fail',
        mistakes: state.mistakes,
        progress: state.index
      });
    }
  }

  function complete() {
    setStatus('CIRCUIT DISABLED');
    if (state.controls && typeof state.controls.complete === 'function') {
      state.controls.complete({
        code: 'wire_clear',
        mistakes: state.mistakes,
        steps: state.sequence.length
      });
    }
  }

  function handleCut(wire) {
    if (wire.disabled) {
      return;
    }
    const expected = state.sequence[state.index];
    if (wire.dataset.color !== expected) {
      state.mistakes += 1;
      wire.classList.add('disabled');
      playHint(0.4);
      if (state.mistakes > state.allowedMistakes) {
        failCut('wire_lockout');
        return;
      }
      setStatus('INCORRECT WIRE - RECALIBRATE');
      updateOrder();
      playIntroAnimation();
      return;
    }
    wire.classList.add('disabled');
    state.index += 1;
    playHint(0.2);
    updateOrder();
    if (state.index >= state.sequence.length) {
      complete();
      return;
    }
    setStatus(`NEXT: ${state.sequence[state.index].toUpperCase()}`);
  }

  function buildOrder() {
    const order = document.createElement('div');
    order.className = 'wire-order';
    for (let i = 0; i < state.sequence.length; i += 1) {
      const span = document.createElement('span');
      span.className = 'wire-order-span';
      span.textContent = state.sequence[i].toUpperCase();
      order.appendChild(span);
    }
    state.orderEl = order;
    updateOrder();
    return order;
  }

  function buildBoard(colors) {
    const board = document.createElement('div');
    board.className = 'wire-board';
    state.wires = [];
    for (let i = 0; i < colors.length; i += 1) {
      const color = colors[i];
      const wire = document.createElement('button');
      wire.type = 'button';
      wire.className = 'wire-line';
      wire.style.setProperty('--wire-color', COLOR_MAP[color] || color);
      wire.dataset.color = color;
      board.appendChild(wire);
      state.wires.push(wire);
    }
    return board;
  }

  function playIntroAnimation() {
    if (!state.intro) {
      return;
    }
    state.intro.classList.remove('wire-intro-visible');
    void state.intro.offsetWidth;
    state.intro.classList.add('wire-intro-visible');
  }
  
  function bindBoard() {
    const onClick = (event) => {
      event.preventDefault();
      handleCut(event.currentTarget);
    };
    for (let i = 0; i < state.wires.length; i += 1) {
      const wire = state.wires[i];
      wire.addEventListener('pointerdown', onClick);
      state.cleanup.push(() => wire.removeEventListener('pointerdown', onClick));
    }
  }

  return {
    start(setup, controls) {
      state.controls = controls;
      const cfg = setup && setup.config ? setup.config : {};
      const palette = Array.isArray(cfg.colors) && cfg.colors.length > 0 ? cfg.colors.slice(0, 6) : DEFAULT_COLORS.slice(0, setup.difficulty >= 2 ? 6 : 5);
      state.allowedMistakes = cfg.allowedMistakes !== undefined ? Number(cfg.allowedMistakes) : setup.difficulty >= 2 ? 0 : 1;
      const sequenceLengthRaw = cfg.sequenceLength !== undefined ? Number(cfg.sequenceLength) : setup.difficulty >= 2 ? 5 : 4;
      const sequenceLength = Math.max(3, Math.min(palette.length, sequenceLengthRaw));
      const allowRepeat = cfg.unique === false;
      state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('wire');

      const available = palette.slice();
      state.sequence = [];
      for (let i = 0; i < sequenceLength; i += 1) {
        const pool = allowRepeat ? palette : available;
        const index = Math.floor(state.rng() * pool.length);
        const color = pool[index];
        state.sequence.push(color);
        if (!allowRepeat) {
          available.splice(index, 1);
        }
      }

      state.index = 0;
      state.mistakes = 0;

      const container = document.createElement('div');
      container.className = 'wire';

      const intro = document.createElement('div');
      intro.className = 'wire-intro';
      intro.textContent = 'CUT IN ORDER';

      const board = buildBoard(palette);
      const order = buildOrder();

      container.appendChild(intro);
      container.appendChild(board);
      container.appendChild(order);

      context.root.appendChild(container);
      state.container = container;
      state.board = board;

      bindBoard();
      updateOrder();
      playIntroAnimation();
      setStatus(`CUT: ${state.sequence[0].toUpperCase()}`);
      setFootnote('順番どおりにワイヤーをクリックしてください。"ESCキーでミニゲーム終了"');
    },
    stop() {
      // no animation to stop
    },
    destroy() {
      for (let i = 0; i < state.cleanup.length; i += 1) {
        try {
          state.cleanup[i]();
        } catch (err) {
          // ignore cleanup errors
        }
      }
      state.cleanup = [];
      if (state.container && state.container.parentElement) {
        state.container.parentElement.removeChild(state.container);
      }
      state.container = null;
      state.intro = null;
      state.board = null;
      state.orderEl = null;
      state.wires = [];
    }
  };
}
