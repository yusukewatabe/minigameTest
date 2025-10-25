const randomDigit = () => Math.floor(Math.random() * 10);

export function createDigitGame(ctx) {
    const sequence = Array.from({ length: 4 }, randomDigit);

    const container = document.createElement('div');
    container.innerHTML = `
        <h1>Sequence Input</h1>
        <div class="sequence">${sequence.map((d) => `<span>${d}</span>`).join('')}</div>
        <p class="description">${ctx.data.instruction || 'Type the sequence using the number keys.'}</p>
        <div class="feedback"></div>
    `;

    const feedback = container.querySelector('.feedback');
    ctx.root.appendChild(container);

    let index = 0;
    let fails = 0;
    let active = true;

    const reset = () => {
        index = 0;
        feedback.textContent = 'Incorrect input. Try again.';
        fails += 1;
    };

    const api = {
        destroy() {
            active = false;
        },
        escape() {
            if (!active) return;
            active = false;
            ctx.cancel({ fails, reason: 'cancelled' });
        },
        getFails() {
            return fails;
        },
        onKey(event) {
            if (!active) return;
            if (!event.key || event.key.length !== 1 || !/[0-9]/.test(event.key)) {
                return;
            }

            const value = parseInt(event.key, 10);
            if (value === sequence[index]) {
                index += 1;
                feedback.textContent = `${index}/${sequence.length}`;
                if (index >= sequence.length) {
                    active = false;
                    ctx.complete({ fails, success: true });
                }
            } else {
                reset();
            }
        }
    };

    return api;
}