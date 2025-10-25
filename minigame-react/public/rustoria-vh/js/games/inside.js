export function createInsideGame(context) {
    document.getElementById('overlayCard')?.classList.add('hidden');
    const PRESETS = {
        1: { duration: 6200, spawnInterval: 920, playerSpeed: 260, obstacleSpeed: [160, 200], obstacleSize: [70, 110], obstacleHeight: [36, 48], maxObstacles: 5 },
        2: { duration: 7600, spawnInterval: 780, playerSpeed: 285, obstacleSpeed: [185, 225], obstacleSize: [60, 100], obstacleHeight: [40, 54], maxObstacles: 6 },
        3: { duration: 8900, spawnInterval: 660, playerSpeed: 305, obstacleSpeed: [205, 250], obstacleSize: [52, 92], obstacleHeight: [44, 58], maxObstacles: 7 },
        4: { duration: 9800, spawnInterval: 600, playerSpeed: 330, obstacleSpeed: [220, 270], obstacleSize: [48, 84], obstacleHeight: [48, 62], maxObstacles: 7 }
    };

    const state = {
        controls: null,
        container: null,
        hud: null,
        progressFill: null,
        attemptLabel: null,
        message: null,
        arena: null,
        player: null,
        obstaclesLayer: null,
        frame: null,
        running: false,
        finalized: false,
        attempt: 0,
        attemptHits: 0,
        lastStart: 0,
        lastFrame: 0,
        elapsed: 0,
        lastSpawn: 0,
        retryHandle: null,
        bounds: { width: 0, height: 0 },
        pointerActive: false,
        pointerId: null,
        playerX: 0,
        playerRadius: 18,
        inputs: { left: false, right: false },
        rng: null,
        preset: PRESETS[1],
        obstacles: [],
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

    function clearFrame() {
        if (state.frame) {
            context.cancelFrame(state.frame);
            state.frame = null;
        }
    }

    function clearRetry() {
        if (state.retryHandle) {
            clearTimeout(state.retryHandle);
            state.retryHandle = null;
        }
    }

    function buildUI() {
        const container = document.createElement('div');
        container.className = 'inside inside-avoider';

        const hud = document.createElement('div');
        hud.className = 'inside-hud';

        const attemptLabel = document.createElement('div');
        attemptLabel.className = 'inside-hud-attempt';
        attemptLabel.textContent = 'Attempt 0';

        const progressBar = document.createElement('div');
        progressBar.className = 'inside-progress-bar';
        const progressFill = document.createElement('div');
        progressFill.className = 'inside-progress-fill';
        progressBar.appendChild(progressFill);

        hud.appendChild(attemptLabel);
        hud.appendChild(progressBar);

        const message = document.createElement('div');
        message.className = 'inside-message hidden';

        const arena = document.createElement('div');
        arena.className = 'inside-arena';

        const obstaclesLayer = document.createElement('div');
        obstaclesLayer.className = 'inside-obstacles';
        arena.appendChild(obstaclesLayer);

        const player = document.createElement('div');
        player.className = 'inside-player';
        arena.appendChild(player);

        container.appendChild(hud);
        container.appendChild(arena);
        container.appendChild(message);

        context.root.appendChild(container);
        state.container = container;
        state.hud = hud;
        state.progressFill = progressFill;
        state.attemptLabel = attemptLabel;
        state.message = message;
        state.arena = arena;
        state.player = player;
        state.obstaclesLayer = obstaclesLayer;

        bindPointer();
        measureBounds();
        updatePlayerVisual();
    }

    function bindPointer() {
        if (!state.arena) {
            return;
        }
        const onPointerMove = (event) => {
            if (!state.arena) {
                return;
            }
            if (!state.running && !state.pointerActive) {
                return;
            }
            moveToPointer(event);
        };
        const onPointerDown = (event) => {
            state.pointerActive = true;
            state.pointerId = event.pointerId;
            moveToPointer(event);
            try {
                state.arena.setPointerCapture(event.pointerId);
            } catch (err) {
                // ignore capture issues
            }
        };
        const onPointerUp = (event) => {
            if (state.pointerId === event.pointerId) {
                state.pointerActive = false;
                state.pointerId = null;
                try {
                    state.arena.releasePointerCapture(event.pointerId);
                } catch (err) {
                    // ignore capture issues
                }
            }
        };
        const onPointerLeave = () => {
            state.pointerActive = false;
            state.pointerId = null;
        };
        state.arena.addEventListener('pointermove', onPointerMove);
        state.arena.addEventListener('pointerdown', onPointerDown);
        state.arena.addEventListener('pointerup', onPointerUp);
        state.arena.addEventListener('pointercancel', onPointerUp);
        state.arena.addEventListener('pointerleave', onPointerLeave);
        state.cleanup.push(() => state.arena.removeEventListener('pointermove', onPointerMove));
        state.cleanup.push(() => state.arena.removeEventListener('pointerdown', onPointerDown));
        state.cleanup.push(() => state.arena.removeEventListener('pointerup', onPointerUp));
        state.cleanup.push(() => state.arena.removeEventListener('pointercancel', onPointerUp));
        state.cleanup.push(() => state.arena.removeEventListener('pointerleave', onPointerLeave));
    }

    function measureBounds() {
        if (!state.arena) {
            return;
        }
        const rect = state.arena.getBoundingClientRect();
        state.bounds.width = rect.width;
        state.bounds.height = rect.height;
        state.playerX = rect.width / 2;
    }

    function moveToPointer(event) {
        if (!state.arena) {
            return;
        }
        const rect = state.arena.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const clamped = Math.max(state.playerRadius + 4, Math.min(rect.width - state.playerRadius - 4, x));
        state.playerX = clamped;
        updatePlayerVisual();
    }

    function updatePlayerVisual() {
        if (!state.player) {
            return;
        }
        state.player.style.transform = `translateX(${state.playerX}px)`;
    }

    function updateProgress(now) {
        if (!state.progressFill || !state.preset) {
            return;
        }
        const elapsed = Math.max(0, now - state.lastStart);
        const ratio = Math.min(1, elapsed / state.preset.duration);
        state.progressFill.style.transform = `scaleX(${ratio})`;
    }

    function randomBetween(min, max) {
        const t = typeof state.rng === 'function' ? state.rng() : Math.random();
        return min + (max - min) * t;
    }

    function spawnObstacle() {
        if (!state.obstaclesLayer || !state.preset) {
            return;
        }
        if (state.obstacles.length >= state.preset.maxObstacles) {
            return;
        }
        const width = randomBetween(state.preset.obstacleSize[0], state.preset.obstacleSize[1]);
        const height = randomBetween(state.preset.obstacleHeight[0], state.preset.obstacleHeight[1]);
        const maxX = Math.max(10, state.bounds.width - width - 10);
        const x = randomBetween(10, maxX);
        const speed = randomBetween(state.preset.obstacleSpeed[0], state.preset.obstacleSpeed[1]);

        const el = document.createElement('div');
        el.className = 'inside-obstacle';
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.transform = `translate(${x}px, -${height}px)`;
        state.obstaclesLayer.appendChild(el);

        state.obstacles.push({
            el,
            x,
            y: -height,
            width,
            height,
            speed
        });
    }

    function removeObstacle(index) {
        const obstacle = state.obstacles[index];
        if (!obstacle) {
            return;
        }
        if (obstacle.el && obstacle.el.parentElement) {
            obstacle.el.parentElement.removeChild(obstacle.el);
        }
        state.obstacles.splice(index, 1);
    }

    function clearObstacles() {
        for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
            removeObstacle(i);
        }
    }

    function updateObstacles(delta) {
        for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
            const obstacle = state.obstacles[i];
            obstacle.y += (obstacle.speed * delta) / 1000;
            if (obstacle.y > state.bounds.height + obstacle.height) {
                removeObstacle(i);
                continue;
            }
            if (obstacle.el) {
                obstacle.el.style.transform = `translate(${obstacle.x}px, ${obstacle.y}px)`;
            }
        }
    }

    function checkCollisions() {
        if (!state.player) {
            return false;
        }
        const playerTop = state.bounds.height - 36;
        const playerBottom = playerTop + 36;
        const playerLeft = state.playerX - state.playerRadius;
        const playerRight = state.playerX + state.playerRadius;
        for (let i = 0; i < state.obstacles.length; i += 1) {
            const obstacle = state.obstacles[i];
            const top = obstacle.y;
            const bottom = obstacle.y + obstacle.height;
            const left = obstacle.x;
            const right = obstacle.x + obstacle.width;
            if (bottom < playerTop || top > playerBottom) {
                continue;
            }
            if (right < playerLeft || left > playerRight) {
                continue;
            }
            return true;
        }
        return false;
    }

    function setMessage(text, tone) {
        if (!state.message) {
            return;
        }
        if (!text) {
            state.message.classList.add('hidden');
            state.message.textContent = '';
            state.message.classList.remove('text-danger', 'text-success');
            return;
        }
        state.message.textContent = text;
        state.message.classList.remove('text-danger', 'text-success');
        if (tone === 'danger') {
            state.message.classList.add('text-danger');
        } else if (tone === 'success') {
            state.message.classList.add('text-success');
        }
        state.message.classList.remove('hidden');
    }

    function updateAttemptLabel() {
        if (!state.attemptLabel) {
            return;
        }
        state.attemptLabel.textContent = `Attempt ${state.attempt}`;
    }

    function scheduleRetry() {
        clearRetry();
        setMessage('Rebooting line...');
        state.retryHandle = setTimeout(() => {
            if (state.finalized) {
                return;
            }
            setMessage('');
            startAttempt();
        }, 1000);
    }

    function handleFailure() {
        playHint(0.55);
        state.attemptHits += 1;
        setStatus('TRACE DETECTED');
        scheduleRetry();
    }

    function handleSuccess() {
        state.finalized = true;
        clearFrame();
        clearRetry();
        setMessage('LINE BREACHED', 'success');
        if (state.controls && typeof state.controls.complete === 'function') {
            state.controls.complete({
                code: 'inside_clear',
                attempt: state.attempt,
                hits: state.attemptHits,
                duration: Math.round(state.elapsed)
            });
        }
    }

    function tick(now) {
        if (!state.running || state.finalized) {
            return;
        }
        const delta = now - state.lastFrame;
        state.lastFrame = now;
        state.elapsed = now - state.lastStart;
        updateProgress(now);

        const velocity = (state.inputs.right ? 1 : 0) - (state.inputs.left ? 1 : 0);
        if (velocity !== 0) {
            const deltaX = (velocity * state.preset.playerSpeed * delta) / 1000;
            state.playerX = Math.max(
                state.playerRadius + 4,
                Math.min(state.bounds.width - state.playerRadius - 4, state.playerX + deltaX)
            );
            updatePlayerVisual();
        }

        if (now - state.lastSpawn >= state.preset.spawnInterval) {
            spawnObstacle();
            state.lastSpawn = now;
        }
        updateObstacles(delta);

        if (checkCollisions()) {
            state.running = false;
            clearFrame();
            handleFailure();
            return;
        }

        if (state.elapsed >= state.preset.duration) {
            state.running = false;
            clearFrame();
            handleSuccess();
            return;
        }

        state.frame = context.requestFrame(tick);
    }

    function startAttempt() {
        if (state.finalized) {
            return;
        }
        state.attempt += 1;
        state.attemptHits = 0;
        updateAttemptLabel();
        measureBounds();
        clearObstacles();
        state.lastStart = performance.now();
        state.lastFrame = state.lastStart;
        state.lastSpawn = state.lastStart + 400;
        state.elapsed = 0;
        state.running = true;
        updateProgress(state.lastStart);
        setStatus('STAY ON THE LINE');
        setMessage('');
        updatePlayerVisual();
        clearFrame();
        state.frame = context.requestFrame(tick);
    }

    function handleKeyDown(event) {
        if (event.repeat) {
            return;
        }
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
            event.preventDefault();
            state.inputs.left = true;
        }
        if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
            event.preventDefault();
            state.inputs.right = true;
        }
    }

    function handleKeyUp(event) {
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
            state.inputs.left = false;
        }
        if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
            state.inputs.right = false;
        }
    }

    return {
        start(setup, controls) {
            state.controls = controls;            const difficulty = Math.max(1, Math.min(4, Number(setup && setup.difficulty) || 1));
            state.preset = PRESETS[difficulty] || PRESETS[1];
            state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('inside');
            state.inputs.left = false;
            state.inputs.right = false;
            state.attempt = 0;
            state.attemptHits = 0;
            state.finalized = false;
            buildUI();

            setStatus('LINE RIDER ONLINE');
            setFootnote('Use A/D or arrow keys to dodge. ESC cancels.');
            playHint(0.18);

            const keyDownRelease = controls.registerKeyDown(handleKeyDown);
            const keyUpRelease = controls.registerKeyUp(handleKeyUp);
            state.cleanup.push(keyDownRelease, keyUpRelease);

            startAttempt();
        },
        stop() {
            clearFrame();
            clearRetry();
            state.running = false;
        },
        destroy() {
            this.stop();
            clearObstacles();
            if (state.container && state.container.parentElement) {
                state.container.parentElement.removeChild(state.container);
            }
            state.container = null;
            state.hud = null;
            state.progressFill = null;
            state.message = null;
            state.obstaclesLayer = null;
            state.player = null;
            state.arena = null;
            for (let i = 0; i < state.cleanup.length; i += 1) {
                try {
                    state.cleanup[i]();
                } catch (err) {
                    // ignore cleanup issues
                }
            }
            state.cleanup = [];
        },
        cancel() {
            this.stop();
            state.finalized = true;
        }
    };
}
