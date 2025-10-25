const format = (template, values = {}) => {
    if (typeof template !== 'string') return '';
    return template.replace(/%\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value !== undefined && value !== null ? value : '';
    });
};

const statusClass = (status) => {
    switch (status) {
        case 'current':
            return 'current';
        case 'unlocked':
            return 'unlocked';
        default:
            return 'locked';
    }
};

export function createSkillUI(ctx) {
    const summary = ctx.summary || {};
    const labels = ctx.labels || {};
    const container = document.createElement('div');
    container.className = 'skill-ui';

    const current = summary.current || {};
    const next = summary.next || null;
    const points = summary.points ?? 0;
    const percent = Math.max(0, Math.min(100, Math.round((summary.progress || 0) * 100)));

    const overviewHTML = `
        <div class="skill-overview">
            <div class="metric">
                <span></span>
                <strong></strong>
            </div>
            <div class="metric">
                <span></span>
                <strong class="accent"></strong>
            </div>
            <div class="metric">
                <span></span>
                <strong class=""></strong>
            </div>
        </div>
    `;

    const progressText = next
        ? format(labels.progress || '', {
            current: summary.progressCurrent || 0,
            required: summary.progressRequired || 0
        })
        : labels.progressMax || '';

    container.innerHTML = `
        <h1></h1>
        
        <div class="skill-progress">
            <div class="meter">
                <div class="fill" style="width: %;"></div>
            </div>
            <div class="note"></div>
        </div>
        <div class="skill-ranks"></div>
        <div class="skill-footer">
            <button class="skill-close"></button>
            <span class="hint"></span>
        </div>
    `;

    const rankHost = container.querySelector('.skill-ranks');
    (summary.ranks || []).forEach((rank) => {
        const card = document.createElement('div');
        card.className = "skill-rank" ;

        const rangeText = typeof rank.max === 'number'
            ? format(labels.rankRange || '', { min: rank.min || 0, max: rank.max })
            : format(labels.rankRangeLast || '', { min: rank.min || 0 });

        const statusText = rank.status === 'current'
            ? labels.current || ''
            : rank.status === 'unlocked'
                ? labels.unlocked || ''
                : labels.locked || '';

        card.innerHTML = `
            <div class="rank-name"></div>
            <div class="rank-range"></div>
            <div class="rank-status"></div>
        `;

        rankHost.appendChild(card);
    });

    const closeButton = container.querySelector('.skill-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            if (typeof ctx.close === 'function') {
                ctx.close();
            }
        });
    }

    ctx.root.appendChild(container);

    return {
        destroy() {
            container.remove();
        },
        escape() {
            if (typeof ctx.close === 'function') {
                ctx.close();
            }
        }
    };
}
