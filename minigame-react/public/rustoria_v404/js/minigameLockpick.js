const clampDifficulty = (value) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return 1;
    const level = Math.floor(parsed);
    if (level < 1) return 1;
    if (level > 10) return 10;
    return level;
};

const ACCEPT_KEYS = [' ', 'SPACE', 'E', 'ENTER'];

export function createLockpickGame(ctx) {
    const data = (ctx && ctx.data) || {};
    const difficulty = clampDifficulty(data.difficulty !== undefined ? data.difficulty : 1);
    const rounds = Math.min(3 + Math.floor(difficulty / 2), 5);
    const speed = 0.45 + difficulty * 0.08;
    const roundTime = 8500 - difficulty * 400;

    const title = data.title || 'Catalyst Alignment';
    const instruction = data.instruction || 'Stabilise the mixture by timing the catalyst release.';
    const hint = data.hint || 'Press SPACE (or E) to stabilise';
    const roundLabel = data.roundLabel || 'Round %{current} / %{total}';
    const successLabel = data.successLabel || 'Stabilised!';
    const failureLabel = data.failureLabel || 'Mixture destabilised!';

    const container = document.createElement('div');
    container.innerHTML = `
        <h1></h1>
        <p class="description"></p>
        <div class="reactor-gauge">
            <div class="reactor-background"></div>
            <div class="reactor-safe-zone"></div>
            <div class="reactor-pointer"></div>
        </div>
        <div class="reactor-feedback"></div>
        <div class="reactor-meta"></div>
    `;

    const safeZone = container.querySelector('.reactor-safe-zone');
    const pointer = container.querySelector('.reactor-pointer');
    const feedback = container.querySelector('.reactor-feedback');
    const meta = container.querySelector('.reactor-meta');

    ctx.root.appendChild(container);

    let frameId;
    let timerId;
    let active = true;
    let round = 1;
    let fails = 0;
    let position = Math.random();
    let direction = Math.random() > 0.5 ? 1 : -1;
    let safeStart = 0.35;
    let safeEnd = 0.65;
    let lastTime = performance.now();

    const updateMeta = () => {
        const text = roundLabel.replace('%{current}', round).replace('%{total}', rounds);
        meta.textContent = text;
    };

    const setSafeZone = () => {
        const baseWidth = 0.22 - difficulty * 0.015;
        const width = Math.max(0.09, Math.min(0.3, baseWidth + (Math.random() * 0.05 - 0.015)));
        safeStart = Math.random() * (1 - width);
        safeEnd = safeStart + width;
        safeZone.style.left = `${safeStart * 100}%`;
        safeZone.style.width = `${width * 100}%`;
    };

    const stopAnimation = () => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = undefined;
    };

    const stopTimer = () => {
        if (timerId) clearTimeout(timerId);
        timerId = undefined;
    };

    const finish = (success) => {
        stopAnimation();
        stopTimer();
        active = false;
        if (success) {
            ctx.complete({ fails, success: true });
        } else {
            ctx.cancel({ fails, reason: 'failed' });
        }
    };

    const handleFailure = () => {
        fails += 1;
        feedback.textContent = failureLabel;
        pointer.classList.add('reactor-pointer--fail');
        setTimeout(() => finish(false), 450);
    };

    const startRound = () => {
        if (!active) return;
        updateMeta();
        feedback.textContent = hint;
        pointer.classList.remove('reactor-pointer--success', 'reactor-pointer--fail');
        position = Math.random();
        direction = Math.random() > 0.5 ? 1 : -1;
        setSafeZone();
        pointer.style.left = `${position * 100}%`;
        lastTime = performance.now();
        stopAnimation();
        stopTimer();
        timerId = setTimeout(() => {
            if (active) handleFailure();
        }, roundTime);
        const animate = (time) => {
            if (!active) return;
            const delta = (time - lastTime) / 1000;
            lastTime = time;
            position += direction * delta * speed;
            if (position <= 0) {
                position = 0;
                direction = 1;
            } else if (position >= 1) {
                position = 1;
                direction = -1;
            }
            pointer.style.left = `${position * 100}%`;
            frameId = requestAnimationFrame(animate);
        };
        frameId = requestAnimationFrame(animate);
    };

    const handleSuccess = () => {
        feedback.textContent = successLabel;
        pointer.classList.add('reactor-pointer--success');
        stopAnimation();
        stopTimer();
        round += 1;
        if (round > rounds) {
            setTimeout(() => finish(true), 250);
            return;
        }
        setTimeout(startRound, 450);
    };

    const api = {
        destroy() {
            active = false;
            stopAnimation();
            stopTimer();
        },
        escape() {
            if (!active) return;
            active = false;
            stopAnimation();
            stopTimer();
            ctx.cancel({ fails, reason: 'cancelled' });
        },
        onKey(event) {
            if (!active || !event.key) return;
            const key = event.key.toUpperCase();
            if (!ACCEPT_KEYS.includes(key)) return;
            if (position >= safeStart && position <= safeEnd) {
                handleSuccess();
            } else {
                handleFailure();
            }
        }
    };

    startRound();

    return api;
}
