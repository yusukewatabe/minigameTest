export function createWateringGame(ctx) {
    const container = document.createElement('div');
    container.innerHTML = `
        <h1>Watering</h1>
        <p class="description">${ctx.data.instruction || 'Tap E to keep the gauge full.'}</p>
        <div class="progress-bar"><div class="fill"></div></div>
        <div class="instructions">Press E repeatedly to fill the gauge.</div>
    `;

    const fill = container.querySelector('.fill');
    ctx.root.appendChild(container);

    let gauge = 0.5;
    let fails = 0;
    let active = true;

    const update = () => {
        fill.style.width = `${Math.max(0, Math.min(1, gauge)) * 100}%`;
    };

    const loop = setInterval(() => {
        if (!active) return;
        gauge -= 0.02;
        if (gauge <= 0) {
            fails += 1;
            active = false;
            clearInterval(loop);
            ctx.cancel({ fails, reason: 'failed' });
        }
        update();
    }, 100);

    update();

    const api = {
        destroy() {
            active = false;
            clearInterval(loop);
        },
        escape() {
            if (!active) return;
            active = false;
            clearInterval(loop);
            ctx.cancel({ fails, reason: 'cancelled' });
        },
        getFails() {
            return fails;
        },
        onKey(event) {
            if (!active) return;
            if (event.key.toLowerCase() === 'e') {
                gauge += 0.08;
                if (gauge >= 1) {
                    active = false;
                    clearInterval(loop);
                    ctx.complete({ fails, success: true });
                }
                update();
            }
        }
    };

    return api;
}