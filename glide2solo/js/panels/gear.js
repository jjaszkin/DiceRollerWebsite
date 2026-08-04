// Panel: Sprzęt — katalog kart Podstawowy/Zaawansowany Sprzęt. Każda karta ma efekt jako
// tooltip na hover, checkbox "Kupione" oraz "Założone" (do limitu mechanics.resources.gear.max_carried),
// a założony przedmiot dostaje licznik Zużycie (max = mechanics.resources.gear.wear_per_item).
import { getState, getData, touch } from "../store.js";
import { escapeHtml } from "../utils.js";
import { flattenGear, humanizeCategory, gearCapacity, EXPLORERS_BACKPACK_SLUG, applyKnownStatBonus } from "../gearData.js";
import { unlockedGuildItemRewards } from "../rewardsData.js";
import { logEvent } from "../eventLog.js";

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
    // Plecak Odkrywcy sam nie zajmuje slotu (patrz jego efekt) — zawsze można go założyć,
    // niezależnie od tego, czy limit Sprzęt jest już wyczerpany.
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
                    <div class="counter-label">Zużycie</div>
                    <div class="counter-controls">
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="-1">−</button>
                        <span class="counter-value ${wear === 0 ? "max" : ""}">${wear} <span class="max">/ ${wearPerItem}</span></span>
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="1">+</button>
                    </div>
                </div>
                ${wear === 0 ? `<p class="placeholder" style="margin:0;">NIEUŻYWALNY (0 Zużycie)</p>` : ""}
            ` : ""}
        </div>
    `;
}

/** Karta dla nagrody Poziom Więzi gildii kategorii "Sprzęt" — zawsze posiadana (checkbox "Kupione"
 *  jest tu tylko informacyjny, stale zaznaczony i zablokowany), ale Założone/Zużycie działają
 *  normalnie i normalnie liczą się do limitu noszonego Sprzęt (bez wyjątku jak Plecak Odkrywcy). */
function renderRewardCard(item, itemState, canEquipMore, wearPerItem) {
    const equipped = !!itemState.equipped;
    const disabledEquip = !equipped && !canEquipMore;
    const wear = itemState.wear ?? wearPerItem;
    return `
        <div class="item-card tt owned ${equipped ? "equipped" : ""}" data-tip="${escapeHtml(item.effect || "")}">
            <div class="item-card-head">
                <span class="item-card-name">${escapeHtml(item.name)}</span>
                <span class="item-card-cost">${escapeHtml(item.badge)}</span>
            </div>
            <div class="item-card-toggles">
                <label class="disabled">
                    <input type="checkbox" checked disabled>
                    <span>Nagroda gildii</span>
                </label>
                <label class="${disabledEquip ? "disabled" : ""}">
                    <input type="checkbox" data-action="toggle-gear-equipped" data-slug="${item.slug}" ${equipped ? "checked" : ""} ${disabledEquip ? "disabled" : ""}>
                    <span>Założone</span>
                </label>
            </div>
            ${equipped ? `
                <div class="counter-row" style="border:none; padding:2px 0 0;">
                    <div class="counter-label">Zużycie</div>
                    <div class="counter-controls">
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="-1">−</button>
                        <span class="counter-value ${wear === 0 ? "max" : ""}">${wear} <span class="max">/ ${wearPerItem}</span></span>
                        <button class="btn btn-sm btn-icon" data-action="adjust-gear-wear" data-slug="${item.slug}" data-delta="1">+</button>
                    </div>
                </div>
                ${wear === 0 ? `<p class="placeholder" style="margin:0;">NIEUŻYWALNY (0 Zużycie)</p>` : ""}
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
    const { maxCarried, equippedCount, backpackEquipped, exoskeletonEquipped } = gearCapacity(state, baseMaxCarried);
    const groups = groupByCategory(flat);
    const canEquipMore = equippedCount < maxCarried;
    const guildGearRewards = unlockedGuildItemRewards(state, data, "Sprzęt");

    root.innerHTML = `
        <div class="card">
            <h2>Sprzęt — Katalog</h2>
            <p class="cap-indicator ${equippedCount >= maxCarried ? "full" : ""}">Założone: ${equippedCount} / ${maxCarried}</p>
            <p class="placeholder">Najedź na kartę, żeby zobaczyć efekt. "Kupione" oznacza posiadanie w ekwipunku; "Założone" liczy się do limitu noszonego sprzętu i odsłania licznik Zużycie.${backpackEquipped ? " Plecak Odkrywcy podnosi limit o 2 i sam nie zajmuje slotu." : ""}${exoskeletonEquipped ? " Egzoszkielet podnosi limit o 1 (i sam zajmuje slot)." : ""}</p>
        </div>
        ${Array.from(groups.entries()).map(([label, items]) => `
            <div class="card catalog-group" style="margin-top:12px;">
                <h4>${escapeHtml(label)}</h4>
                <div class="catalog-grid">
                    ${items.map(item => renderCard(item, gearState[item.slug] || {}, canEquipMore, wearPerItem)).join("")}
                </div>
            </div>
        `).join("")}
        ${guildGearRewards.length ? `
            <div class="card catalog-group" style="margin-top:12px;">
                <h4>Nagrody Gildii (Sprzęt)</h4>
                <p class="placeholder">Odblokowane przez Poziom Więzi — posiadane automatycznie, można je normalnie założyć/zdjąć.</p>
                <div class="catalog-grid">
                    ${guildGearRewards.map(r => renderRewardCard(
                        { slug: r.slug, name: r.baseName, effect: r.effect, badge: `${r.guildName} · Lv${r.tier}` },
                        gearState[r.slug] || {}, canEquipMore, wearPerItem
                    )).join("")}
                </div>
            </div>
        ` : ""}
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
                const item = flattenGear(data.gear).find(g => g.slug === slug);
                logEvent(state, "item-gained", `Zdobyto sprzęt: "${item?.name ?? slug}".`);
            } else {
                if (gear[slug]?.equipped && !window.confirm("Ten przedmiot jest założony — na pewno oznaczyć jako niekupiony? (zostanie zdjęty)")) {
                    el.checked = true;
                    return;
                }
                // Jeśli przedmiot dawał trwały bonus do statystyki (patrz KNOWN_STAT_BONUS_ITEMS)
                // i był założony, cofnij bonus PRZED usunięciem wpisu — inaczej "Kupione" odznaczone
                // na założonym przedmiocie ominęłoby toggle-gear-equipped i bonus zostałby na stałe.
                if (gear[slug]?.equipped) applyKnownStatBonus(state, slug, -1);
                delete gear[slug];
            }
            touch();
        } else if (action === "toggle-gear-equipped") {
            // Auto-vivify: nagrody gildii (Sprzęt) nie mają wpisu w gear[] dopóki gracz sam
            // czegoś tu nie przełączy — nie są "kupowane" ręcznie, tylko odblokowywane
            // przez Poziom Więzi (patrz renderRewardCard/unlockedGuildItemRewards).
            if (!gear[slug]) gear[slug] = { owned: true, equipped: false, wear: wearPerItem };
            gear[slug].equipped = el.checked;
            if (el.checked && gear[slug].wear === undefined) gear[slug].wear = wearPerItem;
            // Trwałe bonusy do statystyk (Szyfrowana Księga, Soczewki Termiczne, Egzoszkielet —
            // patrz gearData.js#KNOWN_STAT_BONUS_ITEMS) są "equipped"-triggered: aktywne tylko,
            // gdy przedmiot jest założony, tak jak reszta efektów Sprzęt.
            applyKnownStatBonus(state, slug, el.checked ? +1 : -1);
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
