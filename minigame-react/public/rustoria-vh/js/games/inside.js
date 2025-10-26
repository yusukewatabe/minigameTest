export function createInsideGame(context) {
    document.getElementById('overlayCard')?.classList.add('hidden');

    const DIFFICULTY_PRESETS = {
        1: { // EASY
            mapSize: { width: 500, height: 400 },
            timeLimit: 25000, // ms
            itemCount: 2,
            itemSpawnDifficulty: ['easy'],
            laserCount: 3,
            laserTypes: ['linear'],
            laserSpeed: [80, 100],
            playerSpeed: 180
        },
        2: { // NORMAL
            mapSize: { width: 650, height: 500 },
            timeLimit: 30000,
            itemCount: 3,
            itemSpawnDifficulty: ['easy', 'medium'],
            laserCount: 5,
            laserTypes: ['linear', 'rotating', 'variable'],
            laserSpeed: [100, 140],
            playerSpeed: 170
        },
        3: { // HARD
            mapSize: { width: 800, height: 600 },
            timeLimit: 35000,
            itemCount: 3,
            itemSpawnDifficulty: ['medium', 'hard'],
            laserCount: 7,
            laserTypes: ['linear', 'rotating', 'variable', 'pulse'],
            laserSpeed: [120, 180],
            playerSpeed: 160
        },
        4: { // EXPERT
            mapSize: { width: 900, height: 700 },
            timeLimit: 40000,
            itemCount: 4,
            itemSpawnDifficulty: ['easy', 'medium', 'hard'],
            laserCount: 9,
            laserTypes: ['linear', 'rotating', 'variable', 'pulse', 'random'],
            laserSpeed: [150, 220],
            playerSpeed: 150
        }
    };

    const state = {
        controls: null,
        container: null,
        arena: null,
        player: null,
        lasersLayer: null,
        itemsLayer: null,
        particlesLayer: null,
        goal: null,
        frame: null,
        running: false,
        finalized: false,
        startTime: 0,
        lastFrame: 0,
        timeRemaining: 0,
        playerX: 0,
        playerY: 0,
        playerRadius: 15,
        inputs: { up: false, down: false, left: false, right: false },
        rng: null,
        preset: DIFFICULTY_PRESETS[1],
        lasers: [],
        items: [],
        particles: [],
        itemsCollected: 0,
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

    function randomBetween(min, max) {
        const t = typeof state.rng === 'function' ? state.rng() : Math.random();
        return min + (max - min) * t;
    }

    function buildUI() {
        const container = document.createElement('div');
        container.className = 'laser-grid-game';

        // HUD for items collected
        const hud = document.createElement('div');
        hud.className = 'laser-grid-hud';

        const itemsDisplay = document.createElement('div');
        itemsDisplay.className = 'laser-grid-items';
        itemsDisplay.textContent = `Items: ${state.itemsCollected}/${state.preset.itemCount}`;
        hud.appendChild(itemsDisplay);
        state.itemsDisplay = itemsDisplay;

        container.appendChild(hud);

        // Arena
        const arena = document.createElement('div');
        arena.className = 'laser-grid-arena';
        arena.style.width = `${state.preset.mapSize.width}px`;
        arena.style.height = `${state.preset.mapSize.height}px`;

        // Grid background
        const grid = document.createElement('div');
        grid.className = 'laser-grid-background';
        arena.appendChild(grid);

        // Lasers layer
        const lasersLayer = document.createElement('div');
        lasersLayer.className = 'laser-grid-lasers';
        arena.appendChild(lasersLayer);

        // Items layer
        const itemsLayer = document.createElement('div');
        itemsLayer.className = 'laser-grid-items-layer';
        arena.appendChild(itemsLayer);

        // Particles layer
        const particlesLayer = document.createElement('div');
        particlesLayer.className = 'laser-grid-particles';
        arena.appendChild(particlesLayer);

        // Player
        const player = document.createElement('div');
        player.className = 'laser-grid-player';
        arena.appendChild(player);

        // Goal
        const goal = document.createElement('div');
        goal.className = 'laser-grid-goal';
        goal.textContent = 'EXIT';
        arena.appendChild(goal);

        container.appendChild(arena);

        context.root.appendChild(container);
        state.container = container;
        state.arena = arena;
        state.player = player;
        state.lasersLayer = lasersLayer;
        state.itemsLayer = itemsLayer;
        state.particlesLayer = particlesLayer;
        state.goal = goal;

        // Set start and goal positions
        state.playerX = 40;
        state.playerY = 40;
        updatePlayerVisual();

        // Position goal at opposite corner
        state.goal.style.left = `${state.preset.mapSize.width - 50}px`;
        state.goal.style.top = `${state.preset.mapSize.height - 50}px`;
    }

    function updatePlayerVisual() {
        if (!state.player) return;
        state.player.style.left = `${state.playerX}px`;
        state.player.style.top = `${state.playerY}px`;
    }

    function updateItemsDisplay() {
        if (!state.itemsDisplay) return;
        state.itemsDisplay.textContent = `Items: ${state.itemsCollected}/${state.preset.itemCount}`;

        // Update status based on collection
        if (state.itemsCollected >= state.preset.itemCount) {
            setStatus('REACH THE EXIT');
            if (state.goal) {
                state.goal.classList.add('active');
            }
        }
    }

    function spawnItems() {
        // Define spawn points based on map size
        const spawnPoints = generateSpawnPoints();

        // Select random spawn points based on difficulty
        const selectedPoints = [];
        const validPoints = spawnPoints.filter(p =>
            state.preset.itemSpawnDifficulty.includes(p.difficulty)
        );

        for (let i = 0; i < state.preset.itemCount; i++) {
            if (validPoints.length === 0) break;
            const idx = Math.floor(randomBetween(0, validPoints.length));
            selectedPoints.push(validPoints.splice(idx, 1)[0]);
        }

        // Create item elements
        selectedPoints.forEach(point => {
            const el = document.createElement('div');
            el.className = 'laser-grid-item';
            el.style.left = `${point.x}px`;
            el.style.top = `${point.y}px`;
            state.itemsLayer.appendChild(el);

            state.items.push({
                el,
                x: point.x,
                y: point.y,
                radius: 12,
                collected: false
            });
        });
    }

    function generateSpawnPoints() {
        const { width, height } = state.preset.mapSize;
        const margin = 80;

        return [
            { x: width * 0.3, y: height * 0.2, difficulty: 'easy' },
            { x: width * 0.7, y: height * 0.2, difficulty: 'easy' },
            { x: width * 0.2, y: height * 0.5, difficulty: 'medium' },
            { x: width * 0.5, y: height * 0.3, difficulty: 'medium' },
            { x: width * 0.8, y: height * 0.5, difficulty: 'medium' },
            { x: width * 0.3, y: height * 0.7, difficulty: 'hard' },
            { x: width * 0.6, y: height * 0.7, difficulty: 'hard' },
            { x: width * 0.5, y: height * 0.6, difficulty: 'medium' },
        ];
    }

    function spawnLasers() {
        const { laserCount, laserTypes, laserSpeed, mapSize } = state.preset;

        for (let i = 0; i < laserCount; i++) {
            const typeIdx = Math.floor(randomBetween(0, laserTypes.length));
            const type = laserTypes[typeIdx];

            const laser = createLaser(type, mapSize, laserSpeed);
            if (laser) {
                state.lasers.push(laser);
            }
        }
    }

    function createLaser(type, mapSize, speedRange) {
        const el = document.createElement('div');
        el.className = `laser-grid-laser laser-${type}`;
        state.lasersLayer.appendChild(el);

        const speed = randomBetween(speedRange[0], speedRange[1]);

        if (type === 'linear') {
            const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const laser = {
                type,
                el,
                orientation,
                speed,
                position: 0,
                direction: 1,
                isVisible: true
            };

            if (orientation === 'horizontal') {
                el.style.width = `${mapSize.width}px`;
                el.style.height = '6px';
                laser.y = randomBetween(60, mapSize.height - 60);
                el.style.top = `${laser.y}px`;
                el.style.left = '0px';
            } else {
                el.style.width = '6px';
                el.style.height = `${mapSize.height}px`;
                laser.x = randomBetween(60, mapSize.width - 60);
                el.style.left = `${laser.x}px`;
                el.style.top = '0px';
            }

            return laser;
        }

        if (type === 'rotating') {
            const centerX = mapSize.width / 2;
            const centerY = mapSize.height / 2;
            const radius = Math.min(mapSize.width, mapSize.height) * 0.4;
            const length = radius;

            el.style.width = `${length}px`;
            el.style.height = '6px';
            el.style.transformOrigin = '0 50%';

            return {
                type,
                el,
                centerX,
                centerY,
                radius,
                length,
                angle: randomBetween(0, Math.PI * 2),
                angularSpeed: speed * 0.5 / radius // Convert to radians per second
            };
        }

        if (type === 'variable') {
            const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const laser = {
                type,
                el,
                orientation,
                baseSpeed: speed,
                speed,
                speedRange: [speed * 0.6, speed * 1.6],
                position: 0,
                direction: 1,
                lastSpeedChange: 0,
                changeInterval: 2000,
                isVisible: true
            };

            if (orientation === 'horizontal') {
                el.style.width = `${mapSize.width}px`;
                el.style.height = '6px';
                laser.y = randomBetween(60, mapSize.height - 60);
                el.style.top = `${laser.y}px`;
                el.style.left = '0px';
            } else {
                el.style.width = '6px';
                el.style.height = `${mapSize.height}px`;
                laser.x = randomBetween(60, mapSize.width - 60);
                el.style.left = `${laser.x}px`;
                el.style.top = '0px';
            }

            return laser;
        }

        if (type === 'pulse') {
            const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
            const laser = {
                type,
                el,
                orientation,
                speed,
                position: 0,
                direction: 1,
                isVisible: true,
                lastPulse: 0,
                onDuration: 800,
                offDuration: 300
            };

            if (orientation === 'horizontal') {
                el.style.width = `${mapSize.width}px`;
                el.style.height = '6px';
                laser.y = randomBetween(60, mapSize.height - 60);
                el.style.top = `${laser.y}px`;
                el.style.left = '0px';
            } else {
                el.style.width = '6px';
                el.style.height = `${mapSize.height}px`;
                laser.x = randomBetween(60, mapSize.width - 60);
                el.style.left = `${laser.x}px`;
                el.style.top = '0px';
            }

            return laser;
        }

        if (type === 'random') {
            el.style.width = `${mapSize.width * 0.3}px`;
            el.style.height = '6px';

            return {
                type,
                el,
                x: randomBetween(60, mapSize.width - 60),
                y: randomBetween(60, mapSize.height - 60),
                angle: randomBetween(0, Math.PI * 2),
                speed,
                lastDirectionChange: 0,
                changeInterval: 1500,
                length: mapSize.width * 0.3,
                bounds: { minX: 50, maxX: mapSize.width - 50, minY: 50, maxY: mapSize.height - 50 },
                isVisible: true
            };
        }

        return null;
    }

    function updateLasers(delta, now) {
        state.lasers.forEach(laser => {
            if (laser.type === 'linear') {
                // Move laser based on orientation
                if (laser.orientation === 'horizontal') {
                    laser.y += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.y <= 30 || laser.y >= state.preset.mapSize.height - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.top = `${laser.y}px`;
                } else {
                    laser.x += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.x <= 30 || laser.x >= state.preset.mapSize.width - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.left = `${laser.x}px`;
                }
            }

            if (laser.type === 'rotating') {
                laser.angle += (laser.angularSpeed * delta) / 1000;
                const x = laser.centerX + Math.cos(laser.angle) * 10;
                const y = laser.centerY + Math.sin(laser.angle) * 10;
                laser.el.style.left = `${x}px`;
                laser.el.style.top = `${y}px`;
                laser.el.style.transform = `rotate(${laser.angle}rad)`;
            }

            if (laser.type === 'variable') {
                // Change speed periodically
                if (now - laser.lastSpeedChange > laser.changeInterval) {
                    laser.speed = randomBetween(laser.speedRange[0], laser.speedRange[1]);
                    laser.lastSpeedChange = now;
                }

                if (laser.orientation === 'horizontal') {
                    laser.y += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.y <= 30 || laser.y >= state.preset.mapSize.height - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.top = `${laser.y}px`;
                } else {
                    laser.x += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.x <= 30 || laser.x >= state.preset.mapSize.width - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.left = `${laser.x}px`;
                }
            }

            if (laser.type === 'pulse') {
                // Toggle visibility
                const cycleTime = (now - laser.lastPulse) % (laser.onDuration + laser.offDuration);
                laser.isVisible = cycleTime < laser.onDuration;
                laser.el.style.opacity = laser.isVisible ? '1' : '0';

                // Still move even when invisible
                if (laser.orientation === 'horizontal') {
                    laser.y += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.y <= 30 || laser.y >= state.preset.mapSize.height - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.top = `${laser.y}px`;
                } else {
                    laser.x += laser.direction * (laser.speed * delta) / 1000;
                    if (laser.x <= 30 || laser.x >= state.preset.mapSize.width - 30) {
                        laser.direction *= -1;
                    }
                    laser.el.style.left = `${laser.x}px`;
                }
            }

            if (laser.type === 'random') {
                // Change direction periodically
                if (now - laser.lastDirectionChange > laser.changeInterval) {
                    laser.angle = randomBetween(0, Math.PI * 2);
                    laser.lastDirectionChange = now;
                }

                // Move in current direction
                const dx = Math.cos(laser.angle) * (laser.speed * delta) / 1000;
                const dy = Math.sin(laser.angle) * (laser.speed * delta) / 1000;

                laser.x += dx;
                laser.y += dy;

                // Bounce off bounds
                if (laser.x < laser.bounds.minX || laser.x > laser.bounds.maxX) {
                    laser.angle = Math.PI - laser.angle;
                    laser.x = Math.max(laser.bounds.minX, Math.min(laser.bounds.maxX, laser.x));
                }
                if (laser.y < laser.bounds.minY || laser.y > laser.bounds.maxY) {
                    laser.angle = -laser.angle;
                    laser.y = Math.max(laser.bounds.minY, Math.min(laser.bounds.maxY, laser.y));
                }

                laser.el.style.left = `${laser.x}px`;
                laser.el.style.top = `${laser.y}px`;
                laser.el.style.transform = `rotate(${laser.angle}rad)`;
            }
        });
    }

    function checkLaserCollision() {
        for (const laser of state.lasers) {
            if (!laser.isVisible) continue;

            if (laser.type === 'linear' || laser.type === 'variable' || laser.type === 'pulse') {
                if (laser.orientation === 'horizontal') {
                    // Check distance from player to horizontal line
                    const dist = Math.abs(state.playerY - laser.y);
                    if (dist < state.playerRadius + 3) {
                        return true;
                    }
                } else {
                    // Check distance from player to vertical line
                    const dist = Math.abs(state.playerX - laser.x);
                    if (dist < state.playerRadius + 3) {
                        return true;
                    }
                }
            }

            if (laser.type === 'rotating') {
                // Check distance from player to rotating line
                const x1 = laser.centerX + Math.cos(laser.angle) * 10;
                const y1 = laser.centerY + Math.sin(laser.angle) * 10;
                const x2 = laser.centerX + Math.cos(laser.angle) * (10 + laser.length);
                const y2 = laser.centerY + Math.sin(laser.angle) * (10 + laser.length);

                const dist = distanceToSegment(state.playerX, state.playerY, x1, y1, x2, y2);
                if (dist < state.playerRadius + 3) {
                    return true;
                }
            }

            if (laser.type === 'random') {
                const x1 = laser.x;
                const y1 = laser.y;
                const x2 = laser.x + Math.cos(laser.angle) * laser.length;
                const y2 = laser.y + Math.sin(laser.angle) * laser.length;

                const dist = distanceToSegment(state.playerX, state.playerY, x1, y1, x2, y2);
                if (dist < state.playerRadius + 3) {
                    return true;
                }
            }
        }

        return false;
    }

    function distanceToSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;

        return Math.sqrt(dx * dx + dy * dy);
    }

    function checkItemCollection() {
        for (const item of state.items) {
            if (item.collected) continue;

            const dist = Math.hypot(state.playerX - item.x, state.playerY - item.y);
            if (dist < state.playerRadius + item.radius) {
                item.collected = true;
                item.el.remove();
                state.itemsCollected++;
                updateItemsDisplay();
                playHint(0.3);
                spawnCollectParticles(item.x, item.y);
            }
        }
    }

    function checkGoalReached() {
        if (state.itemsCollected < state.preset.itemCount) return false;

        const goalX = state.preset.mapSize.width - 50;
        const goalY = state.preset.mapSize.height - 50;
        const dist = Math.hypot(state.playerX - goalX, state.playerY - goalY);

        return dist < state.playerRadius + 30;
    }

    function spawnCollectParticles(x, y) {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const particle = {
                x, y,
                vx: Math.cos(angle) * 100,
                vy: Math.sin(angle) * 100,
                life: 0.5,
                maxLife: 0.5,
                color: '#FACC15',
                el: null
            };

            const el = document.createElement('div');
            el.className = 'laser-grid-particle';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.background = particle.color;
            state.particlesLayer.appendChild(el);
            particle.el = el;

            state.particles.push(particle);
        }
    }

    function spawnImpactParticles(x, y) {
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 100;
            const particle = {
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4,
                maxLife: 0.4,
                color: '#FF5876',
                el: null
            };

            const el = document.createElement('div');
            el.className = 'laser-grid-particle';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.background = particle.color;
            state.particlesLayer.appendChild(el);
            particle.el = el;

            state.particles.push(particle);
        }
    }

    function updateParticles(delta) {
        for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i];
            p.life -= delta / 1000;

            if (p.life <= 0) {
                p.el?.remove();
                state.particles.splice(i, 1);
                continue;
            }

            p.x += (p.vx * delta) / 1000;
            p.y += (p.vy * delta) / 1000;

            const opacity = p.life / p.maxLife;
            p.el.style.left = `${p.x}px`;
            p.el.style.top = `${p.y}px`;
            p.el.style.opacity = opacity;
        }
    }

    function handleFailure() {
        state.finalized = true;
        clearFrame();
        state.running = false;

        spawnImpactParticles(state.playerX, state.playerY);
        playHint(0.8);
        setStatus('SECURITY BREACH');

        if (state.controls && typeof state.controls.fail === 'function') {
            state.controls.fail({
                code: 'laser_hit',
                reason: 'laser_hit',
                itemsCollected: state.itemsCollected
            });
        }
    }

    function handleSuccess() {
        state.finalized = true;
        clearFrame();
        state.running = false;

        setStatus('game success');
        playHint(0.3);

        if (state.controls && typeof state.controls.complete === 'function') {
            state.controls.complete({
                code: 'laser_grid_clear',
                timeRemaining: Math.max(0, state.timeRemaining),
                itemsCollected: state.itemsCollected,
                perfectRun: true
            });
        }
    }

    function tick(now) {
        if (!state.running || state.finalized) return;

        const delta = now - state.lastFrame;
        state.lastFrame = now;

        const elapsed = now - state.startTime;
        state.timeRemaining = state.preset.timeLimit - elapsed;

        // Check time limit
        if (state.timeRemaining <= 0) {
            state.finalized = true;
            clearFrame();
            setStatus('TIME OUT');
            playHint(0.8);
            if (state.controls && typeof state.controls.fail === 'function') {
                state.controls.fail({
                    code: 'time_out',
                    reason: 'time_out',
                    itemsCollected: state.itemsCollected
                });
            }
            return;
        }

        // Update player position
        let dx = 0;
        let dy = 0;

        if (state.inputs.left) dx -= 1;
        if (state.inputs.right) dx += 1;
        if (state.inputs.up) dy -= 1;
        if (state.inputs.down) dy += 1;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            const magnitude = Math.sqrt(dx * dx + dy * dy);
            dx /= magnitude;
            dy /= magnitude;
        }

        if (dx !== 0 || dy !== 0) {
            const moveAmount = (state.preset.playerSpeed * delta) / 1000;
            state.playerX += dx * moveAmount;
            state.playerY += dy * moveAmount;

            // Clamp to bounds
            state.playerX = Math.max(state.playerRadius + 4, Math.min(state.preset.mapSize.width - state.playerRadius - 4, state.playerX));
            state.playerY = Math.max(state.playerRadius + 4, Math.min(state.preset.mapSize.height - state.playerRadius - 4, state.playerY));

            updatePlayerVisual();
        }

        // Update lasers
        updateLasers(delta, now);

        // Update particles
        updateParticles(delta);

        // Check collisions
        if (checkLaserCollision()) {
            handleFailure();
            return;
        }

        // Check item collection
        checkItemCollection();

        // Check goal
        if (checkGoalReached()) {
            handleSuccess();
            return;
        }

        state.frame = context.requestFrame(tick);
    }

    function handleKeyDown(event) {
        if (event.repeat) return;

        if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
            event.preventDefault();
            state.inputs.up = true;
        }
        if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
            event.preventDefault();
            state.inputs.down = true;
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
        if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
            state.inputs.up = false;
        }
        if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
            state.inputs.down = false;
        }
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
            state.inputs.left = false;
        }
        if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
            state.inputs.right = false;
        }
    }

    return {
        start(setup, controls) {
            state.controls = controls;
            const difficulty = Math.max(1, Math.min(4, Number(setup && setup.difficulty) || 1));
            state.preset = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS[1];
            state.rng = typeof setup.rng === 'function' ? setup.rng : context.makeRng('inside');

            state.inputs = { up: false, down: false, left: false, right: false };
            state.itemsCollected = 0;
            state.finalized = false;
            state.lasers = [];
            state.items = [];
            state.particles = [];

            buildUI();
            spawnItems();
            spawnLasers();

            setStatus('COLLECT ALL KEYS');
            setFootnote('WASD or Arrow Keys to move | ESC to cancel');
            playHint(0.18);

            const keyDownRelease = controls.registerKeyDown(handleKeyDown);
            const keyUpRelease = controls.registerKeyUp(handleKeyUp);
            state.cleanup.push(keyDownRelease, keyUpRelease);

            state.startTime = performance.now();
            state.lastFrame = state.startTime;
            state.running = true;
            state.frame = context.requestFrame(tick);
        },
        stop() {
            clearFrame();
            state.running = false;
        },
        destroy() {
            this.stop();

            if (state.container && state.container.parentElement) {
                state.container.parentElement.removeChild(state.container);
            }

            state.container = null;
            state.arena = null;
            state.player = null;
            state.lasersLayer = null;
            state.itemsLayer = null;
            state.particlesLayer = null;
            state.goal = null;

            for (let i = 0; i < state.cleanup.length; i++) {
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
