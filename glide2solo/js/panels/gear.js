// Panel: Sprzęt (Gear) — katalog kart Common/Advanced Gear. Każda karta ma efekt jako
// tooltip na hover, checkbox "Kupione" oraz "Założone" (do limitu mechanics.resources.gear.max_carried),
// a założony przedmiot dostaje licznik Wear (max = mechanics.resources.gear.wear_per_item).
import { getState, getData, touch } from "../store.js";
import { escapeHtml } from "../utils.js";
import { flattenGear, humanizeCategory, gearCapacity, EXPLORERS_BACKPACK_SLUG } from "../gearData.js";

function groupByCategory(flat) {
    const groups = new Map();
    for (const item of flat) {
        const key = `${item.tier} — ${humanizeCategory(item.category)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return groups;
}

function renderCard(item, itemState, canEquipMore, wearPerItem) {
    const owned = !!itemState.owned;
    const equipped = !!itemState.equipped;
    // Explorer's Backpack sam nie zajmuje slotu (patrz jego efekt) — zawsze można go założyć,
    // niezależnie od tego, czy limit Gear jest już wyczerpany.
    const isBackpack = item.slug === EXPLORERS_BACKPACK_SLUG;
    const disabledEquip = !owned || (!equipped && !canEquipMore && !isBackpack);
    const wear = itemState.wear ?? wearPerItem;
    return `
        <div class="item-card tt ${owned ? "owned" : ""} ${equipped ? "equipped" : ""}" data-tip="${escapeHtml(item.effect || "")}">
            <div class="item-card-head">
                <span class="item-card-name">${escapeHtml(item.name)}</span>
                <span class="item-card-cost">${escapeHtml(item.cost || "")}</span>
            </div>
            <div class="item-card-toggles">
                <label>
                    <input type="checkbox" data-action="toggle-gear-owned" data-slug="${item.slug}" ${owned ? "checked" : ""}>
                    <span>Kupione</span>
                </label>
                <label class="${disabledEquip ? "disabled" : ""}">
                    <input type="checkbox" data-action="toggle-gear-equipped" data-slug="${item.slug}" ${equipped ? "checked" : ""} ${disabledEquip ? "disabled" : ""}>
                    <span>Założone</span>
                </label>
            </div>
            ${equipped ? `
                <div class="counter-row" style="border:none; padding:2px 0 0;">
                    <div class="counter-label">Wear</div>
                    <div class="counter-controls">
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="-1">−</button>
                        <span class="counter-value ${wear === 0 ? "max" : ""}">${wear} <span class="max">/ ${wearPerItem}</span></span>
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="1">+</button>
                    </div>
                </div>
                ${wear === 0 ? `<p class="placeholder" style="margin:0;">NIEUŻYWALNY (0 Wear)</p>` : ""}
            ` : ""}
        </div>
    `;
}

export function render(root, { state, data }) {
    const mechanics = data.mechanics;
    const baseMaxCarried = mechanics?.resources?.gear?.max_carried ?? 3;
    const wearPerItem = mechanics?.resources?.gear?.wear_per_item ?? 3;
    const flat = flattenGear(data.gear);
    const gearState = state.character.gear || {};
    const { maxCarried, equippedCount, backpackEquipped } = gearCapacity(state, baseMaxCarried);
    const groups = groupByCategory(flat);
    const canEquipMore = equippedCount < maxCarried;

    root.innerHTML = `
        <div class="card">
            <h2>Sprzęt — Katalog</h2>
            <p class="cap-indicator ${equippedCount >= maxCarried ? "full" : ""}">Założone: ${equippedCount} / ${maxCarried}</p>
            <p class="placeholder">Najedź na kartę, żeby zobaczyć efekt. "Kupione" oznacza posiadanie w ekwipunku; "Założone" liczy się do limitu noszonego sprzętu i odsłania licznik Wear.${backpackEquipped ? " Explorer's Backpack podnosi limit o 2 i sam nie zajmuje slotu." : ""}</p>
        </div>
        ${Array.from(groups.entries()).map(([label, items]) => `
            <div class="card catalog-group" style="margin-top:12px;">
                <h4>${escapeHtml(label)}</h4>
                <div class="catalog-grid">
                    ${items.map(item => renderCard(item, gearState[item.slug] || {}, canEquipMore, wearPerItem)).join("")}
                </div>
            </div>
        `).join("")}
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (!action) return;
        const state = getState();
        const data = getData();
        const wearPerItem = data.mechanics?.resources?.gear?.wear_per_item ?? 3;
        const slug = el.dataset.slug;
        const gear = state.character.gear;

        if (action === "toggle-gear-owned") {
            if (el.checked) {
                if (!gear[slug]) gear[slug] = { owned: true, equipped: false, wear: wearPerItem };
                else gear[slug].owned = true;
            } else {
                if (gear[slug]?.equipped && !window.confirm("Ten przedmiot jest założony — na pewno oznaczyć jako niekupiony? (zostanie zdjęty)")) {
                    el.checked = true;
                    return;
                }
                delete gear[slug];
            }
            touch();
        } else if (action === "toggle-gear-equipped") {
            if (!gear[slug]) return;
            gear[slug].equipped = el.checked;
            if (el.checked && gear[slug].wear === undefined) gear[slug].wear = wearPerItem;
            touch();
        }
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action='adjust-gear-wear']");
        if (!btn) return;
        const state = getState();
        const data = getData();
        const wearPerItem = data.mechanics?.resources?.gear?.wear_per_item ?? 3;
        const slug = btn.dataset.slug;
        const delta = parseInt(btn.dataset.delta, 10);
        const item = state.character.gear[slug];
        if (!item) return;
        item.wear = Math.max(0, Math.min(wearPerItem, (item.wear ?? wearPerItem) + delta));
        touch();
    });
}
