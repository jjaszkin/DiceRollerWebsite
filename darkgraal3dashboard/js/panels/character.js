// Dark Graal III - Dashboard Solo (MG). Panel "Postać" - pełna karta jednej postaci: Archetypy
// (baza/kości ran/modyfikatory/wartość efektywna), Rozpacz, Błogosławieństwo Merlina, Rany,
// Ekwipunek (zwykły + Legendarne przedmioty z bogatym opisem), Cechy Przemiany i Moce.
//
// MG widzi selektor postaci (może przeglądać każdą z 4 kart), Gracz widzi wyłącznie swoją -
// klucz aktywnej postaci przychodzi z ctx.session (patrz main.js), a dla MG dodatkowo trzymany
// jest lokalny (nie zapisywany do Firebase) wybór w `ui.selectedCharacterKey`.

import { updateState } from "../store.js";
import { archetypeCurrent, despairMax } from "../state.js";
import { logEvent } from "../eventLog.js";
import { escapeHtml, clamp, preserveScroll } from "../utils.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

const ui = {
    selectedCharacterKey: null, // tylko dla MG - patrz resolveActiveKey()
    openItemKey: null           // klucz Legendarnego przedmiotu aktualnie pokazanego w modalu, albo null
};

function resolveActiveKey(state, session) {
    if (session.role === "player") return session.characterKey;
    // MG: domyślnie pierwsza postać w kolejności z danych, chyba że coś już wybrano.
    if (ui.selectedCharacterKey && state.characters[ui.selectedCharacterKey]) return ui.selectedCharacterKey;
    const keys = Object.keys(state.characters);
    ui.selectedCharacterKey = keys[0] || null;
    return ui.selectedCharacterKey;
}

function archetypeLabel(data, key) {
    return data.archetypes.find(a => a.key === key)?.label || key;
}

function archetypeFlavor(data, key) {
    return data.archetypes.find(a => a.key === key)?.flavor || "";
}

function renderArchetypeRow(data, key, archetype) {
    const current = archetypeCurrent(archetype);
    const activeMods = (archetype.modifiers || []).filter(m => m.active);
    const modsHtml = (archetype.modifiers || []).map(m => `
        <span class="mod-chip ${m.active ? "mod-active" : "mod-inactive"}" title="${escapeHtml(m.tooltip || "")}">
            ${escapeHtml(m.label)} (${m.delta >= 0 ? "+" : ""}${m.delta})
        </span>
    `).join("");
    return `
        <div class="archetype-row">
            <div class="archetype-row-head">
                <span class="archetype-name">${escapeHtml(archetypeLabel(data, key))}</span>
                <span class="archetype-value">${current}</span>
                <span class="archetype-base">(baza ${archetype.base}${archetype.woundDice ? `, -${archetype.woundDice} rany` : ""})</span>
            </div>
            <div class="archetype-flavor">${escapeHtml(archetypeFlavor(data, key))}</div>
            ${modsHtml ? `<div class="archetype-mods">${modsHtml}</div>` : ""}
        </div>
    `;
}

function renderEquipment(character, data) {
    const legendarySet = new Set(character.legendaryItemKeys || []);
    const legendaryHtml = character.legendaryItemKeys.map(key => {
        const item = data.items[key];
        if (!item) return "";
        return `<button class="item-chip legendary" data-action="open-item" data-key="${key}">${escapeHtml(item.name)}</button>`;
    }).join("");
    const plainHtml = (character.equipment || []).map(e => `<span class="item-chip">${escapeHtml(e)}</span>`).join("");
    return `
        <div class="equipment-block">
            ${legendaryHtml ? `<div class="equipment-legendary">${legendaryHtml}</div>` : ""}
            <div class="equipment-plain">${plainHtml || `<span class="placeholder">Brak ekwipunku.</span>`}</div>
        </div>
    `;
}

function renderItemModal(data) {
    const item = ui.openItemKey ? data.items[ui.openItemKey] : null;
    if (!item) return "";
    const sections = (item.richDescription || []).map(s => `
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.text)}</p>
    `).join("");
    return `
        <div class="modal-backdrop" data-action="close-item">
            <div class="modal" data-action-stop="1">
                <h2>${escapeHtml(item.name)}</h2>
                <p class="item-tooltip">${escapeHtml(item.shortTooltip || "")}</p>
                ${sections}
                <button class="btn btn-sm" data-action="close-item">Zamknij</button>
            </div>
        </div>
    `;
}

function powerUsageNote(power) {
    const usage = power.effect?.usage;
    if (usage === "session") return "raz na sesję";
    if (usage === "scene") return "raz na scenę";
    if (usage === "combat") return "raz na walkę";
    if (usage === "passive") return "pasywna";
    return "narracyjna";
}

function renderPowers(character, transformation) {
    if (!transformation) return "";
    const traitsHtml = (transformation.traits || []).map(t => `<li>${escapeHtml(t)}</li>`).join("");
    const powersHtml = (transformation.powers || []).map(p => {
        const used = !!character.usedPowers?.[p.id];
        return `
            <div class="power-card ${used ? "power-used" : ""}">
                <div class="power-head">
                    <strong>${escapeHtml(p.name)}</strong>
                    <span class="power-usage">${powerUsageNote(p)}</span>
                </div>
                <p>${escapeHtml(p.description)}</p>
                ${p.effect?.secondaryEffectText ? `<p class="placeholder">${escapeHtml(p.effect.secondaryEffectText)}</p>` : ""}
                ${power_toggle_button(p, used)}
            </div>
        `;
    }).join("");
    return `
        <div class="transformation-block">
            <h3>Cechy Przemiany (${escapeHtml(transformation.type)})</h3>
            <ul class="traits-list">${traitsHtml}</ul>
            <h3>Moce</h3>
            <div class="powers-list">${powersHtml}</div>
        </div>
    `;
}

