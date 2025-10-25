import { createWateringGame } from './minigameWater.js';
import { createDigitGame } from './minigameDigit.js';
import { createLockpickGame } from './minigameLockpick.js';
import { createChemicalGatherGame } from './minigameChemicalGather.js';
import { createShopUI } from './shop.js';
import { createRefineUI } from './refine.js';
import { createSkillUI } from './skill.js';

const resourceName = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'rustoria_drug';
const root = document.getElementById('app');

const minigameFactories = {
    watering: createWateringGame,
    digit: createDigitGame,
    lockpick: createLockpickGame,
    chemical_gather: createChemicalGatherGame
};

let active = null;

const post = (action, data = {}) => {
    fetch(`https://${resourceName}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data)
    }).catch(() => {});
};

const cleanActive = () => {
    if (active && typeof active.destroy === 'function') {
        active.destroy();
    }
    active = null;
    root.innerHTML = '';
    root.classList.add('hidden');
};

const normalizeResult = (result) => {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        return result;
    }
    if (typeof result === 'number') {
        return { fails: result };
    }
    return {};
};

const openMinigame = (kind, data) => {
    cleanActive();
    const factory = minigameFactories[kind] || minigameFactories.lockpick;
    if (!factory) return;

    root.classList.remove('hidden');
    active = factory({
        root,
        data: data || {},
        complete: (result) => {
            post('minigame:complete', normalizeResult(result));
            cleanActive();
        },
        cancel: (result) => {
            post('minigame:cancel', normalizeResult(result));
            cleanActive();
        },
        log: (payload) => post('minigame:log', payload)
    });
};

const openShop = (items, labels) => {
    cleanActive();
    root.classList.remove('hidden');
    active = createShopUI({
        root,
        items: items || [],
        labels: labels || {},
        purchase: (item, amount) => post('shop:purchase', { item, amount }),
        close: () => {
            post('shop:close', {});
            cleanActive();
        }
    });
};

const openSkill = (summary, labels) => {
    cleanActive();
    root.classList.remove('hidden');
    active = createSkillUI({
        root,
        summary: summary || {},
        labels: labels || {},
        close: () => {
            post('skill:close', {});
            cleanActive();
        }
    });
};

const openRefine = (step, duration, labels) => {
    cleanActive();
    root.classList.remove('hidden');
    active = createRefineUI({
        root,
        step,
        duration,
        labels: labels || {},
        complete: (success) => {
            post(success ? 'refine:complete' : 'refine:cancel', {});
            cleanActive();
        }
    });
};

window.addEventListener('message', (event) => {
    const { action, kind, data, items, step, duration, labels, summary } = event.data || {};

    switch (action) {
        case 'openMinigame':
            openMinigame(kind, data);
            break;
        case 'minigameClose':
            cleanActive();
            break;
        case 'openShop':
            openShop(items, labels);
            break;
        case 'shopClose':
            cleanActive();
            break;
        case 'openRefine':
            openRefine(step, duration, labels);
            break;
        case 'refineClose':
            cleanActive();
            break;
        case 'openSkill':
            openSkill(summary || data, labels);
            break;
        case 'skillClose':
            cleanActive();
            break;
        default:
            break;
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (active && typeof active.escape === 'function') {
            active.escape();
        } else {
            post('ui:escape', {});
            cleanActive();
        }
    } else if (active && typeof active.onKey === 'function') {
        active.onKey(event);
    }
});

export {};