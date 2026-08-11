// Dark Graal III - Dashboard Solo (MG). Panel "Postać" - pełna karta jednej postaci, w układzie 3
// kolumn: (1) portret + Wiatr Camelotu (wyróżniony odczyt), (2) Rozpacz/Błogosławieństwo/Archetypy/
// Ekwipunek, (3) Cechy Przemiany i Moce. "Rany" nie mają tu już własnej sekcji - MG reprezentuje ich
// skutki wyłącznie przez pole "Kości ran" każdego Archetypu (panel MG), patrz też uwaga w state.js.
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
    const isZero = current === 0;
    const activeMods = (archetype.modifiers || []).filter(m => m.active);
    const modsHtml = (archetype.modifiers || []).map(m => `
        <span class="mod-chip ${m.active ? "mod-active" : "mod-inactive"}" title="${escapeHtml(m.tooltip || "")}">
            ${escapeHtml(m.label)} (${m.delta >= 0 ? "+" : ""}${m.delta})
        </span>
    `).join("");
    const flavor = archetypeFlavor(data, key);
    return `
        <div class="archetype-row ${isZero ? "archetype-zero" : ""}">
            <div class="archetype-row-head" title="${escapeHtml(flavor)}">
                <span class="archetype-name">${escapeHtml(archetypeLabel(data, key))}</span>
                <span class="archetype-value">${current}<span class="archetype-value-max">/${archetype.base}</span></span>
                ${isZero ? `<span class="archetype-skull" title="Archetyp wyczerpany">💀</span>` : ""}
                ${archetype.woundDice ? `<span class="archetype-base">(-${archetype.woundDice} rany)</span>` : ""}
            </div>
            <div class="archetype-flavor">${escapeHtml(flavor)}</div>
            ${activeMods.length || (archetype.modifiers || []).length ? `<div class="archetype-mods">${modsHtml}</div>` : ""}
        </div>
    `;
}

function renderEquipment(character, data) {
    const disabledLegendary = new Set(character.disabledItemKeys || []);
    const legendaryHtml = (character.legendaryItemKeys || []).map(key => {
        const item = data.items[key];
        if (!item) return "";
        const disabled = disabledLegendary.has(key);
        return `
            <button class="item-chip legendary ${disabled ? "item-disabled" : ""}" data-action="open-item" data-key="${key}"
                title="${escapeHtml(item.shortTooltip || "")}">
                ${escapeHtml(item.name)}${disabled ? " (wygaszony)" : ""}
            </button>
        `;
    }).join("");
    const plainHtml = (character.equipment || []).map(e => {
        const titleAttr = e.tooltip ? ` title="${escapeHtml(e.tooltip)}"` : "";
        if (e.disabled) {
            return `<span class="item-chip item-disabled"${titleAttr}>${escapeHtml(e.name)} (wygaszony)</span>`;
        }
        return `<button class="item-chip" data-action="use-equipment" data-item-id="${e.id}"${titleAttr}>${escapeHtml(e.name)}</button>`;
    }).join("");
    return `
        <div class="equipment-block">
            ${legendaryHtml ? `<div class="equipment-legendary">${legendaryHtml}</div>` : ""}
            <div class="equipment-plain">${plainHtml || `<span class="placeholder">Brak ekwipunku.</span>`}</div>
        </div>
    `;
}

function renderUsableButton(itemKey, section, character, itemDisabled) {
    const usable = section.usable;
    if (!usable) return "";
    const label = usable.buttonLabel || `Użyj mocy: ${section.title}`;
    if (usable.usage === "session") {
        const used = !!character.usedPowers?.[usable.id];
        return `
            <button class="btn btn-xs" data-action="use-item-power" data-item-key="${itemKey}"
                data-power-id="${usable.id}" data-power-title="${escapeHtml(section.title)}" data-tracked="1"
                ${(used || itemDisabled) ? "disabled" : ""}>
                ${used ? "Moc już użyta (raz na sesję)" : escapeHtml(label)}
            </button>
        `;
    }
    return `
        <button class="btn btn-xs" data-action="use-item-power" data-item-key="${itemKey}"
            data-power-id="${usable.id}" data-power-title="${escapeHtml(section.title)}" data-tracked="0"
            data-cost="${escapeHtml(usable.costText || "")}" ${itemDisabled ? "disabled" : ""}>
            ${escapeHtml(label)}
        </button>
        ${usable.costText ? `<p class="placeholder">${escapeHtml(usable.costText)}</p>` : ""}
    `;
}