function power_toggle_button(power, used) {
    if (power.effect?.type === "narrative" || power.effect?.usage === "passive" || power.effect?.usage === "narrative") {
        return "";
    }
    return `<button class="btn btn-xs" data-action="toggle-power-used" data-power-id="${power.id}">
        ${used ? "Oznacz jako dostępną" : "Oznacz jako użytą"}
    </button>`;
}

function buildHtml(ctx) {
    const { state, data, session } = ctx;
    const activeKey = resolveActiveKey(state, session);
    const character = activeKey ? state.characters[activeKey] : null;
    if (!character) return `<p class="placeholder">Brak wybranej postaci.</p>`;

    const transformation = data.transformations[activeKey];
    const dMax = despairMax(character);

    const selectorHtml = session.role === "mg" ? `
        <select id="characterPicker" class="char-picker">
            ${Object.values(state.characters).map(c => `
                <option value="${c.key}" ${c.key === activeKey ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.aliasName)})</option>
            `).join("")}
        </select>
    ` : "";

    return `
        ${selectorHtml}
        <div class="character-sheet">
            <header class="character-sheet-head">
                <h2>${escapeHtml(character.name)}${character.epithet ? " " + escapeHtml(character.epithet) : ""}</h2>
                <p class="character-sub">„${escapeHtml(character.aliasName)}” - ${escapeHtml(character.type)}</p>
            </header>

            <div class="stat-row">
                <div class="stat-box">
                    <label>Rozpacz</label>
                    <div class="stat-controls">
                        <button class="btn btn-xs" data-action="despair-dec">−</button>
                        <span>${character.despair.current} / ${dMax}</span>
                        <button class="btn btn-xs" data-action="despair-inc">+</button>
                    </div>
                </div>
                <div class="stat-box">
                    <label>Błogosławieństwo Merlina</label>
                    <button class="btn btn-sm ${character.blessing ? "btn-gold" : ""}" data-action="toggle-blessing">
                        ${character.blessing ? "Aktywne" : "Nieaktywne"}
                    </button>
                </div>
                <div class="stat-box">
                    <label>Rany</label>
                    <div class="stat-controls">
                        <button class="btn btn-xs" data-action="wounds-dec">−</button>
                        <span>${character.wounds.count}</span>
                        <button class="btn btn-xs" data-action="wounds-inc">+</button>
                    </div>
                    <label class="inline-check">
                        <input type="checkbox" data-action="toggle-deadly" ${character.wounds.deadly ? "checked" : ""}>
                        Rana śmiertelna
                    </label>
                </div>
            </div>

            <h3>Archetypy</h3>
            <div class="archetype-list">
                ${ARCHETYPE_ORDER.map(key => renderArchetypeRow(data, key, character.archetypes[key])).join("")}
            </div>

            <h3>Ekwipunek</h3>
            ${renderEquipment(character, data)}

            ${renderPowers(character, transformation)}
        </div>
        ${renderItemModal(data)}
    `;
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        if (e.target.id === "characterPicker") {
            ui.selectedCharacterKey = e.target.value;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
        }
        if (e.target.dataset.action === "toggle-deadly") {
            withActiveCharacter(root, (character, state) => {
                character.wounds.deadly = e.target.checked;
                logEvent(state, "wound-change", `${character.name}: rana śmiertelna ${e.target.checked ? "ustawiona" : "zdjęta"}.`);
            });
        }
    });

    root.addEventListener("click", (e) => {
        const backdrop = e.target.closest('[data-action="close-item"]');
        if (backdrop && !e.target.closest('[data-action-stop]')) {
            ui.openItemKey = null;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
            return;
        }

        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "open-item") {
            ui.openItemKey = btn.dataset.key;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
            return;
        }

        if (action === "despair-inc" || action === "despair-dec") {
            withActiveCharacter(root, (character, state) => {
                const dMax = despairMax(character);
                const before = character.despair.current;
                character.despair.current = clamp(before + (action === "despair-inc" ? 1 : -1), 0, dMax);
                if (character.despair.current !== before) {
                    logEvent(state, "despair-change", `${character.name}: Rozpacz ${before} → ${character.despair.current}.`);
                }
            });
        }

        if (action === "wounds-inc" || action === "wounds-dec") {
            withActiveCharacter(root, (character, state) => {
                const before = character.wounds.count;
                character.wounds.count = Math.max(0, before + (action === "wounds-inc" ? 1 : -1));
                if (character.wounds.count !== before) {
                    logEvent(state, "wound-change", `${character.name}: Rany ${before} → ${character.wounds.count}.`);
                }
            });
        }

        if (action === "toggle-blessing") {
            withActiveCharacter(root, (character, state) => {
                character.blessing = !character.blessing;
                logEvent(state, "blessing-change", `${character.name}: Błogosławieństwo Merlina ${character.blessing ? "aktywowane" : "utracone"}.`);
            });
        }

        if (action === "toggle-power-used") {
            withActiveCharacter(root, (character, state) => {
                const id = btn.dataset.powerId;
                const wasUsed = !!character.usedPowers[id];
                if (wasUsed) delete character.usedPowers[id];
                else character.usedPowers[id] = true;
                logEvent(state, "power-used", `${character.name}: moc „${id}” oznaczona jako ${wasUsed ? "dostępna" : "użyta"}.`);
            });
        }
    });
}

function withActiveCharacter(root, fn) {
    const { state, session } = root._ctx;
    const key = resolveActiveKey(state, session);
    const character = state.characters[key];
    if (!character) return;
    updateState((s) => fn(s.characters[key], s));
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
