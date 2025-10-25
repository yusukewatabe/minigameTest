export function createShopUI(ctx) {
    const labels = Object.assign({
        title: 'Supply Dealer',
        item: 'Item',
        quantity: 'Quantity',
        cancel: 'Cancel',
        confirm: 'Purchase',
        hint: 'Press ESC to close'
    }, ctx.labels || {});

    const container = document.createElement('div');
    container.className = 'app shop-ui';
    container.innerHTML = `
        <h1>${labels.title}</h1>
        <div class="field">
            <label for="shop-item">${labels.item}</label>
            <select id="shop-item"></select>
        </div>
        <div class="field">
            <label for="shop-amount">${labels.quantity}</label>
            <input id="shop-amount" type="number" min="1" max="100" value="1" />
        </div>
        <div class="buttons">
            <button class="secondary" id="shop-cancel">${labels.cancel}</button>
            <button class="primary" id="shop-confirm">${labels.confirm}</button>
        </div>
        <div class="hint">${labels.hint}</div>
    `;

    const select = container.querySelector('#shop-item');
    const input = container.querySelector('#shop-amount');
    const confirm = container.querySelector('#shop-confirm');
    const cancel = container.querySelector('#shop-cancel');

    (ctx.items || []).forEach((entry, index) => {
        const option = document.createElement('option');
        option.value = entry.item;
        option.textContent = `${entry.item} - $${entry.price}`;
        if (index === 0) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    const commit = () => {
        const item = select.value;
        const amount = parseInt(input.value, 10) || 0;
        if (!item || amount < 1 || amount > 100) {
            input.focus();
            return;
        }
        ctx.purchase(item, amount);
    };

    select.addEventListener('change', () => input.focus());
    confirm.addEventListener('click', () => commit());
    cancel.addEventListener('click', () => ctx.close());

    container.addEventListener('submit', (event) => {
        event.preventDefault();
        commit();
    });

    ctx.root.appendChild(container);
    input.focus();

    return {
        destroy() {
            container.remove();
        },
        escape() {
            ctx.close();
        },
        onKey(event) {
            if (event.key === 'Enter') {
                commit();
            }
        }
    };
}