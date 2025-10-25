export function createRefineUI(ctx) {
    const duration = ctx.duration || 7000;
    const step = ctx.step || {};
    const labels = Object.assign({
        title: 'Refining',
        summary: 'Processing %{inputCount}x %{input} into %{outputCount}x %{output}.',
        input: 'Input',
        output: 'Output',
        cancel: 'Cancel'
    }, ctx.labels || {});

    const summaryText = labels.summary
        .replace('%{inputCount}', step.inputCount || 0)
        .replace('%{input}', step.input || 'Unknown')
        .replace('%{outputCount}', step.outputCount || 0)
        .replace('%{output}', step.output || 'Unknown');

    const container = document.createElement('div');
    container.className = 'app refine-ui';
    container.innerHTML = `
        <h1>${labels.title}</h1>
        <div class="summary">${summaryText}</div>
        <div class="items">
            <span>
                <span>${labels.input}</span>
                <strong>${step.inputCount || 0}</strong>
            </span>
            <span>
                <span>${labels.output}</span>
                <strong>${step.outputCount || 0}</strong>
            </span>
        </div>
        <div class="progress-bar">
            <div class="fill"></div>
        </div>
        <button class="cancel" id="refine-cancel">${labels.cancel}</button>
    `;

    const fill = container.querySelector('.fill');
    const cancel = container.querySelector('#refine-cancel');
    ctx.root.appendChild(container);

    let running = true;
    const start = performance.now();

    const tick = () => {
        if (!running) return;
        const elapsed = performance.now() - start;
        const ratio = Math.min(1, elapsed / duration);
        fill.style.width = `${ratio * 100}%`;
        if (ratio >= 1) {
            running = false;
            ctx.complete(true);
        } else {
            requestAnimationFrame(tick);
        }
    };

    requestAnimationFrame(tick);

    cancel.addEventListener('click', () => {
        if (!running) return;
        running = false;
        ctx.complete(false);
    });

    return {
        destroy() {
            running = false;
            container.remove();
        },
        escape() {
            if (!running) return;
            running = false;
            ctx.complete(false);
        }
    };
}