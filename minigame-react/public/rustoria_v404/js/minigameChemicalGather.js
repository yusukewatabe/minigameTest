const KEYS = ['W', 'A', 'S', 'D'];
const KEY_LABELS = {
    W: 'W',
    A: 'A',
    S: 'S',
    D: 'D'
};

const clampLevel = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 1;
    const level = Math.floor(parsed);
    if (level < 1) return 1;
    if (level > 10) return 10;
    return level;
};

const createSequence = (length) => Array.from({ length }, () => KEYS[Math.floor(Math.random() * KEYS.length)]);

export function createChemicalGatherGame(ctx) {
    const data = (ctx && ctx.data) || {};
    const level = clampLevel(data.level ?? 1);
    const sequenceLength = Math.min(2 + level, 12);
    const sequence = createSequence(sequenceLength);
    const instruction = data.instruction || 'Follow the prompts to siphon chemicals.';

    const container = document.createElement('div');
    container.innerHTML = `
        <h1></h1>
        <p class="description"></p>
        <div class="sequence-track"></div>
        <div class="sequence-progress"><div class="fill"></div></div>
        <div class="feedback"></div>
        <div class="meta">Level </div>
    `;

    const track = container.querySelector('.sequence-track');
    const feedback = container.querySelector('.feedback');
    const progressFill = container.querySelector('.sequence-progress .fill');

    sequence.forEach((key) => {
        const item = document.createElement('div');
        item.className = 'sequence-item';
        item.dataset.key = key;
        item.innerHTML = `
            <span class="sequence-key"></span>
            <span class="sequence-shadow"></span>
        `;
        track.appendChild(item);
    });

    ctx.root.appendChild(container);

    const keyElements = Array.from(track.children);
    let cursor = 0;
    let fails = 0;
    let active = true;

    const updateProgress = () => {
        const percent = Math.min(100, Math.max(0, (cursor / sequence.length) * 100));
        progressFill.style.width = `${percent}%`;
    };

    const refreshState = () => {
        keyElements.forEach((el, index) => {
            el.classList.toggle('active', index === cursor);
            el.classList.toggle('completed', index < cursor);
        });
        feedback.textContent = `${cursor}/`;
        updateProgress();
    };

    refreshState();

    const conclude = (success, reason) => {
        if (!active) return;
        active = false;
        if (success) {
            ctx.complete({ fails, level, result: 'success' });
        } else {
            ctx.cancel({ fails, level, reason });
        }
    };

    const api = {
        destroy() {
            active = false;
        },
        escape() {
            conclude(false, 'cancelled');
        },
        getFails() {
            return fails;
        },
        onKey(event) {
            if (!active || !event.key) return;
            const key = event.key.toUpperCase();
            if (!KEYS.includes(key)) {
                return;
            }

            if (key === sequence[cursor]) {
                cursor += 1;
                if (cursor >= sequence.length) {
                    conclude(true);
                    return;
                }
                refreshState();
            } else {
                fails += 1;
                feedback.textContent = 'Wrong key!';
                keyElements[cursor].classList.add('shake');
                setTimeout(() => keyElements[cursor].classList.remove('shake'), 220);
            }
        }
    };

    return api;
}