function renderItemModal(data, character) {
    const itemKey = ui.openItemKey;
    const item = itemKey ? data.items[itemKey] : null;
    if (!item || !character) return "";
    const disabled = (character.disabledItemKeys || []).includes(itemKey);
    const sections = (item.richDescription || []).map(s => `
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.text)}</p>
        ${renderUsableButton(itemKey, s, character, disabled)}
    `).join("");
    return `
        <div class="modal-backdrop" data-action="close-item">
            <div class="modal">
                <h2>${escapeHtml(item.name)}</h2>
                ${disabled ? `<p class="item-disabled-note">Ten przedmiot jest obecnie wygaszony przez MG.</p>` : ""}
                <p class="item-tooltip">${escapeHtml(item.shortTooltip || "")}</p>
                ${sections}
                <div class="modal-actions">
                    <button class="btn btn-sm btn-gold" data-action="use-item" data-item-key="${itemKey}" ${disabled ? "disabled" : ""}>Użyj przedmiotu</button>
                    <button class="btn btn-sm" data-action="close-item">Zamknij</button>
                </div>
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

function portraitUrl(character) {
    return `images/${encodeURIComponent(character.name)}.png`;
}

function buildHtml(ctx) {
    const { state, data, session } = ctx;
    const activeKey = resolveActiveKey(state, session);
    const character = activeKey ? state.characters[activeKey] : null;
    if (!character) return `<p class="placeholder">Brak wybranej postaci.</p>`;

    const transformation = data.transformations[activeKey];
    const dMax = despairMax(character);
    const campWind = state.campWind || { current: 0, scale: 10 };

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
                <h2 class="character-name-big">${escapeHtml(character.name)}${character.epithet ? " " + escapeHtml(character.epithet) : ""}</h2>
                <p class="character-player">Gracz: ${escapeHtml(character.aliasName)}</p>
            </header>

            <div class="character-sheet-grid">
                <div class="character-col character-col-portrait">
                    <img class="character-portrait" src="${portraitUrl(character)}" alt="${escapeHtml(character.name)}"
                        onerror="this.style.display='none'">
                    <div class="camp-wind-box">
                        <label>Wiatr Camelotu</label>
                        <div class="camp-wind-value">${campWind.current} <span class="camp-wind-scale">/ ${campWind.scale}</span></div>
                    </div>
                </div>

                <div class="character-col character-col-stats">
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
                    </div>

                    <h3>Archetypy</h3>
                    <div class="archetype-list">
                        ${ARCHETYPE_ORDER.map(key => renderArchetypeRow(data, key, character.archetypes[key])).join("")}
                    </div>

                    <h3>Ekwipunek</h3>
                    ${renderEquipment(character, data)}
                </div>

                <div class="character-col character-col-powers">
                    ${renderPowers(character, transformation)}
                </div>
            </div>
        </div>
        ${renderItemModal(data, character)}
    `;
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        if (e.target.id === "characterPicker") {
            ui.selectedCharacterKey = e.target.value;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
        }
    });

    root.addEventListener("click", (e) => {
        // Kliknięcie DOKŁADNIE w tło modala (nie w jego zawartość) zamyka go - patrz niżej też
        // jawna obsługa przycisku "Zamknij" (poprzednia wersja błędnie łapała też kliknięcie w
        // sam przycisk przez zagnieżdżony data-action-stop guard, przez co "Zamknij" nie działał).
        if (e.target.classList.contains("modal-backdrop")) {
            ui.openItemKey = null;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
            return;
        }

        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "close-item") {
            ui.openItemKey = null;
            preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
            return;
        }

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

        if (action === "use-equipment") {
            const itemId = btn.dataset.itemId;
            withActiveCharacter(root, (character, state) => {
                const item = (character.equipment || []).find(e => e.id === itemId);
                if (!item || item.disabled) return;
                logEvent(state, "equipment-used", `${character.name} użył ${item.name}.`);
            });
        }

        if (action === "use-item") {
            const itemKey = btn.dataset.itemKey;
            const { data } = root._ctx;
            const item = data.items[itemKey];
            if (!item) return;
            withActiveCharacter(root, (character, state) => {
                if ((character.disabledItemKeys || []).includes(itemKey)) return;
                logEvent(state, "equipment-used", `${character.name} użył ${item.name}.`);
            });
        }

        if (action === "use-item-power") {
            const itemKey = btn.dataset.itemKey;
            const powerId = btn.dataset.powerId;
            const powerTitle = btn.dataset.powerTitle;
            const tracked = btn.dataset.tracked === "1";
            const cost = btn.dataset.cost;
            const { data } = root._ctx;
            const item = data.items[itemKey];
            if (!item) return;
            withActiveCharacter(root, (character, state) => {
                if ((character.disabledItemKeys || []).includes(itemKey)) return;
                if (tracked) {
                    if (character.usedPowers[powerId]) return;
                    character.usedPowers[powerId] = true;
                }
                logEvent(state, "item-power-used", `${character.name} użył mocy „${powerTitle}” (${item.name}).${cost ? " " + cost : ""}`);
            });
        }
    });
}

function withActiveCharacter(root, fn) {
    const { state, session } = root._ctx;
    const key = resolveActiveKey(state, session);
    const character = state.characters[key];
    if (!character) return;
    // Nie renderujemy tu ręcznie - updateState() woła touch() -> notify(), a main.js#renderAll()
    // jest zasubskrybowany i sam odświeży ten panel (tak jak w oryginalnej wersji tego pliku).
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
